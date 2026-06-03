import { describe, test, expect, vi, beforeEach } from 'vitest';

// --- Mock the API + store layers (owned elsewhere — stub, don't test) ---
vi.mock('./api/client', () => ({
  apiFetch: vi.fn(),
}));

vi.mock('./api/setup', () => {
  const make = () => ({ list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() });
  return {
    apiSetup: {
      companies: make(),
      stations: make(),
      branches: make(),
      products: make(),
      tanks: make(),
      pumps: make(),
      nozzles: make(),
    },
  };
});

vi.mock('./api/governance', () => ({
  apiGovernance: { listApprovals: vi.fn() },
}));

vi.mock('../store', () => ({
  useReportsStore: { getState: vi.fn(() => ({ stationId: null })) },
}));

import { apiFetch } from './api/client';
import { apiSetup } from './api/setup';
import { apiGovernance } from './api/governance';
import { useReportsStore } from '../store';
import {
  resetRepositoryCaches,
  supplierRepo,
  productRepo,
  tankRepo,
  customerRepo,
  invoiceRepo,
  paymentRepo,
  expenseRepo,
  pettyCashRepo,
  deliveryRepo,
  nozzleRepo,
  shiftRepo,
  saleRepo,
  dipRepo,
  reconciliationRepo,
  varianceRepo,
  transferRepo,
  adjustmentRepo,
  supplierInvoiceRepo,
  payablesAgingRepo,
  creditAgingRepo,
  expenseCategoryRepo,
} from './repositories';

const mockApiFetch = apiFetch as unknown as ReturnType<typeof vi.fn>;
const mockSetup = apiSetup as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;
const mockGovernance = apiGovernance as unknown as { listApprovals: ReturnType<typeof vi.fn> };
const mockStore = useReportsStore as unknown as { getState: ReturnType<typeof vi.fn> };

// Helper: build a ListResponse page envelope.
function page<T>(data: T[], total: number) {
  return { data, meta: { page: 1, pageSize: 100, total } };
}

// Default context wiring used by repos that call getDefaultContext().
function wireDefaultContext() {
  mockSetup.stations.list.mockResolvedValue([{ id: 's1', companyId: 'c1' }]);
  mockSetup.branches.list.mockResolvedValue([{ id: 'b1', stationId: 's1' }]);
}

beforeEach(() => {
  vi.clearAllMocks();
  resetRepositoryCaches();
  mockStore.getState.mockReturnValue({ stationId: null });
});

describe('listAll pagination (via supplierRepo.list)', () => {
  test('stops after a short page and concatenates all rows', async () => {
    // total=150 but second page is short (50 < 100) → loop terminates.
    mockApiFetch
      .mockResolvedValueOnce(page(Array.from({ length: 100 }, (_, i) => ({ id: `s${i}`, name: 'n', category: null, avgVariance: null, rating: null })), 150))
      .mockResolvedValueOnce(page(Array.from({ length: 50 }, (_, i) => ({ id: `s${100 + i}`, name: 'n', category: null, avgVariance: null, rating: null })), 150));

    const rows = await supplierRepo.list();
    expect(rows).toHaveLength(150);
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
    // Verify page param incremented.
    expect(mockApiFetch.mock.calls[0][0]).toContain('page=1');
    expect(mockApiFetch.mock.calls[1][0]).toContain('page=2');
  });

  test('stops when an empty page is returned even if total claims more', async () => {
    mockApiFetch
      .mockResolvedValueOnce(page(Array.from({ length: 100 }, (_, i) => ({ id: `s${i}`, name: 'n', category: null, avgVariance: null, rating: null })), 999))
      .mockResolvedValueOnce(page([], 999));
    const rows = await supplierRepo.list();
    expect(rows).toHaveLength(100);
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
  });

  test('stops once accumulated rows reach total', async () => {
    mockApiFetch.mockResolvedValueOnce(page(
      Array.from({ length: 100 }, (_, i) => ({ id: `s${i}`, name: 'n', category: null, avgVariance: null, rating: null })),
      100,
    ));
    const rows = await supplierRepo.list();
    expect(rows).toHaveLength(100);
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
  });
});

describe('supplierRepo.list mapping', () => {
  test('applies defaults and normalizes rating', async () => {
    mockApiFetch.mockResolvedValueOnce(page([
      { id: 's1', name: 'Top', category: null, avgVariance: null, rating: 'elite' },
      { id: 's2', name: 'Mid', category: 'Fuel', avgVariance: '2.5', rating: 'at risk' },
      { id: 's3', name: 'Low', category: null, avgVariance: null, rating: null },
    ], 3));
    const rows = await supplierRepo.list();
    expect(rows[0]).toEqual({ id: 's1', name: 'Top', category: 'General', avgVariance: 0, rating: 'Elite' });
    expect(rows[1]).toEqual({ id: 's2', name: 'Mid', category: 'Fuel', avgVariance: 2.5, rating: 'At Risk' });
    expect(rows[2].rating).toBe('Standard');
  });

  test('propagates API errors', async () => {
    mockApiFetch.mockRejectedValueOnce(new Error('network down'));
    await expect(supplierRepo.list()).rejects.toThrow('network down');
  });
});

