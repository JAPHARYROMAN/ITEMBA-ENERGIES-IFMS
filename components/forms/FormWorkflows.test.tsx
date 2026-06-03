import React from 'react';
import { describe, test, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { OpenShiftForm } from './OpenShiftForm';
import { CloseShiftForm } from './CloseShiftForm';
import { CustomerManagement } from './CustomerManagement';
import { ExpenseEntryForm } from './ExpenseEntryForm';
import { CreditInvoiceForm } from './CreditInvoiceForm';
import { RecordPaymentForm } from './RecordPaymentForm';
import { ReceiveDeliveryForm } from './ReceiveDeliveryForm';
import { TankForm } from './TankForm';
import { GeneralSetupForm } from './GeneralSetupForm';
import { NozzleSetupForm } from './NozzleSetupForm';
import { ProductForm } from './ProductForm';
import { CreateDeliveryForm } from './CreateDeliveryForm';
import { PettyCashForm } from './PettyCashForm';
import { ExpenseForm } from './ExpenseForm';

const mocks = vi.hoisted(() => ({
  addToast: vi.fn(),
  triggerPrint: vi.fn(),
  addCustomerNote: vi.fn(),
  storage: new Map<string, unknown>(),
  companyList: vi.fn(),
  stationList: vi.fn(),
  branchList: vi.fn(),
  productList: vi.fn(),
  nozzleList: vi.fn(),
  shiftOpen: vi.fn(),
  shiftClose: vi.fn(),
  shiftGetOpen: vi.fn(),
  customerList: vi.fn(),
  customerGet: vi.fn(),
  customerCreate: vi.fn(),
  invoiceList: vi.fn(),
  invoiceGetUnpaid: vi.fn(),
  invoiceCreate: vi.fn(),
  paymentList: vi.fn(),
  paymentCreate: vi.fn(),
  expenseCreate: vi.fn(),
  expenseUpdate: vi.fn(),
  expenseUpdateStatus: vi.fn(),
  deliveryList: vi.fn(),
  deliveryCreate: vi.fn(),
  deliveryReceive: vi.fn(),
  tankList: vi.fn(),
  supplierList: vi.fn(),
  pettyCashBalance: vi.fn(),
  pettyCashTransact: vi.fn(),
  setupCompaniesList: vi.fn(),
  setupCompaniesCreate: vi.fn(),
  setupCompaniesUpdate: vi.fn(),
  setupStationsList: vi.fn(),
  setupStationsCreate: vi.fn(),
  setupStationsUpdate: vi.fn(),
  setupBranchesList: vi.fn(),
  setupBranchesCreate: vi.fn(),
  setupBranchesUpdate: vi.fn(),
  setupProductsList: vi.fn(),
  setupProductsCreate: vi.fn(),
  setupTanksList: vi.fn(),
  setupTanksCreate: vi.fn(),
  setupPumpsList: vi.fn(),
  setupNozzlesCreate: vi.fn(),
  authUser: undefined as unknown,
}));

vi.mock('../../store', async (importActual) => {
  const actual = await importActual<typeof import('../../store')>();
  const user = {
    id: 'user-1',
    name: 'Alex Manager',
    email: 'alex@example.com',
    role: 'manager',
    permissions: [
      'setup:write',
      'shifts:open',
      'shifts:close',
      'credit:write',
      'expenses:write',
      'deliveries:write',
      'inventory:write',
      'transfers:write',
      'adjustments:write',
    ],
  };

  return {
    ...actual,
    useAppStore: () => ({ addToast: mocks.addToast }),
    useAuthStore: () => {
      const currentUser = mocks.authUser === undefined ? user : mocks.authUser;
      return { user: currentUser, isAuthenticated: Boolean(currentUser), isAuthReady: true };
    },
  };
});

vi.mock('../../lib/repositories', () => ({
  companyRepo: { list: mocks.companyList },
  stationRepo: { list: mocks.stationList },
  branchRepo: { list: mocks.branchList },
  productRepo: { list: mocks.productList },
  nozzleRepo: { list: mocks.nozzleList },
  shiftRepo: {
    open: mocks.shiftOpen,
    close: mocks.shiftClose,
    getOpen: mocks.shiftGetOpen,
  },
  customerRepo: {
    list: mocks.customerList,
    get: mocks.customerGet,
    create: mocks.customerCreate,
  },
  invoiceRepo: {
    list: mocks.invoiceList,
    getUnpaid: mocks.invoiceGetUnpaid,
    create: mocks.invoiceCreate,
  },
  paymentRepo: {
    list: mocks.paymentList,
    create: mocks.paymentCreate,
  },
  expenseRepo: {
    create: mocks.expenseCreate,
    update: mocks.expenseUpdate,
    updateStatus: mocks.expenseUpdateStatus,
  },
  deliveryRepo: {
    list: mocks.deliveryList,
    create: mocks.deliveryCreate,
    receive: mocks.deliveryReceive,
  },
  tankRepo: { list: mocks.tankList },
  supplierRepo: { list: mocks.supplierList },
  pettyCashRepo: {
    getBalance: mocks.pettyCashBalance,
    transact: mocks.pettyCashTransact,
  },
}));

vi.mock('../../lib/data-source', () => ({
  setupDataSource: {
    companies: {
      list: mocks.setupCompaniesList,
      create: mocks.setupCompaniesCreate,
      update: mocks.setupCompaniesUpdate,
    },
    stations: {
      list: mocks.setupStationsList,
      create: mocks.setupStationsCreate,
      update: mocks.setupStationsUpdate,
    },
    branches: {
      list: mocks.setupBranchesList,
      create: mocks.setupBranchesCreate,
      update: mocks.setupBranchesUpdate,
    },
    products: {
      list: mocks.setupProductsList,
      create: mocks.setupProductsCreate,
    },
    tanks: {
      list: mocks.setupTanksList,
      create: mocks.setupTanksCreate,
    },
    pumps: { list: mocks.setupPumpsList },
    nozzles: { create: mocks.setupNozzlesCreate },
  },
}));

vi.mock('../../lib/hooks/useActiveStation', () => ({
  useActiveStation: () => ({
    stationId: 'station-1',
    station: {
      id: 'station-1',
      companyId: 'company-1',
      code: 'ST-01',
      name: 'Downtown Station',
    },
    stations: [],
    isLoading: false,
    setStationId: vi.fn(),
  }),
}));

vi.mock('../../lib/hooks/useCurrency', () => ({
  useCurrency: () => ({
    currency: 'USD',
    symbol: '$',
    fmt: (value: number | string) =>
      `$${Number(value).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`,
    fmtCompact: (value: number | string) => `$${Number(value).toLocaleString('en-US')}`,
    header: (label: string) => `${label} ($)`,
  }),
}));

vi.mock('../../lib/storage', () => ({
  getStorageItem: (key: string) => mocks.storage.get(key) ?? null,
  setStorageItem: (key: string, value: unknown) => {
    mocks.storage.set(key, value);
    return true;
  },
  removeStorageItem: (key: string) => {
    mocks.storage.delete(key);
  },
}));

vi.mock('../../lib/api/actions', () => ({
  addCustomerNote: mocks.addCustomerNote,
}));

vi.mock('../../lib/exportUtils', () => ({
  triggerPrint: mocks.triggerPrint,
}));

const companies = [
  { id: 'company-1', code: 'CMP', name: 'IFMS Energy', currency: 'USD', status: 'active' },
];
const stations = [
  {
    id: 'station-1',
    companyId: 'company-1',
    code: 'ST-01',
    name: 'Downtown Station',
    location: 'Nairobi',
    manager: 'Alex',
  },
];
const branches = [{ id: 'branch-1', stationId: 'station-1', name: 'Main Branch' }];
const products = [
  { id: 'prod-1', name: 'Unleaded 95', pricePerUnit: 2, category: 'Fuel' },
  { id: 'prod-2', name: 'Diesel', pricePerUnit: 3, category: 'Fuel' },
];
const tanks = [
  {
    id: 'tank-1',
    companyId: 'company-1',
    stationId: 'station-1',
    branchId: 'branch-1',
    code: 'TNK-1',
    productId: 'prod-1',
    capacity: 5000,
    currentLevel: 1000,
    minLevel: 250,
    maxLevel: 4500,
    calibrationProfile: 'Standard-V1',
  },
];
const customers = [
  {
    id: 'cust-1',
    name: 'Acme Logistics',
    phone: '555-0100',
    email: 'billing@acme.test',
    address: 'Yard 1',
    taxId: 'TIN-123',
    creditLimit: 1000,
    paymentTerms: 'Net 30',
    status: 'Active',
    balance: 100,
  },
];
const deliveries = [
  {
    id: 'delivery-1',
    supplierId: 'supplier-risk',
    deliveryNote: 'DN-77',
    vehicleNo: 'KAA-123',
    driverName: 'Jane Driver',
    productId: 'prod-1',
    orderedQty: 1000,
    expectedDate: '2026-06-04',
    status: 'Pending',
    timestamp: '2026-06-03T08:00:00.000Z',
  },
];
const submittedExpense = {
  id: 'expense-1',
  timestamp: '2026-06-03T08:00:00.000Z',
  branchId: 'branch-1',
  category: 'Maintenance',
  amount: 1500,
  vendor: 'Pump Repairs Ltd',
  paymentMethod: 'Bank Transfer',
  description: 'Emergency pump repair',
  status: 'Submitted',
};

function renderForm(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  render(
    <MemoryRouter>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </MemoryRouter>,
  );

  return client;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function fieldByName(name: string) {
  const field = document.querySelector(`[name="${name}"]`);
  if (!field) throw new Error(`Could not find form field "${name}"`);
  return field as HTMLElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.storage.clear();
  mocks.authUser = undefined;
  mocks.companyList.mockResolvedValue(companies);
  mocks.stationList.mockResolvedValue(stations);
  mocks.branchList.mockResolvedValue(branches);
  mocks.productList.mockResolvedValue(products);
  mocks.nozzleList.mockResolvedValue([
    {
      id: 'nozzle-1',
      stationId: 'station-1',
      pumpCode: 'P1',
      nozzleCode: 'N1',
      productId: 'prod-1',
      tankId: 'tank-1',
      status: 'Active',
    },
  ]);
  mocks.shiftOpen.mockResolvedValue({ id: 'shift-new' });
  mocks.shiftClose.mockResolvedValue({ success: true });
  mocks.shiftGetOpen.mockResolvedValue({
    id: 'shift-1',
    stationId: 'station-1',
    startTime: '2026-06-03T06:00:00.000Z',
    status: 'open',
    cashierId: '2',
    readings: [
      {
        nozzleId: 'nozzle-1',
        nozzleCode: 'P1-N1',
        openingReading: 100,
        pricePerUnit: 2,
      },
    ],
  });
  mocks.customerList.mockResolvedValue(customers);
  mocks.customerGet.mockResolvedValue(customers[0]);
  mocks.customerCreate.mockResolvedValue(customers[0]);
  mocks.invoiceList.mockResolvedValue([
    {
      id: 'inv-1',
      invoiceNumber: 'INV-1',
      customerId: 'cust-1',
      customerName: 'Acme Logistics',
      date: '2026-05-01',
      dueDate: '2026-06-01',
      status: 'Unpaid',
      totalAmount: 400,
      balanceRemaining: 250,
      items: [],
    },
  ]);
  mocks.invoiceGetUnpaid.mockResolvedValue([
    {
      id: 'inv-old',
      invoiceNumber: 'INV-OLD',
      customerId: 'cust-1',
      customerName: 'Acme Logistics',
      date: '2026-05-01',
      dueDate: '2026-06-01',
      status: 'Unpaid',
      totalAmount: 400,
      balanceRemaining: 80,
      items: [],
    },
    {
      id: 'inv-new',
      invoiceNumber: 'INV-NEW',
      customerId: 'cust-1',
      customerName: 'Acme Logistics',
      date: '2026-05-15',
      dueDate: '2026-06-15',
      status: 'Unpaid',
      totalAmount: 400,
      balanceRemaining: 120,
      items: [],
    },
  ]);
  mocks.invoiceCreate.mockResolvedValue({ id: 'inv-created' });
  mocks.paymentList.mockResolvedValue([
    {
      id: 'pay-1',
      customerId: 'cust-1',
      amount: 100,
      method: 'Cash',
      date: '2026-05-02',
      referenceNo: 'RCPT-1',
      allocations: [],
    },
  ]);
  mocks.paymentCreate.mockResolvedValue({ id: 'pay-created' });
  mocks.expenseCreate.mockResolvedValue({ id: 'expense-created' });
  mocks.expenseUpdate.mockResolvedValue({ id: 'expense-updated' });
  mocks.expenseUpdateStatus.mockResolvedValue({ id: 'expense-status' });
  mocks.deliveryList.mockResolvedValue(deliveries);
  mocks.deliveryCreate.mockResolvedValue({ id: 'delivery-created' });
  mocks.deliveryReceive.mockResolvedValue({ success: true });
  mocks.tankList.mockResolvedValue(tanks);
  mocks.supplierList.mockResolvedValue([
    {
      id: 'supplier-risk',
      name: 'Risky Fuels',
      category: 'Fuel',
      avgVariance: -3.5,
      rating: 'At Risk',
    },
  ]);
  mocks.pettyCashBalance.mockResolvedValue(250);
  mocks.pettyCashTransact.mockResolvedValue({ id: 'petty-1' });
  mocks.setupCompaniesList.mockResolvedValue(companies);
  mocks.setupCompaniesCreate.mockResolvedValue(companies[0]);
  mocks.setupCompaniesUpdate.mockResolvedValue(companies[0]);
  mocks.setupStationsList.mockResolvedValue(stations);
  mocks.setupStationsCreate.mockResolvedValue(stations[0]);
  mocks.setupStationsUpdate.mockResolvedValue(stations[0]);
  mocks.setupBranchesList.mockResolvedValue(branches);
  mocks.setupBranchesCreate.mockResolvedValue(branches[0]);
  mocks.setupBranchesUpdate.mockResolvedValue(branches[0]);
  mocks.setupProductsList.mockResolvedValue(products);
  mocks.setupProductsCreate.mockResolvedValue(products[0]);
  mocks.setupTanksList.mockResolvedValue(tanks);
  mocks.setupTanksCreate.mockResolvedValue(tanks[0]);
  mocks.setupPumpsList.mockResolvedValue([
    { id: 'pump-1', stationId: 'station-1', code: 'PMP-1', name: 'Pump 1', status: 'active' },
  ]);
  mocks.setupNozzlesCreate.mockResolvedValue({ id: 'nozzle-created' });
  mocks.addCustomerNote.mockResolvedValue({ id: 'note-1' });
});

afterEach(() => {
  cleanup();
});

describe('OpenShiftForm', () => {
  test('validates hierarchy before moving to meter readings', async () => {
    renderForm(<OpenShiftForm onSuccess={vi.fn()} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Next Step/i }));

    await waitFor(() => expect(screen.getAllByText('Required').length).toBeGreaterThanOrEqual(4));
    expect(screen.getByLabelText(/Corporate Entity/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Operational Station/i)).toBeInTheDocument();
  });

  test('loads nozzles, advances through readings, and opens a shift', async () => {
    const onSuccess = vi.fn();
    renderForm(<OpenShiftForm onSuccess={onSuccess} onCancel={vi.fn()} />);

    fireEvent.change(await screen.findByLabelText(/Corporate Entity/i), {
      target: { value: 'company-1' },
    });
    fireEvent.change(screen.getByLabelText(/Operational Station/i), {
      target: { value: 'station-1' },
    });
    fireEvent.change(await screen.findByLabelText(/Station Branch/i), {
      target: { value: 'branch-1' },
    });
    fireEvent.change(screen.getByLabelText(/Primary Cashier/i), { target: { value: '2' } });

    fireEvent.click(screen.getByRole('button', { name: /Next Step/i }));

    const opening = await screen.findByLabelText(/Opening reading for P1-N1/i);
    fireEvent.change(opening, { target: { value: '123.5' } });
    expect(screen.getByText('$2.00')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Next Step/i }));
    expect(await screen.findByText(/Shift Summary Review/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Authorize & Start Shift/i }));

    await waitFor(() => expect(mocks.shiftOpen).toHaveBeenCalledTimes(1));
    expect(mocks.shiftOpen.mock.calls[0][0]).toMatchObject({
      companyId: 'company-1',
      stationId: 'station-1',
      branchId: 'branch-1',
      cashierId: '2',
      readings: [{ nozzleId: 'nozzle-1', openingReading: 123.5, pricePerUnit: 2 }],
    });
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });
});

