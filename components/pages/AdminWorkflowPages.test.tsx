import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ChangeEvent, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { useAppStore, useAuthStore } from '../../store';

const notificationMocks = vi.hoisted(() => ({
  useNotificationPreferences: vi.fn(),
  useNotifications: vi.fn(),
  useUnreadCount: vi.fn(),
  useOptimisticMarkRead: vi.fn(),
  useOptimisticArchive: vi.fn(),
  markRead: vi.fn(),
  archive: vi.fn(),
  updatePreferences: vi.fn(),
  refetchNotifications: vi.fn(),
  navigate: vi.fn(),
}));

const translate = vi.hoisted(() => (key: string, options?: string | { defaultValue?: string }) => {
  if (typeof options === 'string') return options;
  const labels: Record<string, string> = {
    'pages.governanceTitle': 'Governance Approvals',
    'pages.governanceDesc': 'Approval queue',
    'pages.auditTitle': 'Audit Log',
    'pages.auditDesc': 'Immutable activity trail',
    'pages.usersTitle': 'Users & Roles',
    'pages.usersDesc': 'Manage access',
    'pages.notificationsTitle': 'Notifications',
    'pages.notificationsDesc': 'Notification center',
    'common.export': 'Export',
    'common.refresh': 'Refresh',
    'users.createUser': 'Create User',
    'users.userCreated': 'User created',
    'users.userUpdated': 'User updated',
    'users.role': 'Role assigned',
    'users.userDeleted': 'Role removed',
  };
  return options?.defaultValue ?? labels[key] ?? key;
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: translate }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => notificationMocks.navigate,
}));

function pageHeaderFactory() {
  return async () => {
    const React = await import('react');
    return {
      default: ({
        title,
        description,
        actions,
      }: {
        title: string;
        description?: string;
        actions?: ReactNode;
      }) =>
        React.createElement(
          'header',
          {},
          React.createElement('h1', {}, title),
          description ? React.createElement('p', {}, description) : null,
          actions,
        ),
    };
  };
}

vi.mock('../ifms/PageHeader', pageHeaderFactory());
vi.mock('@/components/ifms/PageHeader', pageHeaderFactory());

vi.mock('../ifms/FilterBar', async () => {
  const React = await import('react');
  return {
    default: ({ onSearch }: { onSearch: (value: string) => void }) =>
      React.createElement('input', {
        'aria-label': 'Filter rows',
        onChange: (event: ChangeEvent<HTMLInputElement>) => onSearch(event.target.value),
      }),
  };
});

vi.mock('../ifms/ExportButton', async () => {
  const React = await import('react');
  return {
    ExportButton: ({ label }: { label?: string }) =>
      React.createElement('button', { type: 'button' }, label ?? 'Export'),
  };
});

vi.mock('../ifms/Skeletons', async () => {
  const React = await import('react');
  return { TableSkeleton: () => React.createElement('div', {}, 'Table loading') };
});

vi.mock('../ifms/DetailsDrawer', async () => {
  const React = await import('react');
  return {
    default: ({
      isOpen,
      onClose,
      title,
      subtitle,
      children,
    }: {
      isOpen: boolean;
      onClose: () => void;
      title: string;
      subtitle?: string;
      children: ReactNode;
    }) =>
      isOpen
        ? React.createElement(
            'aside',
            { role: 'dialog', 'aria-label': title },
            React.createElement('h2', {}, title),
            subtitle ? React.createElement('p', {}, subtitle) : null,
            React.createElement('button', { type: 'button', onClick: onClose }, 'Close drawer'),
            children,
          )
        : null,
  };
});

vi.mock('../ifms/DataTable', async () => {
  const React = await import('react');
  type Column = {
    header: string;
    accessorKey: string;
    cell?: (row: Record<string, unknown>) => ReactNode;
  };
  return {
    IFMSDataTable: ({
      data,
      columns,
      onRowClick,
    }: {
      data: Record<string, unknown>[];
      columns: Column[];
      onRowClick?: (row: Record<string, unknown>) => void;
    }) =>
      React.createElement(
        'div',
        { 'data-testid': 'ifms-data-table' },
        React.createElement('p', {}, `Rows ${data.length}`),
        columns.map((column) => React.createElement('span', { key: column.accessorKey }, column.header)),
        data.map((row, index) => {
          const id = String(row.id ?? row.code ?? `row-${index}`);
          return React.createElement(
            'section',
            { key: id, 'data-testid': `row-${id}` },
            React.createElement('button', { type: 'button', onClick: () => onRowClick?.(row) }, `Open ${id}`),
            columns.map((column) =>
              React.createElement(
                'div',
                { key: `${id}-${column.accessorKey}` },
                column.cell ? column.cell(row) : (row[column.accessorKey] as ReactNode),
              ),
            ),
          );
        }),
      ),
  };
});

