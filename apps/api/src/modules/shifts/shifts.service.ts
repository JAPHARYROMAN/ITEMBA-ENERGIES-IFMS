import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../../database/database.module';
import type * as schema from '../../database/schema';
import {
  shifts,
  SHIFT_STATUS_OPEN,
  SHIFT_STATUS_CLOSED,
  SHIFT_STATUS_PENDING_APPROVAL,
  SHIFT_STATUS_APPROVED,
} from '../../database/schema/operations/shifts';
import { meterReadings } from '../../database/schema/operations/meter-readings';
import { shiftCollections } from '../../database/schema/operations/shift-collections';
import { shiftAssignments } from '../../database/schema/operations/shift-assignments';
import { branches } from '../../database/schema/core/branches';
import { stations } from '../../database/schema/core/stations';
import { getListParams } from '../../common/helpers/list.helper';
import { parseSort } from '../../common/dto/sort.dto';
import { AuditService } from '../audit/audit.service';
import { GovernanceService } from '../governance/governance.service';
import type { OpenShiftDto } from './dto/open-shift.dto';
import type { CloseShiftDto } from './dto/close-shift.dto';

type Schema = typeof schema;

const READING_TYPE_OPENING = 'opening';
const READING_TYPE_CLOSING = 'closing';

export interface ShiftItem {
  id: string;
  companyId: string;
  branchId: string;
  stationId: string;
  code: string;
  type: string;
  startTime: Date;
  endTime: Date | null;
  status: string;
  openedBy: string | null;
  closedBy: string | null;
  totalExpectedAmount: string | null;
  totalCollectedAmount: string | null;
  varianceAmount: string | null;
  varianceReason: string | null;
  submittedForApprovalAt: Date | null;
  approvedAt: Date | null;
  approvedBy: string | null;
  createdAt: Date;
}

export interface ShiftsListParams {
  page?: number;
  pageSize?: number;
  sort?: string;
  branchId?: string;
  stationId?: string;
  companyId?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
}

