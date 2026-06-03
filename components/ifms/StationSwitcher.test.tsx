import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StationSwitcher } from './StationSwitcher';
import { useReportsStore } from '../../store';

const apiMocks = vi.hoisted(() => ({
  listStations: vi.fn(),
}));

vi.mock('../../lib/api/setup', () => ({
  apiSetup: {
    stations: { list: apiMocks.listStations },
  },
}));

function renderSwitcher() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <StationSwitcher />
    </QueryClientProvider>,
  );
}

describe('StationSwitcher', () => {
  beforeEach(() => {
    useReportsStore.setState({ stationId: null, productId: null });
    apiMocks.listStations.mockResolvedValue([
      { id: 'station-1', name: 'North Depot', code: 'NTH' },
      { id: 'station-2', name: 'West Depot', code: 'WST' },
    ]);
  });

  afterEach(() => {
    cleanup();
    useReportsStore.setState({ stationId: null, productId: null });
  });

  test('does not render when there is only one station', async () => {
    apiMocks.listStations.mockResolvedValue([{ id: 'station-1', name: 'North Depot' }]);

    renderSwitcher();

    await waitFor(() => {
      expect(apiMocks.listStations).toHaveBeenCalled();
    });
    expect(screen.queryByText('All Stations')).not.toBeInTheDocument();
  });

  test('opens the station menu and updates report filters', async () => {
    renderSwitcher();

    const trigger = await screen.findByRole('button', { name: /All Stations/i });
    fireEvent.click(trigger);

    fireEvent.click(screen.getByRole('button', { name: /West Depot/i }));

    expect(useReportsStore.getState().stationId).toBe('station-2');
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /North Depot/i })).not.toBeInTheDocument();
    });
  });

  test('shows the selected station and can reset back to all stations', async () => {
    useReportsStore.setState({ stationId: 'station-1' });

    renderSwitcher();

    const trigger = await screen.findByRole('button', { name: /North Depot/i });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('button', { name: /All Stations/i }));

    expect(useReportsStore.getState().stationId).toBeNull();
  });
});
