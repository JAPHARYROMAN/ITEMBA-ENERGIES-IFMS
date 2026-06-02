import { InternalServerErrorException } from '@nestjs/common';
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

export interface PaymentAllocationInput {
  invoiceId: string;
  amount: number;
}

function toCurrencyCents(amount: number, label: string): number {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new BadRequestException(`${label} must be greater than zero`);
  }
  return Math.round(amount * 100);
}

function fromCurrencyCents(cents: number): number {
  return cents / 100;
}

export function aggregatePaymentAllocations(
  allocations: PaymentAllocationInput[],
  paymentAmount: number,
): PaymentAllocationInput[] {
  const paymentCents = toCurrencyCents(paymentAmount, 'Payment amount');
  const centsByInvoice = new Map<string, number>();

  for (const allocation of allocations) {
    if (!allocation.invoiceId) throw new BadRequestException('Allocation invoiceId is required');
    const cents = toCurrencyCents(allocation.amount, `Allocation for invoice ${allocation.invoiceId}`);
    centsByInvoice.set(allocation.invoiceId, (centsByInvoice.get(allocation.invoiceId) ?? 0) + cents);
  }

  const totalCents = [...centsByInvoice.values()].reduce((sum, cents) => sum + cents, 0);
  if (totalCents !== paymentCents) {
    throw new BadRequestException(
      `Allocations sum ${fromCurrencyCents(totalCents).toFixed(2)} must equal payment amount ${fromCurrencyCents(paymentCents).toFixed(2)}`,
    );
  }

  return [...centsByInvoice.entries()].map(([invoiceId, cents]) => ({
    invoiceId,
    amount: fromCurrencyCents(cents),
  }));
}

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

  async getById(id: string): Promise<PaymentItem & { allocations: { invoiceId: string; amount: string }[] }> {
    const [row] = await this.db
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
      .where(and(eq(payments.id, id), isNull(payments.deletedAt)));
    if (!row) throw new NotFoundException('Credit payment not found');
    const allocations = await this.db
      .select({ invoiceId: paymentAllocations.invoiceId, amount: paymentAllocations.amount })
      .from(paymentAllocations)
      .where(eq(paymentAllocations.paymentId, id));
    return { ...row, allocations };
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
    const [customerBasic] = await this.db
      .select({
        id: customers.id,
        companyId: customers.companyId,
        branchId: customers.branchId,
      })
      .from(customers)
      .where(and(eq(customers.id, payload.customerId), isNull(customers.deletedAt)));
    if (!customerBasic) throw new NotFoundException('Customer not found');

    const paymentDate = payload.paymentDate ? new Date(payload.paymentDate) : new Date();
    const paymentNumber = `PAY-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    toCurrencyCents(payload.amount, 'Payment amount');
    const explicitAllocations = payload.allocations?.length
      ? aggregatePaymentAllocations(payload.allocations, payload.amount)
      : null;

    const [inserted] = await this.db.transaction(async (tx) => {
      // Lock the customer row to prevent concurrent balance modifications
      const [lockedCustomer] = await tx
        .select({ balance: customers.balance })
        .from(customers)
        .where(eq(customers.id, payload.customerId))
        .for('update');
      if (!lockedCustomer) throw new NotFoundException('Customer not found');

      const currentBalance = Number(lockedCustomer.balance || 0);
      if (currentBalance < payload.amount) {
        throw new BadRequestException(`Customer balance ${currentBalance} is less than payment amount ${payload.amount}`);
      }

      const allocationsToUse = explicitAllocations
        ? await this.validateExplicitAllocations(
            explicitAllocations,
            payload.customerId,
            customerBasic.companyId,
            customerBasic.branchId,
            tx as NodePgDatabase<Schema>,
          )
        : await this.buildAutoAllocations(
            payload.customerId,
            payload.amount,
            customerBasic.companyId,
            customerBasic.branchId,
            tx as NodePgDatabase<Schema>,
          );

      const [pay] = await tx
        .insert(payments)
        .values({
          companyId: customerBasic.companyId,
          branchId: customerBasic.branchId,
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
      if (!pay) throw new InternalServerErrorException('Failed to insert payment');

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
          companyId: pay.companyId,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        tx as NodePgDatabase<Schema>,
      );
      return [pay];
    });

    if (!inserted) throw new InternalServerErrorException('Payment insert failed');
    return inserted;
  }

  private async validateExplicitAllocations(
    allocations: PaymentAllocationInput[],
    customerId: string,
    companyId: string,
    branchId: string,
    tx: NodePgDatabase<Schema>,
  ): Promise<PaymentAllocationInput[]> {
    const invs = await tx
      .select({
        id: creditInvoices.id,
        balanceRemaining: creditInvoices.balanceRemaining,
      })
      .from(creditInvoices)
      .where(
        and(
          eq(creditInvoices.customerId, customerId),
          eq(creditInvoices.companyId, companyId),
          eq(creditInvoices.branchId, branchId),
          isNull(creditInvoices.deletedAt),
        ),
      )
      .for('update');
    const invMap = new Map(invs.map((i) => [i.id, i]));

    for (const allocation of allocations) {
      const inv = invMap.get(allocation.invoiceId);
      if (!inv) throw new BadRequestException(`Invoice ${allocation.invoiceId} not found or not for this customer`);
      const remaining = Number(inv.balanceRemaining || 0);
      if (allocation.amount > remaining + 0.001) {
        throw new BadRequestException(`Allocation ${allocation.amount.toFixed(2)} exceeds invoice balance ${remaining.toFixed(2)}`);
      }
    }

    return allocations;
  }

  private async buildAutoAllocations(
    customerId: string,
    amount: number,
    companyId: string,
    branchId: string,
    tx: NodePgDatabase<Schema>,
  ): Promise<PaymentAllocationInput[]> {
    const unpaid = await tx
      .select({
        id: creditInvoices.id,
        balanceRemaining: creditInvoices.balanceRemaining,
      })
      .from(creditInvoices)
      .where(
        and(
          eq(creditInvoices.customerId, customerId),
          eq(creditInvoices.companyId, companyId),
          eq(creditInvoices.branchId, branchId),
          isNull(creditInvoices.deletedAt),
          sql`${creditInvoices.balanceRemaining} > 0`,
        ),
      )
      .orderBy(asc(creditInvoices.dueDate), asc(creditInvoices.invoiceDate))
      .for('update');

    let remainingCents = toCurrencyCents(amount, 'Payment amount');
    const allocations: PaymentAllocationInput[] = [];
    for (const inv of unpaid) {
      if (remainingCents <= 0) break;
      const balanceCents = Math.max(0, toCurrencyCents(Number(inv.balanceRemaining || 0), `Invoice ${inv.id} balance`));
      const allocationCents = Math.min(remainingCents, balanceCents);
      if (allocationCents > 0) {
        allocations.push({ invoiceId: inv.id, amount: fromCurrencyCents(allocationCents) });
        remainingCents -= allocationCents;
      }
    }
    if (allocations.length === 0) {
      throw new BadRequestException('Customer has no outstanding invoices to allocate against');
    }
    if (remainingCents > 0) {
      throw new BadRequestException(
        `Payment amount ${amount.toFixed(2)} exceeds total outstanding; unallocated ${fromCurrencyCents(remainingCents).toFixed(2)}.`,
      );
    }
    return allocations;
  }

  async voidPayment(id: string, ctx: AuditContext): Promise<{ success: boolean }> {
    await this.db.transaction(async (tx) => {
      const [payment] = await tx
        .select()
        .from(payments)
        .where(eq(payments.id, id))
        .for('update');
      if (!payment) throw new NotFoundException('Payment not found');
      if (payment.deletedAt) return;

      const allocations = await tx
        .select({
          invoiceId: paymentAllocations.invoiceId,
          amount: paymentAllocations.amount,
        })
        .from(paymentAllocations)
        .where(eq(paymentAllocations.paymentId, id));

      const now = new Date();

      // Reverse each allocation: add the amount back to invoice balanceRemaining
      for (const alloc of allocations) {
        const [inv] = await tx
          .select({
            balanceRemaining: creditInvoices.balanceRemaining,
            totalAmount: creditInvoices.totalAmount,
          })
          .from(creditInvoices)
          .where(eq(creditInvoices.id, alloc.invoiceId))
          .for('update');
        if (inv) {
          const newRemaining = Number(inv.balanceRemaining || 0) + Number(alloc.amount);
          const total = Number(inv.totalAmount || 0);
          const status = newRemaining >= total - 0.01 ? STATUS_UNPAID : STATUS_PARTIAL;
          await tx
            .update(creditInvoices)
            .set({
              balanceRemaining: String(Math.min(newRemaining, total).toFixed(2)),
              status,
              updatedAt: now,
              ...(ctx.userId && { updatedBy: ctx.userId }),
            })
            .where(eq(creditInvoices.id, alloc.invoiceId));
        }
      }

      // Restore customer balance
      const [cust] = await tx
        .select({ balance: customers.balance })
        .from(customers)
        .where(eq(customers.id, payment.customerId))
        .for('update');
      if (cust) {
        const restoredBalance = (Number(cust.balance || 0) + Number(payment.amount)).toFixed(2);
        await tx
          .update(customers)
          .set({
            balance: restoredBalance,
            updatedAt: now,
            ...(ctx.userId && { updatedBy: ctx.userId }),
          })
          .where(eq(customers.id, payment.customerId));
      }

      // Soft-delete the payment
      await tx
        .update(payments)
        .set({
          deletedAt: now,
          updatedAt: now,
          ...(ctx.userId && { updatedBy: ctx.userId }),
        })
        .where(eq(payments.id, id));

      await this.audit.log(
        {
          entity: 'payments',
          entityId: id,
          action: 'void',
          before: payment as object,
          after: { ...payment, deletedAt: now } as object,
          userId: ctx.userId,
          companyId: payment.companyId,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        tx as NodePgDatabase<Schema>,
      );
    });

    return { success: true };
  }
}
