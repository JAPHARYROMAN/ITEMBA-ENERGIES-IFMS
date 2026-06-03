import React from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import PageHeader from '../ifms/PageHeader';
import FilterBar from '../ifms/FilterBar';
import { IFMSDataTable } from '../ifms/DataTable';
import DetailsDrawer from '../ifms/DetailsDrawer';
import { TableSkeleton } from '../ifms/Skeletons';
import { hasAnyPermission, useAppStore, useAuthStore } from '../../store';
import {
  apiGovernance,
  type GovernanceApprovalRequest,
  type GovernancePolicyStep,
} from '../../lib/api/governance';
import { AlertCircle, CheckCircle2, Send } from 'lucide-react';
import { ExportButton } from '../ifms/ExportButton';
import { permissionGroups } from '../../lib/permissions';

function getErrorMessage(err: unknown, fallback: string): string {
  const e = err as { apiError?: { message?: string }; message?: string } | undefined;
  return e?.apiError?.message ?? e?.message ?? fallback;
}

function readPolicySteps(
  metaJson: Record<string, unknown> | null | undefined,
): GovernancePolicyStep[] {
  if (!metaJson || typeof metaJson !== 'object') return [];
  const governance = (metaJson as { governance?: unknown }).governance;
  if (!governance || typeof governance !== 'object') return [];
  const policySteps = (governance as { policySteps?: unknown }).policySteps;
  return Array.isArray(policySteps) ? (policySteps as GovernancePolicyStep[]) : [];
}

function getCurrentStepLabel(row: GovernanceApprovalRequest): string {
  if (row.status === 'approved' || row.status === 'rejected' || row.status === 'cancelled')
    return 'Finalized';
  const steps = readPolicySteps(row.metaJson);
  if (!steps.length) return '-';
  const minStep = steps.map((s) => s.stepOrder).sort((a, b) => a - b)[0];
  return `Step ${minStep}/${steps.length}`;
}

function isOverdueFromRow(row: GovernanceApprovalRequest): boolean {
  if (row.status !== 'submitted') return false;
  const steps = readPolicySteps(row.metaJson);
  if (!steps.length) return false;
  const firstStep = [...steps].sort((a, b) => a.stepOrder - b.stepOrder)[0];
  if (!firstStep?.dueHours || firstStep.dueHours <= 0) return false;
  const due = new Date(new Date(row.requestedAt).getTime() + firstStep.dueHours * 3600_000);
  return due.getTime() < Date.now();
}

const statusClass = (status: string) => {
  if (status === 'approved') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  if (status === 'rejected') return 'bg-rose-100 text-rose-700 border-rose-200';
  if (status === 'submitted') return 'bg-amber-100 text-amber-700 border-amber-200';
  if (status === 'cancelled') return 'bg-slate-200 text-slate-700 border-slate-300';
  return 'bg-blue-100 text-blue-700 border-blue-200';
};