vi.mock('@/components/ifms/DataTableShell', async () => {
  const React = await import('react');
  return {
    default: ({
      children,
      data,
      isLoading,
      totalCount,
      page,
      pageSize,
      onPageChange,
      onPageSizeChange,
      emptyMessage,
    }: {
      children: ReactNode;
      data: unknown[];
      isLoading: boolean;
      totalCount: number;
      page: number;
      pageSize: number;
      onPageChange: (page: number) => void;
      onPageSizeChange: (size: number) => void;
      emptyMessage: string;
    }) =>
      React.createElement(
        'section',
        { 'data-testid': 'notification-shell' },
        React.createElement('p', {}, `Shell ${data.length}/${totalCount} page ${page} size ${pageSize}`),
        isLoading ? React.createElement('div', {}, 'Notifications loading') : data.length ? children : React.createElement('div', {}, emptyMessage),
        React.createElement('button', { type: 'button', onClick: () => onPageChange(page + 1) }, 'Next notifications'),
        React.createElement('button', { type: 'button', onClick: () => onPageSizeChange(50) }, 'Size 50'),
      ),
  };
});

vi.mock('@/components/ifms/notifications/NotificationItem', async () => {
  const React = await import('react');
  return {
    NotificationItem: ({
      notification,
      onMarkRead,
      onArchive,
      onOpenAction,
    }: {
      notification: {
        id: string;
        notification: { title: string; body?: string; actionUrl?: string };
      };
      onMarkRead: (id: string) => void;
      onArchive: (id: string) => void;
      onOpenAction: (url: string) => void;
    }) =>
      React.createElement(
        'article',
        {},
        React.createElement('h3', {}, notification.notification.title),
        React.createElement('p', {}, notification.notification.body),
        React.createElement('button', { type: 'button', onClick: () => onMarkRead(notification.id) }, `Mark ${notification.id}`),
        React.createElement('button', { type: 'button', onClick: () => onArchive(notification.id) }, `Archive ${notification.id}`),
        React.createElement(
          'button',
          { type: 'button', onClick: () => onOpenAction(notification.notification.actionUrl ?? '/fallback') },
          `Open action ${notification.id}`,
        ),
      ),
  };
});

vi.mock('../ifms/forms/Primitives', async () => {
  const React = await import('react');
  return {
    FormShell: ({ children, actions, title }: { children: ReactNode; actions?: ReactNode; title: string }) =>
      React.createElement('div', {}, React.createElement('h3', {}, title), children, actions),
    FormSection: ({ children, title }: { children: ReactNode; title: string }) =>
      React.createElement('section', {}, React.createElement('h4', {}, title), children),
    FormSubmitState: ({ label }: { label: string }) => React.createElement('span', {}, label),
    PermissionGuard: ({ children }: { children: ReactNode }) => React.createElement(React.Fragment, {}, children),
  };
});

vi.mock('../ifms/forms/Fields', async () => {
  const React = await import('react');
  const { useFormContext } = await import('react-hook-form');
  function Field({
    name,
    label,
    type = 'text',
    options,
  }: {
    name: string;
    label: string;
    type?: string;
    options?: Array<{ label: string; value: string }>;
  }) {
    const { register } = useFormContext();
    if (options) {
      return React.createElement(
        'label',
        {},
        label,
        React.createElement(
          'select',
          { 'aria-label': label, ...register(name) },
          React.createElement('option', { value: '' }, 'Select'),
          options.map((option) =>
            React.createElement('option', { key: option.value, value: option.value }, option.label),
          ),
        ),
      );
    }
    return React.createElement(
      'label',
      {},
      label,
      React.createElement('input', { 'aria-label': label, type, ...register(name) }),
    );
  }
  return {
    TextField: Field,
    NumberField: (props: { name: string; label: string }) => Field({ ...props, type: 'number' }),
    SelectField: Field,
    ToggleField: ({ name, label }: { name: string; label: string }) => {
      const { register } = useFormContext();
      return React.createElement('label', {}, label, React.createElement('input', { type: 'checkbox', 'aria-label': label, ...register(name) }));
    },
  };
});

