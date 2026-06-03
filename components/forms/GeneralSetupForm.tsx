import React from 'react';
import { useTranslation } from 'react-i18next';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormShell, FormSection, FormSubmitState, PermissionGuard } from '../ifms/forms/Primitives';
import { TextField, SelectField } from '../ifms/forms/Fields';
import { useAppStore } from '../../store';
import { setupDataSource } from '../../lib/data-source';
import { SUPPORTED_CURRENCIES } from '../../lib/currency';
import { permissionGroups } from '../../lib/permissions';

const schema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  code: z.string().min(2, 'Reference code required'),
  currency: z.string().length(3, 'Currency must be a 3-letter ISO code').optional(),
  companyId: z.string().optional(),
  stationId: z.string().optional(),
  status: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

export const GeneralSetupForm: React.FC<{
  onSuccess: () => void;
  onCancel: () => void;
  entityName: string;
  initialData?: {
    id: string;
    name: string;
    code: string;
    currency?: string;
    companyId?: string;
    stationId?: string;
    status?: string;
  };
}> = ({ onSuccess, onCancel, entityName, initialData }) => {
  const { t } = useTranslation();
  const { addToast } = useAppStore();
  const queryClient = useQueryClient();
  const isCompanyEntity = entityName === 'Company';
  const isStationEntity = entityName === 'Station';
  const isBranchEntity = entityName === 'Branch';
  const isEditing = !!initialData;

  const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: setupDataSource.companies.list,
    enabled: isStationEntity,
  });
  const { data: stations = [] } = useQuery({
    queryKey: ['stations'],
    queryFn: setupDataSource.stations.list,
    enabled: isBranchEntity,
  });

  const methods = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: initialData
      ? {
          name: initialData.name,
          code: initialData.code,
          currency: initialData.currency ?? 'USD',
          companyId: initialData.companyId,
          stationId: initialData.stationId,
          status: initialData.status ?? 'active',
        }
      : { status: 'active', currency: 'USD' },
  });

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      if (isStationEntity) {
        const companyId = data.companyId || companies[0]?.id;
        if (!companyId) throw new Error('Select a company before creating a station.');
        if (isEditing) {
          return setupDataSource.stations.update(initialData.id, {
            companyId,
            code: data.code.trim(),
            name: data.name.trim(),
            status: data.status,
          });
        }
        return setupDataSource.stations.create({
          companyId,
          code: data.code.trim(),
          name: data.name.trim(),
          status: data.status,
        });
      }

      if (isBranchEntity) {
        const stationId = data.stationId || stations[0]?.id;
        if (!stationId) throw new Error('Select a station before creating a branch.');
        if (isEditing) {
          return setupDataSource.branches.update(initialData.id, {
            stationId,
            code: data.code.trim(),
            name: data.name.trim(),
            status: data.status,
          });
        }
        return setupDataSource.branches.create({
          stationId,
          code: data.code.trim(),
          name: data.name.trim(),
          status: data.status,
        });
      }

      if (isEditing) {
        return setupDataSource.companies.update(initialData.id, {
          code: data.code.trim(),
          name: data.name.trim(),
          currency: data.currency,
          status: data.status,
        });
      }
      return setupDataSource.companies.create({
        code: data.code.trim(),
        name: data.name.trim(),
        currency: data.currency,
        status: data.status,
      });
    },
    onSuccess: async () => {
      if (isStationEntity) {
        await queryClient.invalidateQueries({ queryKey: ['stations'] });
      } else if (isBranchEntity) {
        await queryClient.invalidateQueries({ queryKey: ['branches'] });
      } else {
        await queryClient.invalidateQueries({ queryKey: ['companies'] });
      }
      addToast(t('forms.saveSuccess', { entity: entityName }), 'success');
      onSuccess();
    },
    onError: (error: unknown) => {
      const message =
        (error as { apiError?: { message?: string }; message?: string })?.apiError?.message ??
        (error as { message?: string })?.message ??
        `Failed to ${isEditing ? 'update' : 'create'} ${entityName.toLowerCase()}.`;
      addToast(message, 'error');
    },
  });

  const onSubmit = (data: FormData) => mutation.mutate(data);

  return (
    <FormProvider {...methods}>
      <form onSubmit={methods.handleSubmit(onSubmit)} className="h-full">
        <FormShell
          title={isEditing ? `Edit ${entityName}` : `Register New ${entityName}`}
          description="Operational Setup Module"
          actions={
            <PermissionGuard permissions={permissionGroups.setupWrite}>
              <button
                type="button"
                onClick={onCancel}
                className="px-5 py-2.5 text-xs font-black uppercase text-muted-foreground hover:bg-muted rounded-xl"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-8 py-2.5 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest shadow-xl"
              >
                <FormSubmitState
                  loading={methods.formState.isSubmitting}
                  label={isEditing ? 'Save Changes' : 'Commit Entry'}
                />
              </button>
            </PermissionGuard>
          }
        >
          <FormSection title="Base Parameters" description="Core identifiers for system indexing.">
            {isStationEntity ? (
              <SelectField
                name="companyId"
                label="Parent Company"
                required
                options={companies.map((c) => ({ label: c.name, value: c.id }))}
              />
            ) : null}
            {isBranchEntity ? (
              <SelectField
                name="stationId"
                label="Parent Station"
                required
                options={stations.map((s) => ({ label: s.name, value: s.id }))}
              />
            ) : null}
            <TextField
              name="name"
              label={`${entityName} Official Name`}
              required
              placeholder={`e.g. ${entityName} Alpha`}
            />
            <TextField
              name="code"
              label="Internal Reference Code"
              required
              placeholder="e.g. REF-001"
            />
            {isCompanyEntity ? (
              <SelectField
                name="currency"
                label="Default Currency"
                required
                options={SUPPORTED_CURRENCIES.map((c) => ({ label: c, value: c }))}
              />
            ) : null}
            <SelectField
              name="status"
              label="Initial State"
              options={[
                { label: 'Active - Production Ready', value: 'active' },
                { label: 'Inactive - Development', value: 'inactive' },
              ]}
            />
          </FormSection>
        </FormShell>
      </form>
    </FormProvider>
  );
};
