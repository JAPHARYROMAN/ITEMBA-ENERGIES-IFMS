import { InternalServerErrorException, Logger } from '@nestjs/common';
import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { and, asc, eq, isNull, lte, or } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../../database/database.module';
import type * as schema from '../../database/schema';
import {
  expenseEntries,
  shifts,
  meterReadings,
  shiftCollections,
  salesTransactions,
  adjustments,
  tanks,
  stockLedger,
  STOCK_LEDGER_MOVEMENT_ADJUSTMENT,
  approvalPolicies,
  approvalRequests,
  approvalSteps,
  approvalsAudit,
  roles,
  userRoles,
  type ApprovalPolicyStep,
} from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { NotificationTriggersService } from '../notifications/notification-triggers.service';
import type {
  ActionReasonDto,
  CreateApprovalDto,
  CreatePolicyDto,
  ListApprovalsDto,
  ListPoliciesDto,
  UpdatePolicyDto,
} from './dto';
import { PolicyEvaluatorService, type EvaluatePolicyInput } from './policy-evaluator.service';

type Schema = typeof schema;

export interface GovernanceActor {
  userId: string;
  permissions: string[];
  roles?: string[];
}

export interface GovernanceAuditContext {
  ip?: string;
  userAgent?: string;
}

export function violatesMakerChecker(
  decision: 'approve' | 'reject',
  requestedBy: string,
  actorUserId: string,
  allowSelfApproval?: boolean,
): boolean {
  return decision === 'approve' && !allowSelfApproval && requestedBy === actorUserId;
}

@Injectable()
export class GovernanceService {
  private readonly logger = new Logger(GovernanceService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<Schema>,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly evaluator: PolicyEvaluatorService,
    private readonly notificationTriggers: NotificationTriggersService,
  ) {}

  isEnabled(): boolean {
    return this.config.get<boolean>('GOVERNANCE_ENABLED', false);
  }

  /**
   * Hourly cron job that auto-rejects approval requests that have exceeded
   * the configurable deadline (GOVERNANCE_APPROVAL_DEADLINE_HOURS, default 48h).
   * Uses `requestedAt + deadlineHours` as the expiry cutoff.
   */
  @Cron('0 0 * * * *', {
    name: 'governance-expired-approvals',
    timeZone: 'UTC',
  })
  async checkExpiredApprovals(): Promise<void> {
    if (!this.isEnabled()) return;

    const deadlineHours = this.config.get<number>('GOVERNANCE_APPROVAL_DEADLINE_HOURS', 48);
    const cutoff = new Date(Date.now() - deadlineHours * 3600_000);

    this.logger.log(`Checking for expired approval requests (deadline: ${deadlineHours}h, cutoff: ${cutoff.toISOString()})`);

    try {
      const expiredRequests = await this.db
        .select()
        .from(approvalRequests)
        .where(
          and(
            eq(approvalRequests.status, 'submitted'),
            lte(approvalRequests.requestedAt, cutoff),
            isNull(approvalRequests.deletedAt),
          ),
        );

      if (expiredRequests.length === 0) {
        this.logger.log('No expired approval requests found');
        return;
      }

      this.logger.log(`Found ${expiredRequests.length} expired approval request(s)`);

      for (const request of expiredRequests) {
        try {
          await this.rejectExpiredRequest(request, deadlineHours);
        } catch (error) {
          this.logger.error(`Failed to auto-reject expired approval request ${request.id}:`, error);
        }
      }

      this.logger.log(`Expired approvals check complete — processed ${expiredRequests.length} request(s)`);
    } catch (error) {
      this.logger.error('Error during expired approvals check:', error);
    }
  }