describe('CloseShiftForm', () => {
  test('shows loading and empty states for active shift lookup', async () => {
    const pending = deferred<null>();
    mocks.shiftGetOpen.mockReturnValueOnce(pending.promise);
    const { unmount } = render(<QueryClientProvider client={new QueryClient()}>
      <CloseShiftForm onSuccess={vi.fn()} onCancel={vi.fn()} />
    </QueryClientProvider>);

    expect(screen.getByText(/SYNCHRONIZING TERMINAL/i)).toBeInTheDocument();
    unmount();

    mocks.shiftGetOpen.mockResolvedValueOnce(null);
    renderForm(<CloseShiftForm onSuccess={vi.fn()} onCancel={vi.fn()} />);
    expect(await screen.findByText(/No active shift found/i)).toBeInTheDocument();
    pending.resolve(null);
  });

  test('reconciles meter revenue, previews receipt, and closes the shift', async () => {
    const onSuccess = vi.fn();
    renderForm(<CloseShiftForm onSuccess={onSuccess} onCancel={vi.fn()} />);

    const closing = await screen.findByLabelText(/Closing reading for P1-N1/i);
    fireEvent.change(closing, { target: { value: '110' } });
    expect(screen.getByText('10.00 L')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Analyze Data/i }));
    fireEvent.change(await screen.findByLabelText(/Physical Cash/i), { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: /Analyze Data/i }));

    expect(await screen.findByText('Total Volume')).toBeInTheDocument();
    expect(screen.getByText('10 L')).toBeInTheDocument();
    expect(screen.getAllByText('$20.00').length).toBeGreaterThanOrEqual(2);

    fireEvent.click(screen.getByRole('button', { name: /Preview/i }));
    expect(await screen.findByText(/IFMS RECEIPT/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Close Receipt/i }));

    fireEvent.click(screen.getByRole('button', { name: /Authorize Terminal Lock/i }));
    await waitFor(() => expect(mocks.shiftClose).toHaveBeenCalledWith(expect.objectContaining({
      id: 'shift-1',
      collections: expect.objectContaining({ cash: 20 }),
    })));
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });
});

