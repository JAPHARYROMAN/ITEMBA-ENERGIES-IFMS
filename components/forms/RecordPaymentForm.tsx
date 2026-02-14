
import React, { useState, useMemo, useEffect } from 'react';
import { useForm, FormProvider, useWatch, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { FormShell, FormSection, FormSubmitState, PermissionGuard } from '../ifms/forms/Primitives';
import { TextField, NumberField, SelectField, ReadOnlyField } from '../ifms/forms/Fields';
import { customerRepo, invoiceRepo, paymentRepo } from '../../lib/repositories';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../../store';
import { CreditCard, CheckSquare, Square, Zap, Info } from 'lucide-react';

const schema = z.object({
  customerId: z.string().min(1, "Customer required"),
  amount: z.coerce.number().min(1, "Payment amount required"),
  method: z.enum(['Cash', 'Bank Transfer', 'Cheque', 'Credit Card']),
  date: z.string().min(1, "Date required"),
  referenceNo: z.string().optional(),
  allocations: z.array(z.object({
    invoiceId: z.string(),
    amount: z.coerce.number().min(0),
  })),
}).superRefine((data, ctx) => {
  const totalAllocated = data.allocations.reduce((acc, a) => acc + a.amount, 0);
  if (totalAllocated > data.amount) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Allocated sum cannot exceed payment amount",
      path: ["allocations"],
    });
  }
});

type PaymentFormData = z.infer<typeof schema>;

