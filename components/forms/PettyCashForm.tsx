
import React, { useState } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { FormShell, FormSection, FormSubmitState, PermissionGuard } from '../ifms/forms/Primitives';
import { TextField, NumberField, SelectField, TextareaField } from '../ifms/forms/Fields';
import { pettyCashRepo } from '../../lib/repositories';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { useAppStore } from '../../store';
import { Coins, Wallet, ArrowUpCircle, ArrowDownCircle, Info, Landmark } from 'lucide-react';

const schema = z.object({
  type: z.enum(['Top-up', 'Spend']),
  amount: z.coerce.number().min(0.01, "Amount must be positive"),
  category: z.string().optional(),
  notes: z.string().min(5, "Minimum 5 chars required for audit"),
  source: z.string().optional(), // For top-ups
});

type PettyCashFormData = z.infer<typeof schema>;

export const PettyCashForm: React.FC<{ onSuccess: () => void; onCancel: () => void }> = ({ onSuccess, onCancel }) => {
  const { addToast } = useAppStore();
  const queryClient = useQueryClient();
  const [activeMode, setActiveMode] = useState<'Top-up' | 'Spend'>('Spend');

  const { data: currentBalance, isLoading: loadingBalance } = useQuery({ 
    queryKey: ['petty-cash-balance'], 
    queryFn: pettyCashRepo.getBalance 
  });

  const methods = useForm<PettyCashFormData>({
    resolver: zodResolver(schema),
    defaultValues: { type: 'Spend' }
  });

  const mutation = useMutation({
    mutationFn: (data: PettyCashFormData) => pettyCashRepo.transact(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['petty-cash-balance'] });
      queryClient.invalidateQueries({ queryKey: ['petty-cash-transactions'] });
      addToast(`Ledger updated: ${activeMode} recorded`, "success");
      onSuccess();
    },
    onError: (err: any) => addToast(err.message, "error")
  });

  return (
    <FormProvider {...methods}>
      <form onSubmit={methods.handleSubmit((d) => mutation.mutate(d))} className="h-full">
        <FormShell
          title="Petty Cash Terminal"
          description="Liquid Operational Fund Management"
          actions={
            <PermissionGuard>
               <button type="button" onClick={onCancel} className="px-5 py-2.5 text-xs font-black uppercase text-muted-foreground hover:bg-muted rounded-xl">Cancel</button>
               <button type="submit" disabled={mutation.isPending} className={`px-8 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest shadow-xl transition-all ${
                 activeMode === 'Top-up' ? 'bg-emerald-600 text-white shadow-emerald-500/20' : 'bg-primary text-primary-foreground shadow-primary/20'
               }`}>
                  <FormSubmitState loading={mutation.isPending} label={`Confirm ${activeMode}`} />
               </button>
            </PermissionGuard>
          }
        >
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-7 space-y-10">
              <div className="flex p-1 bg-muted rounded-2xl border border-border">
                 {(['Spend', 'Top-up'] as const).map(mode => (
                   <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      setActiveMode(mode);
                      methods.setValue('type', mode);
                    }}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                      activeMode === mode ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                    }`}
                   >
                     {mode === 'Spend' ? <ArrowDownCircle size={14} className="text-primary" /> : <ArrowUpCircle size={14} className="text-emerald-500" />}
                     {mode}
                   </button>
                 ))}
              </div>

              <FormSection title="Transactional Detail" description={`Capturing funds ${activeMode === 'Top-up' ? 'received into' : 'discharged from'} safe.`}>
                 <NumberField name="amount" label="Transactional Value ($)" required step="0.01" />
                 {activeMode === 'Spend' ? (
                   <SelectField 
                    name="category" 
                    label="Expenditure Group" 
                    options={[
                      { label: 'Staff Meal Allowance', value: 'Staff Refreshments' },
                      { label: 'Daily Cleaning Items', value: 'Cleaning' },
                      { label: 'Local Transport / Taxi', value: 'Transport' },
                      { label: 'Minor Tech Repair', value: 'IT Support' },
                    ]}
                    required
                   />
                 ) : (
                   <SelectField 
                    name="source" 
                    label="Funding Origin" 
                    options={[
                      { label: 'Main Station Safe', value: 'Main Safe' },
                      { label: 'Corporate Bank Draw', value: 'Bank' },
                      { label: 'Manager Contribution', value: 'Manager' },
                    ]}
                    required
                   />
                 )}
                 <div className="md:col-span-2">
                    <TextareaField name="notes" label="Audit Narrative" required placeholder="Detailed reason for this transaction..." fullWidth />
                 </div>
              </FormSection>
            </div>

            <aside className="lg:col-span-5 space-y-6">
               <div className="p-8 bg-slate-900 text-white rounded-3xl shadow-2xl relative overflow-hidden flex flex-col items-center justify-center text-center group">
                  <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform">
                     <Coins size={100} />
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/60 mb-2">Liquid Reserve</p>
                  {loadingBalance ? <div className="h-10 w-32 bg-white/10 animate-pulse rounded"></div> : (
                    <p className="text-5xl font-black tracking-tighter">${currentBalance?.toLocaleString()}</p>
                  )}
                  <p className="text-[10px] text-slate-400 font-bold mt-4 uppercase">Verified balance in terminal safe</p>
               </div>

               <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
                  <div className="flex items-center gap-3 border-b border-border pb-4">
                     <Landmark size={18} className="text-primary" />
                     <h4 className="text-xs font-black uppercase tracking-widest">Compliance Controls</h4>
                  </div>
                  <div className="space-y-4">
                     <div className="flex items-start gap-3">
                        <Info size={14} className="text-primary mt-0.5" />
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                           Petty cash spend is limited to <span className="font-bold text-foreground">$100</span> per single item. Greater amounts must use the main <span className="font-bold">Expense Terminal</span>.
                        </p>
                     </div>
                  </div>
               </div>
            </aside>
          </div>
        </FormShell>
      </form>
    </FormProvider>
  );
};
