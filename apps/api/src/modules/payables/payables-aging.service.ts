import { Injectable } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../../database/database.module';
import type * as schema from '../../database/schema';
import { supplierInvoices } from '../../database/schema/payables/supplier-invoices';

type Schema = typeof schema;

export interface PayablesAgingBucket {
  bucket: string;
  fromDays: number;
  toDays: number | null;
  amount: number;
  count: number;
}

export interface PayablesAgingReport {
  asOf: string;
  branchId?: string;
  companyId?: string;
  buckets: PayablesAgingBucket[];
  total: number;
}

@Injectable()
export class PayablesAgingService {
  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase<Schema>) {}

  async getAging(params: { branchId?: string; companyId?: string; asOf?: string }): Promise<PayablesAgingReport> {
    const asOf = params.asOf ? new Date(params.asOf) : new Date();
    const conditions = [isNull(supplierInvoices.deletedAt), sql`${supplierInvoices.balanceRemaining} > 0`];
    if (params.branchId) conditions.push(eq(supplierInvoices.branchId, params.branchId));
    if (params.companyId) conditions.push(eq(supplierInvoices.companyId, params.companyId));
    const w = and(...conditions);
    const rows = await this.db.select({
      id: supplierInvoices.id,
      dueDate: supplierInvoices.dueDate,
      balanceRemaining: supplierInvoices.balanceRemaining,
    }).from(supplierInvoices).where(w);
    const buckets: PayablesAgingBucket[] = [
      { bucket: 'current', fromDays: 0, toDays: 0, amount: 0, count: 0 },
      { bucket: '1-30', fromDays: 1, toDays: 30, amount: 0, count: 0 },
      { bucket: '31-60', fromDays: 31, toDays: 60, amount: 0, count: 0 },
      { bucket: '61-90', fromDays: 61, toDays: 90, amount: 0, count: 0 },
      { bucket: '90+', fromDays: 91, toDays: null, amount: 0, count: 0 },
    ];
    const asOfTime = asOf.getTime();
    let total = 0;
    for (const row of rows) {
      const due = new Date(row.dueDate).getTime();
      const daysOverdue = Math.floor((asOfTime - due) / (24 * 60 * 60 * 1000));
      const amount = Number(row.balanceRemaining || 0);
      total += amount;
      if (daysOverdue <= 0) { buckets[0].amount += amount; buckets[0].count += 1; }
      else if (daysOverdue <= 30) { buckets[1].amount += amount; buckets[1].count += 1; }
      else if (daysOverdue <= 60) { buckets[2].amount += amount; buckets[2].count += 1; }
      else if (daysOverdue <= 90) { buckets[3].amount += amount; buckets[3].count += 1; }
      else { buckets[4].amount += amount; buckets[4].count += 1; }
    }
    return { asOf: asOf.toISOString().slice(0, 10), branchId: params.branchId, companyId: params.companyId, buckets, total: Math.round(total * 100) / 100 };
  }
}