describe('CustomerManagement', () => {
  test('shows persistence prompt for new customers', () => {
    renderForm(<CustomerManagement onSuccess={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByText(/Register Customer/i)).toBeInTheDocument();
    expect(screen.getByText(/Persistence Required/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Legal Name/i)).toBeInTheDocument();
  });

  test('loads ledger tabs, prints statements, and saves notes for an existing customer', async () => {
    renderForm(
      <CustomerManagement initialId="cust-1" onSuccess={vi.fn()} onCancel={vi.fn()} />,
    );

    expect(await screen.findByText('$100')).toBeInTheDocument();
    expect(screen.getByText('10.0%')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: /Download PDF/i })[0]);
    expect(mocks.triggerPrint).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /Invoices/i }));
    expect(await screen.findByText('inv-1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Payments/i }));
    expect(await screen.findByText('pay-1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Audit Notes/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Edit Note/i }));
    fireEvent.change(screen.getByPlaceholderText(/Note content/i), {
      target: { value: 'Updated customer audit note' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));

    await waitFor(() =>
      expect(mocks.addCustomerNote).toHaveBeenCalledWith(
        'cust-1',
        'Updated customer audit note',
      ),
    );
  });

  test('shows loading state while an existing customer profile is resolving', async () => {
    const pending = deferred<typeof customers[number]>();
    mocks.customerGet.mockReturnValueOnce(pending.promise);

    renderForm(
      <CustomerManagement initialId="cust-1" onSuccess={vi.fn()} onCancel={vi.fn()} />,
    );

    expect(screen.getByText(/Retrieving Master Record/i)).toBeInTheDocument();
    pending.resolve(customers[0]);
    expect(await screen.findByText('$100')).toBeInTheDocument();
  });

  test('hides credit write actions for read-only customer users', async () => {
    mocks.authUser = {
      id: 'user-read',
      name: 'Read Only',
      email: 'readonly@example.com',
      role: 'auditor',
      permissions: ['credit:read'],
    };

    renderForm(
      <CustomerManagement initialId="cust-1" onSuccess={vi.fn()} onCancel={vi.fn()} />,
    );

    expect(await screen.findByText('$100')).toBeInTheDocument();
    expect(screen.queryByText(/New Invoice/i, { selector: 'button.bg-indigo-600' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Post Payment/i, { selector: 'button.bg-emerald-600' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Audit Notes/i }));
    expect(screen.queryByRole('button', { name: /Edit Note/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add New Internal Note/i })).not.toBeInTheDocument();
  });

  test('renders invoice status and balance branches for paid, partial, and unpaid rows', async () => {
    mocks.invoiceList.mockResolvedValueOnce([
      {
        id: 'inv-paid',
        invoiceNumber: 'INV-PAID',
        customerId: 'cust-1',
        customerName: 'Acme Logistics',
        date: '2026-05-01',
        dueDate: '2026-06-01',
        status: 'Paid',
        totalAmount: 200,
        balanceRemaining: 0,
        items: [],
      },
      {
        id: 'inv-partial',
        invoiceNumber: 'INV-PART',
        customerId: 'cust-1',
        customerName: 'Acme Logistics',
        date: '2026-05-02',
        dueDate: '2026-06-02',
        status: 'Partial',
        totalAmount: 300,
        balanceRemaining: 75,
        items: [],
      },
      {
        id: 'inv-unpaid',
        invoiceNumber: 'INV-UNPAID',
        customerId: 'cust-1',
        customerName: 'Acme Logistics',
        date: '2026-05-03',
        dueDate: '2026-06-03',
        status: 'Unpaid',
        totalAmount: 400,
        balanceRemaining: 400,
        items: [],
      },
    ]);

    renderForm(
      <CustomerManagement initialId="cust-1" onSuccess={vi.fn()} onCancel={vi.fn()} />,
    );

    await screen.findByText('$100');
    fireEvent.click(screen.getByRole('button', { name: /Invoices/i }));

    expect(await screen.findByText('inv-paid')).toBeInTheDocument();
    expect(screen.getByText('inv-partial')).toBeInTheDocument();
    expect(screen.getByText('inv-unpaid')).toBeInTheDocument();
    expect(screen.getByText('Paid')).toBeInTheDocument();
    expect(screen.getByText('Partial')).toBeInTheDocument();
    expect(screen.getAllByText('Unpaid').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('$0').length).toBeGreaterThanOrEqual(1);
  });

  test('cancels a new note draft and reports note save failures', async () => {
    mocks.addCustomerNote.mockRejectedValueOnce(new Error('Notes service unavailable'));

    renderForm(
      <CustomerManagement initialId="cust-1" onSuccess={vi.fn()} onCancel={vi.fn()} />,
    );

    await screen.findByText('$100');
    fireEvent.click(screen.getByRole('button', { name: /Audit Notes/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Add New Internal Note/i }));
    fireEvent.change(screen.getByPlaceholderText(/New internal note/i), {
      target: { value: 'Draft note that should be discarded' },
    });
    const draftEditor = screen.getByPlaceholderText(/New internal note/i).closest('.p-6');
    if (!draftEditor) throw new Error('Could not find new note editor');
    fireEvent.click(within(draftEditor as HTMLElement).getByRole('button', { name: /^Cancel$/i }));
    expect(screen.queryByPlaceholderText(/New internal note/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Add New Internal Note/i }));
    fireEvent.change(screen.getByPlaceholderText(/New internal note/i), {
      target: { value: 'Escalate collection risk' },
    });
    const failingEditor = screen.getByPlaceholderText(/New internal note/i).closest('.p-6');
    if (!failingEditor) throw new Error('Could not find failing note editor');
    fireEvent.click(within(failingEditor as HTMLElement).getByRole('button', { name: /Save Note/i }));

    await waitFor(() =>
      expect(mocks.addToast).toHaveBeenCalledWith('Notes service unavailable', 'error'),
    );
  });

  test('creates an invoice from the customer drawer and runs parent success handling', async () => {
    renderForm(
      <CustomerManagement initialId="cust-1" onSuccess={vi.fn()} onCancel={vi.fn()} />,
    );

    await screen.findByText('$100');
    fireEvent.click(screen.getByRole('button', { name: /New Invoice/i }));
    fireEvent.change(await screen.findByLabelText(/Product/i), { target: { value: 'prod-1' } });
    fireEvent.change(screen.getByLabelText(/Quantity/i), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText(/Price/i), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: /Post & Send Invoice/i }));

    await waitFor(() => expect(mocks.invoiceCreate).toHaveBeenCalledTimes(1));
    expect(mocks.addToast).toHaveBeenCalledWith('Invoice saved successfully', 'success');
    expect(mocks.addToast).toHaveBeenCalledWith('Invoice created', 'success');
  });
});

