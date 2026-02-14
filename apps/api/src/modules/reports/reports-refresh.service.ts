import { Injectable, Inject } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Pool } from 'pg';
import { PG_POOL } from '../../database/database.module';
import { AppLogger } from '../../common/logger/logger.service';

const ADVISORY_LOCK_ID = 8838383838;
const MATERIALIZED_VIEWS = [
  'mv_daily_sales_summary',
  'mv_daily_stock_variance',
  'mv_daily_payment_mix',
  'mv_ar_aging_snapshot',
] as const;

export interface RefreshResult {
  ok: boolean;
  viewsRefreshed: string[];
  durationMs: number;
  skipped?: string;
}

@Injectable()
export class ReportsRefreshService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly logger: AppLogger,
  ) {}

  /** Runs every night at 02:10 local time (set TZ or REPORTS_REFRESH_TZ for timezone). */
  @Cron('10 2 * * *', {
    timeZone: process.env.REPORTS_REFRESH_TZ ?? process.env.TZ ?? 'UTC',
  })
  async handleScheduledRefresh(): Promise<void> {
    const tz = process.env.TZ ?? 'UTC';
    this.logger.log(`Reports MV scheduled refresh started (tz=${tz})`, 'ReportsRefresh');
    try {
      const result = await this.refreshAll();
      this.logger.log(
        JSON.stringify({
          event: 'reports.mv_refresh',
          source: 'scheduled',
          ...result,
        }),
        'ReportsRefresh',
      );
    } catch (err) {
      this.logger.error(
        `Reports MV scheduled refresh failed: ${(err as Error).message}`,
        (err as Error).stack,
        'ReportsRefresh',
      );
    }
  }

  /**
   * Refresh all report materialized views. Uses DB advisory lock to prevent concurrent refresh.
   * Optional dateFrom/dateTo reserved for future incremental refresh; currently performs full refresh.
   */
  async refreshAll(options?: { dateFrom?: string; dateTo?: string }): Promise<RefreshResult> {
    const start = Date.now();
    const client = await this.pool.connect();
    try {
      const lockResult = await client.query('SELECT pg_try_advisory_lock($1)', [ADVISORY_LOCK_ID]);
      if (!lockResult.rows[0]?.pg_try_advisory_lock) {
        return {
          ok: false,
          viewsRefreshed: [],
          durationMs: Date.now() - start,
          skipped: 'Another refresh is in progress (advisory lock held)',
        };
      }

      const viewsRefreshed: string[] = [];
      for (const name of MATERIALIZED_VIEWS) {
        try {
          await client.query(`REFRESH MATERIALIZED VIEW CONCURRENTLY ${name}`);
          viewsRefreshed.push(name);
        } catch (err) {
          this.logger.warn(
            `REFRESH MATERIALIZED VIEW CONCURRENTLY ${name} failed: ${(err as Error).message}. Trying non-concurrent.`,
            'ReportsRefresh',
          );
          try {
            await client.query(`REFRESH MATERIALIZED VIEW ${name}`);
            viewsRefreshed.push(name);
          } catch (err2) {
            this.logger.error(
              `REFRESH MATERIALIZED VIEW ${name} failed: ${(err2 as Error).message}`,
              (err2 as Error).stack,
              'ReportsRefresh',
            );
            throw err2;
          }
        }
      }

      return {
        ok: true,
        viewsRefreshed,
        durationMs: Date.now() - start,
      };
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_ID]).catch(() => {});
      client.release();
    }
  }
}
