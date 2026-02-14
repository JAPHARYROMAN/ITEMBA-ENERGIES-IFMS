
import React, { useState, useMemo } from 'react';
import { useForm, FormProvider, useWatch, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { FormShell, FormSection, FormSubmitState, PermissionGuard } from '../ifms/forms/Primitives';
import { TextField, NumberField, TextareaField, ReadOnlyField } from '../ifms/forms/Fields';
import { ShiftStepper } from '../ifms/forms/ShiftStepper';
import ComputedFieldBlock, { ComputedItem } from '../ifms/forms/patterns/ComputedFieldBlock';
import { shiftRepo } from '../../lib/repositories';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { useAppStore } from '../../store';
import { ArrowLeft, ArrowRight, Printer, CheckCircle2, AlertTriangle, Wallet } from 'lucide-react';

const schema = z.object({
  id: z.string(),
  readings: z.array(z.object({
    nozzleId: z.string(),
    nozzleCode: z.string(),
    openingReading: z.number(),
    closingReading: z.coerce.number().min(0),
    pricePerUnit: z.number(),
  })),
  collections: z.object({
    cash: z.coerce.number().min(0),
    card: z.coerce.number().min(0),
    mobileMoney: z.coerce.number().min(0),
    voucher: z.coerce.number().min(0),
  }),
  varianceReason: z.string().optional(),
}).superRefine((data, ctx) => {
  // Validate each meter reading
  data.readings.forEach((reading, idx) => {
    if (reading.closingReading < reading.openingReading) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Closing cannot be less than opening",
        path: [`readings`, idx, `closingReading`],
      });
    }
  });

  // Calculate totals for variance check
  const totalVolumeRevenue = data.readings.reduce((acc, r) => {
    return acc + (Math.max(0, r.closingReading - r.openingReading) * r.pricePerUnit);
  }, 0);
  const totalCollected = data.collections.cash + data.collections.card + data.collections.mobileMoney + data.collections.voucher;
  const variance = totalCollected - totalVolumeRevenue;

  if (variance !== 0 && (!data.varianceReason || data.varianceReason.length < 5)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Explain the variance (min 5 chars)",
      path: ["varianceReason"],
    });
  }
});

type CloseShiftFormData = z.infer<typeof schema>;