describe('ExpenseEntryForm', () => {
  test('creates a new expense and surfaces high-value policy state', async () => {
    const onSuccess = vi.fn();
    renderForm(<ExpenseEntryForm onSuccess={onSuccess} onCancel={vi.fn()} />);

    fireEvent.change(await screen.findByLabelText(/Cost Center/i), {
      target: { value: 'branch-1' },
    });
    fireEvent.change(screen.getByLabelText(/General Ledger Category/i), {
      target: { value: 'Maintenance' },
    });
    fireEvent.change(screen.getByLabelText(/Amount/i), { target: { value: '1500' } });
    fireEvent.change(screen.getByLabelText(/Vendor Name/i), {
      target: { value: 'Pump Repairs Ltd' },
    });
    fireEvent.change(screen.getByLabelText(/Justification/i), {
      target: { value: 'Emergency repairs for pump one' },
    });

    expect(screen.getByText(/High Value Protocol Active/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Submit for Approval/i }));
    await waitFor(() => expect(mocks.expenseCreate).toHaveBeenCalledWith(expect.objectContaining({
      branchId: 'branch-1',
      amount: 1500,
      vendor: 'Pump Repairs Ltd',
    })));
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  test('approves and rejects submitted expenses through review actions', async () => {
    renderForm(
      <ExpenseEntryForm
        initialData={submittedExpense}
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Authorize & Commit/i }));
    await waitFor(() =>
      expect(mocks.expenseUpdateStatus).toHaveBeenCalledWith('expense-1', 'Approved', undefined),
    );

    fireEvent.click(screen.getByRole('button', { name: /Reject Entry/i }));
    expect(screen.getByRole('button', { name: /Confirm Rejection/i })).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(/Insufficient documentation/i), {
      target: { value: 'Receipt amount does not match vendor quote' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Confirm Rejection/i }));
    await waitFor(() =>
      expect(mocks.expenseUpdateStatus).toHaveBeenLastCalledWith(
        'expense-1',
        'Rejected',
        'Receipt amount does not match vendor quote',
      ),
    );
  });
});

