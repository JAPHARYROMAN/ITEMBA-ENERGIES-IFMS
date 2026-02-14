import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../../database/database.module';
import type * as schema from '../../database/schema';
import { creditInvoices } from '../../database/schema/credit/credit-invoices';
import { invoiceItems } from '../../database/schema/credit/invoice-items';
import { customers } from '../../database/schema/credit/customers';
import { getListParams } from '../../common/helpers/list.helper';
import { AuditService } from '../audit/audit.service';

type Schema = typeof schema;

export interface CreditInvoiceItem {
  id: string;
  invoiceId: string;
  productId: string;
  quantity: string;
  unitPrice: string;
  tax: string | null;
  total: string;
}

export interface CreditInvoiceDetail {
  id: string;
  companyId: string;
  branchId: string;
  customerId: string;
  invoiceNumber: string;
  invoiceDate: Date;
  dueDate: Date;
  totalAmount: string;
  balanceRemaining: string;
  status: string;
  createdAt: Date;
  items: CreditInvoiceItem[];
}

export interface CreditInvoiceListItem {
  id: string;
  companyId: string;
  branchId: string;
  customerId: string;
  invoiceNumber: string;
  invoiceDate: Date;
  dueDate: Date;
  totalAmount: string;
  balanceRemaining: string;
  status: string;
  createdAt: Date;
}

export interface CreditInvoicesListParams {
  page?: number;
  pageSize?: number;
  branchId?: string;
  companyId?: string;
  customerId?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
}

interface AuditContext {
  userId?: string;
  ip?: string;
  userAgent?: string;
}

const STATUS_UNPAID = 'unpaid';
const STATUS_PAID = 'paid';
const STATUS_PARTIAL = 'partial';

