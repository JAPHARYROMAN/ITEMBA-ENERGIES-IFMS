
import React, { useEffect, useRef } from 'react';
import { matchesPermissionRequirement, useAuthStore } from '../../../store';
import { Loader2, AlertCircle, CheckCircle2, TriangleAlert } from 'lucide-react';
import { useFormContext } from 'react-hook-form';
import { useLocation } from 'react-router-dom';
import type { PermissionMatch } from '../../../types';

/* ================================================================
   FormShell — Top-level card wrapper for every form
   ================================================================ */

interface FormShellProps {
  title: string;
  description?: string;
  status?: 'idle' | 'loading' | 'success' | 'error';
  children: React.ReactNode;
  actions?: React.ReactNode;
  wide?: boolean;
}

export const FormShell: React.FC<FormShellProps> = ({ title, description, status, children, actions, wide }) => {
  return (
    <div className="bg-card text-card-foreground rounded-[1.5rem] border border-border shadow-sm overflow-hidden flex flex-col h-full max-h-[85vh]">
      <div className="px-6 pt-6 pb-4 border-b border-border bg-muted/20 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black tracking-tight">{title}</h2>
          {description && <p className="text-xs text-muted-foreground font-bold mt-1 uppercase tracking-wider">{description}</p>}
        </div>
        <div className="flex items-center gap-3">
          {status === 'loading' && <div className="flex items-center gap-2 text-primary font-bold text-xs"><Loader2 className="animate-spin w-4 h-4" /> Syncing...</div>}
          {status === 'success' && <div className="flex items-center gap-2 text-emerald-600 font-bold text-xs"><CheckCircle2 className="w-4 h-4" /> Committed</div>}
          {status === 'error' && <div className="flex items-center gap-2 text-rose-600 font-bold text-xs"><AlertCircle className="w-4 h-4" /> Failed</div>}
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto px-6 pb-6 pt-8 no-scrollbar">
        <div className={`${wide ? 'max-w-6xl' : 'max-w-5xl'} mx-auto space-y-12 pb-12`}>
          {children}
        </div>
      </div>

      {actions && (
        <FormActionsSticky>
          {actions}
        </FormActionsSticky>
      )}
    </div>
  );
};

/* ================================================================
   FormSection — Titled group of fields with divider
   ================================================================ */

export const FormSection: React.FC<{ title: string; description?: string; children: React.ReactNode }> = ({ title, description, children }) => (
  <section className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
    <div className="border-b border-border/60 pb-3">
      <h3 className="text-xs font-black uppercase tracking-[0.2em] text-primary">{title}</h3>
      {description && <p className="text-[11px] text-muted-foreground font-medium mt-1 leading-relaxed">{description}</p>}
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
      {children}
    </div>
  </section>
);

/* ================================================================
   FormGrid — Column-span helper inside FormSection grids
   ================================================================ */

export const FormGrid: React.FC<{ children: React.ReactNode; fullWidth?: boolean }> = ({ children, fullWidth }) => (
  <div className={`${fullWidth ? 'md:col-span-2' : ''} space-y-2`}>
    {children}
  </div>
);

/* ================================================================
   FieldRow — Horizontal row of fields (e.g. 3 small inputs)
   ================================================================ */

export const FieldRow: React.FC<{ children: React.ReactNode; cols?: 2 | 3 | 4 }> = ({ children, cols = 2 }) => (
  <div className={`md:col-span-2 grid grid-cols-1 sm:grid-cols-${cols} gap-x-6 gap-y-4`}>
    {children}
  </div>
);

/* ================================================================
   FieldHint — Help text below a field
   ================================================================ */

export const FieldHint: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-[10px] text-muted-foreground mt-1.5 font-medium leading-tight">{children}</p>
);

/* ================================================================
   FieldError — Error text below a field (reserves space)
   ================================================================ */

export const FieldError: React.FC<{ message?: string }> = ({ message }) => (
  <div className="min-h-[18px] mt-1">
    {message && <p className="text-[10px] font-bold text-rose-500 animate-in slide-in-from-top-1">{message}</p>}
  </div>
);

/* ================================================================
   RequiredMark — Subtle asterisk for required fields
   ================================================================ */

export const RequiredMark: React.FC = () => (
  <span className="text-rose-500/70 font-black ml-0.5" aria-hidden="true">*</span>
);

/* ================================================================
   FormActionsSticky — Sticky action bar (non-sticky on mobile)
   ================================================================ */

export const FormActionsSticky: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="px-6 py-4 border-t border-border bg-muted/10 lg:sticky bottom-0 z-10">
    <div className="max-w-5xl mx-auto flex items-center justify-end gap-3">
      {children}
    </div>
  </div>
);

/* ================================================================
   FormErrorBanner — Summary banner when submit fails
   ================================================================ */

export const FormErrorBanner: React.FC<{ show: boolean; message?: string }> = ({
  show,
  message = 'Please fix the highlighted fields below.',
}) => {
  if (!show) return null;
  return (
    <div className="flex items-center gap-3 px-5 py-3 bg-rose-500/10 border border-rose-500/20 rounded-xl animate-in fade-in slide-in-from-top-2 duration-300">
      <TriangleAlert size={16} className="text-rose-500 flex-shrink-0" />
      <p className="text-xs font-bold text-rose-600">{message}</p>
    </div>
  );
};

/* ================================================================
   UnsavedChangesGuard — Warns before navigating away with dirty form
   ================================================================ */

export const UnsavedChangesGuard: React.FC = () => {
  const { formState: { isDirty } } = useFormContext();
  const location = useLocation();
  const prevLocation = useRef(location);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    if (isDirty && location !== prevLocation.current) {
      const confirmed = window.confirm('You have unsaved changes. Leave this page?');
      if (!confirmed) {
        window.history.pushState(null, '', prevLocation.current.pathname);
      }
    }
    prevLocation.current = location;
  }, [location, isDirty]);

  return null;
};

/* ================================================================
   PermissionGuard — Blocks users without the required permission
   ================================================================ */

export const PermissionGuard: React.FC<{
  children: React.ReactNode;
  permissions?: string[];
  permissionMatch?: PermissionMatch;
  fallback?: React.ReactNode;
}> = ({ children, permissions, permissionMatch = 'any', fallback }) => {
  const { user } = useAuthStore();
  const hasAccess = matchesPermissionRequirement(user, permissions, permissionMatch as PermissionMatch);

  if (!hasAccess) {
    return (
      <div className="relative group">
        <div className="pointer-events-none opacity-60">
          {children}
        </div>
        <div className="absolute inset-0 z-20 cursor-not-allowed" title="Read-only access" />
        {fallback}
      </div>
    );
  }

  return <>{children}</>;
};

/* ================================================================
   FormSubmitState — Loading spinner + label for submit buttons
   ================================================================ */

export const FormSubmitState: React.FC<{ loading: boolean; label: string }> = ({ loading, label }) => (
  <span className="flex items-center gap-2">
    {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
    {loading ? 'Processing...' : label}
  </span>
);
