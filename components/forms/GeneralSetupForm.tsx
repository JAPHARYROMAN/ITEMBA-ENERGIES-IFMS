
import React from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { FormShell, FormSection, FormSubmitState, PermissionGuard } from '../ifms/forms/Primitives';
import { TextField, SelectField } from '../ifms/forms/Fields';
import { useAppStore } from '../../store';

const schema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  code: z.string().min(2, "Reference code required"),
  status: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

export const GeneralSetupForm: React.FC<{ onSuccess: () => void; onCancel: () => void; entityName: string }> = ({ onSuccess, onCancel, entityName }) => {
  const { addToast } = useAppStore();
  const methods = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { status: 'active' }
  });

  const onSubmit = (data: FormData) => {
    // Local optimistic success placeholder for setup forms
    console.log(`Creating ${entityName}:`, data);
    addToast(`${entityName} entry synchronized successfully.`, 'success');
    onSuccess();
  };

  return (
    <FormProvider {...methods}>
      <form onSubmit={methods.handleSubmit(onSubmit)} className="h-full">
        <FormShell
          title={`Register New ${entityName}`}
          description="Operational Setup Module"
          actions={
            <PermissionGuard>
              <button type="button" onClick={onCancel} className="px-5 py-2.5 text-xs font-black uppercase text-muted-foreground hover:bg-muted rounded-xl">Cancel</button>
              <button type="submit" className="px-8 py-2.5 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest shadow-xl">
                <FormSubmitState loading={methods.formState.isSubmitting} label="Commit Entry" />
              </button>
            </PermissionGuard>
          }
        >
          <FormSection title="Base Parameters" description="Core identifiers for system indexing.">
            <TextField name="name" label={`${entityName} Official Name`} required placeholder={`e.g. ${entityName} Alpha`} />
            <TextField name="code" label="Internal Reference Code" required placeholder="e.g. REF-001" />
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