describe('productRepo', () => {
  test('list maps via mapApiProduct (coerces price string)', async () => {
    mockSetup.products.list.mockResolvedValue([
      { id: 'p1', name: 'Diesel', pricePerUnit: '99.9', category: 'Fuel' },
    ]);
    const rows = await productRepo.list();
    expect(rows).toEqual([{ id: 'p1', name: 'Diesel', pricePerUnit: 99.9, category: 'Fuel' }]);
  });

  test('create defaults unit/status and resolves companyId from default context', async () => {
    wireDefaultContext();
    mockSetup.products.create.mockResolvedValue({ id: 'p2', name: 'Petrol', pricePerUnit: '150', category: 'Fuel' });
    const created = await productRepo.create({ code: 'P', name: 'Petrol', category: 'Fuel', pricePerUnit: '150' });
    expect(mockSetup.products.create).toHaveBeenCalledWith(expect.objectContaining({
      companyId: 'c1', unit: 'litre', status: 'active', pricePerUnit: 150,
    }));
    expect(created.pricePerUnit).toBe(150);
  });
});

describe('tankRepo', () => {
  test('list maps via mapApiTank with null fallbacks', async () => {
    mockSetup.tanks.list.mockResolvedValue([
      {
        id: 't1', companyId: 'c1', stationId: 's1', branchId: 'b1', code: 'T1',
        productId: null, capacity: '1000', minLevel: '10', maxLevel: '900',
        calibrationProfile: null, currentLevel: '500',
      },
    ]);
    const rows = await tankRepo.list('s1');
    expect(mockSetup.tanks.list).toHaveBeenCalledWith('s1');
    expect(rows[0]).toMatchObject({ productId: '', calibrationProfile: '', capacity: 1000, currentLevel: 500 });
  });

  test('create stamps stationId from input onto the mapped tank', async () => {
    mockSetup.tanks.create.mockResolvedValue({
      id: 't2', companyId: 'c1', branchId: 'b1', code: 'T2', productId: null,
      capacity: '2000', minLevel: '0', maxLevel: '1800', calibrationProfile: null, currentLevel: '0',
    });
    const created = await tankRepo.create({
      companyId: 'c1', branchId: 'b1', stationId: 'sX', code: 'T2',
      capacity: 2000, minLevel: 0, maxLevel: 1800,
    });
    expect(created.stationId).toBe('sX');
  });
});

describe('customerRepo', () => {
  test('list maps nullable contacts to undefined and lowercases status', async () => {
    mockApiFetch.mockResolvedValueOnce(page([
      { id: 'cu1', name: 'Jane', phone: null, email: null, address: null, taxId: null, creditLimit: '1000', paymentTerms: 'net30', status: 'suspended', balance: '-50' },
    ], 1));
    const rows = await customerRepo.list();
    expect(rows[0]).toEqual({
      id: 'cu1', name: 'Jane', phone: undefined, email: undefined, address: undefined,
      taxId: undefined, creditLimit: 1000, paymentTerms: 'net30', status: 'Suspended', balance: -50,
    });
  });

  test('create generates a code, defaults paymentTerms, and maps isActive=false to suspended', async () => {
    wireDefaultContext();
    mockApiFetch.mockResolvedValueOnce({
      id: 'cu2', name: 'Bob', phone: null, email: null, address: null, taxId: null,
      creditLimit: '0', paymentTerms: 'net30', status: 'suspended', balance: '0',
    });
    await customerRepo.create({ name: 'Bob', creditLimit: 0, isActive: false });
    const body = (mockApiFetch.mock.calls[0][1] as { body: Record<string, unknown> }).body;
    expect(body.status).toBe('suspended');
    expect(body.paymentTerms).toBe('net30');
    expect(String(body.code)).toMatch(/^CUST-/);
    expect(body.branchId).toBe('b1');
  });

  test('get returns mapped customer', async () => {
    mockApiFetch.mockResolvedValueOnce({
      id: 'cu3', name: 'Amy', phone: '123', email: 'a@b.co', address: null, taxId: null,
      creditLimit: '500', paymentTerms: 'net15', status: 'active', balance: '12.5',
    });
    const c = await customerRepo.get('cu3');
    expect(c).toMatchObject({ id: 'cu3', phone: '123', email: 'a@b.co', status: 'Active', balance: 12.5 });
  });
});

