import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { POSReceiptModal } from './POSReceiptModal';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const labels: Record<string, string> = {
        'pos.saleCommitted': 'Sale committed',
        'pos.timestampLabel': 'Timestamp',
        'pos.volumeLabel': 'Volume',
        'pos.volumeValue': `${options?.quantity} liters`,
        'pos.totalDue': 'Total Due',
        'pos.paymentMethods': 'Payment Methods',
        'pos.newTransaction': 'New Transaction',
        'pos.printReceipt': 'Print receipt',
      };
      if (key === 'pos.transactionId') return `Transaction ${options?.id}`;
      return labels[key] ?? key;
    },
  }),
}));

vi.mock('../../lib/hooks/useCurrency', () => ({
  useCurrency: () => ({ fmt: (value: number) => `$${value.toFixed(2)}` }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, 'print', { value: vi.fn(), configurable: true });
});

afterEach(cleanup);

describe('POSReceiptModal', () => {
  test('renders transaction details and only positive payment methods', () => {
    render(
      <POSReceiptModal
        receipt={{
          id: 'sale-100',
          timestamp: '2026-06-03T08:30:00.000Z',
          quantity: 42.5,
          payment: { cash: 100, card: 0, mobile: 55.25, voucher: 0 },
        }}
        totalDue={155.25}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText('Sale committed')).toBeInTheDocument();
    expect(screen.getByText('Transaction sale-100')).toBeInTheDocument();
    expect(screen.getByText('42.5 liters')).toBeInTheDocument();
    expect(screen.getByText('$155.25')).toBeInTheDocument();
    expect(screen.getByText('cash:')).toBeInTheDocument();
    expect(screen.getByText('mobile:')).toBeInTheDocument();
    expect(screen.queryByText('card:')).not.toBeInTheDocument();
    expect(screen.queryByText('voucher:')).not.toBeInTheDocument();
  });

  test('close and print actions call their handlers', () => {
    const onClose = vi.fn();
    render(
      <POSReceiptModal
        receipt={{
          id: 'sale-101',
          timestamp: '2026-06-03T08:30:00.000Z',
          quantity: 12,
          payment: { card: 24 },
        }}
        totalDue={24}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'New Transaction' }));
    fireEvent.click(screen.getByRole('button', { name: 'Print receipt' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(window.print).toHaveBeenCalledTimes(1);
  });
});
