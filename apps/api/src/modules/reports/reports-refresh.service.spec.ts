import { ReportsRefreshService } from './reports-refresh.service';

describe('ReportsRefreshService', () => {
  const makeService = (query: jest.Mock) => {
    const client = {
      query,
      release: jest.fn(),
    };
    const pool = {
      connect: jest.fn().mockResolvedValue(client),
    };
    const logger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };
    return {
      service: new ReportsRefreshService(pool as any, logger as any),
      pool,
      client,
      logger,
    };
  };

  const queryForSuccessfulRefresh = jest.fn(async (sql: string) => {
    if (sql.includes('pg_try_advisory_lock')) return { rows: [{ pg_try_advisory_lock: true }] };
    if (sql.includes('pg_advisory_unlock')) return { rows: [{ pg_advisory_unlock: true }] };
    return { rows: [] };
  });

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(1000);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('skips refresh when the advisory lock is already held', async () => {
    const { service, client } = makeService(
      jest.fn(async (sql: string) => {
        if (sql.includes('pg_try_advisory_lock')) {
          return { rows: [{ pg_try_advisory_lock: false }] };
        }
        return { rows: [] };
      }),
    );

    const result = await service.refreshAll();

    expect(result).toMatchObject({
      ok: false,
      viewsRefreshed: [],
      skipped: 'Another refresh is in progress (advisory lock held)',
    });
    expect(client.query).toHaveBeenCalledWith('SELECT pg_advisory_unlock($1)', [8838383838]);
    expect(client.release).toHaveBeenCalled();
  });

  it('falls back to non-concurrent refresh for a view that cannot refresh concurrently', async () => {
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('pg_try_advisory_lock')) return { rows: [{ pg_try_advisory_lock: true }] };
      if (sql.includes('pg_advisory_unlock')) return { rows: [] };
      if (sql === 'REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_stock_variance') {
        throw new Error('missing unique index');
      }
      return { rows: [] };
    });
    const { service, logger } = makeService(query);

    const result = await service.refreshAll({ dateFrom: '2026-01-01', dateTo: '2026-01-31' });

    expect(result.ok).toBe(true);
    expect(result.viewsRefreshed).toEqual([
      'mv_daily_sales_summary',
      'mv_daily_stock_variance',
      'mv_daily_payment_mix',
      'mv_ar_aging_snapshot',
    ]);
    expect(query).toHaveBeenCalledWith('REFRESH MATERIALIZED VIEW mv_daily_stock_variance');
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_stock_variance failed'),
      'ReportsRefresh',
    );
  });

  it('logs and rethrows when both concurrent and non-concurrent refresh fail', async () => {
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('pg_try_advisory_lock')) return { rows: [{ pg_try_advisory_lock: true }] };
      if (sql.includes('pg_advisory_unlock')) return { rows: [] };
      if (sql.includes('mv_daily_sales_summary')) throw new Error('refresh failed');
      return { rows: [] };
    });
    const { service, logger, client } = makeService(query);

    await expect(service.refreshAll()).rejects.toThrow('refresh failed');

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('REFRESH MATERIALIZED VIEW mv_daily_sales_summary failed'),
      expect.any(String),
      'ReportsRefresh',
    );
    expect(client.release).toHaveBeenCalled();
  });

  it('warns when advisory unlock fails but still returns the refresh result', async () => {
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('pg_try_advisory_lock')) return { rows: [{ pg_try_advisory_lock: true }] };
      if (sql.includes('pg_advisory_unlock')) throw new Error('unlock failed');
      return { rows: [] };
    });
    const { service, logger } = makeService(query);

    const result = await service.refreshAll();

    expect(result.ok).toBe(true);
    expect(logger.warn).toHaveBeenCalledWith(
      'Failed to release advisory lock: unlock failed',
      'ReportsRefresh',
    );
  });

  it('logs scheduled refresh success and failure', async () => {
    const { service, logger } = makeService(queryForSuccessfulRefresh);
    jest.spyOn(service, 'refreshAll').mockResolvedValue({
      ok: true,
      viewsRefreshed: ['mv_daily_sales_summary'],
      durationMs: 1,
    });

    await service.handleScheduledRefresh();

    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('Reports MV scheduled refresh started'),
      'ReportsRefresh',
    );
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('"event":"reports.mv_refresh"'),
      'ReportsRefresh',
    );

    jest.spyOn(service, 'refreshAll').mockRejectedValue(new Error('scheduled failed'));
    await service.handleScheduledRefresh();
    expect(logger.error).toHaveBeenCalledWith(
      'Reports MV scheduled refresh failed: scheduled failed',
      expect.any(String),
      'ReportsRefresh',
    );
  });
});
