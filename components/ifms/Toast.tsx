
import React from 'react';
import { useAppStore } from '../../store';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export const ToastContainer: React.FC = () => {
  const toasts = useAppStore(state => state.toasts);
  const removeToast = useAppStore(state => state.removeToast);

  return (
    <div className="fixed bottom-6 right-6 z-[110] flex flex-col gap-3 pointer-events-none">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className="pointer-events-auto min-w-[300px] bg-card border border-border rounded-2xl p-4 shadow-2xl flex items-start gap-4 animate-in slide-in-from-right-8 duration-300"
        >
          <div className={`mt-0.5 ${
            toast.type === 'success' ? 'text-emerald-500' : 
            toast.type === 'error' ? 'text-rose-500' : 'text-primary'
          }`}>
            {toast.type === 'success' ? <CheckCircle2 size={20} /> : 
             toast.type === 'error' ? <AlertCircle size={20} /> : <Info size={20} />}
          </div>
          
          <div className="flex-1">
            <p className="text-sm font-bold text-foreground">{toast.message}</p>
            <p className="text-[10px] text-muted-foreground uppercase font-black mt-0.5 tracking-widest">{toast.type}</p>
            {toast.actionLabel && toast.actionHref && (
              <a
                href={toast.actionHref}
                className="inline-flex mt-2 text-[10px] font-black uppercase tracking-widest text-primary hover:underline"
              >
                {toast.actionLabel}
              </a>
            )}
          </div>

          <button 
            onClick={() => removeToast(toast.id)}
            className="p-1 hover:bg-muted rounded-full text-muted-foreground transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
};