vi.mock('../../lib/api/governance', () => ({
  apiGovernance: {
    listApprovals: vi.fn(),
    getApproval: vi.fn(),
    approve: vi.fn(),
    reject: vi.fn(),
    submit: vi.fn(),
    listPolicies: vi.fn(),
    createPolicy: vi.fn(),
    updatePolicy: vi.fn(),
  },
}));

vi.mock('../../lib/data-source', () => ({
  setupDataSource: {
    companies: { list: vi.fn() },
    branches: { list: vi.fn() },
  },
}));

vi.mock('@/lib/hooks/notifications', () => ({
  useNotificationPreferences: notificationMocks.useNotificationPreferences,
  useNotifications: notificationMocks.useNotifications,
  useUnreadCount: notificationMocks.useUnreadCount,
  useOptimisticMarkRead: notificationMocks.useOptimisticMarkRead,
  useOptimisticArchive: notificationMocks.useOptimisticArchive,
}));

vi.mock('../../lib/api/audit', () => ({
  fetchAuditLogs: vi.fn(),
}));

vi.mock('../../lib/api/client', () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from '../../lib/api/client';
import { fetchAuditLogs } from '../../lib/api/audit';
import { apiGovernance } from '../../lib/api/governance';
import { setupDataSource } from '../../lib/data-source';
import AuditLogPage from './AuditLogPage';
import GovernanceApprovalsPage from './GovernanceApprovalsPage';
import GovernancePoliciesPage from './GovernancePoliciesPage';
import NotificationSettingsPage from './NotificationSettingsPage';
import NotificationsPage from './NotificationsPage';
import UsersRolesPage from './UsersRolesPage';

const governance = vi.mocked(apiGovernance);
const auditLogs = vi.mocked(fetchAuditLogs);
const fetchApi = vi.mocked(apiFetch);
const companiesList = vi.mocked(setupDataSource.companies.list);
const branchesList = vi.mocked(setupDataSource.branches.list);

function renderPage(component: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}>{component}</QueryClientProvider>);
  return client;
}

function setUser(permissions: string[]) {
  useAuthStore.setState({
    user: {
      id: 'user-1',
      name: 'Admin User',
      email: 'admin@ifms.test',
      role: 'manager',
      permissions,
    },
    isAuthenticated: true,
    isAuthReady: true,
  });
}

const approvalRow = {
  id: 'approval-1',
  status: 'submitted',
  entityType: 'expense_entry',
  actionType: 'approve',
  branchId: 'branch-1',
  requestedBy: 'requester-1',
  requestedAt: '2026-06-01T08:00:00.000Z',
  reason: 'High value expense',
  metaJson: {
    governance: {
      policySteps: [{ stepOrder: 1, dueHours: 1, status: 'pending' }],
    },
  },
};

const policyRow = {
  id: 'policy-1',
  companyId: 'company-1',
  branchId: null,
  entityType: 'expense_entry',
  actionType: 'approve',
  thresholdAmount: 1000,
  thresholdPct: null,
  isEnabled: true,
  approvalStepsJson: [{ stepOrder: 1, requiredPermission: 'expenses:write', dueHours: 4 }],
};

const notificationDelivery = {
  id: 'delivery-1',
  isRead: false,
  notification: {
    id: 'notification-1',
    title: 'Shift needs approval',
    body: 'A shift variance exceeded threshold.',
    type: 'governance',
    severity: 'warning',
    actionUrl: '/governance/approvals',
  },
};

const auditRow = {
  id: 'audit-1',
  entity: 'sales_transactions',
  entityId: 'sale-123456789',
  action: 'update',
  actorUserId: 'actor-123456789',
  ip: '127.0.0.1',
  createdAt: '2026-06-03T08:00:00.000Z',
  beforeJson: { status: 'draft' },
  afterJson: { status: 'posted' },
};

