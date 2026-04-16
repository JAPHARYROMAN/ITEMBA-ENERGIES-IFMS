import React from 'react';
import { useTranslation } from 'react-i18next';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  FormShell,
  FormSection,
  FormSubmitState,
  FormErrorBanner,
  UnsavedChangesGuard,
  PermissionGuard,
} from '../ifms/forms/Primitives';
import { SelectField, MoneyField, TextareaField, RadioGroupField } from '../ifms/forms/Fields';
import { expenseRepo } from '../../lib/repositories';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../../store';
import { permissionGroups } from '../../lib/permissions';

const schema = z.object({
  category: z.string().min(1, 'Category is required'),
  amount: z.coerce.number().min(0.01, 'Amount must be greater than zero'),
  description: z.string().min(3, 'Description is too short').max(200),
  paymentSource: z.enum(['Petty Cash', 'Bank Transfer', 'Corporate Card']),
});

type ExpenseFormData = z.infer<typeof schema>;

export const ExpenseForm: React.FC<{ onSuccess: () => void; onCancel: () => void }> = ({
  onSuccess,
  onCancel,
}) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { addToast } = useAppStore();

  const methods = useForm<ExpenseFormData>({
    resolver: zodResolver(schema),
    defaultValues: { paymentSource: 'Petty Cash' },
  });

  const {
    handleSubmit,
    formState: { isSubmitting, isDirty, errors },
  } = methods;

  const mutation = useMutation({
    mutationFn: (data: ExpenseFormData) => expenseRepo.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      addToast(t('forms.saveSuccess', { entity: 'Expense' }), 'success');
      onSuccess();
    },
    onError: (err: any) => addToast(err?.apiError?.message ?? 'Failed to record expense', 'error'),
  });

  return (
    <FormProvider {...methods}>
      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="h-full">
        <FormShell
          title="Record Expense"
          description="General Ledger Entry"
          status={mutation.isPending ? 'loading' : mutation.isError ? 'error' : 'idle'}
          actions={
            <PermissionGuard permissions={permissionGroups.expensesWrite}>
              <button
                type="button"
                onClick={onCancel}
                className="px-5 py-2.5 text-xs font-black uppercase tracking-widest text-muted-foreground hover:bg-muted rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !isDirty}
                className="px-8 py-2.5 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest shadow-xl shadow-primary/20 hover:opacity-90 transition-all disabled:opacity-30"
              >
                <FormSubmitState loading={isSubmitting} label="Record Expense" />
              </button>
            </PermissionGuard>
          }
        >
          <UnsavedChangesGuard />
          <FormErrorBanner show={Object.keys(errors).length > 0 && methods.formState.isSubmitted} />

          <FormSection
            title="Expense Details"
            description="Categorize and describe the expenditure."
          >
            <SelectField
              name="category"
              label="Category"
              required
              options={[
                { label: 'Maintenance', value: 'Maintenance' },
                { label: 'Utility', value: 'Utility' },
                { label: 'Fuel Additive', value: 'Fuel Additive' },
                { label: 'Staff Refreshment', value: 'Staff Refreshment' },
              ]}
            />
            <MoneyField name="amount" label="Amount" required placeholder="0.00" />
            <TextareaField
              name="description"
              label="Description"
              required
              fullWidth
              placeholder="e.g. Printer ink replacement for cashier station..."
            />
          </FormSection>

          <FormSection
            title="Funding"
            description="Where did the funds for this expense come from?"
          >
            <RadioGroupField
              name="paymentSource"
              label="Payment Source"
              required
              fullWidth
              options={[
                { label: 'Petty Cash', value: 'Petty Cash' },
                { label: 'Bank Transfer', value: 'Bank Transfer' },
                { label: 'Corporate Card', value: 'Corporate Card' },
              ]}
            />
          </FormSection>
        </FormShell>
      </form>
    </FormProvider>
  );
};
