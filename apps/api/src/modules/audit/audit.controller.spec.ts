import { AuditController } from './audit.controller';

function makeDataQuery(rows: unknown[]) {
  const query: any = {};
  query.from = jest.fn(() => query);
  query.where = jest.fn(() => query);
  query.orderBy = jest.fn(() => query);
  query.limit = jest.fn(() => query);
  query.offset = jest.fn(() => Promise.resolve(rows));
  return query;
}

function makeCountQuery(total: number) {
  const query: any = {};
  query.from = jest.fn(() => query);
  query.where = jest.fn(() => Promise.resolve([{ count: total }]));
  return query;
}

describe('AuditController', () => {
  it('lists logs without filters and returns default count fallback', async () => {
    const dataQuery = makeDataQuery([{ id: 'log-1' }]);
    const countQuery = makeCountQuery(0);
    countQuery.where.mockResolvedValueOnce([]);
    const db = {
      select: jest.fn((selection?: Record<string, unknown>) => (selection?.count ? countQuery : dataQuery)),
    };
    const controller = new AuditController(db as any);

    const result = await controller.listLogs({ page: 2, pageSize: 10 } as any);

    expect(db.select).toHaveBeenCalledTimes(2);
    expect(dataQuery.where).toHaveBeenCalledWith(undefined);
    expect(countQuery.where).toHaveBeenCalledWith(undefined);
    expect(dataQuery.limit).toHaveBeenCalledWith(10);
    expect(dataQuery.offset).toHaveBeenCalledWith(10);
    expect(result).toEqual({ data: [{ id: 'log-1' }], total: 0, page: 2, pageSize: 10 });
  });

  it('builds a where clause for all supported filters', async () => {
    const dataQuery = makeDataQuery([{ id: 'log-2' }]);
    const countQuery = makeCountQuery(3);
    const db = {
      select: jest.fn((selection?: Record<string, unknown>) => (selection?.count ? countQuery : dataQuery)),
    };
    const controller = new AuditController(db as any);

    const result = await controller.listLogs({
      entity: 'expense_entry',
      action: 'create',
      actorUserId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
      dateFrom: '2026-01-01',
      dateTo: '2026-01-31',
    } as any);

    expect(dataQuery.where.mock.calls[0][0]).toBeDefined();
    expect(countQuery.where.mock.calls[0][0]).toBeDefined();
    expect(dataQuery.limit).toHaveBeenCalledWith(25);
    expect(dataQuery.offset).toHaveBeenCalledWith(0);
    expect(result).toEqual({ data: [{ id: 'log-2' }], total: 3, page: 1, pageSize: 25 });
  });
});
