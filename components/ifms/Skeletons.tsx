
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

export const NotificationSkeleton: React.FC = () => (
  <div className="space-y-3 animate-pulse">
    {Array.from({ length: 5 }).map((_, i) => (
      <div key={i} className="p-4 border border-border rounded-lg">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="h-5 w-16 bg-muted rounded-full"></div>
            <div className="h-4 w-12 bg-muted rounded-full"></div>
          </div>
          <div className="flex gap-1">
            <div className="h-6 w-6 bg-muted rounded"></div>
            <div className="h-6 w-6 bg-muted rounded"></div>
          </div>
        </div>
        <div className="space-y-2">
          <div className="h-4 bg-muted rounded w-3/4"></div>
          <div className="h-3 bg-muted rounded w-1/2"></div>
          <div className="flex justify-between items-center pt-2">
            <div className="h-3 bg-muted rounded w-20"></div>
            <div className="h-3 bg-muted rounded w-16"></div>
          </div>
        </div>
      </div>
    ))}
  </div>
);
