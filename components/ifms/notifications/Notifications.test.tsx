import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type * as React from 'react';
import { SeverityBadge } from './SeverityBadge';
import { NotificationItem } from './NotificationItem';
import { NotificationsDrawer } from './NotificationsDrawer';
import { NotificationDetailsDrawer } from './NotificationDetailsDrawer';
import { NotificationBell } from './NotificationBell';

const realtimeMocks = vi.hoisted(() => ({
  notifications: [] as unknown[],
  clearRealtimeNotifications: vi.fn(),
}));

vi.mock('@/lib/hooks/useRealtimeNotifications', () => ({
  useRealtimeNotifications: () => ({
    socket: null,
    isConnected: true,
    realtimeNotifications: realtimeMocks.notifications,
    clearRealtimeNotifications: realtimeMocks.clearRealtimeNotifications,
    connectionError: null,
  }),
}));

type Notification = React.ComponentProps<typeof NotificationItem>['notification'];

function makeNotification(overrides: Partial<Notification> = {}): Notification {
  const nested = overrides.notification ?? {};
  return {
    id: 'delivery-1',
    notificationId: 'notification-1',
    userId: 'user-1',
    status: 'sent',
    deliveredVia: 'inapp',
    notification: {
      id: 'notification-1',
      type: 'inventory',
      severity: 'warning',
      title: 'Low stock alert',
      body: 'Diesel tank is below reorder level.',
      data: { tankId: 'T-100', litersRemaining: 900 },
      actionUrl: '/app/inventory/dips',
      createdAt: '2026-06-02T09:00:00.000Z',
      ...nested,
    },
    ...overrides,
  };
}

