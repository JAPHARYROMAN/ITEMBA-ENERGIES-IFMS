import { apiFetch } from './client';

export type ApprovalStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'cancelled';

export interface GovernanceApprovalStep {
  id: string;
  approvalRequestId: string;
  stepOrder: number;
  requiredRole: string | null;
  requiredPermission: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'skipped';
  decidedBy: string | null;
  decidedAt: string | null;
  decisionReason: string | null;
  dueAt?: string | null;
  isOverdue?: boolean;
}

export interface GovernanceApprovalRequest {
  id: string;
  companyId: string;
  branchId: string;
  entityType: string;
  entityId: string;
  actionType: string;
  status: ApprovalStatus;
  requestedBy: string;
  requestedAt: string;
  reason?: string | null;
  metaJson?: Record<string, unknown> | null;
  steps?: GovernanceApprovalStep[];
}

export interface GovernancePolicyStep {
  stepOrder: number;
  requiredRole?: string;
  requiredPermission?: string;
  dueHours?: number;
  allowSelfApproval?: boolean;
}

export interface GovernancePolicy {
  id: string;
  companyId: string;
  branchId: string | null;
  entityType: string;
  actionType: string;
  thresholdAmount: string | null;
  thresholdPct: string | null;
  approvalStepsJson: GovernancePolicyStep[];
  isEnabled: boolean;
}

function withQuery(path: string, params?: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v) search.set(k, v);
    });
  }
  const q = search.toString();
  return q ? `${path}?${q}` : path;
}

export const apiGovernance = {
  listApprovals: (filters?: {
    companyId?: string;
    branchId?: string;
    entityType?: string;
    actionType?: string;
    status?: ApprovalStatus;
  }) =>
    apiFetch<GovernanceApprovalRequest[]>(
      withQuery('governance/approvals', {
        companyId: filters?.companyId,
        branchId: filters?.branchId,
        entityType: filters?.entityType,
        actionType: filters?.actionType,
        status: filters?.status,
      }),
    ),
  getApproval: (id: string) => apiFetch<GovernanceApprovalRequest>(`governance/approvals/${id}`),
  approve: (id: string, reason?: string) =>
    apiFetch<GovernanceApprovalRequest>(`governance/approvals/${id}/approve`, {
      method: 'POST',
      body: { reason },
    }),
  reject: (id: string, reason?: string) =>
    apiFetch<GovernanceApprovalRequest>(`governance/approvals/${id}/reject`, {
      method: 'POST',
      body: { reason },
    }),
  cancel: (id: string, reason?: string) =>
    apiFetch<GovernanceApprovalRequest>(`governance/approvals/${id}/cancel`, {
      method: 'POST',
      body: { reason },
    }),
  submit: (id: string) =>
    apiFetch<GovernanceApprovalRequest>(`governance/approvals/${id}/submit`, {
      method: 'POST',
      body: {},
    }),

  listPolicies: (filters?: {
    companyId?: string;
    branchId?: string;
    entityType?: string;
    actionType?: string;
  }) =>
    apiFetch<GovernancePolicy[]>(
      withQuery('governance/policies', {
        companyId: filters?.companyId,
        branchId: filters?.branchId,
        entityType: filters?.entityType,
        actionType: filters?.actionType,
      }),
    ),
  createPolicy: (payload: {
    companyId: string;
    branchId?: string;
    entityType: string;
    actionType: string;
    thresholdAmount?: number;
    thresholdPct?: number;
    approvalSteps: GovernancePolicyStep[];
    isEnabled?: boolean;
  }) =>
    apiFetch<GovernancePolicy>('governance/policies', {
      method: 'POST',
      body: payload,
    }),
  updatePolicy: (
    id: string,
    payload: Partial<{
      companyId: string;
      branchId?: string;
      entityType: string;
      actionType: string;
      thresholdAmount?: number;
      thresholdPct?: number;
      approvalSteps: GovernancePolicyStep[];
      isEnabled?: boolean;
    }>,
  ) =>
    apiFetch<GovernancePolicy>(`governance/policies/${id}`, {
      method: 'PATCH',
      body: payload,
    }),
};
