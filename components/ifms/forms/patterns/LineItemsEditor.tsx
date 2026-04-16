
import React, { useMemo } from 'react';
import { useFormContext, useFieldArray } from 'react-hook-form';
import { Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import ComputedFieldBlock, { type ComputedItem } from './ComputedFieldBlock';

/* ================================================================
   LineItemsEditor — Add/remove rows with per-row validation
   ================================================================ */

interface Column {
  name: string;
  label: string;
  type: 'text' | 'number' | 'select';
  options?: { label: string; value: string }[];
  step?: string;
  placeholder?: string;
  width?: string; // tailwind col-span
}

interface LineItemsEditorProps {
  name: string;
  columns: Column[];
  defaultRow: Record<string, any>;
  title?: string;
  description?: string;
  totalField?: string; // field name within each row to sum for totals
  totalLabel?: string;
  maxRows?: number;
}

const INPUT_CELL = 'w-full h-9 bg-background border border-input rounded-lg px-3 text-sm font-medium focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none transition-all';

export const LineItemsEditor: React.FC<LineItemsEditorProps> = ({
  name,
  columns,
  defaultRow,
  title = 'Line Items',
  description = 'Add or remove line items as needed.',
  totalField,
  totalLabel = 'Total',
  maxRows = 50,
}) => {
  const { control, register, watch, formState: { errors } } = useFormContext();
  const { fields, append, remove } = useFieldArray({ control, name });

  const rows = watch(name) || [];
  const arrErrors = (errors as any)?.[name];

  const grandTotal = useMemo(() => {
    if (!totalField) return 0;
    return rows.reduce((sum: number, row: any) => sum + (Number(row[totalField]) || 0), 0);
  }, [rows, totalField]);

  const computedItems: ComputedItem[] = totalField
    ? [
        { label: 'Line Count', value: fields.length, status: 'neutral' },
        { label: totalLabel, value: `$${grandTotal.toFixed(2)}`, status: grandTotal > 0 ? 'success' : 'neutral' },
      ]
    : [{ label: 'Line Count', value: fields.length, status: 'neutral' }];

  return (
    <div className="md:col-span-2 space-y-4">
      <div className="border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-3 bg-muted/20 border-b border-border flex items-center justify-between">
          <div>
            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">{title}</h4>
            {description && <p className="text-[10px] text-muted-foreground font-medium mt-0.5">{description}</p>}
          </div>
          {fields.length < maxRows && (
            <button
              type="button"
              onClick={() => append(defaultRow)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-primary border border-primary/20 rounded-lg hover:bg-primary/5 transition-colors"
            >
              <Plus size={12} /> Add Row
            </button>
          )}
        </div>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/10">
                <th className="px-3 py-2.5 text-center text-[9px] font-black uppercase tracking-widest text-muted-foreground w-10">#</th>
                {columns.map(col => (
                  <th key={col.name} className="px-3 py-2.5 text-left text-[9px] font-black uppercase tracking-widest text-muted-foreground">{col.label}</th>
                ))}
                <th className="px-3 py-2.5 w-12" />
              </tr>
            </thead>
            <tbody>
              {fields.length === 0 && (
                <tr>
                  <td colSpan={columns.length + 2} className="px-5 py-8 text-center text-xs text-muted-foreground">
                    No items added. Click "Add Row" to begin.
                  </td>
                </tr>
              )}
              {fields.map((field, idx) => (
                <tr key={field.id} className={cn('border-b border-border last:border-0', arrErrors?.[idx] && 'bg-rose-500/5')}>
                  <td className="px-3 py-2 text-center text-[10px] font-black text-muted-foreground">{idx + 1}</td>
                  {columns.map(col => (
                    <td key={col.name} className="px-2 py-2">
                      {col.type === 'select' ? (
                        <select
                          {...register(`${name}.${idx}.${col.name}`)}
                          className={`${INPUT_CELL} appearance-none`}
                        >
                          <option value="">Select...</option>
                          {col.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      ) : (
                        <input
                          {...register(`${name}.${idx}.${col.name}`, col.type === 'number' ? { valueAsNumber: true } : undefined)}
                          type={col.type}
                          step={col.step}
                          placeholder={col.placeholder}
                          className={cn(INPUT_CELL, col.type === 'number' && 'text-right tabular-nums')}
                        />
                      )}
                      {arrErrors?.[idx]?.[col.name] && (
                        <p className="text-[9px] text-rose-500 font-bold mt-0.5">{arrErrors[idx][col.name].message}</p>
                      )}
                    </td>
                  ))}
                  <td className="px-2 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => remove(idx)}
                      className="p-1.5 text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors"
                      title="Remove row"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile stacked fallback */}
        <div className="md:hidden divide-y divide-border">
          {fields.length === 0 && (
            <div className="px-5 py-8 text-center text-xs text-muted-foreground">No items added.</div>
          )}
          {fields.map((field, idx) => (
            <div key={field.id} className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black text-muted-foreground">Item #{idx + 1}</span>
                <button type="button" onClick={() => remove(idx)} className="text-[10px] font-black text-rose-500 uppercase">Remove</button>
              </div>
              {columns.map(col => (
                <div key={col.name}>
                  <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1 block">{col.label}</label>
                  {col.type === 'select' ? (
                    <select {...register(`${name}.${idx}.${col.name}`)} className={`${INPUT_CELL} appearance-none`}>
                      <option value="">Select...</option>
                      {col.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  ) : (
                    <input
                      {...register(`${name}.${idx}.${col.name}`, col.type === 'number' ? { valueAsNumber: true } : undefined)}
                      type={col.type}
                      step={col.step}
                      placeholder={col.placeholder}
                      className={INPUT_CELL}
                    />
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <ComputedFieldBlock title="Items Summary" items={computedItems} />
    </div>
  );
};
