import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Sidebar from './Sidebar';
import { useAppStore, useAuthStore } from '../store';
import type { User } from '../types';

afterEach(cleanup);

const fullPermissions = [
  'reports:read',
  'shifts:open',
  'shifts:close',
  'shifts:read',
  'sales:pos',
  'sales:read',
  'inventory:read',
  'deliveries:write',
  'deliveries:read',
  'transfers:read',
  'adjustments:read',
  'credit:read',
  'payables:read',
  'expenses:read',
  'setup:read',
  'setup:write',
  'audit:read',
];

function setUser(permissions: string[]) {
  useAuthStore.setState({
    user: {
      id: 'user-1',
      name: 'Finance Lead',
      email: 'lead@itemba.test',
      role: 'manager',
      permissions,
    } satisfies User,
    isAuthenticated: true,
    isAuthReady: true,
  });
}

function renderSidebar(path = '/app/dashboard') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Sidebar />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({ sidebarCollapsed: false });
  setUser(fullPermissions);
});

describe('Sidebar', () => {
  test('renders grouped navigation, expands children, and collapses the workspace', () => {
    renderSidebar('/app/reports/overview');

    expect(screen.getByRole('link', { name: 'Go to Dashboard' })).toBeInTheDocument();
    expect(screen.getByText('IFMS ENTERPRISE')).toBeInTheDocument();
    expect(screen.getByText('Reports')).toBeInTheDocument();
    expect(screen.getByText('Operations')).toBeInTheDocument();
    expect(screen.getByText('Finance')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /core reports/i }));

    expect(screen.getByRole('link', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Station Comparison' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Collapse Sidebar' }));

    expect(useAppStore.getState().sidebarCollapsed).toBe(true);
    expect(screen.getByRole('button', { name: 'Expand Sidebar' })).toBeInTheDocument();
    expect(screen.queryByText('IFMS ENTERPRISE')).not.toBeInTheDocument();
  });

  test('filters parent and child links by the current user permissions', () => {
    setUser(['sales:pos']);
    renderSidebar('/app/sales/pos');

    expect(screen.getByText('General')).toBeInTheDocument();
    expect(screen.getByText('Operations')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sales' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Core Reports' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Sales' }));

    expect(screen.getByRole('link', { name: 'POS Terminal' })).toBeInTheDocument();
    expect(screen.queryByText('Receipts')).not.toBeInTheDocument();
    expect(screen.queryByText('Transactions')).not.toBeInTheDocument();
  });

  test('keeps labels and child drawers hidden while collapsed', () => {
    useAppStore.setState({ sidebarCollapsed: true });
    renderSidebar('/app/sales/pos');

    expect(screen.getByRole('button', { name: 'Expand Sidebar' })).toBeInTheDocument();
    expect(screen.queryByText('IFMS ENTERPRISE')).not.toBeInTheDocument();
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
    expect(screen.queryByText('POS Terminal')).not.toBeInTheDocument();
  });
});
