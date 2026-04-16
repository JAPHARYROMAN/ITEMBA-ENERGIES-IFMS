import React from 'react';
import { useTranslation } from 'react-i18next';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { FormShell, FormSection, FormSubmitState, PermissionGuard } from '../ifms/forms/Primitives';
import { TextField, NumberField, SelectField, TextareaField } from '../ifms/forms/Fields';
import { customerRepo } from '../../lib/repositories';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../../store';
import { permissionGroups } from '../../lib/permissions';

const schema = z.object({
  name: z.string().min(3, 'Name must be at least 3 characters'),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().max(64).optional(),
  address: z.string().max(512).optional(),
  taxId: z.string().max(64).optional(),
  creditLimit: z.coerce.number().min(0, 'Limit cannot be negative'),
  paymentTerms: z.string().min(1, 'Payment terms required'),
  status: z.string().optional(),
  notes: z.string().max(500).optional(),
});

type CustomerFormData = z.infer<typeof schema>;

export const CustomerForm: React.FC<{ onSuccess: () => void; onCancel: () => void }> = ({
  onSuccess,
  onCancel,
}) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { addToast } = useAppStore();

  const methods = useForm<CustomerFormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      creditLimit: 5000,
      paymentTerms: 'net30',
      status: 'active',
    },
  });

  const {
    handleSubmit,
    formState: { isSubmitting, isDirty },
  } = methods;

  const mutation = useMutation({
    mutationFn: (data: CustomerFormData) =>
      customerRepo.create({
        name: data.name,
        email: data.email || undefined,
        phone: data.phone || undefined,
        address: data.address || undefined,
        taxId: data.taxId || undefined,
        creditLimit: data.creditLimit,
        paymentTerms: data.paymentTerms,
        status: data.status,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      addToast(t('forms.saveSuccess', { entity: 'Customer' }), 'success');
      onSuccess();
    },
    onError: (err: any) => {
      const msg = err?.apiError?.message ?? err?.message ?? 'Failed to create customer account.';
      addToast(msg, 'error');
    },
  });

  return (
    <FormProvider {...methods}>
      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="h-full">
        <FormShell
          title="Create Corporate Account"
          description="Financial Credit Management"
          status={mutation.isPending ? 'loading' : 'idle'}
          actions={
            <PermissionGuard permissions={permissionGroups.creditWrite}>
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
                <FormSubmitState loading={isSubmitting} label="Authorize Account" />
              </button>
            </PermissionGuard>
          }
        >
          <FormSection
            title="Core Information"
            description="Legal entity name and primary contact details for billing."
          >
            <TextField
              name="name"
              label="Legal Business Name"
              required
              placeholder="e.g. Acme Logistics Ltd"
            />
            <TextField
              name="email"
              label="Billing Email"
              placeholder="accounts@business.com"
              hint="Digital invoices will be routed here."
            />
            <TextField name="phone" label="Phone Number" placeholder="+27 11 123 4567" />
            <TextField
              name="address"
              label="Physical Address"
              placeholder="123 Main Street, Johannesburg"
            />
            <TextField name="taxId" label="Tax ID / VAT Number" placeholder="e.g. VAT4700123456" />
          </FormSection>

          <FormSection
            title="Financial Controls"
            description="Credit exposure limits and payment terms."
          >
            <NumberField
              name="creditLimit"
              label="Credit Exposure Limit"
              required
              hint="Maximum outstanding balance allowed before automated cutoff."
            />
            <SelectField
              name="paymentTerms"
              label="Payment Terms"
              required
              options={[
                { label: 'Net 7 Days', value: 'net7' },
                { label: 'Net 15 Days', value: 'net15' },
                { label: 'Net 30 Days', value: 'net30' },
                { label: 'Net 60 Days', value: 'net60' },
                { label: 'Net 90 Days', value: 'net90' },
                { label: 'Cash on Delivery', value: 'cod' },
              ]}
            />
            <SelectField
              name="status"
              label="Account Status"
              options={[
                { label: 'Active', value: 'active' },
                { label: 'Suspended', value: 'suspended' },
              ]}
            />
          </FormSection>

          <FormSection
            title="Administrative"
            description="Internal audit notes and special handling instructions."
          >
            <TextareaField
              name="notes"
              label="Account Notes"
              fullWidth
              placeholder="e.g. Requires PO number on all fuel receipts..."
            />
          </FormSection>
        </FormShell>
      </form>
    </FormProvider>
  );
};