describe('CreditInvoiceForm', () => {
  test('computes invoice totals and submits line items', async () => {
    const onSuccess = vi.fn();
    renderForm(
      <CreditInvoiceForm initialCustomerId="cust-1" onSuccess={onSuccess} onCancel={vi.fn()} />,
    );

    fireEvent.change(await screen.findByLabelText(/Product/i), { target: { value: 'prod-1' } });
    fireEvent.change(screen.getByLabelText(/Quantity/i), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText(/Price/i), { target: { value: '5' } });

    expect(await screen.findByText('$50.00')).toBeInTheDocument();
    expect(screen.getByText('$7.50')).toBeInTheDocument();
    expect(screen.getAllByText('$57.50').length).toBeGreaterThanOrEqual(2);

    fireEvent.click(screen.getByRole('button', { name: /Post & Send Invoice/i }));

    await waitFor(() => expect(mocks.invoiceCreate).toHaveBeenCalledWith(expect.objectContaining({
      customerId: 'cust-1',
      customerName: 'Acme Logistics',
      totalAmount: 57.5,
      items: [{ productId: 'prod-1', quantity: 10, unitPrice: 5 }],
    })));
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  test('blocks posting when the invoice breaches credit limit', async () => {
    renderForm(
      <CreditInvoiceForm initialCustomerId="cust-1" onSuccess={vi.fn()} onCancel={vi.fn()} />,
    );

    fireEvent.change(await screen.findByLabelText(/Product/i), { target: { value: 'prod-1' } });
    fireEvent.change(screen.getByLabelText(/Quantity/i), { target: { value: '1000' } });
    fireEvent.change(screen.getByLabelText(/Price/i), { target: { value: '2' } });

    expect(await screen.findByText(/CREDIT HOLD/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Post & Send Invoice/i })).toBeDisabled();
  });
});

describe('RecordPaymentForm', () => {
  test('auto-allocates payment to oldest invoices and submits allocations', async () => {
    const onSuccess = vi.fn();
    renderForm(
      <RecordPaymentForm initialCustomerId="cust-1" onSuccess={onSuccess} onCancel={vi.fn()} />,
    );

    fireEvent.change(await screen.findByLabelText(/Payment Amount/i), {
      target: { value: '100' },
    });

    expect(await screen.findByText('INV-OLD')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Apply Smart FIFO Logic/i }));

    await waitFor(() => expect(screen.getAllByText('$100').length).toBeGreaterThanOrEqual(2));
    expect(screen.getByText('$0')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Post Payment/i }));
    await waitFor(() => expect(mocks.paymentCreate).toHaveBeenCalledWith(expect.objectContaining({
      customerId: 'cust-1',
      amount: 100,
      allocations: [
        { invoiceId: 'inv-old', amount: 80 },
        { invoiceId: 'inv-new', amount: 20 },
      ],
    })));
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });
});

