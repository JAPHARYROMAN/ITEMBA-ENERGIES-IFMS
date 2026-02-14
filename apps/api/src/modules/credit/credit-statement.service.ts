import { Injectable, NotFoundException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../../database/database.module';
import type * as schema from '../../database/schema';
import { customers } from '../../database/schema/credit/customers';
import { creditInvoices } from '../../database/schema/credit/credit-invoices';
import { payments } from '../../database/schema/credit/payments';
import { paymentAllocations } from '../../database/schema/credit/payment-allocations';

type Schema = typeof schema;

export interface StatementLine {
  date: string;
  type: 'invoice' | 'payment';
  reference: string;
  amount: number;
  runningBalance: number;
}

export interface CustomerStatement {
  customerId: string;
  customerName: string;
  dateFrom: string;
  dateTo: string;
  openingBalance: number;
  lines: StatementLine[];
  closingBalance: number;
}

@Injectable()
export class CreditStatementService {
  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase<Schema>) {}

  async getStatement(customerId: string, dateFrom: string, dateTo: string): Promise<CustomerStatement> {
    const [customer] = await this.db
      .select({ id: customers.id, name: customers.name })
      .from(customers)
      .where(and(eq(customers.id, customerId), isNull(customers.deletedAt)));
    if (!customer) throw new NotFoundException('Customer not found');

    const from = new Date(dateFrom);
    const to = new Date(dateTo);

    const invoicesBefore = await this.db
      .select({
        totalAmount: creditInvoices.totalAmount,
      })
      .from(creditInvoices)
      .where(and(
        eq(creditInvoices.customerId, customerId),
        isNull(creditInvoices.deletedAt),
        sql`${creditInvoices.invoiceDate} < ${from}`,
      ));
    const paymentsBefore = await this.db
      .select({
        amount: paymentAllocations.amount,
      })
      .from(paymentAllocations)
      .innerJoin(payments, eq(paymentAllocations.paymentId, payments.id))
      .where(and(
        eq(payments.customerId, customerId),
        isNull(payments.deletedAt),
        sql`${payments.paymentDate} < ${from}`,
      ));
    const openingInvoices = invoicesBefore.reduce((s, i) => s + Number(i.totalAmount || 0), 0);
    const openingPayments = paymentsBefore.reduce((s, p) => s + Number(p.amount || 0), 0);
    const openingBalance = openingInvoices - openingPayments;

    const invoicesInPeriod = await this.db
      .select({
        id: creditInvoices.id,
        invoiceNumber: creditInvoices.invoiceNumber,
        invoiceDate: creditInvoices.invoiceDate,
        totalAmount: creditInvoices.totalAmount,
      })
      .from(creditInvoices)
      .where(and(
        eq(creditInvoices.customerId, customerId),
        isNull(creditInvoices.deletedAt),
        sql`${creditInvoices.invoiceDate} >= ${from}`,
        sql`${creditInvoices.invoiceDate} <= ${to}`,
      ));
    const paymentsInPeriod = await this.db
      .select({
        id: payments.id,
        paymentNumber: payments.paymentNumber,
        paymentDate: payments.paymentDate,
        amount: payments.amount,
      })
      .from(payments)
      .where(and(
        eq(payments.customerId, customerId),
        isNull(payments.deletedAt),
        sql`${payments.paymentDate} >= ${from}`,
        sql`${payments.paymentDate} <= ${to}`,
      ));

    const lines: StatementLine[] = [];
    const invLines = invoicesInPeriod.map((i) => ({
      date: new Date(i.invoiceDate).toISOString().slice(0, 10),
      type: 'invoice' as const,
      reference: i.invoiceNumber,
      amount: Number(i.totalAmount || 0),
    }));
    const payLines = paymentsInPeriod.map((p) => ({
      date: new Date(p.paymentDate).toISOString().slice(0, 10),
      type: 'payment' as const,
      reference: p.paymentNumber,
      amount: -Number(p.amount || 0),
    }));
    const all = [...invLines, ...payLines].sort((a, b) => a.date.localeCompare(b.date) || (a.type === 'invoice' ? -1 : 1));
    let running = openingBalance;
    for (const line of all) {
      running += line.amount;
      lines.push({ ...line, runningBalance: Math.round(running * 100) / 100 });
    }
    const closingBalance = running;

    return {
      customerId,
      customerName: customer.name,
      dateFrom: dateFrom.slice(0, 10),
      dateTo: dateTo.slice(0, 10),
      openingBalance: Math.round(openingBalance * 100) / 100,
      lines,
      closingBalance: Math.round(closingBalance * 100) / 100,
    };
  }
}
