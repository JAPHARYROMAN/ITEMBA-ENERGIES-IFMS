import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Check, Archive, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Notification {
  id: string;
  notificationId: string;
  userId: string;
  status: string;
  readAt?: string;
  seenAt?: string;
  archivedAt?: string;
  deliveredVia: string;
  errorMessage?: string;
  notification: {
    id: string;
    type: string;
    severity: 'info' | 'success' | 'warning' | 'critical';
    title: string;
    body?: string;
    data?: Record<string, unknown>;
    actionUrl?: string;
    createdAt: string;
  };
}

export interface NotificationItemProps {
  key?: React.Key;
  notification: Notification;
  isSelected?: boolean;
  onSelect?: (checked: boolean) => void;
  onMarkRead?: (id: string) => void;
  onArchive?: (id: string) => void;
  onOpenDetails?: () => void;
  onOpenAction?: (actionUrl: string) => void;
  isRealtime?: boolean;
  className?: string;
}

const SEVERITY_STYLES: Record<string, { dot: string; bg: string }> = {
  critical: { dot: 'bg-rose-500', bg: 'bg-rose-500/10 text-rose-600 border-rose-500/20' },
  warning:  { dot: 'bg-amber-500', bg: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
  info:     { dot: 'bg-blue-500', bg: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
  success:  { dot: 'bg-emerald-500', bg: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
};

export function NotificationItem({
  notification,
  onMarkRead,
  onArchive,
  onOpenDetails,
  onOpenAction,
  isRealtime = false,
  className,
}: NotificationItemProps) {
  const isRead = !!notification.readAt;
  const isArchived = !!notification.archivedAt;
  const hasAction = !!notification.notification.actionUrl;
  const sev = SEVERITY_STYLES[notification.notification.severity] ?? SEVERITY_STYLES.info;

  const stop = (e: React.MouseEvent | React.ChangeEvent) => e.stopPropagation();

  const timeAgo = formatDistanceToNow(new Date(notification.notification.createdAt), { addSuffix: true });

  return (
    <article
      role="article"
      aria-labelledby={`notification-${notification.id}-title`}
      className={cn(
        'group relative flex items-start gap-3 px-4 py-3 rounded-xl transition-all cursor-pointer',
        'hover:bg-muted/50',
        !isRead && 'bg-primary/[0.03]',
        isRealtime && 'ring-1 ring-emerald-500/30',
        isArchived && 'opacity-50',
        className,
      )}
      onClick={(e) => { stop(e); onOpenDetails?.(); }}
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenDetails?.(); } }}
    >
      {/* Unread dot */}
      {!isRead && (
        <span className={cn('absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full', sev.dot)} />
      )}

      {/* Severity icon */}
      <div className={cn(
        'flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center border text-[10px] font-black uppercase tracking-widest',
        sev.bg,
      )}>
        {notification.notification.severity.charAt(0).toUpperCase()}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3
            id={`notification-${notification.id}-title`}
            className={cn(
              'text-xs tracking-tight truncate',
              isRead ? 'font-semibold text-muted-foreground' : 'font-black',
            )}
          >
            {notification.notification.title}
          </h3>
          {isRealtime && (
            <span className="flex-shrink-0 px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
              New
            </span>
          )}
        </div>

        {notification.notification.body && (
          <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
            {notification.notification.body}
          </p>
        )}

        <div className="flex items-center gap-3 mt-1.5">
          <time className="text-[10px] text-muted-foreground opacity-60" dateTime={notification.notification.createdAt}>
            {timeAgo}
          </time>
          <span className={cn('px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest border', sev.bg)}>
            {notification.notification.severity}
          </span>
          <span className="text-[10px] text-muted-foreground opacity-60 capitalize">
            {notification.notification.type}
          </span>
        </div>

        {/* Error message */}
        {notification.errorMessage && (
          <div className="mt-1.5 text-[10px] text-rose-600 bg-rose-500/10 px-2 py-1 rounded-lg border border-rose-500/20 font-medium">
            {notification.errorMessage}
          </div>
        )}
      </div>

      {/* Hover actions */}
      <div className="flex-shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {!isRead && onMarkRead && (
          <button
            onClick={(e) => { stop(e); onMarkRead(notification.id); }}
            className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground transition-colors"
            title="Mark as read"
          >
            <Check size={12} />
          </button>
        )}
        {!isArchived && onArchive && (
          <button
            onClick={(e) => { stop(e); onArchive(notification.id); }}
            className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground transition-colors"
            title="Archive"
          >
            <Archive size={12} />
          </button>
        )}
        {hasAction && onOpenAction && (
          <button
            onClick={(e) => { stop(e); onOpenAction(notification.notification.actionUrl!); }}
            className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground transition-colors"
            title="Open"
          >
            <ExternalLink size={12} />
          </button>
        )}
      </div>
    </article>
  );
}