const GovernanceApprovalsPage: React.FC = () => {
  const { t } = useTranslation();
  const { addToast } = useAppStore();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [search, setSearch] = React.useState('');
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [decisionReason, setDecisionReason] = React.useState('');

  const canAct = hasAnyPermission(user, permissionGroups.governanceAct);
  const canSubmitOwn = hasAnyPermission(user, permissionGroups.governanceSubmit);

  const approvalsQuery = useQuery({
    queryKey: ['governance-approvals'],
    queryFn: () => apiGovernance.listApprovals(),
  });

  const detailQuery = useQuery({
    queryKey: ['governance-approval-detail', selectedId],
    queryFn: () => apiGovernance.getApproval(selectedId as string),
    enabled: !!selectedId,
  });

  const approveMutation = useMutation({
    mutationFn: () => apiGovernance.approve(selectedId as string, decisionReason || undefined),
    onSuccess: () => {
      addToast(t('governance.approved', { defaultValue: 'Approval step approved' }), 'success');
      queryClient.invalidateQueries({ queryKey: ['governance-approvals'] });
      queryClient.invalidateQueries({ queryKey: ['governance-approval-detail', selectedId] });
      setDecisionReason('');
    },
    onError: (err: unknown) =>
      addToast(getErrorMessage(err, 'Failed to approve request'), 'error'),
  });

  const rejectMutation = useMutation({
    mutationFn: () => apiGovernance.reject(selectedId as string, decisionReason || undefined),
    onSuccess: () => {
      addToast(t('governance.rejected', { defaultValue: 'Approval step rejected' }), 'info');
      queryClient.invalidateQueries({ queryKey: ['governance-approvals'] });
      queryClient.invalidateQueries({ queryKey: ['governance-approval-detail', selectedId] });
      setDecisionReason('');
    },
    onError: (err: unknown) =>
      addToast(getErrorMessage(err, 'Failed to reject request'), 'error'),
  });

  const submitMutation = useMutation({
    mutationFn: () => apiGovernance.submit(selectedId as string),
    onSuccess: () => {
      addToast(
        t('governance.submitted', { defaultValue: 'Draft submitted into governance workflow' }),
        'success',
      );
      queryClient.invalidateQueries({ queryKey: ['governance-approvals'] });
      queryClient.invalidateQueries({ queryKey: ['governance-approval-detail', selectedId] });
    },
    onError: (err: unknown) =>
      addToast(getErrorMessage(err, 'Failed to submit request'), 'error'),
  });

  const filtered = React.useMemo(() => {
    const rows = approvalsQuery.data ?? [];
    if (!search) return rows;
    const q = search.toLowerCase();
    return rows.filter((r) =>
      [r.status, r.entityType, r.actionType, r.branchId, r.requestedBy, r.id].some((v) =>
        String(v ?? '')
          .toLowerCase()
          .includes(q),
      ),
    );
  }, [approvalsQuery.data, search]);

  const selected = detailQuery.data;
  const selectedPendingStep = selected?.steps?.find((s) => s.status === 'pending');

  const timeline = React.useMemo(() => {
    if (!selected)
      return [] as Array<{
        key: string;
        title: string;
        time?: string;
        tone: 'neutral' | 'success' | 'warning' | 'danger';
      }>;
    const items: Array<{
      key: string;
      title: string;
      time?: string;
      tone: 'neutral' | 'success' | 'warning' | 'danger';
    }> = [
      {
        key: 'requested',
        title: `Request created by ${selected.requestedBy}`,
        time: selected.requestedAt,
        tone: 'neutral',
      },
    ];

    (selected.steps ?? []).forEach((step) => {
      if (step.status === 'pending') {
        items.push({
          key: `step-${step.id}-pending`,
          title: `Step ${step.stepOrder} pending (${step.requiredPermission ?? 'no permission gate'})`,
          time: step.dueAt ?? undefined,
          tone: step.isOverdue ? 'danger' : 'warning',
        });
      }
      if (step.status === 'approved') {
        items.push({
          key: `step-${step.id}-approved`,
          title: `Step ${step.stepOrder} approved by ${step.decidedBy ?? 'unknown'}`,
          time: step.decidedAt ?? undefined,
          tone: 'success',
        });
      }
      if (step.status === 'rejected') {
        items.push({
          key: `step-${step.id}-rejected`,
          title: `Step ${step.stepOrder} rejected by ${step.decidedBy ?? 'unknown'}`,
          time: step.decidedAt ?? undefined,
          tone: 'danger',
        });
      }
    });

    return items;
  }, [selected]);

  const exportParams = React.useMemo(() => {
    const columns = [
      { header: 'ID', accessorKey: 'id' },
      { header: 'Status', accessorKey: 'status' },
      { header: 'Entity Type', accessorKey: 'entityType' },
      { header: 'Action Type', accessorKey: 'actionType' },
      { header: 'Branch', accessorKey: 'branchId' },
      { header: 'Requested By', accessorKey: 'requestedBy' },
      { header: 'Requested At', accessorKey: 'requestedAt' },
      { header: 'Current Step', accessorKey: 'currentStep' },
      { header: 'Overdue', accessorKey: 'overdue' },
    ];

    const rows = filtered.map((r) => ({
      id: r.id,
      status: r.status,
      entityType: r.entityType,
      actionType: r.actionType,
      branchId: r.branchId,
      requestedBy: r.requestedBy,
      requestedAt: new Date(r.requestedAt).toISOString(),
      currentStep: getCurrentStepLabel(r),
      overdue: isOverdueFromRow(r) ? 'yes' : 'no',
    }));

    return {
      title: 'Governance Approvals Export',
      columns,
      rows,
    };
  }, [filtered]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <PageHeader
        title={t('pages.governanceTitle')}
        description={t('pages.governanceDesc')}
        actions={
          <ExportButton exportType="tables.any" params={exportParams} label={t('common.export')} />
        }
      />

      <FilterBar onSearch={setSearch} showDate={false} />

      {approvalsQuery.isLoading ? (
        <div className="bg-card border border-border rounded-xl p-8">
          <TableSkeleton />
        </div>
      ) : (
        <IFMSDataTable
          data={filtered}
          onRowClick={(row: GovernanceApprovalRequest) => setSelectedId(row.id)}
          columns={[
            {
              header: 'Status',
              accessorKey: 'status',
              cell: (r: GovernanceApprovalRequest) => (
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-black uppercase border ${statusClass(r.status)}`}
                >
                  {r.status}
                </span>
              ),
            },
            { header: 'Entity', accessorKey: 'entityType' },
            { header: 'Action', accessorKey: 'actionType' },
            { header: 'Branch', accessorKey: 'branchId' },
            { header: 'Requested By', accessorKey: 'requestedBy' },
            {
              header: 'Requested At',
              accessorKey: 'requestedAt',
              cell: (r: GovernanceApprovalRequest) => new Date(r.requestedAt).toLocaleString(),
            },
            {
              header: 'Current Step',
              accessorKey: 'currentStep',
              cell: (r: GovernanceApprovalRequest) => (
                <span className="text-xs font-black">{getCurrentStepLabel(r)}</span>
              ),
            },
            {
              header: 'Overdue',
              accessorKey: 'overdue',
              cell: (r: GovernanceApprovalRequest) =>
                isOverdueFromRow(r) ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black uppercase bg-rose-100 text-rose-700 border border-rose-200">
                    <AlertCircle size={10} /> Overdue
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black uppercase bg-emerald-100 text-emerald-700 border border-emerald-200">
                    <CheckCircle2 size={10} /> On Time
                  </span>
                ),
            },
          ]}
        />
      )}

      <DetailsDrawer
        isOpen={!!selectedId}
        onClose={() => {
          setSelectedId(null);
          setDecisionReason('');
        }}
        title="Approval Request"
        subtitle={
          selected
            ? `${selected.entityType} • ${selected.actionType} • ${selected.id}`
            : 'Loading...'
        }
        variant="large"
      >
        <div className="p-8 space-y-8">
          {detailQuery.isLoading ? (
            <TableSkeleton />
          ) : !selected ? (
            <div className="text-sm text-muted-foreground">Unable to load approval request.</div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-muted/20 rounded-xl border border-border">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Status
                  </p>
                  <p className="text-sm font-black mt-1">{selected.status}</p>
                </div>
                <div className="p-4 bg-muted/20 rounded-xl border border-border">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Requested By
                  </p>
                  <p className="text-sm font-black mt-1">{selected.requestedBy}</p>
                </div>
                <div className="p-4 bg-muted/20 rounded-xl border border-border">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Requested At
                  </p>
                  <p className="text-sm font-black mt-1">
                    {new Date(selected.requestedAt).toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-xs font-black uppercase tracking-[0.2em] text-primary border-b border-border pb-2">
                  Timeline
                </h4>
                <div className="space-y-3">
                  {timeline.map((item) => (
                    <div
                      key={item.key}
                      className="flex items-start gap-3 p-3 bg-card border border-border rounded-xl"
                    >
                      <div
                        className={`mt-1 w-2 h-2 rounded-full ${item.tone === 'success' ? 'bg-emerald-500' : item.tone === 'warning' ? 'bg-amber-500' : item.tone === 'danger' ? 'bg-rose-500' : 'bg-primary'}`}
                      />
                      <div className="flex-1">
                        <p className="text-sm font-bold">{item.title}</p>
                        {item.time && (
                          <p className="text-[11px] text-muted-foreground">
                            {new Date(item.time).toLocaleString()}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-xs font-black uppercase tracking-[0.2em] text-primary border-b border-border pb-2">
                  Steps
                </h4>
                <div className="space-y-3">
                  {(selected.steps ?? []).map((step) => (
                    <div key={step.id} className="p-4 bg-muted/20 border border-border rounded-xl">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-black">Step {step.stepOrder}</p>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-black uppercase border ${statusClass(step.status)}`}
                        >
                          {step.status}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-2">
                        Permission: {step.requiredPermission ?? 'n/a'} | Role:{' '}
                        {step.requiredRole ?? 'n/a'}
                      </p>
                      {(step.isOverdue || step.dueAt) && (
                        <p className="text-[11px] text-muted-foreground mt-1">
                          Due: {step.dueAt ? new Date(step.dueAt).toLocaleString() : 'n/a'}{' '}
                          {step.isOverdue ? ' (overdue)' : ''}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {selected.reason && (
                <div className="p-4 bg-muted/20 border border-border rounded-xl">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Request Reason
                  </p>
                  <p className="text-sm mt-1">{selected.reason}</p>
                </div>
              )}

              {(canAct || canSubmitOwn) && (
                <div className="space-y-3 border-t border-border pt-6">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Decision Reason
                  </label>
                  <textarea
                    value={decisionReason}
                    onChange={(e) => setDecisionReason(e.target.value)}
                    placeholder="Optional reason for decision or submission context..."
                    className="w-full h-24 bg-background border border-input rounded-xl p-3 text-sm outline-none focus:ring-2 focus:ring-primary"
                  />

                  <div className="flex gap-3 justify-end">
                    {canSubmitOwn &&
                      selected.status === 'draft' &&
                      selected.requestedBy === user?.id && (
                        <button
                          onClick={() => submitMutation.mutate()}
                          disabled={submitMutation.isPending}
                          className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2"
                        >
                          <Send size={12} /> Submit
                        </button>
                      )}
                    {canAct && selected.status === 'submitted' && selectedPendingStep && (
                      <>
                        <button
                          onClick={() => rejectMutation.mutate()}
                          disabled={rejectMutation.isPending}
                          className="px-4 py-2 bg-rose-600 text-white rounded-xl text-xs font-black uppercase tracking-widest"
                        >
                          Reject
                        </button>
                        <button
                          onClick={() => approveMutation.mutate()}
                          disabled={approveMutation.isPending}
                          className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-black uppercase tracking-widest"
                        >
                          Approve
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </DetailsDrawer>
    </div>
  );
};

export default GovernanceApprovalsPage;
