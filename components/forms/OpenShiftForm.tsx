import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm, FormProvider, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { FormShell, FormSection, FormSubmitState, PermissionGuard } from '../ifms/forms/Primitives';
import { TextField, NumberField, SelectField } from '../ifms/forms/Fields';
import { ShiftStepper } from '../ifms/forms/ShiftStepper';
import {
  stationRepo,
  branchRepo,
  nozzleRepo,
  shiftRepo,
  companyRepo,
  productRepo,
} from '../../lib/repositories';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../../store';
import { ArrowLeft, ArrowRight, Save, LayoutGrid, Fuel, Users } from 'lucide-react';
import { permissionGroups } from '../../lib/permissions';
import { getErrorMessage } from '../../lib/utils';
import { getStorageItem, setStorageItem, removeStorageItem } from '../../lib/storage';
import { OPEN_SHIFT_DRAFT_KEY } from '../../lib/constants';

const schema = z.object({
  companyId: z.string().min(1, 'Required'),
  stationId: z.string().min(1, 'Required'),
  branchId: z.string().min(1, 'Required'),
  type: z.enum(['Day', 'Night', 'Custom']),
  cashierId: z.string().min(1, 'Required'),
  attendantIds: z.array(z.string()).min(1, 'At least one attendant required'),
  readings: z.array(
    z.object({
      nozzleId: z.string(),
      nozzleCode: z.string(),
      openingReading: z.coerce.number().min(0, 'Reading cannot be negative'),
      pricePerUnit: z.number(),
    }),
  ),
});

type OpenShiftFormData = z.infer<typeof schema>;