  private async rejectExpiredRequest(
    request: typeof approvalRequests.$inferSelect,
    deadlineHours: number,
  ): Promise<void> {
    const reason = `Auto-rejected: approval deadline of ${deadlineHours} hours exceeded`;
    const now = new Date();

    await this.db.transaction(async (tx) => {
      await tx
        .update(approvalRequests)
        .set({ status: 'rejected', updatedAt: now, updatedBy: request.requestedBy })
        .where(eq(approvalRequests.id, request.id));

      await tx
        .update(approvalSteps)
        .set({ status: 'skipped', updatedAt: now, updatedBy: request.requestedBy })
        .where(and(eq(approvalSteps.approvalRequestId, request.id), eq(approvalSteps.status, 'pending')));

      await tx.insert(approvalsAudit).values({
        approvalRequestId: request.id,
        eventType: 'deadline_expired',
        actorUserId: request.requestedBy,
        payloadJson: { reason, deadlineHours },
      });
    });

    await this.audit.log({
      entity: 'governance_approval_requests',
      entityId: request.id,
      action: 'deadline_auto_reject',
      after: { status: 'rejected', reason } as object,
      userId: request.requestedBy,
    });

    // Notify the requester about the expiry
    try {
      await this.notificationTriggers.notifyApprovalRejected(request.id, {
        companyId: request.companyId,
        branchId: request.branchId,
        title: `${request.entityType} ${request.actionType}`,
        entityType: request.entityType,
        entityId: request.entityId,
        requesterId: request.requestedBy,
        rejectedBy: request.requestedBy,
        rejectionReason: reason,
      });
    } catch (error) {
      this.logger.error(`Failed to send deadline expiry notification for request ${request.id}:`, error);
    }

    // Apply rejection side-effects (same as manual rejection)
    try {
      const actor: GovernanceActor = { userId: request.requestedBy, permissions: [] };
      await this.applyDecisionEffects(this.db, request, 'rejected', actor, reason);
    } catch (error) {
      this.logger.error(`Failed to apply rejection effects for expired request ${request.id}:`, error);
    }
  }

  async listPolicies(filters: ListPoliciesDto) {
    const conditions = [isNull(approvalPolicies.deletedAt), eq(approvalPolicies.isEnabled, true)];
    if (filters.companyId) conditions.push(eq(approvalPolicies.companyId, filters.companyId));
    if (filters.branchId) conditions.push(eq(approvalPolicies.branchId, filters.branchId));
    if (filters.entityType) conditions.push(eq(approvalPolicies.entityType, filters.entityType));
    if (filters.actionType) conditions.push(eq(approvalPolicies.actionType, filters.actionType));

    return this.db
      .select()
      .from(approvalPolicies)
      .where(and(...conditions))
      .orderBy(asc(approvalPolicies.entityType), asc(approvalPolicies.actionType), asc(approvalPolicies.branchId));
  }