describe('invoiceRepo', () => {
  test('list normalizes dates to YYYY-MM-DD and maps status', async () => {
    mockApiFetch.mockResolvedValueOnce(page([
      { id: 'i1', invoiceNumber: 'INV-1', customerId: 'cu1', invoiceDate: '2026-03-15T10:00:00.000Z', dueDate: '2026-04-15T00:00:00.000Z', status: 'partial', totalAmount: '200', balanceRemaining: '50' },
    ], 1));
    const rows = await invoiceRepo.list('cu1');
    expect(rows[0].date).toBe('2026-03-15');
    expect(rows[0].dueDate).toBe('2026-04-15');
    expect(rows[0].status).toBe('Partial');
    // customerId filter forwarded as query param.
    expect(mockApiFetch.mock.calls[0][0]).toContain('customerId=cu1');
  });

  test('getUnpaid filters out Paid and zero-balance invoices', async () => {
    mockApiFetch.mockResolvedValueOnce(page([
      { id: 'i1', invoiceNumber: 'A', customerId: 'cu1', invoiceDate: '2026-01-01', dueDate: '2026-02-01', status: 'paid', totalAmount: '100', balanceRemaining: '0' },
      { id: 'i2', invoiceNumber: 'B', customerId: 'cu1', invoiceDate: '2026-01-01', dueDate: '2026-02-01', status: 'unpaid', totalAmount: '100', balanceRemaining: '100' },
      { id: 'i3', invoiceNumber: 'C', customerId: 'cu1', invoiceDate: '2026-01-01', dueDate: '2026-02-01', status: 'partial', totalAmount: '100', balanceRemaining: '0' },
    ], 3));
    const rows = await invoiceRepo.getUnpaid('cu1');
    expect(rows.map((r) => r.id)).toEqual(['i2']);
  });
});

describe('paymentRepo', () => {
  test('create maps UI method to API token and coerces amount', async () => {
    mockApiFetch.mockResolvedValueOnce({
      id: 'pay1', customerId: 'cu1', amount: '100', method: 'bank_transfer', paymentDate: '2026-01-01T00:00:00.000Z', referenceNo: null,
    });
    const created = await paymentRepo.create({ customerId: 'cu1', amount: '100', method: 'Bank Transfer', date: '2026-01-01' });
    const body = (mockApiFetch.mock.calls[0][1] as { body: Record<string, unknown> }).body;
    expect(body.method).toBe('bank_transfer');
    expect(body.amount).toBe(100);
    expect(created.date).toBe('2026-01-01');
    expect(created.allocations).toEqual([]);
  });

  test('create falls back to slugified method for unknown UI labels', async () => {
    mockApiFetch.mockResolvedValueOnce({
      id: 'pay2', customerId: 'cu1', amount: '5', method: 'mobile_money', paymentDate: '2026-01-01', referenceNo: 'R1',
    });
    await paymentRepo.create({ customerId: 'cu1', amount: 5, method: 'Mobile Money', date: '2026-01-01' });
    const body = (mockApiFetch.mock.calls[0][1] as { body: Record<string, unknown> }).body;
    expect(body.method).toBe('mobile_money');
  });
});

describe('expenseRepo.list', () => {
  test('joins the latest governance approval per expense entry', async () => {
    // First two apiFetch calls are the two listAll loops (expense-entries, then approvals).
    mockApiFetch
      .mockResolvedValueOnce(page([
        { id: 'e1', branchId: 'b1', category: 'Fuel', amount: '100', vendor: 'V', paymentMethod: 'petty_cash', description: null, billableDepartment: null, attachmentName: null, rejectionReason: null, status: 'pending_approval', createdAt: '2026-01-01T00:00:00.000Z' },
      ], 1))
      .mockResolvedValueOnce(page([
        { id: 'a-old', entityId: 'e1', entityType: 'expense_entry', status: 'approved', requestedAt: '2026-01-01T00:00:00.000Z' },
        { id: 'a-new', entityId: 'e1', entityType: 'expense_entry', status: 'pending', requestedAt: '2026-02-01T00:00:00.000Z' },
      ], 2));

    const rows = await expenseRepo.list();
    expect(rows[0].paymentMethod).toBe('Petty Cash');
    expect(rows[0].status).toBe('Submitted');
    // Latest approval (by requestedAt) wins.
    expect(rows[0].governanceApprovalRequestId).toBe('a-new');
    expect(rows[0].governanceApprovalStatus).toBe('pending');
  });
});

