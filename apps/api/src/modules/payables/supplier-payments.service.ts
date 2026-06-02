import { InternalServerErrorException } from '@nestjs/common';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../../database/database.module';
import type * as schema from '../../database/schema';
import { supplierPayments } from '../../database/schema/payables/supplier-payments';
import { supplierPaymentAllocations } from '../../database/schema/payables/supplier-payment-allocations';
import { supplierInvoices } from '../../database/schema/payables/supplier-invoices';
import { suppliers } from '../../database/schema/payables/suppliers';
import { branches } from '../../database/schema/core/branches';
import { stations } from '../../database/schema/core/stations';
import { getListParams } from '../../common/helpers/list.helper';
import { AuditService } from '../audit/audit.service';

type Schema = typeof schema;

export interface SupplierPaymentItem {
  id: string;
  companyId: string;
  branchId: string;
  supplierId: string;
  amount: string;
  method: string;
  paymentDate: Date;
  referenceNo: string | null;
  createdAt: Date;
}

export interface SupplierPaymentsListParams {
  page?: number;
  pageSize?: number;
  branchId?: string;
  companyId?: string;
  supplierId?: string;
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

export interface SupplierPaymentAllocationInput {
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

export function aggregateSupplierPaymentAllocations(
  allocations: SupplierPaymentAllocationInput[],
  paymentAmount: number,
): SupplierPaymentAllocationInput[] {
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
export class SupplierPaymentsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<Schema>,
    private readonly audit: AuditService,
  ) {}

  async findPage(params: SupplierPaymentsListParams): Promise<{ data: SupplierPaymentItem[]; total: number }> {
    const { offset, limit } = getListParams(params);
    const conditions = [isNull(supplierPayments.deletedAt)];
    if (params.branchId) conditions.push(eq(supplierPayments.branchId, params.branchId));
    if (params.companyId) conditions.push(eq(supplierPayments.companyId, params.companyId));
    if (params.supplierId) conditions.push(eq(supplierPayments.supplierId, params.supplierId));
    if (params.dateFrom) conditions.push(sql`${supplierPayments.paymentDate} >= ${params.dateFrom}::timestamptz`);
    if (params.dateTo) conditions.push(sql`${supplierPayments.paymentDate} <= ${params.dateTo}::timestamptz`);
    const w = conditions.length > 1 ? and(...conditions) : conditions[0];
    const [data, countResult] = await Promise.all([
      this.db
        .select({
          id: supplierPayments.id,
          companyId: supplierPayments.companyId,
          branchId: supplierPayments.branchId,
          supplierId: supplierPayments.supplierId,
          amount: supplierPayments.amount,
          method: supplierPayments.method,
          paymentDate: supplierPayments.paymentDate,
          referenceNo: supplierPayments.referenceNo,
          createdAt: supplierPayments.createdAt,
        })
        .from(supplierPayments)
        .where(w)
        .orderBy(desc(supplierPayments.paymentDate))
        .limit(limit)
        .offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(supplierPayments).where(w),
    ]);
    return { data, total: countResult[0]?.count ?? 0 };
  }

