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

    it('throws ConflictException when no policy matches', async () => {
      drizzle.queue([
        { id: 'r1', requestedBy: 'u1', status: 'draft', entityType: 'e', actionType: 'a', companyId: 'c1', branchId: 'b1', metaJson: {} },
      ]); // select for update
      evaluator.evaluate.mockReturnValueOnce(null);
      drizzle.queue([]); // policy rows for evaluatePolicyWithClient select
      await expect(service.submitApproval('r1', actor, ctx)).rejects.toThrow(ConflictException);
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
  });

  describe('cancel', () => {
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
  });
});