describe('notification components', () => {
  beforeEach(() => {
    realtimeMocks.notifications = [];
    realtimeMocks.clearRealtimeNotifications.mockClear();
  });

  afterEach(() => {
    cleanup();
    document.body.style.overflow = 'unset';
  });

  test('renders severity badges with default or custom labels', () => {
    render(
      <div>
        <SeverityBadge severity="info" />
        <SeverityBadge severity="success" />
        <SeverityBadge severity="warning" />
        <SeverityBadge severity="critical">Escalated</SeverityBadge>
        <SeverityBadge severity={'unknown' as 'info'} />
      </div>,
    );

    expect(screen.getByText('Info')).toBeInTheDocument();
    expect(screen.getByText('Success')).toBeInTheDocument();
    expect(screen.getByText('Warning')).toBeInTheDocument();
    expect(screen.getByText('Escalated')).toBeInTheDocument();
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  test('NotificationItem opens details and stops action buttons from bubbling', () => {
    const onOpenDetails = vi.fn();
    const onMarkRead = vi.fn();
    const onArchive = vi.fn();
    const onOpenAction = vi.fn();
    const notification = makeNotification({ errorMessage: 'Email delivery failed' });

    render(
      <NotificationItem
        notification={notification}
        onOpenDetails={onOpenDetails}
        onMarkRead={onMarkRead}
        onArchive={onArchive}
        onOpenAction={onOpenAction}
        isRealtime
      />,
    );

    const article = screen.getByRole('article', { name: 'Low stock alert' });
    fireEvent.click(article);
    fireEvent.keyDown(article, { key: 'Enter' });
    expect(onOpenDetails).toHaveBeenCalledTimes(2);
    expect(screen.getByText('New')).toBeInTheDocument();
    expect(screen.getByText('Email delivery failed')).toBeInTheDocument();

    onOpenDetails.mockClear();
    fireEvent.click(screen.getByTitle('Mark as read'));
    fireEvent.click(screen.getByTitle('Archive'));
    fireEvent.click(screen.getByTitle('Open'));

    expect(onMarkRead).toHaveBeenCalledWith('delivery-1');
    expect(onArchive).toHaveBeenCalledWith('delivery-1');
    expect(onOpenAction).toHaveBeenCalledWith('/app/inventory/dips');
    expect(onOpenDetails).not.toHaveBeenCalled();
  });

  test('NotificationItem renders read, archived, fallback severity, and keyboard space states', () => {
    const onOpenDetails = vi.fn();
    const notification = makeNotification({
      readAt: '2026-06-02T10:00:00.000Z',
      archivedAt: '2026-06-02T12:00:00.000Z',
      notification: {
        id: 'notification-unknown',
        type: 'system',
        severity: 'unknown' as 'info',
        title: 'Archived system notice',
        body: undefined,
        actionUrl: undefined,
        createdAt: '2026-06-02T09:00:00.000Z',
      },
    });

    render(<NotificationItem notification={notification} onOpenDetails={onOpenDetails} />);

    const article = screen.getByRole('article', { name: 'Archived system notice' });
    expect(article).toHaveClass('opacity-50');
    expect(screen.getByText('U')).toBeInTheDocument();
    expect(screen.queryByTitle('Mark as read')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Archive')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Open')).not.toBeInTheDocument();

    fireEvent.keyDown(article, { key: ' ' });
    expect(onOpenDetails).toHaveBeenCalled();
  });

  test('NotificationsDrawer renders loading and closed states', () => {
    const onClose = vi.fn();
    const { rerender, container } = render(
      <NotificationsDrawer
        isOpen={false}
        onClose={onClose}
        notifications={[]}
        unreadCount={0}
        onMarkRead={vi.fn()}
        onArchive={vi.fn()}
        onMarkAllRead={vi.fn()}
        onOpenAction={vi.fn()}
      />,
    );

    expect(screen.getByRole('dialog')).toHaveClass('translate-x-full');
    expect(document.body.style.overflow).toBe('unset');

    rerender(
      <NotificationsDrawer
        isOpen
        onClose={onClose}
        notifications={[]}
        unreadCount={0}
        onMarkRead={vi.fn()}
        onArchive={vi.fn()}
        onMarkAllRead={vi.fn()}
        onOpenAction={vi.fn()}
        isLoading
      />,
    );

    expect(document.body.style.overflow).toBe('hidden');
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(5);
  });

  test('NotificationsDrawer renders empty states for each tab without filters', () => {
    render(
      <NotificationsDrawer
        isOpen
        onClose={vi.fn()}
        notifications={[]}
        unreadCount={0}
        onMarkRead={vi.fn()}
        onArchive={vi.fn()}
        onMarkAllRead={vi.fn()}
        onOpenAction={vi.fn()}
      />,
    );

    expect(screen.getByText('No unread notifications')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^ARCHIVED/i }));
    expect(screen.getByText('No archived notifications')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^ALL/i }));
    expect(screen.getByText('No notifications')).toBeInTheDocument();
  });

  test('NotificationsDrawer filters, marks all read, opens details, and follows actions', async () => {
    const onClose = vi.fn();
    const onMarkRead = vi.fn();
    const onArchive = vi.fn();
    const onMarkAllRead = vi.fn();
    const onOpenAction = vi.fn();
    const notifications = [
      makeNotification(),
      makeNotification({
        id: 'delivery-2',
        readAt: '2026-06-02T11:00:00.000Z',
        notification: {
          id: 'notification-2',
          type: 'billing',
          severity: 'success',
          title: 'Invoice paid',
          body: 'Customer balance was settled.',
          actionUrl: '/app/credit/invoices',
          createdAt: '2026-06-02T10:00:00.000Z',
        },
      }),
      makeNotification({
        id: 'delivery-3',
        readAt: '2026-06-01T11:00:00.000Z',
        archivedAt: '2026-06-01T12:00:00.000Z',
        notification: {
          id: 'notification-3',
          type: 'audit',
          severity: 'critical',
          title: 'Archived audit finding',
          createdAt: '2026-06-01T10:00:00.000Z',
        },
      }),
    ];

    render(
      <NotificationsDrawer
        isOpen
        onClose={onClose}
        notifications={notifications}
        unreadCount={1}
        onMarkRead={onMarkRead}
        onArchive={onArchive}
        onMarkAllRead={onMarkAllRead}
        onOpenAction={onOpenAction}
      />,
    );

    expect(screen.getByText('Notifications')).toBeInTheDocument();
    expect(screen.getByText('Low stock alert')).toBeInTheDocument();
    expect(screen.queryByText('Invoice paid')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTitle('Mark all as read'));
    expect(onMarkAllRead).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /^ALL/i }));
    expect(screen.getByText('Invoice paid')).toBeInTheDocument();
    expect(screen.queryByText('Archived audit finding')).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Search notifications...'), {
      target: { value: 'invoice' },
    });
    expect(screen.getByText('Invoice paid')).toBeInTheDocument();
    expect(screen.queryByText('Low stock alert')).not.toBeInTheDocument();

    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'success' } });
    expect(screen.getByText('Invoice paid')).toBeInTheDocument();

    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: 'billing' } });
    expect(screen.getByText('Invoice paid')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('article', { name: 'Invoice paid' }));
    expect(await screen.findByRole('dialog', { name: 'Invoice paid' })).toBeInTheDocument();
    expect(screen.getAllByText('Customer balance was settled.').length).toBeGreaterThanOrEqual(2);
    fireEvent.click(screen.getByRole('button', { name: 'Open Link' }));

    expect(onOpenAction).toHaveBeenCalledWith('/app/credit/invoices');

    fireEvent.change(screen.getByPlaceholderText('Search notifications...'), {
      target: { value: 'not found' },
    });
    expect(screen.getByText('No notifications match your filters')).toBeInTheDocument();
  });

  test('NotificationsDrawer closes details first and then panel on Escape', async () => {
    const onClose = vi.fn();
    render(
      <NotificationsDrawer
        isOpen
        onClose={onClose}
        notifications={[makeNotification()]}
        unreadCount={1}
        onMarkRead={vi.fn()}
        onArchive={vi.fn()}
        onMarkAllRead={vi.fn()}
        onOpenAction={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('article', { name: 'Low stock alert' }));
    expect(await screen.findByRole('dialog', { name: 'Low stock alert' })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Low stock alert' })).not.toBeInTheDocument(),
    );
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  test('NotificationBell opens the drawer, marks unseen notifications, and clears realtime items', async () => {
    const onMarkSeen = vi.fn();
    const notification = makeNotification();
    realtimeMocks.notifications = [
      makeNotification({
        id: 'delivery-realtime',
        notification: {
          id: 'notification-realtime',
          type: 'inventory',
          severity: 'critical',
          title: 'Realtime tank alarm',
          createdAt: '2026-06-02T12:00:00.000Z',
        },
      }),
    ];

    render(
      <NotificationBell
        unreadCount={1}
        notifications={[
          notification,
          makeNotification({
            id: 'delivery-seen',
            seenAt: '2026-06-02T13:00:00.000Z',
            notification: {
              id: 'notification-seen',
              type: 'billing',
              severity: 'info',
              title: 'Already seen',
              createdAt: '2026-06-02T12:00:00.000Z',
            },
          }),
        ]}
        onMarkRead={vi.fn()}
        onArchive={vi.fn()}
        onMarkAllRead={vi.fn()}
        onOpenAction={vi.fn()}
        onMarkSeen={onMarkSeen}
      />,
    );

    const trigger = screen.getByRole('button', { name: 'Notifications, 1 unseen' });
    fireEvent.click(trigger);

    await waitFor(() => {
      expect(onMarkSeen).toHaveBeenCalledWith(['delivery-1']);
      expect(realtimeMocks.clearRealtimeNotifications).toHaveBeenCalled();
    });
    expect(screen.getByText('Realtime tank alarm')).toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(screen.getByLabelText('Close panel'));
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  test('NotificationBell handles absent unseen callbacks and caps the badge count', () => {
    const notifications = Array.from({ length: 12 }, (_, index) =>
      makeNotification({
        id: `delivery-${index}`,
        notification: {
          id: `notification-${index}`,
          type: 'inventory',
          severity: 'warning',
          title: `Unseen ${index}`,
          createdAt: '2026-06-02T12:00:00.000Z',
        },
      }),
    );

    render(
      <NotificationBell
        unreadCount={12}
        notifications={notifications}
        onMarkRead={vi.fn()}
        onArchive={vi.fn()}
        onMarkAllRead={vi.fn()}
        onOpenAction={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Notifications, 12 unseen' })).toBeInTheDocument();
    expect(screen.getAllByText('9+').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Notifications, 12 unseen' }));
    expect(screen.getByText('Unseen 0')).toBeInTheDocument();
  });

  test('NotificationBell omits the badge and count label when everything is seen', () => {
    render(
      <NotificationBell
        unreadCount={0}
        notifications={[
          makeNotification({
            id: 'seen-only',
            seenAt: '2026-06-02T12:00:00.000Z',
            notification: {
              id: 'seen-only-notification',
              type: 'audit',
              severity: 'info',
              title: 'Seen already',
              createdAt: '2026-06-02T11:00:00.000Z',
            },
          }),
        ]}
        onMarkRead={vi.fn()}
        onArchive={vi.fn()}
        onMarkAllRead={vi.fn()}
        onOpenAction={vi.fn()}
        onMarkSeen={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument();
    expect(screen.queryByText('9+')).not.toBeInTheDocument();
  });

  test('NotificationDetailsDrawer renders metadata and invokes footer actions', () => {
    const onClose = vi.fn();
    const onMarkRead = vi.fn();
    const onArchive = vi.fn();
    const onOpenAction = vi.fn();
    const notification = makeNotification({ seenAt: '2026-06-02T10:00:00.000Z' });

    render(
      <NotificationDetailsDrawer
        notification={notification}
        isOpen
        onClose={onClose}
        onMarkRead={onMarkRead}
        onArchive={onArchive}
        onOpenAction={onOpenAction}
      />,
    );

    expect(screen.getByRole('dialog', { name: 'Low stock alert' })).toBeInTheDocument();
    expect(screen.getByText('Status & Timeline')).toBeInTheDocument();
    expect(screen.getByText('Seen')).toBeInTheDocument();
    expect(screen.getByText('Tank Id:')).toBeInTheDocument();
    expect(screen.getByText('T-100')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Mark Read' }));
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Link' }));

    expect(onMarkRead).toHaveBeenCalledWith('delivery-1');
    expect(onArchive).toHaveBeenCalledWith('delivery-1');
    expect(onOpenAction).toHaveBeenCalledWith('/app/inventory/dips');
    expect(onClose).toHaveBeenCalled();
  });

  test('NotificationDetailsDrawer hides unavailable actions for read archived notices', () => {
    const notification = makeNotification({
      readAt: '2026-06-02T10:30:00.000Z',
      archivedAt: '2026-06-02T11:00:00.000Z',
      notification: {
        id: 'notification-read',
        type: 'audit',
        severity: 'success',
        title: 'Archived read notice',
        body: undefined,
        data: {},
        actionUrl: undefined,
        createdAt: '2026-06-02T09:00:00.000Z',
      },
    });

    render(
      <NotificationDetailsDrawer
        notification={notification}
        isOpen
        onClose={vi.fn()}
        onMarkRead={vi.fn()}
        onArchive={vi.fn()}
        onOpenAction={vi.fn()}
      />,
    );

    expect(screen.getByRole('dialog', { name: 'Archived read notice' })).toBeInTheDocument();
    expect(screen.getByText('Read')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark Read' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Archive' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open Link' })).not.toBeInTheDocument();
    expect(screen.queryByText('Details')).not.toBeInTheDocument();
  });

  test('NotificationDetailsDrawer renders nothing when closed or missing a notification', () => {
    const notification = makeNotification();
    const { rerender } = render(
      <NotificationDetailsDrawer notification={notification} isOpen={false} onClose={vi.fn()} />,
    );

    expect(screen.queryByRole('dialog', { name: 'Low stock alert' })).not.toBeInTheDocument();

    rerender(<NotificationDetailsDrawer notification={null} isOpen onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
