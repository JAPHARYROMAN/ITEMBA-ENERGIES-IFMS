import React from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api/client';
import { useAppStore } from '../../store';
import { FieldInput, FieldTextarea } from '../ifms/forms/RawFields';

interface ExpenseCategoryFormValues {
  code: string;
  name: string;
  description: string;
}

export function ExpenseCategoryForm({ onSuccess, onCancel }: { onSuccess: () => void; onCancel: () => void }) {
  const { register, handleSubmit, formState: { errors } } = useForm<ExpenseCategoryFormValues>();
  const queryClient = useQueryClient();
  const { addToast } = useAppStore();

  const mutation = useMutation({
    mutationFn: async (data: ExpenseCategoryFormValues) => {
      return apiFetch('expense-categories', {
        method: 'POST',
        body: {
          code: data.code,
          name: data.name,
          description: data.description || undefined,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expense-categories'] });
      addToast('Category created', 'success');
      onSuccess();
    },
    onError: (err: unknown) => {
      addToast(err instanceof Error ? err.message : 'Failed to create category', 'error');
    },
  });

  return (
    <form onSubmit={handleSubmit((v) => mutation.mutateAsync(v))} className="space-y-4 p-4">
      <div className="space-y-1.5">
        <label className="block text-xs font-black uppercase tracking-wider text-muted-foreground">Code</label>
        <FieldInput {...register('code', { required: 'Required' })} className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm" placeholder="e.g. FUEL" />
        {errors.code && <p className="text-xs text-rose-600">{errors.code.message}</p>}
      </div>
      <div className="space-y-1.5">
        <label className="block text-xs font-black uppercase tracking-wider text-muted-foreground">Name</label>
        <FieldInput {...register('name', { required: 'Required' })} className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm" placeholder="e.g. Fuel Expenses" />
        {errors.name && <p className="text-xs text-rose-600">{errors.name.message}</p>}
      </div>
      <div className="space-y-1.5">
        <label className="block text-xs font-black uppercase tracking-wider text-muted-foreground">Description (optional)</label>
        <FieldTextarea {...register('description')} rows={3} className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm" />
      </div>
      <div className="flex gap-2 pt-2">
        <button type="submit" disabled={mutation.isPending} className="rounded-xl bg-primary px-4 py-2.5 text-xs font-black uppercase text-primary-foreground hover:opacity-90 disabled:opacity-60">
          {mutation.isPending ? 'Saving...' : 'Create Category'}
        </button>
        <button type="button" onClick={onCancel} className="rounded-xl border border-border px-4 py-2.5 text-xs font-black uppercase hover:bg-muted">Cancel</button>
      </div>
    </form>
  );
}
