import React from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api/client';
import { useAppStore } from '../../store';

interface DipFormValues {
  tankId: string;
  volume: string;
  waterLevel: string;
  temperature: string;
}

export function DipForm({ onSuccess, onCancel }: { onSuccess: () => void; onCancel: () => void }) {
  const { register, handleSubmit, formState: { errors } } = useForm<DipFormValues>();
  const queryClient = useQueryClient();
  const { addToast } = useAppStore();

  const mutation = useMutation({
    mutationFn: async (data: DipFormValues) => {
      return apiFetch('inventory/dips', {
        method: 'POST',
        body: {
          tankId: data.tankId,
          volume: Number(data.volume),
          waterLevel: data.waterLevel ? Number(data.waterLevel) : undefined,
          temperature: data.temperature ? Number(data.temperature) : undefined,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dips'] });
      addToast('Dip recorded successfully', 'success');
      onSuccess();
    },
    onError: (err: any) => {
      addToast(err?.message ?? 'Failed to record dip', 'error');
    },
  });

  return (
    <form onSubmit={handleSubmit((v) => mutation.mutateAsync(v))} className="space-y-4 p-4">
      <div className="space-y-1.5">
        <label className="block text-xs font-black uppercase tracking-wider text-muted-foreground">Tank ID</label>
        <input {...register('tankId', { required: 'Required' })} className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm" placeholder="Tank UUID" />
        {errors.tankId && <p className="text-xs text-rose-600">{errors.tankId.message}</p>}
      </div>
      <div className="space-y-1.5">
        <label className="block text-xs font-black uppercase tracking-wider text-muted-foreground">Volume (L)</label>
        <input {...register('volume', { required: 'Required' })} type="number" step="0.01" className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm" />
        {errors.volume && <p className="text-xs text-rose-600">{errors.volume.message}</p>}
      </div>
      <div className="space-y-1.5">
        <label className="block text-xs font-black uppercase tracking-wider text-muted-foreground">Water Level (mm)</label>
        <input {...register('waterLevel')} type="number" step="0.1" className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm" />
      </div>
      <div className="space-y-1.5">
        <label className="block text-xs font-black uppercase tracking-wider text-muted-foreground">Temperature (°C)</label>
        <input {...register('temperature')} type="number" step="0.1" className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm" />
      </div>
      <div className="flex gap-2 pt-2">
        <button type="submit" disabled={mutation.isPending} className="rounded-xl bg-primary px-4 py-2.5 text-xs font-black uppercase text-primary-foreground hover:opacity-90 disabled:opacity-60">
          {mutation.isPending ? 'Saving...' : 'Record Dip'}
        </button>
        <button type="button" onClick={onCancel} className="rounded-xl border border-border px-4 py-2.5 text-xs font-black uppercase hover:bg-muted">Cancel</button>
      </div>
    </form>
  );
}
