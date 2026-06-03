
import React, { useMemo } from 'react';
import { useFormContext, type FieldErrors } from 'react-hook-form';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import ComputedFieldBlock, { type ComputedItem } from './ComputedFieldBlock';

/* ================================================================
   AllocationEditor — Allocate received qty to tanks
   ================================================================ */

interface Tank {
  id: string;
  label: string;
  capacity: number;
  currentLevel: number;
}

interface AllocationRow {
  tankId?: string;
  qty?: number | string;
}

type AllocationFieldError = { message?: string };

interface AllocationEditorProps {
  name: string;
  totalQty: number;
  tanks: Tank[];
  title?: string;
  description?: string;
}

const INPUT_CELL = 'w-full h-9 bg-background border border-input rounded-lg px-3 text-sm font-medium text-right focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none transition-all tabular-nums';

export const AllocationEditor: React.FC<AllocationEditorProps> = ({
  name,
  totalQty,
  tanks,
  title = 'Tank Allocation',
  description = 'Distribute received volume across tanks. Must sum exactly to total.',
}) => {
  const { register, watch, formState: { errors } } = useFormContext();
  const watchedAllocations = watch(name) as AllocationRow[] | undefined;

  const totalAllocated = useMemo(
    () =>
      (watchedAllocations ?? []).reduce(
        (sum: number, a: AllocationRow) => sum + (Number(a.qty) || 0),
        0,
      ),
    [watchedAllocations],
  );
  const remaining = totalQty - totalAllocated;
  const isBalanced = Math.abs(remaining) < 0.01;

  const arrErrors = (errors as FieldErrors)?.[name] as
    | Record<number, { qty?: AllocationFieldError }>
    | undefined;

  const computedItems: ComputedItem[] = [
    { label: 'Total Received', value: `${totalQty.toLocaleString()} L`, status: 'neutral' },
    { label: 'Allocated', value: `${totalAllocated.toLocaleString()} L`, status: isBalanced ? 'success' : 'warning' },
    { label: 'Remaining', value: `${remaining.toFixed(1)} L`, status: isBalanced ? 'success' : remaining > 0 ? 'warning' : 'error' },
  ];

  return (
    <div className="md:col-span-2 space-y-4">
      <div className="border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-3 bg-muted/20 border-b border-border">
          <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">{title}</h4>
          {description && <p className="text-[10px] text-muted-foreground font-medium mt-0.5">{description}</p>}
        </div>

        {/* Desktop table */}
        <div className="hidden md:block">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/10">
                <th className="px-5 py-2.5 text-left text-[9px] font-black uppercase tracking-widest text-muted-foreground">Tank</th>
                <th className="px-5 py-2.5 text-right text-[9px] font-black uppercase tracking-widest text-muted-foreground">Capacity</th>
                <th className="px-5 py-2.5 text-right text-[9px] font-black uppercase tracking-widest text-muted-foreground">Current Level</th>
                <th className="px-5 py-2.5 text-right text-[9px] font-black uppercase tracking-widest text-muted-foreground">Available</th>
                <th className="px-5 py-2.5 text-right text-[9px] font-black uppercase tracking-widest text-muted-foreground">Allocate (L)</th>
              </tr>
            </thead>
            <tbody>
              {tanks.map((tank, idx) => {
                const available = tank.capacity - tank.currentLevel;
                const allocated = Number(watch(`${name}.${idx}.qty`)) || 0;
                const overCapacity = allocated > available;

                return (
                  <tr key={tank.id} className={cn('border-b border-border last:border-0', overCapacity && 'bg-rose-500/5')}>
                    <td className="px-5 py-2.5">
                      <span className="text-xs font-bold">{tank.label}</span>
                      <input type="hidden" {...register(`${name}.${idx}.tankId`)} value={tank.id} />
                    </td>
                    <td className="px-5 py-2.5 text-right text-xs text-muted-foreground tabular-nums">{tank.capacity.toLocaleString()}</td>
                    <td className="px-5 py-2.5 text-right text-xs text-muted-foreground tabular-nums">{tank.currentLevel.toLocaleString()}</td>
                    <td className="px-5 py-2.5 text-right text-xs font-bold tabular-nums">{available.toLocaleString()}</td>
                    <td className="px-3 py-2">
                      <input
                        {...register(`${name}.${idx}.qty`, { valueAsNumber: true })}
                        type="number"
                        step="0.1"
                        min={0}
                        max={available}
                        className={cn(INPUT_CELL, overCapacity && 'border-rose-500')}
                      />
                      {overCapacity && <p className="text-[9px] text-rose-500 font-bold mt-0.5 text-right">Exceeds capacity</p>}
                      {arrErrors?.[idx]?.qty && <p className="text-[9px] text-rose-500 font-bold mt-0.5 text-right">{arrErrors[idx].qty.message}</p>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile stacked fallback */}
        <div className="md:hidden divide-y divide-border">
          {tanks.map((tank, idx) => {
            const available = tank.capacity - tank.currentLevel;
            return (
              <div key={tank.id} className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black">{tank.label}</span>
                  <span className="text-[10px] text-muted-foreground">Avail: {available.toLocaleString()} L</span>
                </div>
                <input type="hidden" {...register(`${name}.${idx}.tankId`)} value={tank.id} />
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1 block">Allocate (L)</label>
                  <input
                    {...register(`${name}.${idx}.qty`, { valueAsNumber: true })}
                    type="number"
                    step="0.1"
                    className={INPUT_CELL}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <ComputedFieldBlock title="Allocation Summary" items={computedItems} />

      {!isBalanced && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl">
          <AlertCircle size={14} className="text-amber-500 flex-shrink-0" />
          <p className="text-[10px] font-bold text-amber-700">
            {remaining > 0 ? `${remaining.toFixed(1)} L still unallocated.` : `Over-allocated by ${Math.abs(remaining).toFixed(1)} L.`}
          </p>
        </div>
      )}
    </div>
  );
};