describe('ReceiveDeliveryForm', () => {
  test('shows empty delivery context when the selected delivery is missing', async () => {
    mocks.deliveryList.mockResolvedValueOnce([]);
    renderForm(<ReceiveDeliveryForm deliveryId="missing" onSuccess={vi.fn()} onCancel={vi.fn()} />);

    expect(await screen.findByText(/Resolving delivery context/i)).toBeInTheDocument();
  });

  test('prefills a matching tank and receives a balanced delivery', async () => {
    const onSuccess = vi.fn();
    renderForm(
      <ReceiveDeliveryForm deliveryId="delivery-1" onSuccess={onSuccess} onCancel={vi.fn()} />,
    );

    expect(await screen.findByText(/Reconciling DN-77/i)).toBeInTheDocument();
    await waitFor(() => expect(fieldByName('receivedQty')).toHaveValue(1000));
    await waitFor(() => expect(fieldByName('allocations.0.tankId')).toHaveValue('tank-1'));
    expect(fieldByName('allocations.0.quantity')).toHaveValue(1000);
    expect(screen.getByText(/Safe to discharge/i)).toBeInTheDocument();
    expect(screen.getByText(/Fully Balanced/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Commit to Stock/i }));

    await waitFor(() => expect(mocks.deliveryReceive).toHaveBeenCalledWith(
      'delivery-1',
      expect.objectContaining({
        id: 'delivery-1',
        receivedQty: 1000,
        allocations: [{ tankId: 'tank-1', quantity: 1000 }],
      }),
    ));
    expect(mocks.addToast).toHaveBeenCalledWith('Delivery saved successfully', 'success');
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  test('shows variance attribution and blocks mismatched tank allocations', async () => {
    renderForm(
      <ReceiveDeliveryForm deliveryId="delivery-1" onSuccess={vi.fn()} onCancel={vi.fn()} />,
    );

    await screen.findByText(/Reconciling DN-77/i);
    await waitFor(() => expect(fieldByName('allocations.0.quantity')).toHaveValue(1000));
    fireEvent.change(fieldByName('receivedQty'), { target: { value: '1100' } });

    expect(await screen.findByText(/Variance Attribution/i)).toBeInTheDocument();
    expect(screen.getByText(/Unallocated volume exists/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Commit to Stock/i }));

    expect(await screen.findByText(/Allocated sum .*must match received/i)).toBeInTheDocument();
    expect(mocks.deliveryReceive).not.toHaveBeenCalled();
  });

  test('supports split discharge rows, removal, and over-capacity warnings', async () => {
    renderForm(
      <ReceiveDeliveryForm deliveryId="delivery-1" onSuccess={vi.fn()} onCancel={vi.fn()} />,
    );

    await screen.findByText(/Reconciling DN-77/i);
    await waitFor(() => expect(fieldByName('allocations.0.tankId')).toHaveValue('tank-1'));
    fireEvent.change(fieldByName('allocations.0.quantity'), { target: { value: '4500' } });
    expect(await screen.findByText(/Exceeds safe capacity/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /\+ Split Discharge/i }));
    expect(fieldByName('allocations.1.quantity')).toBeInTheDocument();
    fireEvent.change(fieldByName('allocations.0.quantity'), { target: { value: '600' } });
    fireEvent.change(fieldByName('allocations.1.tankId'), { target: { value: 'tank-1' } });
    fireEvent.change(fieldByName('allocations.1.quantity'), { target: { value: '400' } });
    expect(screen.getAllByText(/Safe to discharge/i).length).toBeGreaterThanOrEqual(2);

    fireEvent.click(screen.getByRole('button', { name: /Remove Line/i }));
    expect(document.querySelector('[name="allocations.1.quantity"]')).not.toBeInTheDocument();
  });

  test('keeps allocation warning state when no matching product tank exists', async () => {
    mocks.tankList.mockResolvedValueOnce([{ ...tanks[0], id: 'tank-diesel', productId: 'prod-2' }]);

    renderForm(
      <ReceiveDeliveryForm deliveryId="delivery-1" onSuccess={vi.fn()} onCancel={vi.fn()} />,
    );

    await screen.findByText(/Reconciling DN-77/i);
    await waitFor(() => expect(fieldByName('receivedQty')).toHaveValue(1000));
    expect(fieldByName('allocations.0.tankId')).toHaveValue('');
    expect(fieldByName('allocations.0.quantity')).toHaveValue(0);
    expect(screen.getByText(/Unallocated volume exists/i)).toBeInTheDocument();
    expect(screen.queryByText(/Safe to discharge/i)).not.toBeInTheDocument();
  });
});

