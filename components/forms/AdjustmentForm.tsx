import React from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api/client';
import { useAppStore } from '../../store';

interface AdjustmentFormValues {
  tankId: string;
  volumeDelta: string;
  reason: string;
  notes: string;
}

export function AdjustmentForm({ onSuccess, onCancel }: { onSuccess: () => void; onCancel: () => void }) {
  const { register, handleSubmit, formState: { errors } } = useForm<AdjustmentFormValues>();
  const queryClient = useQueryClient();
  const { addToast } = useAppStore();

  const mutation = useMutation({
    mutationFn: async (data: AdjustmentFormValues) => {
      return apiFetch('adjustments', {
        method: 'POST',
        body: {
          tankId: data.tankId,
          volumeDelta: Number(data.volumeDelta),
          reason: data.reason,
          notes: data.notes || undefined,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adjustments'] });
      addToast('Adjustment created', 'success');
      onSuccess();
    },
    onError: (err: unknown) => {
      addToast(err instanceof Error ? err.message : 'Failed to create adjustment', 'error');
    },
  });

  return (
    <form onSubmit={handleSubmit((v) => mutation.mutateAsync(v))} className="space-y-4 p-4">
      <div className="space-y-1.5">
        <label className="block text-xs font-black uppercase tracking-wider text-muted-foreground">Tank</label>
        {/* eslint-disable-next-line ifms/no-raw-form-inputs -- Fields wrappers call register(name) without rules; converting drops the inline `required` validation, changing submit behavior. */}
        <input {...register('tankId', { required: 'Required' })} className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm" placeholder="Tank UUID" />
        {errors.tankId && <p className="text-xs text-rose-600">{errors.tankId.message}</p>}
      </div>
      <div className="space-y-1.5">
        <label className="block text-xs font-black uppercase tracking-wider text-muted-foreground">Volume Delta (L) — positive = add, negative = subtract</label>
        {/* eslint-disable-next-line ifms/no-raw-form-inputs -- NumberField registers with valueAsNumber and no rules; converting drops the inline `required` validation and changes the value type. */}
        <input {...register('volumeDelta', { required: 'Required' })} type="number" step="0.01" className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm" />
        {errors.volumeDelta && <p className="text-xs text-rose-600">{errors.volumeDelta.message}</p>}
      </div>
      <div className="space-y-1.5">
        <label className="block text-xs font-black uppercase tracking-wider text-muted-foreground">Reason</label>
        {/* eslint-disable-next-line ifms/no-raw-form-inputs -- SelectField registers without rules; converting drops the inline `required` validation, changing submit behavior. */}
        <select {...register('reason', { required: 'Required' })} className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm">
          <option value="">Select reason…</option>
          <option value="spillage">Spillage</option>
          <option value="evaporation">Evaporation</option>
          <option value="meter_error">Meter Error</option>
          <option value="theft">Theft</option>
          <option value="temperature_correction">Temperature Correction</option>
          <option value="other">Other</option>
        </select>
        {errors.reason && <p className="text-xs text-rose-600">{errors.reason.message}</p>}
      </div>
      <div className="space-y-1.5">
        <label className="block text-xs font-black uppercase tracking-wider text-muted-foreground">Notes</label>
        {/* eslint-disable-next-line ifms/no-raw-form-inputs -- TextareaField requires FormProvider context (this form uses bare useForm) and renders its own label, which would duplicate the existing label. */}
        <textarea {...register('notes')} rows={3} className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm" />
      </div>
      <div className="flex gap-2 pt-2">
        <button type="submit" disabled={mutation.isPending} className="rounded-xl bg-primary px-4 py-2.5 text-xs font-black uppercase text-primary-foreground hover:opacity-90 disabled:opacity-60">
          {mutation.isPending ? 'Saving...' : 'Submit Adjustment'}
        </button>
        <button type="button" onClick={onCancel} className="rounded-xl border border-border px-4 py-2.5 text-xs font-black uppercase hover:bg-muted">Cancel</button>
      </div>
    </form>
  );
}
