import { InternalServerErrorException } from '@nestjs/common';
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

  async findPage(
    params: CreditInvoicesListParams,
  ): Promise<{ data: CreditInvoiceListItem[]; total: number }> {
    const { offset, limit } = getListParams(params);
    const conditions = [isNull(creditInvoices.deletedAt)];
    if (params.branchId) conditions.push(eq(creditInvoices.branchId, params.branchId));
    if (params.companyId) conditions.push(eq(creditInvoices.companyId, params.companyId));
    if (params.customerId) conditions.push(eq(creditInvoices.customerId, params.customerId));
    if (params.status) conditions.push(eq(creditInvoices.status, params.status));
    if (params.dateFrom)
      conditions.push(sql`${creditInvoices.invoiceDate} >= ${params.dateFrom}::timestamptz`);
    if (params.dateTo)
      conditions.push(sql`${creditInvoices.invoiceDate} <= ${params.dateTo}::timestamptz`);
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
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(creditInvoices)
        .where(w),
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
      if (!inserted) throw new InternalServerErrorException('Failed to insert invoice');

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

    if (!inv) throw new InternalServerErrorException('Insert failed');
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

  async getById(id: string, companyId?: string): Promise<CreditInvoiceDetail> {
    const conditions = [eq(creditInvoices.id, id), isNull(creditInvoices.deletedAt)];
    if (companyId) conditions.push(eq(creditInvoices.companyId, companyId));
    const [invoice] = await this.db
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
        customerName: customers.name,
        customerCode: customers.code,
      })
      .from(creditInvoices)
      .leftJoin(customers, eq(creditInvoices.customerId, customers.id))
      .where(and(...conditions));
    if (!invoice) throw new NotFoundException('Invoice not found');

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
      .where(eq(invoiceItems.invoiceId, invoice.id));

    return {
      id: invoice.id,
      companyId: invoice.companyId,
      branchId: invoice.branchId,
      customerId: invoice.customerId,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      dueDate: invoice.dueDate,
      totalAmount: invoice.totalAmount,
      balanceRemaining: invoice.balanceRemaining,
      status: invoice.status,
      createdAt: invoice.createdAt,
      items,
      customer: { name: invoice.customerName, code: invoice.customerCode },
    } as CreditInvoiceDetail & { customer: { name: string | null; code: string | null } };
  }

  async update(
    id: string,
    payload: Partial<{
      dueDate: string;
      totalAmount: number;
      items: { productId: string; quantity: number; unitPrice: number; tax?: number }[];
    }>,
    ctx: AuditContext,
  ): Promise<CreditInvoiceDetail> {
    const [existing] = await this.db
      .select()
      .from(creditInvoices)
      .where(and(eq(creditInvoices.id, id), isNull(creditInvoices.deletedAt)));
    if (!existing) throw new NotFoundException('Invoice not found');
    if (existing.status !== STATUS_UNPAID) {
      throw new BadRequestException('Only unpaid invoices can be updated');
    }

    const now = new Date();
    const updates: Record<string, unknown> = {
      updatedAt: now,
      ...(ctx.userId && { updatedBy: ctx.userId }),
    };
    if (payload.dueDate !== undefined) updates.dueDate = new Date(payload.dueDate);

    let newTotalAmount: number | undefined;
    if (payload.totalAmount !== undefined) {
      newTotalAmount = payload.totalAmount;
      const oldTotal = Number(existing.totalAmount);
      const oldBalance = Number(existing.balanceRemaining);
      const diff = newTotalAmount - oldTotal;
      const newBalance = oldBalance + diff;
      if (newBalance < 0) {
        throw new BadRequestException('New total would result in negative balance remaining');
      }
      updates.totalAmount = String(newTotalAmount.toFixed(2));
      updates.balanceRemaining = String(newBalance.toFixed(2));
    }

    const result = await this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(creditInvoices)
        .set(updates as Record<string, string | Date | null>)
        .where(eq(creditInvoices.id, id))
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
      if (!updated) throw new NotFoundException('Invoice not found');

      // Update customer balance if totalAmount changed
      if (newTotalAmount !== undefined) {
        const oldTotal = Number(existing.totalAmount);
        const diff = newTotalAmount - oldTotal;
        if (Math.abs(diff) > 0.001) {
          const [customer] = await tx
            .select({ id: customers.id, balance: customers.balance })
            .from(customers)
            .where(eq(customers.id, existing.customerId));
          if (customer) {
            const newBalance = Number(customer.balance || 0) + diff;
            await tx
              .update(customers)
              .set({
                balance: String(newBalance.toFixed(2)),
                updatedAt: now,
                ...(ctx.userId && { updatedBy: ctx.userId }),
              })
              .where(eq(customers.id, existing.customerId));
          }
        }
      }

      await this.audit.log(
        {
          entity: 'credit_invoices',
          entityId: id,
          action: 'update',
          before: existing as object,
          after: updated as object,
          userId: ctx.userId,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        tx as NodePgDatabase<Schema>,
      );

      return updated;
    });

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
      .where(eq(invoiceItems.invoiceId, result.id));

    return { ...result, items };
  }

  async deleteInvoice(id: string, ctx: AuditContext): Promise<{ success: boolean }> {
    const [inv] = await this.db
      .select()
      .from(creditInvoices)
      .where(and(eq(creditInvoices.id, id), isNull(creditInvoices.deletedAt)));
    if (!inv) throw new NotFoundException('Invoice not found');
    if (inv.status === 'voided') throw new BadRequestException('Invoice already voided');

    // We shouldn't void invoices that have payments against them
    if (Number(inv.totalAmount) !== Number(inv.balanceRemaining)) {
      throw new BadRequestException(
        'Cannot void an invoice that has existing payment allocations. Void payments first.',
      );
    }

    const now = new Date();

    await this.db.transaction(async (tx) => {
      await tx
        .update(creditInvoices)
        .set({
          status: 'voided',
          deletedAt: now,
          updatedAt: now,
          ...(ctx.userId && { updatedBy: ctx.userId }),
        })
        .where(eq(creditInvoices.id, id));

      const [customer] = await tx
        .select({ id: customers.id, balance: customers.balance })
        .from(customers)
        .where(eq(customers.id, inv.customerId));
      if (customer) {
        const newBalance = Number(customer.balance || 0) - Number(inv.totalAmount);
        await tx
          .update(customers)
          .set({
            balance: String(newBalance.toFixed(2)),
            updatedAt: now,
            ...(ctx.userId && { updatedBy: ctx.userId }),
          })
          .where(eq(customers.id, inv.customerId));
      }

      await this.audit.log(
        {
          entity: 'credit_invoices',
          entityId: id,
          action: 'delete',
          before: inv as object,
          after: { ...inv, status: 'voided', deletedAt: now } as object,
          userId: ctx.userId,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        tx as NodePgDatabase<Schema>,
      );
    });

    return { success: true };
  }
}
