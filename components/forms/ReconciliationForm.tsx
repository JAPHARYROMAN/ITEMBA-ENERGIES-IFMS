import React from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api/client';
import { useAppStore } from '../../store';

interface ReconciliationFormValues {
  shiftId: string;
  expectedVolume: string;
  actualVolume: string;
  notes: string;
}

export function ReconciliationForm({ onSuccess, onCancel }: { onSuccess: () => void; onCancel: () => void }) {
  const { register, handleSubmit, formState: { errors } } = useForm<ReconciliationFormValues>();
  const queryClient = useQueryClient();
  const { addToast } = useAppStore();

  const mutation = useMutation({
    mutationFn: async (data: ReconciliationFormValues) => {
      return apiFetch('inventory/reconciliations', {
        method: 'POST',
        body: {
          shiftId: data.shiftId || undefined,
          expectedVolume: Number(data.expectedVolume),
          actualVolume: Number(data.actualVolume),
          notes: data.notes || undefined,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reconciliations'] });
      addToast('Reconciliation created', 'success');
      onSuccess();
    },
    onError: (err: any) => {
      addToast(err?.message ?? 'Failed to create reconciliation', 'error');
    },
  });

  return (
    <form onSubmit={handleSubmit((v) => mutation.mutateAsync(v))} className="space-y-4 p-4">
      <div className="space-y-1.5">
        <label className="block text-xs font-black uppercase tracking-wider text-muted-foreground">Shift ID (optional)</label>
        <input {...register('shiftId')} className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm" placeholder="Shift UUID" />
      </div>
      <div className="space-y-1.5">
        <label className="block text-xs font-black uppercase tracking-wider text-muted-foreground">Expected Volume (L)</label>
        <input {...register('expectedVolume', { required: 'Required' })} type="number" step="0.01" className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm" />
        {errors.expectedVolume && <p className="text-xs text-rose-600">{errors.expectedVolume.message}</p>}
      </div>
      <div className="space-y-1.5">
        <label className="block text-xs font-black uppercase tracking-wider text-muted-foreground">Actual Volume (L)</label>
        <input {...register('actualVolume', { required: 'Required' })} type="number" step="0.01" className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm" />
        {errors.actualVolume && <p className="text-xs text-rose-600">{errors.actualVolume.message}</p>}
      </div>
      <div className="space-y-1.5">
        <label className="block text-xs font-black uppercase tracking-wider text-muted-foreground">Notes</label>
        <textarea {...register('notes')} rows={3} className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm" />
      </div>
      <div className="flex gap-2 pt-2">
        <button type="submit" disabled={mutation.isPending} className="rounded-xl bg-primary px-4 py-2.5 text-xs font-black uppercase text-primary-foreground hover:opacity-90 disabled:opacity-60">
          {mutation.isPending ? 'Saving...' : 'Create Reconciliation'}
        </button>
        <button type="button" onClick={onCancel} className="rounded-xl border border-border px-4 py-2.5 text-xs font-black uppercase hover:bg-muted">Cancel</button>
      </div>
    </form>
  );
}
