import React, { useState, useRef, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { NotificationsDrawer } from './NotificationsDrawer';
import { useRealtimeNotifications } from '@/lib/hooks/useRealtimeNotifications';
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
    data?: Record<string, any>;
    actionUrl?: string;
    createdAt: string;
  };
}

interface NotificationBellProps {
  unreadCount: number;
  notifications: Notification[];
  onMarkRead: (id: string) => void;
  onArchive: (id: string) => void;
  onMarkAllRead: () => void;
  onOpenAction: (actionUrl: string) => void;
  onMarkSeen?: (ids: string[]) => void; // New: Mark notifications as seen when drawer opens
  className?: string;
}

export function NotificationBell({
  unreadCount,
  notifications,
  onMarkRead,
  onArchive,
  onMarkAllRead,
  onOpenAction,
  onMarkSeen,
  className,
}: NotificationBellProps) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const { realtimeNotifications, clearRealtimeNotifications } = useRealtimeNotifications();

  // Mark notifications as seen when drawer opens
  useEffect(() => {
    if (isDrawerOpen && onMarkSeen) {
      const unseenIds = notifications
        .filter(n => !n.seenAt && !n.readAt)
        .map(n => n.id);

      if (unseenIds.length > 0) {
        onMarkSeen(unseenIds);
      }
    }
  }, [isDrawerOpen, notifications, onMarkSeen]);

  // Clear realtime notifications when drawer opens
  useEffect(() => {
    if (isDrawerOpen && realtimeNotifications.length > 0) {
      clearRealtimeNotifications();
    }
  }, [isDrawerOpen, realtimeNotifications.length, clearRealtimeNotifications]);

  const handleOpenDrawer = () => {
    setIsDrawerOpen(true);
  };

  const handleCloseDrawer = () => {
    setIsDrawerOpen(false);
  };

  const handleMarkRead = (id: string) => {
    onMarkRead(id);
  };

  const handleArchive = (id: string) => {
    onArchive(id);
  };

  const handleMarkAllRead = () => {
    onMarkAllRead();
  };

  const handleOpenAction = (actionUrl: string) => {
    onOpenAction(actionUrl);
    handleCloseDrawer();
  };

  // Calculate total unseen notifications (not seen and not read)
  const unseenCount = notifications.filter(n => !n.seenAt && !n.readAt).length;
  const hasNewRealtime = realtimeNotifications.length > 0;

  return (
    <>
      <button
        onClick={handleOpenDrawer}
        className={cn(
          'relative w-9 h-9 flex items-center justify-center hover:bg-muted rounded-xl text-muted-foreground transition-colors',
          className,
        )}
        aria-label={`Notifications${unseenCount > 0 ? `, ${unseenCount} unseen` : ''}`}
        aria-expanded={isDrawerOpen}
        aria-haspopup="dialog"
      >
        <Bell size={18} className={cn(hasNewRealtime && 'animate-bounce')} />

        {/* Unseen count badge */}
        {unseenCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4">
            {hasNewRealtime && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
            )}
            <span className="relative inline-flex rounded-full h-4 w-4 bg-rose-500 text-white text-[8px] font-black items-center justify-center">
              {unseenCount > 9 ? '9+' : unseenCount}
            </span>
          </span>
        )}
      </button>

      <NotificationsDrawer
        isOpen={isDrawerOpen}
        onClose={handleCloseDrawer}
        notifications={notifications}
        unreadCount={unreadCount}
        onMarkRead={handleMarkRead}
        onArchive={handleArchive}
        onMarkAllRead={handleMarkAllRead}
        onOpenAction={handleOpenAction}
        realtimeNotifications={realtimeNotifications}
      />
    </>
  );
}
