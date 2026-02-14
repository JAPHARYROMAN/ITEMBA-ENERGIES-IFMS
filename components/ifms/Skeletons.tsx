
import React from 'react';

export const ChartSkeleton: React.FC = () => (
  <div className="bg-card p-6 rounded-xl border border-border animate-pulse shadow-sm">
    <div className="h-4 bg-muted rounded w-1/4 mb-6"></div>
    <div className="flex items-end gap-2 h-64">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="bg-muted rounded w-full" style={{ height: `${Math.random() * 60 + 20}%` }}></div>
      ))}
    </div>
  </div>
);

export const TableSkeleton: React.FC = () => (
  <div className="space-y-4 animate-pulse">
    <div className="h-10 bg-muted/60 rounded-lg w-full"></div>
    {Array.from({ length: 5 }).map((_, i) => (
      <div key={i} className="h-14 bg-muted/30 rounded-lg w-full border border-border/50"></div>
    ))}
  </div>
);

export const DashboardSkeleton: React.FC = () => (
  <div className="space-y-8 animate-in fade-in duration-500">
    <div className="h-10 bg-muted/40 rounded-lg w-1/3 mb-8"></div>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-28 bg-muted/40 rounded-xl border border-border"></div>
      ))}
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2 h-96 bg-muted/30 rounded-xl border border-border"></div>
      <div className="h-96 bg-muted/30 rounded-xl border border-border"></div>
    </div>
  </div>
);