describe('expenseRepo.create governance handling', () => {
  test('rethrows enriched error carrying approvalRequestId when submit is blocked', async () => {
    wireDefaultContext();
    // create draft succeeds
    mockApiFetch.mockResolvedValueOnce({
      id: 'e9', branchId: 'b1', category: 'Fuel', amount: '100', vendor: 'V', paymentMethod: 'petty_cash', description: null, billableDepartment: null, attachmentName: null, rejectionReason: null, status: 'draft', createdAt: '2026-01-01T00:00:00.000Z',
    });
    // submit rejects with nested governance details
    mockApiFetch.mockRejectedValueOnce(Object.assign(new Error('blocked'), {
      statusCode: 409,
      apiError: { details: { message: { message: 'Needs approval', approvalRequestId: 'req-1' } } },
    }));

    await expect(
      expenseRepo.create({ category: 'Fuel', amount: 100, vendor: 'V', paymentMethod: 'Petty Cash' }),
    ).rejects.toMatchObject({
      message: 'Needs approval',
      apiError: { approvalRequestId: 'req-1' },
    });
  });

  test('attaches governance approval when submitted status is pending_approval', async () => {
    wireDefaultContext();
    mockApiFetch
      .mockResolvedValueOnce({ id: 'e10', branchId: 'b1', category: 'Fuel', amount: '100', vendor: 'V', paymentMethod: 'petty_cash', description: null, billableDepartment: null, attachmentName: null, rejectionReason: null, status: 'draft', createdAt: '2026-01-01T00:00:00.000Z' })
      .mockResolvedValueOnce({ id: 'e10', branchId: 'b1', category: 'Fuel', amount: '100', vendor: 'V', paymentMethod: 'petty_cash', description: null, billableDepartment: null, attachmentName: null, rejectionReason: null, status: 'pending_approval', createdAt: '2026-01-01T00:00:00.000Z' });
    mockGovernance.listApprovals.mockResolvedValue([
      { id: 'g1', entityId: 'e10', status: 'pending', requestedAt: '2026-02-01T00:00:00.000Z' },
    ]);

    const created = await expenseRepo.create({ category: 'Fuel', amount: 100, vendor: 'V', paymentMethod: 'Petty Cash' });
    expect(created.governanceApprovalRequestId).toBe('g1');
    expect(created.governanceApprovalStatus).toBe('pending');
    expect(created.paymentMethod).toBe('Petty Cash');
  });
});

describe('pettyCashRepo', () => {
  test('getBalance prefers the top-level balance field', async () => {
    wireDefaultContext();
    mockApiFetch.mockResolvedValueOnce({ data: [{ id: 'l1', balanceAfter: '500' }], meta: {}, balance: 1234 });
    expect(await pettyCashRepo.getBalance()).toBe(1234);
  });

  test('getBalance falls back to first row balanceAfter, else 0', async () => {
    wireDefaultContext();
    mockApiFetch.mockResolvedValueOnce({ data: [{ id: 'l1', balanceAfter: '500' }], meta: {} });
    expect(await pettyCashRepo.getBalance()).toBe(500);

    resetRepositoryCaches();
    wireDefaultContext();
    mockApiFetch.mockResolvedValueOnce({ data: [], meta: {} });
    expect(await pettyCashRepo.getBalance()).toBe(0);
  });

  test('transact picks the topup path and maps transactionType', async () => {
    wireDefaultContext();
    mockApiFetch.mockResolvedValueOnce({ id: 'tx1', transactionType: 'topup', amount: '50', category: null, notes: 'n', balanceAfter: '550', createdAt: '2026-01-01T00:00:00.000Z' });
    const tx = await pettyCashRepo.transact({ type: 'Top-up', amount: 50, notes: 'n' });
    expect(mockApiFetch.mock.calls[0][0]).toBe('petty-cash/topup');
    expect(tx.type).toBe('Top-up');
    expect(tx.category).toBeUndefined();
  });
});

describe('deliveryRepo.list', () => {
  test('maps nullable fields, optional numeric GRN values, and status', async () => {
    mockApiFetch.mockResolvedValueOnce(page([
      { id: 'd1', supplierId: null, deliveryNote: 'DN', vehicleNo: null, driverName: null, productId: null, orderedQty: '1000', expectedDate: '2026-01-10T00:00:00.000Z', receivedQty: null, density: null, temperature: null, status: 'PENDING', createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'd2', supplierId: 's1', deliveryNote: 'DN2', vehicleNo: 'KAA', driverName: 'Bob', productId: 'p1', orderedQty: '500', expectedDate: '2026-01-10T00:00:00.000Z', receivedQty: '480', density: '0.84', temperature: '25', status: 'completed', createdAt: '2026-01-01T00:00:00.000Z' },
    ], 2));
    const rows = await deliveryRepo.list();
    expect(rows[0]).toMatchObject({ supplierId: '', vehicleNo: '', driverName: '', productId: '', status: 'Pending', receivedQty: undefined });
    expect(rows[0].expectedDate).toBe('2026-01-10');
    expect(rows[1]).toMatchObject({ status: 'Completed', receivedQty: 480, density: 0.84, temperature: 25 });
  });
});

