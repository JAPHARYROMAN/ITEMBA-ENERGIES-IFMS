
import React from 'react';
import { useAuthStore } from '../../../store';
import { Loader2, AlertCircle, CheckCircle2, ShieldOff } from 'lucide-react';

interface FormShellProps {
  title: string;
  description?: string;
  status?: 'idle' | 'loading' | 'success' | 'error';
  children: React.ReactNode;
  actions?: React.ReactNode;
}

export const FormShell: React.FC<FormShellProps> = ({ title, description, status, children, actions }) => {
  return (
    <div className="bg-card text-card-foreground rounded-[1.5rem] border border-border shadow-sm overflow-hidden flex flex-col h-full max-h-[85vh]">
      <div className="px-8 py-6 border-b border-border bg-muted/20 flex flex-col md:flex-row md:items-center justify-between gap-4">
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
      
      <div className="flex-1 overflow-y-auto p-8 no-scrollbar">
        <div className="max-w-4xl mx-auto space-y-12 pb-12">
          {children}
        </div>
      </div>

      {actions && (
        <div className="px-8 py-4 border-t border-border bg-muted/10 sticky bottom-0 z-10">
          <div className="max-w-4xl mx-auto flex items-center justify-end gap-3">
            {actions}
          </div>
        </div>
      )}
    </div>
  );
};

export const FormSection: React.FC<{ title: string; description?: string; children: React.ReactNode }> = ({ title, description, children }) => (
  <section className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
    <div className="border-b border-border/60 pb-3">
      <h3 className="text-xs font-black uppercase tracking-[0.2em] text-primary">{title}</h3>
      {description && <p className="text-[11px] text-muted-foreground font-medium mt-1 leading-relaxed">{description}</p>}
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
      {children}
    </div>
  </section>
);

export const FormGrid: React.FC<{ children: React.ReactNode; fullWidth?: boolean }> = ({ children, fullWidth }) => (
  <div className={`${fullWidth ? 'md:col-span-2' : ''} space-y-2`}>
    {children}
  </div>
);

export const PermissionGuard: React.FC<{ children: React.ReactNode; fallback?: React.ReactNode }> = ({ children, fallback }) => {
  const { user } = useAuthStore();
  const isAuditor = user?.role === 'auditor';

  if (isAuditor) {
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

export const FormSubmitState: React.FC<{ loading: boolean; label: string }> = ({ loading, label }) => (
  <span className="flex items-center gap-2">
    {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
    {loading ? 'Processing...' : label}
  </span>
);
