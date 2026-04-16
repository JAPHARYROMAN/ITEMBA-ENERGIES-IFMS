import { Injectable } from '@nestjs/common';
import { ReportsService, type ReportScopeContext, type ReportPerfContext } from './reports.service';
import { ReportsRefreshService, type RefreshResult } from './reports-refresh.service';
import type { ReportsQueryDto } from './dto/reports-query.dto';

/**
 * Unified entry point for report operations.
 * Consolidates query, caching, and materialized-view refresh behind a single service
 * so that consumers don't need to know about the internal three-service split.
 */
@Injectable()
export class ReportsFacade {
  constructor(
    private readonly reports: ReportsService,
    private readonly refresh: ReportsRefreshService,
  ) {}

  /* ─── Query delegates ───────────────────────────────────── */

  getOverview(query: ReportsQueryDto, ctx: ReportPerfContext) {
    return this.reports.getOverview(query, ctx);
  }

  getDailyOperations(query: ReportsQueryDto, ctx: ReportPerfContext) {
    return this.reports.getDailyOperations(query, ctx);
  }

  getStockLoss(query: ReportsQueryDto, ctx: ReportPerfContext) {
    return this.reports.getStockLoss(query, ctx);
  }

  getProfitability(query: ReportsQueryDto, ctx: ReportPerfContext) {
    return this.reports.getProfitability(query, ctx);
  }

  getCreditCashflow(query: ReportsQueryDto, ctx: ReportPerfContext) {
    return this.reports.getCreditCashflow(query, ctx);
  }

  getStationComparison(query: ReportsQueryDto, ctx: ReportPerfContext) {
    return this.reports.getStationComparison(query, ctx);
  }

  /* ─── Refresh delegate ──────────────────────────────────── */

  refreshMaterializedViews(options?: {
    dateFrom?: string;
    dateTo?: string;
  }): Promise<RefreshResult> {
    return this.refresh.refreshAll(options);
  }
}