export const OpenShiftForm: React.FC<{ onSuccess: () => void; onCancel: () => void }> = ({
  onSuccess,
  onCancel,
}) => {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const queryClient = useQueryClient();
  const { addToast } = useAppStore();

  const methods = useForm<OpenShiftFormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: 'Day',
      attendantIds: ['att-1'],
      readings: [],
    },
  });

  const {
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { isSubmitting, errors },
  } = methods;
  const { fields } = useFieldArray({ control, name: 'readings' });

  const selectedStationId = watch('stationId');

  // Queries
  const { data: companies } = useQuery({ queryKey: ['companies'], queryFn: companyRepo.list });
  const { data: stations } = useQuery({ queryKey: ['stations'], queryFn: stationRepo.list });
  const { data: branches } = useQuery({
    queryKey: ['branches', selectedStationId],
    queryFn: () => branchRepo.list(selectedStationId),
    enabled: !!selectedStationId,
  });
  const { data: products } = useQuery({ queryKey: ['products'], queryFn: productRepo.list });
  const { data: nozzles } = useQuery({
    queryKey: ['nozzles', selectedStationId],
    queryFn: () => nozzleRepo.list(selectedStationId),
    enabled: !!selectedStationId,
  });

  // Populate readings when nozzles load
  useEffect(() => {
    if (nozzles && nozzles.length > 0) {
      const initialReadings = nozzles.map((n) => ({
        nozzleId: n.id,
        nozzleCode: `${n.pumpCode}-${n.nozzleCode}`,
        openingReading: 0,
        pricePerUnit: products?.find((p) => p.id === n.productId)?.pricePerUnit ?? 0,
      }));
      setValue('readings', initialReadings);
    }
  }, [nozzles, products, setValue]);

  const mutation = useMutation({
    mutationFn: (data: OpenShiftFormData) => shiftRepo.open(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      addToast(t('forms.saveSuccess', { entity: 'Shift' }), 'success');
      onSuccess();
    },
    onError: (err: unknown) => addToast(getErrorMessage(err, 'Failed to open shift.'), 'error'),
  });

  const nextStep = async () => {
    const fieldsToValidate =
      step === 0
        ? ['companyId', 'stationId', 'branchId', 'type', 'cashierId', 'attendantIds']
        : ['readings'];

    const isValid = await methods.trigger(fieldsToValidate as any);
    if (isValid) setStep((s) => s + 1);
  };

  const saveDraft = () => {
    const values = methods.getValues();
    const ok = setStorageItem(OPEN_SHIFT_DRAFT_KEY, { ...values, _step: step });
    if (ok) {
      addToast('Draft saved. Use "Restore draft" to continue later.', 'success');
    } else {
      addToast('Could not save draft', 'error');
    }
  };

  const restoreDraft = () => {
    const draft = getStorageItem<Record<string, unknown>>(OPEN_SHIFT_DRAFT_KEY);
    if (!draft) return;
    const { _step, ...values } = draft;
    if (values.companyId) {
      methods.reset(values as any);
      if (typeof _step === 'number') setStep(_step as number);
      addToast('Draft restored', 'info');
      removeStorageItem(OPEN_SHIFT_DRAFT_KEY);
    }
  };

  const hasDraft = (() => {
    const d = getStorageItem<Record<string, unknown>>(OPEN_SHIFT_DRAFT_KEY);
    return !!d?.companyId;
  })();

  const steps = ['Hierarchy', 'Readings', 'Review'];

  return (
    <FormProvider {...methods}>
      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="h-full">
        <FormShell
          title="Initialize Station Shift"
          description="Operational Activation Protocol"
          actions={
            <PermissionGuard permissions={permissionGroups.shiftsOpen}>
              <div className="flex justify-between w-full items-center">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={saveDraft}
                    className="text-[10px] font-black uppercase text-muted-foreground hover:text-foreground"
                  >
                    Save Draft
                  </button>
                  {hasDraft && (
                    <button
                      type="button"
                      onClick={restoreDraft}
                      className="text-[10px] font-black uppercase text-primary hover:underline"
                    >
                      Restore draft
                    </button>
                  )}
                </div>
                <div className="flex gap-3">
                  {step > 0 && (
                    <button
                      type="button"
                      onClick={() => setStep((s) => s - 1)}
                      className="px-5 py-2.5 text-xs font-black uppercase tracking-widest text-muted-foreground hover:bg-muted rounded-xl transition-all flex items-center gap-2"
                    >
                      <ArrowLeft size={14} /> Back
                    </button>
                  )}
                  {step < steps.length - 1 ? (
                    <button
                      type="button"
                      onClick={nextStep}
                      className="px-8 py-2.5 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest shadow-xl shadow-primary/20 flex items-center gap-2"
                    >
                      Next Step <ArrowRight size={14} />
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="px-8 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-xl shadow-emerald-500/20"
                    >
                      <FormSubmitState loading={isSubmitting} label="Authorize & Start Shift" />
                    </button>
                  )}
                </div>
              </div>
            </PermissionGuard>
          }
        >
          <ShiftStepper currentStep={step} steps={steps} />

          {step === 0 && (
            <div className="space-y-10 animate-in fade-in slide-in-from-right-4">
              <FormSection
                title="Hierarchy & Scope"
                description="Assign the shift to a specific organizational node."
              >
                <SelectField
                  name="companyId"
                  label="Corporate Entity"
                  options={companies?.map((c) => ({ label: c.name, value: c.id })) || []}
                  required
                />
                <SelectField
                  name="stationId"
                  label="Operational Station"
                  options={stations?.map((s) => ({ label: s.name, value: s.id })) || []}
                  required
                />
                <SelectField
                  name="branchId"
                  label="Station Branch"
                  options={branches?.map((b) => ({ label: b.name, value: b.id })) || []}
                  required
                  disabled={!selectedStationId}
                />
                <SelectField
                  name="type"
                  label="Shift Cycle"
                  options={[
                    { label: 'Day Shift (06:00 - 18:00)', value: 'Day' },
                    { label: 'Night Shift (18:00 - 06:00)', value: 'Night' },
                  ]}
                  required
                />
              </FormSection>

              <FormSection
                title="Personnel Assignment"
                description="Designate authorized operators for this shift."
              >
                <SelectField
                  name="cashierId"
                  label="Primary Cashier"
                  options={[{ label: 'Sam Cashier (ID: 2)', value: '2' }]}
                  required
                />
                <div className="md:col-span-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">
                    Assigned Attendants
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {['John Attendant', 'Mary Pump', 'Steve Fuel', 'Rose Nozzle'].map((name, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 p-3 border border-border rounded-xl bg-muted/20"
                      >
                        <input
                          type="checkbox"
                          checked={i === 0}
                          readOnly
                          className="w-4 h-4 rounded text-primary"
                        />
                        <span className="text-[10px] font-bold">{name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </FormSection>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
              <div className="bg-amber-500/10 border border-amber-200 p-4 rounded-xl flex items-center gap-3 mb-6">
                <Fuel className="text-amber-600" size={20} />
                <p className="text-xs text-amber-900 font-medium">
                  Verify physical meters match current system state before activation.
                </p>
              </div>

              <div className="border border-border rounded-2xl overflow-hidden bg-card shadow-sm">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-muted/50 border-b border-border">
                    <tr>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                        Hardware ID
                      </th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                        Opening Meter (L)
                      </th>
                      <th className="px-6 py-4 text-right text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                        Unit Price
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {fields.map((field, index) => (
                      <tr key={field.id} className="hover:bg-muted/10">
                        <td className="px-6 py-4">
                          <span className="text-xs font-black">
                            {watch(`readings.${index}.nozzleCode`)}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <input
                            {...methods.register(`readings.${index}.openingReading` as const, {
                              valueAsNumber: true,
                            })}
                            type="number"
                            step="0.01"
                            aria-label={`Opening reading for ${watch(`readings.${index}.nozzleCode`)}`}
                            className={`w-40 h-10 bg-background border border-input rounded-xl px-3 text-sm font-black text-right tabular-nums focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none transition-all ${
                              errors.readings?.[index]?.openingReading
                                ? 'border-rose-500 bg-rose-500/5'
                                : ''
                            }`}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === 'ArrowDown') {
                                e.preventDefault();
                                const next = document.querySelector(
                                  `input[name="readings.${index + 1}.openingReading"]`,
                                ) as HTMLInputElement;
                                if (next) {
                                  next.focus();
                                  next.select();
                                }
                              }
                            }}
                          />
                          {errors.readings?.[index]?.openingReading && (
                            <p className="text-[9px] text-rose-500 font-bold mt-0.5">
                              {errors.readings[index]?.openingReading?.message}
                            </p>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className="text-xs font-bold text-muted-foreground">
                            ${watch(`readings.${index}.pricePerUnit`)?.toFixed(2) || '0.00'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-10 animate-in fade-in slide-in-from-right-4">
              <div className="bg-card border border-border rounded-2xl p-8 text-center space-y-6">
                <div className="w-16 h-16 bg-emerald-500/10 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                  <Save size={32} />
                </div>
                <h3 className="text-xl font-black">Shift Summary Review</h3>
                <div className="max-w-md mx-auto grid grid-cols-2 gap-y-4 text-left">
                  <div className="space-y-1">
                    <p className="text-[9px] font-black text-muted-foreground uppercase">Station</p>
                    <p className="text-xs font-bold">
                      {stations?.find((s) => s.id === selectedStationId)?.name ?? selectedStationId}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[9px] font-black text-muted-foreground uppercase">
                      Shift Type
                    </p>
                    <p className="text-xs font-bold">{watch('type')}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[9px] font-black text-muted-foreground uppercase">
                      Meters Active
                    </p>
                    <p className="text-xs font-bold">{fields.length}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[9px] font-black text-muted-foreground uppercase">
                      Assigned Cashier
                    </p>
                    <p className="text-xs font-bold">ID: {watch('cashierId') || '—'}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </FormShell>
      </form>
    </FormProvider>
  );
};