describe('nozzleRepo', () => {
  test('list maps status to UI enum', async () => {
    mockSetup.nozzles.list.mockResolvedValue([
      { id: 'n1', stationId: 's1', pumpCode: 'P1', nozzleCode: 'N1', productId: 'p1', tankId: 't1', status: 'inactive' },
    ]);
    const rows = await nozzleRepo.list('s1');
    expect(rows[0].status).toBe('Inactive');
  });

  test('create throws when pumpId is missing', async () => {
    await expect(nozzleRepo.create({ stationId: 's1', nozzleCode: 'N1' })).rejects.toThrow('Pump is required');
    expect(mockSetup.nozzles.create).not.toHaveBeenCalled();
  });
});

describe('shiftRepo', () => {
  test('list maps status and dates, defaulting cashierId', async () => {
    mockApiFetch.mockResolvedValueOnce(page([
      { id: 'sh1', stationId: 's1', startTime: '2026-01-01T08:00:00.000Z', endTime: null, status: 'OPEN', openedBy: null },
    ], 1));
    const rows = await shiftRepo.list();
    expect(rows[0].status).toBe('open');
    expect(rows[0].cashierId).toBe('');
    expect(rows[0].endTime).toBeUndefined();
  });

  test('getOpen returns null when there is no open shift', async () => {
    mockApiFetch.mockResolvedValueOnce(page([], 0));
    expect(await shiftRepo.getOpen('s1')).toBeNull();
  });

  test('getOpen resolves nozzle codes for opening readings', async () => {
    // 1) listAll shifts page, 2) shift detail fetch
    mockApiFetch
      .mockResolvedValueOnce(page([{ id: 'sh1', stationId: 's1', startTime: '2026-01-01T08:00:00.000Z', endTime: null, status: 'open', openedBy: 'u1' }], 1))
      .mockResolvedValueOnce({ id: 'sh1', stationId: 's1', startTime: '2026-01-01T08:00:00.000Z', endTime: null, openedBy: 'u1', openingMeterReadings: [{ nozzleId: 'n1', value: '100', pricePerUnit: '2.5' }] });
    mockSetup.nozzles.list.mockResolvedValue([
      { id: 'n1', stationId: 's1', pumpCode: 'P1', nozzleCode: 'N1', productId: 'p1', tankId: 't1', status: 'active' },
    ]);

    const open = await shiftRepo.getOpen('s1');
    expect(open?.cashierId).toBe('u1');
    expect(open?.readings[0]).toEqual({ nozzleId: 'n1', nozzleCode: 'P1-N1', openingReading: 100, pricePerUnit: 2.5 });
  });
});

describe('saleRepo.create', () => {
  test('throws when nozzleId is missing', async () => {
    wireDefaultContext();
    await expect(saleRepo.create({ productId: 'p1', quantity: 1, pricePerUnit: 1, payment: { cash: 1 } })).rejects.toThrow('Nozzle is required');
  });

  test('builds payments array filtering zero amounts and echoes payment breakdown', async () => {
    wireDefaultContext();
    mockApiFetch.mockResolvedValueOnce({ id: 'sale1', transactionDate: '2026-01-01T00:00:00.000Z', totalAmount: '250', payments: [{ paymentMethod: 'Card', amount: '250' }] });
    const sale = await saleRepo.create({ nozzleId: 'n1', productId: 'p1', quantity: 10, pricePerUnit: 25, payment: { card: 250, cash: 0 } });
    const body = (mockApiFetch.mock.calls[mockApiFetch.mock.calls.length - 1][1] as { body: { payments: Array<{ paymentMethod: string }> } }).body;
    expect(body.payments).toEqual([{ paymentMethod: 'Card', amount: 250 }]);
    expect(sale.paymentType).toBe('Card');
    expect(sale.payment).toEqual({ cash: 0, card: 250, mobile: 0, voucher: 0 });
  });
});

describe('default context caching + station selection', () => {
  test('caches context across calls, then invalidates when selected station changes', async () => {
    mockSetup.stations.list.mockResolvedValue([
      { id: 's1', companyId: 'c1' },
      { id: 's2', companyId: 'c2' },
    ]);
    mockSetup.branches.list.mockResolvedValue([
      { id: 'b1', stationId: 's1' },
      { id: 'b2', stationId: 's2' },
    ]);
    mockApiFetch.mockResolvedValue({ data: [], meta: {}, balance: 0 });

    // First call: no station selected → picks first station/branch (c1/b1).
    await pettyCashRepo.getBalance();
    const callsAfterFirst = mockSetup.stations.list.mock.calls.length;

    // Second call with same selection → uses cache (no extra setup fetches).
    await pettyCashRepo.getBalance();
    expect(mockSetup.stations.list.mock.calls.length).toBe(callsAfterFirst);

    // Change selected station → cache invalidated, branch b2/company c2 chosen.
    mockStore.getState.mockReturnValue({ stationId: 's2' });
    await pettyCashRepo.getBalance();
    expect(mockSetup.stations.list.mock.calls.length).toBe(callsAfterFirst + 1);
    const lastUrl = mockApiFetch.mock.calls[mockApiFetch.mock.calls.length - 1][0] as string;
    expect(lastUrl).toContain('companyId=c2');
    expect(lastUrl).toContain('branchId=b2');
  });

  test('throws a helpful error when no branches exist', async () => {
    mockSetup.stations.list.mockResolvedValue([{ id: 's1', companyId: 'c1' }]);
    mockSetup.branches.list.mockResolvedValue([]);
    await expect(pettyCashRepo.getBalance()).rejects.toThrow(/No branches found/);
  });
});

