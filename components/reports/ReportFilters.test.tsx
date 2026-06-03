import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { useAppStore, useReportsStore } from '../../store';
import ReportFilters from './ReportFilters';

vi.mock('../../lib/data-source', () => ({
  setupDataSource: {
    stations: { list: vi.fn() },
    products: { list: vi.fn() },
  },
}));

import { setupDataSource } from '../../lib/data-source';

const stationList = vi.mocked(setupDataSource.stations.list);
const productList = vi.mocked(setupDataSource.products.list);

function renderFilters() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ReportFilters />
    </QueryClientProvider>,
  );
  return client;
}

beforeEach(() => {
  vi.clearAllMocks();
  stationList.mockResolvedValue([
    { id: 'station-1', name: 'Downtown Station', companyId: 'company-1', location: 'Central' },
    { id: 'station-2', name: 'Highway Station', companyId: 'company-1', location: 'North' },
  ]);
  productList.mockResolvedValue([
    { id: 'product-1', name: 'Diesel', category: 'Fuel', pricePerUnit: 2.5 },
    { id: 'product-2', name: 'Petrol', category: 'Fuel', pricePerUnit: 3 },
  ]);
  useReportsStore.setState({
    dateRange: { from: '2026-06-01', to: '2026-06-30' },
    stationId: null,
    productId: null,
  });
  useAppStore.setState({ toasts: [] });
});

afterEach(cleanup);

describe('ReportFilters', () => {
  test('renders date inputs and async station/product options', async () => {
    renderFilters();

    expect(screen.getByDisplayValue('2026-06-01')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2026-06-30')).toBeInTheDocument();
    expect(await screen.findByRole('option', { name: 'Downtown Station' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Diesel' })).toBeInTheDocument();
  });

  test('updates report store filters from date and select controls', async () => {
    renderFilters();

    const fromInput = screen.getByDisplayValue('2026-06-01');
    const toInput = screen.getByDisplayValue('2026-06-30');
    fireEvent.change(fromInput, { target: { value: '2026-06-03' } });
    fireEvent.change(toInput, { target: { value: '2026-06-20' } });

    await screen.findByRole('option', { name: 'Highway Station' });
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'station-2' } });
    fireEvent.change(selects[1], { target: { value: 'product-1' } });

    expect(useReportsStore.getState()).toMatchObject({
      dateRange: { from: '2026-06-03', to: '2026-06-20' },
      stationId: 'station-2',
      productId: 'product-1',
    });
  });

  test('clears existing station and product filters back to all options', async () => {
    useReportsStore.setState({
      dateRange: { from: '2026-06-01', to: '2026-06-30' },
      stationId: 'station-1',
      productId: 'product-1',
    });

    renderFilters();

    await screen.findByRole('option', { name: 'Downtown Station' });
    const selects = screen.getAllByRole('combobox');
    expect(selects[0]).toHaveValue('station-1');
    expect(selects[1]).toHaveValue('product-1');

    fireEvent.change(selects[0], { target: { value: '' } });
    fireEvent.change(selects[1], { target: { value: '' } });

    expect(useReportsStore.getState()).toMatchObject({
      stationId: null,
      productId: null,
    });
  });

  test('renders only fallback options when async filter lists are absent', async () => {
    stationList.mockResolvedValueOnce(undefined as never);
    productList.mockRejectedValueOnce(new Error('Products unavailable') as never);

    renderFilters();

    await waitFor(() => expect(stationList).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(productList).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('option', { name: 'All Stations' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'All Products' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Downtown Station' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Diesel' })).not.toBeInTheDocument();
  });

  test('reload invalidates report queries and advanced toggle emits info toasts', async () => {
    const client = renderFilters();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');

    fireEvent.click(screen.getByTitle('Reload Data'));
    expect(invalidateSpy).toHaveBeenCalledWith({ predicate: expect.any(Function) });
    const predicate = invalidateSpy.mock.calls[0][0].predicate as (query: { queryKey: unknown[] }) => boolean;
    expect(predicate({ queryKey: ['report-stock-loss'] })).toBe(true);
    expect(predicate({ queryKey: ['reports-overview'] })).toBe(true);
    expect(predicate({ queryKey: ['stations'] })).toBe(false);
    expect(predicate({ queryKey: [undefined] })).toBe(false);
    expect(useAppStore.getState().toasts.at(-1)?.message).toBe('Report data refreshed');

    fireEvent.click(screen.getByTitle('More Filters'));
    expect(screen.getByText(/Filters are applied to all report API endpoints/i)).toBeInTheDocument();
    expect(useAppStore.getState().toasts.at(-1)?.message).toBe('Showing date & advanced options');

    fireEvent.click(screen.getByTitle('More Filters'));
    await waitFor(() =>
      expect(
        screen.queryByText(/Filters are applied to all report API endpoints/i),
      ).not.toBeInTheDocument(),
    );
    expect(useAppStore.getState().toasts.at(-1)?.message).toBe('Filters simplified');
  });
});