export const CloseShiftForm: React.FC<{ onSuccess: () => void; onCancel: () => void }> = ({ onSuccess, onCancel }) => {
  const [step, setStep] = useState(0);
  const [showReceipt, setShowReceipt] = useState(false);
  const queryClient = useQueryClient();
  const { addToast } = useAppStore();

  // Load active shift for the selected station
  const { data: activeShift, isLoading } = useQuery({ 
    queryKey: ['active-shift', 's1'], 
    queryFn: () => shiftRepo.getOpen('s1') 
  });

  const methods = useForm<CloseShiftFormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      collections: { cash: 0, card: 0, mobileMoney: 0, voucher: 0 }
    }
  });

  const { handleSubmit, control, setValue, watch, formState: { isSubmitting, errors } } = methods;
  const { fields } = useFieldArray({ control, name: "readings" });

  // Load data into form when active shift is fetched
  React.useEffect(() => {
    if (activeShift) {
      methods.reset({
        id: activeShift.id,
        readings: activeShift.readings.map(r => ({
          ...r,
          closingReading: r.openingReading // Default to opening
        })),
        collections: { cash: 0, card: 0, mobileMoney: 0, voucher: 0 }
      });
    }
  }, [activeShift, methods]);

  const values = watch();

  const reconciliation = useMemo(() => {
    if (!values.readings) return { volume: 0, revenue: 0, collected: 0, variance: 0 };
    
    const revenue = values.readings.reduce((acc, r) => {
      const vol = Math.max(0, (r.closingReading || 0) - r.openingReading);
      return acc + (vol * r.pricePerUnit);
    }, 0);

    const volume = values.readings.reduce((acc, r) => acc + Math.max(0, (r.closingReading || 0) - r.openingReading), 0);
    
    const collected = (values.collections?.cash || 0) + 
                      (values.collections?.card || 0) + 
                      (values.collections?.mobileMoney || 0) + 
                      (values.collections?.voucher || 0);

    return { volume, revenue, collected, variance: collected - revenue };
  }, [values]);

  const mutation = useMutation({
    mutationFn: (data: CloseShiftFormData) => shiftRepo.close(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      addToast("Shift closed. Terminal reporting cycle complete.", "success");
      onSuccess();
    }
  });

  const nextStep = async () => {
    const fieldsToValidate = step === 0 ? ['readings'] : ['collections', 'varianceReason'];
    const isValid = await methods.trigger(fieldsToValidate as any);
    if (isValid) setStep(s => s + 1);
  };

  const steps = ["Meters", "Collections", "Reconcile"];

  const saveDraft = () => {
    try {
      const values = methods.getValues();
      localStorage.setItem('ifms-close-shift-draft', JSON.stringify({ ...values, _step: step }));
      addToast('Draft saved. You can restore it later.', 'success');
    } catch {
      addToast('Could not save draft', 'error');
    }
  };

  const restoreDraft = () => {
    try {
      const raw = localStorage.getItem('ifms-close-shift-draft');
      if (!raw) return;
      const draft = JSON.parse(raw);
      const { _step, ...values } = draft;
      if (values.id === activeShift?.id) {
        methods.reset(values);
        if (typeof _step === 'number') setStep(_step);
        addToast('Draft restored', 'info');
        localStorage.removeItem('ifms-close-shift-draft');
      }
    } catch {
      localStorage.removeItem('ifms-close-shift-draft');
    }
  };

  const hasDraft = (() => {
    try {
      const raw = localStorage.getItem('ifms-close-shift-draft');
      if (!raw) return false;
      const d = JSON.parse(raw);
      return d?.id === activeShift?.id;
    } catch { return false; }
  })();

  if (isLoading) return <div className="h-96 flex items-center justify-center font-black animate-pulse">SYNCHRONIZING TERMINAL...</div>;
  if (!activeShift) return <div className="p-12 text-center border-2 border-dashed rounded-3xl opacity-40 font-black uppercase">No active shift found for this terminal</div>;

  return (
    <FormProvider {...methods}>
      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="h-full">
        <FormShell
          title="Terminal Deactivation & Audit"
          description="Shift Closing Protocol"
          actions={
            <PermissionGuard>
              <div className="flex justify-between w-full items-center">
                <div className="flex items-center gap-2">
                  <button type="button" onClick={saveDraft} className="text-[10px] font-black uppercase text-muted-foreground hover:text-foreground">Save Draft</button>
                  {hasDraft && <button type="button" onClick={restoreDraft} className="text-[10px] font-black uppercase text-primary hover:underline">Restore draft</button>}
                </div>
                <div className="flex gap-3">
                   {step > 0 && (
                    <button type="button" onClick={() => setStep(s => s - 1)} className="px-5 py-2.5 text-xs font-black uppercase tracking-widest text-muted-foreground hover:bg-muted rounded-xl transition-all">
                      Back
                    </button>
                  )}
                  {step < steps.length - 1 ? (
                    <button type="button" onClick={nextStep} className="px-8 py-2.5 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest shadow-xl shadow-primary/20 flex items-center gap-2">
                      Analyze Data <ArrowRight size={14} />
                    </button>
                  ) : (
                    <>
                      <button type="button" onClick={() => setShowReceipt(true)} className="px-5 py-2.5 text-xs font-black uppercase tracking-widest text-primary border border-primary/20 rounded-xl hover:bg-primary/5 transition-all flex items-center gap-2">
                        <Printer size={14} /> Preview
                      </button>
                      <button type="submit" disabled={isSubmitting} className="px-8 py-2.5 bg-rose-600 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-xl shadow-rose-500/20">
                        <FormSubmitState loading={isSubmitting} label="Authorize Terminal Lock" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </PermissionGuard>
          }
        >
          <ShiftStepper currentStep={step} steps={steps} />

          {step === 0 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
              <FormSection title="Closing Meter Readings" description="Enter final nozzle readings to determine total discharge volume.">
                <div className="md:col-span-2 border border-border rounded-2xl overflow-hidden bg-card shadow-sm">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-muted/50 border-b border-border">
                      <tr>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Nozzle</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Opening Reading</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Closing Reading</th>
                        <th className="px-6 py-4 text-right text-[10px] font-black uppercase tracking-widest text-muted-foreground">Derived Volume (L)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {fields.map((field, index) => {
                        const opening = watch(`readings.${index}.openingReading`);
                        const closing = watch(`readings.${index}.closingReading`);
                        const vol = Math.max(0, closing - opening);
                        return (
                          <tr key={field.id} className="hover:bg-muted/10 group">
                            <td className="px-6 py-4">
                              <span className="text-xs font-black">{field.nozzleCode}</span>
                            </td>
                            <td className="px-6 py-4">
                              <span className="text-xs font-medium opacity-50">{opening.toLocaleString()}</span>
                            </td>
                            <td className="px-6 py-4">
                              <input 
                                {...methods.register(`readings.${index}.closingReading` as const)}
                                type="number"
                                step="0.01"
                                className={`w-32 h-10 bg-background border rounded-lg px-3 text-sm font-black focus:ring-2 focus:ring-primary outline-none transition-all ${
                                  errors.readings?.[index]?.closingReading ? 'border-rose-500 bg-rose-50' : 'border-input'
                                }`}
                              />
                            </td>
                            <td className="px-6 py-4 text-right">
                              <span className={`text-xs font-black ${vol > 0 ? 'text-primary' : 'opacity-20'}`}>{vol.toFixed(2)} L</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </FormSection>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-10 animate-in fade-in slide-in-from-right-4">
              <FormSection title="Financial Collections" description="Breakdown of physical collection by tender type.">
                <NumberField name="collections.cash" label="Physical Cash ($)" required placeholder="0.00" hint="Verified cash count from till." />
                <NumberField name="collections.card" label="POS Terminal ($)" required placeholder="0.00" hint="Sum of all settlement receipts." />
                <NumberField name="collections.mobileMoney" label="Mobile Money ($)" required placeholder="0.00" />
                <NumberField name="collections.voucher" label="Credit Vouchers ($)" required placeholder="0.00" />
              </FormSection>

              {(reconciliation.variance !== 0) && (
                <div className="animate-in slide-in-from-top-4 duration-300">
                  <FormSection title="Variance Attribution" description="Audit requirement: Explain discrepancies between sales and collections.">
                    <TextareaField 
                      name="varianceReason" 
                      label="Reconciliation Note" 
                      fullWidth 
                      required 
                      placeholder="e.g. Drive-off on Pump 2, rounded totals, or till discrepancy..." 
                    />
                  </FormSection>
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-8 animate-in fade-in slide-in-from-right-4">
              <ComputedFieldBlock 
                items={[
                  { label: 'Total Volume', value: `${reconciliation.volume.toLocaleString()} L`, status: 'neutral' },
                  { label: 'Expected Revenue', value: `$${reconciliation.revenue.toLocaleString(undefined, {minimumFractionDigits: 2})}`, status: 'neutral' },
                  { label: 'Total Collected', value: `$${reconciliation.collected.toLocaleString(undefined, {minimumFractionDigits: 2})}`, status: 'neutral' },
                  { label: 'Variance', value: `$${reconciliation.variance.toLocaleString(undefined, {minimumFractionDigits: 2})}`, 
                    status: reconciliation.variance < 0 ? 'error' : reconciliation.variance > 0 ? 'warning' : 'success' }
                ]}
              />

              <div className="bg-card border border-border rounded-2xl p-8 space-y-6">
                <div className="flex items-center gap-4 border-b border-border pb-6">
                   <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                     <CheckCircle2 size={24} />
                   </div>
                   <div>
                     <h4 className="text-sm font-black">Audit Ready</h4>
                     <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Compliance metrics within valid thresholds</p>
                   </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                   <div className="p-4 bg-muted/20 rounded-xl">
                      <p className="text-[9px] font-black uppercase text-muted-foreground mb-1">Station ID</p>
                      <p className="text-xs font-bold">DTN-S1</p>
                   </div>
                   <div className="p-4 bg-muted/20 rounded-xl">
                      <p className="text-[9px] font-black uppercase text-muted-foreground mb-1">Cashier</p>
                      <p className="text-xs font-bold">Sam Cashier</p>
                   </div>
                   <div className="p-4 bg-muted/20 rounded-xl">
                      <p className="text-[9px] font-black uppercase text-muted-foreground mb-1">Meters Verified</p>
                      <p className="text-xs font-bold">{fields.length}</p>
                   </div>
                   <div className="p-4 bg-muted/20 rounded-xl">
                      <p className="text-[9px] font-black uppercase text-muted-foreground mb-1">Status</p>
                      <span className="px-2 py-0.5 bg-rose-500 text-white text-[8px] font-black uppercase rounded">Closing</span>
                   </div>
                </div>
              </div>
            </div>
          )}
        </FormShell>
      </form>

      {/* Receipt preview modal */}
      {showReceipt && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in">
           <div className="bg-white text-slate-900 w-full max-w-sm rounded-[2rem] p-8 space-y-6 shadow-2xl relative overflow-hidden font-mono border-t-[12px] border-primary">
              <div className="text-center space-y-1">
                 <h3 className="font-black text-lg">IFMS RECEIPT</h3>
                 <p className="text-[10px] uppercase font-bold tracking-widest opacity-50">Terminal Reconciliation</p>
              </div>
              
              <div className="border-y border-dashed border-slate-300 py-4 space-y-2 text-[11px]">
                 <div className="flex justify-between"><span>STATION:</span> <span className="font-black">DOWNTOWN-01</span></div>
                 <div className="flex justify-between"><span>OPERATOR:</span> <span className="font-black">SAM CASHIER</span></div>
                 <div className="flex justify-between"><span>TIME:</span> <span className="font-black">{new Date().toLocaleString()}</span></div>
              </div>

              <div className="space-y-3">
                 <div className="flex justify-between text-xs"><span>VOLUME SOLD:</span> <span className="font-black">{reconciliation.volume.toFixed(2)} L</span></div>
                 <div className="flex justify-between text-xs"><span>TOTAL REV:</span> <span className="font-black">${reconciliation.revenue.toFixed(2)}</span></div>
                 <div className="flex justify-between text-xs"><span>TOTAL COLL:</span> <span className="font-black">${reconciliation.collected.toFixed(2)}</span></div>
                 <div className="h-px bg-slate-200" />
                 <div className="flex justify-between text-sm font-black">
                    <span>VARIANCE:</span>
                    <span className={reconciliation.variance < 0 ? 'text-rose-600' : 'text-emerald-600'}>
                      ${reconciliation.variance.toFixed(2)}
                    </span>
                 </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl text-[9px] opacity-60 italic text-center">
                 "Shift audit complete. Electronic journal updated. Terminal session terminated."
              </div>

              <button 
                onClick={() => setShowReceipt(false)}
                className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest text-xs"
              >
                Close Receipt
              </button>
           </div>
        </div>
      )}
    </FormProvider>
  );
};
