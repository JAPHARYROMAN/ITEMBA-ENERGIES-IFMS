import React, { useState, useEffect, useRef } from 'react';
import { Bell, X, Search, Check, Archive, CheckCheck } from 'lucide-react';
import { NotificationItem } from './NotificationItem';
import { NotificationDetailsDrawer } from './NotificationDetailsDrawer';
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

interface NotificationsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: Notification[];
  unreadCount: number;
  onMarkRead: (id: string) => void;
  onArchive: (id: string) => void;
  onMarkAllRead: () => void;
  onOpenAction: (actionUrl: string) => void;
  isLoading?: boolean;
  realtimeNotifications?: Notification[];
}

type TabType = 'all' | 'unread' | 'archived';

export function NotificationsDrawer({
  isOpen,
  onClose,
  notifications,
  unreadCount,
  onMarkRead,
  onArchive,
  onMarkAllRead,
  onOpenAction,
  isLoading = false,
  realtimeNotifications = [],
}: NotificationsDrawerProps) {
  const [activeTab, setActiveTab] = useState<TabType>('unread');
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detailsNotification, setDetailsNotification] = useState<Notification | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const drawerRef = useRef<HTMLDivElement>(null);
  const firstFocusableRef = useRef<HTMLButtonElement>(null);

  // Combine regular and realtime notifications
  const allNotifications = React.useMemo(
    () => [...realtimeNotifications, ...notifications],
    [realtimeNotifications, notifications],
  );

  // Filter notifications based on active tab and filters
  const filteredNotifications = React.useMemo(() => {
    return allNotifications.filter((notification) => {
      // Tab filter
      if (activeTab === 'unread' && notification.readAt) return false;
      if (activeTab === 'archived' && !notification.archivedAt) return false;
      if (activeTab === 'all' && notification.archivedAt) return false;

      // Search filter
      if (searchQuery) {
        const searchLower = searchQuery.toLowerCase();
        const titleMatch = notification.notification.title.toLowerCase().includes(searchLower);
        const bodyMatch = notification.notification.body?.toLowerCase().includes(searchLower);
        const typeMatch = notification.notification.type.toLowerCase().includes(searchLower);
        if (!titleMatch && !bodyMatch && !typeMatch) return false;
      }

      // Severity filter
      if (severityFilter !== 'all' && notification.notification.severity !== severityFilter) {
        return false;
      }

      // Type filter
      if (typeFilter !== 'all' && notification.notification.type !== typeFilter) {
        return false;
      }

      return true;
    });
  }, [allNotifications, activeTab, searchQuery, severityFilter, typeFilter]);

  // Focus management
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => firstFocusableRef.current?.focus(), 100);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isDetailsOpen) setIsDetailsOpen(false);
        else if (isOpen) onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, isDetailsOpen, onClose]);

  const handleTabChange = (tab: TabType) => { setActiveTab(tab); setSelectedIds(new Set()); };

  const handleSelect = (id: string, checked: boolean) => {
    const next = new Set(selectedIds);
    checked ? next.add(id) : next.delete(id);
    setSelectedIds(next);
  };

  const handleBulkAction = (action: 'mark-read' | 'archive') => {
    selectedIds.forEach(id => action === 'mark-read' ? onMarkRead(id) : onArchive(id));
    setSelectedIds(new Set());
  };

  const handleCloseDetails = () => { setIsDetailsOpen(false); setDetailsNotification(null); };

  // Get unique types for filter
  const availableTypes = React.useMemo(() => {
    return Array.from(new Set(notifications.map(n => n.notification.type))).sort();
  }, [notifications]);

  const tabs: { id: TabType; label: string; count?: number }[] = [
    { id: 'all', label: 'ALL', count: allNotifications.filter(n => !n.archivedAt).length },
    { id: 'unread', label: 'UNREAD', count: unreadCount },
    { id: 'archived', label: 'ARCHIVED', count: allNotifications.filter(n => n.archivedAt).length },
  ];

  return (
    <>
      {/* Backdrop — matches DetailsDrawer */}
      <div
        className={cn(
          'fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-[60] transition-opacity duration-300',
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none',
        )}
        onClick={onClose}
      />

      {/* Panel — matches DetailsDrawer */}
      <div
        ref={drawerRef}
        className={cn(
          'fixed top-0 right-0 h-full w-full max-w-md bg-card border-l border-border shadow-2xl z-[70]',
          'transition-transform duration-500 ease-out transform',
          isOpen ? 'translate-x-0' : 'translate-x-full',
        )}
        role="dialog"
        aria-labelledby="notifications-title"
      >
        <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950">
          {/* Header */}
          <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-card">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-600/20">
                  <Bell size={16} className="text-white" />
                </div>
                {unreadCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-4 w-4 bg-rose-500 text-white text-[9px] font-black items-center justify-center">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  </span>
                )}
              </div>
              <div>
                <h2 id="notifications-title" className="text-lg font-black tracking-tight">Notifications</h2>
                <p className="text-[10px] text-muted-foreground font-black uppercase tracking-[0.2em]">
                  {unreadCount} unread
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {selectedIds.size > 0 && (
                <div className="flex gap-1 mr-1">
                  <button
                    onClick={() => handleBulkAction('mark-read')}
                    className="p-2 hover:bg-muted rounded-xl text-muted-foreground transition-colors border border-transparent hover:border-border"
                    title="Mark selected as read"
                  >
                    <Check size={14} />
                  </button>
                  <button
                    onClick={() => handleBulkAction('archive')}
                    className="p-2 hover:bg-muted rounded-xl text-muted-foreground transition-colors border border-transparent hover:border-border"
                    title="Archive selected"
                  >
                    <Archive size={14} />
                  </button>
                </div>
              )}
              {unreadCount > 0 && (
                <button
                  onClick={onMarkAllRead}
                  className="p-2 hover:bg-muted rounded-xl text-muted-foreground transition-colors border border-transparent hover:border-border"
                  title="Mark all as read"
                >
                  <CheckCheck size={16} />
                </button>
              )}
              <button
                ref={firstFocusableRef}
                onClick={onClose}
                className="p-2 hover:bg-muted rounded-xl text-muted-foreground transition-all border border-border"
                aria-label="Close panel"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-border bg-card">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={cn(
                  'flex-1 px-3 py-3 text-[10px] font-black uppercase tracking-[0.15em] border-b-2 transition-all',
                  activeTab === tab.id
                    ? 'border-primary text-primary bg-primary/5'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30',
                )}
              >
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className={cn(
                    'ml-1.5 py-0.5 px-1.5 rounded-md text-[9px] font-black',
                    activeTab === tab.id
                      ? 'bg-primary/10 text-primary'
                      : 'bg-muted text-muted-foreground',
                  )}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Filters */}
          <div className="px-4 py-3 border-b border-border bg-muted/10 space-y-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search notifications..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs bg-muted/50 border border-input rounded-xl focus:border-primary/50 focus:ring-0 focus:outline-none placeholder:text-muted-foreground transition-all"
              />
            </div>
            <div className="flex gap-2">
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="flex-1 px-3 py-2 text-xs bg-muted/50 border border-input rounded-xl focus:border-primary/50 focus:ring-0 focus:outline-none transition-all"
              >
                <option value="all">All Severities</option>
                <option value="info">Info</option>
                <option value="success">Success</option>
                <option value="warning">Warning</option>
                <option value="critical">Critical</option>
              </select>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="flex-1 px-3 py-2 text-xs bg-muted/50 border border-input rounded-xl focus:border-primary/50 focus:ring-0 focus:outline-none transition-all"
              >
                <option value="all">All Types</option>
                {availableTypes.map((type) => (
                  <option key={type} value={type}>
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Notifications List */}
          <div className="flex-1 overflow-y-auto no-scrollbar">
            {isLoading ? (
              <div className="p-4 space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="animate-pulse p-4 bg-card border border-border rounded-xl">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 bg-muted rounded-xl" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 bg-muted rounded w-3/4" />
                        <div className="h-3 bg-muted rounded w-1/2" />
                        <div className="h-2 bg-muted rounded w-1/4" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredNotifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full p-8">
                <div className="w-16 h-16 bg-muted/50 rounded-xl flex items-center justify-center mb-4">
                  <Bell size={28} className="text-muted-foreground opacity-40" />
                </div>
                <p className="text-sm font-black tracking-tight text-center">
                  {searchQuery || severityFilter !== 'all' || typeFilter !== 'all'
                    ? 'No notifications match your filters'
                    : activeTab === 'unread'
                    ? 'No unread notifications'
                    : activeTab === 'archived'
                    ? 'No archived notifications'
                    : 'No notifications'}
                </p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-black mt-2">
                  Check back later
                </p>
              </div>
            ) : (
              <div className="p-3 space-y-1">
                {filteredNotifications.map((n) => (
                  <NotificationItem
                    key={n.id}
                    notification={n}
                    isSelected={selectedIds.has(n.id)}
                    onSelect={(checked: boolean) => handleSelect(n.id, checked)}
                    onMarkRead={() => onMarkRead(n.id)}
                    onArchive={() => onArchive(n.id)}
                    onOpenDetails={() => { setDetailsNotification(n); setIsDetailsOpen(true); }}
                    onOpenAction={onOpenAction}
                    isRealtime={realtimeNotifications.some(rn => rn.id === n.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Details Drawer */}
      <NotificationDetailsDrawer
        notification={detailsNotification}
        isOpen={isDetailsOpen}
        onClose={handleCloseDetails}
        onMarkRead={onMarkRead}
        onArchive={onArchive}
        onOpenAction={onOpenAction}
      />
    </>
  );
}