@Injectable()
export class CreditInvoicesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<Schema>,
    private readonly audit: AuditService,
  ) {}

  async findPage(params: CreditInvoicesListParams): Promise<{ data: CreditInvoiceListItem[]; total: number }> {
    const { offset, limit } = getListParams(params);
    const conditions = [isNull(creditInvoices.deletedAt)];
    if (params.branchId) conditions.push(eq(creditInvoices.branchId, params.branchId));
    if (params.companyId) conditions.push(eq(creditInvoices.companyId, params.companyId));
    if (params.customerId) conditions.push(eq(creditInvoices.customerId, params.customerId));
    if (params.status) conditions.push(eq(creditInvoices.status, params.status));
    if (params.dateFrom) conditions.push(sql`${creditInvoices.invoiceDate} >= ${params.dateFrom}::timestamptz`);
    if (params.dateTo) conditions.push(sql`${creditInvoices.invoiceDate} <= ${params.dateTo}::timestamptz`);
    const w = conditions.length > 1 ? and(...conditions) : conditions[0];
    const [data, countResult] = await Promise.all([
      this.db
        .select({
          id: creditInvoices.id,
          companyId: creditInvoices.companyId,
          branchId: creditInvoices.branchId,
          customerId: creditInvoices.customerId,
          invoiceNumber: creditInvoices.invoiceNumber,
          invoiceDate: creditInvoices.invoiceDate,
          dueDate: creditInvoices.dueDate,
          totalAmount: creditInvoices.totalAmount,
          balanceRemaining: creditInvoices.balanceRemaining,
          status: creditInvoices.status,
          createdAt: creditInvoices.createdAt,
        })
        .from(creditInvoices)
        .where(w)
        .orderBy(desc(creditInvoices.invoiceDate))
        .limit(limit)
        .offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(creditInvoices).where(w),
    ]);
    return { data, total: countResult[0]?.count ?? 0 };
  }

  async create(
    payload: {
      customerId: string;
      invoiceDate?: string;
      dueDate?: string;
      items: { productId: string; quantity: number; unitPrice: number; tax?: number }[];
    },
    ctx: AuditContext,
  ): Promise<CreditInvoiceDetail> {
    if (!payload.items?.length) throw new BadRequestException('At least one item required');
    const [customer] = await this.db
      .select({
        id: customers.id,
        companyId: customers.companyId,
        branchId: customers.branchId,
        creditLimit: customers.creditLimit,
        balance: customers.balance,
        paymentTerms: customers.paymentTerms,
      })
      .from(customers)
      .where(and(eq(customers.id, payload.customerId), isNull(customers.deletedAt)));
    if (!customer) throw new NotFoundException('Customer not found');

    let totalAmount = 0;
    const itemRows = payload.items.map((item) => {
      const tax = item.tax ?? 0;
      const total = item.quantity * item.unitPrice + tax;
      totalAmount += total;
      return { ...item, tax, total };
    });

    const creditLimit = Number(customer.creditLimit || 0);
    if (creditLimit > 0) {
      const currentBalance = Number(customer.balance || 0);
      if (currentBalance + totalAmount > creditLimit) {
        throw new BadRequestException(
          `Credit limit exceeded: current balance ${currentBalance}, invoice ${totalAmount}, limit ${creditLimit}`,
        );
      }
    }

    const invoiceDate = payload.invoiceDate ? new Date(payload.invoiceDate) : new Date();
    let dueDate = payload.dueDate ? new Date(payload.dueDate) : new Date(invoiceDate);
    if (!payload.dueDate && customer.paymentTerms) {
      const terms = String(customer.paymentTerms).toLowerCase();
      if (terms.startsWith('net')) {
        const days = parseInt(terms.replace(/\D/g, ''), 10) || 30;
        dueDate = new Date(invoiceDate);
        dueDate.setDate(dueDate.getDate() + days);
      }
    }
    const invoiceNumber = `INV-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    const [inv] = await this.db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(creditInvoices)
        .values({
          companyId: customer.companyId,
          branchId: customer.branchId,
          customerId: payload.customerId,
          invoiceNumber,
          invoiceDate,
          dueDate,
          totalAmount: String(totalAmount.toFixed(2)),
          balanceRemaining: String(totalAmount.toFixed(2)),
          status: STATUS_UNPAID,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        })
        .returning({
          id: creditInvoices.id,
          companyId: creditInvoices.companyId,
          branchId: creditInvoices.branchId,
          customerId: creditInvoices.customerId,
          invoiceNumber: creditInvoices.invoiceNumber,
          invoiceDate: creditInvoices.invoiceDate,
          dueDate: creditInvoices.dueDate,
          totalAmount: creditInvoices.totalAmount,
          balanceRemaining: creditInvoices.balanceRemaining,
          status: creditInvoices.status,
          createdAt: creditInvoices.createdAt,
        });
      if (!inserted) throw new Error('Failed to insert invoice');

      for (const row of itemRows) {
        await tx.insert(invoiceItems).values({
          invoiceId: inserted.id,
          productId: row.productId,
          quantity: String(row.quantity.toFixed(3)),
          unitPrice: String(row.unitPrice.toFixed(2)),
          tax: String((row.tax ?? 0).toFixed(2)),
          total: String(row.total.toFixed(2)),
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        });
      }

      const newBalance = (Number(customer.balance || 0) + totalAmount).toFixed(2);
      await tx
        .update(customers)
        .set({
          balance: newBalance,
          updatedAt: invoiceDate,
          ...(ctx.userId && { updatedBy: ctx.userId }),
        })
        .where(eq(customers.id, payload.customerId));

      await this.audit.log(
        {
          entity: 'credit_invoices',
          entityId: inserted.id,
          action: 'create',
          after: inserted as object,
          userId: ctx.userId,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        tx as NodePgDatabase<Schema>,
      );
      return [inserted];
    });

    if (!inv) throw new Error('Insert failed');
    const items = await this.db
      .select({
        id: invoiceItems.id,
        invoiceId: invoiceItems.invoiceId,
        productId: invoiceItems.productId,
        quantity: invoiceItems.quantity,
        unitPrice: invoiceItems.unitPrice,
        tax: invoiceItems.tax,
        total: invoiceItems.total,
      })
      .from(invoiceItems)
      .where(eq(invoiceItems.invoiceId, inv.id));
    return { ...inv, items };
  }
}
