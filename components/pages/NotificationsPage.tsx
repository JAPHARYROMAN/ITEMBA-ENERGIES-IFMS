import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Bell, Archive, Search, Check, RefreshCw } from 'lucide-react';
import {
  useNotifications,
  useUnreadCount,
  useOptimisticMarkRead,
  useOptimisticArchive,
  type NotificationFilters,
} from '@/lib/hooks/notifications';
import { NotificationItem } from '@/components/ifms/notifications/NotificationItem';
import PageHeader from '@/components/ifms/PageHeader';
import DataTableShell from '@/components/ifms/DataTableShell';
import { cn } from '@/lib/utils';

type TabType = 'all' | 'unread' | 'archived';
type BulkAction = 'mark-read' | 'archive';

interface NotificationsPageProps {}

export default function NotificationsPage({}: NotificationsPageProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>('unread');
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // API hooks
  const {
    data: notificationsData,
    isLoading,
    refetch,
  } = useNotifications({
    status: activeTab === 'unread' ? undefined : activeTab === 'archived' ? undefined : undefined,
    unread: activeTab === 'unread' ? true : undefined,
    severity:
      severityFilter !== 'all'
        ? (severityFilter as NotificationFilters['severity'])
        : undefined,
    type: typeFilter !== 'all' ? typeFilter : undefined,
    page,
    pageSize,
  });

  const { data: unreadCount } = useUnreadCount();
  const { markReadOptimistic } = useOptimisticMarkRead();
  const { archiveOptimistic } = useOptimisticArchive();

  const notifications = useMemo(
    () => notificationsData?.deliveries || [],
    [notificationsData],
  );
  const totalCount = notificationsData?.total || 0;

  // Filter notifications based on search and active tab
  const filteredNotifications = useMemo(() => {
    return notifications.filter((notification) => {
      // Search filter
      if (searchQuery) {
        const searchLower = searchQuery.toLowerCase();
        const titleMatch = notification.notification.title.toLowerCase().includes(searchLower);
        const bodyMatch = notification.notification.body?.toLowerCase().includes(searchLower);
        const typeMatch = notification.notification.type.toLowerCase().includes(searchLower);
        if (!titleMatch && !bodyMatch && !typeMatch) return false;
      }

      return true;
    });
  }, [notifications, searchQuery]);

  // Handle individual actions
  const handleMarkRead = (id: string) => {
    markReadOptimistic(id);
  };

  const handleArchive = (id: string) => {
    archiveOptimistic(id);
  };

  const handleOpenAction = (actionUrl: string) => {
    navigate(actionUrl);
  };

  // Handle bulk actions
  const handleBulkAction = async (action: BulkAction) => {
    if (selectedIds.size === 0) return;

    if (action === 'mark-read') {
      // Mark selected notifications as read
      for (const id of selectedIds) {
        markReadOptimistic(id);
      }
    } else if (action === 'archive') {
      // Archive selected notifications
      for (const id of selectedIds) {
        archiveOptimistic(id);
      }
    }

    setSelectedIds(new Set());
  };

  // Handle selection
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(filteredNotifications.map((n) => n.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelect = (id: string, checked: boolean) => {
    const newSelected = new Set(selectedIds);
    if (checked) {
      newSelected.add(id);
    } else {
      newSelected.delete(id);
    }
    setSelectedIds(newSelected);
  };

  // Get unique types for filter
  const availableTypes = useMemo(() => {
    const types = new Set(notifications.map((n) => n.notification.type));
    return Array.from(types).sort();
  }, [notifications]);

  const tabs: { id: TabType; label: string; count?: number }[] = [
    { id: 'all', label: 'All', count: totalCount },
    { id: 'unread', label: 'Unread', count: unreadCount },
    { id: 'archived', label: 'Archived' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('pages.notificationsTitle')}
        description={t('pages.notificationsDesc')}
        icon={Bell}
        actions={
          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <RefreshCw className="h-4 w-4" />
            {t('common.refresh')}
          </button>
        }
      />

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setSelectedIds(new Set());
                setPage(1);
              }}
              className={cn(
                'whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm transition-colors',
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
              )}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span
                  className={cn(
                    'ml-2 py-0.5 px-2 rounded-full text-xs',
                    activeTab === tab.id
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-gray-100 text-gray-600',
                  )}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <input
              type="text"
              placeholder="Search notifications..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
            className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            {availableTypes.map((type) => (
              <option key={type} value={type}>
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Bulk Actions */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <span className="text-sm text-blue-800">
            {selectedIds.size} notification{selectedIds.size === 1 ? '' : 's'} selected
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => handleBulkAction('mark-read')}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-blue-700 bg-white border border-blue-300 rounded-md hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <Check className="h-4 w-4" />
              Mark Read
            </button>
            <button
              onClick={() => handleBulkAction('archive')}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-transparent"
            >
              <Archive className="h-4 w-4" />
              Archive
            </button>
          </div>
        </div>
      )}

      {/* Notifications List */}
      <DataTableShell
        data={filteredNotifications}
        columns={[]}
        isLoading={isLoading}
        totalCount={totalCount}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        emptyMessage={
          searchQuery || severityFilter !== 'all' || typeFilter !== 'all'
            ? 'No notifications match your filters'
            : activeTab === 'unread'
              ? 'No unread notifications'
              : activeTab === 'archived'
                ? 'No archived notifications'
                : 'No notifications found'
        }
        className="border rounded-lg"
      >
        <div className="space-y-2">
          {/* Select All Checkbox */}
          {filteredNotifications.length > 0 && (
            <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 border-b">
              <input
                type="checkbox"
                checked={selectedIds.size === filteredNotifications.length}
                onChange={handleSelectAll}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <span className="text-sm text-gray-600">Select all</span>
            </div>
          )}

          {/* Notifications */}
          {filteredNotifications.map((notification) => (
            <div key={notification.id} className="relative">
              <div className="absolute left-4 top-4">
                <input
                  type="checkbox"
                  checked={selectedIds.has(notification.id)}
                  onChange={(checked) =>
                    handleSelect(notification.id, (checked.target as HTMLInputElement).checked)
                  }
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
              </div>
              <div className="pl-12">
                <NotificationItem
                  notification={notification}
                  onMarkRead={handleMarkRead}
                  onArchive={handleArchive}
                  onOpenAction={handleOpenAction}
                />
              </div>
            </div>
          ))}
        </div>
      </DataTableShell>
    </div>
  );
}
