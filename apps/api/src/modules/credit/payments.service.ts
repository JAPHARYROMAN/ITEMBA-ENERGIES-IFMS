import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../../database/database.module';
import type * as schema from '../../database/schema';
import { payments } from '../../database/schema/credit/payments';
import { paymentAllocations } from '../../database/schema/credit/payment-allocations';
import { creditInvoices } from '../../database/schema/credit/credit-invoices';
import { customers } from '../../database/schema/credit/customers';
import { getListParams } from '../../common/helpers/list.helper';
import { AuditService } from '../audit/audit.service';

type Schema = typeof schema;

export interface PaymentItem {
  id: string;
  companyId: string;
  branchId: string;
  customerId: string;
  paymentNumber: string;
  amount: string;
  method: string;
  paymentDate: Date;
  referenceNo: string | null;
  createdAt: Date;
}

export interface PaymentsListParams {
  page?: number;
  pageSize?: number;
  branchId?: string;
  companyId?: string;
  customerId?: string;
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
export class PaymentsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<Schema>,
    private readonly audit: AuditService,
  ) {}

  async findPage(params: PaymentsListParams): Promise<{ data: PaymentItem[]; total: number }> {
    const { offset, limit } = getListParams(params);
    const conditions = [isNull(payments.deletedAt)];
    if (params.branchId) conditions.push(eq(payments.branchId, params.branchId));
    if (params.companyId) conditions.push(eq(payments.companyId, params.companyId));
    if (params.customerId) conditions.push(eq(payments.customerId, params.customerId));
    if (params.dateFrom) conditions.push(sql`${payments.paymentDate} >= ${params.dateFrom}::timestamptz`);
    if (params.dateTo) conditions.push(sql`${payments.paymentDate} <= ${params.dateTo}::timestamptz`);
    const w = conditions.length > 1 ? and(...conditions) : conditions[0];
    const [data, countResult] = await Promise.all([
      this.db
        .select({
          id: payments.id,
          companyId: payments.companyId,
          branchId: payments.branchId,
          customerId: payments.customerId,
          paymentNumber: payments.paymentNumber,
          amount: payments.amount,
          method: payments.method,
          paymentDate: payments.paymentDate,
          referenceNo: payments.referenceNo,
          createdAt: payments.createdAt,
        })
        .from(payments)
        .where(w)
        .orderBy(desc(payments.paymentDate))
        .limit(limit)
        .offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(payments).where(w),
    ]);
    return { data, total: countResult[0]?.count ?? 0 };
  }

  async create(
    payload: {
      customerId: string;
      amount: number;
      method: string;
      paymentDate?: string;
      referenceNo?: string;
      allocations?: { invoiceId: string; amount: number }[];
    },
    ctx: AuditContext,
  ): Promise<PaymentItem> {
    const [customer] = await this.db
      .select({
        id: customers.id,
        companyId: customers.companyId,
        branchId: customers.branchId,
        balance: customers.balance,
      })
      .from(customers)
      .where(and(eq(customers.id, payload.customerId), isNull(customers.deletedAt)));
    if (!customer) throw new NotFoundException('Customer not found');

    const paymentDate = payload.paymentDate ? new Date(payload.paymentDate) : new Date();
    const paymentNumber = `PAY-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    let allocationsToUse: { invoiceId: string; amount: number }[];
    if (payload.allocations?.length) {
      const sum = payload.allocations.reduce((s, a) => s + a.amount, 0);
      if (Math.abs(sum - payload.amount) > 0.01) {
        throw new BadRequestException(`Allocations sum ${sum} must equal payment amount ${payload.amount}`);
      }
      allocationsToUse = payload.allocations;
      const invs = await this.db
        .select({ id: creditInvoices.id, customerId: creditInvoices.customerId, balanceRemaining: creditInvoices.balanceRemaining })
        .from(creditInvoices)
        .where(and(eq(creditInvoices.customerId, payload.customerId), isNull(creditInvoices.deletedAt)));
      const invMap = new Map(invs.map((i) => [i.id, i]));
      for (const a of allocationsToUse) {
        const inv = invMap.get(a.invoiceId);
        if (!inv) throw new BadRequestException(`Invoice ${a.invoiceId} not found or not for this customer`);
        const remaining = Number(inv.balanceRemaining || 0);
        if (a.amount > remaining) {
          throw new BadRequestException(`Allocation ${a.amount} exceeds invoice balance ${remaining}`);
        }
      }
    } else {
      const unpaid = await this.db
        .select({
          id: creditInvoices.id,
          balanceRemaining: creditInvoices.balanceRemaining,
        })
        .from(creditInvoices)
        .where(and(
          eq(creditInvoices.customerId, payload.customerId),
          isNull(creditInvoices.deletedAt),
          sql`${creditInvoices.balanceRemaining} > 0`,
        ))
        .orderBy(asc(creditInvoices.dueDate), asc(creditInvoices.invoiceDate));
      let remaining = payload.amount;
      allocationsToUse = [];
      for (const inv of unpaid) {
        if (remaining <= 0) break;
        const bal = Number(inv.balanceRemaining || 0);
        const alloc = Math.min(remaining, bal);
        if (alloc > 0) {
          allocationsToUse.push({ invoiceId: inv.id, amount: alloc });
          remaining -= alloc;
        }
      }
      if (allocationsToUse.length === 0) {
        throw new BadRequestException('Customer has no outstanding invoices to allocate against');
      }
      if (remaining > 0.01) {
        throw new BadRequestException(
          `Payment amount ${payload.amount} exceeds total outstanding; unallocated ${remaining}. Provide explicit allocations to overpay specific invoices.`,
        );
      }
    }

    const currentBalance = Number(customer.balance || 0);
    if (currentBalance < payload.amount) {
      throw new BadRequestException(`Customer balance ${currentBalance} is less than payment amount ${payload.amount}`);
    }

    const [inserted] = await this.db.transaction(async (tx) => {
      const [pay] = await tx
        .insert(payments)
        .values({
          companyId: customer.companyId,
          branchId: customer.branchId,
          customerId: payload.customerId,
          paymentNumber,
          amount: String(payload.amount.toFixed(2)),
          method: payload.method.trim(),
          paymentDate,
          referenceNo: payload.referenceNo?.trim() || null,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        })
        .returning({
          id: payments.id,
          companyId: payments.companyId,
          branchId: payments.branchId,
          customerId: payments.customerId,
          paymentNumber: payments.paymentNumber,
          amount: payments.amount,
          method: payments.method,
          paymentDate: payments.paymentDate,
          referenceNo: payments.referenceNo,
          createdAt: payments.createdAt,
        });
      if (!pay) throw new Error('Failed to insert payment');

      for (const a of allocationsToUse) {
        await tx.insert(paymentAllocations).values({
          paymentId: pay.id,
          invoiceId: a.invoiceId,
          amount: String(a.amount.toFixed(2)),
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        });
        const [inv] = await tx
          .select({ balanceRemaining: creditInvoices.balanceRemaining })
          .from(creditInvoices)
          .where(eq(creditInvoices.id, a.invoiceId));
        const newRemaining = Number(inv?.balanceRemaining || 0) - a.amount;
        const status = newRemaining <= 0.01 ? STATUS_PAID : STATUS_PARTIAL;
        await tx
          .update(creditInvoices)
          .set({
            balanceRemaining: String(Math.max(0, newRemaining).toFixed(2)),
            status,
            updatedAt: paymentDate,
            ...(ctx.userId && { updatedBy: ctx.userId }),
          })
          .where(eq(creditInvoices.id, a.invoiceId));
      }

      const newBalance = (currentBalance - payload.amount).toFixed(2);
      await tx
        .update(customers)
        .set({
          balance: newBalance,
          updatedAt: paymentDate,
          ...(ctx.userId && { updatedBy: ctx.userId }),
        })
        .where(eq(customers.id, payload.customerId));

      await this.audit.log(
        {
          entity: 'payments',
          entityId: pay.id,
          action: 'create',
          after: pay as object,
          userId: ctx.userId,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        tx as NodePgDatabase<Schema>,
      );
      return [pay];
    });

    if (!inserted) throw new Error('Payment insert failed');
    return inserted;
  }
}