describe('dipRepo.list', () => {
  test('coerces volumes and maps nullable water/temperature', async () => {
    mockApiFetch.mockResolvedValueOnce(page([
      { id: 'dip1', tankId: 't1', dipDate: '2026-01-01T00:00:00.000Z', volume: '900', waterLevel: null, temperature: '20' },
    ], 1));
    const rows = await dipRepo.list();
    expect(rows[0]).toEqual({ id: 'dip1', tankId: 't1', dipDate: '2026-01-01', volume: 900, waterLevel: null, temperature: 20 });
  });
});

describe('deliveryRepo write paths', () => {
  test('create uses default branch, drops blank optional ids, and maps cancelled status', async () => {
    wireDefaultContext();
    mockApiFetch.mockResolvedValueOnce({
      id: 'd9',
      supplierId: null,
      deliveryNote: 'DN-9',
      vehicleNo: null,
      driverName: null,
      productId: null,
      orderedQty: '750',
      expectedDate: '2026-02-01T00:00:00.000Z',
      receivedQty: '700',
      density: '0.82',
      temperature: null,
      status: 'cancelled',
      createdAt: '2026-01-28T12:00:00.000Z',
    });

    const created = await deliveryRepo.create({
      supplierId: '',
      productId: '',
      deliveryNote: 'DN-9',
      orderedQty: '750',
      expectedDate: '2026-02-01',
    });

    const body = (mockApiFetch.mock.calls[mockApiFetch.mock.calls.length - 1][1] as { body: Record<string, unknown> }).body;
    expect(body).toMatchObject({ branchId: 'b1', supplierId: undefined, productId: undefined, orderedQty: 750 });
    expect(created).toMatchObject({ status: 'Cancelled', receivedQty: 700, density: 0.82, temperature: undefined });
  });

  test('receive coerces GRN allocation quantities', async () => {
    mockApiFetch.mockResolvedValueOnce(undefined);

    await expect(deliveryRepo.receive('d1', {
      receivedQty: '1000',
      density: 0.84,
      temperature: 24,
      allocations: [{ tankId: 't1', quantity: '600' }, { tankId: 't2', quantity: 400 }],
      varianceReason: 'split load',
    })).resolves.toEqual({ success: true });

    expect(mockApiFetch).toHaveBeenCalledWith('deliveries/d1/grn', {
      method: 'POST',
      body: {
        receivedQty: 1000,
        density: 0.84,
        temperature: 24,
        allocations: [{ tankId: 't1', quantity: 600 }, { tankId: 't2', quantity: 400 }],
        varianceReason: 'split load',
      },
    });
  });
});

describe('nozzleRepo create variants', () => {
  test('create maps inactive UI status to API status', async () => {
    mockSetup.nozzles.create.mockResolvedValue({
      id: 'n-inactive',
      stationId: 's1',
      pumpCode: 'P1',
      nozzleCode: 'N9',
      productId: 'p1',
      tankId: 't1',
      status: 'inactive',
    });

    const created = await nozzleRepo.create({
      stationId: 's1',
      pumpId: 'pump-1',
      tankId: 't1',
      productId: 'p1',
      nozzleCode: 'N9',
      status: 'Inactive',
    });

    expect(mockSetup.nozzles.create).toHaveBeenCalledWith(expect.objectContaining({ status: 'inactive' }));
    expect(created.status).toBe('Inactive');
  });
});

