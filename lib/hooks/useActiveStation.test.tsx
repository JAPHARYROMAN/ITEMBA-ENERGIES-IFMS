import { describe, test, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useActiveStation } from './useActiveStation';
import { useReportsStore } from '../../store';

vi.mock('../api/setup', () => ({
  apiSetup: {
    stations: { list: vi.fn() },
  },
}));

import { apiSetup } from '../api/setup';
const listMock = vi.mocked(apiSetup.stations.list);

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

const STATIONS = [
  { id: 's1', name: 'Alpha', companyId: 'c1' },
  { id: 's2', name: 'Beta', companyId: 'c1' },
];

beforeEach(() => {
  vi.clearAllMocks();
  // Reset persisted selection between tests.
  act(() => {
    useReportsStore.getState().setFilters({ stationId: null });
  });
});

describe('useActiveStation', () => {
  test('defaults to the first station when none is selected', async () => {
    listMock.mockResolvedValue(STATIONS);
    const { result } = renderHook(() => useActiveStation(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.stations).toHaveLength(2));
    expect(result.current.stationId).toBe('s1');
    expect(result.current.station?.name).toBe('Alpha');
  });

  test('honours a selection persisted in the reports store', async () => {
    listMock.mockResolvedValue(STATIONS);
    act(() => {
      useReportsStore.getState().setFilters({ stationId: 's2' });
    });

    const { result } = renderHook(() => useActiveStation(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.stations).toHaveLength(2));

    expect(result.current.stationId).toBe('s2');
    expect(result.current.station?.name).toBe('Beta');
  });

  test('stationId is null while the list is still loading', () => {
    listMock.mockReturnValue(new Promise(() => {})); // never resolves
    const { result } = renderHook(() => useActiveStation(), { wrapper: makeWrapper() });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.stationId).toBeNull();
    expect(result.current.station).toBeNull();
  });

  test('setStationId writes through to the reports store', async () => {
    listMock.mockResolvedValue(STATIONS);
    const { result } = renderHook(() => useActiveStation(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.stations).toHaveLength(2));

    act(() => result.current.setStationId('s2'));

    await waitFor(() => expect(result.current.stationId).toBe('s2'));
    expect(useReportsStore.getState().stationId).toBe('s2');
  });

  test('station resolves to null when the selected id is unknown', async () => {
    listMock.mockResolvedValue(STATIONS);
    act(() => {
      useReportsStore.getState().setFilters({ stationId: 'ghost' });
    });
    const { result } = renderHook(() => useActiveStation(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.stations).toHaveLength(2));

    expect(result.current.stationId).toBe('ghost');
    expect(result.current.station).toBeNull();
  });
});
