
import React from 'react';
import { Info, CheckCircle2, AlertCircle } from 'lucide-react';

export interface ComputedItem {
  label: string;
  value: string | number;
  hint?: string;
  status?: 'success' | 'warning' | 'error' | 'neutral';
}

interface ComputedFieldBlockProps {
  title?: string;
  items: ComputedItem[];
  className?: string;
}

const ComputedFieldBlock: React.FC<ComputedFieldBlockProps> = ({ 
  title = "Derived Transaction Values", 
  items,
  className = ""
}) => {
  return (
    <div className={`bg-muted/30 border border-dashed border-border rounded-2xl p-6 space-y-4 ${className}`}>
      <div className="flex items-center justify-between border-b border-border pb-3">
        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
          <Info size={12} className="text-primary" />
          {title}
        </h4>
        <span className="text-[9px] font-black text-muted-foreground/50 uppercase tracking-widest">Calculated Real-Time</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
        {items.map((item, idx) => (
          <div key={idx} className="flex flex-col gap-1 group">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{item.label}</span>
              {item.status && (
                <div className={`
                  ${item.status === 'success' ? 'text-emerald-500' : ''}
                  ${item.status === 'warning' ? 'text-amber-500' : ''}
                  ${item.status === 'error' ? 'text-rose-500' : ''}
                  ${item.status === 'neutral' ? 'text-muted-foreground/40' : ''}
                `}>
                  {item.status === 'success' ? <CheckCircle2 size={10} /> : <AlertCircle size={10} />}
                </div>
              )}
            </div>
            <div className="text-sm font-black text-foreground group-hover:text-primary transition-colors">
              {item.value}
            </div>
            {item.hint && (
              <p className="text-[9px] text-muted-foreground font-medium leading-tight">
                {item.hint}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ComputedFieldBlock;