describe('shiftRepo branch variants', () => {
  test('list maps closed and unknown statuses plus present endTime', async () => {
    mockApiFetch.mockResolvedValueOnce(page([
      { id: 'sh-closed', stationId: 's1', startTime: '2026-01-01T08:00:00.000Z', endTime: '2026-01-01T16:00:00.000Z', status: 'closed', openedBy: 'u1' },
      { id: 'sh-draft', stationId: 's1', startTime: '2026-01-02T08:00:00.000Z', endTime: null, status: 'paused', openedBy: null },
    ], 2));

    const rows = await shiftRepo.list();

    expect(rows[0]).toMatchObject({ status: 'closed', endTime: '2026-01-01T16:00:00.000Z', cashierId: 'u1' });
    expect(rows[1]).toMatchObject({ status: 'draft', endTime: undefined, cashierId: '' });
  });

  test('open maps reading defaults and created endTime', async () => {
    mockApiFetch.mockResolvedValueOnce({
      id: 'sh-open',
      stationId: 's1',
      startTime: '2026-01-01T08:00:00.000Z',
      endTime: '2026-01-01T09:00:00.000Z',
      status: 'open',
      openedBy: null,
    });

    const opened = await shiftRepo.open({
      branchId: 'b1',
      readings: [{ nozzleId: 'n1', openingReading: '123', pricePerUnit: '2.5' }],
    });

    expect(mockApiFetch).toHaveBeenCalledWith('shifts/open', expect.objectContaining({
      body: {
        branchId: 'b1',
        openingMeterReadings: [{ nozzleId: 'n1', value: 123, pricePerUnit: 2.5 }],
      },
    }));
    expect(opened).toMatchObject({
      endTime: '2026-01-01T09:00:00.000Z',
      cashierId: '',
      readings: [{ nozzleId: 'n1', nozzleCode: 'n1', openingReading: 123, pricePerUnit: 2.5 }],
    });
  });

  test('close filters zero collections and maps voucher to credit', async () => {
    mockApiFetch.mockResolvedValueOnce(undefined);

    await expect(shiftRepo.close({
      id: 'sh1',
      readings: [{ nozzleId: 'n1', closingReading: '250' }],
      collections: { cash: 0, card: '150', mobileMoney: '', voucher: '25' },
      varianceReason: 'cash shortage',
    })).resolves.toEqual({ success: true });

    const body = (mockApiFetch.mock.calls[0][1] as { body: { collections: unknown[] } }).body;
    expect(body.collections).toEqual([
      { paymentMethod: 'Card', amount: 150 },
      { paymentMethod: 'Credit', amount: 25 },
    ]);
  });

  test('getOpen without a station falls back to the open shift station and reading id', async () => {
    mockApiFetch
      .mockResolvedValueOnce(page([
        { id: 'sh1', stationId: 's-fallback', startTime: '2026-01-01T08:00:00.000Z', endTime: '2026-01-01T16:00:00.000Z', status: 'open', openedBy: null },
      ], 1))
      .mockResolvedValueOnce({
        id: 'sh1',
        stationId: 's-fallback',
        startTime: '2026-01-01T08:00:00.000Z',
        endTime: '2026-01-01T16:00:00.000Z',
        openedBy: null,
        openingMeterReadings: [{ nozzleId: 'missing-nozzle', value: '10', pricePerUnit: '1.5' }],
      });
    mockSetup.nozzles.list.mockResolvedValue([]);

    const open = await shiftRepo.getOpen();

    expect(mockSetup.nozzles.list).toHaveBeenCalledWith('s-fallback');
    expect(open).toMatchObject({
      endTime: '2026-01-01T16:00:00.000Z',
      cashierId: '',
      readings: [{ nozzleId: 'missing-nozzle', nozzleCode: 'missing-nozzle', openingReading: 10, pricePerUnit: 1.5 }],
    });
  });
});

describe('saleRepo variants', () => {
  test('list maps transaction dates and totals', async () => {
    mockApiFetch.mockResolvedValueOnce(page([
      { id: 'sale-list', branchId: 'b1', transactionDate: '2026-03-01T10:00:00.000Z', totalAmount: '99.5', status: 'posted' },
    ], 1));

    const rows = await saleRepo.list();

    expect(rows[0]).toMatchObject({ id: 'sale-list', totalAmount: 99.5, paymentType: 'Cash' });
    expect(rows[0].timestamp).toBe('2026-03-01T10:00:00.000Z');
  });

  test('create classifies credit payments from API response', async () => {
    wireDefaultContext();
    mockApiFetch.mockResolvedValueOnce({
      id: 'sale-credit',
      transactionDate: '2026-01-01T00:00:00.000Z',
      totalAmount: '25',
      payments: [{ paymentMethod: 'Credit Account', amount: '25' }],
    });

    const sale = await saleRepo.create({
      nozzleId: 'n1',
      productId: 'p1',
      quantity: '5',
      pricePerUnit: '5',
      discount: '',
      payment: { voucher: '25' },
    });

    expect(sale.paymentType).toBe('Credit');
    expect(sale.payment).toEqual({ cash: 0, card: 0, mobile: 0, voucher: 25 });
  });

  test('create falls back to Cash when API returns no payment rows', async () => {
    wireDefaultContext();
    mockApiFetch.mockResolvedValueOnce({
      id: 'sale-cash',
      transactionDate: '2026-01-01T00:00:00.000Z',
      totalAmount: '10',
      payments: [],
    });

    const sale = await saleRepo.create({
      nozzleId: 'n1',
      productId: 'p1',
      quantity: 1,
      pricePerUnit: 10,
      payment: { cash: 10 },
    });

    expect(sale.paymentType).toBe('Cash');
  });
});

