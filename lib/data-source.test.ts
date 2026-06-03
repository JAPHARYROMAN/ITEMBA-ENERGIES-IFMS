import { describe, test, expect, vi, beforeEach } from 'vitest';

// Mock the API layer (owned by another agent — stub it, don't test it).
vi.mock('./api/setup', () => {
  const make = () => ({
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  });
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

import { setupDataSource } from './data-source';
import { apiSetup } from './api/setup';

const mocked = apiSetup as unknown as {
  companies: { list: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
  stations: { list: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
  branches: { list: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
  products: { list: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
  tanks: { list: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
  pumps: { list: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
  nozzles: { list: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('setupDataSource.products', () => {
  test('list maps API rows to domain Product (coerces price, drops extra fields)', async () => {
    mocked.products.list.mockResolvedValue([
      { id: 'p1', companyId: 'c1', code: 'D', name: 'Diesel', category: 'Fuel', pricePerUnit: '123.45', unit: 'litre', status: 'active' },
    ]);
    const result = await setupDataSource.products.list();
    expect(result).toEqual([{ id: 'p1', name: 'Diesel', pricePerUnit: 123.45, category: 'Fuel' }]);
  });

  test('create forwards data and maps the created row', async () => {
    mocked.products.create.mockResolvedValue({
      id: 'p2', companyId: 'c1', code: 'P', name: 'Petrol', category: 'Fuel', pricePerUnit: 200, unit: 'litre', status: 'active',
    });
    const data = { companyId: 'c1', code: 'P', name: 'Petrol', category: 'Fuel', pricePerUnit: 200 };
    const result = await setupDataSource.products.create(data);
    expect(mocked.products.create).toHaveBeenCalledWith(data);
    expect(result).toEqual({ id: 'p2', name: 'Petrol', pricePerUnit: 200, category: 'Fuel' });
  });

  test('list propagates API errors', async () => {
    mocked.products.list.mockRejectedValue(new Error('boom'));
    await expect(setupDataSource.products.list()).rejects.toThrow('boom');
  });
});

describe('setupDataSource.tanks', () => {
  test('list maps rows, coercing numeric strings and defaulting null productId/calibration', async () => {
    mocked.tanks.list.mockResolvedValue([
      {
        id: 't1', companyId: 'c1', branchId: 'b1', stationId: 's1', code: 'T-1',
        productId: null, capacity: '10000', minLevel: '500', maxLevel: '9000',
        currentLevel: '4200', calibrationProfile: null, status: 'active',
      },
    ]);
    const result = await setupDataSource.tanks.list('s1');
    expect(mocked.tanks.list).toHaveBeenCalledWith('s1');
    expect(result[0]).toEqual({
      id: 't1', companyId: 'c1', stationId: 's1', branchId: 'b1', code: 'T-1',
      productId: '', capacity: 10000, minLevel: 500, maxLevel: 9000,
      calibrationProfile: '', currentLevel: 4200,
    });
  });

  test('create injects status:active, drops empty productId, and stamps stationId from input', async () => {
    mocked.tanks.create.mockResolvedValue({
      id: 't9', companyId: 'c1', branchId: 'b1', productId: null, code: 'T-9',
      capacity: '5000', minLevel: '100', maxLevel: '4000', currentLevel: '0',
      calibrationProfile: null, status: 'active',
    });
    const result = await setupDataSource.tanks.create({
      companyId: 'c1', branchId: 'b1', stationId: 's1', productId: '', code: 'T-9',
      capacity: 5000, minLevel: 100, maxLevel: 4000, calibrationProfile: 'lin',
    });
    expect(mocked.tanks.create).toHaveBeenCalledWith({
      companyId: 'c1', branchId: 'b1', productId: undefined, code: 'T-9',
      capacity: 5000, minLevel: 100, maxLevel: 4000, calibrationProfile: 'lin', status: 'active',
    });
    // stationId comes from the input, not the API row.
    expect(result.stationId).toBe('s1');
    expect(result.currentLevel).toBe(0);
  });
});

describe('setupDataSource.pumps', () => {
  test('list filters by stationId when provided', async () => {
    mocked.pumps.list.mockResolvedValue([
      { id: 'pump1', stationId: 's1', code: 'A', name: null, status: 'active' },
      { id: 'pump2', stationId: 's2', code: 'B', name: 'B', status: 'active' },
    ]);
    const result = await setupDataSource.pumps.list('s1');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('pump1');
  });

  test('list returns all pumps when no stationId given', async () => {
    mocked.pumps.list.mockResolvedValue([
      { id: 'pump1', stationId: 's1', code: 'A', name: null, status: 'active' },
      { id: 'pump2', stationId: 's2', code: 'B', name: 'B', status: 'active' },
    ]);
    expect(await setupDataSource.pumps.list()).toHaveLength(2);
  });
});

describe('setupDataSource.nozzles', () => {
  test('list maps inactive status (case-insensitive) to Inactive, else Active', async () => {
    mocked.nozzles.list.mockResolvedValue([
      { id: 'n1', stationId: 's1', pumpCode: 'P1', nozzleCode: 'N1', productId: 'p1', tankId: 't1', status: 'INACTIVE' },
      { id: 'n2', stationId: 's1', pumpCode: 'P1', nozzleCode: 'N2', productId: 'p1', tankId: 't1', status: 'active' },
    ]);
    const result = await setupDataSource.nozzles.list('s1');
    expect(result[0].status).toBe('Inactive');
    expect(result[1].status).toBe('Active');
  });

  test('create throws when pumpId is missing (before hitting the API)', async () => {
    await expect(
      setupDataSource.nozzles.create({
        stationId: 's1', nozzleCode: 'N1', productId: 'p1', tankId: 't1',
      }),
    ).rejects.toThrow('Pump is required');
    expect(mocked.nozzles.create).not.toHaveBeenCalled();
  });

  test('create maps UI status to API status and maps the response back', async () => {
    mocked.nozzles.create.mockResolvedValue({
      id: 'n3', stationId: 's1', pumpCode: 'P1', nozzleCode: 'N3', productId: 'p1', tankId: 't1', status: 'inactive',
    });
    const result = await setupDataSource.nozzles.create({
      stationId: 's1', pumpId: 'pump1', nozzleCode: 'N3', productId: 'p1', tankId: 't1', status: 'Inactive',
    });
    expect(mocked.nozzles.create).toHaveBeenCalledWith({
      stationId: 's1', pumpId: 'pump1', tankId: 't1', productId: 'p1', code: 'N3', status: 'inactive',
    });
    expect(result.status).toBe('Inactive');
  });
});

describe('setupDataSource passthrough repos', () => {
  test('companies.list passes through the API result', async () => {
    const companies = [{ id: 'c1', name: 'Acme', code: 'AC', status: 'active' }];
    mocked.companies.list.mockResolvedValue(companies);
    expect(await setupDataSource.companies.list()).toBe(companies);
  });

  test('branches.list forwards the stationId filter', async () => {
    mocked.branches.list.mockResolvedValue([]);
    await setupDataSource.branches.list('s1');
    expect(mocked.branches.list).toHaveBeenCalledWith('s1');
  });

  test('delete helpers delegate to the API layer', async () => {
    mocked.stations.delete.mockResolvedValue(undefined);
    await setupDataSource.stations.delete('s1');
    expect(mocked.stations.delete).toHaveBeenCalledWith('s1');
  });
});
