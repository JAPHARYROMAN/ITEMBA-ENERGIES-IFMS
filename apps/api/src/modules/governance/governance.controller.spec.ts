import { GovernanceController } from './governance.controller';
import type { GovernanceService } from './governance.service';

describe('GovernanceController', () => {
  let governance: jest.Mocked<
    Pick<
      GovernanceService,
      | 'listPolicies'
      | 'createPolicy'
      | 'updatePolicy'
      | 'listApprovals'
      | 'getApprovalByIdForActor'
      | 'createApproval'
      | 'submitApproval'
      | 'approve'
      | 'reject'
      | 'cancel'
    >
  >;
  let controller: GovernanceController;

  const user = { sub: 'user-1', permissions: ['setup:write', 'shifts:approve'] } as any;
  const req = { ip: '127.0.0.1', headers: { 'user-agent': 'jest' } } as any;

  beforeEach(() => {
    governance = {
      listPolicies: jest.fn(),
      createPolicy: jest.fn(),
      updatePolicy: jest.fn(),
      listApprovals: jest.fn(),
      getApprovalByIdForActor: jest.fn(),
      createApproval: jest.fn(),
      submitApproval: jest.fn(),
      approve: jest.fn(),
      reject: jest.fn(),
      cancel: jest.fn(),
    };
    controller = new GovernanceController(governance as unknown as GovernanceService);
  });

  it('lists policies and approvals with query and actor context', () => {
    governance.listPolicies.mockReturnValue([{ id: 'policy-1' }] as any);
    governance.listApprovals.mockReturnValue([{ id: 'approval-1' }] as any);
    governance.getApprovalByIdForActor.mockReturnValue({ id: 'approval-1' } as any);

    expect(controller.listPolicies({ companyId: 'company-1' } as any)).toEqual([{ id: 'policy-1' }]);
    expect(controller.listApprovals({ status: 'submitted' } as any, user)).toEqual([{ id: 'approval-1' }]);
    expect(controller.getRequest('approval-1', user)).toEqual({ id: 'approval-1' });

    expect(governance.listPolicies).toHaveBeenCalledWith({ companyId: 'company-1' });
    expect(governance.listApprovals).toHaveBeenCalledWith(
      { status: 'submitted' },
      { userId: 'user-1', permissions: user.permissions },
    );
    expect(governance.getApprovalByIdForActor).toHaveBeenCalledWith(
      'approval-1',
      { userId: 'user-1', permissions: user.permissions },
    );
  });

  it('creates and updates policies with audit context', () => {
    governance.createPolicy.mockReturnValue({ id: 'policy-1' } as any);
    governance.updatePolicy.mockReturnValue({ id: 'policy-1', isEnabled: false } as any);

    expect(controller.createPolicy({ entityType: 'expense' } as any, user, req)).toEqual({ id: 'policy-1' });
    expect(controller.updatePolicy('policy-1', { isEnabled: false } as any, user, req)).toEqual({
      id: 'policy-1',
      isEnabled: false,
    });

    const actor = { userId: 'user-1', permissions: user.permissions };
    const audit = { ip: '127.0.0.1', userAgent: 'jest' };
    expect(governance.createPolicy).toHaveBeenCalledWith({ entityType: 'expense' }, actor, audit);
    expect(governance.updatePolicy).toHaveBeenCalledWith('policy-1', { isEnabled: false }, actor, audit);
  });

  it('creates, submits, decides, and cancels approvals with actor and audit context', () => {
    governance.createApproval.mockReturnValue({ id: 'approval-1' } as any);
    governance.submitApproval.mockReturnValue({ id: 'approval-1', status: 'submitted' } as any);
    governance.approve.mockReturnValue({ id: 'approval-1', status: 'approved' } as any);
    governance.reject.mockReturnValue({ id: 'approval-2', status: 'rejected' } as any);
    governance.cancel.mockReturnValue({ id: 'approval-3', status: 'cancelled' } as any);

    expect(controller.createApproval({ entityType: 'shift' } as any, user, req)).toEqual({ id: 'approval-1' });
    expect(controller.submitApproval('approval-1', user, req)).toEqual({ id: 'approval-1', status: 'submitted' });
    expect(controller.approve('approval-1', { reason: 'ok' }, user, req)).toEqual({
      id: 'approval-1',
      status: 'approved',
    });
    expect(controller.reject('approval-2', { reason: 'bad' }, user, req)).toEqual({
      id: 'approval-2',
      status: 'rejected',
    });
    expect(controller.cancel('approval-3', { reason: 'duplicate' }, user, req)).toEqual({
      id: 'approval-3',
      status: 'cancelled',
    });

    const actor = { userId: 'user-1', permissions: user.permissions };
    const audit = { ip: '127.0.0.1', userAgent: 'jest' };
    expect(governance.createApproval).toHaveBeenCalledWith({ entityType: 'shift' }, actor, audit);
    expect(governance.submitApproval).toHaveBeenCalledWith('approval-1', actor, audit);
    expect(governance.approve).toHaveBeenCalledWith('approval-1', { reason: 'ok' }, actor, audit);
    expect(governance.reject).toHaveBeenCalledWith('approval-2', { reason: 'bad' }, actor, audit);
    expect(governance.cancel).toHaveBeenCalledWith('approval-3', { reason: 'duplicate' }, actor, audit);
  });
});
