import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GovernanceService } from './governance.service';
import { PolicyEvaluatorService } from './policy-evaluator.service';
import { DRIZZLE } from '../../database/database.module';
import { AuditService } from '../audit/audit.service';
import { NotificationTriggersService } from '../notifications/notification-triggers.service';

/**
 * A flexible drizzle chain mock that serves terminal results from a FIFO queue.
 * Unlike the shared drizzle-mock util it also supports `.for('update')` and
 * `.limit()` as both intermediate (chain) and terminal (awaited) calls, which
 * the governance service relies on heavily.
 */
function createChainMock() {
  const results: unknown[] = [];
  const next = () => (results.length > 0 ? results.shift() : []);

  const chain: any = {};
  const ret = () => chain;
  for (const m of [
    'from',
    'where',
    'orderBy',
    'limit',
    'offset',
    'values',
    'set',
    'leftJoin',
    'innerJoin',
    'groupBy',
    'having',
    'for',
  ]) {
    chain[m] = jest.fn(ret);
  }
  chain.returning = jest.fn(() => Promise.resolve(next()));
  chain.execute = jest.fn(() => Promise.resolve(next()));
  chain.then = (resolve: any, reject?: any) =>
    Promise.resolve(next()).then(resolve, reject);

  const db: any = {
    select: jest.fn(ret),
    insert: jest.fn(ret),
    update: jest.fn(ret),
    delete: jest.fn(ret),
    execute: jest.fn(() => Promise.resolve(next())),
    transaction: jest.fn(async (cb: any) => cb(db)),
  };
  Object.assign(db, {
    from: chain.from,
    where: chain.where,
    values: chain.values,
    set: chain.set,
    returning: chain.returning,
    for: chain.for,
  });

  return {
    db,
    queue: (rows: unknown) => results.push(rows),
    reset: () => (results.length = 0),
  };
}