  async create(
    payload: {
      branchId: string;
      supplierId: string;
      amount: number;
      method: string;
      paymentDate?: string;
      referenceNo?: string;
      allocations?: { invoiceId: string; amount: number }[];
    },
    ctx: AuditContext,
  ): Promise<SupplierPaymentItem> {
    const [branch] = await this.db
      .select({ id: branches.id, stationId: branches.stationId })
      .from(branches)
      .where(and(eq(branches.id, payload.branchId), isNull(branches.deletedAt)));
    if (!branch) throw new NotFoundException('Branch not found');
    const [station] = await this.db
      .select({ companyId: stations.companyId })
      .from(stations)
      .where(and(eq(stations.id, branch.stationId), isNull(stations.deletedAt)));
    if (!station) throw new NotFoundException('Station not found');
    const [supplier] = await this.db
      .select({ id: suppliers.id, companyId: suppliers.companyId })
      .from(suppliers)
      .where(and(eq(suppliers.id, payload.supplierId), isNull(suppliers.deletedAt)));
    if (!supplier) throw new NotFoundException('Supplier not found');
    if (supplier.companyId !== station.companyId) throw new NotFoundException('Supplier does not belong to branch company');

    const paymentDate = payload.paymentDate ? new Date(payload.paymentDate) : new Date();

    toCurrencyCents(payload.amount, 'Payment amount');
    const explicitAllocations = payload.allocations?.length
      ? aggregateSupplierPaymentAllocations(payload.allocations, payload.amount)
      : null;

    const [inserted] = await this.db.transaction(async (tx) => {
      const allocationsToUse = explicitAllocations
        ? await this.validateExplicitAllocations(
            explicitAllocations,
            payload.supplierId,
            station.companyId,
            payload.branchId,
            tx as NodePgDatabase<Schema>,
          )
        : await this.buildAutoAllocations(
            payload.supplierId,
            payload.amount,
            station.companyId,
            payload.branchId,
            tx as NodePgDatabase<Schema>,
          );

      const [pay] = await tx
        .insert(supplierPayments)
        .values({
          companyId: station.companyId,
          branchId: payload.branchId,
          supplierId: payload.supplierId,
          amount: String(payload.amount.toFixed(2)),
          method: payload.method.trim(),
          paymentDate,
          referenceNo: payload.referenceNo?.trim() || null,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        })
        .returning({
          id: supplierPayments.id,
          companyId: supplierPayments.companyId,
          branchId: supplierPayments.branchId,
          supplierId: supplierPayments.supplierId,
          amount: supplierPayments.amount,
          method: supplierPayments.method,
          paymentDate: supplierPayments.paymentDate,
          referenceNo: supplierPayments.referenceNo,
          createdAt: supplierPayments.createdAt,
        });
      if (!pay) throw new InternalServerErrorException('Failed to insert payment');

      for (const a of allocationsToUse) {
        await tx.insert(supplierPaymentAllocations).values({
          paymentId: pay.id,
          invoiceId: a.invoiceId,
          amount: String(a.amount.toFixed(2)),
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        });
        const [inv] = await tx
          .select({ balanceRemaining: supplierInvoices.balanceRemaining })
          .from(supplierInvoices)
          .where(eq(supplierInvoices.id, a.invoiceId));
        const newRemaining = Number(inv?.balanceRemaining || 0) - a.amount;
        const status = newRemaining <= 0.01 ? STATUS_PAID : STATUS_PARTIAL;
        await tx
          .update(supplierInvoices)
          .set({
            balanceRemaining: String(Math.max(0, newRemaining).toFixed(2)),
            status,
            updatedAt: paymentDate,
            ...(ctx.userId && { updatedBy: ctx.userId }),
          })
          .where(eq(supplierInvoices.id, a.invoiceId));
      }

      await this.audit.log(
        {
          entity: 'supplier_payments',
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
    allocations: SupplierPaymentAllocationInput[],
    supplierId: string,
    companyId: string,
    branchId: string,
    tx: NodePgDatabase<Schema>,
  ): Promise<SupplierPaymentAllocationInput[]> {
    const invs = await tx
      .select({
        id: supplierInvoices.id,
        balanceRemaining: supplierInvoices.balanceRemaining,
      })
      .from(supplierInvoices)
      .where(
        and(
          eq(supplierInvoices.supplierId, supplierId),
          eq(supplierInvoices.companyId, companyId),
          eq(supplierInvoices.branchId, branchId),
          isNull(supplierInvoices.deletedAt),
        ),
      )
      .for('update');
    const invMap = new Map(invs.map((i) => [i.id, i]));

    for (const allocation of allocations) {
      const inv = invMap.get(allocation.invoiceId);
      if (!inv) throw new BadRequestException(`Invoice ${allocation.invoiceId} not found or not for this supplier`);
      const remaining = Number(inv.balanceRemaining || 0);
      if (allocation.amount > remaining + 0.001) {
        throw new BadRequestException(`Allocation ${allocation.amount.toFixed(2)} exceeds invoice balance ${remaining.toFixed(2)}`);
      }
    }

    return allocations;
  }

  private async buildAutoAllocations(
    supplierId: string,
    amount: number,
    companyId: string,
    branchId: string,
    tx: NodePgDatabase<Schema>,
  ): Promise<SupplierPaymentAllocationInput[]> {
    const unpaid = await tx
      .select({
        id: supplierInvoices.id,
        balanceRemaining: supplierInvoices.balanceRemaining,
      })
      .from(supplierInvoices)
      .where(
        and(
          eq(supplierInvoices.supplierId, supplierId),
          eq(supplierInvoices.companyId, companyId),
          eq(supplierInvoices.branchId, branchId),
          isNull(supplierInvoices.deletedAt),
          sql`${supplierInvoices.balanceRemaining} > 0`,
        ),
      )
      .orderBy(asc(supplierInvoices.dueDate), asc(supplierInvoices.invoiceDate))
      .for('update');

    let remainingCents = toCurrencyCents(amount, 'Payment amount');
    const allocations: SupplierPaymentAllocationInput[] = [];
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
      throw new BadRequestException('Supplier has no outstanding invoices to allocate against');
    }
    if (remainingCents > 0) {
      throw new BadRequestException(
        `Payment amount ${amount.toFixed(2)} exceeds total outstanding; unallocated ${fromCurrencyCents(remainingCents).toFixed(2)}.`,
      );
    }
    return allocations;
  }

  async getById(id: string): Promise<SupplierPaymentItem & { allocations: { invoiceId: string; amount: string }[] }> {
    const [payment] = await this.db
      .select({
        id: supplierPayments.id,
        companyId: supplierPayments.companyId,
        branchId: supplierPayments.branchId,
        supplierId: supplierPayments.supplierId,
        amount: supplierPayments.amount,
        method: supplierPayments.method,
        paymentDate: supplierPayments.paymentDate,
        referenceNo: supplierPayments.referenceNo,
        createdAt: supplierPayments.createdAt,
      })
      .from(supplierPayments)
      .where(and(eq(supplierPayments.id, id), isNull(supplierPayments.deletedAt)));
    if (!payment) throw new NotFoundException('Payment not found');

    const allocations = await this.db
      .select({
        invoiceId: supplierPaymentAllocations.invoiceId,
        amount: supplierPaymentAllocations.amount,
      })
      .from(supplierPaymentAllocations)
      .where(eq(supplierPaymentAllocations.paymentId, payment.id));

    return { ...payment, allocations };
  }

  async voidPayment(id: string, ctx: AuditContext): Promise<{ success: boolean }> {
    await this.db.transaction(async (tx) => {
      const [payment] = await tx
        .select()
        .from(supplierPayments)
        .where(eq(supplierPayments.id, id))
        .for('update');
      if (!payment) throw new NotFoundException('Payment not found');
      if (payment.deletedAt) return;

      const allocations = await tx
        .select({
          invoiceId: supplierPaymentAllocations.invoiceId,
          amount: supplierPaymentAllocations.amount,
        })
        .from(supplierPaymentAllocations)
        .where(eq(supplierPaymentAllocations.paymentId, id));

      const now = new Date();

      // Reverse each allocation: add the amount back to invoice balanceRemaining
      for (const alloc of allocations) {
        const [inv] = await tx
          .select({
            balanceRemaining: supplierInvoices.balanceRemaining,
            totalAmount: supplierInvoices.totalAmount,
          })
          .from(supplierInvoices)
          .where(eq(supplierInvoices.id, alloc.invoiceId))
          .for('update');
        if (inv) {
          const newRemaining = Number(inv.balanceRemaining || 0) + Number(alloc.amount);
          const total = Number(inv.totalAmount || 0);
          const status = newRemaining >= total - 0.01 ? STATUS_UNPAID : STATUS_PARTIAL;
          await tx
            .update(supplierInvoices)
            .set({
              balanceRemaining: String(Math.min(newRemaining, total).toFixed(2)),
              status,
              updatedAt: now,
              ...(ctx.userId && { updatedBy: ctx.userId }),
            })
            .where(eq(supplierInvoices.id, alloc.invoiceId));
        }
      }

      // Soft-delete the payment
      await tx
        .update(supplierPayments)
        .set({
          deletedAt: now,
          updatedAt: now,
          ...(ctx.userId && { updatedBy: ctx.userId }),
        })
        .where(eq(supplierPayments.id, id));

      await this.audit.log(
        {
          entity: 'supplier_payments',
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
