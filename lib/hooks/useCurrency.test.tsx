import { describe, test, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useCurrency } from './useCurrency';
import { useReportsStore } from '../../store';

vi.mock('../api/setup', () => ({
  apiSetup: {
    stations: { list: vi.fn() },
    companies: { list: vi.fn() },
  },
}));

import { apiSetup } from '../api/setup';
const stationsList = vi.mocked(apiSetup.stations.list);
const companiesList = vi.mocked(apiSetup.companies.list);

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  act(() => {
    useReportsStore.getState().setFilters({ stationId: null });
  });
});

describe('useCurrency', () => {
  test('falls back to TZS before any company data loads', () => {
    stationsList.mockReturnValue(new Promise(() => {}));
    companiesList.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useCurrency(), { wrapper: makeWrapper() });

    expect(result.current.currency).toBe('TZS');
    expect(result.current.symbol).toBe('TSh');
  });

  test('uses the first company currency when no station is active', async () => {
    stationsList.mockResolvedValue([]);
    companiesList.mockResolvedValue([
      { id: 'c1', name: 'Co', code: 'CO', currency: 'USD', status: 'active' },
    ]);

    const { result } = renderHook(() => useCurrency(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.currency).toBe('USD'));
    expect(result.current.symbol).toBe('$');
  });

  test("resolves currency from the active station's company", async () => {
    stationsList.mockResolvedValue([
      { id: 's1', name: 'S1', companyId: 'c2', location: 'Loc', manager: 'Mgr' },
    ]);
    companiesList.mockResolvedValue([
      { id: 'c1', name: 'One', code: 'ONE', currency: 'USD', status: 'active' },
      { id: 'c2', name: 'Two', code: 'TWO', currency: 'ZAR', status: 'active' },
    ]);
    act(() => useReportsStore.getState().setFilters({ stationId: 's1' }));

    const { result } = renderHook(() => useCurrency(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.currency).toBe('ZAR'));
    expect(result.current.symbol).toBe('R');
  });

  test('formatting helpers are bound to the resolved currency', async () => {
    stationsList.mockResolvedValue([]);
    companiesList.mockResolvedValue([
      { id: 'c1', name: 'Co', code: 'CO', currency: 'USD', status: 'active' },
    ]);

    const { result } = renderHook(() => useCurrency(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.currency).toBe('USD'));

    // Exact grouping/locale formatting comes from lib/currency; assert the
    // currency-specific markers rather than the whole string.
    expect(result.current.fmt(1234.5)).toContain('1,234');
    expect(result.current.fmt(1234.5)).toContain('$');
    expect(result.current.fmtCompact(50000)).toContain('$');
    expect(result.current.header('Amount')).toBe('Amount ($)');
  });
});
