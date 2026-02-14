import { Injectable } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../../database/database.module';
import type * as schema from '../../database/schema';
import { AppLogger } from '../../common/logger/logger.service';
import {
  branches,
  creditInvoices,
  customers,
  deliveries,
  meterReadings,
  nozzles,
  products,
  reconciliations,
  payments,
  saleItems,
  salePayments,
  salesTransactions,
  shifts,
  stations,
  supplierInvoices,
  tanks,
  users,
  variances,
} from '../../database/schema';
import type { ReportsQueryDto } from './dto/reports-query.dto';
import { AuditService } from '../audit/audit.service';
import type { ReportActionDto } from './dto/report-action.dto';
import { ReportsMvService } from './reports-mv.service';
import { LruTtlCache } from './lru-cache';
import { OpsMetricsService } from '../../common/ops/ops-metrics.service';

type Schema = typeof schema;

export interface ReportScopeContext {
  userId: string;
  permissions: string[];
  companyId?: string;
  branchId?: string;
}

export interface ReportPerfContext {
  endpoint: string;
  correlationId: string;
  scope: ReportScopeContext;
}

@Injectable()
export class ReportsService {
  private readonly cacheEnabled: boolean;
  private readonly cacheDefaultTtlMs: number;
  private readonly cacheTtlByReportMs: Record<string, number>;
  private readonly cache: LruTtlCache<unknown>;
  private readonly slowQueryWarnThresholdMs: number;
  private readonly explainEnabled =
    process.env.NODE_ENV === 'development' && process.env.REPORTS_EXPLAIN === 'true';

  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<Schema>,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly logger: AppLogger,
    private readonly reportsMv: ReportsMvService,
    private readonly opsMetrics: OpsMetricsService,
  ) {
    this.cacheEnabled = this.config.get<boolean>('REPORTS_CACHE_ENABLED', true);
    this.cacheDefaultTtlMs = this.config.get<number>('REPORTS_CACHE_TTL_SECONDS_DEFAULT', 60) * 1000;
    this.cacheTtlByReportMs = {
      overview: this.config.get<number>('REPORTS_CACHE_TTL_SECONDS_OVERVIEW', 60) * 1000,
      'daily-operations': this.config.get<number>('REPORTS_CACHE_TTL_SECONDS_DAILY_OPERATIONS', 60) * 1000,
      'stock-loss': this.config.get<number>('REPORTS_CACHE_TTL_SECONDS_STOCK_LOSS', 60) * 1000,
      profitability: this.config.get<number>('REPORTS_CACHE_TTL_SECONDS_PROFITABILITY', 60) * 1000,
      'credit-cashflow': this.config.get<number>('REPORTS_CACHE_TTL_SECONDS_CREDIT_CASHFLOW', 60) * 1000,
      'station-comparison': this.config.get<number>('REPORTS_CACHE_TTL_SECONDS_STATION_COMPARISON', 120) * 1000,
    };
    const maxEntries = this.config.get<number>('REPORTS_CACHE_MAX_ENTRIES', 500);
    this.cache = new LruTtlCache<unknown>(maxEntries);
    this.slowQueryWarnThresholdMs = this.config.get<number>('REPORTS_SLOW_QUERY_THRESHOLD_MS', 2000);
  }

  async recordAction(
    dto: ReportActionDto,
    ctx: { userId?: string; ip?: string; userAgent?: string },
  ): Promise<{ ok: true; actionId: string; action: string }> {
    const actionId = `ract-${Date.now()}`;
    await this.audit.log({
      entity: 'reports_action',
      entityId: dto.targetId ?? actionId,
      action: dto.action,
      after: dto.payload ?? null,
      userId: ctx.userId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return { ok: true, actionId, action: dto.action };
  }

  async getOverview(filters: ReportsQueryDto, ctx?: ReportPerfContext) {
    return this.runReport('overview', filters, ctx, async (timed, recordSource) => {
      const kpis = await timed('overview.kpis', () => this.getOverviewKpis(filters));
      recordSource('overview.kpis', 'raw');

      let salesTrend: { date: string; amount: number }[];
      const salesTrendFromViews = await timed('overview.salesTrend.views', () =>
        this.reportsMv.getSalesTrendFromViews(filters),
      );
      if (salesTrendFromViews != null) {
        salesTrend = salesTrendFromViews;
        recordSource('overview.salesTrend', 'views');
      } else {
        salesTrend = await timed('overview.salesTrend', () => this.getSalesTrend(filters));
        recordSource('overview.salesTrend', 'raw');
      }

      let paymentMix: { name: string; value: number }[];
      const paymentMixFromViews = await timed('overview.paymentMix.views', () =>
        this.reportsMv.getPaymentMixFromViews(filters),
      );
      if (paymentMixFromViews != null) {
        paymentMix = paymentMixFromViews;
        recordSource('overview.paymentMix', 'views');
      } else {
        paymentMix = await timed('overview.paymentMix', () => this.getPaymentMix(filters));
        recordSource('overview.paymentMix', 'raw');
      }

      const varianceByStation = await timed('overview.varianceByStation', () =>
        this.getVarianceByStation(filters),
      );
      recordSource('overview.varianceByStation', 'raw');
      const topDebtors = await timed('overview.topDebtors', () => this.getTopDebtors(filters));
      recordSource('overview.topDebtors', 'raw');
      return { kpis, salesTrend, paymentMix, varianceByStation, topDebtors };
    });
  }

  async getDailyOperations(filters: ReportsQueryDto, ctx?: ReportPerfContext) {
    return this.runReport('daily-operations', filters, ctx, async (timed, recordSource) => {
      const shiftsData = await timed('dailyOperations.shifts', () => this.getShiftPerformance(filters));
      recordSource('dailyOperations.shifts', 'raw');
      const pumpsData = await timed('dailyOperations.pumps', () => this.getPumpPerformance(filters));
      recordSource('dailyOperations.pumps', 'raw');
      let paymentMix: { name: string; value: number }[];
      const paymentMixFromViews = await timed('dailyOperations.paymentMix.views', () =>
        this.reportsMv.getPaymentMixFromViews(filters),
      );
      if (paymentMixFromViews != null) {
        paymentMix = paymentMixFromViews;
        recordSource('dailyOperations.paymentMix', 'views');
      } else {
        paymentMix = await timed('dailyOperations.paymentMix', () => this.getPaymentMix(filters));
        recordSource('dailyOperations.paymentMix', 'raw');
      }
      const avgVariance =
        shiftsData.length > 0
          ? shiftsData.reduce((acc, s) => acc + s.variance, 0) / shiftsData.length
          : 0;
      return {
        stats: {
          avgShiftVariance: Number(avgVariance.toFixed(2)),
          auditCompliancePct: shiftsData.length
            ? Number(
                (
                  (shiftsData.filter((s) => Math.abs(s.variance) <= 5).length / shiftsData.length) *
                  100
                ).toFixed(1),
              )
            : 0,
          pendingClosures: shiftsData.filter((s) => s.status === 'open').length,
        },
        shifts: shiftsData,
        pumps: pumpsData,
        payments: paymentMix,
      };
    });
  }

  async getStockLoss(filters: ReportsQueryDto, ctx?: ReportPerfContext) {
    return this.runReport('stock-loss', filters, ctx, async (timed, recordSource) => {
      recordSource('stockLoss.tankLosses', 'raw');
      recordSource('stockLoss.shrinkageTrend', 'raw');
      recordSource('stockLoss.deliveryReconciliation', 'raw');
      const losses = await timed('stockLoss.tankLosses', () => this.getTankLossRows(filters));
      const trend = await timed('stockLoss.shrinkageTrend', () => this.getShrinkageTrend(filters));
      const deliveryRecon = await timed('stockLoss.deliveryReconciliation', () =>
        this.getDeliveryReconciliation(filters),
      );
      const totalVariance = losses.reduce((acc, l) => acc + l.variance, 0);
      return {
        summary: {
          netLossLiters: Number(totalVariance.toFixed(3)),
          valueLoss: Number((Math.abs(totalVariance) * 1.2).toFixed(2)),
          avgShrinkagePct: losses.length
            ? Number((losses.reduce((acc, l) => acc + Math.abs(l.variancePct), 0) / losses.length).toFixed(3))
            : 0,
        },
        shrinkageTrend: trend,
        tankLosses: losses,
        deliveryReconciliation: deliveryRecon,
      };
    });
  }

  async getProfitability(filters: ReportsQueryDto, ctx?: ReportPerfContext) {
    return this.runReport('profitability', filters, ctx, async (timed, recordSource) => {
      recordSource('profitability.metrics', 'raw');
      recordSource('profitability.marginByProduct', 'raw');
      recordSource('profitability.stationContribution', 'raw');
      recordSource('profitability.priceImpact', 'raw');
      const metrics = await timed('profitability.metrics', () => this.getProfitabilityMetrics(filters));
      const marginByProduct = await timed('profitability.marginByProduct', () =>
        this.getMarginByProduct(filters),
      );
      const stationContribution = await timed('profitability.stationContribution', () =>
        this.getStationContribution(filters),
      );
      const priceImpact = await timed('profitability.priceImpact', async () =>
        this.getPriceImpactSimulation(),
      );
      return { metrics, marginByProduct, stationContribution, priceImpact };
    });
  }

  async getCreditCashflow(filters: ReportsQueryDto, ctx?: ReportPerfContext) {
    return this.runReport('credit-cashflow', filters, ctx, async (timed, recordSource) => {
      recordSource('creditCashflow.arAging', 'raw');
      recordSource('creditCashflow.apAging', 'raw');
      recordSource('creditCashflow.topDebtors', 'raw');
      const arAging = await timed('creditCashflow.arAging', () => this.getCreditAging(filters));
      const apAging = await timed('creditCashflow.apAging', () => this.getPayablesAging(filters));
      const topDebtors = await timed('creditCashflow.topDebtors', () => this.getTopDebtors(filters, 20));
      const sim = {
        opening: 0,
        collections: Number(
          topDebtors.reduce((acc, d) => acc + (d.lastPaymentAmount ?? 0), 0).toFixed(2),
        ),
        payables: Number(apAging.reduce((acc, b) => acc + b.amount, 0).toFixed(2)),
        expenses: 0,
        projected: 0,
      };
      sim.projected = Number((sim.opening + sim.collections - sim.payables - sim.expenses).toFixed(2));
      const totalAr = arAging.reduce((acc, b) => acc + b.amount, 0);
      const overdueAr = arAging.filter((b) => b.bucket !== '0-30 Days').reduce((acc, b) => acc + b.amount, 0);
      const efficiency = totalAr > 0 ? Number((((totalAr - overdueAr) / totalAr) * 100).toFixed(1)) : 0;
      return {
        liquidity: {
          current: sim.opening,
          totalReceivables: totalAr,
          totalPayables: Number(apAging.reduce((acc, b) => acc + b.amount, 0).toFixed(2)),
          collectionEfficiencyPct: efficiency,
        },
        arAging,
        apAging,
        simulation: { ...sim, efficiency },
        topDebtors,
      };
    });
  }

  async getStationComparison(filters: ReportsQueryDto, ctx?: ReportPerfContext) {
    return this.runReport('station-comparison', filters, ctx, async (timed, recordSource) => {
      recordSource('stationComparison.stationContribution', 'raw');
      const rows = await timed('stationComparison.stationContribution', () =>
        this.getStationContribution(filters),
      );
      const ranked = [...rows]
        .sort((a, b) => b.contribution - a.contribution)
        .map((r, idx, arr) => ({
          ...r,
          rank: idx + 1,
          percentile: Math.max(1, Math.round(((arr.length - idx) / arr.length) * 100)),
        }));

      const trendRows = await timed('stationComparison.trendRows', () =>
        this.execQuery(
          'stationComparison.trendRows',
          this.db
            .select({
              stationId: stations.id,
              value: sql<number>`coalesce(sum(${salesTransactions.totalAmount})::numeric, 0)`,
            })
            .from(salesTransactions)
            .innerJoin(branches, eq(salesTransactions.branchId, branches.id))
            .innerJoin(stations, eq(branches.stationId, stations.id))
            .where(this.salesWhere(filters))
            .groupBy(stations.id)
            .orderBy(stations.id),
        ),
      );

      const trendByStation = new Map<string, { value: number }[]>();
      for (const t of trendRows) {
        trendByStation.set(t.stationId, [{ value: Number(t.value) }]);
      }

      return ranked.map((r) => ({
        ...r,
        trend: trendByStation.get(r.id) ?? [],
      }));
    });
  }

  private async getOverviewKpis(filters: ReportsQueryDto) {
    const [salesRow] = await this.execQuery(
      'overview.kpis.sales',
      this.db
        .select({
          revenue: sql<number>`coalesce(sum(${salesTransactions.totalAmount})::numeric, 0)`,
        })
        .from(salesTransactions)
        .innerJoin(branches, eq(salesTransactions.branchId, branches.id))
        .where(this.salesWhere(filters)),
    );

    const [litersRow] = await this.execQuery(
      'overview.kpis.litersAndCogs',
      this.db
        .select({
          liters: sql<number>`coalesce(sum(${saleItems.quantity})::numeric, 0)`,
          cogs: sql<number>`coalesce(sum(${saleItems.quantity} * ${saleItems.unitPrice} * 0.75)::numeric, 0)`,
        })
        .from(saleItems)
        .innerJoin(salesTransactions, eq(saleItems.saleTransactionId, salesTransactions.id))
        .innerJoin(branches, eq(salesTransactions.branchId, branches.id))
        .where(this.salesItemsWhere(filters)),
    );

    const [varianceRow] = await this.execQuery(
      'overview.kpis.variance',
      this.db
        .select({
          avgAbs: sql<number>`coalesce(avg(abs(${variances.volumeVariance}))::numeric, 0)`,
        })
        .from(variances)
        .innerJoin(branches, eq(variances.branchId, branches.id))
        .leftJoin(tanks, eq(variances.tankId, tanks.id))
        .where(this.varianceWhere(filters)),
    );

    const [arRow] = await this.execQuery(
      'overview.kpis.arOverdue',
      this.db
        .select({
          overdue: sql<number>`coalesce(sum(case when ${creditInvoices.dueDate} < now() and ${creditInvoices.balanceRemaining} > 0 then ${creditInvoices.balanceRemaining} else 0 end)::numeric, 0)`,
        })
        .from(creditInvoices)
        .innerJoin(branches, eq(creditInvoices.branchId, branches.id))
        .where(this.creditWhere(filters)),
    );

    const [apRow] = await this.execQuery(
      'overview.kpis.apOverdue',
      this.db
        .select({
          overdue: sql<number>`coalesce(sum(case when ${supplierInvoices.dueDate} < now() and ${supplierInvoices.balanceRemaining} > 0 then ${supplierInvoices.balanceRemaining} else 0 end)::numeric, 0)`,
        })
        .from(supplierInvoices)
        .innerJoin(branches, eq(supplierInvoices.branchId, branches.id))
        .where(this.payablesWhere(filters)),
    );

    const revenue = Number(salesRow?.revenue ?? 0);
    const liters = Number(litersRow?.liters ?? 0);
    const cogs = Number(litersRow?.cogs ?? 0);
    const margin = revenue - cogs;
    return {
      totalSales: { value: revenue, change: 0, trend: 'neutral' },
      litersSold: { value: liters, change: 0, trend: 'neutral' },
      grossMargin: { value: Number(margin.toFixed(2)), change: 0, trend: 'neutral' },
      shrinkage: { value: Number(Number(varianceRow?.avgAbs ?? 0).toFixed(3)), change: 0, trend: 'neutral' },
      receivables: { value: Number(arRow?.overdue ?? 0), change: 0, trend: 'neutral' },
      payables: { value: Number(apRow?.overdue ?? 0), change: 0, trend: 'neutral' },
    };
  }

  private async getSalesTrend(filters: ReportsQueryDto) {
    const rows = await this.execQuery(
      'overview.salesTrend.rows',
      this.db
        .select({
          date: sql<string>`to_char(date_trunc('day', ${salesTransactions.transactionDate}), 'YYYY-MM-DD')`,
          amount: sql<number>`coalesce(sum(${salesTransactions.totalAmount})::numeric, 0)`,
        })
        .from(salesTransactions)
        .innerJoin(branches, eq(salesTransactions.branchId, branches.id))
        .where(this.salesWhere(filters))
        .groupBy(sql`date_trunc('day', ${salesTransactions.transactionDate})`)
        .orderBy(sql`date_trunc('day', ${salesTransactions.transactionDate})`),
    );
    return rows.map((r) => ({ date: r.date, amount: Number(r.amount) }));
  }

  private async getPaymentMix(filters: ReportsQueryDto) {
    const rows = await this.execQuery(
      'overview.paymentMix.rows',
      this.db
        .select({
          name: salePayments.paymentMethod,
          value: sql<number>`coalesce(sum(${salePayments.amount})::numeric, 0)`,
        })
        .from(salePayments)
        .innerJoin(salesTransactions, eq(salePayments.saleTransactionId, salesTransactions.id))
        .innerJoin(branches, eq(salesTransactions.branchId, branches.id))
        .where(this.salesWhere(filters))
        .groupBy(salePayments.paymentMethod)
        .orderBy(desc(sql`sum(${salePayments.amount})`)),
    );
    return rows.map((r) => ({ name: r.name, value: Number(r.value) }));
  }

  private async getVarianceByStation(filters: ReportsQueryDto) {
    const rows = await this.execQuery(
      'overview.varianceByStation.rows',
      this.db
        .select({
          station: stations.name,
          variance: sql<number>`coalesce(sum(${reconciliations.variance})::numeric, 0)`,
        })
        .from(reconciliations)
        .innerJoin(branches, eq(reconciliations.branchId, branches.id))
        .innerJoin(stations, eq(branches.stationId, stations.id))
        .where(this.reconciliationWhere(filters))
        .groupBy(stations.name)
        .orderBy(desc(sql`abs(sum(${reconciliations.variance}))`))
        .limit(10),
    );
    return rows.map((r) => ({
      station: r.station,
      variance: Number(r.variance.toFixed(3)),
      status: Math.abs(Number(r.variance)) > 500 ? 'Critical' : 'Normal',
    }));
  }

  private async getTopDebtors(filters: ReportsQueryDto, limit = 10) {
    const rows = await this.execQuery(
      'topDebtors.baseRows',
      this.db
        .select({
          id: customers.id,
          name: customers.name,
          balance: customers.balance,
          limit: customers.creditLimit,
        })
        .from(customers)
        .innerJoin(branches, eq(customers.branchId, branches.id))
        .where(this.customerWhere(filters))
        .orderBy(desc(customers.balance))
        .limit(limit),
    );

    const ids = rows.map((r) => r.id);
    const paymentRows = ids.length
      ? await this.execQuery(
          'topDebtors.paymentRows',
          this.db
            .select({
              customerId: payments.customerId,
              paymentNumber: payments.paymentNumber,
              amount: payments.amount,
              paymentDate: payments.paymentDate,
            })
            .from(payments)
            .where(and(inArray(payments.customerId, ids), isNull(payments.deletedAt)))
            .orderBy(desc(payments.paymentDate)),
        )
      : [];
    const invoiceRows = ids.length
      ? await this.execQuery(
          'topDebtors.invoiceRows',
          this.db
            .select({
              customerId: creditInvoices.customerId,
              invoiceNumber: creditInvoices.invoiceNumber,
              amount: creditInvoices.balanceRemaining,
              invoiceDate: creditInvoices.invoiceDate,
              dueDate: creditInvoices.dueDate,
            })
            .from(creditInvoices)
            .where(and(inArray(creditInvoices.customerId, ids), isNull(creditInvoices.deletedAt)))
            .orderBy(desc(creditInvoices.invoiceDate)),
        )
      : [];

    const paymentsByCustomer = new Map<string, { id: string; date: string; amount: number }[]>();
    for (const p of paymentRows) {
      const curr = paymentsByCustomer.get(p.customerId) ?? [];
      curr.push({
        id: p.paymentNumber,
        date: new Date(p.paymentDate).toISOString().slice(0, 10),
        amount: Number(p.amount),
      });
      paymentsByCustomer.set(p.customerId, curr.slice(0, 5));
    }

    const invoicesByCustomer = new Map<string, { id: string; date: string; amount: number; status: string }[]>();
    for (const inv of invoiceRows) {
      const curr = invoicesByCustomer.get(inv.customerId) ?? [];
      const overdue = new Date(inv.dueDate).getTime() < Date.now() && Number(inv.amount) > 0;
      curr.push({
        id: inv.invoiceNumber,
        date: new Date(inv.invoiceDate).toISOString().slice(0, 10),
        amount: Number(inv.amount),
        status: overdue ? 'Overdue' : 'Pending',
      });
      invoicesByCustomer.set(inv.customerId, curr.slice(0, 5));
    }

    return rows.map((r) => {
      const bal = Number(r.balance);
      const lim = Number(r.limit) || 1;
      const util = Math.min(999, (bal / lim) * 100);
      const customerPayments = paymentsByCustomer.get(r.id) ?? [];
      return {
        id: r.id,
        name: r.name,
        balance: bal,
        limit: Number(r.limit),
        utilization: Number(util.toFixed(1)),
        status: util > 90 ? 'At Risk' : 'Healthy',
        lastPaymentAmount: customerPayments[0]?.amount ?? 0,
        lastPayment: customerPayments[0]?.date ?? null,
        invoices: invoicesByCustomer.get(r.id) ?? [],
        payments: customerPayments,
      };
    });
  }

  private async getShiftPerformance(filters: ReportsQueryDto) {
    const rows = await this.execQuery(
      'dailyOperations.shiftPerformance.rows',
      this.db
        .select({
          id: shifts.id,
          startTime: shifts.startTime,
          endTime: shifts.endTime,
          status: shifts.status,
          cashierName: users.name,
          expectedSales: sql<number>`coalesce(${shifts.totalExpectedAmount}::numeric, 0)`,
          actualSales: sql<number>`coalesce(${shifts.totalCollectedAmount}::numeric, 0)`,
          variance: sql<number>`coalesce(${shifts.varianceAmount}::numeric, 0)`,
        })
        .from(shifts)
        .leftJoin(users, eq(shifts.openedBy, users.id))
        .where(this.shiftWhere(filters))
        .orderBy(desc(shifts.startTime))
        .limit(100),
    );
    return rows.map((r) => {
      const expected = Number(r.expectedSales);
      const actual = Number(r.actualSales);
      const eff = expected > 0 ? (actual / expected) * 100 : 0;
      return {
        id: r.id,
        startTime: r.startTime,
        endTime: r.endTime,
        status: r.status,
        cashierName: r.cashierName ?? 'Unassigned',
        expectedSales: expected,
        actualSales: actual,
        variance: Number(r.variance),
        efficiency: Number(eff.toFixed(1)),
      };
    });
  }

  private async getPumpPerformance(filters: ReportsQueryDto) {
    const rows = await this.execQuery(
      'dailyOperations.pumpPerformance.rows',
      this.db
        .select({
          pumpCode: sql<string>`${nozzles.code}`,
          nozzleCode: nozzles.code,
          product: products.name,
          liters: sql<number>`coalesce(max(case when ${meterReadings.readingType} = 'closing' then ${meterReadings.value} end) - min(case when ${meterReadings.readingType} = 'opening' then ${meterReadings.value} end), 0)::numeric`,
          avgPrice: sql<number>`coalesce(avg(${meterReadings.pricePerUnit})::numeric, 0)`,
        })
        .from(meterReadings)
        .innerJoin(shifts, eq(meterReadings.shiftId, shifts.id))
        .innerJoin(nozzles, eq(meterReadings.nozzleId, nozzles.id))
        .innerJoin(products, eq(nozzles.productId, products.id))
        .where(this.meterWhere(filters))
        .groupBy(nozzles.code, products.name)
        .orderBy(desc(sql`coalesce(max(case when ${meterReadings.readingType} = 'closing' then ${meterReadings.value} end) - min(case when ${meterReadings.readingType} = 'opening' then ${meterReadings.value} end), 0)`)),
    );

    return rows.map((r) => {
      const liters = Math.max(0, Number(r.liters));
      const revenue = liters * Number(r.avgPrice);
      const uptime = liters > 0 ? Math.min(99.9, 70 + liters / 100) : 0;
      return {
        id: r.pumpCode,
        nozzle: r.nozzleCode,
        product: r.product,
        liters: Number(liters.toFixed(3)),
        revenue: Number(revenue.toFixed(2)),
        uptime: Number(uptime.toFixed(1)),
        status: uptime < 90 ? 'Low Usage' : 'Healthy',
      };
    });
  }

  private async getTankLossRows(filters: ReportsQueryDto) {
    const rows = await this.execQuery(
      'stockLoss.tankLossRows.rows',
      this.db
        .select({
          tankId: tanks.id,
          station: stations.name,
          product: products.name,
          currentLevel: tanks.currentLevel,
          variance: sql<number>`coalesce(sum(${variances.volumeVariance})::numeric, 0)`,
        })
        .from(tanks)
        .innerJoin(branches, eq(tanks.branchId, branches.id))
        .innerJoin(stations, eq(branches.stationId, stations.id))
        .leftJoin(products, eq(tanks.productId, products.id))
        .leftJoin(
          variances,
          and(eq(variances.tankId, tanks.id), isNull(variances.deletedAt)),
        )
        .where(this.tankWhere(filters))
        .groupBy(tanks.id, stations.name, products.name, tanks.currentLevel)
        .orderBy(desc(sql`abs(coalesce(sum(${variances.volumeVariance}), 0))`)),
    );

    return rows.map((r) => {
      const actual = Number(r.currentLevel);
      const variance = Number(r.variance);
      const expected = actual - variance;
      const variancePct = expected !== 0 ? (variance / Math.abs(expected)) * 100 : 0;
      return {
        tankId: r.tankId,
        station: r.station,
        product: r.product ?? 'Unknown',
        expected: Number(expected.toFixed(3)),
        actual: Number(actual.toFixed(3)),
        variance: Number(variance.toFixed(3)),
        variancePct: Number(variancePct.toFixed(3)),
      };
    });
  }
  private async getShrinkageTrend(filters: ReportsQueryDto) {
    const rows = await this.execQuery(
      'stockLoss.shrinkageTrend.rows',
      this.db
        .select({
          date: sql<string>`to_char(date_trunc('day', ${variances.varianceDate}), 'YYYY-MM-DD')`,
          rate: sql<number>`coalesce(avg(abs(${variances.volumeVariance}))::numeric, 0)`,
        })
        .from(variances)
        .innerJoin(branches, eq(variances.branchId, branches.id))
        .leftJoin(tanks, eq(variances.tankId, tanks.id))
        .where(this.varianceWhere(filters))
        .groupBy(sql`date_trunc('day', ${variances.varianceDate})`)
        .orderBy(sql`date_trunc('day', ${variances.varianceDate})`),
    );
    return rows.map((r) => ({ date: r.date, rate: Number(r.rate) }));
  }

  private async getDeliveryReconciliation(filters: ReportsQueryDto) {
    const rows = await this.execQuery(
      'stockLoss.deliveryReconciliation.rows',
      this.db
        .select({
          id: deliveries.id,
          date: sql<string>`to_char(${deliveries.expectedDate}, 'YYYY-MM-DD')`,
          ordered: deliveries.orderedQty,
          received: deliveries.receivedQty,
        })
        .from(deliveries)
        .innerJoin(branches, eq(deliveries.branchId, branches.id))
        .where(this.deliveryWhere(filters))
        .orderBy(desc(deliveries.expectedDate))
        .limit(100),
    );

    return rows.map((r) => {
      const ordered = Number(r.ordered);
      const received = Number(r.received ?? 0);
      return {
        id: r.id,
        date: r.date,
        ordered,
        billOfLading: ordered,
        received,
        variance: Number((received - ordered).toFixed(3)),
      };
    });
  }

  private async getProfitabilityMetrics(filters: ReportsQueryDto) {
    const [row] = await this.execQuery(
      'profitability.metrics.rows',
      this.db
        .select({
          revenue: sql<number>`coalesce(sum(${salesTransactions.totalAmount})::numeric, 0)`,
          liters: sql<number>`coalesce(sum(${saleItems.quantity})::numeric, 0)`,
        })
        .from(salesTransactions)
        .innerJoin(saleItems, eq(saleItems.saleTransactionId, salesTransactions.id))
        .innerJoin(branches, eq(salesTransactions.branchId, branches.id))
        .where(this.salesItemsWhere(filters)),
    );
    const revenue = Number(row?.revenue ?? 0);
    const liters = Number(row?.liters ?? 0);
    const cogs = liters * 0.75;
    const gross = revenue - cogs;
    const net = gross;
    const opexRatio = revenue > 0 ? (revenue - net) / revenue : 0;
    return {
      grossProfit: { value: Number(gross.toFixed(2)), change: 0, trend: 'neutral' },
      netProfit: { value: Number(net.toFixed(2)), change: 0, trend: 'neutral' },
      marginPerLiter: { value: liters > 0 ? Number((gross / liters).toFixed(3)) : 0, change: 0, trend: 'neutral' },
      opexRatio: { value: Number((opexRatio * 100).toFixed(2)), change: 0, trend: 'neutral' },
    };
  }

  private async getMarginByProduct(filters: ReportsQueryDto) {
    const rows = await this.execQuery(
      'profitability.marginByProduct.rows',
      this.db
        .select({
          name: products.name,
          revenue: sql<number>`coalesce(sum(${saleItems.totalAmount})::numeric, 0)`,
          liters: sql<number>`coalesce(sum(${saleItems.quantity})::numeric, 0)`,
        })
        .from(saleItems)
        .innerJoin(salesTransactions, eq(saleItems.saleTransactionId, salesTransactions.id))
        .innerJoin(products, eq(saleItems.productId, products.id))
        .innerJoin(branches, eq(salesTransactions.branchId, branches.id))
        .where(this.salesItemsWhere(filters))
        .groupBy(products.name)
        .orderBy(desc(sql`sum(${saleItems.totalAmount})`)),
    );

    return rows.map((r) => {
      const revenue = Number(r.revenue);
      const liters = Number(r.liters);
      const cogs = liters * 0.75;
      const margin = revenue - cogs;
      return {
        name: r.name,
        revenue: Number(revenue.toFixed(2)),
        margin: Number(margin.toFixed(2)),
        marginPerLiter: liters > 0 ? Number((margin / liters).toFixed(3)) : 0,
      };
    });
  }

  private async getStationContribution(filters: ReportsQueryDto) {
    const rows = await this.execQuery(
      'stationContribution.rows',
      this.db
        .select({
          id: stations.id,
          name: stations.name,
          location: stations.location,
          revenue: sql<number>`coalesce(sum(${salesTransactions.totalAmount})::numeric, 0)`,
          liters: sql<number>`coalesce(sum(${saleItems.quantity})::numeric, 0)`,
        })
        .from(stations)
        .leftJoin(branches, eq(branches.stationId, stations.id))
        .leftJoin(salesTransactions, eq(salesTransactions.branchId, branches.id))
        .leftJoin(saleItems, eq(saleItems.saleTransactionId, salesTransactions.id))
        .where(this.stationAggregateWhere(filters))
        .groupBy(stations.id, stations.name, stations.location),
    );

    const totalRevenue = rows.reduce((acc, r) => acc + Number(r.revenue), 0);
    const totalOpex = 0;
    return rows.map((r) => {
      const revenue = Number(r.revenue);
      const liters = Number(r.liters);
      const gross = revenue - liters * 0.75;
      const allocatedOpEx = totalRevenue > 0 ? (revenue / totalRevenue) * totalOpex : 0;
      const contribution = gross - allocatedOpEx;
      const marginPct = revenue > 0 ? (gross / revenue) * 100 : 0;
      return {
        id: r.id,
        name: r.name,
        location: r.location ?? '',
        sales: Number(revenue.toFixed(2)),
        liters: Number(liters.toFixed(3)),
        grossMargin: Number(gross.toFixed(2)),
        allocatedOpEx: Number(allocatedOpEx.toFixed(2)),
        contribution: Number(contribution.toFixed(2)),
        marginPct: Number(marginPct.toFixed(2)),
        shrinkagePct: 0,
        varianceCount: 0,
        overdueAR: 0,
        expenseRatio: 0,
      };
    });
  }

  private getPriceImpactSimulation() {
    const baseLit = 50000;
    const beforePrice = 1.35;
    const afterPrice = 1.45;
    const cogs = 0.75;
    const before = {
      revenue: baseLit * beforePrice,
      margin: baseLit * (beforePrice - cogs),
    };
    const after = {
      revenue: baseLit * afterPrice,
      margin: baseLit * (afterPrice - cogs),
    };
    return {
      before,
      after,
      delta: {
        revenue: Number((after.revenue - before.revenue).toFixed(2)),
        margin: Number((after.margin - before.margin).toFixed(2)),
      },
    };
  }

  private async getCreditAging(filters: ReportsQueryDto) {
    const rows = await this.execQuery(
      'creditCashflow.creditAging.rows',
      this.db
        .select({
          dueDate: creditInvoices.dueDate,
          amount: creditInvoices.balanceRemaining,
        })
        .from(creditInvoices)
        .innerJoin(branches, eq(creditInvoices.branchId, branches.id))
        .where(this.creditWhere(filters)),
    );
    const now = Date.now();
    const buckets = [
      { bucket: '0-30 Days', amount: 0, color: '#3b82f6' },
      { bucket: '31-60 Days', amount: 0, color: '#10b981' },
      { bucket: '61-90 Days', amount: 0, color: '#f59e0b' },
      { bucket: '90+ Days', amount: 0, color: '#ef4444' },
    ];
    for (const r of rows) {
      const days = Math.floor((now - new Date(r.dueDate).getTime()) / 86400000);
      const amt = Number(r.amount);
      const index = days <= 30 ? 0 : days <= 60 ? 1 : days <= 90 ? 2 : 3;
      buckets[index].amount += amt;
    }
    const total = buckets.reduce((acc, b) => acc + b.amount, 0) || 1;
    return buckets.map((b) => ({
      bucket: b.bucket,
      amount: Number(b.amount.toFixed(2)),
      percentage: Number(((b.amount / total) * 100).toFixed(1)),
      color: b.color,
    }));
  }

  private async getPayablesAging(filters: ReportsQueryDto) {
    const rows = await this.execQuery(
      'creditCashflow.payablesAging.rows',
      this.db
        .select({
          dueDate: supplierInvoices.dueDate,
          amount: supplierInvoices.balanceRemaining,
        })
        .from(supplierInvoices)
        .innerJoin(branches, eq(supplierInvoices.branchId, branches.id))
        .where(this.payablesWhere(filters)),
    );
    const now = Date.now();
    let dueNow = 0;
    let next7 = 0;
    let next30 = 0;
    for (const r of rows) {
      const days = Math.floor((new Date(r.dueDate).getTime() - now) / 86400000);
      const amt = Number(r.amount);
      if (days <= 0) dueNow += amt;
      else if (days <= 7) next7 += amt;
      else if (days <= 30) next30 += amt;
    }
    return [
      { bucket: 'Due Now', amount: Number(dueNow.toFixed(2)), color: '#ef4444' },
      { bucket: 'Next 7 Days', amount: Number(next7.toFixed(2)), color: '#f59e0b' },
      { bucket: 'Next 30 Days', amount: Number(next30.toFixed(2)), color: '#3b82f6' },
    ];
  }

  private salesWhere(filters: ReportsQueryDto) {
    const c = [isNull(salesTransactions.deletedAt)];
    if (filters.companyId) c.push(eq(salesTransactions.companyId, filters.companyId));
    if (filters.branchId) c.push(eq(salesTransactions.branchId, filters.branchId));
    if (filters.stationId) c.push(eq(branches.stationId, filters.stationId));
    if (filters.dateFrom) c.push(gte(salesTransactions.transactionDate, new Date(filters.dateFrom)));
    if (filters.dateTo) c.push(lte(salesTransactions.transactionDate, new Date(filters.dateTo)));
    return and(...c);
  }

  private salesItemsWhere(filters: ReportsQueryDto) {
    const c = [isNull(salesTransactions.deletedAt), isNull(saleItems.deletedAt)];
    if (filters.companyId) c.push(eq(salesTransactions.companyId, filters.companyId));
    if (filters.branchId) c.push(eq(salesTransactions.branchId, filters.branchId));
    if (filters.stationId) c.push(eq(branches.stationId, filters.stationId));
    if (filters.productId) c.push(eq(saleItems.productId, filters.productId));
    if (filters.dateFrom) c.push(gte(salesTransactions.transactionDate, new Date(filters.dateFrom)));
    if (filters.dateTo) c.push(lte(salesTransactions.transactionDate, new Date(filters.dateTo)));
    return and(...c);
  }

  private varianceWhere(filters: ReportsQueryDto) {
    const c = [isNull(variances.deletedAt)];
    if (filters.companyId) c.push(eq(variances.companyId, filters.companyId));
    if (filters.branchId) c.push(eq(variances.branchId, filters.branchId));
    if (filters.stationId) c.push(eq(branches.stationId, filters.stationId));
    if (filters.productId) c.push(eq(tanks.productId, filters.productId));
    if (filters.dateFrom) c.push(gte(variances.varianceDate, new Date(filters.dateFrom)));
    if (filters.dateTo) c.push(lte(variances.varianceDate, new Date(filters.dateTo)));
    return and(...c);
  }

  private reconciliationWhere(filters: ReportsQueryDto) {
    const c = [isNull(reconciliations.deletedAt)];
    if (filters.companyId) c.push(eq(reconciliations.companyId, filters.companyId));
    if (filters.branchId) c.push(eq(reconciliations.branchId, filters.branchId));
    if (filters.stationId) c.push(eq(branches.stationId, filters.stationId));
    if (filters.dateFrom) c.push(gte(reconciliations.reconciliationDate, new Date(filters.dateFrom)));
    if (filters.dateTo) c.push(lte(reconciliations.reconciliationDate, new Date(filters.dateTo)));
    return and(...c);
  }

  private shiftWhere(filters: ReportsQueryDto) {
    const c = [isNull(shifts.deletedAt)];
    if (filters.companyId) c.push(eq(shifts.companyId, filters.companyId));
    if (filters.branchId) c.push(eq(shifts.branchId, filters.branchId));
    if (filters.stationId) c.push(eq(shifts.stationId, filters.stationId));
    if (filters.dateFrom) c.push(gte(shifts.startTime, new Date(filters.dateFrom)));
    if (filters.dateTo) c.push(lte(shifts.startTime, new Date(filters.dateTo)));
    return and(...c);
  }

  private meterWhere(filters: ReportsQueryDto) {
    const c = [isNull(meterReadings.deletedAt), isNull(shifts.deletedAt)];
    if (filters.companyId) c.push(eq(shifts.companyId, filters.companyId));
    if (filters.branchId) c.push(eq(shifts.branchId, filters.branchId));
    if (filters.stationId) c.push(eq(shifts.stationId, filters.stationId));
    if (filters.productId) c.push(eq(nozzles.productId, filters.productId));
    if (filters.dateFrom) c.push(gte(shifts.startTime, new Date(filters.dateFrom)));
    if (filters.dateTo) c.push(lte(shifts.startTime, new Date(filters.dateTo)));
    return and(...c);
  }

  private deliveryWhere(filters: ReportsQueryDto) {
    const c = [isNull(deliveries.deletedAt)];
    if (filters.companyId) c.push(eq(deliveries.companyId, filters.companyId));
    if (filters.branchId) c.push(eq(deliveries.branchId, filters.branchId));
    if (filters.stationId) c.push(eq(branches.stationId, filters.stationId));
    if (filters.productId) c.push(eq(deliveries.productId, filters.productId));
    if (filters.dateFrom) c.push(gte(deliveries.expectedDate, new Date(filters.dateFrom)));
    if (filters.dateTo) c.push(lte(deliveries.expectedDate, new Date(filters.dateTo)));
    return and(...c);
  }

  private tankWhere(filters: ReportsQueryDto) {
    const c = [isNull(tanks.deletedAt)];
    if (filters.companyId) c.push(eq(tanks.companyId, filters.companyId));
    if (filters.branchId) c.push(eq(tanks.branchId, filters.branchId));
    if (filters.stationId) c.push(eq(branches.stationId, filters.stationId));
    if (filters.productId) c.push(eq(tanks.productId, filters.productId));
    return and(...c);
  }

  private creditWhere(filters: ReportsQueryDto) {
    const c = [isNull(creditInvoices.deletedAt)];
    if (filters.companyId) c.push(eq(creditInvoices.companyId, filters.companyId));
    if (filters.branchId) c.push(eq(creditInvoices.branchId, filters.branchId));
    if (filters.stationId) c.push(eq(branches.stationId, filters.stationId));
    if (filters.dateFrom) c.push(gte(creditInvoices.invoiceDate, new Date(filters.dateFrom)));
    if (filters.dateTo) c.push(lte(creditInvoices.invoiceDate, new Date(filters.dateTo)));
    return and(...c);
  }

  private payablesWhere(filters: ReportsQueryDto) {
    const c = [isNull(supplierInvoices.deletedAt)];
    if (filters.companyId) c.push(eq(supplierInvoices.companyId, filters.companyId));
    if (filters.branchId) c.push(eq(supplierInvoices.branchId, filters.branchId));
    if (filters.stationId) c.push(eq(branches.stationId, filters.stationId));
    if (filters.dateFrom) c.push(gte(supplierInvoices.invoiceDate, new Date(filters.dateFrom)));
    if (filters.dateTo) c.push(lte(supplierInvoices.invoiceDate, new Date(filters.dateTo)));
    return and(...c);
  }

  private customerWhere(filters: ReportsQueryDto) {
    const c = [isNull(customers.deletedAt)];
    if (filters.companyId) c.push(eq(customers.companyId, filters.companyId));
    if (filters.branchId) c.push(eq(customers.branchId, filters.branchId));
    if (filters.stationId) c.push(eq(branches.stationId, filters.stationId));
    return and(...c);
  }

  private stationAggregateWhere(filters: ReportsQueryDto) {
    const c = [isNull(stations.deletedAt)];
    if (filters.companyId) c.push(eq(stations.companyId, filters.companyId));
    if (filters.stationId) c.push(eq(stations.id, filters.stationId));
    if (filters.branchId) c.push(eq(branches.id, filters.branchId));
    if (filters.dateFrom) c.push(gte(salesTransactions.transactionDate, new Date(filters.dateFrom)));
    if (filters.dateTo) c.push(lte(salesTransactions.transactionDate, new Date(filters.dateTo)));
    return and(...c);
  }

  private async runReport<T>(
    scope: string,
    filters: ReportsQueryDto,
    ctx: ReportPerfContext | undefined,
    compute: (
      timed: <R>(name: string, fn: () => Promise<R>) => Promise<R>,
      recordSource: (section: string, source: 'views' | 'raw') => void,
    ) => Promise<T>,
  ): Promise<T> {
    const started = performance.now();
    const timings: Record<string, number> = {};
    const dataSource: Record<string, 'views' | 'raw'> = {};
    const key = this.buildCacheKey(scope, filters, ctx?.scope);
    const now = Date.now();
    const shouldCache = this.cacheEnabled;

    if (shouldCache) {
      const hit = this.cache.get(key, now);
      if (hit !== null) {
        this.logCacheMetric(scope, 'cache_hit', ctx, filters);
        this.logPerf(scope, ctx, filters, performance.now() - started, {}, true, {});
        return hit as T;
      }
      this.logCacheMetric(scope, 'cache_miss', ctx, filters);
    }

    const timed = async <R>(name: string, fn: () => Promise<R>): Promise<R> => {
      const t0 = performance.now();
      const result = await fn();
      timings[name] = Number((performance.now() - t0).toFixed(2));
      return result;
    };
    const recordSource = (section: string, source: 'views' | 'raw') => {
      dataSource[section] = source;
    };

    const value = await compute(timed, recordSource);
    if (shouldCache) {
      const ttlMs = this.getCacheTtlMs(scope);
      this.cache.set(key, value, ttlMs, Date.now());
    }
    this.logPerf(scope, ctx, filters, performance.now() - started, timings, false, dataSource);
    return value;
  }

  private getCacheTtlMs(scope: string): number {
    return this.cacheTtlByReportMs[scope] ?? this.cacheDefaultTtlMs;
  }

  private buildCacheKey(scope: string, filters: ReportsQueryDto, scopeContext?: ReportScopeContext): string {
    return this.stableStringify({
      endpoint: scope,
      filters: this.normalizeFilters(filters),
      scope: this.normalizeScope(scopeContext),
    });
  }

  private normalizeFilters(filters: ReportsQueryDto): Record<string, string> {
    return {
      branchId: filters.branchId ?? '',
      companyId: filters.companyId ?? '',
      dateFrom: filters.dateFrom ?? '',
      dateTo: filters.dateTo ?? '',
      productId: filters.productId ?? '',
      stationId: filters.stationId ?? '',
    };
  }

  private normalizeScope(scopeContext?: ReportScopeContext) {
    if (!scopeContext) {
      return { userId: 'anonymous', permissions: [], companyId: '', branchId: '' };
    }
    return {
      userId: scopeContext.userId,
      permissions: [...scopeContext.permissions].sort(),
      companyId: scopeContext.companyId ?? '',
      branchId: scopeContext.branchId ?? '',
    };
  }

  private stableStringify(value: unknown): string {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map((v) => this.stableStringify(v)).join(',')}]`;
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries
      .map(([k, v]) => `${JSON.stringify(k)}:${this.stableStringify(v)}`)
      .join(',')}}`;
  }

  private logCacheMetric(
    scope: string,
    metric: 'cache_hit' | 'cache_miss',
    ctx: ReportPerfContext | undefined,
    filters: ReportsQueryDto,
  ): void {
    if (metric === 'cache_hit') {
      this.opsMetrics.recordReportCacheHit();
    } else {
      this.opsMetrics.recordReportCacheMiss();
    }

    this.logger.log(
      JSON.stringify({
        event: metric,
        endpoint: ctx?.endpoint ?? `/reports/${scope}`,
        report: scope,
        correlationId: ctx?.correlationId ?? 'n/a',
        filters,
      }),
      'ReportsCache',
    );
  }

  private logPerf(
    scope: string,
    ctx: ReportPerfContext | undefined,
    filters: ReportsQueryDto,
    totalMs: number,
    subqueries: Record<string, number>,
    cacheHit: boolean,
    dataSource: Record<string, 'views' | 'raw'> = {},
  ): void {
    const roundedTotalMs = Number(totalMs.toFixed(2));
    this.logger.log(
      JSON.stringify({
        event: 'reports.timing',
        endpoint: ctx?.endpoint ?? `/reports/${scope}`,
        report: scope,
        correlationId: ctx?.correlationId ?? 'n/a',
        filters,
        totalMs: roundedTotalMs,
        cacheHit,
        dataSource,
        subqueries,
      }),
      'ReportsPerf',
    );

    if (roundedTotalMs >= this.slowQueryWarnThresholdMs) {
      this.logger.warn(
        JSON.stringify({
          event: 'reports.slow_query',
          endpoint: ctx?.endpoint ?? `/reports/${scope}`,
          report: scope,
          correlationId: ctx?.correlationId ?? 'n/a',
          thresholdMs: this.slowQueryWarnThresholdMs,
          totalMs: roundedTotalMs,
          cacheHit,
          filters,
          subqueries,
        }),
        'ReportsPerf',
      );
    }
  }

  private async execQuery<T>(
    label: string,
    query: Promise<T> & { toSQL?: () => { sql: string; params: unknown[] } },
  ): Promise<T> {
    const sqlMeta = this.explainEnabled ? query.toSQL?.() : null;
    const result = await query;
    if (this.explainEnabled && sqlMeta) {
      await this.logExplain(label, sqlMeta.sql, sqlMeta.params);
    }
    return result;
  }

  private async logExplain(label: string, sqlText: string, params: unknown[]): Promise<void> {
    try {
      const explainSql = this.inlineSql(sqlText, params);
      const rows = await this.db.execute(
        sql.raw(`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${explainSql}`),
      );
      this.logger.debug(
        JSON.stringify({
          event: 'reports.explain',
          label,
          sql: sqlText,
          params,
          plan: rows,
        }),
        'ReportsExplain',
      );
    } catch (err) {
      this.logger.warn(`reports.explain_failed label=${label} reason=${(err as Error).message}`, 'ReportsExplain');
    }
  }

  private inlineSql(sqlText: string, params: unknown[]): string {
    return params.reduce<string>((acc, p, idx) => {
      const token = new RegExp(`\\$${idx + 1}(?!\\d)`, 'g');
      return acc.replace(token, this.toSqlLiteral(p));
    }, sqlText);
  }

  private toSqlLiteral(value: unknown): string {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'number' || typeof value === 'bigint') return String(value);
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (value instanceof Date) return `'${value.toISOString().replace(/'/g, "''")}'`;
    const str = String(value).replace(/'/g, "''");
    return `'${str}'`;
  }
}
