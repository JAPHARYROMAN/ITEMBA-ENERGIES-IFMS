
import React from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { FormShell, FormSection, FormSubmitState, PermissionGuard } from '../ifms/forms/Primitives';
import { TextField, NumberField, SelectField } from '../ifms/forms/Fields';
import { deliveryRepo, supplierRepo, productRepo } from '../../lib/repositories';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../../store';
import { Truck, ShieldAlert } from 'lucide-react';

const schema = z.object({
  supplierId: z.string().min(1, "Supplier is required"),
  deliveryNote: z.string().min(1, "Delivery note number is required"),
  vehicleNo: z.string().min(1, "Vehicle registration is required"),
  driverName: z.string().min(1, "Driver name is required"),
  productId: z.string().min(1, "Product type is required"),
  orderedQty: z.coerce.number().min(1, "Ordered quantity must be greater than zero"),
  expectedDate: z.string().min(1, "Expected arrival date is required"),
});

type CreateDeliveryFormData = z.infer<typeof schema>;

export const CreateDeliveryForm: React.FC<{ onSuccess: () => void; onCancel: () => void }> = ({ onSuccess, onCancel }) => {
  const queryClient = useQueryClient();
  const { addToast } = useAppStore();

  const { data: suppliers } = useQuery({ queryKey: ['suppliers'], queryFn: supplierRepo.list });
  const { data: products } = useQuery({ queryKey: ['products'], queryFn: productRepo.list });

  const methods = useForm<CreateDeliveryFormData>({
    resolver: zodResolver(schema),
    defaultValues: { expectedDate: new Date().toISOString().split('T')[0] }
  });

  const { handleSubmit, watch, formState: { isSubmitting, isDirty } } = methods;
  const selectedSupplierId = watch('supplierId');
  const selectedSupplier = suppliers?.find(s => s.id === selectedSupplierId);

  const mutation = useMutation({
    mutationFn: (data: CreateDeliveryFormData) => deliveryRepo.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deliveries'] });
      addToast("Supply order initialized", "success");
      onSuccess();
    },
    onError: () => addToast("Database rejected delivery creation", "error")
  });

  return (
    <FormProvider {...methods}>
      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="h-full">
        <FormShell
          title="Create Supply Order"
          description="Initialize Fuel Replenishment Logistics"
          status={mutation.isPending ? 'loading' : 'idle'}
          actions={
            <PermissionGuard>
              <button type="button" onClick={onCancel} className="px-5 py-2.5 text-xs font-black uppercase tracking-widest text-muted-foreground hover:bg-muted rounded-xl transition-all">
                Cancel
              </button>
              <button 
                type="submit" 
                disabled={isSubmitting || !isDirty}
                className="px-8 py-2.5 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest shadow-xl shadow-primary/20 hover:opacity-90 transition-all disabled:opacity-30"
              >
                <FormSubmitState loading={isSubmitting} label="Activate Order" />
              </button>
            </PermissionGuard>
          }
        >
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-10">
              <FormSection title="Supplier & Hardware" description="Dispatch source and vehicle identification.">
                <SelectField 
                  name="supplierId" 
                  label="Vendor / Supplier" 
                  options={suppliers?.map(s => ({ label: s.name, value: s.id })) || []} 
                  required 
                />
                <TextField name="vehicleNo" label="Vehicle Reg No" required placeholder="e.g. ABC-1234" />
                <TextField name="deliveryNote" label="Vendor DN Reference" required placeholder="e.g. DN-12345" />
                <TextField name="driverName" label="Vehicle Driver" required placeholder="Full name of driver" />
              </FormSection>

              <FormSection title="Logistics Payload" description="Product type and volume quantification.">
                <SelectField 
                  name="productId" 
                  label="Discharge Product" 
                  options={products?.map(p => ({ label: p.name, value: p.id })) || []} 
                  required 
                />
                <NumberField name="orderedQty" label="Ordered Volume (Liters)" required placeholder="0.00" />
                <TextField name="expectedDate" label="Expected ETA" type="date" required />
              </FormSection>
            </div>

            <div className="space-y-6">
               <h3 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                 <Truck size={14} className="text-primary" />
                 Vendor Insights
               </h3>
               {selectedSupplier ? (
                 <div className={`p-6 rounded-2xl border ${
                   selectedSupplier.rating === 'Elite' ? 'bg-emerald-500/5 border-emerald-500/20' : 
                   selectedSupplier.rating === 'At Risk' ? 'bg-rose-500/5 border-rose-500/20' : 
                   'bg-muted/30 border-border'
                 }`}>
                   <div className="flex items-center justify-between mb-4">
                      <span className="text-[9px] font-black uppercase tracking-widest opacity-40">Supplier Perf</span>
                      <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${
                        selectedSupplier.rating === 'Elite' ? 'bg-emerald-500 text-white' : 
                        selectedSupplier.rating === 'At Risk' ? 'bg-rose-500 text-white' : 
                        'bg-slate-500 text-white'
                      }`}>
                        {selectedSupplier.rating}
                      </span>
                   </div>
                   <p className="text-sm font-black text-foreground mb-1">{selectedSupplier.name}</p>
                   <div className="space-y-2 mt-4">
                      <div className="flex justify-between text-[10px]">
                         <span className="text-muted-foreground">Avg. Variance</span>
                         <span className={`font-bold ${selectedSupplier.avgVariance < 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                           {selectedSupplier.avgVariance}%
                         </span>
                      </div>
                      <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
                         <div className="h-full bg-primary" style={{ width: '85%' }} />
                      </div>
                   </div>
                   {selectedSupplier.rating === 'At Risk' && (
                     <div className="mt-6 flex items-start gap-2 p-3 bg-white/50 border border-rose-100 rounded-xl">
                        <ShieldAlert size={14} className="text-rose-500 flex-shrink-0" />
                        <p className="text-[10px] text-rose-800 leading-snug font-medium italic">High historical shrinkage reported. Physical dip mandatory before discharge.</p>
                     </div>
                   )}
                 </div>
               ) : (
                 <div className="p-12 border-2 border-dashed border-border rounded-3xl flex flex-col items-center justify-center text-center opacity-30">
                    <Truck size={32} className="mb-2" />
                    <p className="text-[10px] font-bold uppercase">Select supplier to view performance audit</p>
                 </div>
               )}
            </div>
          </div>
        </FormShell>
      </form>
    </FormProvider>
  );
};
