import { Injectable, NotFoundException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../../database/database.module';
import type * as schema from '../../database/schema';
import { suppliers } from '../../database/schema/payables/suppliers';
import { supplierInvoices } from '../../database/schema/payables/supplier-invoices';
import { supplierPayments } from '../../database/schema/payables/supplier-payments';
import { supplierPaymentAllocations } from '../../database/schema/payables/supplier-payment-allocations';

type Schema = typeof schema;

export interface SupplierStatementLine {
  date: string;
  type: 'invoice' | 'payment';
  reference: string;
  amount: number;
  runningBalance: number;
}

export interface SupplierStatement {
  supplierId: string;
  supplierName: string;
  dateFrom: string;
  dateTo: string;
  openingBalance: number;
  lines: SupplierStatementLine[];
  closingBalance: number;
}

@Injectable()
export class SupplierStatementService {
  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase<Schema>) {}

  async getStatement(supplierId: string, dateFrom: string, dateTo: string): Promise<SupplierStatement> {
    const [supplier] = await this.db
      .select({ id: suppliers.id, name: suppliers.name })
      .from(suppliers)
      .where(and(eq(suppliers.id, supplierId), isNull(suppliers.deletedAt)));
    if (!supplier) throw new NotFoundException('Supplier not found');

    const from = new Date(dateFrom);
    const to = new Date(dateTo);

    const invoicesBefore = await this.db
      .select({ totalAmount: supplierInvoices.totalAmount })
      .from(supplierInvoices)
      .where(and(
        eq(supplierInvoices.supplierId, supplierId),
        isNull(supplierInvoices.deletedAt),
        sql`${supplierInvoices.invoiceDate} < ${from}`,
      ));
    const paymentsBefore = await this.db
      .select({ amount: supplierPaymentAllocations.amount })
      .from(supplierPaymentAllocations)
      .innerJoin(supplierPayments, eq(supplierPaymentAllocations.paymentId, supplierPayments.id))
      .where(and(
        eq(supplierPayments.supplierId, supplierId),
        isNull(supplierPayments.deletedAt),
        sql`${supplierPayments.paymentDate} < ${from}`,
      ));
    const openingInvoices = invoicesBefore.reduce((s, i) => s + Number(i.totalAmount || 0), 0);
    const openingPayments = paymentsBefore.reduce((s, p) => s + Number(p.amount || 0), 0);
    const openingBalance = openingInvoices - openingPayments;

    const invoicesInPeriod = await this.db
      .select({
        id: supplierInvoices.id,
        invoiceNumber: supplierInvoices.invoiceNumber,
        invoiceDate: supplierInvoices.invoiceDate,
        totalAmount: supplierInvoices.totalAmount,
      })
      .from(supplierInvoices)
      .where(and(
        eq(supplierInvoices.supplierId, supplierId),
        isNull(supplierInvoices.deletedAt),
        sql`${supplierInvoices.invoiceDate} >= ${from}`,
        sql`${supplierInvoices.invoiceDate} <= ${to}`,
      ));
    const paymentsInPeriod = await this.db
      .select({
        id: supplierPayments.id,
        paymentDate: supplierPayments.paymentDate,
        amount: supplierPayments.amount,
        referenceNo: supplierPayments.referenceNo,
      })
      .from(supplierPayments)
      .where(and(
        eq(supplierPayments.supplierId, supplierId),
        isNull(supplierPayments.deletedAt),
        sql`${supplierPayments.paymentDate} >= ${from}`,
        sql`${supplierPayments.paymentDate} <= ${to}`,
      ));

    const lines: SupplierStatementLine[] = [];
    const invLines = invoicesInPeriod.map((i) => ({
      date: new Date(i.invoiceDate).toISOString().slice(0, 10),
      type: 'invoice' as const,
      reference: i.invoiceNumber,
      amount: Number(i.totalAmount || 0),
    }));
    const payLines = paymentsInPeriod.map((p) => ({
      date: new Date(p.paymentDate).toISOString().slice(0, 10),
      type: 'payment' as const,
      reference: (p.referenceNo && p.referenceNo.trim()) ? p.referenceNo.trim() : `Payment ${p.id.slice(0, 8)}`,
      amount: -Number(p.amount || 0),
    }));
    const all = [...invLines, ...payLines].sort((a, b) => a.date.localeCompare(b.date));
    let running = openingBalance;
    for (const line of all) {
      running += line.amount;
      lines.push({ ...line, runningBalance: Math.round(running * 100) / 100 });
    }
    const closingBalance = running;

    return {
      supplierId,
      supplierName: supplier.name,
      dateFrom: dateFrom.slice(0, 10),
      dateTo: dateTo.slice(0, 10),
      openingBalance: Math.round(openingBalance * 100) / 100,
      lines,
      closingBalance: Math.round(closingBalance * 100) / 100,
    };
  }
}
