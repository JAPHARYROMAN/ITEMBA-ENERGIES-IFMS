import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const severityBadgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
  {
    variants: {
      severity: {
        info: 'bg-blue-100 text-blue-800 border border-blue-200',
        success: 'bg-green-100 text-green-800 border border-green-200',
        warning: 'bg-yellow-100 text-yellow-800 border border-yellow-200',
        critical: 'bg-red-100 text-red-800 border border-red-200',
      },
    },
    defaultVariants: {
      severity: 'info',
    },
  },
);

interface SeverityBadgeProps extends VariantProps<typeof severityBadgeVariants> {
  severity: 'info' | 'success' | 'warning' | 'critical';
  children?: React.ReactNode;
  className?: string;
}

export function SeverityBadge({ severity, children, className }: SeverityBadgeProps) {
  const getSeverityIcon = () => {
    switch (severity) {
      case 'info':
        return 'ℹ️';
      case 'success':
        return '✅';
      case 'warning':
        return '⚠️';
      case 'critical':
        return '🚨';
      default:
        return 'ℹ️';
    }
  };

  return (
    <div className={cn(severityBadgeVariants({ severity }), className)}>
      <span className="mr-1">{getSeverityIcon()}</span>
      {children || severity.charAt(0).toUpperCase() + severity.slice(1)}
    </div>
  );
}
