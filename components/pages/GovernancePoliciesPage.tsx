import React from 'react';
import { useFieldArray, useForm, FormProvider } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import PageHeader from '../ifms/PageHeader';
import FilterBar from '../ifms/FilterBar';
import { IFMSDataTable } from '../ifms/DataTable';
import DetailsDrawer from '../ifms/DetailsDrawer';
import { FormSection, FormShell, FormSubmitState } from '../ifms/forms/Primitives';
import { TextField, NumberField, SelectField, ToggleField } from '../ifms/forms/Fields';
import { TableSkeleton } from '../ifms/Skeletons';
import { useAppStore, useAuthStore } from '../../store';
import { apiGovernance, type GovernancePolicy } from '../../lib/api/governance';
import { setupDataSource } from '../../lib/data-source';
import { Plus, ShieldOff } from 'lucide-react';

const stepSchema = z.object({
  stepOrder: z.coerce.number().min(1),
  requiredRole: z.string().optional(),
  requiredPermission: z.string().optional(),
  dueHours: z.coerce.number().min(0).optional(),
  allowSelfApproval: z.boolean().optional(),
});

const policySchema = z.object({
  companyId: z.string().min(1, 'Company is required'),
  branchId: z.string().optional(),
  entityType: z.string().min(1, 'Entity type is required'),
  actionType: z.string().min(1, 'Action type is required'),
  thresholdAmount: z.coerce.number().min(0).optional(),
  thresholdPct: z.coerce.number().min(0).optional(),
  isEnabled: z.boolean().default(true),
  approvalSteps: z.array(stepSchema).min(1, 'At least one step is required'),
});

type PolicyFormData = z.infer<typeof policySchema>;

