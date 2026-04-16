
import React, { useState, useRef, useEffect, useId } from 'react';
import { useFormContext, Controller } from 'react-hook-form';
import { FormGrid } from './Primitives';
import { ChevronDown, X, Calendar, Paperclip, Search } from 'lucide-react';

/* ================================================================
   Shared Types & Helpers
   ================================================================ */

interface BaseFieldProps {
  name: string;
  label: string;
  hint?: string;
  required?: boolean;
  fullWidth?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
}

const INPUT_CLASS = 'w-full h-10 bg-background border border-input rounded-xl px-4 text-sm font-medium focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none transition-all disabled:opacity-50 disabled:bg-muted/30 read-only:bg-muted/20 read-only:cursor-default';
const SELECT_CLASS = `${INPUT_CLASS} appearance-none pr-10`;
const TEXTAREA_CLASS = 'w-full min-h-24 bg-background border border-input rounded-xl p-4 text-sm font-medium focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none transition-all resize-y disabled:opacity-50 disabled:bg-muted/30 no-scrollbar';

function getNestedError(errors: any, name: string): string | undefined {
  const parts = name.split('.');
  let current = errors;
  for (const part of parts) {
    if (!current) return undefined;
    current = current[part];
  }
  return current?.message as string | undefined;
}

/* ================================================================
   FieldWrapper — Shared label + error + hint layout
   ================================================================ */

const FieldWrapper: React.FC<BaseFieldProps & { children: React.ReactNode; id?: string }> = ({ name, label, hint, required, fullWidth, children, id }) => {
  const { formState: { errors } } = useFormContext();
  const error = getNestedError(errors, name);
  const hintId = `${name}-hint`;
  const errorId = `${name}-error`;

  return (
    <FormGrid fullWidth={fullWidth}>
      <label htmlFor={id || name} className="text-xs font-black uppercase tracking-widest text-foreground flex items-center gap-1 mb-1.5">
        {label}
        {required && <span className="text-rose-500/70 font-black" aria-hidden="true">*</span>}
      </label>
      <div className="relative">
        {children}
      </div>
      <div className="min-h-[18px] mt-1">
        {hint && !error && <p id={hintId} className="text-[10px] text-muted-foreground font-medium leading-tight">{hint}</p>}
        {error && <p id={errorId} className="text-[10px] font-bold text-rose-500 animate-in slide-in-from-top-1" role="alert">{error}</p>}
      </div>
    </FormGrid>
  );
};

/* ================================================================
   TextField
   ================================================================ */

export const TextField: React.FC<BaseFieldProps & { placeholder?: string; type?: string }> = (props) => {
  const { register } = useFormContext();
  return (
    <FieldWrapper {...props}>
      <input
        id={props.name}
        {...register(props.name)}
        type={props.type || 'text'}
        placeholder={props.placeholder}
        disabled={props.disabled}
        readOnly={props.readOnly}
        aria-describedby={props.hint ? `${props.name}-hint` : undefined}
        aria-invalid={undefined}
        className={INPUT_CLASS}
      />
    </FieldWrapper>
  );
};

/* ================================================================
   NumberField
   ================================================================ */

export const NumberField: React.FC<BaseFieldProps & { placeholder?: string; step?: string; min?: number; max?: number }> = (props) => {
  const { register } = useFormContext();
  return (
    <FieldWrapper {...props}>
      <input
        id={props.name}
        {...register(props.name, { valueAsNumber: true })}
        type="number"
        step={props.step || '1'}
        min={props.min}
        max={props.max}
        placeholder={props.placeholder}
        disabled={props.disabled}
        readOnly={props.readOnly}
        aria-describedby={props.hint ? `${props.name}-hint` : undefined}
        className={INPUT_CLASS}
      />
    </FieldWrapper>
  );
};

/* ================================================================
   MoneyField — Number with currency prefix
   ================================================================ */

export const MoneyField: React.FC<BaseFieldProps & { placeholder?: string; currency?: string }> = ({ currency = '$', ...props }) => {
  const { register } = useFormContext();
  return (
    <FieldWrapper {...props}>
      <div className="relative">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-black text-muted-foreground">{currency}</span>
        <input
          id={props.name}
          {...register(props.name, { valueAsNumber: true })}
          type="number"
          step="0.01"
          placeholder={props.placeholder || '0.00'}
          disabled={props.disabled}
          readOnly={props.readOnly}
          aria-describedby={props.hint ? `${props.name}-hint` : undefined}
          className={`${INPUT_CLASS} pl-8`}
        />
      </div>
    </FieldWrapper>
  );
};

/* ================================================================
   PercentField — Number with % suffix
   ================================================================ */