const userRow = {
  id: 'managed-user',
  name: 'Managed User',
  email: 'managed@ifms.test',
  isActive: true,
  createdAt: '2026-06-01T08:00:00.000Z',
  roles: ['cashier'],
};

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  useAppStore.setState({ toasts: [] });
  setUser(['setup:write', 'shifts:approve']);

  governance.listApprovals.mockResolvedValue([approvalRow] as never);
  governance.getApproval.mockResolvedValue({
    ...approvalRow,
    steps: [
      {
        id: 'step-1',
        stepOrder: 1,
        status: 'pending',
        requiredPermission: 'shifts:approve',
        requiredRole: null,
        dueAt: '2026-06-01T09:00:00.000Z',
        isOverdue: true,
      },
    ],
  } as never);
  governance.approve.mockResolvedValue({ ok: true } as never);
  governance.reject.mockResolvedValue({ ok: true } as never);
  governance.submit.mockResolvedValue({ ok: true } as never);
  governance.listPolicies.mockResolvedValue([policyRow] as never);
  governance.createPolicy.mockResolvedValue({ id: 'policy-new' } as never);
  governance.updatePolicy.mockResolvedValue({ id: 'policy-1' } as never);

  companiesList.mockResolvedValue([{ id: 'company-1', name: 'IFMS Co', code: 'IFMS', status: 'active' }]);
  branchesList.mockResolvedValue([{ id: 'branch-1', name: 'Central Branch', stationId: 'station-1' }]);

  notificationMocks.updatePreferences.mockResolvedValue(undefined);
  notificationMocks.useNotificationPreferences.mockReturnValue({
    preferences: {
      channels: { inapp: true, email: false, sms: false, push: false },
      severityMin: 'info',
      quietHours: null,
      digestMode: 'none',
    },
    isLoading: false,
    updatePreferences: notificationMocks.updatePreferences,
    isUpdating: false,
  });
  notificationMocks.useNotifications.mockReturnValue({
    data: { deliveries: [notificationDelivery], total: 1 },
    isLoading: false,
    refetch: notificationMocks.refetchNotifications,
  });
  notificationMocks.useUnreadCount.mockReturnValue({ data: 1 });
  notificationMocks.useOptimisticMarkRead.mockReturnValue({ markReadOptimistic: notificationMocks.markRead });
  notificationMocks.useOptimisticArchive.mockReturnValue({ archiveOptimistic: notificationMocks.archive });

  auditLogs.mockResolvedValue({ data: [auditRow], total: 30 } as never);

  fetchApi.mockImplementation((path: string, options?: { method?: string }) => {
    if (path === 'auth/users') return Promise.resolve([userRow]);
    if (path === 'auth/roles') {
      return Promise.resolve([
        { code: 'manager', name: 'Manager', description: 'Manager role' },
        { code: 'cashier', name: 'Cashier', description: 'Cashier role' },
      ]);
    }
    return Promise.resolve({ path, method: options?.method ?? 'GET' });
  });
});

afterEach(cleanup);

describe('GovernanceApprovalsPage', () => {
  test('filters approvals, opens detail drawer, and posts approve/reject decisions', async () => {
    renderPage(<GovernanceApprovalsPage />);

    expect(await screen.findByText('Governance Approvals')).toBeInTheDocument();
    expect(screen.getByText('expense_entry')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Filter rows'), { target: { value: 'expense' } });
    expect(screen.getByText('Rows 1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open approval-1' }));
    expect(await screen.findByRole('dialog', { name: 'Approval Request' })).toBeInTheDocument();
    expect(screen.getByText(/Step 1 pending/i)).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/Optional reason/i), {
      target: { value: 'Reviewed by supervisor' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));

    await waitFor(() => expect(governance.approve).toHaveBeenCalledWith('approval-1', 'Reviewed by supervisor'));
    expect(governance.reject).toHaveBeenCalledWith('approval-1', 'Reviewed by supervisor');
  });
});

