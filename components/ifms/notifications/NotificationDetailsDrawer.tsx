import React, { useEffect, useRef } from 'react';
import { ArrowLeft, X, Check, Archive, ExternalLink, Eye, EyeOff } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { SeverityBadge } from './SeverityBadge';
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

interface NotificationDetailsDrawerProps {
  notification: Notification | null;
  isOpen: boolean;
  onClose: () => void;
  onMarkRead?: (id: string) => void;
  onArchive?: (id: string) => void;
  onOpenAction?: (actionUrl: string) => void;
}

export function NotificationDetailsDrawer({
  notification,
  isOpen,
  onClose,
  onMarkRead,
  onArchive,
  onOpenAction,
}: NotificationDetailsDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const firstFocusableRef = useRef<HTMLButtonElement>(null);

  // Focus management
  useEffect(() => {
    if (isOpen) {
      // Focus first focusable element
      setTimeout(() => {
        firstFocusableRef.current?.focus();
      }, 100);

      // Prevent body scroll
      document.body.style.overflow = 'hidden';
    } else {
      // Restore body scroll
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen || !notification) return null;

  const isRead = !!notification.readAt;
  const isSeen = !!notification.seenAt;
  const isArchived = !!notification.archivedAt;
  const hasAction = !!notification.notification.actionUrl;

  const handleMarkRead = () => {
    if (!isRead && onMarkRead) {
      onMarkRead(notification.id);
    }
  };

  const handleArchive = () => {
    if (!isArchived && onArchive) {
      onArchive(notification.id);
    }
  };

  const handleOpenAction = () => {
    if (hasAction && onOpenAction) {
      onOpenAction(notification.notification.actionUrl!);
      onClose();
    }
  };

  const renderDataFields = () => {
    if (!notification.notification.data) return null;

    const fields = Object.entries(notification.notification.data).map(([key, value]) => {
      const displayKey = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
      return (
        <div key={key} className="flex justify-between py-2 border-b border-gray-100 last:border-b-0">
          <span className="font-medium text-gray-600">{displayKey}:</span>
          <span className="text-gray-900">{String(value)}</span>
        </div>
      );
    });

    if (fields.length === 0) return null;

    return (
      <div className="mt-6">
        <h4 className="text-sm font-semibold text-gray-900 mb-3">Details</h4>
        <div className="bg-gray-50 rounded-lg p-4">
          {fields}
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-40 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-labelledby="notification-details-title"
        aria-modal="true"
        className={cn(
          'fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-xl z-50',
          'transform transition-transform duration-300 ease-in-out',
          isOpen ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <button
            ref={firstFocusableRef}
            onClick={onClose}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded-md p-1"
            aria-label="Back to notifications"
          >
            <ArrowLeft className="h-5 w-5" />
            <span className="text-sm font-medium">Back</span>
          </button>

          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 rounded-md"
            aria-label="Close details"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-6">
            {/* Severity Badge */}
            <div className="flex justify-center">
              <SeverityBadge severity={notification.notification.severity} />
            </div>

            {/* Title */}
            <div>
              <h1
                id="notification-details-title"
                className="text-xl font-semibold text-gray-900 leading-tight"
              >
                {notification.notification.title}
              </h1>
            </div>

            {/* Body */}
            {notification.notification.body && (
              <div>
                <p className="text-gray-700 leading-relaxed">
                  {notification.notification.body}
                </p>
              </div>
            )}

            {/* Data Fields */}
            {renderDataFields()}

            {/* Metadata */}
            <div className="border-t border-gray-200 pt-6">
              <h4 className="text-sm font-semibold text-gray-900 mb-4">Status & Timeline</h4>

              <div className="space-y-3">
                {/* Status */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Status:</span>
                  <div className="flex items-center gap-2">
                    {isRead && (
                      <>
                        <Check className="h-4 w-4 text-green-600" />
                        <span className="text-sm font-medium text-green-600">Read</span>
                      </>
                    )}
                    {isSeen && !isRead && (
                      <>
                        <EyeOff className="h-4 w-4 text-orange-600" />
                        <span className="text-sm font-medium text-orange-600">Seen</span>
                      </>
                    )}
                    {!isSeen && (
                      <>
                        <Eye className="h-4 w-4 text-blue-600" />
                        <span className="text-sm font-medium text-blue-600">Unseen</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Timestamps */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Created:</span>
                    <time
                      dateTime={notification.notification.createdAt}
                      className="text-gray-900"
                    >
                      {format(new Date(notification.notification.createdAt), 'MMM d, yyyy \'at\' h:mm a')}
                    </time>
                  </div>

                  {notification.seenAt && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Seen:</span>
                      <time
                        dateTime={notification.seenAt}
                        className="text-gray-900"
                      >
                        {formatDistanceToNow(new Date(notification.seenAt), { addSuffix: true })}
                      </time>
                    </div>
                  )}

                  {notification.readAt && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Read:</span>
                      <time
                        dateTime={notification.readAt}
                        className="text-gray-900"
                      >
                        {formatDistanceToNow(new Date(notification.readAt), { addSuffix: true })}
                      </time>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Actions Footer */}
        <div className="border-t border-gray-200 p-4">
          <div className="flex gap-3">
            {!isRead && (
              <button
                onClick={handleMarkRead}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                <Check className="h-4 w-4" />
                Mark Read
              </button>
            )}

            {!isArchived && (
              <button
                onClick={handleArchive}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
              >
                <Archive className="h-4 w-4" />
                Archive
              </button>
            )}

            {hasAction && (
              <button
                onClick={handleOpenAction}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
              >
                <ExternalLink className="h-4 w-4" />
                Open Link
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