describe('GovernanceService (full)', () => {
  let service: GovernanceService;
  let drizzle: ReturnType<typeof createChainMock>;
  let config: { get: jest.Mock };
  const audit = { log: jest.fn() };
  const triggers = {
    notifyApprovalRequestCreated: jest.fn(),
    notifyApprovalApproved: jest.fn(),
    notifyApprovalRejected: jest.fn(),
  };
  const evaluator = { evaluate: jest.fn() };

  const ctx = { ip: '1.1.1.1', userAgent: 'jest' };
  const actor = { userId: 'u1', permissions: [] as string[], roles: [] as string[] };

  const governanceMeta = (steps: any[] = [{ stepOrder: 1 }]) => ({
    governance: { policySteps: steps },
  });

  const submittedRequest = (overrides: Record<string, any> = {}) => ({
    id: 'r1',
    requestedBy: 'maker',
    status: 'submitted',
    companyId: 'c1',
    branchId: 'b1',
    entityType: 'expense_entry',
    actionType: 'approve',
    entityId: 'entity1',
    requestedAt: new Date('2026-01-01T00:00:00.000Z'),
    metaJson: governanceMeta(),
    ...overrides,
  });

  const queueFinalStepDecision = (
    request: Record<string, any>,
    step: Record<string, any> = { id: 's1', stepOrder: 1, status: 'pending' },
  ) => {
    drizzle.queue([request]);
    drizzle.queue([step]);
    drizzle.queue([{ id: step.id }]);
    drizzle.queue([]);
    drizzle.queue([]);
  };

  const queueApprovalReload = (
    request: Record<string, any>,
    status: string,
    steps: Record<string, any>[] = [{ id: 's1', stepOrder: 1, status }],
  ) => {
    drizzle.queue([{ ...request, status }]);
    drizzle.queue(steps);
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    drizzle = createChainMock();
    config = {
      get: jest.fn((key: string, fallback?: any) => {
        if (key === 'GOVERNANCE_ENABLED') return true;
        if (key === 'GOVERNANCE_APPROVAL_DEADLINE_HOURS') return 48;
        return fallback;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GovernanceService,
        { provide: DRIZZLE, useValue: drizzle.db },
        { provide: ConfigService, useValue: config },
        { provide: AuditService, useValue: audit },
        { provide: PolicyEvaluatorService, useValue: evaluator },
        { provide: NotificationTriggersService, useValue: triggers },
      ],
    }).compile();

    service = module.get(GovernanceService);
  });

  describe('isEnabled', () => {
    it('reflects the GOVERNANCE_ENABLED config flag', () => {
      expect(service.isEnabled()).toBe(true);
      config.get.mockReturnValueOnce(false);
      expect(service.isEnabled()).toBe(false);
    });
  });

  describe('listPolicies', () => {
    it('applies every optional filter when supplied', async () => {
      drizzle.queue([{ id: 'p1' }]);

      const res = await service.listPolicies({
        companyId: 'c1',
        branchId: 'b1',
        entityType: 'expense_entry',
        actionType: 'approve',
      } as any);

      expect(res).toEqual([{ id: 'p1' }]);
      expect(drizzle.db.where).toHaveBeenCalled();
    });
  });

  describe('createPolicy', () => {
    it('sorts steps, stringifies thresholds and audits', async () => {
      const inserted = { id: 'p1', companyId: 'c1' };
      drizzle.queue([inserted]); // returning
      const dto: any = {
        companyId: 'c1',
        entityType: 'expense_entry',
        actionType: 'approve',
        thresholdAmount: 1000,
        thresholdPct: 5,
        approvalSteps: [
          { stepOrder: 2, requiredRole: 'manager' },
          { stepOrder: 1, requiredRole: 'cashier' },
        ],
      };
      const result = await service.createPolicy(dto, actor, ctx);
      expect(result).toEqual(inserted);
      const values = drizzle.db.values.mock.calls[0][0];
      expect(values.thresholdAmount).toBe('1000');
      expect(values.thresholdPct).toBe('5');
      expect(values.approvalStepsJson[0].stepOrder).toBe(1); // sorted
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'governance_policies', action: 'create' }),
      );
    });

    it('throws when insert returns nothing', async () => {
      drizzle.queue([]); // returning empty
      const dto: any = {
        companyId: 'c1',
        entityType: 'e',
        actionType: 'a',
        approvalSteps: [{ stepOrder: 1 }],
      };
      await expect(service.createPolicy(dto, actor, ctx)).rejects.toThrow();
    });

    it('persists null thresholds and explicit disabled state', async () => {
      const inserted = { id: 'p2', companyId: 'c1' };
      drizzle.queue([inserted]);

      await service.createPolicy(
        {
          companyId: 'c1',
          branchId: undefined,
          entityType: 'shift',
          actionType: 'close_variance',
          thresholdAmount: null,
          thresholdPct: null,
          approvalSteps: [{ stepOrder: 1 }],
          isEnabled: false,
        } as any,
        actor,
        ctx,
      );

      const values = drizzle.db.values.mock.calls[0][0];
      expect(values.branchId).toBeNull();
      expect(values.thresholdAmount).toBeNull();
      expect(values.thresholdPct).toBeNull();
      expect(values.isEnabled).toBe(false);
    });
  });

  describe('updatePolicy', () => {
    it('throws NotFoundException when the policy does not exist', async () => {
      drizzle.queue([]); // select before
      await expect(
        service.updatePolicy('p1', { isEnabled: false } as any, actor, ctx),
      ).rejects.toThrow(NotFoundException);
    });

    it('updates and audits before/after', async () => {
      drizzle.queue([{ id: 'p1', companyId: 'c1', isEnabled: true }]); // before
      drizzle.queue([{ id: 'p1', companyId: 'c1', isEnabled: false }]); // returning
      const res = await service.updatePolicy('p1', { isEnabled: false } as any, actor, ctx);
      expect(res.isEnabled).toBe(false);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'governance_policies', action: 'update' }),
      );
    });

    it('throws when the update returning row is missing', async () => {
      drizzle.queue([{ id: 'p1', companyId: 'c1' }]);
      drizzle.queue([]);

      await expect(
        service.updatePolicy('p1', { companyId: 'c2' } as any, actor, ctx),
      ).rejects.toThrow('Failed to update policy');
    });

    it('normalizes nullable fields and sorts replacement steps', async () => {
      drizzle.queue([{ id: 'p1', companyId: 'c1', branchId: 'b1' }]);
      drizzle.queue([{ id: 'p1', companyId: 'c1', branchId: null }]);

      await service.updatePolicy(
        'p1',
        {
          branchId: null,
          thresholdAmount: null,
          thresholdPct: 3,
          approvalSteps: [{ stepOrder: 2 }, { stepOrder: 1 }],
        } as any,
        actor,
        ctx,
      );

      const values = drizzle.db.set.mock.calls[0][0];
      expect(values.branchId).toBeNull();
      expect(values.thresholdAmount).toBeNull();
      expect(values.thresholdPct).toBe('3');
      expect(values.approvalStepsJson[0].stepOrder).toBe(1);
    });
  });

  describe('createApproval', () => {
    it('creates a draft, writes an approvals_audit row and audits', async () => {
      const inserted = { id: 'r1', companyId: 'c1' };
      drizzle.queue([inserted]); // approvalRequests returning
      drizzle.queue([]); // approvalsAudit insert (awaited values)
      const dto: any = {
        companyId: 'c1',
        branchId: 'b1',
        entityType: 'expense_entry',
        entityId: 'e1',
        actionType: 'approve',
        amount: 500,
      };
      const res = await service.createApproval(dto, actor, ctx);
      expect(res).toEqual(inserted);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'create_draft' }),
      );
    });

    it('merges caller metadata with amount and percentage', async () => {
      const inserted = { id: 'r2', companyId: 'c1' };
      drizzle.queue([inserted]);
      drizzle.queue([]);

      await service.createApproval(
        {
          companyId: 'c1',
          branchId: null,
          entityType: 'stock_adjustment',
          entityId: 'tank1',
          actionType: 'approve',
          amount: undefined,
          percentage: 7,
          meta: { tankId: 'tank1', reason: 'dip correction' },
        } as any,
        actor,
        ctx,
      );

      const values = drizzle.db.values.mock.calls[0][0];
      expect(values.metaJson).toEqual({
        tankId: 'tank1',
        reason: 'dip correction',
        amount: undefined,
        percentage: 7,
      });
    });

    it('throws when insert returns no approval request', async () => {
      drizzle.queue([]);

      await expect(
        service.createApproval(
          {
            companyId: 'c1',
            entityType: 'expense_entry',
            entityId: 'e1',
            actionType: 'approve',
          } as any,
          actor,
          ctx,
        ),
      ).rejects.toThrow('Failed to create approval request');
    });
  });

  describe('listApprovals', () => {
    it('restricts non-privileged users to their own requests', async () => {
      drizzle.queue([{ code: 'cashier' }]); // role codes
      drizzle.queue([{ id: 'r1' }]); // requests
      const res = await service.listApprovals({} as any, actor);
      expect(res).toEqual([{ id: 'r1' }]);
    });

    it('lets managers see all requests', async () => {
      drizzle.queue([{ code: 'manager' }]);
      drizzle.queue([{ id: 'r1' }, { id: 'r2' }]);
      const res = await service.listApprovals({} as any, actor);
      expect(res).toHaveLength(2);
    });

    it('treats auditors as privileged and accepts all filters', async () => {
      drizzle.queue([{ code: 'auditor' }]);
      drizzle.queue([{ id: 'r1' }]);

      const res = await service.listApprovals(
        {
          companyId: 'c1',
          branchId: 'b1',
          entityType: 'stock_adjustment',
          actionType: 'approve',
          status: 'submitted',
        } as any,
        actor,
      );

      expect(res).toEqual([{ id: 'r1' }]);
      expect(drizzle.db.where).toHaveBeenCalled();
    });
  });

  describe('getApprovalByIdForActor', () => {
    it('forbids a non-owner non-privileged actor', async () => {
      drizzle.queue([{ code: 'cashier' }]); // role codes
      drizzle.queue([{ id: 'r1', requestedBy: 'someone-else' }]); // request
      drizzle.queue([]); // steps
      await expect(
        service.getApprovalByIdForActor('r1', actor),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows the owner to view their own request', async () => {
      drizzle.queue([{ code: 'cashier' }]);
      drizzle.queue([{ id: 'r1', requestedBy: 'u1', requestedAt: new Date(), metaJson: {} }]);
      drizzle.queue([]); // steps
      const res = await service.getApprovalByIdForActor('r1', actor);
      expect(res.id).toBe('r1');
    });
  });

  describe('getApprovalRequest', () => {
    it('throws NotFoundException when request is absent', async () => {
      drizzle.queue([]);
      await expect(service.getApprovalRequest('missing')).rejects.toThrow(NotFoundException);
    });

    it('computes per-step dueAt and overdue flags from policy snapshot', async () => {
      const requestedAt = new Date('2026-01-01T00:00:00Z');
      drizzle.queue([
        {
          id: 'r1',
          requestedAt,
          metaJson: {
            governance: {
              policySteps: [
                { stepOrder: 1, dueHours: 24 },
                { stepOrder: 2, dueHours: 24 },
              ],
            },
          },
        },
      ]);
      drizzle.queue([
        { id: 's1', stepOrder: 1, status: 'pending' },
        { id: 's2', stepOrder: 2, status: 'pending' },
      ]);
      const res = await service.getApprovalRequest('r1');
      // step 1 due at +24h, step 2 due at +48h
      expect(res.steps[0].dueAt?.toISOString()).toBe('2026-01-02T00:00:00.000Z');
      expect(res.steps[1].dueAt?.toISOString()).toBe('2026-01-03T00:00:00.000Z');
      // requestedAt is in 2026; relative to "now" both are overdue.
      expect(res.steps[0].isOverdue).toBe(true);
    });

    it('returns null due dates for invalid or missing policy snapshots', async () => {
      const requestedAt = new Date('2999-01-01T00:00:00Z');
      drizzle.queue([{ id: 'r1', requestedAt, metaJson: null }]);
      drizzle.queue([{ id: 's1', stepOrder: 1, status: 'pending' }]);

      const res = await service.getApprovalRequest('r1');

      expect(res.steps[0].dueAt).toBeNull();
      expect(res.steps[0].isOverdue).toBe(false);
    });

    it('does not mark decided steps overdue even when their due date has passed', async () => {
      const requestedAt = new Date('2026-01-01T00:00:00Z');
      drizzle.queue([
        {
          id: 'r1',
          requestedAt,
          metaJson: governanceMeta([{ stepOrder: 1, dueHours: 1 }]),
        },
      ]);
      drizzle.queue([{ id: 's1', stepOrder: 1, status: 'approved' }]);

      const res = await service.getApprovalRequest('r1');

      expect(res.steps[0].dueAt?.toISOString()).toBe('2026-01-01T01:00:00.000Z');
      expect(res.steps[0].isOverdue).toBe(false);
    });
  });

  describe('submitApproval', () => {
    it('throws ForbiddenException when governance is disabled', async () => {
      config.get.mockImplementation((k: string) =>
        k === 'GOVERNANCE_ENABLED' ? false : undefined,
      );
      await expect(service.submitApproval('r1', actor, ctx)).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when a non-requester submits', async () => {
      drizzle.queue([{ id: 'r1', requestedBy: 'other', status: 'draft' }]); // select for update
      await expect(service.submitApproval('r1', actor, ctx)).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when the draft is missing', async () => {
      drizzle.queue([]);

      await expect(service.submitApproval('missing', actor, ctx)).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when request is not a draft or submitted', async () => {
      drizzle.queue([{ id: 'r1', requestedBy: 'u1', status: 'cancelled' }]);

      await expect(service.submitApproval('r1', actor, ctx)).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when no policy matches', async () => {
      drizzle.queue([
        { id: 'r1', requestedBy: 'u1', status: 'draft', entityType: 'e', actionType: 'a', companyId: 'c1', branchId: 'b1', metaJson: {} },
      ]); // select for update
      evaluator.evaluate.mockReturnValueOnce(null);
      drizzle.queue([]); // policy rows for evaluatePolicyWithClient select
      await expect(service.submitApproval('r1', actor, ctx)).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when the matching policy has no steps', async () => {
      drizzle.queue([
        { id: 'r1', requestedBy: 'u1', status: 'draft', entityType: 'e', actionType: 'a', companyId: 'c1', branchId: 'b1', metaJson: {} },
      ]);
      drizzle.queue([]);
      evaluator.evaluate.mockReturnValueOnce({ id: 'p1', approvalStepsJson: [] });

      await expect(service.submitApproval('r1', actor, ctx)).rejects.toThrow('Policy has no approval steps');
    });

    it('submits a draft, inserts steps and notifies approvers', async () => {
      const request = {
        id: 'r1',
        requestedBy: 'u1',
        status: 'draft',
        entityType: 'expense_entry',
        actionType: 'approve',
        companyId: 'c1',
        branchId: 'b1',
        entityId: 'e1',
        requestedAt: new Date(),
        metaJson: { amount: 1000 },
      };
      drizzle.queue([request]); // select for update
      drizzle.queue([]); // policy rows select
      evaluator.evaluate.mockReturnValueOnce({
        id: 'p1',
        approvalStepsJson: [{ stepOrder: 1, requiredRole: 'manager' }],
      });
      // update request, insert steps, insert audit -> awaited values()
      drizzle.queue([]);
      drizzle.queue([]);
      drizzle.queue([]);
      // getApprovalRequest at the end
      drizzle.queue([{ ...request, status: 'submitted' }]);
      drizzle.queue([{ id: 's1', stepOrder: 1, status: 'pending' }]);

      const res = await service.submitApproval('r1', actor, ctx);
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'submit' }));
      expect(triggers.notifyApprovalRequestCreated).toHaveBeenCalled();
      expect(res.id).toBe('r1');
    });

    it('is idempotent when already submitted', async () => {
      const request = {
        id: 'r1',
        requestedBy: 'u1',
        status: 'submitted',
        requestedAt: new Date(),
        metaJson: {},
      };
      drizzle.queue([request]); // select for update returns submitted
      // getApprovalRequest re-read
      drizzle.queue([request]);
      drizzle.queue([]); // steps
      const res = await service.submitApproval('r1', actor, ctx);
      expect(res.id).toBe('r1');
      expect(audit.log).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'submit' }));
    });

    it('logs and continues when submit notification fails', async () => {
      const request = {
        id: 'r1',
        requestedBy: 'u1',
        status: 'draft',
        entityType: 'expense_entry',
        actionType: 'approve',
        companyId: 'c1',
        branchId: 'b1',
        entityId: 'e1',
        requestedAt: new Date(),
        metaJson: { amount: 'not-a-number', percentage: 2 },
      };
      drizzle.queue([request]);
      drizzle.queue([]);
      evaluator.evaluate.mockReturnValueOnce({
        id: 'p1',
        approvalStepsJson: [{ stepOrder: 1 }],
      });
      drizzle.queue([]);
      drizzle.queue([]);
      drizzle.queue([]);
      drizzle.queue([{ ...request, status: 'submitted' }]);
      drizzle.queue([{ id: 's1', stepOrder: 1, status: 'pending' }]);
      triggers.notifyApprovalRequestCreated.mockRejectedValueOnce(new Error('notify failed'));
      const loggerSpy = jest.spyOn((service as any).logger, 'error').mockImplementation();

      const res = await service.submitApproval('r1', actor, ctx);

      expect(res.id).toBe('r1');
      expect(loggerSpy).toHaveBeenCalledWith(
        'Failed to send approval request notification:',
        expect.any(Error),
      );
      loggerSpy.mockRestore();
    });
  });

  describe('decideCurrentStep', () => {
    it('throws ForbiddenException when governance disabled', async () => {
      config.get.mockImplementation((k: string) =>
        k === 'GOVERNANCE_ENABLED' ? false : undefined,
      );
      await expect(
        service.decideCurrentStep('r1', 'approve', undefined, actor, ctx),
      ).rejects.toThrow(ForbiddenException);
    });

    it('blocks maker-checker self-approval', async () => {
      const request = {
        id: 'r1',
        requestedBy: 'u1',
        status: 'submitted',
        companyId: 'c1',
        metaJson: { governance: { policySteps: [{ stepOrder: 1 }] } },
      };
      drizzle.queue([request]); // select request for update
      drizzle.queue([{ id: 's1', stepOrder: 1, status: 'pending' }]); // steps for update
      await expect(
        service.decideCurrentStep('r1', 'approve', undefined, actor, ctx),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when the request is missing', async () => {
      drizzle.queue([]);

      await expect(
        service.decideCurrentStep('missing', 'approve', undefined, actor, ctx),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when the request is not submitted', async () => {
      drizzle.queue([{ id: 'r1', requestedBy: 'maker', status: 'draft' }]);

      await expect(
        service.decideCurrentStep('r1', 'approve', undefined, actor, ctx),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when there is no pending step', async () => {
      const request = submittedRequest();
      drizzle.queue([request]);
      drizzle.queue([{ id: 's1', stepOrder: 1, status: 'approved' }]);

      await expect(
        service.decideCurrentStep('r1', 'approve', undefined, { userId: 'checker', permissions: [], roles: [] }, ctx),
      ).rejects.toThrow('No pending step');
    });

    it('returns the current view for duplicate decisions from the same approver', async () => {
      const request = submittedRequest();
      drizzle.queue([request]);
      drizzle.queue([
        { id: 's0', stepOrder: 0, status: 'approved', decidedBy: 'checker' },
        { id: 's1', stepOrder: 1, status: 'pending' },
      ]);
      queueApprovalReload(request, 'submitted', [{ id: 's1', stepOrder: 1, status: 'pending' }]);

      const res = await service.decideCurrentStep(
        'r1',
        'approve',
        undefined,
        { userId: 'checker', permissions: [], roles: [] },
        ctx,
      );

      expect(res.id).toBe('r1');
      expect(triggers.notifyApprovalApproved).not.toHaveBeenCalled();
    });

    it('throws ConflictException when the policy step snapshot is missing', async () => {
      const request = submittedRequest({ metaJson: governanceMeta([]) });
      drizzle.queue([request]);
      drizzle.queue([{ id: 's1', stepOrder: 1, status: 'pending' }]);

      await expect(
        service.decideCurrentStep('r1', 'approve', undefined, { userId: 'checker', permissions: [], roles: [] }, ctx),
      ).rejects.toThrow('Missing policy step snapshot');
    });

    it('enforces required permission on the current step', async () => {
      const request = {
        id: 'r1',
        requestedBy: 'other',
        status: 'submitted',
        companyId: 'c1',
        metaJson: { governance: { policySteps: [{ stepOrder: 1 }] } },
      };
      drizzle.queue([request]);
      drizzle.queue([{ id: 's1', stepOrder: 1, status: 'pending', requiredPermission: 'expense:approve' }]);
      await expect(
        service.decideCurrentStep('r1', 'approve', undefined, actor, ctx),
      ).rejects.toThrow(/Missing permission/);
    });

    it('enforces required role on the current step', async () => {
      const request = submittedRequest();
      drizzle.queue([request]);
      drizzle.queue([{ id: 's1', stepOrder: 1, status: 'pending', requiredRole: 'manager' }]);

      await expect(
        service.decideCurrentStep('r1', 'approve', undefined, { userId: 'checker', permissions: [], roles: ['cashier'] }, ctx),
      ).rejects.toThrow(/Missing role/);
    });

    it('returns the current view when the pending step update loses the race', async () => {
      const request = submittedRequest();
      drizzle.queue([request]);
      drizzle.queue([{ id: 's1', stepOrder: 1, status: 'pending' }]);
      drizzle.queue([]);
      queueApprovalReload(request, 'submitted', [{ id: 's1', stepOrder: 1, status: 'pending' }]);

      const res = await service.decideCurrentStep(
        'r1',
        'approve',
        undefined,
        { userId: 'checker', permissions: [], roles: [] },
        ctx,
      );

      expect(res.id).toBe('r1');
      expect(triggers.notifyApprovalApproved).not.toHaveBeenCalled();
    });

    it('keeps the request submitted when approving a non-final step', async () => {
      const request = submittedRequest({
        metaJson: governanceMeta([{ stepOrder: 1 }, { stepOrder: 2 }]),
      });
      drizzle.queue([request]);
      drizzle.queue([
        { id: 's1', stepOrder: 1, status: 'pending' },
        { id: 's2', stepOrder: 2, status: 'pending' },
      ]);
      drizzle.queue([{ id: 's1' }]);
      drizzle.queue([]);
      drizzle.queue([]);
      queueApprovalReload(request, 'submitted', [
        { id: 's1', stepOrder: 1, status: 'approved' },
        { id: 's2', stepOrder: 2, status: 'pending' },
      ]);

      const res = await service.decideCurrentStep(
        'r1',
        'approve',
        'step one',
        { userId: 'checker', permissions: [], roles: [] },
        ctx,
      );

      const submittedUpdate = drizzle.db.set.mock.calls.find((call: any[]) => call[0]?.status === 'submitted');
      expect(submittedUpdate).toBeDefined();
      expect(res.status).toBe('submitted');
      expect(triggers.notifyApprovalApproved).toHaveBeenCalled();
    });

    it('approves the final step, applies effects and notifies', async () => {
      const request = {
        id: 'r1',
        requestedBy: 'maker',
        status: 'submitted',
        companyId: 'c1',
        branchId: 'b1',
        entityType: 'sale_transaction', // not handled by applyDecisionEffects -> no extra db
        actionType: 'noop',
        entityId: 'x1',
        metaJson: { governance: { policySteps: [{ stepOrder: 1 }] } },
      };
      drizzle.queue([request]); // select request for update
      drizzle.queue([{ id: 's1', stepOrder: 1, status: 'pending' }]); // steps for update
      drizzle.queue([{ id: 's1' }]); // update step returning
      drizzle.queue([]); // update request
      drizzle.queue([]); // approvals audit insert
      // getApprovalRequest at end
      drizzle.queue([{ ...request, status: 'approved', requestedAt: new Date() }]);
      drizzle.queue([{ id: 's1', stepOrder: 1, status: 'approved' }]);

      const approver = { userId: 'checker', permissions: [], roles: [] };
      await service.decideCurrentStep('r1', 'approve', 'looks good', approver, ctx);
      expect(triggers.notifyApprovalApproved).toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'approve_step' }),
      );
    });

    it('rejects and notifies the requester', async () => {
      const request = {
        id: 'r1',
        requestedBy: 'maker',
        status: 'submitted',
        companyId: 'c1',
        branchId: 'b1',
        entityType: 'sale_transaction',
        actionType: 'noop',
        entityId: 'x1',
        metaJson: { governance: { policySteps: [{ stepOrder: 1 }] } },
      };
      drizzle.queue([request]);
      drizzle.queue([{ id: 's1', stepOrder: 1, status: 'pending' }]);
      drizzle.queue([{ id: 's1' }]); // update step returning
      drizzle.queue([]); // update request
      drizzle.queue([]); // audit insert
      drizzle.queue([{ ...request, status: 'rejected', requestedAt: new Date() }]);
      drizzle.queue([{ id: 's1', stepOrder: 1, status: 'rejected' }]);

      const approver = { userId: 'checker', permissions: [], roles: [] };
      await service.decideCurrentStep('r1', 'reject', 'no', approver, ctx);
      expect(triggers.notifyApprovalRejected).toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'reject_step' }),
      );
    });

    it('records petty cash spend when approving a petty cash expense', async () => {
      const request = submittedRequest({ entityId: 'expense1' });
      queueFinalStepDecision(request);
      drizzle.queue([
        {
          id: 'expense1',
          status: 'submitted',
          paymentMethod: 'petty_cash',
          amount: '25.50',
          companyId: 'c1',
          branchId: 'b1',
          category: 'Station supplies',
          entryNumber: 'EXP-001',
          vendor: 'Vendor Ltd',
        },
      ]);
      drizzle.queue([{ id: 'b1' }]);
      drizzle.queue([{ topup: '100.00', spend: '20.00' }]);
      drizzle.queue([{ id: 'ledger1' }]);
      drizzle.queue([]);
      queueApprovalReload(request, 'approved');

      await service.decideCurrentStep(
        'r1',
        'approve',
        'ok',
        { userId: 'checker', permissions: [], roles: [] },
        ctx,
      );

      const ledgerValues = drizzle.db.values.mock.calls.find(
        (call: any[]) => call[0]?.transactionType === 'spend',
      )?.[0];
      expect(ledgerValues).toEqual(expect.objectContaining({
        amount: '25.50',
        balanceAfter: '54.50',
      }));
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'petty_cash_ledger', action: 'spend' }),
        drizzle.db,
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'expense_entries', action: 'governance_approved' }),
        drizzle.db,
      );
    });

    it('rejects petty cash expense approval when amount is not positive', async () => {
      const request = submittedRequest({ entityId: 'expense1' });
      queueFinalStepDecision(request);
      drizzle.queue([
        {
          id: 'expense1',
          status: 'submitted',
          paymentMethod: 'petty_cash',
          amount: '0',
          companyId: 'c1',
          branchId: 'b1',
        },
      ]);

      await expect(
        service.decideCurrentStep(
          'r1',
          'approve',
          'ok',
          { userId: 'checker', permissions: [], roles: [] },
          ctx,
        ),
      ).rejects.toThrow('Expense amount must be greater than zero');
    });

    it('uses the default expense rejection reason when none is provided', async () => {
      const request = submittedRequest({ entityId: 'expense1' });
      queueFinalStepDecision(request);
      drizzle.queue([
        {
          id: 'expense1',
          status: 'submitted',
          paymentMethod: 'bank',
          amount: '10',
          companyId: 'c1',
          branchId: 'b1',
        },
      ]);
      drizzle.queue([]);
      queueApprovalReload(request, 'rejected');

      await service.decideCurrentStep(
        'r1',
        'reject',
        undefined,
        { userId: 'checker', permissions: [], roles: [] },
        ctx,
      );

      expect(drizzle.db.set).toHaveBeenCalledWith(
        expect.objectContaining({ rejectionReason: 'Rejected by governance workflow' }),
      );
    });

    it('restores a pending void sale when governance rejects the void', async () => {
      const request = submittedRequest({
        entityType: 'sale_transaction',
        actionType: 'void',
        entityId: 'sale1',
      });
      queueFinalStepDecision(request);
      drizzle.queue([]);
      queueApprovalReload(request, 'rejected');

      await service.decideCurrentStep(
        'r1',
        'reject',
        'void denied',
        { userId: 'checker', permissions: [], roles: [] },
        ctx,
      );

      expect(drizzle.db.set).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'completed' }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'sales_transactions', action: 'governance_void_rejected' }),
        drizzle.db,
      );
    });

    it('applies an approved stock adjustment using the pending adjustment row', async () => {
      const request = submittedRequest({
        entityType: 'stock_adjustment',
        actionType: 'approve',
        entityId: 'tank1',
        metaJson: {
          ...governanceMeta(),
          tankId: 'tank1',
          volumeDelta: '15.5',
        },
      });
      queueFinalStepDecision(request);
      drizzle.queue([{ id: 'adj1' }]);
      drizzle.queue({
        rows: [{ id: 'tank1', currentLevel: '10.000', capacity: '100.000', productId: 'prod1' }],
      });
      drizzle.queue([]);
      drizzle.queue([]);
      drizzle.queue([]);
      queueApprovalReload(request, 'approved');

      await service.decideCurrentStep(
        'r1',
        'approve',
        'count checked',
        { userId: 'checker', permissions: [], roles: [] },
        ctx,
      );

      const ledgerValues = drizzle.db.values.mock.calls.find(
        (call: any[]) => call[0]?.movementType === 'adjustment',
      )?.[0];
      expect(ledgerValues).toEqual(expect.objectContaining({
        referenceId: 'adj1',
        quantity: '15.500',
        productId: 'prod1',
      }));
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'adjustments', action: 'governance_approved_create' }),
        drizzle.db,
      );
    });

    it('audits rejected stock adjustments even when no pending adjustment row exists', async () => {
      const request = submittedRequest({
        entityType: 'stock_adjustment',
        actionType: 'approve',
        entityId: 'tank1',
      });
      queueFinalStepDecision(request);
      drizzle.queue([]);
      queueApprovalReload(request, 'rejected');

      await service.decideCurrentStep(
        'r1',
        'reject',
        'bad count',
        { userId: 'checker', permissions: [], roles: [] },
        ctx,
      );

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          entity: 'adjustments',
          entityId: 'tank1',
          action: 'governance_rejected',
        }),
        drizzle.db,
      );
    });

    it('closes a shift variance approval with valid readings and collections only', async () => {
      const request = submittedRequest({
        entityType: 'shift',
        actionType: 'close_variance',
        entityId: 'shift1',
        metaJson: {
          ...governanceMeta(),
          closingMeterReadings: [
            { nozzleId: 'n1', value: '10.5' },
            { nozzleId: '', value: 20 },
            'ignored',
          ],
          collections: [
            { paymentMethod: 'cash', amount: '50.25' },
            { paymentMethod: 'card', amount: 'not-a-number' },
          ],
          varianceReason: 'short cash',
          totalExpected: '100.50',
          totalCollected: '90.25',
          variance: '-10.25',
        },
      });
      queueFinalStepDecision(request);
      drizzle.queue([]);
      drizzle.queue([]);
      drizzle.queue([]);
      queueApprovalReload(request, 'approved');

      await service.decideCurrentStep(
        'r1',
        'approve',
        'accepted',
        { userId: 'checker', permissions: [], roles: [] },
        ctx,
      );

      expect(drizzle.db.values).toHaveBeenCalledWith(
        expect.objectContaining({ nozzleId: 'n1', value: '10.5' }),
      );
      expect(drizzle.db.values).toHaveBeenCalledWith(
        expect.objectContaining({ paymentMethod: 'cash', amount: '50.25' }),
      );
      expect(drizzle.db.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'closed',
          totalExpectedAmount: '100.50',
          totalCollectedAmount: '90.25',
          varianceAmount: '-10.25',
        }),
      );
    });

    it('reopens a shift when variance approval is rejected', async () => {
      const request = submittedRequest({
        entityType: 'shift',
        actionType: 'close_variance',
        entityId: 'shift1',
      });
      queueFinalStepDecision(request);
      drizzle.queue([]);
      queueApprovalReload(request, 'rejected');

      await service.decideCurrentStep(
        'r1',
        'reject',
        'missing cash',
        { userId: 'checker', permissions: [], roles: [] },
        ctx,
      );

      expect(drizzle.db.set).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'open', submittedForApprovalAt: null }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'shifts', action: 'governance_close_rejected' }),
        drizzle.db,
      );
    });

    it('logs and continues when decision notification fails', async () => {
      const request = submittedRequest({ entityType: 'sale_transaction', actionType: 'noop' });
      queueFinalStepDecision(request);
      queueApprovalReload(request, 'approved');
      triggers.notifyApprovalApproved.mockRejectedValueOnce(new Error('notify failed'));
      const loggerSpy = jest.spyOn((service as any).logger, 'error').mockImplementation();

      const approver = { userId: 'checker', permissions: [], roles: [] };
      await service.decideCurrentStep('r1', 'approve', 'ok', approver, ctx);

      expect(loggerSpy).toHaveBeenCalledWith(
        'Failed to send approval decision notification:',
        expect.any(Error),
      );
      loggerSpy.mockRestore();
    });

    it('is idempotent when request already in the final decision status', async () => {
      const request = { id: 'r1', requestedBy: 'maker', status: 'approved', companyId: 'c1', requestedAt: new Date(), metaJson: {} };
      drizzle.queue([request]); // select for update -> already approved
      drizzle.queue([request]); // getApprovalRequest
      drizzle.queue([]); // steps
      const approver = { userId: 'checker', permissions: [], roles: [] };
      const res = await service.decideCurrentStep('r1', 'approve', undefined, approver, ctx);
      expect(res.id).toBe('r1');
      expect(audit.log).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'approve_step' }));
    });

    it('approve and reject wrappers delegate to decideCurrentStep', async () => {
      const spy = jest
        .spyOn(service, 'decideCurrentStep')
        .mockResolvedValue({ id: 'r1' } as any);

      await expect(service.approve('r1', { reason: 'ok' } as any, actor, ctx)).resolves.toEqual({ id: 'r1' });
      await expect(service.reject('r2', { reason: 'no' } as any, actor, ctx)).resolves.toEqual({ id: 'r1' });

      expect(spy).toHaveBeenNthCalledWith(1, 'r1', 'approve', 'ok', actor, ctx);
      expect(spy).toHaveBeenNthCalledWith(2, 'r2', 'reject', 'no', actor, ctx);
      spy.mockRestore();
    });
  });

  describe('cancel', () => {
    it('throws NotFoundException when the request is missing', async () => {
      drizzle.queue([]);

      await expect(
        service.cancel('missing', { reason: 'x' } as any, actor, ctx),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws when actor is not the requester', async () => {
      drizzle.queue([{ id: 'r1', requestedBy: 'other', status: 'draft' }]);
      await expect(
        service.cancel('r1', { reason: 'x' } as any, actor, ctx),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ConflictException for a non-cancellable status', async () => {
      drizzle.queue([{ id: 'r1', requestedBy: 'u1', status: 'approved' }]);
      await expect(
        service.cancel('r1', { reason: 'x' } as any, actor, ctx),
      ).rejects.toThrow(ConflictException);
    });

    it('cancels a draft and audits', async () => {
      const request = { id: 'r1', requestedBy: 'u1', status: 'draft', companyId: 'c1', requestedAt: new Date(), metaJson: {} };
      drizzle.queue([request]); // initial select
      // transaction: update request, update steps, insert audit
      drizzle.queue([]);
      drizzle.queue([]);
      drizzle.queue([]);
      // getApprovalRequest
      drizzle.queue([{ ...request, status: 'cancelled' }]);
      drizzle.queue([]);
      const res = await service.cancel('r1', { reason: 'changed mind' } as any, actor, ctx);
      expect(res.id).toBe('r1');
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'cancel' }));
    });

    it('cancels a submitted request and skips pending steps', async () => {
      const request = { id: 'r1', requestedBy: 'u1', status: 'submitted', companyId: 'c1', requestedAt: new Date(), metaJson: {} };
      drizzle.queue([request]);
      drizzle.queue([]);
      drizzle.queue([]);
      drizzle.queue([]);
      drizzle.queue([{ ...request, status: 'cancelled' }]);
      drizzle.queue([{ id: 's1', stepOrder: 1, status: 'skipped' }]);

      const res = await service.cancel('r1', { reason: 'cancel submitted' } as any, actor, ctx);

      expect(res.status).toBe('cancelled');
      expect(drizzle.db.set).toHaveBeenCalledWith(expect.objectContaining({ status: 'skipped' }));
    });
  });

  describe('evaluatePolicy', () => {
    it('returns null when governance disabled', async () => {
      config.get.mockImplementation((k: string) =>
        k === 'GOVERNANCE_ENABLED' ? false : undefined,
      );
      const res = await service.evaluatePolicy({
        entityType: 'e',
        actionType: 'a',
        companyId: 'c1',
        branchId: 'b1',
      });
      expect(res).toBeNull();
    });

    it('delegates to the evaluator with fetched policy rows', async () => {
      drizzle.queue([{ id: 'p1', isEnabled: true }]); // policy rows
      evaluator.evaluate.mockReturnValueOnce({ id: 'p1' });
      const res = await service.evaluatePolicy({
        entityType: 'e',
        actionType: 'a',
        companyId: 'c1',
        branchId: 'b1',
      });
      expect(res).toEqual({ id: 'p1' });
      expect(evaluator.evaluate).toHaveBeenCalled();
    });
  });

  describe('checkExpiredApprovals (SLA deadline cron)', () => {
    it('does nothing when governance is disabled', async () => {
      config.get.mockImplementation((k: string, fb?: any) =>
        k === 'GOVERNANCE_ENABLED' ? false : fb,
      );
      await service.checkExpiredApprovals();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('returns early when there are no expired requests', async () => {
      drizzle.queue([]); // expired select
      await service.checkExpiredApprovals();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('auto-rejects each expired request and notifies the requester', async () => {
      const expired = {
        id: 'r1',
        requestedBy: 'maker',
        companyId: 'c1',
        branchId: 'b1',
        entityType: 'sale_transaction',
        actionType: 'noop',
        entityId: 'x1',
      };
      drizzle.queue([expired]); // expired select
      // rejectExpiredRequest transaction: update request, update steps, insert audit
      drizzle.queue([]);
      drizzle.queue([]);
      drizzle.queue([]);
      await service.checkExpiredApprovals();
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'deadline_auto_reject' }),
      );
      expect(triggers.notifyApprovalRejected).toHaveBeenCalled();
    });

    it('logs top-level query failures without throwing', async () => {
      drizzle.queue(Promise.reject(new Error('select failed')));
      const loggerSpy = jest.spyOn((service as any).logger, 'error').mockImplementation();

      await service.checkExpiredApprovals();

      expect(loggerSpy).toHaveBeenCalledWith(
        'Error during expired approvals check:',
        expect.any(Error),
      );
      loggerSpy.mockRestore();
    });

    it('continues when one expired request fails during auto-rejection', async () => {
      const expired = {
        id: 'r1',
        requestedBy: 'maker',
        companyId: 'c1',
        branchId: 'b1',
        entityType: 'expense_entry',
        actionType: 'approve',
        entityId: 'e1',
      };
      drizzle.queue([expired]);
      drizzle.queue(Promise.reject(new Error('tx failed')));
      const loggerSpy = jest.spyOn((service as any).logger, 'error').mockImplementation();

      await service.checkExpiredApprovals();

      expect(loggerSpy).toHaveBeenCalledWith(
        'Failed to auto-reject expired approval request r1:',
        expect.any(Error),
      );
      loggerSpy.mockRestore();
    });
  });

  describe('initiateControlledActionRequest', () => {
    it('returns null when governance is disabled', async () => {
      config.get.mockImplementation((k: string) =>
        k === 'GOVERNANCE_ENABLED' ? false : undefined,
      );
      const res = await service.initiateControlledActionRequest(
        { companyId: 'c1', branchId: 'b1', entityType: 'e', entityId: 'x', actionType: 'a' } as any,
        actor,
        ctx,
      );
      expect(res).toBeNull();
    });

    it('returns null when no policy matches and no existing request', async () => {
      drizzle.queue([]); // existing request select
      drizzle.queue([]); // evaluatePolicy rows
      evaluator.evaluate.mockReturnValueOnce(null);
      const res = await service.initiateControlledActionRequest(
        { companyId: 'c1', branchId: 'b1', entityType: 'e', entityId: 'x', actionType: 'a' } as any,
        actor,
        ctx,
      );
      expect(res).toBeNull();
    });

    it('returns the existing request view when one is already pending for another user', async () => {
      drizzle.queue([{ id: 'r1', status: 'submitted', requestedBy: 'other' }]); // existing
      drizzle.queue([{ id: 'r1', requestedBy: 'other', requestedAt: new Date(), metaJson: {} }]); // getApprovalRequest
      drizzle.queue([]); // steps
      const res = await service.initiateControlledActionRequest(
        { companyId: 'c1', branchId: 'b1', entityType: 'e', entityId: 'x', actionType: 'a' } as any,
        actor,
        ctx,
      );
      expect((res as any).id).toBe('r1');
    });

    it('submits an existing draft owned by the actor', async () => {
      const request = {
        id: 'r1',
        status: 'draft',
        requestedBy: 'u1',
        companyId: 'c1',
        branchId: 'b1',
        entityType: 'expense_entry',
        entityId: 'e1',
        actionType: 'approve',
        requestedAt: new Date(),
        metaJson: { amount: 50 },
      };
      drizzle.queue([{ id: 'r1', status: 'draft', requestedBy: 'u1' }]);
      drizzle.queue([request]);
      drizzle.queue([]);
      evaluator.evaluate.mockReturnValueOnce({
        id: 'p1',
        approvalStepsJson: [{ stepOrder: 1 }],
      });
      drizzle.queue([]);
      drizzle.queue([]);
      drizzle.queue([]);
      drizzle.queue([{ ...request, status: 'submitted' }]);
      drizzle.queue([{ id: 's1', stepOrder: 1, status: 'pending' }]);

      const res = await service.initiateControlledActionRequest(
        { companyId: 'c1', branchId: 'b1', entityType: 'expense_entry', entityId: 'e1', actionType: 'approve' } as any,
        actor,
        ctx,
      );

      expect((res as any).status).toBe('submitted');
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'submit' }));
    });

    it('creates and submits a new request when a policy applies', async () => {
      const payload = {
        companyId: 'c1',
        branchId: 'b1',
        entityType: 'expense_entry',
        entityId: 'e1',
        actionType: 'approve',
        amount: 25,
      };
      const draft = {
        id: 'r1',
        requestedBy: 'u1',
        status: 'draft',
        requestedAt: new Date(),
        ...payload,
        metaJson: { amount: 25 },
      };
      const policy = { id: 'p1', approvalStepsJson: [{ stepOrder: 1 }] };
      drizzle.queue([]);
      drizzle.queue([]);
      evaluator.evaluate
        .mockReturnValueOnce(policy)
        .mockReturnValueOnce(policy);
      drizzle.queue([draft]);
      drizzle.queue([]);
      drizzle.queue([draft]);
      drizzle.queue([]);
      drizzle.queue([]);
      drizzle.queue([]);
      drizzle.queue([]);
      drizzle.queue([{ ...draft, status: 'submitted' }]);
      drizzle.queue([{ id: 's1', stepOrder: 1, status: 'pending' }]);

      const res = await service.initiateControlledActionRequest(payload as any, actor, ctx);

      expect((res as any).status).toBe('submitted');
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'create_draft' }));
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'submit' }));
    });
  });
});