export const PercentField: React.FC<BaseFieldProps & { placeholder?: string }> = (props) => {
  const { register } = useFormContext();
  return (
    <FieldWrapper {...props}>
      <div className="relative">
        <input
          id={props.name}
          {...register(props.name, { valueAsNumber: true })}
          type="number"
          step="0.01"
          min={0}
          max={100}
          placeholder={props.placeholder || '0'}
          disabled={props.disabled}
          readOnly={props.readOnly}
          aria-describedby={props.hint ? `${props.name}-hint` : undefined}
          className={`${INPUT_CLASS} pr-10`}
        />
        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-black text-muted-foreground">%</span>
      </div>
    </FieldWrapper>
  );
};

/* ================================================================
   SelectField
   ================================================================ */

export const SelectField: React.FC<BaseFieldProps & { options: { label: string; value: string }[]; placeholder?: string }> = ({ placeholder = 'Select an option...', ...props }) => {
  const { register } = useFormContext();
  return (
    <FieldWrapper {...props}>
      <select
        id={props.name}
        {...register(props.name)}
        disabled={props.disabled}
        aria-describedby={props.hint ? `${props.name}-hint` : undefined}
        className={SELECT_CLASS}
      >
        <option value="">{placeholder}</option>
        {props.options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
      </select>
      <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground opacity-50" />
    </FieldWrapper>
  );
};

/* ================================================================
   ComboboxField — Searchable select with dropdown
   ================================================================ */

export const ComboboxField: React.FC<BaseFieldProps & { options: { label: string; value: string }[]; placeholder?: string }> = ({ placeholder = 'Search...', ...props }) => {
  const { setValue, watch } = useFormContext();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const current = watch(props.name);
  const selected = props.options.find(o => o.value === current);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = props.options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()));

  return (
    <FieldWrapper {...props}>
      <div ref={ref} className="relative">
        <div
          onClick={() => !props.disabled && setOpen(!open)}
          className={`${INPUT_CLASS} flex items-center justify-between cursor-pointer`}
        >
          <span className={selected ? 'text-foreground' : 'text-muted-foreground'}>{selected?.label || placeholder}</span>
          <ChevronDown size={14} className="text-muted-foreground opacity-50" />
        </div>
        {open && (
          <div className="absolute z-50 mt-1 w-full bg-card border border-border rounded-xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
            <div className="p-2 border-b border-border">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filter..."
                  className="w-full h-8 pl-9 pr-3 text-xs bg-muted/50 border border-input rounded-lg focus:ring-0 focus:outline-none"
                  autoFocus
                />
              </div>
            </div>
            <div className="max-h-48 overflow-y-auto no-scrollbar">
              {filtered.length === 0 ? (
                <p className="px-4 py-3 text-xs text-muted-foreground">No results</p>
              ) : filtered.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { setValue(props.name, opt.value, { shouldValidate: true }); setOpen(false); setQuery(''); }}
                  className={`w-full text-left px-4 py-2.5 text-xs font-medium hover:bg-muted/50 transition-colors ${current === opt.value ? 'bg-primary/5 text-primary font-bold' : ''}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </FieldWrapper>
  );
};

/* ================================================================
   MultiSelectField — Multiple selection with chips
   ================================================================ */

export const MultiSelectField: React.FC<BaseFieldProps & { options: { label: string; value: string }[] }> = (props) => {
  const { setValue, watch } = useFormContext();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected: string[] = watch(props.name) || [];

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggle = (val: string) => {
    const next = selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val];
    setValue(props.name, next, { shouldValidate: true });
  };

  return (
    <FieldWrapper {...props}>
      <div ref={ref} className="relative">
        <div
          onClick={() => !props.disabled && setOpen(!open)}
          className={`${INPUT_CLASS} h-auto min-h-[2.5rem] flex flex-wrap items-center gap-1.5 py-1.5 cursor-pointer`}
        >
          {selected.length === 0 && <span className="text-muted-foreground text-sm">Select...</span>}
          {selected.map(val => {
            const opt = props.options.find(o => o.value === val);
            return (
              <span key={val} className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary rounded-lg text-[10px] font-bold">
                {opt?.label || val}
                <button type="button" onClick={(e) => { e.stopPropagation(); toggle(val); }} className="hover:text-rose-500"><X size={10} /></button>
              </span>
            );
          })}
        </div>
        {open && (
          <div className="absolute z-50 mt-1 w-full bg-card border border-border rounded-xl shadow-xl max-h-48 overflow-y-auto no-scrollbar animate-in fade-in slide-in-from-top-1 duration-150">
            {props.options.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggle(opt.value)}
                className={`w-full text-left px-4 py-2.5 text-xs font-medium hover:bg-muted/50 transition-colors flex items-center justify-between ${selected.includes(opt.value) ? 'bg-primary/5 text-primary font-bold' : ''}`}
              >
                {opt.label}
                {selected.includes(opt.value) && <span className="text-primary font-black text-[10px]">&#10003;</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </FieldWrapper>
  );
};

/* ================================================================
   DateField — Native date input
   ================================================================ */

export const DateField: React.FC<BaseFieldProps & { min?: string; max?: string }> = (props) => {
  const { register } = useFormContext();
  return (
    <FieldWrapper {...props}>
      <div className="relative">
        <input
          id={props.name}
          {...register(props.name)}
          type="date"
          min={props.min}
          max={props.max}
          disabled={props.disabled}
          readOnly={props.readOnly}
          aria-describedby={props.hint ? `${props.name}-hint` : undefined}
          className={INPUT_CLASS}
        />
        <Calendar size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground opacity-50" />
      </div>
    </FieldWrapper>
  );
};

/* ================================================================
   DateRangeField — Two date inputs side by side
   ================================================================ */

export const DateRangeField: React.FC<{ nameFrom: string; nameTo: string; label: string; hint?: string; required?: boolean; fullWidth?: boolean; disabled?: boolean }> = (props) => {
  const { register } = useFormContext();
  return (
    <FieldWrapper name={props.nameFrom} label={props.label} hint={props.hint} required={props.required} fullWidth={props.fullWidth ?? true} disabled={props.disabled}>
      <div className="grid grid-cols-2 gap-3">
        <div className="relative">
          <input id={props.nameFrom} {...register(props.nameFrom)} type="date" disabled={props.disabled} className={INPUT_CLASS} />
          <span className="absolute left-4 -top-2 text-[8px] font-black uppercase tracking-widest text-muted-foreground bg-background px-1">From</span>
        </div>
        <div className="relative">
          <input id={props.nameTo} {...register(props.nameTo)} type="date" disabled={props.disabled} className={INPUT_CLASS} />
          <span className="absolute left-4 -top-2 text-[8px] font-black uppercase tracking-widest text-muted-foreground bg-background px-1">To</span>
        </div>
      </div>
    </FieldWrapper>
  );
};

/* ================================================================
   TextareaField
   ================================================================ */

export const TextareaField: React.FC<BaseFieldProps & { placeholder?: string; rows?: number }> = (props) => {
  const { register } = useFormContext();
  return (
    <FieldWrapper {...props}>
      <textarea
        id={props.name}
        {...register(props.name)}
        rows={props.rows || 3}
        placeholder={props.placeholder}
        disabled={props.disabled}
        readOnly={props.readOnly}
        aria-describedby={props.hint ? `${props.name}-hint` : undefined}
        className={TEXTAREA_CLASS}
      />
    </FieldWrapper>
  );
};

/* ================================================================
   ToggleField — Switch toggle
   ================================================================ */

export const ToggleField: React.FC<BaseFieldProps> = (props) => {
  const { register, watch } = useFormContext();
  const checked = watch(props.name);
  return (
    <FieldWrapper {...props}>
      <label className="flex items-center cursor-pointer group w-fit">
        <div className="relative">
          <input type="checkbox" {...register(props.name)} disabled={props.disabled} className="sr-only" />
          <div className={`block w-10 h-6 rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-muted border border-border'}`} />
          <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform duration-200 shadow-sm ${checked ? 'translate-x-4' : ''}`} />
        </div>
        <span className="ml-3 text-[11px] font-black uppercase tracking-widest text-muted-foreground group-hover:text-foreground transition-colors">
          {checked ? 'Active' : 'Disabled'}
        </span>
      </label>
    </FieldWrapper>
  );
};

/* ================================================================
   CheckboxField — Standard checkbox
   ================================================================ */

export const CheckboxField: React.FC<BaseFieldProps & { description?: string }> = ({ description, ...props }) => {
  const { register } = useFormContext();
  return (
    <FieldWrapper {...props}>
      <label className="flex items-start gap-3 cursor-pointer group">
        <input
          type="checkbox"
          {...register(props.name)}
          disabled={props.disabled}
          className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary/40 transition-all"
        />
        <div>
          <span className="text-sm font-medium group-hover:text-foreground transition-colors">{props.label}</span>
          {description && <p className="text-[10px] text-muted-foreground mt-0.5">{description}</p>}
        </div>
      </label>
    </FieldWrapper>
  );
};

/* ================================================================
   RadioGroupField — Vertical radio group
   ================================================================ */

export const RadioGroupField: React.FC<BaseFieldProps & { options: { label: string; value: string; description?: string }[] }> = (props) => {
  const { register } = useFormContext();
  return (
    <FieldWrapper {...props}>
      <div className="flex flex-col gap-2">
        {props.options.map(opt => (
          <label key={opt.value} className="flex items-start gap-3 p-3 border border-border rounded-xl cursor-pointer hover:bg-muted/30 transition-colors has-[:checked]:border-primary/40 has-[:checked]:bg-primary/5">
            <input
              type="radio"
              value={opt.value}
              {...register(props.name)}
              disabled={props.disabled}
              className="mt-0.5 h-4 w-4 border-border text-primary focus:ring-primary/40"
            />
            <div>
              <span className="text-sm font-medium">{opt.label}</span>
              {opt.description && <p className="text-[10px] text-muted-foreground mt-0.5">{opt.description}</p>}
            </div>
          </label>
        ))}
      </div>
    </FieldWrapper>
  );
};

/* ================================================================
   FileAttachField — UI-only file picker
   ================================================================ */

export const FileAttachField: React.FC<BaseFieldProps & { accept?: string; maxSizeMb?: number }> = ({ accept, maxSizeMb = 10, ...props }) => {
  const { setValue, watch } = useFormContext();
  const fileName = watch(props.name);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > maxSizeMb * 1024 * 1024) {
        alert(`File must be under ${maxSizeMb}MB`);
        return;
      }
      setValue(props.name, file.name, { shouldValidate: true });
    }
  };

  return (
    <FieldWrapper {...props}>
      <label className={`${INPUT_CLASS} flex items-center gap-3 cursor-pointer`}>
        <Paperclip size={14} className="text-muted-foreground flex-shrink-0" />
        <span className={`text-sm truncate ${fileName ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
          {fileName || 'Choose file...'}
        </span>
        <input type="file" accept={accept} onChange={handleChange} disabled={props.disabled} className="sr-only" />
      </label>
    </FieldWrapper>
  );
};

/* ================================================================
   ReadOnlyField — Display-only value
   ================================================================ */

export const ReadOnlyField: React.FC<BaseFieldProps & { value: string | number }> = (props) => {
  return (
    <FieldWrapper {...props}>
      <div className="w-full h-10 bg-muted/30 border border-dashed border-border rounded-xl px-4 flex items-center text-sm font-black text-muted-foreground">
        {props.value}
      </div>
    </FieldWrapper>
  );
};

/* ================================================================
   EntityPickerField — Select with search for entity references
   ================================================================ */

export const EntityPickerField: React.FC<BaseFieldProps & {
  options: { label: string; value: string; meta?: string }[];
  placeholder?: string;
  onSearch?: (query: string) => void;
  loading?: boolean;
}> = ({ placeholder = 'Search entity...', onSearch, loading, ...props }) => {
  const { setValue, watch } = useFormContext();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const current = watch(props.name);
  const selected = props.options.find(o => o.value === current);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = props.options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()));

  const handleQueryChange = (val: string) => {
    setQuery(val);
    onSearch?.(val);
  };

  return (
    <FieldWrapper {...props}>
      <div ref={ref} className="relative">
        <div
          onClick={() => !props.disabled && setOpen(!open)}
          className={`${INPUT_CLASS} flex items-center gap-2 cursor-pointer`}
        >
          <Search size={14} className="text-muted-foreground flex-shrink-0" />
          <span className={`truncate ${selected ? 'text-foreground' : 'text-muted-foreground'}`}>{selected?.label || placeholder}</span>
          {current && (
            <button type="button" onClick={(e) => { e.stopPropagation(); setValue(props.name, '', { shouldValidate: true }); }} className="ml-auto text-muted-foreground hover:text-rose-500">
              <X size={12} />
            </button>
          )}
        </div>
        {open && (
          <div className="absolute z-50 mt-1 w-full bg-card border border-border rounded-xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
            <div className="p-2 border-b border-border">
              <input
                type="text"
                value={query}
                onChange={(e) => handleQueryChange(e.target.value)}
                placeholder="Type to search..."
                className="w-full h-8 px-3 text-xs bg-muted/50 border border-input rounded-lg focus:ring-0 focus:outline-none"
                autoFocus
              />
            </div>
            <div className="max-h-48 overflow-y-auto no-scrollbar">
              {loading && <p className="px-4 py-3 text-xs text-muted-foreground">Loading...</p>}
              {!loading && filtered.length === 0 && <p className="px-4 py-3 text-xs text-muted-foreground">No results</p>}
              {!loading && filtered.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { setValue(props.name, opt.value, { shouldValidate: true }); setOpen(false); setQuery(''); }}
                  className={`w-full text-left px-4 py-2.5 hover:bg-muted/50 transition-colors ${current === opt.value ? 'bg-primary/5' : ''}`}
                >
                  <span className="text-xs font-medium">{opt.label}</span>
                  {opt.meta && <span className="block text-[10px] text-muted-foreground mt-0.5">{opt.meta}</span>}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </FieldWrapper>
  );
};
