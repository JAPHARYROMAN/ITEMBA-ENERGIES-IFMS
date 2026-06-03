import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('./client', () => ({ apiFetch: vi.fn() }));

import { apiFetch } from './client';
import { apiSetup } from './setup';

const apiFetchMock = vi.mocked(apiFetch);

/** A single page of results that fits within one listAll page. */
function onePage<T>(rows: T[]) {
  return { data: rows, meta: { page: 1, pageSize: 100, total: rows.length } };
}

beforeEach(() => {
  apiFetchMock.mockReset();
});

describe('apiSetup list helpers (listAll pagination)', () => {
  test('companies.list requests page 1 with pageSize 100 and returns data', async () => {
    apiFetchMock.mockResolvedValue(onePage([{ id: '1', name: 'Acme', code: 'AC', currency: 'USD', status: 'active' }]) as never);

    const rows = await apiSetup.companies.list();

    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    expect(apiFetchMock.mock.calls[0][0]).toBe('companies?page=1&pageSize=100');
    expect(rows).toHaveLength(1);
  });

  test('listAll follows pages until a short page is returned', async () => {
    const fullPage = Array.from({ length: 100 }, (_, i) => ({ id: String(i), name: 'x', code: 'c', currency: 'USD', status: 'active' }));
    apiFetchMock
      .mockResolvedValueOnce({ data: fullPage, meta: { page: 1, pageSize: 100, total: 150 } } as never)
      .mockResolvedValueOnce({ data: fullPage.slice(0, 50), meta: { page: 2, pageSize: 100, total: 150 } } as never);

    const rows = await apiSetup.companies.list();

    expect(apiFetchMock).toHaveBeenCalledTimes(2);
    expect(apiFetchMock.mock.calls[0][0]).toBe('companies?page=1&pageSize=100');
    expect(apiFetchMock.mock.calls[1][0]).toBe('companies?page=2&pageSize=100');
    expect(rows).toHaveLength(150);
  });

  test('branches.list passes a stationId filter into the query string', async () => {
    apiFetchMock.mockResolvedValue(onePage([]) as never);
    await apiSetup.branches.list('station-9');
    expect(apiFetchMock.mock.calls[0][0]).toBe('branches?page=1&pageSize=100&stationId=station-9');
  });

  test('tanks.list coerces numeric string fields to numbers', async () => {
    apiFetchMock.mockResolvedValue(
      onePage([
        {
          id: 't1',
          companyId: 'c1',
          branchId: 'b1',
          stationId: 's1',
          productId: null,
          code: 'TANK',
          capacity: '1000',
          minLevel: '10',
          maxLevel: '900',
          currentLevel: '500',
          calibrationProfile: null,
          status: 'active',
        },
      ]) as never,
    );

    const rows = await apiSetup.tanks.list();
    expect(rows[0]).toMatchObject({ capacity: 1000, minLevel: 10, maxLevel: 900, currentLevel: 500 });
  });
});

describe('apiSetup create/update/delete request shapes', () => {
  test('companies.create POSTs to companies', async () => {
    apiFetchMock.mockResolvedValue({} as never);
    await apiSetup.companies.create({ code: 'AC', name: 'Acme' });
    expect(apiFetchMock).toHaveBeenCalledWith('companies', { method: 'POST', body: { code: 'AC', name: 'Acme' } });
  });

  test('companies.update PATCHes companies/:id', async () => {
    apiFetchMock.mockResolvedValue({} as never);
    await apiSetup.companies.update('c1', { name: 'New' });
    expect(apiFetchMock).toHaveBeenCalledWith('companies/c1', { method: 'PATCH', body: { name: 'New' } });
  });

  test('companies.delete DELETEs companies/:id', async () => {
    apiFetchMock.mockResolvedValue(undefined as never);
    await apiSetup.companies.delete('c1');
    expect(apiFetchMock).toHaveBeenCalledWith('companies/c1', { method: 'DELETE' });
  });

  test('stations.create POSTs to stations', async () => {
    apiFetchMock.mockResolvedValue({} as never);
    await apiSetup.stations.create({ companyId: 'c1', code: 'ST', name: 'Main' });
    expect(apiFetchMock).toHaveBeenCalledWith('stations', {
      method: 'POST',
      body: { companyId: 'c1', code: 'ST', name: 'Main' },
    });
  });

  test('tanks.create POSTs to tanks', async () => {
    apiFetchMock.mockResolvedValue({} as never);
    await apiSetup.tanks.create({ companyId: 'c1', branchId: 'b1', code: 'TK', capacity: 1000 });
    expect(apiFetchMock).toHaveBeenCalledWith('tanks', {
      method: 'POST',
      body: { companyId: 'c1', branchId: 'b1', code: 'TK', capacity: 1000 },
    });
  });

  test('nozzles.delete DELETEs nozzles/:id', async () => {
    apiFetchMock.mockResolvedValue(undefined as never);
    await apiSetup.nozzles.delete('n1');
    expect(apiFetchMock).toHaveBeenCalledWith('nozzles/n1', { method: 'DELETE' });
  });

  test('pumps.delete DELETEs pumps/:id', async () => {
    apiFetchMock.mockResolvedValue(undefined as never);
    await apiSetup.pumps.delete('p1');
    expect(apiFetchMock).toHaveBeenCalledWith('pumps/p1', { method: 'DELETE' });
  });
});
