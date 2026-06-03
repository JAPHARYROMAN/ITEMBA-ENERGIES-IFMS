import { cleanup, render, screen } from '@testing-library/react';
import type * as React from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const genericPageMock = vi.hoisted(() => ({
  calls: [] as Array<{
    title: string;
    description: string;
    queryKey: string[];
    queryFn: () => Promise<unknown[]>;
    columns: Array<{
      header: string;
      accessorKey: string;
      cell?: (row: Record<string, unknown>) => React.ReactNode;
    }>;
    entityName: string;
    FormComponent?: unknown;
  }>,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));

vi.mock('./GenericTablePage', async () => {
  const React = await import('react');
  const row = {
    id: 'row-1',
    timestamp: '2026-06-03T08:00:00.000Z',
    productId: 'diesel',
    quantity: 1234,
    totalAmount: 5678,
    paymentType: 'Cash',
    name: 'Universal Row',
    category: 'Fuel',
    rating: 'Elite',
    avgVariance: 0.125,
    invoiceNumber: 'INV-100',
    supplierId: 'supplier-1',
    invoiceDate: '2026-06-01',
    dueDate: '2026-06-20',
    balanceRemaining: 456,
    status: 'Pending',
    adjustmentDate: '2026-06-02',
    tankId: null,
    volumeDelta: -30,
    reason: 'Evaporation',
    dipDate: '2026-06-03',
    volume: 9000,
    waterLevel: null,
    temperature: null,
    code: 'CAT',
    description: null,
    transferDate: '2026-06-04',
    transferType: 'station',
    fromTankId: null,
    toTankId: 'tank-b',
    varianceDate: '2026-06-05',
    volumeVariance: -45,
    valueVariance: null,
    classification: null,
    reconciliationDate: '2026-06-06',
    expectedVolume: null,
    actualVolume: 8955,
    variance: null,
  };
  return {
    GenericTablePage: (props: (typeof genericPageMock.calls)[number]) => {
      genericPageMock.calls.push(props);
      return React.createElement(
        'section',
        { 'data-testid': `wrapper-${props.entityName}` },
        React.createElement('h1', {}, props.title),
        React.createElement('p', {}, props.description),
        props.columns.map((column) =>
          React.createElement(
            'div',
            { key: `${props.entityName}-${column.accessorKey}` },
            React.createElement('span', {}, column.header),
            React.createElement(
              'strong',
              {},
              column.cell ? column.cell(row) : (row[column.accessorKey] as React.ReactNode),
            ),
          ),
        ),
      );
    },
  };
});

vi.mock('../forms/AdjustmentForm', () => ({ AdjustmentForm: () => null }));
vi.mock('../forms/DipForm', () => ({ DipForm: () => null }));
vi.mock('../forms/ExpenseCategoryForm', () => ({ ExpenseCategoryForm: () => null }));
vi.mock('../forms/ReconciliationForm', () => ({ ReconciliationForm: () => null }));
vi.mock('../forms/StationToStationTransferForm', () => ({ StationToStationTransferForm: () => null }));
vi.mock('../forms/TankToTankTransferForm', () => ({ TankToTankTransferForm: () => null }));

vi.mock('../../lib/repositories', () => ({
  adjustmentRepo: { list: vi.fn().mockResolvedValue([]) },
  dipRepo: { list: vi.fn().mockResolvedValue([]) },
  expenseCategoryRepo: { list: vi.fn().mockResolvedValue([]) },
  reconciliationRepo: { list: vi.fn().mockResolvedValue([]) },
  saleRepo: { list: vi.fn().mockResolvedValue([]) },
  supplierInvoiceRepo: { list: vi.fn().mockResolvedValue([]) },
  supplierRepo: { list: vi.fn().mockResolvedValue([]) },
  transferRepo: { list: vi.fn().mockResolvedValue([]) },
  varianceRepo: { list: vi.fn().mockResolvedValue([]) },
}));

import { adjustmentRepo, dipRepo, expenseCategoryRepo, reconciliationRepo, saleRepo, supplierInvoiceRepo, supplierRepo, transferRepo, varianceRepo } from '../../lib/repositories';
import AdjustmentsPage from './AdjustmentsPage';
import DipsPage from './DipsPage';
import ExpenseCategoriesPage from './ExpenseCategoriesPage';
import ReconciliationsPage from './ReconciliationsPage';
import SalesTransactionsPage from './SalesTransactionsPage';
import StationToStationTransfersPage from './StationToStationTransfersPage';
import SupplierInvoicesPage from './SupplierInvoicesPage';
import SuppliersPage from './SuppliersPage';
import TankToTankTransfersPage from './TankToTankTransfersPage';
import VariancesPage from './VariancesPage';

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  genericPageMock.calls.length = 0;
});

