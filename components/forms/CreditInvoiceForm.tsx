
import React, { useMemo } from 'react';
import { useForm, FormProvider, useFieldArray, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { FormShell, FormSection, FormSubmitState, PermissionGuard } from '../ifms/forms/Primitives';
import { TextField, NumberField, SelectField, ReadOnlyField } from '../ifms/forms/Fields';
import ComputedFieldBlock from '../ifms/forms/patterns/ComputedFieldBlock';
import { customerRepo, productRepo, invoiceRepo } from '../../lib/repositories';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../../store';
import { Plus, Trash2, Scale, AlertCircle } from 'lucide-react';

const schema = z.object({
  customerId: z.string().min(1, "Customer is required"),
  date: z.string().min(1, "Date is required"),
  dueDate: z.string().min(1, "Due date is required"),
  items: z.array(z.object({
    productId: z.string().min(1, "Product is required"),
    quantity: z.coerce.number().min(0.01, "Qty required"),
    unitPrice: z.coerce.number().min(0.01, "Price required"),
  })).min(1, "At least one line item required"),
});

type InvoiceFormData = z.infer<typeof schema>;

export const CreditInvoiceForm: React.FC<{ onSuccess: () => void; onCancel: () => void; initialCustomerId?: string }> = ({ onSuccess, onCancel, initialCustomerId }) => {
  const queryClient = useQueryClient();
  const { addToast } = useAppStore();

  const { data: customers } = useQuery({ queryKey: ['customers'], queryFn: customerRepo.list });
  const { data: products } = useQuery({ queryKey: ['products'], queryFn: productRepo.list });

  const methods = useForm<InvoiceFormData>({
    resolver: zodResolver(schema),
    defaultValues: { 
      customerId: initialCustomerId || '',
      date: new Date().toISOString().split('T')[0],
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      items: [{ productId: '', quantity: 0, unitPrice: 0 }]
    }
  });

  React.useEffect(() => {
    if (initialCustomerId) methods.setValue('customerId', initialCustomerId);
  }, [initialCustomerId, methods]);

  const { handleSubmit, control, setValue, watch, formState: { isSubmitting, errors } } = methods;
  const { fields, append, remove } = useFieldArray({ control, name: "items" });
  const values = useWatch({ control });

  const summary = useMemo(() => {
    const subtotal = values.items?.reduce((acc, item) => acc + (item.quantity * item.unitPrice), 0) || 0;
    const tax = subtotal * 0.15; // 15% VAT estimate
    const total = subtotal + tax;
    const selectedCust = customers?.find(c => c.id === values.customerId);
    const wouldExceedLimit = (selectedCust?.balance || 0) + total > (selectedCust?.creditLimit || 0);

    return { subtotal, tax, total, wouldExceedLimit, customer: selectedCust };
  }, [values.items, values.customerId, customers]);

  const mutation = useMutation({
    mutationFn: (data: InvoiceFormData) => invoiceRepo.create({
      ...data,
      customerName: customers?.find(c => c.id === data.customerId)?.name || 'Unknown',
      totalAmount: summary.total
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      addToast("Invoice posted to ledger", "success");
      onSuccess();
    }
  });

  return (
    <FormProvider {...methods}>
      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="h-full">
        <FormShell
          title="Issue Credit Invoice"
          description="Revenue Recognition & Receivables Post"
          actions={
            <PermissionGuard>
              <button type="button" onClick={onCancel} className="px-5 py-2.5 text-xs font-black uppercase tracking-widest text-muted-foreground hover:bg-muted rounded-xl transition-all">Cancel</button>
              <button 
                type="submit" 
                disabled={isSubmitting || summary.wouldExceedLimit}
                className="px-8 py-2.5 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest shadow-xl shadow-primary/20 transition-all disabled:opacity-30"
              >
                <FormSubmitState loading={isSubmitting} label="Post & Send Invoice" />
              </button>
            </PermissionGuard>
          }
        >
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-8 space-y-10">
              <FormSection title="Transaction Header" description="Client and timing metadata.">
                <SelectField name="customerId" label="Target Customer" options={customers?.map(c => ({ label: `${c.name} (Limit: $${c.creditLimit.toLocaleString()})`, value: c.id })) || []} required />
                <div className="grid grid-cols-2 gap-4">
                  <TextField name="date" label="Invoice Date" type="date" required />
                  <TextField name="dueDate" label="Due Date" type="date" required />
                </div>
              </FormSection>

              <div className="space-y-6">
                <div className="flex items-center justify-between border-b border-border/60 pb-3">
                  <h3 className="text-xs font-black uppercase tracking-[0.2em] text-primary flex items-center gap-2">Line Item Detail</h3>
                  <button type="button" onClick={() => append({ productId: '', quantity: 0, unitPrice: 0 })} className="text-[10px] font-black text-primary uppercase flex items-center gap-1 hover:underline">
                    <Plus size={12} /> Add Item
                  </button>
                </div>

                <div className="space-y-3">
                   {fields.map((field, index) => (
                     <div key={field.id} className="grid grid-cols-12 gap-3 items-end p-4 bg-muted/20 rounded-2xl animate-in slide-in-from-left-2 transition-all">
                        <div className="col-span-5">
                          <SelectField 
                            name={`items.${index}.productId`} 
                            label="Product" 
                            options={products?.map(p => ({ label: p.name, value: p.id })) || []} 
                          />
                        </div>
                        <div className="col-span-3">
                          <NumberField name={`items.${index}.quantity`} label="Quantity" />
                        </div>
                        <div className="col-span-3">
                          <NumberField name={`items.${index}.unitPrice`} label="Price ($)" step="0.01" />
                        </div>
                        <div className="col-span-1 flex justify-center pb-2">
                           <button type="button" onClick={() => remove(index)} className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors">
                              <Trash2 size={16} />
                           </button>
                        </div>
                     </div>
                   ))}
                   {errors.items && <p className="text-[10px] font-bold text-rose-500 px-2">Line items required with valid pricing.</p>}
                </div>
              </div>
            </div>

            <div className="lg:col-span-4 space-y-6">
               <ComputedFieldBlock 
                title="Financial Summary"
                items={[
                  { label: 'Subtotal', value: `$${summary.subtotal.toLocaleString(undefined, {minimumFractionDigits: 2})}`, status: 'neutral' },
                  { label: 'Estimated Tax (15%)', value: `$${summary.tax.toLocaleString(undefined, {minimumFractionDigits: 2})}`, status: 'neutral' },
                  { label: 'Final Total', value: `$${summary.total.toLocaleString(undefined, {minimumFractionDigits: 2})}`, status: 'neutral' },
                  { label: 'Post-Transaction Bal', value: `$${((summary.customer?.balance || 0) + summary.total).toLocaleString()}`, 
                    status: summary.wouldExceedLimit ? 'error' : 'success',
                    hint: summary.wouldExceedLimit ? 'Warning: Limit Breached' : 'Within Credit Scope' }
                ]}
               />

               <div className="bg-card border border-border rounded-2xl p-6 space-y-4 shadow-sm">
                  <div className="flex items-center gap-3 border-b border-border pb-4 text-primary">
                    <Scale size={18} />
                    <h4 className="text-xs font-black uppercase tracking-widest">Aging Forecast</h4>
                  </div>
                  <div className="space-y-3">
                     <p className="text-[11px] text-muted-foreground leading-relaxed">
                        Posting this invoice will add <span className="font-bold text-foreground">${summary.total.toLocaleString()}</span> to the <span className="font-black text-blue-600">0-30 Day</span> aging bucket. 
                     </p>
                     {summary.wouldExceedLimit && (
                       <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl flex items-start gap-2">
                          <AlertCircle size={14} className="text-rose-600 mt-0.5" />
                          <p className="text-[10px] text-rose-800 font-bold leading-tight">CREDIT HOLD: Account limit exceeded. Requires Managerial override pin.</p>
                       </div>
                     )}
                  </div>
               </div>
            </div>
          </div>
        </FormShell>
      </form>
    </FormProvider>
  );
};
