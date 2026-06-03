import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import Header from './Header';
import { useAppStore, useAuthStore } from '../store';
import type { User } from '../types';

const notificationMocks = vi.hoisted(() => ({
  refetchNotifications: vi.fn(),
  markReadOptimistic: vi.fn(),
  archiveOptimistic: vi.fn(),
  markAllRead: vi.fn(),
}));

vi.mock('./ifms/Breadcrumbs', () => ({ default: () => 'Breadcrumb trail' }));
vi.mock('./ifms/StationSwitcher', () => ({ StationSwitcher: () => 'Station switcher' }));
vi.mock('@/lib/hooks/notifications', () => ({
  useNotifications: () => ({
    data: {
      deliveries: [
        {
          id: 'delivery-1',
          notificationId: 'notification-1',
          userId: 'user-1',
          status: 'sent',
          deliveredVia: 'inapp',
          notification: {
            id: 'notification-1',
            type: 'approval',
            severity: 'info',
            title: 'Shift approval',
            createdAt: '2026-06-03T08:00:00Z',
            actionUrl: '/app/notifications',
          },
        },
      ],
    },
    refetch: notificationMocks.refetchNotifications,
  }),
  useUnreadCount: () => ({ data: 1 }),
  useOptimisticMarkRead: () => ({
    markReadOptimistic: notificationMocks.markReadOptimistic,
  }),
  useOptimisticArchive: () => ({
    archiveOptimistic: notificationMocks.archiveOptimistic,
  }),
  useMarkAllRead: () => ({ mutate: notificationMocks.markAllRead }),
}));
vi.mock('./ifms/notifications/NotificationBell', async () => {
  const React = await import('react');
  return {
    NotificationBell: (props: {
      unreadCount: number;
      notifications: Array<{ id: string }>;
      onMarkRead: (id: string) => void;
      onArchive: (id: string) => void;
      onMarkAllRead: () => void;
      onOpenAction: (actionUrl: string) => void;
      onMarkSeen?: (ids: string[]) => void;
    }) =>
      React.createElement(
        'div',
        { 'data-testid': 'notification-bell' },
        React.createElement('span', null, `Unread: ${props.unreadCount}`),
        React.createElement(
          'button',
          { type: 'button', onClick: () => props.onMarkRead(props.notifications[0].id) },
          'Mark first notification read',
        ),
        React.createElement(
          'button',
          { type: 'button', onClick: () => props.onArchive(props.notifications[0].id) },
          'Archive first notification',
        ),
        React.createElement(
          'button',
          { type: 'button', onClick: props.onMarkAllRead },
          'Mark all notifications read',
        ),
        React.createElement(
          'button',
          { type: 'button', onClick: () => props.onOpenAction('/app/notifications') },
          'Open notification action',
        ),
        React.createElement(
          'button',
          { type: 'button', onClick: () => void props.onMarkSeen?.(['delivery-1']) },
          'Mark notifications seen',
        ),
      ),
  };
});

afterEach(cleanup);

const logoutMock = vi.fn();
const addToastMock = vi.fn();
const hydrateAuthMock = vi.fn();

function makeUser(role: User['role']): User {
  return {
    id: `user-${role}`,
    name: `${role} user`,
    email: `${role}@itemba.test`,
    role,
    permissions: ['reports:read', 'sales:read'],
  };
}

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{location.pathname}</span>;
}

function renderHeader(path = '/app/dashboard') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Header />
      <LocationProbe />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  document.documentElement.classList.remove('dark');
  useAppStore.setState({
    theme: 'light',
    sidebarCollapsed: false,
    isSearchOpen: false,
    isAiPanelOpen: false,
    toasts: [],
    addToast: addToastMock,
  });
  useAuthStore.setState({
    user: makeUser('manager'),
    isAuthenticated: true,
    isAuthReady: true,
    hydrateAuth: hydrateAuthMock,
    logout: logoutMock,
  });
});

describe('Header', () => {
  test('renders session context and drives search, theme, AI panel, and logout actions', () => {
    renderHeader();

    expect(screen.getByText('Breadcrumb trail')).toBeInTheDocument();
    expect(screen.getByText('API MODE')).toBeInTheDocument();
    expect(screen.getByText('CORE: PRODUCTION')).toBeInTheDocument();
    expect(screen.getByText('manager user')).toBeInTheDocument();
    expect(screen.getByText('manager')).toHaveClass('text-emerald-600');

    const quickFind = screen.getByText('Quick Find...').closest('button');
    expect(quickFind).not.toBeNull();
    fireEvent.click(quickFind!);
    expect(useAppStore.getState().isSearchOpen).toBe(true);

    fireEvent.click(screen.getByLabelText('Toggle Theme'));
    expect(useAppStore.getState().theme).toBe('dark');
    expect(document.documentElement).toHaveClass('dark');

    fireEvent.click(screen.getByLabelText('IFMS Command'));
    expect(useAppStore.getState().isAiPanelOpen).toBe(true);

    fireEvent.click(screen.getByLabelText('Logout'));
    expect(logoutMock).toHaveBeenCalledTimes(1);
  });

  test('uses role-specific badge classes and falls back when no role is available', () => {
    renderHeader();

    act(() => useAuthStore.setState({ user: makeUser('cashier') }));
    expect(screen.getByText('cashier')).toHaveClass('text-blue-600');

    act(() => useAuthStore.setState({ user: makeUser('auditor') }));
    expect(screen.getByText('auditor')).toHaveClass('text-amber-600');

    act(() => useAuthStore.setState({ user: null }));
    expect(screen.queryByText('auditor user')).not.toBeInTheDocument();
  });

  test('passes notification interactions through to hooks and navigation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    renderHeader();

    expect(screen.getByTestId('notification-bell')).toHaveTextContent('Unread: 1');

    fireEvent.click(screen.getByRole('button', { name: 'Mark first notification read' }));
    expect(notificationMocks.markReadOptimistic).toHaveBeenCalledWith('delivery-1');

    fireEvent.click(screen.getByRole('button', { name: 'Archive first notification' }));
    expect(notificationMocks.archiveOptimistic).toHaveBeenCalledWith('delivery-1');

    fireEvent.click(screen.getByRole('button', { name: 'Mark all notifications read' }));
    expect(notificationMocks.markAllRead).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Open notification action' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/app/notifications');

    fireEvent.click(screen.getByRole('button', { name: 'Mark notifications seen' }));
    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith('/api/notifications/mark-seen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: ['delivery-1'] }),
      }),
    );
    expect(notificationMocks.refetchNotifications).toHaveBeenCalledTimes(1);
  });

  test('shows a toast when marking notifications as seen fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    renderHeader();

    fireEvent.click(screen.getByRole('button', { name: 'Mark notifications seen' }));

    await waitFor(() =>
      expect(addToastMock).toHaveBeenCalledWith(
        'Failed to update notifications. Please try again.',
        'error',
      ),
    );
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