describe('inventory and payables repository mappers', () => {
  test('maps reconciliation nullable and numeric fields', async () => {
    mockApiFetch.mockResolvedValueOnce(page([
      { id: 'rec1', reconciliationDate: '2026-04-01T00:00:00.000Z', expectedVolume: '100', actualVolume: null, variance: '-5', status: 'open' },
    ], 1));

    expect(await reconciliationRepo.list()).toEqual([
      { id: 'rec1', reconciliationDate: '2026-04-01', expectedVolume: 100, actualVolume: null, variance: -5, status: 'open' },
    ]);
  });

  test('maps variance nullable fields', async () => {
    mockApiFetch.mockResolvedValueOnce(page([
      { id: 'var1', tankId: null, varianceDate: '2026-04-02T00:00:00.000Z', volumeVariance: '-12.5', valueVariance: null, classification: null },
    ], 1));

    expect(await varianceRepo.list()).toEqual([
      { id: 'var1', tankId: null, varianceDate: '2026-04-02', volumeVariance: -12.5, valueVariance: null, classification: null },
    ]);
  });

  test('maps transfer and adjustment list rows', async () => {
    mockApiFetch
      .mockResolvedValueOnce(page([
        { id: 'tr1', transferType: 'station', fromTankId: null, toTankId: 't2', quantity: '42', transferDate: '2026-04-03T00:00:00.000Z', status: 'pending' },
      ], 1))
      .mockResolvedValueOnce(page([
        { id: 'adj1', tankId: 't1', adjustmentDate: '2026-04-04T00:00:00.000Z', volumeDelta: '-3', reason: 'dip correction', status: 'posted' },
      ], 1));

    expect(await transferRepo.list()).toEqual([
      { id: 'tr1', transferType: 'station', fromTankId: null, toTankId: 't2', quantity: 42, transferDate: '2026-04-03', status: 'pending' },
    ]);
    expect(await adjustmentRepo.list()).toEqual([
      { id: 'adj1', tankId: 't1', adjustmentDate: '2026-04-04', volumeDelta: -3, reason: 'dip correction', status: 'posted' },
    ]);
  });

  test('maps supplier invoices and aging reports', async () => {
    const aging = { asOf: '2026-04-30', buckets: [{ bucket: '0-30', fromDays: 0, toDays: 30, amount: 200, count: 2 }], total: 200 };
    mockApiFetch
      .mockResolvedValueOnce(page([
        { id: 'si1', supplierId: 'sup1', invoiceNumber: 'SI-1', invoiceDate: '2026-04-01T00:00:00.000Z', dueDate: '2026-04-30T00:00:00.000Z', totalAmount: '300', balanceRemaining: '120', status: 'partial' },
      ], 1))
      .mockResolvedValueOnce(aging)
      .mockResolvedValueOnce({ ...aging, total: 500 });

    expect(await supplierInvoiceRepo.list()).toEqual([
      { id: 'si1', supplierId: 'sup1', invoiceNumber: 'SI-1', invoiceDate: '2026-04-01', dueDate: '2026-04-30', totalAmount: 300, balanceRemaining: 120, status: 'partial' },
    ]);
    expect(await payablesAgingRepo.getReport()).toEqual(aging);
    expect(await creditAgingRepo.getReport()).toMatchObject({ total: 500 });
  });
});

describe('expenseCategoryRepo', () => {
  test('lists categories and creates with default context', async () => {
    wireDefaultContext();
    mockApiFetch
      .mockResolvedValueOnce(page([
        { id: 'cat1', code: 'FUEL', name: 'Fuel', description: null, status: 'active' },
      ], 1))
      .mockResolvedValueOnce({ id: 'cat2', code: 'MAINT', name: 'Maintenance', description: null, status: 'active' });

    expect(await expenseCategoryRepo.list()).toEqual([
      { id: 'cat1', code: 'FUEL', name: 'Fuel', description: null, status: 'active' },
    ]);
    expect(await expenseCategoryRepo.create({ code: 'MAINT', name: 'Maintenance' })).toMatchObject({ id: 'cat2' });
    const body = (mockApiFetch.mock.calls[mockApiFetch.mock.calls.length - 1][1] as { body: Record<string, unknown> }).body;
    expect(body).toEqual({
      companyId: 'c1',
      branchId: 'b1',
      code: 'MAINT',
      name: 'Maintenance',
      description: undefined,
    });
  });
});
