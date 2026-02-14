
import React from 'react';

interface FormSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
}

export const FormSection: React.FC<FormSectionProps> = ({ title, description, children }) => {
  return (
    <div className="space-y-4 pt-4 first:pt-0">
      <div className="border-b border-border pb-2">
        <h3 className="text-sm font-bold uppercase tracking-widest text-primary">{title}</h3>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
        {children}
      </div>
    </div>
  );
};

interface FormFieldProps {
  label: string;
  error?: string;
  children: React.ReactNode;
  help?: string;
  required?: boolean;
}

export const FormFieldWrapper: React.FC<FormFieldProps> = ({ label, error, children, help, required }) => {
  return (
    <div className="space-y-1.5 flex flex-col">
      <label className="text-xs font-bold text-foreground flex items-center gap-1">
        {label}
        {required && <span className="text-rose-500">*</span>}
      </label>
      {children}
      {help && <p className="text-[10px] text-muted-foreground leading-tight">{help}</p>}
      {error && <p className="text-[10px] font-bold text-rose-500 animate-in fade-in slide-in-from-top-1">{error}</p>}
    </div>
  );
};
