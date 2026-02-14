
import React, { useState } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { FormShell, FormSection, FormSubmitState } from '../ifms/forms/Primitives';
import { TextField, NumberField, SelectField, TextareaField } from '../ifms/forms/Fields';
import { expenseRepo, branchRepo } from '../../lib/repositories';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { useAppStore, useAuthStore } from '../../store';
import { ShieldCheck, AlertCircle, FileText, CheckCircle2, XCircle, Paperclip } from 'lucide-react';

const schema = z.object({
  id: z.string().optional(),
  branchId: z.string().min(1, "Branch selection required"),
  category: z.string().min(1, "Category required"),
  amount: z.coerce.number().min(0.01, "Amount must be positive"),
  vendor: z.string().min(1, "Vendor name required"),
  paymentMethod: z.enum(['Cash', 'Bank Transfer', 'Corporate Card', 'Petty Cash']),
  description: z.string().min(5, "Minimum 5 characters"),
  billableDepartment: z.string().optional(),
  attachmentName: z.string().optional(),
});

type ExpenseFormData = z.infer<typeof schema>;

export const ExpenseEntryForm: React.FC<{ initialData?: any; onSuccess: () => void; onCancel: () => void }> = ({ initialData, onSuccess, onCancel }) => {
  const { user } = useAuthStore();
  const { addToast } = useAppStore();
  const queryClient = useQueryClient();
  const [rejecting, setRejecting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  const isManager = user?.role === 'manager';
  const isAuditor = user?.role === 'auditor';
  const isExisting = !!initialData;

  const methods = useForm<ExpenseFormData>({
    resolver: zodResolver(schema),
    defaultValues: initialData || { paymentMethod: 'Bank Transfer', status: 'Draft' }
  });

  const { data: branches } = useQuery({ queryKey: ['branches'], queryFn: () => branchRepo.list() });

  const mutation = useMutation({
    mutationFn: (data: ExpenseFormData) => isExisting ? Promise.resolve(data) : expenseRepo.create(data),
    onSuccess: (saved: any) => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      const approvalId = saved?.governanceApprovalRequestId;
      const approvalStatus = String(saved?.governanceApprovalStatus ?? '').toLowerCase();
      if (!isExisting && (approvalId || approvalStatus === 'submitted')) {
        addToast(
          approvalId ? `Approval required. Request ${approvalId} created.` : 'Approval required. Request created.',
          'info',
          { label: 'Open Approval', href: '#/app/governance/approvals' },
        );
      } else {
        addToast(isExisting ? "Review updated" : "Expense entry submitted for approval", "success");
      }
      onSuccess();
    },
    onError: (err: any) => {
      const details = err?.apiError?.details;
      const nested = details?.message;
      const approvalRequestId =
        err?.apiError?.approvalRequestId ??
        nested?.approvalRequestId ??
        details?.approvalRequestId;
      if (approvalRequestId) {
        addToast(
          `Approval required. Request ${approvalRequestId} created.`,
          'info',
          { label: 'Open Approval', href: '#/app/governance/approvals' },
        );
        return;
      }
      addToast(err?.apiError?.message ?? err?.message ?? 'Failed to submit expense entry', 'error');
    },
  });

  const approvalMutation = useMutation({
    mutationFn: ({ id, status, reason }: { id: string; status: any; reason?: string }) => expenseRepo.updateStatus(id, status, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      addToast("Status updated successfully", "success");
      onSuccess();
    }
  });

  const watchAmount = methods.watch('amount');
  const POLICY_THRESHOLD = 1000;

  return (
    <FormProvider {...methods}>
      <form onSubmit={methods.handleSubmit((d) => mutation.mutate(d))} className="h-full">
        <FormShell
          title={isExisting ? "Review Fiscal Discharge" : "Log Operational Expense"}
          description="General Ledger Entry Management"
          actions={
            <div className="flex justify-between items-center w-full">
               <div className="flex gap-2">
                  <button type="button" onClick={onCancel} className="px-5 py-2.5 text-xs font-black uppercase tracking-widest text-muted-foreground hover:bg-muted rounded-xl transition-all">Cancel</button>
               </div>
               
               <div className="flex gap-3">
                  {isExisting && isManager && initialData.status === 'Submitted' && (
                    <>
                      <button 
                        type="button" 
                        onClick={() => setRejecting(true)}
                        className="px-6 py-2.5 bg-rose-600 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-rose-500/20"
                      >
                        Reject Entry
                      </button>
                      <button 
                        type="button" 
                        onClick={() => approvalMutation.mutate({ id: initialData.id, status: 'Approved' })}
                        className="px-6 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-emerald-500/20"
                      >
                        Authorize & Commit
                      </button>
                    </>
                  )}
                  {!isExisting && !isAuditor && (
                    <button type="submit" className="px-8 py-2.5 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest shadow-xl shadow-primary/20">
                       <FormSubmitState loading={mutation.isPending} label="Submit for Approval" />
                    </button>
                  )}
               </div>
            </div>
          }
        >
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-8 space-y-10">
              {isExisting && (
                <div className={`p-4 rounded-2xl border flex items-center justify-between ${
                  initialData.status === 'Approved' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
                  initialData.status === 'Rejected' ? 'bg-rose-50 border-rose-200 text-rose-700' :
                  'bg-amber-50 border-amber-200 text-amber-700'
                }`}>
                   <div className="flex items-center gap-3">
                      {initialData.status === 'Approved' ? <CheckCircle2 size={18} /> : 
                       initialData.status === 'Rejected' ? <XCircle size={18} /> : <FileText size={18} />}
                      <span className="text-xs font-black uppercase tracking-widest">Workflow State: {initialData.status}</span>
                   </div>
                   {initialData.rejectionReason && (
                     <span className="text-[10px] italic font-medium">Reason: {initialData.rejectionReason}</span>
                   )}
                </div>
              )}

              <FormSection title="Base Parameters" description="Transaction location and categorization.">
                <SelectField 
                  name="branchId" 
                  label="Cost Center / Branch" 
                  options={branches?.map(b => ({ label: b.name, value: b.id })) || []} 
                  required 
                  disabled={isExisting}
                />
                <SelectField 
                  name="category" 
                  label="General Ledger Category" 
                  options={[
                    { label: 'Equipment Maintenance', value: 'Maintenance' },
                    { label: 'Utilities & Power', value: 'Utility' },
                    { label: 'Logistics / Transport', value: 'Logistics' },
                    { label: 'General Stationery', value: 'Stationery' },
                    { label: 'Marketing / Branding', value: 'Marketing' },
                  ]} 
                  required 
                  disabled={isExisting}
                />
                <NumberField name="amount" label="Amount ($)" required step="0.01" disabled={isExisting} />
                <SelectField 
                  name="paymentMethod" 
                  label="Funding Source" 
                  options={[
                    { label: 'Direct Bank Settlement', value: 'Bank Transfer' },
                    { label: 'Corporate Credit Card', value: 'Corporate Card' },
                    { label: 'Petty Cash Ledger', value: 'Petty Cash' },
                  ]} 
                  required 
                  disabled={isExisting}
                />
              </FormSection>

              <FormSection title="Counterparty & Detail" description="Vendor specifics and internal tagging.">
                <TextField name="vendor" label="Vendor Name" required placeholder="e.g. Total Energy Tech" disabled={isExisting} />
                <SelectField 
                  name="billableDepartment" 
                  label="Internal Allocation" 
                  options={[
                    { label: 'Operational Core', value: 'Operations' },
                    { label: 'Sales & Marketing', value: 'Sales' },
                    { label: 'HR / Personnel', value: 'HR' },
                    { label: 'Corporate Admin', value: 'Admin' },
                  ]}
                  disabled={isExisting}
                />
                <TextareaField name="description" label="Justification / Notes" fullWidth placeholder="Elaborate on the need for this discharge..." disabled={isExisting} />
              </FormSection>

              <div className="space-y-4">
                 <h4 className="text-[10px] font-black uppercase tracking-widest text-primary border-b border-border pb-2 flex items-center gap-2">
                    <Paperclip size={12} /> Supporting Evidence
                 </h4>
                 <div className="p-8 border-2 border-dashed border-border rounded-2xl flex flex-col items-center justify-center text-center group hover:bg-muted/10 transition-colors cursor-pointer">
                    <div className="p-3 bg-muted rounded-full text-muted-foreground group-hover:text-primary transition-colors">
                       <Paperclip size={24} />
                    </div>
                    <p className="text-xs font-bold mt-4">Drop invoice or receipt here</p>
                    <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-widest">Max 10MB • PDF, JPG, PNG</p>
                 </div>
              </div>
            </div>

            <aside className="lg:col-span-4 space-y-6">
              <div className="bg-muted/30 border border-border rounded-2xl p-6 space-y-4 shadow-sm">
                 <div className="flex items-center gap-3 border-b border-border pb-4 text-amber-600">
                   <ShieldCheck size={18} />
                   <h4 className="text-xs font-black uppercase tracking-widest">Expense Policy Guard</h4>
                 </div>
                 <div className="space-y-4">
                    <div className="flex items-start gap-3">
                       <div className={`mt-1 p-1 rounded-full ${watchAmount > POLICY_THRESHOLD ? 'bg-amber-500' : 'bg-emerald-500'}`}></div>
                       <div className="text-[11px] leading-relaxed">
                          <p className="font-bold text-foreground">Threshold Review</p>
                          <p className="text-muted-foreground">Amounts over <span className="font-black text-foreground">${POLICY_THRESHOLD}</span> mandate manager multi-factor authorization.</p>
                       </div>
                    </div>
                    <div className="flex items-start gap-3">
                       <div className="mt-1 p-1 rounded-full bg-emerald-500"></div>
                       <div className="text-[11px] leading-relaxed">
                          <p className="font-bold text-foreground">Tax Compliance</p>
                          <p className="text-muted-foreground">Ensure VRN/TIN is visible on uploaded evidence for VAT reclaim eligibility.</p>
                       </div>
                    </div>
                    {watchAmount > POLICY_THRESHOLD && (
                      <div className="p-3 bg-amber-500/10 border border-amber-200 rounded-xl flex items-center gap-2 animate-pulse">
                         <AlertCircle size={14} className="text-amber-600" />
                         <span className="text-[9px] font-black text-amber-700 uppercase tracking-tighter">High Value Protocol Active</span>
                      </div>
                    )}
                 </div>
              </div>

              <div className="p-6 bg-slate-900 text-white rounded-2xl space-y-4">
                 <h4 className="text-[10px] font-black uppercase tracking-widest text-primary/60">Session Audit</h4>
                 <div className="space-y-2">
                    <div className="flex justify-between text-[11px]">
                       <span className="opacity-50">Initiator:</span>
                       <span className="font-bold uppercase tracking-widest">{user?.name}</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                       <span className="opacity-50">Station ID:</span>
                       <span className="font-bold uppercase">DTN-01</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                       <span className="opacity-50">System IP:</span>
                       <span className="font-mono opacity-80">192.168.1.104</span>
                    </div>
                 </div>
              </div>
            </aside>
          </div>
        </FormShell>
      </form>

      {/* Rejection Modal */}
      {rejecting && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
           <div className="bg-card w-full max-w-md rounded-3xl p-8 border border-border shadow-2xl space-y-6">
              <div className="text-center space-y-2">
                 <h3 className="text-xl font-black">Authorize Discharge Rejection</h3>
                 <p className="text-xs text-muted-foreground">Mandatory audit rationale required for refusal.</p>
              </div>
              <textarea 
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="e.g. Insufficient documentation, vendor mismatch, or duplicated entry..."
                className="w-full bg-muted/30 border border-border rounded-xl p-4 text-sm font-medium outline-none focus:ring-2 focus:ring-rose-500 h-32"
              />
              <div className="flex gap-3">
                 <button onClick={() => setRejecting(false)} className="flex-1 py-3 text-xs font-black uppercase text-muted-foreground hover:bg-muted rounded-xl transition-all">Cancel</button>
                 <button 
                  disabled={rejectionReason.length < 5 || approvalMutation.isPending}
                  onClick={() => approvalMutation.mutate({ id: initialData.id, status: 'Rejected', reason: rejectionReason })}
                  className="flex-1 py-3 bg-rose-600 text-white rounded-xl text-xs font-black uppercase shadow-lg shadow-rose-500/20 disabled:opacity-30"
                 >
                   <FormSubmitState loading={approvalMutation.isPending} label="Confirm Rejection" />
                 </button>
              </div>
           </div>
        </div>
      )}
    </FormProvider>
  );
};
