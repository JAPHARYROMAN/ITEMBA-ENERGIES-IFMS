import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ModulePlaceholder from './ModulePlaceholder';
import { useAppStore, useAuthStore } from '../store';
import type { User } from '../types';

const repositoryMocks = vi.hoisted(() => ({
  stationList: vi.fn(),
  customerList: vi.fn(),
  saleList: vi.fn(),
}));

vi.mock('../lib/repositories', () => ({
  stationRepo: { list: repositoryMocks.stationList },
  customerRepo: { list: repositoryMocks.customerList },
  saleRepo: { list: repositoryMocks.saleList },
}));

const addToastMock = vi.fn();

afterEach(cleanup);

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

function Wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={makeClient()}>{children}</QueryClientProvider>;
}

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

function renderPlaceholder(path: string) {
  return render(
    <Wrapper>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/app/sales/pos" element={<div>POS target</div>} />
          <Route path="/app/*" element={<ModulePlaceholder />} />
        </Routes>
      </MemoryRouter>
    </Wrapper>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useAppStore.setState({ addToast: addToastMock });
  setUser(['sales:pos', 'reports:read', 'setup:read']);
  repositoryMocks.stationList.mockResolvedValue([
    { id: 'station-1', name: 'Main Station' },
    { id: 'station-2', name: 'Depot Station' },
  ]);
  repositoryMocks.customerList.mockResolvedValue([{ id: 'customer-1', name: 'ACME' }]);
  repositoryMocks.saleList.mockResolvedValue([
    { id: 'sale-1' },
    { id: 'sale-2' },
    { id: 'sale-3' },
  ]);
});

describe('ModulePlaceholder', () => {
  test('derives module names from the route and shows live repository counts', async () => {
    renderPlaceholder('/app/sales/transactions');

    expect(await screen.findByRole('heading', { name: 'Transactions' })).toBeInTheDocument();
    expect(screen.getByText('SALES > Management and analysis for IFMS transactions.')).toBeInTheDocument();
    expect(screen.getByText('Enterprise Node Connected')).toBeInTheDocument();
    expect(screen.getByText('Active Stations')).toBeInTheDocument();
    expect(screen.getByText('Master Accounts')).toBeInTheDocument();
    expect(screen.getByText('Recent Sales')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  test('launches the mapped action route when the user has target permissions', async () => {
    renderPlaceholder('/app/sales/transactions');

    const action = await screen.findByRole('button', { name: /new transactions/i });
    fireEvent.click(action);

    expect(addToastMock).toHaveBeenCalledWith('Taking you to transactions...', 'info');
    expect(screen.getByText('POS target')).toBeInTheDocument();
  });

  test('hides modification actions and shows audit copy for read-only sessions', async () => {
    setUser(['reports:read']);
    renderPlaceholder('/app/setup/users-roles');

    expect(await screen.findByRole('heading', { name: 'Users roles' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /new users roles/i })).not.toBeInTheDocument();
    expect(
      screen.getByText('Audit constraints applied. Modification tools are disabled.'),
    ).toBeInTheDocument();
  });

  test('renders a loading skeleton while any summary query is pending', () => {
    repositoryMocks.stationList.mockReturnValue(new Promise(() => {}));
    repositoryMocks.customerList.mockResolvedValue([]);
    repositoryMocks.saleList.mockResolvedValue([]);

    const { container } = renderPlaceholder('/app/sales/transactions');

    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
    expect(screen.queryByText('Enterprise Node Connected')).not.toBeInTheDocument();
  });
});
