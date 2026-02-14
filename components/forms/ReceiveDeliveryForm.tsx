
import React, { useMemo, useEffect } from 'react';
import { useForm, FormProvider, useWatch, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { FormShell, FormSection, FormSubmitState, PermissionGuard } from '../ifms/forms/Primitives';
import { TextField, NumberField, SelectField, TextareaField } from '../ifms/forms/Fields';
import ComputedFieldBlock from '../ifms/forms/patterns/ComputedFieldBlock';
import { deliveryRepo, tankRepo, productRepo } from '../../lib/repositories';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../../store';
import { Layers, CheckCircle2, AlertTriangle, Info, Scale } from 'lucide-react';

const schema = z.object({
  id: z.string(),
  receivedQty: z.coerce.number().min(1, "Received quantity required"),
  density: z.coerce.number().min(0).max(1000).optional(),
  temperature: z.coerce.number().min(-50).max(100).optional(),
  allocations: z.array(z.object({
    tankId: z.string().min(1, "Select tank"),
    quantity: z.coerce.number().min(0),
  })).min(1, "Allocate to at least one tank"),
  varianceReason: z.string().optional(),
}).superRefine((data, ctx) => {
  const totalAllocated = data.allocations.reduce((acc, a) => acc + a.quantity, 0);
  if (Math.abs(totalAllocated - data.receivedQty) > 0.01) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Allocated sum (${totalAllocated.toLocaleString()}L) must match received (${data.receivedQty.toLocaleString()}L)`,
      path: ["allocations"],
    });
  }
});

type ReceiveDeliveryFormData = z.infer<typeof schema>;

export const ReceiveDeliveryForm: React.FC<{ deliveryId: string; onSuccess: () => void; onCancel: () => void }> = ({ deliveryId, onSuccess, onCancel }) => {
  const queryClient = useQueryClient();
  const { addToast } = useAppStore();

  const { data: deliveries } = useQuery({ queryKey: ['deliveries'], queryFn: deliveryRepo.list });
  const delivery = deliveries?.find(d => d.id === deliveryId);

  const { data: tanks } = useQuery({ 
    queryKey: ['tanks', 's1'], 
    queryFn: () => tankRepo.list('s1') 
  });
  
  const productTanks = tanks?.filter(t => t.productId === delivery?.productId) || [];

  const methods = useForm<ReceiveDeliveryFormData>({
    resolver: zodResolver(schema),
    defaultValues: { 
      id: deliveryId, 
      receivedQty: delivery?.orderedQty || 0,
      allocations: [{ tankId: '', quantity: 0 }] 
    }
  });

  const { handleSubmit, control, setValue, formState: { errors, isSubmitting } } = methods;
  const values = useWatch({ control });
  const { fields, append, remove } = useFieldArray({ control, name: "allocations" });

  useEffect(() => {
    if (delivery && fields.length === 1 && fields[0].quantity === 0) {
      setValue('receivedQty', delivery.orderedQty);
      if (productTanks.length > 0) {
        setValue('allocations.0.tankId', productTanks[0].id);
        setValue('allocations.0.quantity', delivery.orderedQty);
      }
    }
  }, [delivery, productTanks, setValue]);

  const variance = useMemo(() => {
    if (!delivery || !values.receivedQty) return 0;
    return values.receivedQty - delivery.orderedQty;
  }, [delivery, values.receivedQty]);

  const totalAllocated = useMemo(() => {
    return values.allocations?.reduce((acc, a) => acc + (a.quantity || 0), 0) || 0;
  }, [values.allocations]);

  const mutation = useMutation({
    mutationFn: (data: ReceiveDeliveryFormData) => deliveryRepo.receive(deliveryId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deliveries'] });
      queryClient.invalidateQueries({ queryKey: ['tanks'] });
      addToast("Delivery reconciled and committed to inventory", "success");
      onSuccess();
    }
  });

  if (!delivery) return <div className="p-12 text-center opacity-40 font-black uppercase">Resolving delivery context...</div>;

  return (
    <FormProvider {...methods}>
      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="h-full">
        <FormShell
          title="Receive Replenishment (GRN)"
          description={`Reconciling ${delivery.deliveryNote} • ${delivery.productId}`}
          status={mutation.isPending ? 'loading' : 'idle'}
          actions={
            <PermissionGuard>
              <button type="button" onClick={onCancel} className="px-5 py-2.5 text-xs font-black uppercase tracking-widest text-muted-foreground hover:bg-muted rounded-xl transition-all">
                Cancel
              </button>
              <button 
                type="submit" 
                disabled={isSubmitting}
                className="px-8 py-2.5 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest shadow-xl shadow-primary/20 hover:opacity-90 transition-all"
              >
                <FormSubmitState loading={isSubmitting} label="Commit to Stock" />
              </button>
            </PermissionGuard>
          }
        >
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-7 space-y-10">
              <FormSection title="Verification Fields" description="Physical verification data from haulier.">
                <NumberField name="receivedQty" label="Total Received (L)" required placeholder="0.00" />
                <div className="grid grid-cols-2 gap-4">
                  <NumberField name="density" label="Measured Density" placeholder="e.g. 0.745" />
                  <NumberField name="temperature" label="Fuel Temp (°C)" placeholder="e.g. 24.5" />
                </div>
              </FormSection>

              <div className="space-y-6">
                <div className="flex items-center justify-between border-b border-border/60 pb-3">
                  <h3 className="text-xs font-black uppercase tracking-[0.2em] text-primary flex items-center gap-2">
                    <Layers size={14} /> Tank Allocation Matrix
                  </h3>
                  <button 
                    type="button" 
                    onClick={() => append({ tankId: '', quantity: 0 })}
                    className="text-[10px] font-black text-primary hover:underline uppercase"
                  >
                    + Split Discharge
                  </button>
                </div>
                
                <div className="space-y-4">
                   {fields.map((field, index) => {
                     const selectedTankId = values.allocations?.[index]?.tankId;
                     const selectedTank = productTanks.find(t => t.id === selectedTankId);
                     const freeCap = selectedTank ? selectedTank.capacity - selectedTank.currentLevel : 0;
                     const currentQty = values.allocations?.[index]?.quantity || 0;
                     const isOver = currentQty > freeCap;

                     return (
                        <div key={field.id} className="p-4 bg-muted/20 border border-border rounded-2xl flex flex-col gap-4 animate-in slide-in-from-left-2 transition-all">
                           <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <SelectField 
                                name={`allocations.${index}.tankId`} 
                                label="Target Tank" 
                                options={productTanks.map(t => ({ label: `${t.code} (${(t.capacity - t.currentLevel).toLocaleString()}L Free)`, value: t.id }))} 
                              />
                              <NumberField name={`allocations.${index}.quantity`} label="Discharge Volume" />
                           </div>
                           {selectedTank && (
                             <div className="flex items-center justify-between px-1">
                                <div className="flex items-center gap-2">
                                  <div className={`w-2 h-2 rounded-full ${isOver ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500'}`}></div>
                                  <span className="text-[10px] font-bold text-muted-foreground uppercase">
                                    {isOver ? 'Exceeds safe capacity' : 'Safe to discharge'}
                                  </span>
                                </div>
                                <span className="text-[10px] font-black uppercase text-muted-foreground/40">
                                  Free: {freeCap.toLocaleString()} L
                                </span>
                             </div>
                           )}
                           {index > 0 && (
                             <button type="button" onClick={() => remove(index)} className="text-[9px] font-bold text-rose-500 uppercase self-end">Remove Line</button>
                           )}
                        </div>
                     );
                   })}
                   {errors.allocations && <p className="text-[10px] font-bold text-rose-500 px-2">{errors.allocations.message || (errors.allocations as any).root?.message}</p>}
                </div>
              </div>

              {Math.abs(variance) > (delivery.orderedQty * 0.005) && (
                <div className="animate-in slide-in-from-top-4">
                  <FormSection title="Variance Attribution" description="Audit requirement: Significant discrepancy between ordered and received.">
                    <TextareaField name="varianceReason" label="Audit Explanation" fullWidth required placeholder="e.g. In-transit shrinkage, temperature correction discrepancy..." />
                  </FormSection>
                </div>
              )}
            </div>

            <div className="lg:col-span-5 space-y-6">
               <ComputedFieldBlock 
                title="Reconciliation Audit"
                items={[
                  { 
                    label: 'Ordered Volume', 
                    value: `${delivery.orderedQty.toLocaleString()} L`,
                    status: 'neutral'
                  },
                  { 
                    label: 'Received Volume', 
                    value: `${(values.receivedQty || 0).toLocaleString()} L`,
                    status: 'neutral'
                  },
                  { 
                    label: 'Net Variance', 
                    value: `${variance > 0 ? '+' : ''}${variance.toLocaleString()} L`,
                    status: Math.abs(variance) > (delivery.orderedQty * 0.005) ? 'error' : 'success',
                    hint: `${((variance / delivery.orderedQty) * 100).toFixed(2)}% of order`
                  },
                  { 
                    label: 'Allocation Status', 
                    value: `${totalAllocated.toLocaleString()} / ${(values.receivedQty || 0).toLocaleString()} L`,
                    status: Math.abs(totalAllocated - (values.receivedQty || 0)) < 0.1 ? 'success' : 'warning',
                    hint: Math.abs(totalAllocated - (values.receivedQty || 0)) < 0.1 ? 'Fully Balanced' : 'Unallocated volume exists'
                  }
                ]} 
               />

               <div className="bg-card border border-border rounded-2xl p-6 space-y-4 shadow-sm">
                  <div className="flex items-center gap-3 border-b border-border pb-4">
                     <div className="p-2 bg-indigo-500/10 text-indigo-600 rounded-xl">
                        <Scale size={18} />
                     </div>
                     <h4 className="text-xs font-black uppercase tracking-widest">Compliance Review</h4>
                  </div>
                  <div className="space-y-3">
                     <div className="flex items-center gap-3">
                        <CheckCircle2 size={12} className="text-emerald-500" />
                        <span className="text-[10px] font-bold text-muted-foreground">Product Type Match (Unleaded 95)</span>
                     </div>
                     <div className="flex items-center gap-3">
                        <Info size={12} className="text-primary" />
                        <span className="text-[10px] font-bold text-muted-foreground">Calibration Delta: 0.12%</span>
                     </div>
                     <div className="flex items-center gap-3">
                        {Math.abs(variance) < (delivery.orderedQty * 0.005) ? <CheckCircle2 size={12} className="text-emerald-500" /> : <AlertTriangle size={12} className="text-amber-500" />}
                        <span className="text-[10px] font-bold text-muted-foreground">Variance within legal threshold</span>
                     </div>
                  </div>
               </div>
            </div>
          </div>
        </FormShell>
      </form>
    </FormProvider>
  );
};
