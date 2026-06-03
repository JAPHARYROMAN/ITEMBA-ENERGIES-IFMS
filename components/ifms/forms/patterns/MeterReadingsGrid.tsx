
import React, { useRef, useCallback } from 'react';
import { useFormContext, useFieldArray, type FieldErrors } from 'react-hook-form';
import { cn } from '@/lib/utils';

/* ================================================================
   MeterReadingsGrid — Keyboard-navigable nozzle meter readings
   ================================================================ */

interface MeterReadingsGridProps {
  name: string;
  title?: string;
  description?: string;
}

const INPUT_CELL = 'w-full h-9 bg-background border border-input rounded-lg px-3 text-sm font-medium text-right focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none transition-all tabular-nums';

export const MeterReadingsGrid: React.FC<MeterReadingsGridProps> = ({
  name,
  title = 'Meter Readings',
  description = 'Enter opening and closing meter values per nozzle.',
}) => {
  const { control, register, watch, formState: { errors } } = useFormContext();
  const { fields } = useFieldArray({ control, name });
  const gridRef = useRef<HTMLDivElement>(null);

  const getNestedError = (idx: number, field: string): string | undefined => {
    const arr = (errors as FieldErrors)?.[name] as
      | Record<number, Record<string, { message?: string }>>
      | undefined;
    return arr?.[idx]?.[field]?.message;
  };

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>, rowIdx: number, colIdx: number) => {
    const totalCols = 2; // opening, closing
    let nextRow = rowIdx;
    let nextCol = colIdx;

    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault();
      nextRow = Math.min(rowIdx + 1, fields.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      nextRow = Math.max(rowIdx - 1, 0);
    } else if (e.key === 'Tab' && !e.shiftKey) {
      if (colIdx < totalCols - 1) {
        e.preventDefault();
        nextCol = colIdx + 1;
      } else if (rowIdx < fields.length - 1) {
        e.preventDefault();
        nextRow = rowIdx + 1;
        nextCol = 0;
      }
    } else {
      return;
    }

    const selector = `[data-row="${nextRow}"][data-col="${nextCol}"]`;
    const next = gridRef.current?.querySelector<HTMLInputElement>(selector);
    next?.focus();
    next?.select();
  }, [fields.length]);

  return (
    <div className="md:col-span-2">
      <div className="border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-3 bg-muted/20 border-b border-border">
          <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">{title}</h4>
          {description && <p className="text-[10px] text-muted-foreground font-medium mt-0.5">{description}</p>}
        </div>

        {/* Desktop table */}
        <div ref={gridRef} className="hidden md:block">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/10">
                <th className="px-5 py-2.5 text-left text-[9px] font-black uppercase tracking-widest text-muted-foreground">Nozzle</th>
                <th className="px-5 py-2.5 text-right text-[9px] font-black uppercase tracking-widest text-muted-foreground">Opening</th>
                <th className="px-5 py-2.5 text-right text-[9px] font-black uppercase tracking-widest text-muted-foreground">Closing</th>
                <th className="px-5 py-2.5 text-right text-[9px] font-black uppercase tracking-widest text-muted-foreground">Volume (Delta)</th>
              </tr>
            </thead>
            <tbody>
              {fields.map((field, idx) => {
                const opening = watch(`${name}.${idx}.opening`) || 0;
                const closing = watch(`${name}.${idx}.closing`) || 0;
                const delta = closing - opening;
                const hasError = !!getNestedError(idx, 'opening') || !!getNestedError(idx, 'closing');

                return (
                  <tr key={field.id} className={cn('border-b border-border last:border-0', hasError && 'bg-rose-500/5')}>
                    <td className="px-5 py-2.5 text-xs font-bold">
                      {watch(`${name}.${idx}.nozzleLabel`) || `Nozzle ${idx + 1}`}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        {...register(`${name}.${idx}.opening`, { valueAsNumber: true })}
                        type="number"
                        step="0.001"
                        data-row={idx}
                        data-col={0}
                        onKeyDown={(e) => handleKeyDown(e, idx, 0)}
                        className={cn(INPUT_CELL, getNestedError(idx, 'opening') && 'border-rose-500')}
                      />
                      {getNestedError(idx, 'opening') && <p className="text-[9px] text-rose-500 font-bold mt-0.5 text-right">{getNestedError(idx, 'opening')}</p>}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        {...register(`${name}.${idx}.closing`, { valueAsNumber: true })}
                        type="number"
                        step="0.001"
                        data-row={idx}
                        data-col={1}
                        onKeyDown={(e) => handleKeyDown(e, idx, 1)}
                        className={cn(INPUT_CELL, getNestedError(idx, 'closing') && 'border-rose-500')}
                      />
                      {getNestedError(idx, 'closing') && <p className="text-[9px] text-rose-500 font-bold mt-0.5 text-right">{getNestedError(idx, 'closing')}</p>}
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      <span className={cn('text-sm font-black tabular-nums', delta < 0 ? 'text-rose-500' : 'text-emerald-600')}>
                        {delta.toFixed(3)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile stacked fallback */}
        <div className="md:hidden divide-y divide-border">
          {fields.map((field, idx) => {
            const opening = watch(`${name}.${idx}.opening`) || 0;
            const closing = watch(`${name}.${idx}.closing`) || 0;
            const delta = closing - opening;

            return (
              <div key={field.id} className="p-4 space-y-3">
                <p className="text-xs font-black">{watch(`${name}.${idx}.nozzleLabel`) || `Nozzle ${idx + 1}`}</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1 block">Opening</label>
                    <input {...register(`${name}.${idx}.opening`, { valueAsNumber: true })} type="number" step="0.001" className={INPUT_CELL} />
                  </div>
                  <div>
                    <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1 block">Closing</label>
                    <input {...register(`${name}.${idx}.closing`, { valueAsNumber: true })} type="number" step="0.001" className={INPUT_CELL} />
                  </div>
                </div>
                <div className="flex justify-between items-center pt-1">
                  <span className="text-[9px] font-black uppercase text-muted-foreground">Delta</span>
                  <span className={cn('text-sm font-black tabular-nums', delta < 0 ? 'text-rose-500' : 'text-emerald-600')}>{delta.toFixed(3)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