describe('GenericTablePage wrappers', () => {
  test('render page-specific titles, entities, columns, and formatted cells', async () => {
    const pages = [
      AdjustmentsPage,
      DipsPage,
      ExpenseCategoriesPage,
      ReconciliationsPage,
      SalesTransactionsPage,
      StationToStationTransfersPage,
      SupplierInvoicesPage,
      SuppliersPage,
      TankToTankTransfersPage,
      VariancesPage,
    ];

    pages.forEach((Page) => render(<Page />));

    expect(screen.getByText('Stock Adjustments')).toBeInTheDocument();
    expect(screen.getByText('Tank Dip Readings')).toBeInTheDocument();
    expect(screen.getByText('Expense Categories')).toBeInTheDocument();
    expect(screen.getByText('Inventory Reconciliations')).toBeInTheDocument();
    expect(screen.getByText('Sales Transactions')).toBeInTheDocument();
    expect(screen.getByText('Station-to-Station Transfers')).toBeInTheDocument();
    expect(screen.getByText('Supplier Invoices')).toBeInTheDocument();
    expect(screen.getByText('Suppliers')).toBeInTheDocument();
    expect(screen.getByText('Tank-to-Tank Transfers')).toBeInTheDocument();
    expect(screen.getByText('Inventory Variances')).toBeInTheDocument();

    expect(screen.getByText('-30')).toBeInTheDocument();
    expect(screen.getByText('9,000')).toBeInTheDocument();
    expect(screen.getByText('0.13')).toBeInTheDocument();
    expect(screen.getAllByText(/5,678/).length).toBeGreaterThan(0);

    expect(genericPageMock.calls.map((call) => call.entityName)).toEqual([
      'Adjustment',
      'Dip',
      'Category',
      'Reconciliation',
      'Transaction',
      'Transfer',
      'Invoice',
      'Supplier',
      'Transfer',
      'Variance',
    ]);

    await Promise.all(genericPageMock.calls.map((call) => call.queryFn()));
    expect(adjustmentRepo.list).toHaveBeenCalledTimes(1);
    expect(dipRepo.list).toHaveBeenCalledTimes(1);
    expect(expenseCategoryRepo.list).toHaveBeenCalledTimes(1);
    expect(reconciliationRepo.list).toHaveBeenCalledTimes(1);
    expect(saleRepo.list).toHaveBeenCalledTimes(1);
    expect(supplierInvoiceRepo.list).toHaveBeenCalledTimes(1);
    expect(supplierRepo.list).toHaveBeenCalledTimes(1);
    expect(transferRepo.list).toHaveBeenCalledTimes(2);
    expect(varianceRepo.list).toHaveBeenCalledTimes(1);
  });

  test('passes expected query keys and form components for writable inventory pages', () => {
    render(<AdjustmentsPage />);
    render(<DipsPage />);
    render(<ReconciliationsPage />);

    expect(genericPageMock.calls.map((call) => call.queryKey)).toEqual([
      ['adjustments'],
      ['dips'],
      ['reconciliations'],
    ]);
    expect(genericPageMock.calls.every((call) => call.FormComponent)).toBe(true);
  });
});
