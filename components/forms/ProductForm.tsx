import React from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { FormShell, FormSection, FormSubmitState, PermissionGuard } from '../ifms/forms/Primitives';
import { TextField, NumberField, SelectField } from '../ifms/forms/Fields';
import { setupDataSource } from '../../lib/data-source';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../../store';

const schema = z.object({
  companyId: z.string().min(1, 'Company is required'),
  code: z.string().min(1, 'Code is required'),
  name: z.string().min(1, 'Name is required'),
  category: z.string().min(1, 'Category is required'),
  pricePerUnit: z.coerce.number().min(0, 'Price must be non-negative'),
  unit: z.string().optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

type ProductFormData = z.infer<typeof schema>;

interface ProductFormProps {
  onSuccess: () => void;
  onCancel: () => void;
  initialData?: Partial<ProductFormData>;
}

export const ProductForm: React.FC<ProductFormProps> = ({ onSuccess, onCancel, initialData }) => {
  const queryClient = useQueryClient();
  const { addToast } = useAppStore();

  const { data: companies } = useQuery({ queryKey: ['companies'], queryFn: setupDataSource.companies.list });

  const methods = useForm<ProductFormData>({
    resolver: zodResolver(schema),
    defaultValues: initialData ?? { status: 'active', unit: 'L' },
  });

  const { handleSubmit, formState: { isSubmitting, isDirty } } = methods;

  const mutation = useMutation({
    mutationFn: (data: ProductFormData) =>
      setupDataSource.products.create({
        companyId: data.companyId,
        code: data.code,
        name: data.name,
        category: data.category,
        pricePerUnit: data.pricePerUnit,
        unit: data.unit,
        status: data.status,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      addToast('Product created successfully', 'success');
      onSuccess();
    },
    onError: (err: any) => {
      addToast(err?.apiError?.message ?? err?.message ?? 'Failed to create product', 'error');
    },
  });

  const onSubmit = (data: ProductFormData) => mutation.mutate(data);

  return (
    <FormProvider {...methods}>
      <form onSubmit={handleSubmit(onSubmit)} className="h-full">
        <FormShell
          title={initialData ? 'Edit Product' : 'Create Product'}
          description="Product catalog entry"
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
                <FormSubmitState loading={isSubmitting} label="Save Product" />
              </button>
            </PermissionGuard>
          }
        >
          <FormSection title="Identity" description="Product identifiers.">
            <SelectField
              name="companyId"
              label="Company"
              options={companies?.map((c) => ({ label: c.name, value: c.id })) ?? []}
              required
            />
            <TextField name="code" label="Code" required placeholder="e.g. UNL95" />
            <TextField name="name" label="Name" required placeholder="e.g. Unleaded 95" />
            <SelectField
              name="category"
              label="Category"
              options={[
                { label: 'Fuel', value: 'Fuel' },
                { label: 'Lubricant', value: 'Lubricant' },
                { label: 'Other', value: 'Other' },
              ]}
              required
            />
            <NumberField name="pricePerUnit" label="Price per unit" required />
            <TextField name="unit" label="Unit" placeholder="L" />
            <SelectField
              name="status"
              label="Status"
              options={[
                { label: 'Active', value: 'active' },
                { label: 'Inactive', value: 'inactive' },
              ]}
            />
          </FormSection>
        </FormShell>
      </form>
    </FormProvider>
  );
}
