
import React from 'react';

interface DataTableShellProps {
  title?: string;
  toolbar?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

const DataTableShell: React.FC<DataTableShellProps> = ({ title, toolbar, children, footer }) => {
  return (
    <div className="bg-card text-card-foreground rounded-xl border border-border shadow-sm overflow-hidden">
      {(title || toolbar) && (
        <div className="px-6 py-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-muted/30">
          {title && <h3 className="text-lg font-bold tracking-tight">{title}</h3>}
          {toolbar && <div className="flex items-center gap-2">{toolbar}</div>}
        </div>
      )}
      <div className="overflow-x-auto">
        {children}
      </div>
      {footer && (
        <div className="px-6 py-3 border-t border-border bg-muted/10">
          {footer}
        </div>
      )}
    </div>
  );
};

export default DataTableShell;