export const RecordPaymentForm: React.FC<{ onSuccess: () => void; onCancel: () => void; initialCustomerId?: string }> = ({ onSuccess, onCancel, initialCustomerId }) => {
  const queryClient = useQueryClient();
  const { addToast } = useAppStore();

  const { data: customers } = useQuery({ queryKey: ['customers'], queryFn: customerRepo.list });
  
  const methods = useForm<PaymentFormData>({
    resolver: zodResolver(schema),
    defaultValues: { 
      customerId: initialCustomerId || '',
      date: new Date().toISOString().split('T')[0],
      method: 'Bank Transfer',
      allocations: []
    }
  });

  React.useEffect(() => {
    if (initialCustomerId) methods.setValue('customerId', initialCustomerId);
  }, [initialCustomerId, methods]);

  const { handleSubmit, control, setValue, watch, formState: { isSubmitting, errors } } = methods;
  const values = watch();
  const selectedCustomerId = watch('customerId');

  const { data: unpaidInvoices, isLoading: isLoadingInvoices } = useQuery({
    queryKey: ['unpaid-invoices', selectedCustomerId],
    queryFn: () => invoiceRepo.getUnpaid(selectedCustomerId!),
    enabled: !!selectedCustomerId
  });

  const totalAllocated = useMemo(() => {
    return values.allocations?.reduce((acc, a) => acc + a.amount, 0) || 0;
  }, [values.allocations]);

  const autoAllocate = () => {
    if (!unpaidInvoices || !values.amount) return;
    
    let remaining = values.amount;
    const newAllocations: any[] = [];
    
    // FIFO allocation
    const sorted = [...unpaidInvoices].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    sorted.forEach(inv => {
      const pay = Math.min(remaining, inv.balanceRemaining);
      if (pay > 0) {
        newAllocations.push({ invoiceId: inv.id, amount: pay });
        remaining -= pay;
      }
    });

    setValue('allocations', newAllocations);
    addToast("Auto-allocated to oldest invoices", "info");
  };

  const mutation = useMutation({
    mutationFn: (data: PaymentFormData) => paymentRepo.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-payments'] });
      queryClient.invalidateQueries({ queryKey: ['customer-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      addToast("Payment recorded and ledger reconciled", "success");
      onSuccess();
    }
  });

  return (
    <FormProvider {...methods}>
      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="h-full">
        <FormShell
          title="Collect & Allocate Payment"
          description="Financial Reconciliation Terminal"
          actions={
            <PermissionGuard>
              <button type="button" onClick={onCancel} className="px-5 py-2.5 text-xs font-black uppercase tracking-widest text-muted-foreground hover:bg-muted rounded-xl transition-all">Cancel</button>
              <button type="submit" disabled={isSubmitting} className="px-8 py-2.5 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest shadow-xl shadow-primary/20 hover:opacity-90 transition-all">
                <FormSubmitState loading={isSubmitting} label="Post Payment" />
              </button>
            </PermissionGuard>
          }
        >
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-5 space-y-10">
              <FormSection title="Payment Detail">
                <SelectField name="customerId" label="Customer" options={customers?.map(c => ({ label: `${c.name} ($${c.balance.toLocaleString()})`, value: c.id })) || []} required />
                <NumberField name="amount" label="Payment Amount ($)" required placeholder="0.00" />
                <SelectField name="method" label="Payment Channel" options={['Cash', 'Bank Transfer', 'Cheque', 'Credit Card'].map(m => ({ label: m, value: m }))} required />
                <div className="grid grid-cols-2 gap-4">
                   <TextField name="date" label="Post Date" type="date" required />
                   <TextField name="referenceNo" label="Ref / Chq #" />
                </div>
              </FormSection>

              <div className="p-6 bg-slate-900 text-white rounded-3xl space-y-6 shadow-xl shadow-slate-900/10">
                 <h4 className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-2">
                    <Zap size={14} className="text-emerald-400" /> Allocation Summary
                 </h4>
                 <div className="space-y-3">
                    <div className="flex justify-between text-xs">
                       <span className="opacity-50">Total Amount:</span>
                       <span className="font-bold">${(values.amount || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                       <span className="opacity-50">Allocated:</span>
                       <span className="font-bold text-emerald-400">${totalAllocated.toLocaleString()}</span>
                    </div>
                    <div className="h-px bg-white/10" />
                    <div className="flex justify-between text-sm">
                       <span className="opacity-50">Remaining:</span>
                       <span className={`font-black ${values.amount - totalAllocated > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                          ${(values.amount - totalAllocated).toLocaleString()}
                       </span>
                    </div>
                 </div>
                 <button type="button" onClick={autoAllocate} disabled={!selectedCustomerId || !values.amount} className="w-full py-3 bg-white/5 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all disabled:opacity-30">
                    Apply Smart FIFO Logic
                 </button>
              </div>
            </div>

            <div className="lg:col-span-7 space-y-6">
              <div className="flex items-center justify-between border-b border-border/60 pb-3">
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-primary flex items-center gap-2">Unpaid Invoices</h3>
                <span className="text-[9px] font-bold text-muted-foreground uppercase">Allocation Matrix</span>
              </div>

              {isLoadingInvoices ? (
                <div className="p-12 text-center animate-pulse opacity-40 font-black uppercase">Loading Ledger...</div>
              ) : !unpaidInvoices?.length ? (
                <div className="p-12 border-2 border-dashed border-border rounded-3xl flex flex-col items-center justify-center text-center opacity-30">
                  <Info size={32} className="mb-2" />
                  <p className="text-[10px] font-bold uppercase">No Unpaid Items Found</p>
                </div>
              ) : (
                <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 no-scrollbar">
                  {unpaidInvoices.map((inv) => {
                    const currentAlloc = values.allocations?.find(a => a.invoiceId === inv.id);
                    const isAllocated = !!currentAlloc;
                    
                    return (
                      <div key={inv.id} className={`p-5 rounded-2xl border transition-all ${isAllocated ? 'bg-primary/5 border-primary shadow-sm' : 'bg-muted/20 border-border'}`}>
                        <div className="flex items-center justify-between mb-4">
                           <div className="flex items-center gap-3">
                              <button 
                                type="button" 
                                onClick={() => {
                                  const existing = [...(values.allocations || [])];
                                  const idx = existing.findIndex(a => a.invoiceId === inv.id);
                                  if (idx >= 0) existing.splice(idx, 1);
                                  else existing.push({ invoiceId: inv.id, amount: Math.min(values.amount - totalAllocated, inv.balanceRemaining) });
                                  setValue('allocations', existing);
                                }}
                                className={`p-1 rounded-md transition-colors ${isAllocated ? 'text-primary' : 'text-muted-foreground'}`}
                              >
                                {isAllocated ? <CheckSquare size={20} /> : <Square size={20} />}
                              </button>
                              <div>
                                <p className="text-xs font-black uppercase">{inv.id}</p>
                                <p className="text-[9px] text-muted-foreground uppercase font-bold">{new Date(inv.date).toLocaleDateString()} • Due in {Math.ceil((new Date(inv.dueDate).getTime() - Date.now()) / (1000 * 3600 * 24))}d</p>
                              </div>
                           </div>
                           <div className="text-right">
                              <p className="text-[9px] font-black uppercase text-muted-foreground mb-1">Unpaid</p>
                              <p className="text-xs font-black">${inv.balanceRemaining.toLocaleString()}</p>
                           </div>
                        </div>
                        {isAllocated && (
                           <div className="flex items-center gap-4 animate-in slide-in-from-top-2">
                              <div className="flex-1">
                                 <input 
                                   type="number"
                                   step="0.01"
                                   value={currentAlloc.amount}
                                   onChange={(e) => {
                                     const newVal = parseFloat(e.target.value) || 0;
                                     const existing = [...values.allocations];
                                     const idx = existing.findIndex(a => a.invoiceId === inv.id);
                                     existing[idx].amount = Math.min(newVal, inv.balanceRemaining);
                                     setValue('allocations', existing);
                                   }}
                                   className="w-full h-10 bg-background border border-primary/20 rounded-xl px-4 text-sm font-black focus:ring-2 focus:ring-primary outline-none transition-all"
                                 />
                              </div>
                              <button type="button" onClick={() => {
                                 const existing = [...values.allocations];
                                 const idx = existing.findIndex(a => a.invoiceId === inv.id);
                                 existing[idx].amount = inv.balanceRemaining;
                                 setValue('allocations', existing);
                              }} className="px-3 py-2 bg-primary/10 text-primary rounded-lg text-[9px] font-black uppercase">Max</button>
                           </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </FormShell>
      </form>
    </FormProvider>
  );
};
