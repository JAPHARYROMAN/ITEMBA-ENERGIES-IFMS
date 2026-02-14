
import React from 'react';
import { useFormContext } from 'react-hook-form';
import { FormGrid } from './Primitives';

interface BaseFieldProps {
  name: string;
  label: string;
  hint?: string;
  required?: boolean;
  fullWidth?: boolean;
  disabled?: boolean;
}

const FieldWrapper: React.FC<BaseFieldProps & { children: React.ReactNode }> = ({ name, label, hint, required, fullWidth, children }) => {
  const { formState: { errors } } = useFormContext();
  const error = errors[name]?.message as string;

  return (
    <FormGrid fullWidth={fullWidth}>
      <label className="text-xs font-black uppercase tracking-widest text-foreground flex items-center gap-1.5 mb-1.5">
        {label}
        {required && <span className="text-rose-500 font-black" aria-hidden="true">*</span>}
      </label>
      <div className="relative">
        {children}
      </div>
      {hint && !error && <p className="text-[10px] text-muted-foreground mt-1.5 font-medium leading-tight">{hint}</p>}
      {error && <p className="text-[10px] font-bold text-rose-500 mt-1.5 animate-in slide-in-from-top-1">{error}</p>}
    </FormGrid>
  );
};

export const TextField: React.FC<BaseFieldProps & { placeholder?: string; type?: string }> = (props) => {
  const { register } = useFormContext();
  return (
    <FieldWrapper {...props}>
      <input
        {...register(props.name)}
        type={props.type || 'text'}
        placeholder={props.placeholder}
        disabled={props.disabled}
        className="w-full h-10 bg-background border border-input rounded-xl px-4 text-sm font-medium focus:ring-2 focus:ring-primary outline-none transition-all disabled:opacity-50 disabled:bg-muted/30"
      />
    </FieldWrapper>
  );
};

export const NumberField: React.FC<BaseFieldProps & { placeholder?: string; step?: string }> = (props) => {
  const { register } = useFormContext();
  return (
    <FieldWrapper {...props}>
      <input
        {...register(props.name, { valueAsNumber: true })}
        type="number"
        step={props.step || "1"}
        placeholder={props.placeholder}
        disabled={props.disabled}
        className="w-full h-10 bg-background border border-input rounded-xl px-4 text-sm font-medium focus:ring-2 focus:ring-primary outline-none transition-all"
      />
    </FieldWrapper>
  );
};

export const SelectField: React.FC<BaseFieldProps & { options: { label: string; value: string }[] }> = (props) => {
  const { register } = useFormContext();
  return (
    <FieldWrapper {...props}>
      <select
        {...register(props.name)}
        disabled={props.disabled}
        className="w-full h-10 bg-background border border-input rounded-xl px-4 text-sm font-medium focus:ring-2 focus:ring-primary outline-none transition-all appearance-none"
      >
        <option value="">Select an option...</option>
        {props.options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
      </select>
      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none opacity-40">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
      </div>
    </FieldWrapper>
  );
};

export const TextareaField: React.FC<BaseFieldProps & { placeholder?: string; rows?: number }> = (props) => {
  const { register } = useFormContext();
  return (
    <FieldWrapper {...props}>
      <textarea
        {...register(props.name)}
        rows={props.rows || 3}
        placeholder={props.placeholder}
        disabled={props.disabled}
        className="w-full bg-background border border-input rounded-xl p-4 text-sm font-medium focus:ring-2 focus:ring-primary outline-none transition-all no-scrollbar"
      />
    </FieldWrapper>
  );
};

export const ToggleField: React.FC<BaseFieldProps> = (props) => {
  const { register, watch } = useFormContext();
  const checked = watch(props.name);
  return (
    <FieldWrapper {...props}>
      <label className="flex items-center cursor-pointer group w-fit">
        <div className="relative">
          <input 
            type="checkbox" 
            {...register(props.name)} 
            disabled={props.disabled}
            className="sr-only" 
          />
          <div className={`block w-10 h-6 rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-muted border border-border'}`}></div>
          <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform duration-200 ${checked ? 'translate-x-4' : ''}`}></div>
        </div>
        <span className="ml-3 text-[11px] font-black uppercase tracking-widest text-muted-foreground group-hover:text-foreground transition-colors">
          {checked ? 'Active' : 'Disabled'}
        </span>
      </label>
    </FieldWrapper>
  );
};

export const ReadOnlyField: React.FC<BaseFieldProps & { value: string | number }> = (props) => {
  return (
    <FieldWrapper {...props}>
      <div className="w-full h-10 bg-muted/30 border border-dashed border-border rounded-xl px-4 flex items-center text-sm font-black text-muted-foreground">
        {props.value}
      </div>
    </FieldWrapper>
  );
};
