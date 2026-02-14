
import React from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { FormShell, FormSection, FormSubmitState, PermissionGuard } from '../ifms/forms/Primitives';
import { TextField, NumberField, ToggleField, TextareaField } from '../ifms/forms/Fields';
import { customerRepo } from '../../lib/repositories';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../../store';

const schema = z.object({
  name: z.string().min(3, "Name must be at least 3 characters"),
  email: z.string().email("Invalid corporate email").optional().or(z.string().length(0)),
  creditLimit: z.coerce.number().min(0, "Limit cannot be negative"),
  isActive: z.boolean().default(true),
  notes: z.string().max(500).optional(),
});

type CustomerFormData = z.infer<typeof schema>;

export const CustomerForm: React.FC<{ onSuccess: () => void; onCancel: () => void }> = ({ onSuccess, onCancel }) => {
  const queryClient = useQueryClient();
  const { addToast } = useAppStore();

  const methods = useForm<CustomerFormData>({
    resolver: zodResolver(schema),
    defaultValues: { creditLimit: 5000, isActive: true }
  });

  const { handleSubmit, formState: { isSubmitting, isDirty } } = methods;

  const mutation = useMutation({
    mutationFn: (data: CustomerFormData) => customerRepo.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      addToast("Corporate customer account created", "success");
      onSuccess();
    },
    onError: () => addToast("Validation failed or database rejected entry.", "error")
  });

  return (
    <FormProvider {...methods}>
      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="h-full">
        <FormShell
          title="Create Corporate Account"
          description="Financial Credit Management"
          status={mutation.isPending ? 'loading' : 'idle'}
          actions={
            <PermissionGuard>
              <button type="button" onClick={onCancel} className="px-5 py-2.5 text-xs font-black uppercase tracking-widest text-muted-foreground hover:bg-muted rounded-xl transition-all">
                Cancel
              </button>
              <button 
                type="submit" 
                disabled={isSubmitting || !isDirty}
                className="px-8 py-2.5 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest shadow-xl shadow-primary/20 hover:opacity-90 transition-all disabled:opacity-30"
              >
                <FormSubmitState loading={isSubmitting} label="Authorize Account" />
              </button>
            </PermissionGuard>
          }
        >
          <FormSection title="Core Information" description="Legal entity name and primary contact details for billing.">
            <TextField name="name" label="Legal Business Name" required placeholder="e.g. Acme Logistics Ltd" />
            <TextField name="email" label="Billing Email" placeholder="accounts@business.com" hint="Digital invoices will be routed here." />
          </FormSection>

          <FormSection title="Financial Controls" description="Credit exposure limits and account status.">
            <NumberField name="creditLimit" label="Credit Exposure Limit ($)" required hint="Maximum outstanding balance allowed before automated cutoff." />
            <ToggleField name="isActive" label="Account Lifecycle State" hint="Disabling will block new credit transactions immediately." />
          </FormSection>

          <FormSection title="Administrative" description="Internal audit notes and special handling instructions.">
            <TextareaField name="notes" label="Account Notes" fullWidth placeholder="e.g. Requires PO number on all fuel receipts..." />
          </FormSection>
        </FormShell>
      </form>
    </FormProvider>
  );
};
