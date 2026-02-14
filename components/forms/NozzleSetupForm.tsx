
import React from 'react';
import { useForm, FormProvider, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { FormShell, FormSection, FormSubmitState, PermissionGuard } from '../ifms/forms/Primitives';
import { TextField, SelectField, ToggleField } from '../ifms/forms/Fields';
import { setupDataSource } from '../../lib/data-source';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../../store';
import { FormFooterMeta } from '../ifms/forms/FormFooterMeta';

const schema = z.object({
  stationId: z.string().min(1, 'Station is required'),
  pumpId: z.string().optional(),
  pumpCode: z.string().optional(),
  nozzleCode: z.string().min(1, 'Nozzle code is required'),
  productId: z.string().min(1, 'Product is required'),
  tankId: z.string().min(1, 'Mapped tank is required'),
  status: z.enum(['Active', 'Inactive']).default('Active'),
}).refine((d) => d.pumpId || (d.pumpCode && d.pumpCode.length > 0), { message: 'Pump is required', path: ['pumpId'] });

type NozzleFormData = z.infer<typeof schema>;

export const NozzleSetupForm: React.FC<{ onSuccess: () => void; onCancel: () => void; initialData?: any }> = ({ onSuccess, onCancel, initialData }) => {
  const queryClient = useQueryClient();
  const { addToast } = useAppStore();

  const { data: stations } = useQuery({ queryKey: ['stations'], queryFn: setupDataSource.stations.list });
  const { data: products } = useQuery({ queryKey: ['products'], queryFn: setupDataSource.products.list });

  const methods = useForm<NozzleFormData>({
    resolver: zodResolver(schema),
    defaultValues: initialData || { status: 'Active' },
  });

  const { handleSubmit, control, formState: { isSubmitting, isDirty } } = methods;
  const values = useWatch({ control });

  const { data: tanks, isLoading: isLoadingTanks } = useQuery({
    queryKey: ['tanks', values.stationId],
    queryFn: () => setupDataSource.tanks.list(values.stationId),
    enabled: !!values.stationId,
  });

  const { data: pumps } = useQuery({
    queryKey: ['pumps', values.stationId],
    queryFn: () => setupDataSource.pumps.list(values.stationId),
    enabled: !!values.stationId,
  });

  const mutation = useMutation({
    mutationFn: (data: NozzleFormData) =>
      setupDataSource.nozzles.create({
        stationId: data.stationId,
        pumpId: data.pumpId,
        pumpCode: data.pumpCode,
        nozzleCode: data.nozzleCode,
        productId: data.productId,
        tankId: data.tankId,
        status: data.status,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nozzles'] });
      addToast('Nozzle mapping finalized', 'success');
      onSuccess();
    },
    onError: (err: any) => addToast(err?.apiError?.message ?? err?.message ?? 'Failed to create nozzle', 'error'),
  });

  return (
    <FormProvider {...methods}>
      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="h-full">
        <FormShell
          title={initialData ? "Modify Nozzle Mapping" : "New Nozzle Configuration"}
          description="Operational Point-of-Sale Mapping"
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
                <FormSubmitState loading={isSubmitting} label="Activate Mapping" />
              </button>
            </PermissionGuard>
          }
        >
          <FormSection title="Identity" description="Hardware identifiers for the pump and nozzle point.">
            {pumps && pumps.length > 0 ? (
              <SelectField name="pumpId" label="Pump" options={pumps.map((p) => ({ label: p.code, value: p.id }))} required />
            ) : (
              <TextField name="pumpCode" label="Pump ID / Master Code" placeholder="e.g. PMP-01" />
            )}
            <TextField name="nozzleCode" label="Nozzle Position" required placeholder="e.g. N-01-A" />
          </FormSection>

          <FormSection title="Mapping & Logic" description="Financial and physical inventory assignment.">
            <SelectField 
              name="stationId" 
              label="Station Assignment" 
              options={stations?.map(s => ({ label: s.name, value: s.id })) || []} 
              required 
            />
            <SelectField 
              name="productId" 
              label="Discharged Product" 
              options={products?.map(p => ({ label: p.name, value: p.id })) || []} 
              required 
            />
            <SelectField 
              name="tankId" 
              label="Inventory Source (Tank)" 
              disabled={!values.stationId || isLoadingTanks}
              options={tanks?.map(t => ({ label: `${t.code} (${t.productId})`, value: t.id })) || []} 
              required 
              hint={!values.stationId ? "Select station to view available tanks" : ""}
            />
          </FormSection>

          <FormSection title="Operational Status" description="Enable or disable this sales point in the system.">
             <SelectField 
              name="status" 
              label="Functional Status" 
              options={[
                { label: 'Active - Serving Sales', value: 'Active' },
                { label: 'Inactive - Maintenance Mode', value: 'Inactive' },
              ]} 
              required 
            />
          </FormSection>

          {initialData && <FormFooterMeta updatedAt={new Date().toISOString()} updatedBy="System Auditor" />}
        </FormShell>
      </form>
    </FormProvider>
  );
};