interface AuditContext {
  userId: string;
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class ShiftsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<Schema>,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly governance: GovernanceService,
  ) {}

  async findPage(params: ShiftsListParams): Promise<{ data: ShiftItem[]; total: number }> {
    const { offset, limit, page, pageSize } = getListParams(params);
    const conditions = [isNull(shifts.deletedAt)];
    if (params.branchId) conditions.push(eq(shifts.branchId, params.branchId));
    if (params.stationId) conditions.push(eq(shifts.stationId, params.stationId));
    if (params.companyId) conditions.push(eq(shifts.companyId, params.companyId));
    if (params.status) conditions.push(eq(shifts.status, params.status));
    if (params.dateFrom) conditions.push(sql`${shifts.startTime} >= ${params.dateFrom}::timestamptz`);
    if (params.dateTo) conditions.push(sql`${shifts.startTime} <= ${params.dateTo}::timestamptz`);
    const w = conditions.length > 1 ? and(...conditions) : conditions[0];
    const sortCol = shifts.startTime;
    const [data, countResult] = await Promise.all([
      this.db
        .select({
          id: shifts.id,
          companyId: shifts.companyId,
          branchId: shifts.branchId,
          stationId: shifts.stationId,
          code: shifts.code,
          type: shifts.type,
          startTime: shifts.startTime,
          endTime: shifts.endTime,
          status: shifts.status,
          openedBy: shifts.openedBy,
          closedBy: shifts.closedBy,
          totalExpectedAmount: shifts.totalExpectedAmount,
          totalCollectedAmount: shifts.totalCollectedAmount,
          varianceAmount: shifts.varianceAmount,
          varianceReason: shifts.varianceReason,
          submittedForApprovalAt: shifts.submittedForApprovalAt,
          approvedAt: shifts.approvedAt,
          approvedBy: shifts.approvedBy,
          createdAt: shifts.createdAt,
        })
        .from(shifts)
        .where(w)
        .orderBy(desc(sortCol))
        .limit(limit)
        .offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(shifts).where(w),
    ]);
    return { data, total: countResult[0]?.count ?? 0 };
  }

  async findById(id: string): Promise<ShiftItem> {
    const [row] = await this.db
      .select({
        id: shifts.id,
        companyId: shifts.companyId,
        branchId: shifts.branchId,
        stationId: shifts.stationId,
        code: shifts.code,
        type: shifts.type,
        startTime: shifts.startTime,
        endTime: shifts.endTime,
        status: shifts.status,
        openedBy: shifts.openedBy,
        closedBy: shifts.closedBy,
        totalExpectedAmount: shifts.totalExpectedAmount,
        totalCollectedAmount: shifts.totalCollectedAmount,
        varianceAmount: shifts.varianceAmount,
        varianceReason: shifts.varianceReason,
        submittedForApprovalAt: shifts.submittedForApprovalAt,
        approvedAt: shifts.approvedAt,
        approvedBy: shifts.approvedBy,
        createdAt: shifts.createdAt,
      })
      .from(shifts)
      .where(and(eq(shifts.id, id), isNull(shifts.deletedAt)));
    if (!row) throw new NotFoundException('Shift not found');
    return row;
  }

  async open(dto: OpenShiftDto, ctx: AuditContext): Promise<ShiftItem> {
    const allowOverlapping = this.config.get<boolean>('ALLOW_OVERLAPPING_SHIFTS', false);

    return this.db.transaction(async (tx) => {
      const [branch] = await tx
        .select({ id: branches.id, stationId: branches.stationId })
        .from(branches)
        .where(and(eq(branches.id, dto.branchId), isNull(branches.deletedAt)));
      if (!branch) throw new NotFoundException('Branch not found');

      const [station] = await tx
        .select({ id: stations.id, companyId: stations.companyId })
        .from(stations)
        .where(and(eq(stations.id, branch.stationId), isNull(stations.deletedAt)));
      if (!station) throw new NotFoundException('Station not found');

      if (!allowOverlapping) {
        const [existing] = await tx
          .select({ id: shifts.id })
          .from(shifts)
          .where(
            and(
              eq(shifts.branchId, dto.branchId),
              eq(shifts.status, SHIFT_STATUS_OPEN),
              isNull(shifts.deletedAt),
            ),
          );
        if (existing) {
          throw new ConflictException(
            'Branch already has an open shift. Close it before opening another, or enable ALLOW_OVERLAPPING_SHIFTS.',
          );
        }
      }

      const code = `SH-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const startTime = new Date();
      const [shift] = await tx
        .insert(shifts)
        .values({
          companyId: station.companyId,
          branchId: dto.branchId,
          stationId: branch.stationId,
          code,
          type: 'standard',
          startTime,
          status: SHIFT_STATUS_OPEN,
          openedBy: ctx.userId,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        })
        .returning({
          id: shifts.id,
          companyId: shifts.companyId,
          branchId: shifts.branchId,
          stationId: shifts.stationId,
          code: shifts.code,
          type: shifts.type,
          startTime: shifts.startTime,
          endTime: shifts.endTime,
          status: shifts.status,
          openedBy: shifts.openedBy,
          closedBy: shifts.closedBy,
          totalExpectedAmount: shifts.totalExpectedAmount,
          totalCollectedAmount: shifts.totalCollectedAmount,
          varianceAmount: shifts.varianceAmount,
          varianceReason: shifts.varianceReason,
          submittedForApprovalAt: shifts.submittedForApprovalAt,
          approvedAt: shifts.approvedAt,
          approvedBy: shifts.approvedBy,
          createdAt: shifts.createdAt,
        });

      if (!shift) throw new Error('Failed to insert shift');

      for (const r of dto.openingMeterReadings) {
        await tx.insert(meterReadings).values({
          shiftId: shift.id,
          nozzleId: r.nozzleId,
          readingType: READING_TYPE_OPENING,
          value: String(r.value),
          pricePerUnit: r.pricePerUnit != null ? String(r.pricePerUnit) : null,
        });
      }

      await tx.insert(shiftAssignments).values({
        shiftId: shift.id,
        userId: ctx.userId,
        role: 'cashier',
      });

      await this.audit.log(
        {
          entity: 'shifts',
          entityId: shift.id,
          action: 'open',
          after: shift as object,
          userId: ctx.userId,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        tx as NodePgDatabase<Schema>,
      );

      return shift;
    });
  }

  async close(
    shiftId: string,
    dto: CloseShiftDto,
    ctx: AuditContext,
  ): Promise<ShiftItem> {
    const varianceThreshold = this.config.get<number>(
      'SHIFT_VARIANCE_REQUIRE_REASON_THRESHOLD',
      0,
    );

    return this.db.transaction(async (tx) => {
      const [shiftRow] = await tx
        .select()
        .from(shifts)
        .where(and(eq(shifts.id, shiftId), isNull(shifts.deletedAt)));
      if (!shiftRow) throw new NotFoundException('Shift not found');
      if (shiftRow.status !== SHIFT_STATUS_OPEN) {
        throw new BadRequestException(`Shift is not open (status: ${shiftRow.status})`);
      }

      const openingRows = await tx
        .select({
          nozzleId: meterReadings.nozzleId,
          value: meterReadings.value,
          pricePerUnit: meterReadings.pricePerUnit,
        })
        .from(meterReadings)
        .where(
          and(
            eq(meterReadings.shiftId, shiftId),
            eq(meterReadings.readingType, READING_TYPE_OPENING),
          ),
        );
      const openingByNozzle = new Map(
        openingRows.map((r) => [r.nozzleId, { value: Number(r.value), pricePerUnit: r.pricePerUnit ? Number(r.pricePerUnit) : 0 }]),
      );

      let totalExpected = 0;

      for (const closing of dto.closingMeterReadings) {
        const open = openingByNozzle.get(closing.nozzleId);
        if (!open) {
          throw new BadRequestException(
            `No opening reading for nozzle ${closing.nozzleId}`,
          );
        }
        if (closing.value < open.value) {
          throw new BadRequestException(
            `Closing reading (${closing.value}) must be >= opening reading (${open.value}) for nozzle ${closing.nozzleId}`,
          );
        }
        const litersSold = closing.value - open.value;
        totalExpected += litersSold * open.pricePerUnit;
      }

      const totalCollected = dto.collections.reduce((sum, c) => sum + c.amount, 0);
      const variance = totalCollected - totalExpected;
      const absVariance = Math.abs(variance);
      const requiresReason =
        absVariance > varianceThreshold || (varianceThreshold === 0 && variance !== 0);
      if (requiresReason && (!dto.varianceReason || !dto.varianceReason.trim())) {
        throw new BadRequestException(
          'Variance reason is required when variance is non-zero or beyond threshold',
        );
      }

      const requiresGovernanceApproval = absVariance > varianceThreshold;
      if (requiresGovernanceApproval) {
        const governanceRequest = await this.governance.initiateControlledActionRequest(
          {
            companyId: shiftRow.companyId,
            branchId: shiftRow.branchId,
            entityType: 'shift',
            entityId: shiftId,
            actionType: 'close_variance',
            amount: absVariance,
            reason: dto.varianceReason?.trim() || undefined,
            meta: {
              closingMeterReadings: dto.closingMeterReadings,
              collections: dto.collections,
              varianceReason: dto.varianceReason?.trim() || null,
              totalExpected,
              totalCollected,
              variance,
            },
          },
          { userId: ctx.userId, permissions: [] },
          { ip: ctx.ip, userAgent: ctx.userAgent },
        );

        if (governanceRequest) {
          const now = new Date();
          const [pending] = await tx
            .update(shifts)
            .set({
              status: SHIFT_STATUS_PENDING_APPROVAL,
              submittedForApprovalAt: now,
              totalExpectedAmount: String(totalExpected.toFixed(2)),
              totalCollectedAmount: String(totalCollected.toFixed(2)),
              varianceAmount: String(variance.toFixed(2)),
              varianceReason: dto.varianceReason?.trim() || null,
              updatedAt: now,
              updatedBy: ctx.userId,
            })
            .where(eq(shifts.id, shiftId))
            .returning({
              id: shifts.id,
              companyId: shifts.companyId,
              branchId: shifts.branchId,
              stationId: shifts.stationId,
              code: shifts.code,
              type: shifts.type,
              startTime: shifts.startTime,
              endTime: shifts.endTime,
              status: shifts.status,
              openedBy: shifts.openedBy,
              closedBy: shifts.closedBy,
              totalExpectedAmount: shifts.totalExpectedAmount,
              totalCollectedAmount: shifts.totalCollectedAmount,
              varianceAmount: shifts.varianceAmount,
              varianceReason: shifts.varianceReason,
              submittedForApprovalAt: shifts.submittedForApprovalAt,
              approvedAt: shifts.approvedAt,
              approvedBy: shifts.approvedBy,
              createdAt: shifts.createdAt,
            });

          if (!pending) throw new Error('Failed to set shift pending approval');

          await this.audit.log(
            {
              entity: 'shifts',
              entityId: shiftId,
              action: 'close_submitted_for_approval',
              before: shiftRow as object,
              after: pending as object,
              userId: ctx.userId,
              ip: ctx.ip,
              userAgent: ctx.userAgent,
            },
            tx as NodePgDatabase<Schema>,
          );

          return pending;
        }
      }

      for (const r of dto.closingMeterReadings) {
        await tx.insert(meterReadings).values({
          shiftId,
          nozzleId: r.nozzleId,
          readingType: READING_TYPE_CLOSING,
          value: String(r.value),
        });
      }

      for (const c of dto.collections) {
        await tx.insert(shiftCollections).values({
          shiftId,
          paymentMethod: c.paymentMethod,
          amount: String(c.amount),
        });
      }

      const endTime = new Date();
      const [updated] = await tx
        .update(shifts)
        .set({
          endTime,
          status: SHIFT_STATUS_CLOSED,
          closedBy: ctx.userId,
          totalExpectedAmount: String(totalExpected.toFixed(2)),
          totalCollectedAmount: String(totalCollected.toFixed(2)),
          varianceAmount: String(variance.toFixed(2)),
          varianceReason: dto.varianceReason?.trim() || null,
          updatedAt: endTime,
          updatedBy: ctx.userId,
        })
        .where(eq(shifts.id, shiftId))
        .returning({
          id: shifts.id,
          companyId: shifts.companyId,
          branchId: shifts.branchId,
          stationId: shifts.stationId,
          code: shifts.code,
          type: shifts.type,
          startTime: shifts.startTime,
          endTime: shifts.endTime,
          status: shifts.status,
          openedBy: shifts.openedBy,
          closedBy: shifts.closedBy,
          totalExpectedAmount: shifts.totalExpectedAmount,
          totalCollectedAmount: shifts.totalCollectedAmount,
          varianceAmount: shifts.varianceAmount,
          varianceReason: shifts.varianceReason,
          submittedForApprovalAt: shifts.submittedForApprovalAt,
          approvedAt: shifts.approvedAt,
          approvedBy: shifts.approvedBy,
          createdAt: shifts.createdAt,
        });

      if (!updated) throw new Error('Failed to update shift');

      await this.audit.log(
        {
          entity: 'shifts',
          entityId: shiftId,
          action: 'close',
          before: shiftRow as object,
          after: updated as object,
          userId: ctx.userId,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        tx as NodePgDatabase<Schema>,
      );

      return updated;
    });
  }

  async submitForApproval(shiftId: string, ctx: AuditContext): Promise<ShiftItem> {
    const [shift] = await this.db
      .select()
      .from(shifts)
      .where(and(eq(shifts.id, shiftId), isNull(shifts.deletedAt)));
    if (!shift) throw new NotFoundException('Shift not found');
    if (shift.status !== SHIFT_STATUS_CLOSED) {
      throw new BadRequestException('Only closed shifts can be submitted for approval');
    }
    if (shift.submittedForApprovalAt) {
      throw new BadRequestException('Shift already submitted for approval');
    }

    const now = new Date();
    const [updated] = await this.db
      .update(shifts)
      .set({
        status: SHIFT_STATUS_PENDING_APPROVAL,
        submittedForApprovalAt: now,
        updatedAt: now,
        updatedBy: ctx.userId,
      })
      .where(eq(shifts.id, shiftId))
      .returning({
        id: shifts.id,
        companyId: shifts.companyId,
        branchId: shifts.branchId,
        stationId: shifts.stationId,
        code: shifts.code,
        type: shifts.type,
        startTime: shifts.startTime,
        endTime: shifts.endTime,
        status: shifts.status,
        openedBy: shifts.openedBy,
        closedBy: shifts.closedBy,
        totalExpectedAmount: shifts.totalExpectedAmount,
        totalCollectedAmount: shifts.totalCollectedAmount,
        varianceAmount: shifts.varianceAmount,
        varianceReason: shifts.varianceReason,
        submittedForApprovalAt: shifts.submittedForApprovalAt,
        approvedAt: shifts.approvedAt,
        approvedBy: shifts.approvedBy,
        createdAt: shifts.createdAt,
      });
    if (!updated) throw new Error('Update failed');
    await this.audit.log({
      entity: 'shifts',
      entityId: shiftId,
      action: 'submit_for_approval',
      before: shift as object,
      after: updated as object,
      userId: ctx.userId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return updated;
  }

  async approve(shiftId: string, ctx: AuditContext): Promise<ShiftItem> {
    const [shift] = await this.db
      .select()
      .from(shifts)
      .where(and(eq(shifts.id, shiftId), isNull(shifts.deletedAt)));
    if (!shift) throw new NotFoundException('Shift not found');
    if (shift.status !== SHIFT_STATUS_PENDING_APPROVAL) {
      throw new BadRequestException('Only shifts pending approval can be approved');
    }

    const now = new Date();
    const [updated] = await this.db
      .update(shifts)
      .set({
        status: SHIFT_STATUS_APPROVED,
        approvedAt: now,
        approvedBy: ctx.userId,
        updatedAt: now,
        updatedBy: ctx.userId,
      })
      .where(eq(shifts.id, shiftId))
      .returning({
        id: shifts.id,
        companyId: shifts.companyId,
        branchId: shifts.branchId,
        stationId: shifts.stationId,
        code: shifts.code,
        type: shifts.type,
        startTime: shifts.startTime,
        endTime: shifts.endTime,
        status: shifts.status,
        openedBy: shifts.openedBy,
        closedBy: shifts.closedBy,
        totalExpectedAmount: shifts.totalExpectedAmount,
        totalCollectedAmount: shifts.totalCollectedAmount,
        varianceAmount: shifts.varianceAmount,
        varianceReason: shifts.varianceReason,
        submittedForApprovalAt: shifts.submittedForApprovalAt,
        approvedAt: shifts.approvedAt,
        approvedBy: shifts.approvedBy,
        createdAt: shifts.createdAt,
      });
    if (!updated) throw new Error('Update failed');
    await this.audit.log({
      entity: 'shifts',
      entityId: shiftId,
      action: 'approve',
      before: shift as object,
      after: updated as object,
      userId: ctx.userId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return updated;
  }
}