  async createPolicy(dto: CreatePolicyDto, actor: GovernanceActor, ctx: GovernanceAuditContext) {
    const [inserted] = await this.db
      .insert(approvalPolicies)
      .values({
        companyId: dto.companyId,
        branchId: dto.branchId ?? null,
        entityType: dto.entityType,
        actionType: dto.actionType,
        thresholdAmount: dto.thresholdAmount != null ? String(dto.thresholdAmount) : null,
        thresholdPct: dto.thresholdPct != null ? String(dto.thresholdPct) : null,
        approvalStepsJson: [...dto.approvalSteps].sort((a, b) => a.stepOrder - b.stepOrder),
        isEnabled: dto.isEnabled ?? true,
        createdBy: actor.userId,
        updatedBy: actor.userId,
      })
      .returning();
    if (!inserted) throw new InternalServerErrorException('Failed to create policy');

    await this.audit.log({
      entity: 'governance_policies',
      entityId: inserted.id,
      action: 'create',
      after: inserted as object,
      userId: actor.userId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return inserted;
  }

  async updatePolicy(id: string, dto: UpdatePolicyDto, actor: GovernanceActor, ctx: GovernanceAuditContext) {
    const [before] = await this.db
      .select()
      .from(approvalPolicies)
      .where(and(eq(approvalPolicies.id, id), isNull(approvalPolicies.deletedAt)));
    if (!before) throw new NotFoundException('Policy not found');

    const [updated] = await this.db
      .update(approvalPolicies)
      .set({
        ...(dto.companyId !== undefined ? { companyId: dto.companyId } : {}),
        ...(dto.branchId !== undefined ? { branchId: dto.branchId ?? null } : {}),
        ...(dto.entityType !== undefined ? { entityType: dto.entityType } : {}),
        ...(dto.actionType !== undefined ? { actionType: dto.actionType } : {}),
        ...(dto.thresholdAmount !== undefined ? { thresholdAmount: dto.thresholdAmount != null ? String(dto.thresholdAmount) : null } : {}),
        ...(dto.thresholdPct !== undefined ? { thresholdPct: dto.thresholdPct != null ? String(dto.thresholdPct) : null } : {}),
        ...(dto.approvalSteps !== undefined
          ? { approvalStepsJson: [...dto.approvalSteps].sort((a, b) => a.stepOrder - b.stepOrder) }
          : {}),
        ...(dto.isEnabled !== undefined ? { isEnabled: dto.isEnabled } : {}),
        updatedAt: new Date(),
        updatedBy: actor.userId,
      })
      .where(eq(approvalPolicies.id, id))
      .returning();
    if (!updated) throw new InternalServerErrorException('Failed to update policy');

    await this.audit.log({
      entity: 'governance_policies',
      entityId: id,
      action: 'update',
      before: before as object,
      after: updated as object,
      userId: actor.userId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return updated;
  }

  async listApprovals(filters: ListApprovalsDto, actor: GovernanceActor) {
    const roleCodes = await this.getUserRoleCodes(actor.userId);
    const canSeeAll = roleCodes.includes('manager') || roleCodes.includes('auditor');
    const conditions = [isNull(approvalRequests.deletedAt)];
    if (filters.companyId) conditions.push(eq(approvalRequests.companyId, filters.companyId));
    if (filters.branchId) conditions.push(eq(approvalRequests.branchId, filters.branchId));
    if (filters.entityType) conditions.push(eq(approvalRequests.entityType, filters.entityType));
    if (filters.actionType) conditions.push(eq(approvalRequests.actionType, filters.actionType));
    if (filters.status) conditions.push(eq(approvalRequests.status, filters.status));
    if (!canSeeAll) conditions.push(eq(approvalRequests.requestedBy, actor.userId));

    return this.db
      .select()
      .from(approvalRequests)
      .where(and(...conditions))
      .orderBy(asc(approvalRequests.requestedAt));
  }

  async getApprovalByIdForActor(id: string, actor: GovernanceActor) {
    const roleCodes = await this.getUserRoleCodes(actor.userId);
    const canSeeAll = roleCodes.includes('manager') || roleCodes.includes('auditor');
    const view = await this.getApprovalRequest(id);
    if (!canSeeAll && view.requestedBy !== actor.userId) {
      throw new ForbiddenException('You are not allowed to view this approval request');
    }
    return view;
  }

  async createApproval(dto: CreateApprovalDto, actor: GovernanceActor, ctx: GovernanceAuditContext) {
    const [inserted] = await this.db
      .insert(approvalRequests)
      .values({
        companyId: dto.companyId,
        branchId: dto.branchId,
        entityType: dto.entityType,
        entityId: dto.entityId,
        actionType: dto.actionType,
        status: 'draft',
        requestedBy: actor.userId,
        requestedAt: new Date(),
        reason: dto.reason,
        metaJson: {
          ...(dto.meta ?? {}),
          amount: dto.amount,
          percentage: dto.percentage,
        },
        createdBy: actor.userId,
        updatedBy: actor.userId,
      })
      .returning();
    if (!inserted) throw new InternalServerErrorException('Failed to create approval request');

    await this.db.insert(approvalsAudit).values({
      approvalRequestId: inserted.id,
      eventType: 'draft_created',
      actorUserId: actor.userId,
      payloadJson: { entityType: dto.entityType, entityId: dto.entityId, actionType: dto.actionType },
    });

    await this.audit.log({
      entity: 'governance_approval_requests',
      entityId: inserted.id,
      action: 'create_draft',
      after: inserted as object,
      userId: actor.userId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    return inserted;
  }

  async submitApproval(id: string, actor: GovernanceActor, ctx: GovernanceAuditContext) {
    if (!this.isEnabled()) {
      throw new ForbiddenException('Governance workflow is disabled');
    }
    const [request] = await this.db
      .select()
      .from(approvalRequests)
      .where(and(eq(approvalRequests.id, id), isNull(approvalRequests.deletedAt)));
    if (!request) throw new NotFoundException('Approval request not found');
    if (request.status !== 'draft') throw new ConflictException(`Only draft requests can be submitted`);
    if (request.requestedBy !== actor.userId) throw new ForbiddenException('Only requester can submit this draft');

    const policy = await this.evaluatePolicy({
      entityType: request.entityType,
      actionType: request.actionType,
      companyId: request.companyId,
      branchId: request.branchId,
      amount: this.readNumericMeta(request.metaJson, 'amount'),
      percentage: this.readNumericMeta(request.metaJson, 'percentage'),
    });
    if (!policy) throw new ConflictException('No matching policy for this request');
    const steps = [...policy.approvalStepsJson].sort((a, b) => a.stepOrder - b.stepOrder);
    if (!steps.length) throw new ConflictException('Policy has no approval steps');

    await this.db.transaction(async (tx) => {
      await tx
        .update(approvalRequests)
        .set({
          status: 'submitted',
          updatedAt: new Date(),
          updatedBy: actor.userId,
          metaJson: {
            ...(request.metaJson ?? {}),
            governance: {
              policyId: policy.id,
              policySteps: steps,
            },
          },
        })
        .where(eq(approvalRequests.id, id));

      await tx.insert(approvalSteps).values(
        steps.map((step) => ({
          approvalRequestId: id,
          stepOrder: step.stepOrder,
          requiredRole: step.requiredRole ?? null,
          requiredPermission: step.requiredPermission ?? null,
          status: 'pending',
        })),
      );

      await tx.insert(approvalsAudit).values({
        approvalRequestId: id,
        eventType: 'submitted',
        actorUserId: actor.userId,
        payloadJson: { policyId: policy.id },
      });
    });

    await this.audit.log({
      entity: 'governance_approval_requests',
      entityId: id,
      action: 'submit',
      userId: actor.userId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    // Send notification to approvers
    try {
      const approvers = await this.getApproversForSteps(steps);
      await this.notificationTriggers.notifyApprovalRequestCreated(id, {
        companyId: request.companyId,
        branchId: request.branchId,
        title: `${request.entityType} ${request.actionType}`,
        entityType: request.entityType,
        entityId: request.entityId,
        amount: this.readNumericMeta(request.metaJson, 'amount'),
        approvers,
      });
    } catch (error) {
      // Log error but don't fail the submission
      this.logger.error('Failed to send approval request notification:', error);
    }

    return this.getApprovalRequest(id);
  }

  async getApprovalRequest(requestId: string) {
    const [request] = await this.db
      .select()
      .from(approvalRequests)
      .where(and(eq(approvalRequests.id, requestId), isNull(approvalRequests.deletedAt)));
    if (!request) throw new NotFoundException('Approval request not found');

    const steps = await this.db
      .select()
      .from(approvalSteps)
      .where(and(eq(approvalSteps.approvalRequestId, requestId), isNull(approvalSteps.deletedAt)))
      .orderBy(asc(approvalSteps.stepOrder));

    const policySteps = this.readPolicySteps(request.metaJson);
    const now = Date.now();

    return {
      ...request,
      steps: steps.map((s) => {
        const dueAt = this.computeStepDueAt(request.requestedAt, policySteps, s.stepOrder);
        return {
          ...s,
          dueAt,
          isOverdue: s.status === 'pending' && !!dueAt && dueAt.getTime() < now,
        };
      }),
    };
  }

  async decideCurrentStep(
    requestId: string,
    decision: 'approve' | 'reject',
    reason: string | undefined,
    actor: GovernanceActor,
    ctx: GovernanceAuditContext,
  ) {
    if (!this.isEnabled()) throw new ForbiddenException('Governance workflow is disabled');

    const [request] = await this.db
      .select()
      .from(approvalRequests)
      .where(and(eq(approvalRequests.id, requestId), isNull(approvalRequests.deletedAt)));
    if (!request) throw new NotFoundException('Approval request not found');
    if (request.status !== 'submitted') throw new ConflictException(`Request status is ${request.status}`);

    const steps = await this.db
      .select()
      .from(approvalSteps)
      .where(and(eq(approvalSteps.approvalRequestId, requestId), isNull(approvalSteps.deletedAt)))
      .orderBy(asc(approvalSteps.stepOrder));
    const current = steps.find((s) => s.status === 'pending');
    if (!current) throw new ConflictException('No pending step');

    const policyStep = this.readPolicySteps(request.metaJson).find((s) => s.stepOrder === current.stepOrder);
    if (!policyStep) throw new ConflictException('Missing policy step snapshot');

    if (violatesMakerChecker(decision, request.requestedBy, actor.userId, policyStep.allowSelfApproval)) {
      throw new ForbiddenException('Maker-checker violation: requester cannot approve own request');
    }
    if (current.requiredPermission && !actor.permissions.includes(current.requiredPermission)) {
      throw new ForbiddenException(`Missing permission: ${current.requiredPermission}`);
    }
    if (current.requiredRole && !(actor.roles ?? []).includes(current.requiredRole)) {
      throw new ForbiddenException(`Missing role: ${current.requiredRole}`);
    }

    await this.db.transaction(async (tx) => {
      await tx
        .update(approvalSteps)
        .set({
          status: decision === 'approve' ? 'approved' : 'rejected',
          decidedBy: actor.userId,
          decidedAt: new Date(),
          decisionReason: reason,
          updatedAt: new Date(),
          updatedBy: actor.userId,
        })
        .where(eq(approvalSteps.id, current.id));

      const hasRemaining = steps.some((s) => s.status === 'pending' && s.id !== current.id);
      const requestStatus = decision === 'reject' ? 'rejected' : hasRemaining ? 'submitted' : 'approved';

      await tx
        .update(approvalRequests)
        .set({ status: requestStatus, updatedAt: new Date(), updatedBy: actor.userId })
        .where(eq(approvalRequests.id, requestId));

      await tx.insert(approvalsAudit).values({
        approvalRequestId: requestId,
        eventType: decision === 'approve' ? 'step_approved' : 'step_rejected',
        actorUserId: actor.userId,
        payloadJson: { stepId: current.id, stepOrder: current.stepOrder, requestStatus, reason },
      });

      if (requestStatus === 'approved') {
        await this.applyDecisionEffects(tx as NodePgDatabase<Schema>, request, 'approved', actor, reason);
      }
      if (requestStatus === 'rejected') {
        await this.applyDecisionEffects(tx as NodePgDatabase<Schema>, request, 'rejected', actor, reason);
      }

      // Send notification to requester about decision
      try {
        if (decision === 'approve') {
          await this.notificationTriggers.notifyApprovalApproved(requestId, {
            companyId: request.companyId,
            branchId: request.branchId,
            title: `${request.entityType} ${request.actionType}`,
            entityType: request.entityType,
            entityId: request.entityId,
            requesterId: request.requestedBy,
            approvedBy: actor.userId,
          });
        } else {
          await this.notificationTriggers.notifyApprovalRejected(requestId, {
            companyId: request.companyId,
            branchId: request.branchId,
            title: `${request.entityType} ${request.actionType}`,
            entityType: request.entityType,
            entityId: request.entityId,
            requesterId: request.requestedBy,
            rejectedBy: actor.userId,
            rejectionReason: reason,
          });
        }
      } catch (error) {
        this.logger.error('Failed to send approval decision notification:', error);
      }
    });

    await this.audit.log({
      entity: 'governance_approval_requests',
      entityId: requestId,
      action: decision === 'approve' ? 'approve_step' : 'reject_step',
      after: { reason },
      userId: actor.userId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    return this.getApprovalRequest(requestId);
  }

  async approve(id: string, dto: ActionReasonDto, actor: GovernanceActor, ctx: GovernanceAuditContext) {
    return this.decideCurrentStep(id, 'approve', dto.reason, actor, ctx);
  }

  async reject(id: string, dto: ActionReasonDto, actor: GovernanceActor, ctx: GovernanceAuditContext) {
    return this.decideCurrentStep(id, 'reject', dto.reason, actor, ctx);
  }

  async cancel(id: string, dto: ActionReasonDto, actor: GovernanceActor, ctx: GovernanceAuditContext) {
    const [request] = await this.db
      .select()
      .from(approvalRequests)
      .where(and(eq(approvalRequests.id, id), isNull(approvalRequests.deletedAt)));
    if (!request) throw new NotFoundException('Approval request not found');
    if (request.requestedBy !== actor.userId) throw new ForbiddenException('Only requester can cancel this approval request');
    if (!['draft', 'submitted'].includes(request.status)) {
      throw new ConflictException(`Cannot cancel request in status ${request.status}`);
    }

    await this.db.transaction(async (tx) => {
      await tx
        .update(approvalRequests)
        .set({ status: 'cancelled', updatedAt: new Date(), updatedBy: actor.userId })
        .where(eq(approvalRequests.id, id));

      await tx
        .update(approvalSteps)
        .set({ status: 'skipped', updatedAt: new Date(), updatedBy: actor.userId })
        .where(and(eq(approvalSteps.approvalRequestId, id), eq(approvalSteps.status, 'pending')));

      await tx.insert(approvalsAudit).values({
        approvalRequestId: id,
        eventType: 'cancelled',
        actorUserId: actor.userId,
        payloadJson: { reason: dto.reason },
      });
    });

    await this.audit.log({
      entity: 'governance_approval_requests',
      entityId: id,
      action: 'cancel',
      after: { reason: dto.reason },
      userId: actor.userId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    return this.getApprovalRequest(id);
  }

  async evaluatePolicy(input: EvaluatePolicyInput) {
    if (!this.isEnabled()) return null;
    const rows = await this.db
      .select()
      .from(approvalPolicies)
      .where(
        and(
          isNull(approvalPolicies.deletedAt),
          eq(approvalPolicies.isEnabled, true),
          eq(approvalPolicies.companyId, input.companyId),
          eq(approvalPolicies.entityType, input.entityType),
          eq(approvalPolicies.actionType, input.actionType),
          or(eq(approvalPolicies.branchId, input.branchId), isNull(approvalPolicies.branchId)),
        ),
      );

    return this.evaluator.evaluate(input, rows.map((r) => ({ ...r, isEnabled: r.isEnabled })));
  }

  async initiateControlledActionRequest(
    payload: CreateApprovalDto,
    actor: GovernanceActor,
    ctx: GovernanceAuditContext,
  ) {
    if (!this.isEnabled()) return null;
    const policy = await this.evaluatePolicy({
      entityType: payload.entityType,
      actionType: payload.actionType,
      companyId: payload.companyId,
      branchId: payload.branchId,
      amount: payload.amount,
      percentage: payload.percentage,
    });
    if (!policy) return null;

    const draft = await this.createApproval(payload, actor, ctx);
    const submitted = await this.submitApproval(draft.id, actor, ctx);
    return submitted;
  }

  private readPolicySteps(metaJson: unknown): ApprovalPolicyStep[] {
    if (!metaJson || typeof metaJson !== 'object') return [];
    const governance = (metaJson as { governance?: unknown }).governance;
    if (!governance || typeof governance !== 'object') return [];
    const steps = (governance as { policySteps?: unknown }).policySteps;
    return Array.isArray(steps) ? (steps as ApprovalPolicyStep[]) : [];
  }

  private computeStepDueAt(requestedAt: Date, steps: ApprovalPolicyStep[], stepOrder: number): Date | null {
    const ordered = [...steps].sort((a, b) => a.stepOrder - b.stepOrder);
    let dueHours = 0;
    let found = false;
    for (const step of ordered) {
      if ((step.dueHours ?? 0) > 0) dueHours += step.dueHours ?? 0;
      if (step.stepOrder === stepOrder) {
        found = true;
        break;
      }
    }
    if (!found || dueHours <= 0) return null;
    return new Date(requestedAt.getTime() + dueHours * 3600_000);
  }

  private readNumericMeta(metaJson: unknown, key: 'amount' | 'percentage'): number | undefined {
    if (!metaJson || typeof metaJson !== 'object') return undefined;
    const value = (metaJson as Record<string, unknown>)[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    return undefined;
  }

  private async applyDecisionEffects(
    tx: NodePgDatabase<Schema>,
    request: typeof approvalRequests.$inferSelect,
    outcome: 'approved' | 'rejected',
    actor: GovernanceActor,
    reason: string | undefined,
  ): Promise<void> {
    if (request.entityType === 'expense_entry' && request.actionType === 'approve') {
      await tx
        .update(expenseEntries)
        .set({
          status: outcome === 'approved' ? 'approved' : 'rejected',
          rejectionReason: outcome === 'rejected' ? reason ?? 'Rejected by governance workflow' : null,
          updatedAt: new Date(),
          updatedBy: actor.userId,
        })
        .where(eq(expenseEntries.id, request.entityId));
      await this.audit.log(
        {
          entity: 'expense_entries',
          entityId: request.entityId,
          action: outcome === 'approved' ? 'governance_approved' : 'governance_rejected',
          after: { status: outcome === 'approved' ? 'approved' : 'rejected', source: 'governance' } as object,
          userId: actor.userId,
        },
        tx,
      );
      return;
    }

    if (request.entityType === 'sale_transaction' && request.actionType === 'void') {
      if (outcome === 'approved') {
        await tx
          .update(salesTransactions)
          .set({
            status: 'voided',
            voidedAt: new Date(),
            voidedBy: actor.userId,
            voidReason: reason ?? this.readStringMeta(request.metaJson, 'voidReason') ?? request.reason ?? null,
            updatedAt: new Date(),
            updatedBy: actor.userId,
          })
          .where(eq(salesTransactions.id, request.entityId));
      } else {
        await tx
          .update(salesTransactions)
          .set({
            status: 'completed',
            updatedAt: new Date(),
            updatedBy: actor.userId,
          })
          .where(eq(salesTransactions.id, request.entityId));
      }
      await this.audit.log(
        {
          entity: 'sales_transactions',
          entityId: request.entityId,
          action: outcome === 'approved' ? 'governance_void_approved' : 'governance_void_rejected',
          after: { status: outcome === 'approved' ? 'voided' : 'completed', source: 'governance' } as object,
          userId: actor.userId,
        },
        tx,
      );
      return;
    }

    if (request.entityType === 'stock_adjustment' && request.actionType === 'approve') {
      const meta = this.readObjectMeta(request.metaJson);
      const tankId = this.readString(meta, 'tankId') ?? request.entityId;

      // Find the pending adjustment record linked to this approval request
      const [pendingAdj] = await tx
        .select({ id: adjustments.id })
        .from(adjustments)
        .where(and(eq(adjustments.approvalRequestId, request.id), isNull(adjustments.deletedAt)));

      if (outcome !== 'approved') {
        // Rejected: mark the pending adjustment as rejected
        if (pendingAdj) {
          await tx
            .update(adjustments)
            .set({
              status: 'rejected',
              notes: reason ?? 'Rejected by governance workflow',
              updatedAt: new Date(),
              updatedBy: actor.userId,
            })
            .where(eq(adjustments.id, pendingAdj.id));
        }
        await this.audit.log(
          {
            entity: 'adjustments',
            entityId: pendingAdj?.id ?? request.entityId,
            action: 'governance_rejected',
            after: { status: 'rejected', source: 'governance', reason } as object,
            userId: actor.userId,
          },
          tx,
        );
        return;
      }

      // Approved: apply the actual stock changes
      const volumeDelta = Number(this.readNumber(meta, 'volumeDelta') ?? 0);

      const [tankRow] = await tx
        .select({ id: tanks.id, currentLevel: tanks.currentLevel, capacity: tanks.capacity, productId: tanks.productId })
        .from(tanks)
        .where(and(eq(tanks.id, tankId), isNull(tanks.deletedAt)));
      if (!tankRow) throw new NotFoundException('Tank not found for approved adjustment');

      const current = Number(tankRow.currentLevel || 0);
      const capacity = Number(tankRow.capacity || 0);
      const nextLevel = current + volumeDelta;
      if (nextLevel < 0 || nextLevel > capacity) {
        throw new ConflictException('Approved adjustment would breach tank stock boundaries');
      }

      // Determine the adjustment record ID to use for the stock ledger reference
      let adjId: string;
      if (pendingAdj) {
        // Update existing pending record to completed
        await tx
          .update(adjustments)
          .set({
            status: 'completed',
            updatedAt: new Date(),
            updatedBy: actor.userId,
          })
          .where(eq(adjustments.id, pendingAdj.id));
        adjId = pendingAdj.id;
      } else {
        // Fallback: insert a new record if no pending record exists (legacy requests)
        const adjustmentReason = this.readString(meta, 'reason') ?? request.reason ?? 'Governed adjustment';
        const notes = this.readString(meta, 'notes');
        const [adj] = await tx
          .insert(adjustments)
          .values({
            companyId: request.companyId,
            branchId: request.branchId,
            tankId,
            adjustmentDate: new Date(),
            volumeDelta: String(volumeDelta.toFixed(3)),
            reason: adjustmentReason.slice(0, 64),
            notes,
            status: 'completed',
            approvalRequestId: request.id,
            createdBy: request.requestedBy,
            updatedBy: request.requestedBy,
          })
          .returning({ id: adjustments.id });
        if (!adj) throw new InternalServerErrorException('Failed to insert approved adjustment');
        adjId = adj.id;
      }

      await tx
        .update(tanks)
        .set({
          currentLevel: String(nextLevel.toFixed(3)),
          updatedAt: new Date(),
          updatedBy: actor.userId,
        })
        .where(eq(tanks.id, tankId));

      await tx.insert(stockLedger).values({
        companyId: request.companyId,
        branchId: request.branchId,
        tankId,
        productId: tankRow.productId,
        movementType: STOCK_LEDGER_MOVEMENT_ADJUSTMENT,
        referenceType: 'adjustment',
        referenceId: adjId,
        quantity: String(volumeDelta.toFixed(3)),
        movementDate: new Date(),
        createdBy: actor.userId,
        updatedBy: actor.userId,
      });
      await this.audit.log(
        {
          entity: 'adjustments',
          entityId: adjId,
          action: 'governance_approved_create',
          after: { id: adjId, source: 'governance' } as object,
          userId: actor.userId,
        },
        tx,
      );
      return;
    }

    if (request.entityType === 'shift' && request.actionType === 'close_variance') {
      const meta = this.readObjectMeta(request.metaJson);
      const readings = this.readArray(meta, 'closingMeterReadings');
      const collections = this.readArray(meta, 'collections');
      const varianceReason = this.readString(meta, 'varianceReason');
      const totalExpected = Number(this.readNumber(meta, 'totalExpected') ?? 0);
      const totalCollected = Number(this.readNumber(meta, 'totalCollected') ?? 0);
      const variance = Number(this.readNumber(meta, 'variance') ?? 0);

      if (outcome === 'approved') {
        for (const r of readings) {
          const nozzleId = this.readString(r, 'nozzleId');
          const value = this.readNumber(r, 'value');
          if (!nozzleId || value == null) continue;
          await tx.insert(meterReadings).values({
            shiftId: request.entityId,
            nozzleId,
            readingType: 'closing',
            value: String(value),
          });
        }
        for (const c of collections) {
          const paymentMethod = this.readString(c, 'paymentMethod');
          const amount = this.readNumber(c, 'amount');
          if (!paymentMethod || amount == null) continue;
          await tx.insert(shiftCollections).values({
            shiftId: request.entityId,
            paymentMethod,
            amount: String(amount),
          });
        }

        await tx
          .update(shifts)
          .set({
            status: 'closed',
            endTime: new Date(),
            closedBy: request.requestedBy,
            totalExpectedAmount: String(totalExpected.toFixed(2)),
            totalCollectedAmount: String(totalCollected.toFixed(2)),
            varianceAmount: String(variance.toFixed(2)),
            varianceReason,
            updatedAt: new Date(),
            updatedBy: actor.userId,
          })
          .where(eq(shifts.id, request.entityId));
      } else {
        await tx
          .update(shifts)
          .set({
            status: 'open',
            submittedForApprovalAt: null,
            updatedAt: new Date(),
            updatedBy: actor.userId,
          })
          .where(eq(shifts.id, request.entityId));
      }
      await this.audit.log(
        {
          entity: 'shifts',
          entityId: request.entityId,
          action: outcome === 'approved' ? 'governance_close_approved' : 'governance_close_rejected',
          after: { status: outcome === 'approved' ? 'closed' : 'open', source: 'governance' } as object,
          userId: actor.userId,
        },
        tx,
      );
    }
  }

  private readObjectMeta(meta: unknown): Record<string, unknown> {
    if (!meta || typeof meta !== 'object') return {};
    return meta as Record<string, unknown>;
  }

  private readArray(obj: Record<string, unknown>, key: string): Record<string, unknown>[] {
    const value = obj[key];
    if (!Array.isArray(value)) return [];
    return value.filter((v) => v && typeof v === 'object') as Record<string, unknown>[];
  }

  private async getApproversForSteps(steps: ApprovalPolicyStep[]): Promise<string[]> {
    // This is a simplified implementation - in a real system you'd query users by role/permission
    // For now, we'll return an empty array and let the notification service handle role-based recipients
    return [];
  }

  private readStringMeta(meta: unknown, key: string): string | undefined {
    const obj = this.readObjectMeta(meta);
    return this.readString(obj, key);
  }

  private readString(obj: Record<string, unknown>, key: string): string | undefined {
    const value = obj[key];
    return typeof value === 'string' ? value : undefined;
  }

  private readNumber(obj: Record<string, unknown>, key: string): number | undefined {
    const value = obj[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return undefined;
  }

  private async getUserRoleCodes(userId: string): Promise<string[]> {
    const rows = await this.db
      .select({ code: roles.code })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, userId));
    return rows.map((r) => r.code);
  }
}
