
import React, { useState, useEffect, useMemo } from 'react';
import { useForm, FormProvider, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  CreditCard, 
  Banknote, 
  Smartphone, 
  Ticket, 
  ShoppingCart, 
  Fuel, 
  User, 
  Printer, 
  X, 
  CheckCircle2, 
  AlertCircle,
  Hash,
  ShieldCheck,
  Zap
} from 'lucide-react';
import { useAuthStore, useAppStore } from '../../store';
import { productRepo, nozzleRepo, saleRepo } from '../../lib/repositories';
import { TextField, NumberField, SelectField, ReadOnlyField } from '../ifms/forms/Fields';
import { FormSubmitState } from '../ifms/forms/Primitives';

const schema = z.object({
  productId: z.string().min(1, "Select product"),
  nozzleId: z.string().optional(),
  pricePerUnit: z.number().min(0.01),
  priceOverrideReason: z.string().optional(),
  quantity: z.coerce.number().min(0.001, "Quantity required"),
  discount: z.coerce.number().min(0).max(50, "Discount exceeds limit"),
  payment: z.object({
    cash: z.coerce.number().default(0),
    card: z.coerce.number().default(0),
    mobile: z.coerce.number().default(0),
    voucher: z.coerce.number().default(0),
  }),
}).superRefine((data, ctx) => {
  const totalDue = (data.quantity * data.pricePerUnit) - data.discount;
  const totalPaid = data.payment.cash + data.payment.card + data.payment.mobile + data.payment.voucher;
  
  if (Math.abs(totalPaid - totalDue) > 0.01) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Total payment ($${totalPaid.toFixed(2)}) must match total due ($${totalDue.toFixed(2)})`,
      path: ["payment"],
    });
  }
});

type POSFormData = z.infer<typeof schema>;

const POSPage: React.FC = () => {
  const { user } = useAuthStore();
  const { addToast } = useAppStore();
  const queryClient = useQueryClient();
  const [showReceipt, setShowReceipt] = useState<any>(null);

  const { data: products } = useQuery({ queryKey: ['products'], queryFn: productRepo.list });
  const { data: nozzles } = useQuery({ queryKey: ['nozzles'], queryFn: () => nozzleRepo.list('s1') });

  const methods = useForm<POSFormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      productId: '',
      quantity: 0,
      discount: 0,
      payment: { cash: 0, card: 0, mobile: 0, voucher: 0 }
    }
  });

  const { handleSubmit, control, setValue, reset, watch, formState: { errors, isSubmitting } } = methods;
  const values = useWatch({ control });

  // Update unit price when product changes
  useEffect(() => {
    if (values.productId && products) {
      const p = products.find(prod => prod.id === values.productId);
      if (p) setValue('pricePerUnit', p.pricePerUnit);
    }
  }, [values.productId, products, setValue]);

  const totalDue = useMemo(() => {
    const gross = (values.quantity || 0) * (values.pricePerUnit || 0);
    return Math.max(0, gross - (values.discount || 0));
  }, [values.quantity, values.pricePerUnit, values.discount]);

  const mutation = useMutation({
    mutationFn: (data: POSFormData) => saleRepo.create(data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      addToast("Transaction successful", "success");
      setShowReceipt(data);
      reset();
    }
  });

  if (user?.role === 'auditor') return (
    <div className="flex flex-col items-center justify-center h-[70vh] opacity-40">
       <ShieldCheck size={64} className="mb-4" />
       <h2 className="text-xl font-black uppercase">POS TERMINAL LOCKED</h2>
       <p className="text-sm font-bold">Audit role cannot access sales functions.</p>
    </div>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in duration-500">
      <FormProvider {...methods}>
        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="lg:col-span-8 space-y-6">
          <div className="bg-card border border-border rounded-[2rem] p-8 shadow-sm space-y-8">
            <div className="flex items-center justify-between border-b border-border pb-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-primary/10 text-primary rounded-2xl">
                  <ShoppingCart size={24} />
                </div>
                <div>
                  <h2 className="text-xl font-black tracking-tight">Active POS Terminal</h2>
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Session: {user?.name} (Shift #4521)</p>
                </div>
              </div>
              <div className="flex gap-2">
                 <button type="button" onClick={() => reset()} className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:bg-muted rounded-xl transition-all">Clear Cart</button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-6">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-2">
                  <Fuel size={14} /> Product Configuration
                </h3>
                <SelectField 
                  name="productId" 
                  label="Select Item" 
                  options={products?.map(p => ({ label: `${p.name} ($${p.pricePerUnit}/L)`, value: p.id })) || []} 
                  required 
                />
                <SelectField 
                  name="nozzleId" 
                  label="Active Nozzle" 
                  options={nozzles?.map(n => ({ label: `${n.pumpCode} - ${n.nozzleCode}`, value: n.id })) || []} 
                  hint="Optional mapping for dispenser audit."
                />
              </div>

              <div className="space-y-6">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-2">
                  <Hash size={14} /> Quantity & Pricing
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <NumberField name="quantity" label="Liters Sold" step="0.001" required />
                  <NumberField name="discount" label="Applied Discount ($)" step="0.01" />
                </div>
                <div className="space-y-4">
                  <NumberField 
                    name="pricePerUnit" 
                    label="Unit Price ($/L)" 
                    step="0.01" 
                    disabled={user?.role !== 'manager'} 
                    hint={user?.role !== 'manager' ? "Manager override required for price change." : ""}
                  />
                  {user?.role === 'manager' && watch('pricePerUnit') !== products?.find(p => p.id === watch('productId'))?.pricePerUnit && (
                    <TextField name="priceOverrideReason" label="Override Rationale" placeholder="e.g. Bulk discount agreement..." required />
                  )}
                </div>
              </div>
            </div>

            <div className="pt-8 border-t border-border">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-primary mb-6 flex items-center gap-2">
                <Banknote size={14} /> Tender Breakdown
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { name: 'payment.cash', label: 'Cash', icon: Banknote, color: 'text-emerald-500' },
                  { name: 'payment.card', label: 'Card', icon: CreditCard, color: 'text-blue-500' },
                  { name: 'payment.mobile', label: 'Mobile', icon: Smartphone, color: 'text-indigo-500' },
                  { name: 'payment.voucher', label: 'Voucher', icon: Ticket, color: 'text-amber-500' },
                ].map(tender => (
                  <div key={tender.name} className="p-4 bg-muted/20 border border-border rounded-2xl space-y-3">
                    <div className="flex items-center gap-2">
                      <tender.icon size={14} className={tender.color} />
                      <span className="text-[10px] font-black uppercase">{tender.label}</span>
                    </div>
                    <input 
                      {...methods.register(tender.name as any, { valueAsNumber: true })}
                      type="number"
                      step="0.01"
                      className="w-full bg-transparent border-none p-0 text-lg font-black focus:ring-0 outline-none"
                      placeholder="0.00"
                    />
                  </div>
                ))}
              </div>
              {errors.payment && <p className="text-[10px] font-bold text-rose-500 mt-3">{errors.payment.message}</p>}
            </div>
          </div>
        </form>

        <aside className="lg:col-span-4 space-y-6">
          <div className="bg-slate-900 text-white rounded-[2rem] p-8 shadow-2xl space-y-12 h-full flex flex-col">
            <div className="space-y-4">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-primary">Summary Order</h3>
              <div className="space-y-2">
                 <div className="flex justify-between text-sm">
                    <span className="opacity-50">Volume:</span>
                    <span className="font-bold">{values.quantity || 0} Liters</span>
                 </div>
                 <div className="flex justify-between text-sm">
                    <span className="opacity-50">Unit Price:</span>
                    <span className="font-bold">${values.pricePerUnit?.toFixed(2) || '0.00'}</span>
                 </div>
                 {values.discount > 0 && (
                   <div className="flex justify-between text-sm text-emerald-400">
                      <span>Discount:</span>
                      <span className="font-bold">-${values.discount.toFixed(2)}</span>
                   </div>
                 )}
              </div>
            </div>

            <div className="flex-1 flex flex-col justify-center text-center py-12">
               <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/60 mb-2">Total Payable</p>
               <p className="text-6xl font-black tracking-tighter">${totalDue.toFixed(2)}</p>
            </div>

            <div className="space-y-4">
               <p className="text-[9px] font-black uppercase text-white/30 text-center tracking-widest">Quick Payment Presets</p>
               <div className="grid grid-cols-3 gap-2">
                  {[20, 50, 100].map(amt => (
                    <button 
                      key={amt}
                      type="button"
                      onClick={() => {
                        const remaining = totalDue - (values.payment.card + values.payment.mobile + values.payment.voucher);
                        setValue('payment.cash', remaining);
                      }}
                      className="py-3 bg-white/5 border border-white/10 rounded-xl text-xs font-black hover:bg-white/10 transition-all"
                    >
                      MAX
                    </button>
                  ))}
               </div>
            </div>

            <button 
              onClick={handleSubmit((d) => mutation.mutate(d))}
              disabled={isSubmitting || totalDue <= 0}
              className="w-full py-6 bg-primary text-white rounded-2xl text-sm font-black uppercase tracking-widest shadow-xl shadow-primary/40 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-20 flex items-center justify-center gap-3"
            >
              {isSubmitting ? <Zap size={18} className="animate-pulse" /> : <Printer size={18} />}
              <FormSubmitState loading={isSubmitting} label="Finalize & Print" />
            </button>
          </div>
        </aside>
      </FormProvider>

      {showReceipt && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
           <div className="bg-white text-slate-900 w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden font-mono border-t-[12px] border-primary flex flex-col gap-6">
              <div className="text-center space-y-1">
                 <div className="w-12 h-12 bg-emerald-500 text-white rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircle2 size={24} />
                 </div>
                 <h3 className="font-black text-lg">SALE COMMITTED</h3>
                 <p className="text-[10px] uppercase font-bold tracking-widest opacity-50">Transaction ID: {showReceipt.id}</p>
              </div>
              
              <div className="border-y border-dashed border-slate-300 py-4 space-y-2 text-[11px]">
                 <div className="flex justify-between"><span>TIMESTAMP:</span> <span className="font-black">{new Date(showReceipt.timestamp).toLocaleString()}</span></div>
                 <div className="flex justify-between"><span>VOLUME:</span> <span className="font-black">{showReceipt.quantity} L</span></div>
                 <div className="flex justify-between"><span>TOTAL DUE:</span> <span className="font-black">${totalDue.toFixed(2)}</span></div>
              </div>

              <div className="space-y-4">
                 <p className="text-[10px] font-black uppercase opacity-40">Payment Methods</p>
                 {Object.entries(showReceipt.payment).map(([type, amt]) => (amt as number) > 0 && (
                   <div key={type} className="flex justify-between text-xs font-bold capitalize">
                      <span>{type}:</span>
                      <span>${(amt as number).toFixed(2)}</span>
                   </div>
                 ))}
              </div>

              <div className="pt-4 flex gap-3">
                <button 
                  onClick={() => setShowReceipt(null)}
                  className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg"
                >
                  New Transaction
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="p-4 bg-muted text-muted-foreground rounded-2xl hover:bg-muted/80 transition-all border border-border"
                  title="Print Copy"
                >
                  <Printer size={18} />
                </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default POSPage;
