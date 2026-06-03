import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type * as React from 'react';
import App from './App';
import { useAppStore, useAuthStore, useReportsStore } from './store';
import type { User } from './types';

const appMocks = vi.hoisted(() => ({
  hydrateAuth: vi.fn(),
  logout: vi.fn(),
  addToast: vi.fn(),
  resetRepositoryCaches: vi.fn(),
  submitLogin: vi.fn(),
  submitForgotPassword: vi.fn(),
  submitResetPassword: vi.fn(),
  submitSignup: vi.fn(),
  resetLoginError: vi.fn(),
  resetSignupError: vi.fn(),
  setupDelete: vi.fn(),
  loginState: { isSubmitting: false, errorMessage: '' },
  forgotState: { isSubmitting: false, successMessage: '', errorMessage: '' },
  resetState: { isSubmitting: false, successMessage: '', errorMessage: '' },
  signupState: {
    isSubmitting: false,
    errorMessage: '',
    inviteOnlyMode: false,
    inviteOnlyMessage: 'Accounts are created by administrators',
  },
}));

afterEach(cleanup);

vi.mock('./components/Layout', async () => {
  const React = await import('react');
  const { Outlet } = await import('react-router-dom');
  return {
    default: () =>
      React.createElement(
        'div',
        { 'data-testid': 'layout-shell' },
        React.createElement('span', null, 'Layout shell'),
        React.createElement(Outlet),
      ),
  };
});
vi.mock('./components/Dashboard', () => ({ default: () => 'Dashboard route' }));
vi.mock('./components/ModulePlaceholder', () => ({ default: () => 'Module placeholder route' }));
vi.mock('./components/pages/GenericTablePage', async () => {
  const React = await import('react');
  return {
    GenericTablePage: ({
      title,
      FormComponent,
      onDeleteRow,
      onRowClick,
    }: {
      title: string;
      FormComponent?: React.ComponentType<{
        initialData?: { id: string };
        onSuccess?: () => void;
        onCancel?: () => void;
      }>;
      onDeleteRow?: (row: { id: string }) => void;
      onRowClick?: (row: { id: string }) => void;
    }) =>
      React.createElement(
        'section',
        { 'data-testid': `table-${title}` },
        React.createElement('span', null, title),
        FormComponent
          ? React.createElement(FormComponent, {
              initialData: { id: 'row-1' },
              onSuccess: vi.fn(),
              onCancel: vi.fn(),
            })
          : null,
        onDeleteRow
          ? React.createElement(
              'button',
              { type: 'button', onClick: () => onDeleteRow({ id: 'row-1' }) },
              `Delete ${title}`,
            )
          : null,
        onRowClick
          ? React.createElement(
              'button',
              { type: 'button', onClick: () => onRowClick({ id: 'row-1' }) },
              `Open ${title}`,
            )
          : null,
      ),
  };
});
vi.mock('./components/forms/TankForm', () => ({ TankForm: () => 'Tank form route' }));
vi.mock('./components/forms/ExpenseEntryForm', () => ({
  ExpenseEntryForm: () => 'Expense entry form route',
}));
vi.mock('./components/forms/PettyCashForm', () => ({
  PettyCashForm: () => 'Petty cash form route',
}));
vi.mock('./components/forms/CustomerManagement', () => ({
  CustomerManagement: () => 'Customer management route',
}));
vi.mock('./components/forms/CustomerForm', () => ({
  CustomerForm: () => 'Customer form route',
}));
vi.mock('./components/forms/CloseShiftForm', () => ({
  CloseShiftForm: () => 'Close shift form route',
}));
vi.mock('./components/forms/OpenShiftForm', () => ({
  OpenShiftForm: () => 'Open shift form route',
}));
vi.mock('./components/forms/NozzleSetupForm', () => ({
  NozzleSetupForm: () => 'Nozzle setup form route',
}));
vi.mock('./components/forms/CreateDeliveryForm', () => ({
  CreateDeliveryForm: () => 'Create delivery form route',
}));
vi.mock('./components/forms/CreditInvoiceForm', () => ({
  CreditInvoiceForm: () => 'Credit invoice form route',
}));
vi.mock('./components/forms/RecordPaymentForm', () => ({
  RecordPaymentForm: () => 'Record payment form route',
}));
vi.mock('./components/forms/GeneralSetupForm', () => ({
  GeneralSetupForm: () => 'General setup form route',
}));
vi.mock('./components/forms/ProductForm', () => ({
  ProductForm: () => 'Product form route',
}));
vi.mock('./components/expenses/ExpenseSummaryDrawer', () => ({
  ExpenseSummaryDrawer: () => 'Expense summary drawer',
}));
vi.mock('./components/pos/POSPage', () => ({ default: () => 'POS route' }));
vi.mock('./components/pages/ReportsOverview', () => ({ default: () => 'Reports overview route' }));
vi.mock('./components/pages/DailyOperationsReport', () => ({
  default: () => 'Daily operations route',
}));
vi.mock('./components/pages/StockLossReport', () => ({ default: () => 'Stock loss route' }));
vi.mock('./components/pages/ProfitabilityReport', () => ({
  default: () => 'Profitability route',
}));
vi.mock('./components/pages/CreditCashflowReport', () => ({
  default: () => 'Credit cashflow route',
}));
vi.mock('./components/pages/StationComparisonReport', () => ({
  default: () => 'Station comparison route',
}));
vi.mock('./components/pages/ExportsPage', () => ({ default: () => 'Exports route' }));
vi.mock('./components/pages/GovernanceApprovalsPage', () => ({
  default: () => 'Governance approvals route',
}));
vi.mock('./components/pages/GovernancePoliciesPage', () => ({
  default: () => 'Governance policies route',
}));
vi.mock('./components/pages/NotificationsPage', () => ({ default: () => 'Notifications route' }));
vi.mock('./components/pages/NotificationSettingsPage', () => ({
  default: () => 'Notification settings route',
}));
vi.mock('./components/pages/AuditLogPage', () => ({ default: () => 'Audit log route' }));
vi.mock('./components/pages/UsersRolesPage', () => ({ default: () => 'Users roles route' }));
vi.mock('./components/pages/DipsPage', () => ({ default: () => 'Dips route' }));
vi.mock('./components/pages/ReconciliationsPage', () => ({
  default: () => 'Reconciliations route',
}));
vi.mock('./components/pages/VariancesPage', () => ({ default: () => 'Variances route' }));
vi.mock('./components/pages/TankToTankTransfersPage', () => ({
  default: () => 'Tank transfers route',
}));
vi.mock('./components/pages/StationToStationTransfersPage', () => ({
  default: () => 'Station transfers route',
}));
vi.mock('./components/pages/AdjustmentsPage', () => ({ default: () => 'Adjustments route' }));
vi.mock('./components/pages/SuppliersPage', () => ({ default: () => 'Suppliers route' }));
vi.mock('./components/pages/SupplierInvoicesPage', () => ({
  default: () => 'Supplier invoices route',
}));
vi.mock('./components/pages/PayablesAgingPage', () => ({
  default: () => 'Payables aging route',
}));
vi.mock('./components/pages/SalesTransactionsPage', () => ({
  default: () => 'Sales transactions route',
}));
vi.mock('./components/pages/CreditAgingPage', () => ({ default: () => 'Credit aging route' }));
vi.mock('./components/pages/ExpenseCategoriesPage', () => ({
  default: () => 'Expense categories route',
}));
vi.mock('./components/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('./components/ifms/CommandMenu', () => ({ CommandMenu: () => 'Command menu' }));
vi.mock('./components/ifms/Toast', () => ({ ToastContainer: () => 'Toast container' }));
vi.mock('./components/ifms/DetailsDrawer', () => ({ default: () => 'Details drawer' }));
vi.mock('./lib/env.client', () => ({ frontendEnv: { demoMode: false } }));
vi.mock('./lib/repositories', () => {
  const list = vi.fn().mockResolvedValue([]);
  return {
    shiftRepo: { list },
    saleRepo: { list },
    deliveryRepo: { list },
    customerRepo: { list },
    expenseRepo: { list },
    invoiceRepo: { list },
    paymentRepo: { list },
    pettyCashRepo: { list },
    resetRepositoryCaches: appMocks.resetRepositoryCaches,
  };
});
vi.mock('./lib/data-source', () => {
  const source = {
    list: vi.fn().mockResolvedValue([]),
    delete: appMocks.setupDelete,
  };
  return {
    setupDataSource: {
      companies: source,
      stations: source,
      branches: source,
      products: source,
      tanks: source,
      nozzles: source,
    },
  };
});
vi.mock('./hooks/auth/useLogin', () => ({
  useLogin: () => ({
    submitLogin: appMocks.submitLogin,
    isSubmitting: appMocks.loginState.isSubmitting,
    errorMessage: appMocks.loginState.errorMessage,
    resetError: appMocks.resetLoginError,
  }),
}));
vi.mock('./hooks/auth/useForgotPassword', () => ({
  useForgotPassword: () => ({
    submitForgotPassword: appMocks.submitForgotPassword,
    isSubmitting: appMocks.forgotState.isSubmitting,
    successMessage: appMocks.forgotState.successMessage,
    errorMessage: appMocks.forgotState.errorMessage,
  }),
}));
vi.mock('./hooks/auth/useResetPassword', () => ({
  useResetPassword: () => ({
    submitResetPassword: appMocks.submitResetPassword,
    isSubmitting: appMocks.resetState.isSubmitting,
    successMessage: appMocks.resetState.successMessage,
    errorMessage: appMocks.resetState.errorMessage,
  }),
}));
vi.mock('./hooks/auth/useSignup', () => ({
  useSignup: () => ({
    submitSignup: appMocks.submitSignup,
    isSubmitting: appMocks.signupState.isSubmitting,
    errorMessage: appMocks.signupState.errorMessage,
    inviteOnlyMode: appMocks.signupState.inviteOnlyMode,
    inviteOnlyMessage: appMocks.signupState.inviteOnlyMessage,
    resetError: appMocks.resetSignupError,
  }),
}));

const managerUser: User = {
  id: 'manager-1',
  name: 'Mina Manager',
  email: 'mina@itemba.test',
  role: 'manager',
  permissions: [
    'reports:read',
    'setup:read',
    'sales:pos',
    'sales:read',
    'credit:read',
    'expenses:read',
  ],
};

const adminUser: User = {
  ...managerUser,
  id: 'admin-1',
  email: 'admin@itemba.test',
  permissions: [
    'setup:read',
    'setup:write',
    'reports:read',
    'reports:refresh',
    'sales:pos',
    'sales:read',
    'sales:void',
    'credit:read',
    'credit:write',
    'expenses:read',
    'expenses:write',
    'shifts:open',
    'shifts:close',
    'shifts:read',
    'shifts:approve',
    'inventory:read',
    'inventory:write',
    'deliveries:read',
    'deliveries:write',
    'transfers:read',
    'transfers:write',
    'adjustments:read',
    'adjustments:write',
    'payables:read',
    'payables:write',
    'audit:read',
  ],
};

function setAuthState({
  authenticated,
  ready = true,
  user = authenticated ? managerUser : null,
}: {
  authenticated: boolean;
  ready?: boolean;
  user?: User | null;
}) {
  useAuthStore.setState({
    user,
    isAuthenticated: authenticated,
    isAuthReady: ready,
    hydrateAuth: appMocks.hydrateAuth,
    logout: appMocks.logout,
  });
}

function renderAt(hash: string) {
  window.location.hash = hash;
  return render(<App />);
}

beforeEach(() => {
  vi.clearAllMocks();
  appMocks.loginState.isSubmitting = false;
  appMocks.loginState.errorMessage = '';
  appMocks.forgotState.isSubmitting = false;
  appMocks.forgotState.successMessage = '';
  appMocks.forgotState.errorMessage = '';
  appMocks.resetState.isSubmitting = false;
  appMocks.resetState.successMessage = '';
  appMocks.resetState.errorMessage = '';
  appMocks.signupState.isSubmitting = false;
  appMocks.signupState.errorMessage = '';
  appMocks.signupState.inviteOnlyMode = false;
  appMocks.submitLogin.mockResolvedValue(undefined);
  appMocks.submitForgotPassword.mockResolvedValue(undefined);
  appMocks.submitResetPassword.mockResolvedValue(undefined);
  appMocks.submitSignup.mockResolvedValue(undefined);
  appMocks.setupDelete.mockResolvedValue(undefined);
  document.documentElement.classList.remove('dark');
  useAppStore.setState({
    theme: 'light',
    sidebarCollapsed: false,
    isSearchOpen: false,
    isAiPanelOpen: false,
    toasts: [],
    addToast: appMocks.addToast,
  });
  useReportsStore.getState().setFilters({ stationId: 'station-1', productId: 'product-1' });
  setAuthState({ authenticated: false });
  window.location.hash = '';
});

describe('App auth routes', () => {
  test('shows the auth loader on public routes until auth readiness is known', () => {
    setAuthState({ authenticated: false, ready: false });
    renderAt('#/login');

    expect(screen.getByText('Preparing secure session...')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Sign in' })).not.toBeInTheDocument();
  });

  test('renders login, validates input, and submits the next route to the login hook', async () => {
    renderAt('#/login?next=/app/sales/pos');

    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('Login | IFMS Suite'));

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter a valid corporate email address.')).toBeInTheDocument();
    expect(screen.getByText('Password is required.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'mina@itemba.test' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'Sup3rSecret!' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() =>
      expect(appMocks.submitLogin).toHaveBeenCalledWith({
        email: 'mina@itemba.test',
        password: 'Sup3rSecret!',
        nextPath: '/app/sales/pos',
      }),
    );
    expect(appMocks.resetLoginError).toHaveBeenCalled();
  });

  test('keeps public auth routes away from authenticated sessions', async () => {
    setAuthState({ authenticated: true });
    renderAt('#/login');

    await waitFor(() => expect(screen.getByText('Dashboard route')).toBeInTheDocument());
    expect(screen.getByTestId('layout-shell')).toHaveTextContent('Layout shell');
  });

  test('redirects protected routes to login with the original path as next', async () => {
    renderAt('#/app/sales/receipts?drawer=1');

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    await waitFor(() =>
      expect(decodeURIComponent(window.location.hash)).toContain(
        '/login?next=/app/sales/receipts?drawer=1',
      ),
    );
  });

  test('shows the secure-session loader until auth readiness is known', () => {
    setAuthState({ authenticated: false, ready: false });
    renderAt('#/app/dashboard');

    expect(screen.getByText('Preparing secure session...')).toBeInTheDocument();
  });

  test('routes the app index based on authentication state', async () => {
    const { unmount } = renderAt('#/');

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();

    unmount();
    setAuthState({ authenticated: true });
    renderAt('#/');

    await waitFor(() => expect(screen.getByText('Dashboard route')).toBeInTheDocument());
  });

  test('renders authenticated app routes across the shell permission map', async () => {
    const routeCases = [
      ['#/app/setup/companies', 'Entities'],
      ['#/app/setup/stations', 'Stations'],
      ['#/app/setup/branches', 'Branches'],
      ['#/app/setup/products', 'Products'],
      ['#/app/setup/tanks', 'Tanks'],
      ['#/app/setup/pumps-nozzles', 'Hardware'],
      ['#/app/setup/users-roles', 'Users roles route'],
      ['#/app/shifts/open', 'Open shift form route'],
      ['#/app/shifts/close', 'Close shift form route'],
      ['#/app/shifts/history', 'Shift Journal'],
      ['#/app/inventory/dips', 'Dips route'],
      ['#/app/inventory/reconciliation', 'Reconciliations route'],
      ['#/app/inventory/variance', 'Variances route'],
      ['#/app/transfers/tank-to-tank', 'Tank transfers route'],
      ['#/app/transfers/station-to-station', 'Station transfers route'],
      ['#/app/transfers/adjustments', 'Adjustments route'],
      ['#/app/sales/pos', 'POS route'],
      ['#/app/sales/receipts', 'Electronic Journal'],
      ['#/app/sales/transactions', 'Sales transactions route'],
      ['#/app/deliveries/create', 'Create delivery form route'],
      ['#/app/deliveries/grn', 'GRN Portal'],
      ['#/app/credit/customers/customer-1', 'Customer management route'],
      ['#/app/credit/customers', 'Accounts'],
      ['#/app/credit/invoices', 'Invoices'],
      ['#/app/credit/statements', 'Receivables'],
      ['#/app/credit/aging', 'Credit aging route'],
      ['#/app/expenses/entries', 'Expense Control Center'],
      ['#/app/expenses/petty-cash', 'Petty Cash'],
      ['#/app/expenses/categories', 'Expense categories route'],
      ['#/app/payables/suppliers', 'Suppliers route'],
      ['#/app/payables/invoices', 'Supplier invoices route'],
      ['#/app/payables/aging', 'Payables aging route'],
      ['#/app/reports/overview', 'Reports overview route'],
      ['#/app/reports/daily-operations', 'Daily operations route'],
      ['#/app/reports/stock-loss', 'Stock loss route'],
      ['#/app/reports/profitability', 'Profitability route'],
      ['#/app/reports/credit-cashflow', 'Credit cashflow route'],
      ['#/app/reports/station-comparison', 'Station comparison route'],
      ['#/app/exports', 'Exports route'],
      ['#/app/governance/approvals', 'Governance approvals route'],
      ['#/app/governance/policies', 'Governance policies route'],
      ['#/app/notifications', 'Notifications route'],
      ['#/app/settings/notifications', 'Notification settings route'],
      ['#/app/audit-log', 'Audit log route'],
    ] as const;

    setAuthState({ authenticated: true, user: adminUser });

    for (const [hash, expectedText] of routeCases) {
      const { unmount } = renderAt(hash);
      await waitFor(() => expect(screen.getByText(expectedText)).toBeInTheDocument());
      unmount();
    }
  });

  test('exercises route table callbacks that navigate or delete setup rows', async () => {
    setAuthState({ authenticated: true, user: adminUser });
    const { unmount } = renderAt('#/app/setup/companies');

    await screen.findByText('Entities');
    fireEvent.click(screen.getByRole('button', { name: 'Delete Entities' }));
    expect(appMocks.setupDelete).toHaveBeenCalledWith('row-1');

    unmount();
    renderAt('#/app/credit/customers');

    await screen.findByText('Accounts');
    fireEvent.click(screen.getByRole('button', { name: 'Open Accounts' }));
    await waitFor(() =>
      expect(screen.getByText('Customer management route')).toBeInTheDocument(),
    );
  });
});

describe('App auth forms', () => {
  test('renders login hook error and submitting states', () => {
    appMocks.loginState.errorMessage = 'Invalid credentials.';
    appMocks.loginState.isSubmitting = true;

    renderAt('#/login');

    expect(screen.getByRole('alert')).toHaveTextContent('Invalid credentials.');
    expect(screen.getByRole('button', { name: /Signing in/ })).toBeDisabled();
  });

  test('submits forgot-password requests and renders hook-provided status messages', async () => {
    const { unmount } = renderAt('#/forgot-password');

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'ops@itemba.test' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));

    await waitFor(() =>
      expect(appMocks.submitForgotPassword).toHaveBeenCalledWith('ops@itemba.test'),
    );

    unmount();
    appMocks.forgotState.successMessage = 'If an account exists, a reset link has been sent.';
    renderAt('#/forgot-password');

    expect(screen.getByRole('alert')).toHaveTextContent('reset link has been sent');
  });

  test('renders forgot-password error and submitting branches', () => {
    appMocks.forgotState.errorMessage = 'Reset email service is unavailable.';
    appMocks.forgotState.isSubmitting = true;

    renderAt('#/forgot-password');

    expect(screen.getByRole('alert')).toHaveTextContent('Reset email service is unavailable.');
    expect(screen.getByRole('button', { name: /Sending link/ })).toBeDisabled();
  });

  test('handles missing and successful reset-password route states', async () => {
    const { unmount } = renderAt('#/reset-password');

    expect(screen.getByRole('heading', { name: 'Invalid reset link' })).toBeInTheDocument();
    expect(screen.getByText(/No reset token found/)).toBeInTheDocument();

    unmount();
    appMocks.resetState.successMessage =
      'Password reset successfully. You can now sign in with your new password.';
    renderAt('#/reset-password?token=reset-token');

    expect(screen.getByRole('status')).toHaveTextContent('Password reset successfully');
    fireEvent.click(screen.getByRole('button', { name: 'Go to sign in' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument());
  });

  test('submits reset-password tokens and renders reset errors or loading copy', async () => {
    appMocks.resetState.errorMessage = 'This reset link has expired.';
    renderAt('#/reset-password?token=reset-token');

    expect(screen.getByRole('alert')).toHaveTextContent('This reset link has expired.');
    fireEvent.change(screen.getByLabelText('New password'), {
      target: { value: 'Sup3rSecret123!' },
    });
    fireEvent.change(screen.getByLabelText('Confirm password'), {
      target: { value: 'Sup3rSecret123!' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reset password' }));

    await waitFor(() =>
      expect(appMocks.submitResetPassword).toHaveBeenCalledWith(
        'reset-token',
        'Sup3rSecret123!',
      ),
    );

    cleanup();
    appMocks.resetState.errorMessage = '';
    appMocks.resetState.isSubmitting = true;
    renderAt('#/reset-password?token=reset-token');

    expect(screen.getByRole('button', { name: /Resetting password/ })).toBeDisabled();
  });

  test('renders signup invite-only state and blocks submission', () => {
    appMocks.signupState.inviteOnlyMode = true;
    renderAt('#/signup');

    expect(screen.getByRole('heading', { name: 'Create account' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Accounts are created by administrators');
    expect(screen.getByRole('button', { name: 'Create an account' })).toBeDisabled();
  });

  test('submits signup values and warns about short-but-valid passwords', async () => {
    renderAt('#/signup');

    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Mina Manager' } });
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'mina@itemba.test' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'Secret123!' },
    });
    fireEvent.change(screen.getByLabelText('Confirm password'), {
      target: { value: 'Secret123!' },
    });

    expect(screen.getByText(/could be stronger/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Create an account' }));

    await waitFor(() =>
      expect(appMocks.submitSignup).toHaveBeenCalledWith({
        name: 'Mina Manager',
        email: 'mina@itemba.test',
        password: 'Secret123!',
      }),
    );
    expect(appMocks.resetSignupError).toHaveBeenCalled();
  });

  test('renders signup hook errors, submitting copy, and the secondary login navigation', async () => {
    appMocks.signupState.errorMessage = 'Email domain is not allowed.';
    renderAt('#/signup');

    expect(screen.getByRole('alert')).toHaveTextContent('Email domain is not allowed.');
    fireEvent.click(screen.getByRole('button', { name: 'Back to sign in' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument());

    cleanup();
    appMocks.signupState.errorMessage = '';
    appMocks.signupState.isSubmitting = true;
    renderAt('#/signup');

    expect(screen.getByRole('button', { name: /Creating account/ })).toBeDisabled();
  });
});

describe('App shell boundaries', () => {
  test('applies theme changes and calls logout on the global auth logout event', () => {
    setAuthState({ authenticated: true });
    renderAt('#/app/dashboard');

    expect(appMocks.hydrateAuth).toHaveBeenCalledTimes(1);

    act(() => useAppStore.setState({ theme: 'dark' }));
    expect(document.documentElement).toHaveClass('dark');

    act(() => useAppStore.setState({ theme: 'light' }));
    expect(document.documentElement).not.toHaveClass('dark');

    window.dispatchEvent(new Event('ifms:auth-logout'));
    expect(appMocks.logout).toHaveBeenCalledTimes(1);
  });

  test('clears scoped app caches when the authenticated user changes', async () => {
    setAuthState({ authenticated: true });
    renderAt('#/app/dashboard');

    act(() =>
      useAuthStore.setState({
        user: { ...managerUser, id: 'manager-2', email: 'second@itemba.test' },
      }),
    );

    await waitFor(() => expect(appMocks.resetRepositoryCaches).toHaveBeenCalledTimes(1));
    expect(useReportsStore.getState().stationId).toBeNull();
    expect(useReportsStore.getState().productId).toBeNull();
  });

  test('redirects unauthorized permission routes back to the app dashboard', async () => {
    setAuthState({
      authenticated: true,
      user: { ...managerUser, permissions: ['reports:read'] },
    });
    renderAt('#/app/setup/users-roles');

    await waitFor(() => expect(screen.getByText('Dashboard route')).toBeInTheDocument());
    expect(screen.queryByText('Users roles route')).not.toBeInTheDocument();
  });

  test('renders the wildcard module placeholder for unknown authenticated app routes', async () => {
    setAuthState({ authenticated: true });
    renderAt('#/app/unknown/module');

    await waitFor(() =>
      expect(screen.getByText('Module placeholder route')).toBeInTheDocument(),
    );
  });
});
