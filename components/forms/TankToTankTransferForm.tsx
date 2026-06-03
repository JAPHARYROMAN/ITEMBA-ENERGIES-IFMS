import React from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api/client';
import { useAppStore } from '../../store';

interface TankToTankFormValues {
  fromTankId: string;
  toTankId: string;
  quantity: string;
}

export function TankToTankTransferForm({ onSuccess, onCancel }: { onSuccess: () => void; onCancel: () => void }) {
  const { register, handleSubmit, formState: { errors } } = useForm<TankToTankFormValues>();
  const queryClient = useQueryClient();
  const { addToast } = useAppStore();

  const mutation = useMutation({
    mutationFn: async (data: TankToTankFormValues) => {
      return apiFetch('transfers/tank-to-tank', {
        method: 'POST',
        body: {
          fromTankId: data.fromTankId,
          toTankId: data.toTankId,
          quantity: Number(data.quantity),
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transfers'] });
      addToast('Tank-to-tank transfer completed', 'success');
      onSuccess();
    },
    onError: (err: unknown) => {
      addToast(err instanceof Error ? err.message : 'Transfer failed', 'error');
    },
  });

  return (
    <form onSubmit={handleSubmit((v) => mutation.mutateAsync(v))} className="space-y-4 p-4">
      <div className="space-y-1.5">
        <label className="block text-xs font-black uppercase tracking-wider text-muted-foreground">Source Tank</label>
        {/* eslint-disable-next-line ifms/no-raw-form-inputs -- TextField registers without rules; converting drops the inline `required` validation, changing submit behavior. */}
        <input {...register('fromTankId', { required: 'Required' })} className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm" placeholder="From Tank UUID" />
        {errors.fromTankId && <p className="text-xs text-rose-600">{errors.fromTankId.message}</p>}
      </div>
      <div className="space-y-1.5">
        <label className="block text-xs font-black uppercase tracking-wider text-muted-foreground">Destination Tank</label>
        {/* eslint-disable-next-line ifms/no-raw-form-inputs -- TextField registers without rules; converting drops the inline `required` validation, changing submit behavior. */}
        <input {...register('toTankId', { required: 'Required' })} className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm" placeholder="To Tank UUID" />
        {errors.toTankId && <p className="text-xs text-rose-600">{errors.toTankId.message}</p>}
      </div>
      <div className="space-y-1.5">
        <label className="block text-xs font-black uppercase tracking-wider text-muted-foreground">Quantity (L)</label>
        {/* eslint-disable-next-line ifms/no-raw-form-inputs -- NumberField registers with valueAsNumber and no rules; converting drops the inline `required`/`min` validation and changes the value type. */}
        <input {...register('quantity', { required: 'Required', min: { value: 0.01, message: 'Must be positive' } })} type="number" step="0.01" className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm" />
        {errors.quantity && <p className="text-xs text-rose-600">{errors.quantity.message}</p>}
      </div>
      <div className="flex gap-2 pt-2">
        <button type="submit" disabled={mutation.isPending} className="rounded-xl bg-primary px-4 py-2.5 text-xs font-black uppercase text-primary-foreground hover:opacity-90 disabled:opacity-60">
          {mutation.isPending ? 'Transferring...' : 'Transfer'}
        </button>
        <button type="button" onClick={onCancel} className="rounded-xl border border-border px-4 py-2.5 text-xs font-black uppercase hover:bg-muted">Cancel</button>
      </div>
    </form>
  );
}
