
import React from 'react';
import { History, Clock } from 'lucide-react';

interface FormFooterMetaProps {
  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export const FormFooterMeta: React.FC<FormFooterMetaProps> = ({ 
  createdAt = new Date().toISOString(), 
  createdBy = "System Admin",
  updatedAt,
  updatedBy
}) => {
  return (
    <div className="pt-6 border-t border-border mt-12 flex flex-col sm:flex-row gap-8 opacity-60">
      <div className="flex items-start gap-3">
        <div className="p-1.5 bg-muted rounded-lg">
          <Clock size={14} className="text-muted-foreground" />
        </div>
        <div>
          <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Created On</p>
          <p className="text-[11px] font-bold">{new Date(createdAt).toLocaleString()} by {createdBy}</p>
        </div>
      </div>
      {updatedAt && (
        <div className="flex items-start gap-3">
          <div className="p-1.5 bg-muted rounded-lg">
            <History size={14} className="text-muted-foreground" />
          </div>
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Last Modified</p>
            <p className="text-[11px] font-bold">{new Date(updatedAt).toLocaleString()} by {updatedBy}</p>
          </div>
        </div>
      )}
    </div>
  );
};
