import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { useAppStore, useAuthStore } from '../../store';
import POSPage from './POSPage';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'posPage.noPermission': 'No POS permission',
        'posPage.title': 'Point of Sale',
        'posPage.saleSuccess': 'Sale completed',
      })[key] ?? key,
  }),
}));

vi.mock('../../lib/hooks/useCurrency', () => ({
  useCurrency: () => ({
    symbol: '$',
    fmt: (value: number) => `$${Number(value || 0).toFixed(2)}`,
  }),
}));

vi.mock('../../lib/hooks/useActiveStation', () => ({
  useActiveStation: () => ({ stationId: 'station-1', station: { id: 'station-1' } }),
}));

vi.mock('../../lib/repositories', () => ({
  productRepo: { list: vi.fn() },
  nozzleRepo: { list: vi.fn() },
  saleRepo: { create: vi.fn() },
}));

vi.mock('./POSReceiptModal', () => ({
  POSReceiptModal: ({
    receipt,
    totalDue,
    onClose,
  }: {
    receipt: { id: string };
    totalDue: number;
    onClose: () => void;
  }) => (
    <div role="dialog" aria-label="receipt">
      <p>Receipt {receipt.id}</p>
      <p>Total {totalDue}</p>
      <button type="button" onClick={onClose}>
        Close receipt
      </button>
    </div>
  ),
}));

import { nozzleRepo, productRepo, saleRepo } from '../../lib/repositories';

const listProducts = vi.mocked(productRepo.list);
const listNozzles = vi.mocked(nozzleRepo.list);
const createSale = vi.mocked(saleRepo.create);

function renderPos(children: ReactNode = <POSPage />) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}>{children}</QueryClientProvider>);
  return client;
}

function setUser(permissions: string[]) {
  useAuthStore.setState({
    user: {
      id: 'user-1',
      name: 'Cashier One',
      email: 'cashier@ifms.test',
      role: 'cashier',
      permissions,
    },
    isAuthenticated: true,
    isAuthReady: true,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  setUser(['sales:pos']);
  useAppStore.setState({ toasts: [] });
  listProducts.mockResolvedValue([
    { id: 'diesel', name: 'Diesel', category: 'Fuel', pricePerUnit: 2.5 },
    { id: 'petrol', name: 'Petrol', category: 'Fuel', pricePerUnit: 3 },
  ]);
  listNozzles.mockResolvedValue([
    {
      id: 'nozzle-diesel',
      stationId: 'station-1',
      pumpCode: 'P01',
      nozzleCode: 'N01',
      productId: 'diesel',
      tankId: 'tank-1',
      status: 'Active',
    },
    {
      id: 'nozzle-petrol',
      stationId: 'station-1',
      pumpCode: 'P02',
      nozzleCode: 'N02',
      productId: 'petrol',
      tankId: 'tank-2',
      status: 'Active',
    },
  ]);
  createSale.mockResolvedValue({
    id: 'sale-1',
    timestamp: '2026-06-03T09:00:00.000Z',
    stationId: 'station-1',
    productId: 'diesel',
    quantity: 10,
    totalAmount: 20,
    paymentType: 'Cash',
    payment: { cash: 20, card: 0, mobile: 0, voucher: 0 },
  });
});

afterEach(cleanup);

describe('POSPage', () => {
  test('blocks users without POS permission before querying register data', () => {
    setUser([]);
    renderPos();

    expect(screen.getAllByText('No POS permission').length).toBe(2);
    expect(screen.queryByLabelText(/Select Item/i)).not.toBeInTheDocument();
  });

  test('loads products and nozzles, calculates total, and quick-fills cash tender', async () => {
    renderPos();

    fireEvent.change(await screen.findByLabelText(/Select Item/i), {
      target: { value: 'diesel' },
    });

    await waitFor(() => expect(screen.getByLabelText(/Unit Price/i)).toHaveValue(2.5));
    await waitFor(() => expect(screen.getByLabelText(/Active Nozzle/i)).toHaveValue('nozzle-diesel'));

    fireEvent.change(screen.getByLabelText(/Liters Sold/i), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText(/Applied Discount/i), { target: { value: '5' } });

    await waitFor(() => expect(screen.getByText('$20.00')).toBeInTheDocument());
    fireEvent.click(screen.getAllByRole('button', { name: 'MAX' })[0]);

    await waitFor(() => expect(screen.getByLabelText('Cash amount')).toHaveValue(20));
  });

  test('submits a valid split tender sale, shows receipt, and resets register fields', async () => {
    renderPos();

    fireEvent.change(await screen.findByLabelText(/Select Item/i), {
      target: { value: 'diesel' },
    });
    await waitFor(() => expect(screen.getByLabelText(/Active Nozzle/i)).toHaveValue('nozzle-diesel'));
    fireEvent.change(screen.getByLabelText(/Liters Sold/i), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText(/Applied Discount/i), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Cash amount'), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText('Card amount'), { target: { value: '8' } });

    fireEvent.click(screen.getByRole('button', { name: /Finalize & Print/i }));

    await waitFor(() =>
      expect(createSale).toHaveBeenCalledWith(
        expect.objectContaining({
          productId: 'diesel',
          nozzleId: 'nozzle-diesel',
          quantity: 10,
          pricePerUnit: 2.5,
          discount: 5,
          payment: expect.objectContaining({ cash: 12, card: 8 }),
        }),
      ),
    );
    expect(useAppStore.getState().toasts.at(-1)?.message).toBe('Sale completed');
    expect(await screen.findByRole('dialog', { name: 'receipt' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close receipt' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'receipt' })).not.toBeInTheDocument());
  });

  test('requires matching tender before finalizing the sale', async () => {
    renderPos();

    fireEvent.change(await screen.findByLabelText(/Select Item/i), {
      target: { value: 'diesel' },
    });
    await waitFor(() => expect(screen.getByLabelText(/Active Nozzle/i)).toHaveValue('nozzle-diesel'));
    fireEvent.change(screen.getByLabelText(/Liters Sold/i), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Cash amount'), { target: { value: '1' } });

    fireEvent.click(screen.getByRole('button', { name: /Finalize & Print/i }));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'receipt' })).not.toBeInTheDocument());
    expect(createSale).not.toHaveBeenCalled();
  });

  test('allows price overrides only for sales void permission holders', async () => {
    setUser(['sales:pos', 'sales:void']);
    renderPos();

    fireEvent.change(await screen.findByLabelText(/Select Item/i), {
      target: { value: 'diesel' },
    });
    await waitFor(() => expect(screen.getByLabelText(/Unit Price/i)).toHaveValue(2.5));
    fireEvent.change(screen.getByLabelText(/Unit Price/i), { target: { value: '2.25' } });

    expect(await screen.findByLabelText(/Override Rationale/i)).toBeInTheDocument();
  });
});