describe('setup and catalog forms', () => {
  test('TankForm validates level math and submits valid tank setup', async () => {
    const onSuccess = vi.fn();
    renderForm(<TankForm onSuccess={onSuccess} onCancel={vi.fn()} />);

    fireEvent.change(await screen.findByLabelText(/Tank Reference Code/i), {
      target: { value: 'TNK-NEW' },
    });
    fireEvent.change(screen.getByLabelText(/Product Mapping/i), { target: { value: 'prod-1' } });
    fireEvent.change(screen.getByLabelText(/Corporate Entity/i), {
      target: { value: 'company-1' },
    });
    fireEvent.change(screen.getByLabelText(/Operational Station/i), {
      target: { value: 'station-1' },
    });
    fireEvent.change(await screen.findByLabelText(/Station Branch/i), {
      target: { value: 'branch-1' },
    });
    fireEvent.change(screen.getByLabelText(/Safe Fill Threshold/i), {
      target: { value: '12000' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Commit Setup/i }));
    expect(await screen.findByText(/Max level cannot exceed tank capacity/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Safe Fill Threshold/i), {
      target: { value: '4500' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Commit Setup/i }));

    await waitFor(() => expect(mocks.setupTanksCreate).toHaveBeenCalledWith(expect.objectContaining({
      code: 'TNK-NEW',
      branchId: 'branch-1',
      maxLevel: 4500,
    })));
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  test('GeneralSetupForm creates a station with selected parent company', async () => {
    const onSuccess = vi.fn();
    renderForm(
      <GeneralSetupForm entityName="Station" onSuccess={onSuccess} onCancel={vi.fn()} />,
    );

    fireEvent.change(await screen.findByLabelText(/Parent Company/i), {
      target: { value: 'company-1' },
    });
    fireEvent.change(screen.getByLabelText(/Station Official Name/i), {
      target: { value: '  Uptown Station  ' },
    });
    fireEvent.change(screen.getByLabelText(/Internal Reference Code/i), {
      target: { value: '  UPT  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Commit Entry/i }));

    await waitFor(() => expect(mocks.setupStationsCreate).toHaveBeenCalledWith({
      companyId: 'company-1',
      code: 'UPT',
      name: 'Uptown Station',
      status: 'active',
    }));
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  test('GeneralSetupForm creates a company with selected currency and inactive status', async () => {
    const onSuccess = vi.fn();
    renderForm(
      <GeneralSetupForm entityName="Company" onSuccess={onSuccess} onCancel={vi.fn()} />,
    );

    fireEvent.change(screen.getByLabelText(/Company Official Name/i), {
      target: { value: '  Regional Holdings  ' },
    });
    fireEvent.change(screen.getByLabelText(/Internal Reference Code/i), {
      target: { value: '  RH  ' },
    });
    fireEvent.change(screen.getByLabelText(/Default Currency/i), {
      target: { value: 'KES' },
    });
    fireEvent.change(screen.getByLabelText(/Initial State/i), {
      target: { value: 'inactive' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Commit Entry/i }));

    await waitFor(() => expect(mocks.setupCompaniesCreate).toHaveBeenCalledWith({
      code: 'RH',
      name: 'Regional Holdings',
      currency: 'KES',
      status: 'inactive',
    }));
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  test('GeneralSetupForm updates company data in edit mode', async () => {
    const onSuccess = vi.fn();
    renderForm(
      <GeneralSetupForm
        entityName="Company"
        initialData={{
          id: 'company-edit',
          name: 'IFMS Energy',
          code: 'IFMS',
          currency: 'USD',
          status: 'active',
        }}
        onSuccess={onSuccess}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText(/Edit Company/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save Changes/i })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Default Currency/i), {
      target: { value: 'ZAR' },
    });
    fireEvent.change(screen.getByLabelText(/Initial State/i), {
      target: { value: 'inactive' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

    await waitFor(() => expect(mocks.setupCompaniesUpdate).toHaveBeenCalledWith('company-edit', {
      code: 'IFMS',
      name: 'IFMS Energy',
      currency: 'ZAR',
      status: 'inactive',
    }));
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  test('GeneralSetupForm falls back to the first parent station when creating a branch', async () => {
    const onSuccess = vi.fn();
    mocks.setupStationsList.mockReturnValueOnce(stations);
    renderForm(
      <GeneralSetupForm entityName="Branch" onSuccess={onSuccess} onCancel={vi.fn()} />,
    );

    await screen.findByRole('option', { name: 'Downtown Station' });
    fireEvent.change(screen.getByLabelText(/Branch Official Name/i), {
      target: { value: '  Forecourt Branch  ' },
    });
    fireEvent.change(screen.getByLabelText(/Internal Reference Code/i), {
      target: { value: '  FCT  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Commit Entry/i }));

    await waitFor(() => expect(mocks.setupBranchesCreate).toHaveBeenCalledWith({
      stationId: 'station-1',
      code: 'FCT',
      name: 'Forecourt Branch',
      status: 'active',
    }));
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  test('GeneralSetupForm updates a station using the first company fallback', async () => {
    const onSuccess = vi.fn();
    mocks.setupCompaniesList.mockReturnValueOnce(companies);
    renderForm(
      <GeneralSetupForm
        entityName="Station"
        initialData={{
          id: 'station-edit',
          name: 'Legacy Station',
          code: 'LEG',
          status: 'active',
        }}
        onSuccess={onSuccess}
        onCancel={vi.fn()}
      />,
    );

    await screen.findByRole('option', { name: 'IFMS Energy' });
    fireEvent.change(screen.getByLabelText(/Station Official Name/i), {
      target: { value: 'Legacy Station East' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

    await waitFor(() => expect(mocks.setupStationsUpdate).toHaveBeenCalledWith('station-edit', {
      companyId: 'company-1',
      code: 'LEG',
      name: 'Legacy Station East',
      status: 'active',
    }));
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  test('GeneralSetupForm reports missing station parent data', async () => {
    mocks.setupCompaniesList.mockResolvedValueOnce([]);
    renderForm(
      <GeneralSetupForm entityName="Station" onSuccess={vi.fn()} onCancel={vi.fn()} />,
    );

    fireEvent.change(screen.getByLabelText(/Station Official Name/i), {
      target: { value: 'Unassigned Station' },
    });
    fireEvent.change(screen.getByLabelText(/Internal Reference Code/i), {
      target: { value: 'UNASSIGNED' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Commit Entry/i }));

    await waitFor(() =>
      expect(mocks.addToast).toHaveBeenCalledWith(
        'Select a company before creating a station.',
        'error',
      ),
    );
    expect(mocks.setupStationsCreate).not.toHaveBeenCalled();
  });

  test('NozzleSetupForm loads station-scoped hardware and creates mapping', async () => {
    const onSuccess = vi.fn();
    renderForm(<NozzleSetupForm onSuccess={onSuccess} onCancel={vi.fn()} />);

    fireEvent.change(await screen.findByLabelText(/Station Assignment/i), {
      target: { value: 'station-1' },
    });
    await screen.findByRole('option', { name: 'PMP-1' });
    fireEvent.change(fieldByName('pumpId'), { target: { value: 'pump-1' } });
    expect(fieldByName('pumpId')).toHaveValue('pump-1');
    fireEvent.change(fieldByName('nozzleCode'), {
      target: { value: 'N-01-A' },
    });
    fireEvent.change(fieldByName('productId'), {
      target: { value: 'prod-1' },
    });
    await screen.findByRole('option', { name: /TNK-1/ });
    fireEvent.change(fieldByName('tankId'), {
      target: { value: 'tank-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Activate Mapping/i }));

    await waitFor(() => expect(mocks.setupNozzlesCreate).toHaveBeenCalledWith(expect.objectContaining({
      stationId: 'station-1',
      pumpId: 'pump-1',
      nozzleCode: 'N-01-A',
      tankId: 'tank-1',
    })));
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  test('ProductForm enables saving after valid product details are entered', async () => {
    const onSuccess = vi.fn();
    renderForm(<ProductForm onSuccess={onSuccess} onCancel={vi.fn()} />);

    await screen.findByRole('option', { name: 'IFMS Energy' });
    fireEvent.change(fieldByName('companyId'), {
      target: { value: 'company-1' },
    });
    fireEvent.change(fieldByName('code'), { target: { value: 'UL95' } });
    fireEvent.change(fieldByName('name'), { target: { value: 'Unleaded 95' } });
    fireEvent.change(fieldByName('category'), { target: { value: 'Fuel' } });
    fireEvent.change(fieldByName('pricePerUnit'), { target: { value: '2.5' } });
    const submit = screen.getByRole('button', { name: /Save Product/i });
    await waitFor(() => expect(submit).toBeEnabled());
    expect(fieldByName('code')).toHaveValue('UL95');
    expect(fieldByName('name')).toHaveValue('Unleaded 95');
  });

  test('ProductForm validates required catalog fields before submit', async () => {
    renderForm(<ProductForm onSuccess={vi.fn()} onCancel={vi.fn()} />);

    await screen.findByRole('option', { name: 'IFMS Energy' });
    fireEvent.change(fieldByName('companyId'), {
      target: { value: 'company-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save Product/i }));

    expect(await screen.findByText(/Code is required/i)).toBeInTheDocument();
    expect(screen.getByText(/Name is required/i)).toBeInTheDocument();
    expect(screen.getByText(/Category is required/i)).toBeInTheDocument();
    expect(mocks.setupProductsCreate).not.toHaveBeenCalled();
  });

  test('ProductForm submits alternate category, unit, and inactive status', async () => {
    const onSuccess = vi.fn();
    renderForm(<ProductForm onSuccess={onSuccess} onCancel={vi.fn()} />);

    await screen.findByRole('option', { name: 'IFMS Energy' });
    fireEvent.change(fieldByName('companyId'), {
      target: { value: 'company-1' },
    });
    fireEvent.change(fieldByName('code'), { target: { value: 'LUBE-1' } });
    fireEvent.change(fieldByName('name'), { target: { value: 'Synthetic Oil' } });
    fireEvent.change(fieldByName('category'), { target: { value: 'Lubricant' } });
    fireEvent.change(fieldByName('pricePerUnit'), { target: { value: '13' } });
    fireEvent.change(fieldByName('unit'), { target: { value: 'Bottle' } });
    fireEvent.change(fieldByName('status'), { target: { value: 'inactive' } });
    const submit = screen.getByRole('button', { name: /Save Product/i });
    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.click(submit);

    await waitFor(() => expect(mocks.setupProductsCreate).toHaveBeenCalledWith({
      companyId: 'company-1',
      code: 'LUBE-1',
      name: 'Synthetic Oil',
      category: 'Lubricant',
      pricePerUnit: 13,
      unit: 'Bottle',
      status: 'inactive',
    }));
    expect(mocks.addToast).toHaveBeenCalledWith('Product saved successfully', 'success');
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  test('ProductForm renders edit mode defaults and reports create failures', async () => {
    mocks.setupProductsCreate.mockRejectedValueOnce({
      apiError: { message: 'Duplicate product code' },
    });
    const onSuccess = vi.fn();
    renderForm(
      <ProductForm
        initialData={{
          companyId: 'company-1',
          code: 'DSL',
          name: 'Diesel',
          category: 'Fuel',
          pricePerUnit: 3,
          unit: 'L',
          status: 'active',
        }}
        onSuccess={onSuccess}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText(/Edit Product/i)).toBeInTheDocument();
    expect(fieldByName('code')).toHaveValue('DSL');
    expect(screen.getByRole('button', { name: /Save Product/i })).toBeDisabled();

    fireEvent.change(fieldByName('pricePerUnit'), { target: { value: '4' } });
    const submit = screen.getByRole('button', { name: /Save Product/i });
    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.click(submit);

    await waitFor(() =>
      expect(mocks.addToast).toHaveBeenCalledWith('Duplicate product code', 'error'),
    );
    expect(onSuccess).not.toHaveBeenCalled();
  });
});

describe('delivery, cash, and expense forms', () => {
  test('CreateDeliveryForm displays supplier risk insight and creates delivery order', async () => {
    const onSuccess = vi.fn();
    renderForm(<CreateDeliveryForm onSuccess={onSuccess} onCancel={vi.fn()} />);

    fireEvent.change(await screen.findByLabelText(/Vendor \/ Supplier/i), {
      target: { value: 'supplier-risk' },
    });
    expect(await screen.findByText(/High historical shrinkage/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Vehicle Reg No/i), { target: { value: 'KAA-123' } });
    fireEvent.change(screen.getByLabelText(/Vendor DN Reference/i), {
      target: { value: 'DN-NEW' },
    });
    fireEvent.change(screen.getByLabelText(/Vehicle Driver/i), {
      target: { value: 'Jane Driver' },
    });
    fireEvent.change(screen.getByLabelText(/Discharge Product/i), {
      target: { value: 'prod-1' },
    });
    fireEvent.change(screen.getByLabelText(/Ordered Volume/i), { target: { value: '2000' } });
    fireEvent.click(screen.getByRole('button', { name: /Activate Order/i }));

    await waitFor(() => expect(mocks.deliveryCreate).toHaveBeenCalledWith(expect.objectContaining({
      supplierId: 'supplier-risk',
      deliveryNote: 'DN-NEW',
      orderedQty: 2000,
    })));
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  test('PettyCashForm toggles top-up mode and records transaction', async () => {
    const onSuccess = vi.fn();
    renderForm(<PettyCashForm onSuccess={onSuccess} onCancel={vi.fn()} />);

    expect(await screen.findByText('$250')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Top-up$/i }));
    expect(screen.getByLabelText(/Funding Origin/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Transactional Value/i), { target: { value: '75' } });
    fireEvent.change(screen.getByLabelText(/Funding Origin/i), { target: { value: 'Bank' } });
    fireEvent.change(screen.getByLabelText(/Audit Narrative/i), {
      target: { value: 'Manager replenished the safe' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Confirm Top-up/i }));

    await waitFor(() => expect(mocks.pettyCashTransact).toHaveBeenCalledWith(expect.objectContaining({
      type: 'Top-up',
      amount: 75,
      source: 'Bank',
    })));
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  test('ExpenseForm shows validation banner then records a valid expense', async () => {
    const onSuccess = vi.fn();
    renderForm(<ExpenseForm onSuccess={onSuccess} onCancel={vi.fn()} />);

    fireEvent.change(fieldByName('description'), {
      target: { value: 'x' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Record Expense/i }));
    expect(await screen.findByText(/Please fix the highlighted fields/i)).toBeInTheDocument();

    fireEvent.change(fieldByName('category'), { target: { value: 'Maintenance' } });
    fireEvent.change(fieldByName('amount'), { target: { value: '30' } });
    fireEvent.change(fieldByName('description'), {
      target: { value: 'Printer ink replacement' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Record Expense/i }));

    await waitFor(() => expect(mocks.expenseCreate).toHaveBeenCalledWith(expect.objectContaining({
      category: 'Maintenance',
      amount: 30,
      description: 'Printer ink replacement',
      paymentSource: 'Petty Cash',
    })));
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });
});
