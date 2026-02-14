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
      .where(eq(stations.id, branch.stationId));
    if (!station) throw new NotFoundException('Station not found');
    const [supplier] = await this.db
      .select({ id: suppliers.id, companyId: suppliers.companyId })
      .from(suppliers)
      .where(and(eq(suppliers.id, payload.supplierId), isNull(suppliers.deletedAt)));
    if (!supplier) throw new NotFoundException('Supplier not found');
    if (supplier.companyId !== station.companyId) throw new NotFoundException('Supplier does not belong to branch company');

    const paymentDate = payload.paymentDate ? new Date(payload.paymentDate) : new Date();

    let allocationsToUse: { invoiceId: string; amount: number }[];
    if (payload.allocations?.length) {
      const sum = payload.allocations.reduce((s, a) => s + a.amount, 0);
      if (Math.abs(sum - payload.amount) > 0.01) {
        throw new BadRequestException(`Allocations sum ${sum} must equal payment amount ${payload.amount}`);
      }
      allocationsToUse = payload.allocations;
      const invs = await this.db
        .select({
          id: supplierInvoices.id,
          supplierId: supplierInvoices.supplierId,
          balanceRemaining: supplierInvoices.balanceRemaining,
        })
        .from(supplierInvoices)
        .where(
          and(
            eq(supplierInvoices.supplierId, payload.supplierId),
            isNull(supplierInvoices.deletedAt),
          ),
        );
      const invMap = new Map(invs.map((i) => [i.id, i]));
      for (const a of allocationsToUse) {
        const inv = invMap.get(a.invoiceId);
        if (!inv) throw new BadRequestException(`Invoice ${a.invoiceId} not found or not for this supplier`);
        const remaining = Number(inv.balanceRemaining || 0);
        if (a.amount > remaining) {
          throw new BadRequestException(`Allocation ${a.amount} exceeds invoice balance ${remaining}`);
        }
      }
    } else {
      const unpaid = await this.db
        .select({
          id: supplierInvoices.id,
          balanceRemaining: supplierInvoices.balanceRemaining,
        })
        .from(supplierInvoices)
        .where(
          and(
            eq(supplierInvoices.supplierId, payload.supplierId),
            isNull(supplierInvoices.deletedAt),
            sql`${supplierInvoices.balanceRemaining} > 0`,
          ),
        )
        .orderBy(asc(supplierInvoices.dueDate), asc(supplierInvoices.invoiceDate));
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
        throw new BadRequestException('Supplier has no outstanding invoices to allocate against');
      }
      if (remaining > 0.01) {
        throw new BadRequestException(
          `Payment amount ${payload.amount} exceeds total outstanding; unallocated ${remaining}. Provide explicit allocations to overpay.`,
        );
      }
    }

    const [inserted] = await this.db.transaction(async (tx) => {
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
      if (!pay) throw new Error('Failed to insert payment');

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