const GovernancePolicyForm: React.FC<{
  initialPolicy?: GovernancePolicy | null;
  onCancel: () => void;
  onSuccess: () => void;
}> = ({ initialPolicy, onCancel, onSuccess }) => {
  const { addToast } = useAppStore();
  const queryClient = useQueryClient();

  const { data: companies } = useQuery({ queryKey: ['companies'], queryFn: setupDataSource.companies.list });
  const { data: branches } = useQuery({ queryKey: ['branches'], queryFn: () => setupDataSource.branches.list() });

  const methods = useForm<PolicyFormData>({
    resolver: zodResolver(policySchema),
    defaultValues: initialPolicy
      ? {
          companyId: initialPolicy.companyId,
          branchId: initialPolicy.branchId ?? '',
          entityType: initialPolicy.entityType,
          actionType: initialPolicy.actionType,
          thresholdAmount: initialPolicy.thresholdAmount ? Number(initialPolicy.thresholdAmount) : 0,
          thresholdPct: initialPolicy.thresholdPct ? Number(initialPolicy.thresholdPct) : 0,
          isEnabled: initialPolicy.isEnabled,
          approvalSteps: initialPolicy.approvalStepsJson?.length
            ? initialPolicy.approvalStepsJson.map((s) => ({
                stepOrder: s.stepOrder,
                requiredRole: s.requiredRole ?? '',
                requiredPermission: s.requiredPermission ?? '',
                dueHours: s.dueHours ?? 0,
                allowSelfApproval: s.allowSelfApproval ?? false,
              }))
            : [{ stepOrder: 1, requiredPermission: '', dueHours: 0, allowSelfApproval: false }],
        }
      : {
          companyId: '',
          branchId: '',
          entityType: '',
          actionType: '',
          thresholdAmount: 0,
          thresholdPct: 0,
          isEnabled: true,
          approvalSteps: [{ stepOrder: 1, requiredPermission: '', dueHours: 0, allowSelfApproval: false }],
        },
  });

  const { control, handleSubmit, formState: { isSubmitting } } = methods;
  const { fields, append, remove } = useFieldArray({ control, name: 'approvalSteps' });

  const mutation = useMutation({
    mutationFn: (data: PolicyFormData) => {
      const normalized = {
        branchId: data.branchId || undefined,
        thresholdAmount: data.thresholdAmount || undefined,
        thresholdPct: data.thresholdPct || undefined,
        approvalSteps: data.approvalSteps.map((s) => ({
          stepOrder: Number(s.stepOrder),
          requiredRole: s.requiredRole || undefined,
          requiredPermission: s.requiredPermission || undefined,
          dueHours: s.dueHours || undefined,
          allowSelfApproval: !!s.allowSelfApproval,
        })),
      };
      if (initialPolicy) {
        return apiGovernance.updatePolicy(initialPolicy.id, {
          companyId: data.companyId,
          entityType: data.entityType,
          actionType: data.actionType,
          isEnabled: data.isEnabled,
          ...normalized,
        });
      }
      return apiGovernance.createPolicy({
        companyId: data.companyId,
        entityType: data.entityType,
        actionType: data.actionType,
        isEnabled: data.isEnabled,
        ...normalized,
      });
    },
    onSuccess: () => {
      addToast(initialPolicy ? 'Policy updated' : 'Policy created', 'success');
      queryClient.invalidateQueries({ queryKey: ['governance-policies'] });
      onSuccess();
    },
    onError: (err: any) => addToast(err?.apiError?.message ?? err?.message ?? 'Failed to save policy', 'error'),
  });

  return (
    <FormProvider {...methods}>
      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="h-full">
        <FormShell
          title={initialPolicy ? 'Edit Governance Policy' : 'Create Governance Policy'}
          description="Define approval thresholds and step workflow."
          actions={
            <>
              <button type="button" onClick={onCancel} className="px-5 py-2.5 text-xs font-black uppercase tracking-widest text-muted-foreground hover:bg-muted rounded-xl transition-all">Cancel</button>
              <button type="submit" disabled={isSubmitting} className="px-8 py-2.5 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest shadow-xl shadow-primary/20">
                <FormSubmitState loading={isSubmitting} label={initialPolicy ? 'Save Policy' : 'Create Policy'} />
              </button>
            </>
          }
        >
          <FormSection title="Policy Scope" description="Entity/action and optional threshold gates.">
            <SelectField name="companyId" label="Company" options={(companies ?? []).map((c) => ({ label: c.name, value: c.id }))} required />
            <SelectField name="branchId" label="Branch (Optional)" options={(branches ?? []).map((b) => ({ label: b.name, value: b.id }))} />
            <TextField name="entityType" label="Entity Type" required placeholder="expense_entry" />
            <TextField name="actionType" label="Action Type" required placeholder="approve" />
            <NumberField name="thresholdAmount" label="Threshold Amount" step="0.01" hint="0 or empty = no amount threshold" />
            <NumberField name="thresholdPct" label="Threshold Ratio" step="0.01" hint="0.1 = 10%" />
            <ToggleField name="isEnabled" label="Policy Enabled" fullWidth />
          </FormSection>

          <FormSection title="Approval Steps" description="Sequenced workflow for this policy.">
            <div className="md:col-span-2 space-y-4">
              {fields.map((field, idx) => (
                <div key={field.id} className="p-4 border border-border rounded-2xl bg-muted/20 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <NumberField name={`approvalSteps.${idx}.stepOrder`} label="Step Order" required />
                    <TextField name={`approvalSteps.${idx}.requiredRole`} label="Required Role" placeholder="manager" />
                    <TextField name={`approvalSteps.${idx}.requiredPermission`} label="Required Permission" placeholder="expenses:write" />
                    <NumberField name={`approvalSteps.${idx}.dueHours`} label="Due Hours" step="1" />
                    <ToggleField name={`approvalSteps.${idx}.allowSelfApproval`} label="Allow Self Approval" />
                  </div>
                  {fields.length > 1 && (
                    <button type="button" onClick={() => remove(idx)} className="text-[10px] font-black uppercase text-rose-600">Remove Step</button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => append({ stepOrder: fields.length + 1, requiredPermission: '', dueHours: 0, allowSelfApproval: false })}
                className="px-4 py-2 border border-border rounded-xl text-xs font-black uppercase tracking-widest text-primary"
              >
                Add Step
              </button>
            </div>
          </FormSection>
        </FormShell>
      </form>
    </FormProvider>
  );
};

const GovernancePoliciesPage: React.FC = () => {
  const { addToast } = useAppStore();
  const { user } = useAuthStore();
  const [search, setSearch] = React.useState('');
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [activePolicy, setActivePolicy] = React.useState<GovernancePolicy | null>(null);

  const isManager = user?.role === 'manager';

  const policiesQuery = useQuery({
    queryKey: ['governance-policies'],
    queryFn: () => apiGovernance.listPolicies(),
    enabled: isManager,
  });

  const filtered = React.useMemo(() => {
    const rows = policiesQuery.data ?? [];
    if (!search) return rows;
    const q = search.toLowerCase();
    return rows.filter((r) => [r.entityType, r.actionType, r.companyId, r.branchId ?? ''].some((v) => String(v).toLowerCase().includes(q)));
  }, [policiesQuery.data, search]);

  if (!isManager) {
    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <PageHeader title="Policies" description="Governance policy definitions." />
        <div className="bg-card border border-border rounded-2xl p-12 text-center">
          <ShieldOff className="mx-auto mb-4 text-muted-foreground" size={40} />
          <p className="text-sm font-black uppercase tracking-widest text-muted-foreground">Manager access required to manage governance policies.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <PageHeader
        title="Policies"
        description="Governance thresholds and approval workflow configuration."
        actions={
          <button
            onClick={() => {
              setActivePolicy(null);
              setDrawerOpen(true);
            }}
            className="px-6 py-2.5 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-primary/20 hover:opacity-90 transition-all flex items-center gap-2"
          >
            <Plus size={14} /> New Policy
          </button>
        }
      />

      <FilterBar onSearch={setSearch} showDate={false} />

      {policiesQuery.isLoading ? (
        <div className="bg-card border border-border rounded-xl p-8"><TableSkeleton /></div>
      ) : (
        <IFMSDataTable
          data={filtered}
          onRowClick={(row: any) => {
            setActivePolicy(row);
            setDrawerOpen(true);
          }}
          columns={[
            { header: 'Entity', accessorKey: 'entityType' },
            { header: 'Action', accessorKey: 'actionType' },
            { header: 'Company', accessorKey: 'companyId' },
            { header: 'Branch', accessorKey: 'branchId', cell: (r: any) => r.branchId || 'Global' },
            { header: 'Threshold Amount', accessorKey: 'thresholdAmount', cell: (r: any) => r.thresholdAmount || '-' },
            { header: 'Threshold %', accessorKey: 'thresholdPct', cell: (r: any) => r.thresholdPct || '-' },
            { header: 'Steps', accessorKey: 'steps', cell: (r: any) => r.approvalStepsJson?.length ?? 0 },
            {
              header: 'Enabled',
              accessorKey: 'isEnabled',
              cell: (r: any) => (
                <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase border ${r.isEnabled ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                  {r.isEnabled ? 'Enabled' : 'Disabled'}
                </span>
              ),
            },
          ]}
        />
      )}

      <DetailsDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={activePolicy ? 'Edit Policy' : 'Create Policy'}
        subtitle="Governance policy editor"
        variant="large"
      >
        <GovernancePolicyForm
          initialPolicy={activePolicy}
          onCancel={() => setDrawerOpen(false)}
          onSuccess={() => setDrawerOpen(false)}
        />
      </DetailsDrawer>
    </div>
  );
};

export default GovernancePoliciesPage;
