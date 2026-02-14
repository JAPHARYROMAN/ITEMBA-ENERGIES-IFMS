import { Injectable, Inject } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../../database/database.module';
import type * as schema from '../../database/schema';
import type { ReportsQueryDto } from './dto/reports-query.dto';

type Schema = typeof schema;

/** Returns true when request has a date range so day-level MVs can be used. */
export function canUseViewsForDateRange(filters: ReportsQueryDto): boolean {
  return Boolean(filters.dateFrom && filters.dateTo);
}

@Injectable()
export class ReportsMvService {
  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase<Schema>) {}

  /**
   * Sales trend from mv_daily_sales_summary. Returns same shape as getSalesTrend (array of { date, amount }).
   */
  async getSalesTrendFromViews(filters: ReportsQueryDto): Promise<{ date: string; amount: number }[] | null> {
    if (!canUseViewsForDateRange(filters)) return null;
    try {
      const conditions = [sql`report_date >= ${filters.dateFrom}::date`, sql`report_date <= ${filters.dateTo}::date`];
      if (filters.companyId) conditions.push(sql`company_id = ${filters.companyId}`);
      if (filters.stationId) conditions.push(sql`station_id = ${filters.stationId}`);
      if (filters.branchId) conditions.push(sql`branch_id = ${filters.branchId}`);
      const where = conditions.length ? sql.join(conditions, sql` AND `) : sql`true`;

      const result = await this.db.execute(sql`
        SELECT to_char(report_date, 'YYYY-MM-DD') AS date, coalesce(sum(revenue), 0)::numeric AS amount
        FROM mv_daily_sales_summary
        WHERE ${where}
        GROUP BY report_date
        ORDER BY report_date
      `);
      const rows = (result as unknown as { rows?: { date: string; amount: string }[] }).rows ?? [];
      if (!rows.length) return null;
      return rows.map((r) => ({
        date: r.date,
        amount: Number(r.amount ?? 0),
      }));
    } catch {
      return null;
    }
  }

  /**
   * Payment mix from mv_daily_payment_mix. Returns same shape as getPaymentMix (array of { name, value }).
   */
  async getPaymentMixFromViews(filters: ReportsQueryDto): Promise<{ name: string; value: number }[] | null> {
    if (!canUseViewsForDateRange(filters)) return null;
    try {
      const conditions = [sql`report_date >= ${filters.dateFrom}::date`, sql`report_date <= ${filters.dateTo}::date`];
      if (filters.companyId) conditions.push(sql`company_id = ${filters.companyId}`);
      if (filters.stationId) conditions.push(sql`station_id = ${filters.stationId}`);
      if (filters.branchId) conditions.push(sql`branch_id = ${filters.branchId}`);
      const where = conditions.length ? sql.join(conditions, sql` AND `) : sql`true`;

      const result = await this.db.execute(sql`
        SELECT method, coalesce(sum(amount), 0)::numeric AS amount
        FROM mv_daily_payment_mix
        WHERE ${where}
        GROUP BY method
        ORDER BY sum(amount) DESC
      `);
      const rows = (result as unknown as { rows?: { method: string; amount: string }[] }).rows ?? [];
      if (!rows.length) return null;
      return rows.map((r) => ({
        name: r.method,
        value: Number(r.amount ?? 0),
      }));
    } catch {
      return null;
    }
  }

}
