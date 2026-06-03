import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('./client', () => ({ apiFetch: vi.fn() }));

import { apiFetch } from './client';
import { apiGovernance } from './governance';

const apiFetchMock = vi.mocked(apiFetch);

beforeEach(() => {
  apiFetchMock.mockReset();
  apiFetchMock.mockResolvedValue({} as never);
});

describe('apiGovernance approvals', () => {
  test('listApprovals with no filters hits the bare path', async () => {
    await apiGovernance.listApprovals();
    expect(apiFetchMock).toHaveBeenCalledWith('governance/approvals');
  });

  test('listApprovals serializes only provided filters', async () => {
    await apiGovernance.listApprovals({ companyId: 'c1', status: 'submitted' });
    expect(apiFetchMock).toHaveBeenCalledWith('governance/approvals?companyId=c1&status=submitted');
  });

  test('getApproval GETs by id', async () => {
    await apiGovernance.getApproval('a1');
    expect(apiFetchMock).toHaveBeenCalledWith('governance/approvals/a1');
  });

  test('approve POSTs reason', async () => {
    await apiGovernance.approve('a1', 'looks good');
    expect(apiFetchMock).toHaveBeenCalledWith('governance/approvals/a1/approve', {
      method: 'POST',
      body: { reason: 'looks good' },
    });
  });

  test('reject POSTs reason', async () => {
    await apiGovernance.reject('a1', 'no');
    expect(apiFetchMock).toHaveBeenCalledWith('governance/approvals/a1/reject', {
      method: 'POST',
      body: { reason: 'no' },
    });
  });

  test('cancel POSTs reason', async () => {
    await apiGovernance.cancel('a1');
    expect(apiFetchMock).toHaveBeenCalledWith('governance/approvals/a1/cancel', {
      method: 'POST',
      body: { reason: undefined },
    });
  });

  test('submit POSTs an empty body', async () => {
    await apiGovernance.submit('a1');
    expect(apiFetchMock).toHaveBeenCalledWith('governance/approvals/a1/submit', {
      method: 'POST',
      body: {},
    });
  });
});

describe('apiGovernance policies', () => {
  test('listPolicies serializes filters', async () => {
    await apiGovernance.listPolicies({ companyId: 'c1', entityType: 'shift' });
    expect(apiFetchMock).toHaveBeenCalledWith('governance/policies?companyId=c1&entityType=shift');
  });

  test('createPolicy POSTs the full payload', async () => {
    const payload = {
      companyId: 'c1',
      entityType: 'shift',
      actionType: 'approve',
      approvalSteps: [{ stepOrder: 1, requiredRole: 'manager' }],
    };
    await apiGovernance.createPolicy(payload);
    expect(apiFetchMock).toHaveBeenCalledWith('governance/policies', { method: 'POST', body: payload });
  });

  test('updatePolicy PATCHes policies/:id', async () => {
    await apiGovernance.updatePolicy('p1', { isEnabled: false });
    expect(apiFetchMock).toHaveBeenCalledWith('governance/policies/p1', {
      method: 'PATCH',
      body: { isEnabled: false },
    });
  });
});
