
import React, { useMemo } from 'react';
import { useFormContext, useFieldArray } from 'react-hook-form';
import { Plus, Trash2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import ComputedFieldBlock, { type ComputedItem } from './ComputedFieldBlock';

/* ================================================================
   PaymentSplitEditor — Split payment across methods
   ================================================================ */

interface PaymentSplitEditorProps {
  name: string;
  totalDue: number;
  title?: string;
  description?: string;
  paymentMethods?: { label: string; value: string }[];
}

const INPUT_CELL = 'w-full h-9 bg-background border border-input rounded-lg px-3 text-sm font-medium focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none transition-all tabular-nums';

export const PaymentSplitEditor: React.FC<PaymentSplitEditorProps> = ({
  name,
  totalDue,
  title = 'Payment Split',
  description = 'Allocate payment across methods. Total must equal amount due.',
  paymentMethods = [
    { label: 'Cash', value: 'cash' },
    { label: 'Card', value: 'card' },
    { label: 'Mobile Money', value: 'mobile' },
    { label: 'Bank Transfer', value: 'bank_transfer' },
    { label: 'Voucher', value: 'voucher' },
  ],
}) => {
  const { control, register, watch, formState: { errors } } = useFormContext();
  const { fields, append, remove } = useFieldArray({ control, name });

  const splits = watch(name) || [];
  const totalAllocated = useMemo(() => splits.reduce((sum: number, s: any) => sum + (Number(s.amount) || 0), 0), [splits]);
  const remaining = totalDue - totalAllocated;
  const isBalanced = Math.abs(remaining) < 0.01;

  const computedItems: ComputedItem[] = [
    { label: 'Total Due', value: `$${totalDue.toFixed(2)}`, status: 'neutral' },
    { label: 'Allocated', value: `$${totalAllocated.toFixed(2)}`, status: isBalanced ? 'success' : 'warning' },
    { label: 'Remaining', value: `$${remaining.toFixed(2)}`, status: isBalanced ? 'success' : remaining > 0 ? 'warning' : 'error' },
  ];

  const arrErrors = (errors as any)?.[name];

  return (
    <div className="md:col-span-2 space-y-4">
      <div className="border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-3 bg-muted/20 border-b border-border flex items-center justify-between">
          <div>
            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">{title}</h4>
            {description && <p className="text-[10px] text-muted-foreground font-medium mt-0.5">{description}</p>}
          </div>
          <button
            type="button"
            onClick={() => append({ method: '', amount: 0, reference: '' })}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-primary border border-primary/20 rounded-lg hover:bg-primary/5 transition-colors"
          >
            <Plus size={12} /> Add Method
          </button>
        </div>

        <div className="divide-y divide-border">
          {fields.length === 0 && (
            <div className="px-5 py-8 text-center">
              <p className="text-xs text-muted-foreground">No payment methods added. Click "Add Method" to begin.</p>
            </div>
          )}
          {fields.map((field, idx) => (
            <div key={field.id} className={cn('px-5 py-3 grid grid-cols-1 sm:grid-cols-12 gap-3 items-start', arrErrors?.[idx] && 'bg-rose-500/5')}>
              <div className="sm:col-span-4">
                <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1 block">Method</label>
                <select
                  {...register(`${name}.${idx}.method`)}
                  className={`${INPUT_CELL} appearance-none`}
                >
                  <option value="">Select...</option>
                  {paymentMethods.map(pm => <option key={pm.value} value={pm.value}>{pm.label}</option>)}
                </select>
                {arrErrors?.[idx]?.method && <p className="text-[9px] text-rose-500 font-bold mt-0.5">{arrErrors[idx].method.message}</p>}
              </div>
              <div className="sm:col-span-3">
                <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1 block">Amount</label>
                <input
                  {...register(`${name}.${idx}.amount`, { valueAsNumber: true })}
                  type="number"
                  step="0.01"
                  className={cn(INPUT_CELL, 'text-right')}
                />
                {arrErrors?.[idx]?.amount && <p className="text-[9px] text-rose-500 font-bold mt-0.5">{arrErrors[idx].amount.message}</p>}
              </div>
              <div className="sm:col-span-4">
                <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1 block">Reference</label>
                <input
                  {...register(`${name}.${idx}.reference`)}
                  type="text"
                  placeholder="Txn ref..."
                  className={INPUT_CELL}
                />
              </div>
              <div className="sm:col-span-1 flex items-end justify-center pb-0.5">
                <button
                  type="button"
                  onClick={() => remove(idx)}
                  className="p-2 text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors"
                  title="Remove"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <ComputedFieldBlock title="Payment Summary" items={computedItems} />

      {!isBalanced && fields.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl">
          <AlertCircle size={14} className="text-amber-500 flex-shrink-0" />
          <p className="text-[10px] font-bold text-amber-700">
            {remaining > 0 ? `$${remaining.toFixed(2)} still unallocated.` : `Over-allocated by $${Math.abs(remaining).toFixed(2)}.`}
          </p>
        </div>
      )}
    </div>
  );
};
