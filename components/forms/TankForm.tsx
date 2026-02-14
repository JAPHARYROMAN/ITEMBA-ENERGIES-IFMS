
import React, { useMemo } from 'react';
import { useForm, FormProvider, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { FormShell, FormSection, FormSubmitState, PermissionGuard } from '../ifms/forms/Primitives';
import { TextField, NumberField, SelectField, ReadOnlyField, TextareaField } from '../ifms/forms/Fields';
import { setupDataSource } from '../../lib/data-source';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../../store';
import { FormFooterMeta } from '../ifms/forms/FormFooterMeta';
import { AlertTriangle, CheckCircle2, Droplets, Info } from 'lucide-react';

const schema = z.object({
  companyId: z.string().min(1, "Company is required"),
  stationId: z.string().min(1, "Station is required"),
  branchId: z.string().min(1, "Branch is required"),
  code: z.string().min(1, "Tank code is required"),
  productId: z.string().min(1, "Product is required"),
  capacity: z.coerce.number().min(1, "Capacity must be greater than zero"),
  minLevel: z.coerce.number().min(0, "Min level cannot be negative"),
  maxLevel: z.coerce.number().min(0, "Max level cannot be negative"),
  calibrationProfile: z.string().min(1, "Profile is required"),
  notes: z.string().optional(),
}).refine(data => data.minLevel < data.maxLevel, {
  message: "Min level must be less than max level",
  path: ["minLevel"],
}).refine(data => data.maxLevel <= data.capacity, {
  message: "Max level cannot exceed tank capacity",
  path: ["maxLevel"],
});

type TankFormData = z.infer<typeof schema>;

interface TankFormProps {
  onSuccess: () => void;
  onCancel: () => void;
  initialData?: Partial<TankFormData>;
}

export const TankForm: React.FC<TankFormProps> = ({ onSuccess, onCancel, initialData }) => {
  const queryClient = useQueryClient();
  const { addToast } = useAppStore();

  const { data: companies } = useQuery({ queryKey: ['companies'], queryFn: setupDataSource.companies.list });
  const { data: stations } = useQuery({ queryKey: ['stations'], queryFn: setupDataSource.stations.list });
  const { data: products } = useQuery({ queryKey: ['products'], queryFn: setupDataSource.products.list });

  const methods = useForm<TankFormData>({
    resolver: zodResolver(schema),
    defaultValues: initialData || { 
      capacity: 10000, 
      minLevel: 500, 
      maxLevel: 9500, 
      calibrationProfile: 'Standard-V1' 
    }
  });

  const { handleSubmit, control, formState: { isSubmitting, isDirty, errors } } = methods;
  const values = useWatch({ control });

  // Load branches dynamically based on station
  const { data: branches, isLoading: isLoadingBranches } = useQuery({
    queryKey: ['branches', values.stationId],
    queryFn: () => setupDataSource.branches.list(values.stationId),
    enabled: !!values.stationId,
  });

  const mutation = useMutation({
    mutationFn: (data: TankFormData) => setupDataSource.tanks.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tanks'] });
      addToast('Fuel tank configuration committed', 'success');
      onSuccess();
    },
    onError: (err: any) => addToast(err?.apiError?.message ?? err?.message ?? 'Failed to create tank', 'error'),
  });

  const onSubmit = (data: TankFormData) => mutation.mutate(data);

  // Derived Summary Logic for Right Panel
  const summary = useMemo(() => {
    const selectedProduct = products?.find(p => p.id === values.productId)?.name || 'None';
    const selectedStation = stations?.find(s => s.id === values.stationId)?.name || 'None';
    const safeVolume = (values.maxLevel || 0) - (values.minLevel || 0);
    const hasWarnings = Object.keys(errors).length > 0 || (values.minLevel || 0) > (values.maxLevel || 0);

    return {
      product: selectedProduct,
      station: selectedStation,
      safeVolume,
      hasWarnings
    };
  }, [values, products, stations, errors]);

  return (
    <FormProvider {...methods}>
      <form onSubmit={handleSubmit(onSubmit)} className="h-full flex">
        <div className="flex-1 overflow-hidden">
          <FormShell
            title={initialData ? "Edit Tank Asset" : "Register Fuel Tank"}
            description="Operational Infrastructure Setup"
            status={mutation.isPending ? 'loading' : 'idle'}
            actions={
              <PermissionGuard>
                <button 
                  type="button" 
                  onClick={() => isDirty ? window.confirm("Unsaved changes will be lost. Continue?") && onCancel() : onCancel()} 
                  className="px-5 py-2.5 text-xs font-black uppercase tracking-widest text-muted-foreground hover:bg-muted rounded-xl transition-all"
                >
                  Discard
                </button>
                <button 
                  type="submit" 
                  disabled={isSubmitting || !isDirty}
                  className="px-8 py-2.5 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest shadow-xl shadow-primary/20 hover:opacity-90 transition-all disabled:opacity-30"
                >
                  <FormSubmitState loading={isSubmitting} label="Commit Setup" />
                </button>
              </PermissionGuard>
            }
          >
            <FormSection title="Identity" description="Unique identifiers and administrative codes.">
              <TextField name="code" label="Tank Reference Code" required placeholder="e.g. TNK-SOUTH-01" />
              <SelectField 
                name="productId" 
                label="Product Mapping" 
                options={products?.map(p => ({ label: p.name, value: p.id })) || []} 
                required 
              />
            </FormSection>

            <FormSection title="Assignment" description="Geographic and organizational mapping.">
              <SelectField 
                name="companyId" 
                label="Corporate Entity" 
                options={companies?.map(c => ({ label: c.name, value: c.id })) || []} 
                required 
              />
              <SelectField 
                name="stationId" 
                label="Operational Station" 
                options={stations?.map(s => ({ label: s.name, value: s.id })) || []} 
                required 
              />
              <SelectField 
                name="branchId" 
                label="Station Branch" 
                disabled={!values.stationId || isLoadingBranches}
                options={branches?.map(b => ({ label: b.name, value: b.id })) || []} 
                required 
                hint={!values.stationId ? "Select a station first" : ""}
              />
            </FormSection>

            <FormSection title="Operational Limits" description="Physical capacity and automated alarm thresholds.">
              <NumberField name="capacity" label="Total Capacity (Liters)" required />
              <SelectField 
                name="calibrationProfile" 
                label="Calibration Profile" 
                options={[
                  { label: 'Standard Linear V1', value: 'Standard-V1' },
                  { label: 'Horizontal Cylindrical', value: 'HC-V2' },
                  { label: 'High Precision ATG-3', value: 'ATG3' },
                ]} 
                required 
              />
              <NumberField name="minLevel" label="Low Alarm Threshold (L)" required hint="System triggers low stock warning." />
              <NumberField name="maxLevel" label="Safe Fill Threshold (L)" required hint="Recommended max fill to prevent spill." />
            </FormSection>

            <FormSection title="Notes & Attachments" description="Audit trails and physical verification notes.">
              <TextareaField name="notes" label="Administrative Notes" fullWidth placeholder="Maintenance history, physical dip notes..." />
            </FormSection>

            {initialData && <FormFooterMeta updatedAt={new Date().toISOString()} updatedBy="Alex Manager" />}
          </FormShell>
        </div>

        {/* Right Side Preview Panel - Desktop only */}
        <div className="hidden lg:flex w-72 border-l border-border bg-muted/10 p-6 flex-col gap-8 animate-in slide-in-from-right-4 duration-500">
           <div>
              <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-4">Configuration Summary</h4>
              <div className="space-y-4">
                 <div className="flex flex-col gap-1">
                    <span className="text-[9px] font-bold text-muted-foreground uppercase">Target Asset</span>
                    <span className="text-xs font-black">{values.code || 'UNNAMED_TANK'}</span>
                 </div>
                 <div className="flex flex-col gap-1">
                    <span className="text-[9px] font-bold text-muted-foreground uppercase">Mapped Grade</span>
                    <div className="flex items-center gap-2">
                       <Droplets size={12} className="text-primary" />
                       <span className="text-xs font-bold">{summary.product}</span>
                    </div>
                 </div>
                 <div className="flex flex-col gap-1">
                    <span className="text-[9px] font-bold text-muted-foreground uppercase">Safe Working Volume</span>
                    <span className="text-sm font-black text-primary">{summary.safeVolume.toLocaleString()} L</span>
                 </div>
              </div>
           </div>

           <div className="pt-6 border-t border-border/50">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-4">Integrity Checks</h4>
              <div className="space-y-3">
                 <div className="flex items-center gap-3">
                    <div className={`p-1 rounded-full ${summary.hasWarnings ? 'bg-rose-500/10 text-rose-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                       {summary.hasWarnings ? <AlertTriangle size={12} /> : <CheckCircle2 size={12} />}
                    </div>
                    <span className="text-[10px] font-bold text-muted-foreground">Logical Consistency</span>
                 </div>
                 <div className="flex items-center gap-3">
                    <div className={`p-1 rounded-full ${!values.stationId ? 'bg-amber-500/10 text-amber-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                       {!values.stationId ? <Info size={12} /> : <CheckCircle2 size={12} />}
                    </div>
                    <span className="text-[10px] font-bold text-muted-foreground">Hierarchy Mapping</span>
                 </div>
              </div>
           </div>

           <div className="mt-auto p-4 bg-primary/5 rounded-2xl border border-primary/10">
              <p className="text-[10px] text-primary font-black uppercase tracking-widest mb-1">Expert Tip</p>
              <p className="text-[10px] text-muted-foreground leading-tight">Setting the Safe Fill Threshold to 95% of capacity is recommended by international safety standards.</p>
           </div>
        </div>
      </form>
    </FormProvider>
  );
};