describe('GovernancePoliciesPage', () => {
  test('blocks policy management without setup write permission', () => {
    setUser([]);
    renderPage(<GovernancePoliciesPage />);

    expect(screen.getByText(/Setup write permission required/i)).toBeInTheDocument();
    expect(governance.listPolicies).not.toHaveBeenCalled();
  });

  test('renders policy table and opens create/edit drawers', async () => {
    renderPage(<GovernancePoliciesPage />);

    expect(await screen.findByText('Policies')).toBeInTheDocument();
    expect(screen.getByText('expense_entry')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /New Policy/i }));
    expect(await screen.findByRole('dialog', { name: 'Create Policy' })).toBeInTheDocument();
    expect(await screen.findByText('Create Governance Policy')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add Step' }));

    fireEvent.click(screen.getByRole('button', { name: 'Close drawer' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Create Policy' })).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Open policy-1' }));
    expect(await screen.findByRole('dialog', { name: 'Edit Policy' })).toBeInTheDocument();
    expect(screen.getByText('Edit Governance Policy')).toBeInTheDocument();
  });

  test('renders policy loading, disabled rows, and search-empty branches', async () => {
    governance.listPolicies.mockReturnValueOnce(new Promise(() => {}) as never);
    renderPage(<GovernancePoliciesPage />);

    expect(await screen.findByText('Policies')).toBeInTheDocument();
    expect(screen.getByText('Table loading')).toBeInTheDocument();
    cleanup();

    governance.listPolicies.mockResolvedValueOnce([
      {
        ...policyRow,
        id: 'policy-disabled',
        branchId: 'branch-1',
        thresholdAmount: null,
        thresholdPct: 0,
        isEnabled: false,
        approvalStepsJson: undefined,
      },
    ] as never);

    renderPage(<GovernancePoliciesPage />);

    expect(await screen.findByText('Disabled')).toBeInTheDocument();
    expect(screen.getByText('branch-1')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Filter rows'), { target: { value: 'missing' } });
    expect(screen.getByText('Rows 0')).toBeInTheDocument();
  });

  test('creates and updates policies through the drawer form', async () => {
    renderPage(<GovernancePoliciesPage />);

    expect(await screen.findByText('Policies')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /New Policy/i }));
    expect(await screen.findByRole('dialog', { name: 'Create Policy' })).toBeInTheDocument();
    expect(await screen.findByRole('option', { name: 'IFMS Co' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Company'), { target: { value: 'company-1' } });
    fireEvent.change(screen.getByLabelText('Entity Type'), { target: { value: 'supplier_invoice' } });
    fireEvent.change(screen.getByLabelText('Action Type'), { target: { value: 'approve' } });
    fireEvent.change(screen.getByLabelText('Required Permission'), { target: { value: 'setup:write' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Step' }));
    expect(screen.getAllByRole('button', { name: 'Remove Step' })).toHaveLength(2);
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove Step' })[1]);

    fireEvent.click(screen.getAllByRole('button', { name: 'Create Policy' }).at(-1)!);
    await waitFor(() =>
      expect(governance.createPolicy).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId: 'company-1',
          entityType: 'supplier_invoice',
          actionType: 'approve',
          branchId: undefined,
          thresholdAmount: undefined,
          thresholdPct: undefined,
          approvalSteps: [expect.objectContaining({ requiredPermission: 'setup:write' })],
        }),
      ),
    );
    expect(useAppStore.getState().toasts.at(-1)?.message).toBe('Policy created');

    fireEvent.click(screen.getByRole('button', { name: 'Open policy-1' }));
    expect(await screen.findByRole('dialog', { name: 'Edit Policy' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save Policy' }));

    await waitFor(() =>
      expect(governance.updatePolicy).toHaveBeenCalledWith(
        'policy-1',
        expect.objectContaining({
          companyId: 'company-1',
          entityType: 'expense_entry',
          actionType: 'approve',
          isEnabled: true,
        }),
      ),
    );
    expect(useAppStore.getState().toasts.at(-1)?.message).toBe('Policy updated');
  });
});

describe('NotificationSettingsPage', () => {
  test('renders loading placeholder', () => {
    notificationMocks.useNotificationPreferences.mockReturnValueOnce({
      preferences: null,
      isLoading: true,
      updatePreferences: notificationMocks.updatePreferences,
      isUpdating: false,
    });

    renderPage(<NotificationSettingsPage />);

    expect(screen.getByText('Notification Settings')).toBeInTheDocument();
    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  test('updates local preferences and saves them through the hook', async () => {
    renderPage(<NotificationSettingsPage />);

    fireEvent.click(screen.getByLabelText('Enable quiet hours'));
    fireEvent.change(screen.getByDisplayValue('22:00'), { target: { value: '21:00' } });
    fireEvent.click(screen.getByRole('radio', { name: /Warning/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Preferences' }));

    await waitFor(() =>
      expect(notificationMocks.updatePreferences).toHaveBeenCalledWith(
        expect.objectContaining({
          severityMin: 'warning',
          quietHours: expect.objectContaining({ enabled: true, start: '21:00' }),
        }),
      ),
    );
    expect(useAppStore.getState().toasts.at(-1)?.message).toBe('Notification preferences saved.');
  });

  test('loads existing quiet hours, saves changed timezone fields, and reports save failures', async () => {
    notificationMocks.useNotificationPreferences.mockReturnValue({
      preferences: {
        channels: { inapp: false, email: true, sms: true, push: true },
        severityMin: 'critical',
        quietHours: { enabled: true, start: '20:00', end: '06:00', timezone: 'UTC' },
        digestMode: 'daily',
      },
      isLoading: false,
      updatePreferences: notificationMocks.updatePreferences,
      isUpdating: false,
    });
    notificationMocks.updatePreferences.mockRejectedValueOnce(new Error('Preference API offline'));

    renderPage(<NotificationSettingsPage />);

    const criticalRadio = screen
      .getAllByRole('radio')
      .find((radio) => (radio as HTMLInputElement).value === 'critical') as HTMLInputElement;
    expect(criticalRadio).toBeChecked();
    expect(screen.getAllByRole('checkbox')[0]).not.toBeChecked();
    fireEvent.change(screen.getByDisplayValue('06:00'), { target: { value: '07:00' } });
    fireEvent.change(screen.getByDisplayValue('UTC'), { target: { value: 'America/New_York' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Preferences' }));

    await waitFor(() =>
      expect(notificationMocks.updatePreferences).toHaveBeenCalledWith(
        expect.objectContaining({
          severityMin: 'critical',
          quietHours: expect.objectContaining({ enabled: true, end: '07:00', timezone: 'America/New_York' }),
        }),
      ),
    );
    expect(useAppStore.getState().toasts.at(-1)).toMatchObject({
      message: 'Failed to save notification preferences. Please try again.',
      type: 'error',
    });
  });

  test('disables the save button while notification preferences are updating', () => {
    notificationMocks.useNotificationPreferences.mockReturnValue({
      preferences: {
        channels: { inapp: true, email: false, sms: false, push: false },
        severityMin: 'info',
        quietHours: null,
        digestMode: 'none',
      },
      isLoading: false,
      updatePreferences: notificationMocks.updatePreferences,
      isUpdating: true,
    });

    renderPage(<NotificationSettingsPage />);

    expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled();
  });
});

describe('NotificationsPage', () => {
  test('filters notifications, runs individual and bulk actions, and navigates action links', async () => {
    renderPage(<NotificationsPage />);

    expect(await screen.findByText('Notifications')).toBeInTheDocument();
    expect(screen.getByText('Shift needs approval')).toBeInTheDocument();
    expect(notificationMocks.useNotifications).toHaveBeenCalledWith(
      expect.objectContaining({ unread: true, page: 1, pageSize: 25 }),
    );

    fireEvent.change(screen.getByPlaceholderText('Search notifications...'), {
      target: { value: 'shift' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Mark delivery-1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Archive delivery-1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open action delivery-1' }));

    expect(notificationMocks.markRead).toHaveBeenCalledWith('delivery-1');
    expect(notificationMocks.archive).toHaveBeenCalledWith('delivery-1');
    expect(notificationMocks.navigate).toHaveBeenCalledWith('/governance/approvals');

    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Mark Read' }));
    expect(notificationMocks.markRead).toHaveBeenCalledWith('delivery-1');

    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    expect(notificationMocks.archive).toHaveBeenCalledWith('delivery-1');

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(notificationMocks.refetchNotifications).toHaveBeenCalledTimes(1);
  });
});

describe('AuditLogPage', () => {
  test('renders loading state before audit logs resolve', () => {
    auditLogs.mockReturnValueOnce(new Promise(() => {}) as never);

    renderPage(<AuditLogPage />);

    expect(screen.getByText('Audit Log')).toBeInTheDocument();
    expect(screen.getByText('Table loading')).toBeInTheDocument();
  });

  test('filters audit logs, opens details, and changes pagination/filter params', async () => {
    renderPage(<AuditLogPage />);

    expect(await screen.findByText('Audit Log')).toBeInTheDocument();
    expect(screen.getAllByText('sales_transactions').length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText('Filter rows'), { target: { value: 'sales' } });
    expect(screen.getByText('Rows 1')).toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue('All Entities'), { target: { value: 'users' } });
    fireEvent.change(screen.getByDisplayValue('All Actions'), { target: { value: 'delete' } });
    await waitFor(() =>
      expect(auditLogs).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'users', action: 'delete' }),
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open audit-1' }));
    expect(await screen.findByRole('dialog', { name: 'Audit Detail' })).toBeInTheDocument();
    expect(screen.getByText((text) => text.includes('"status": "draft"'))).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(screen.getByText(/Page 2 of 2/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    await waitFor(() => expect(screen.getByText(/Page 1 of 2/i)).toBeInTheDocument());
  });

  test('renders audit action and missing optional-field fallbacks', async () => {
    auditLogs.mockResolvedValueOnce({
      data: [
        {
          ...auditRow,
          id: 'audit-create',
          action: 'create',
          actorUserId: null,
          ip: null,
          beforeJson: null,
          afterJson: null,
        },
        {
          ...auditRow,
          id: 'audit-delete',
          action: 'delete',
        },
        {
          ...auditRow,
          id: 'audit-login',
          action: 'login',
          actorUserId: undefined,
          ip: undefined,
          beforeJson: undefined,
          afterJson: undefined,
        },
      ],
      total: 3,
    } as never);

    renderPage(<AuditLogPage />);

    expect(await screen.findByText('Audit Log')).toBeInTheDocument();
    expect(screen.getAllByText('create').length).toBeGreaterThan(0);
    expect(screen.getAllByText('delete').length).toBeGreaterThan(0);
    expect(screen.getAllByText('login').length).toBeGreaterThan(0);
    expect(screen.queryByText(/Page 1 of/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open audit-login' }));
    expect(await screen.findByRole('dialog', { name: 'Audit Detail' })).toBeInTheDocument();
    expect(screen.getAllByText('system').length).toBeGreaterThan(0);
    expect(screen.getAllByText('-').length).toBeGreaterThan(0);
    expect(screen.queryByText('Before')).not.toBeInTheDocument();
    expect(screen.queryByText('After')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close drawer' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Audit Detail' })).not.toBeInTheDocument(),
    );
  });
});

describe('UsersRolesPage', () => {
  test('manages user status, roles, search, and creation drawer', async () => {
    renderPage(<UsersRolesPage />);

    expect(await screen.findByText('Users & Roles')).toBeInTheDocument();
    expect(await screen.findByText('Managed User')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Filter rows'), { target: { value: 'managed' } });
    expect(screen.getByText('Rows 1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open managed-user' }));
    expect(await screen.findByRole('dialog', { name: 'User Detail' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Disable User/i }));
    await waitFor(() =>
      expect(fetchApi).toHaveBeenCalledWith('auth/users/managed-user/status', {
        method: 'PATCH',
        body: { isActive: false },
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: /Remove/i }));
    await waitFor(() =>
      expect(fetchApi).toHaveBeenCalledWith('auth/users/managed-user/roles/cashier', { method: 'DELETE' }),
    );

    fireEvent.change(screen.getByDisplayValue('Select role...'), { target: { value: 'manager' } });
    fireEvent.click(screen.getByRole('button', { name: 'Assign' }));
    await waitFor(() =>
      expect(fetchApi).toHaveBeenCalledWith('auth/users/managed-user/roles', {
        method: 'POST',
        body: { roleCode: 'manager' },
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: /Close drawer/i }));
    fireEvent.click(screen.getByRole('button', { name: /Create User/i }));
    expect(await screen.findByRole('dialog', { name: 'Create User' })).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Jane Doe'), { target: { value: 'New User' } });
    fireEvent.change(screen.getByPlaceholderText('jane@company.com'), {
      target: { value: 'new@ifms.test' },
    });
    fireEvent.change(screen.getByPlaceholderText('Min 8 characters'), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Create User' }).at(-1)!);

    await waitFor(() =>
      expect(fetchApi).toHaveBeenCalledWith('auth/users', {
        method: 'POST',
        body: { name: 'New User', email: 'new@ifms.test', password: 'password123' },
      }),
    );
  });
});
