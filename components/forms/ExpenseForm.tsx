
import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { FormSection, FormFieldWrapper } from '../ifms/FormShell';
import { expenseRepo } from '../../lib/repositories';
import { useMutation, useQueryClient } from '@tanstack/react-query';

const schema = z.object({
  category: z.string().min(1, "Category is required"),
  amount: z.coerce.number().min(0.01, "Amount must be greater than zero"),
  description: z.string().min(3, "Description is too short").max(200),
  paymentSource: z.enum(['Petty Cash', 'Bank Transfer', 'Corporate Card']),
});

type ExpenseFormData = z.infer<typeof schema>;

export const ExpenseForm: React.FC<{ onSuccess: () => void; onCancel: () => void }> = ({ onSuccess, onCancel }) => {
  const queryClient = useQueryClient();
  const { register, handleSubmit, formState: { errors } } = useForm<ExpenseFormData>({
    resolver: zodResolver(schema),
    defaultValues: { paymentSource: 'Petty Cash' }
  });

  const mutation = useMutation({
    mutationFn: (data: ExpenseFormData) => expenseRepo.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      onSuccess();
    }
  });

  return (
    <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-8">
      <FormSection title="Expense Details" description="Categorize and describe the expenditure.">
        <FormFieldWrapper label="Category" error={errors.category?.message} required>
          <select {...register('category')} className="h-10 bg-background border border-input rounded-md px-3 text-sm outline-none focus:ring-2 focus:ring-primary">
            <option value="">Select Category...</option>
            <option value="Maintenance">Maintenance</option>
            <option value="Utility">Utility</option>
            <option value="Fuel Additive">Fuel Additive</option>
            <option value="Staff Refreshment">Staff Refreshment</option>
          </select>
        </FormFieldWrapper>
        <FormFieldWrapper label="Amount ($)" error={errors.amount?.message} required>
          <input type="number" step="0.01" {...register('amount')} className="h-10 bg-background border border-input rounded-md px-3 text-sm outline-none focus:ring-2 focus:ring-primary" />
        </FormFieldWrapper>
        <div className="sm:col-span-2">
          <FormFieldWrapper label="Description" error={errors.description?.message} required>
            <textarea {...register('description')} rows={3} className="bg-background border border-input rounded-md p-3 text-sm outline-none focus:ring-2 focus:ring-primary w-full" placeholder="e.g. Printer ink replacement for cashier station..." />
          </FormFieldWrapper>
        </div>
      </FormSection>

      <FormSection title="Funding" description="Where did the funds for this expense come from?">
        <FormFieldWrapper label="Payment Source" error={errors.paymentSource?.message} required>
           <div className="flex flex-col gap-2 mt-1">
             {['Petty Cash', 'Bank Transfer', 'Corporate Card'].map(opt => (
               <label key={opt} className="flex items-center gap-3 p-3 border border-border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                 <input type="radio" value={opt} {...register('paymentSource')} className="w-4 h-4 text-primary focus:ring-primary" />
                 <span className="text-sm font-medium">{opt}</span>
               </label>
             ))}
           </div>
        </FormFieldWrapper>
      </FormSection>

      <div className="pt-6 border-t border-border flex items-center justify-end gap-3">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-semibold hover:bg-muted rounded-lg">Cancel</button>
        <button type="submit" disabled={mutation.isPending} className="px-6 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-bold shadow-lg shadow-primary/20 hover:opacity-90 disabled:opacity-50">
          {mutation.isPending ? 'Processing...' : 'Record Expense'}
        </button>
      </div>
    </form>
  );
};
