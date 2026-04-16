import { InternalServerErrorException } from '@nestjs/common';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../../database/database.module';
import type * as schema from '../../database/schema';
import { supplierInvoices } from '../../database/schema/payables/supplier-invoices';
import { suppliers } from '../../database/schema/payables/suppliers';
import { branches } from '../../database/schema/core/branches';
import { stations } from '../../database/schema/core/stations';
import { getListParams } from '../../common/helpers/list.helper';
import { AuditService } from '../audit/audit.service';

type Schema = typeof schema;

export interface SupplierInvoiceItem {
  id: string;
  companyId: string;
  branchId: string;
  supplierId: string;
  invoiceNumber: string;
  invoiceDate: Date;
  dueDate: Date;
  totalAmount: string;
  balanceRemaining: string;
  status: string;
  createdAt: Date;
}

export interface SupplierInvoicesListParams {
  page?: number;
  pageSize?: number;
  branchId?: string;
  companyId?: string;
  supplierId?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
}

interface AuditContext {
  userId?: string;
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class SupplierInvoicesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<Schema>,
    private readonly audit: AuditService,
  ) {}

  async findPage(params: SupplierInvoicesListParams): Promise<{ data: SupplierInvoiceItem[]; total: number }> {
    const { offset, limit } = getListParams(params);
    const conditions = [isNull(supplierInvoices.deletedAt)];
    if (params.branchId) conditions.push(eq(supplierInvoices.branchId, params.branchId));
    if (params.companyId) conditions.push(eq(supplierInvoices.companyId, params.companyId));
    if (params.supplierId) conditions.push(eq(supplierInvoices.supplierId, params.supplierId));
    if (params.status) conditions.push(eq(supplierInvoices.status, params.status));
    if (params.dateFrom) conditions.push(sql`${supplierInvoices.invoiceDate} >= ${params.dateFrom}::timestamptz`);
    if (params.dateTo) conditions.push(sql`${supplierInvoices.invoiceDate} <= ${params.dateTo}::timestamptz`);
    const w = conditions.length > 1 ? and(...conditions) : conditions[0];
    const [data, countResult] = await Promise.all([
      this.db.select({
        id: supplierInvoices.id,
        companyId: supplierInvoices.companyId,
        branchId: supplierInvoices.branchId,
        supplierId: supplierInvoices.supplierId,
        invoiceNumber: supplierInvoices.invoiceNumber,
        invoiceDate: supplierInvoices.invoiceDate,
        dueDate: supplierInvoices.dueDate,
        totalAmount: supplierInvoices.totalAmount,
        balanceRemaining: supplierInvoices.balanceRemaining,
        status: supplierInvoices.status,
        createdAt: supplierInvoices.createdAt,
      }).from(supplierInvoices).where(w).orderBy(desc(supplierInvoices.invoiceDate)).limit(limit).offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(supplierInvoices).where(w),
    ]);
    return { data, total: countResult[0]?.count ?? 0 };
  }

  async findById(id: string): Promise<SupplierInvoiceItem> {
    const [row] = await this.db.select({
      id: supplierInvoices.id,
      companyId: supplierInvoices.companyId,
      branchId: supplierInvoices.branchId,
      supplierId: supplierInvoices.supplierId,
      invoiceNumber: supplierInvoices.invoiceNumber,
      invoiceDate: supplierInvoices.invoiceDate,
      dueDate: supplierInvoices.dueDate,
      totalAmount: supplierInvoices.totalAmount,
      balanceRemaining: supplierInvoices.balanceRemaining,
      status: supplierInvoices.status,
      createdAt: supplierInvoices.createdAt,
    }).from(supplierInvoices).where(and(eq(supplierInvoices.id, id), isNull(supplierInvoices.deletedAt)));
    if (!row) throw new NotFoundException('Supplier invoice not found');
    return row;
  }

  async create(payload: {
    branchId: string;
    supplierId: string;
    invoiceNumber: string;
    invoiceDate: string;
    dueDate: string;
    totalAmount: number;
  }, ctx: AuditContext): Promise<SupplierInvoiceItem> {
    const [branch] = await this.db.select({ id: branches.id, stationId: branches.stationId }).from(branches).where(and(eq(branches.id, payload.branchId), isNull(branches.deletedAt)));
    if (!branch) throw new NotFoundException('Branch not found');
    const [station] = await this.db.select({ companyId: stations.companyId }).from(stations).where(and(eq(stations.id, branch.stationId), isNull(stations.deletedAt)));
    if (!station) throw new NotFoundException('Station not found');
    const [supplier] = await this.db.select({ id: suppliers.id, companyId: suppliers.companyId }).from(suppliers).where(and(eq(suppliers.id, payload.supplierId), isNull(suppliers.deletedAt)));
    if (!supplier) throw new NotFoundException('Supplier not found');
    if (supplier.companyId !== station.companyId) throw new NotFoundException('Supplier does not belong to branch company');
    const invoiceDate = new Date(payload.invoiceDate);
    const dueDate = new Date(payload.dueDate);
    const totalStr = String(payload.totalAmount.toFixed(2));
    const [inserted] = await this.db.insert(supplierInvoices).values({
      companyId: station.companyId,
      branchId: payload.branchId,
      supplierId: payload.supplierId,
      invoiceNumber: payload.invoiceNumber.trim(),
      invoiceDate,
      dueDate,
      totalAmount: totalStr,
      balanceRemaining: totalStr,
      status: 'unpaid',
      createdBy: ctx.userId,
      updatedBy: ctx.userId,
    }).returning({
      id: supplierInvoices.id,
      companyId: supplierInvoices.companyId,
      branchId: supplierInvoices.branchId,
      supplierId: supplierInvoices.supplierId,
      invoiceNumber: supplierInvoices.invoiceNumber,
      invoiceDate: supplierInvoices.invoiceDate,
      dueDate: supplierInvoices.dueDate,
      totalAmount: supplierInvoices.totalAmount,
      balanceRemaining: supplierInvoices.balanceRemaining,
      status: supplierInvoices.status,
      createdAt: supplierInvoices.createdAt,
    });
    if (!inserted) throw new InternalServerErrorException('Insert failed');
    await this.audit.log({ entity: 'supplier_invoices', entityId: inserted.id, action: 'create', after: inserted as object, userId: ctx.userId, ip: ctx.ip, userAgent: ctx.userAgent });
    return inserted;
  }

  async update(
    id: string,
    payload: Partial<{ invoiceNumber: string; dueDate: string; totalAmount: number }>,
    ctx: AuditContext,
  ): Promise<SupplierInvoiceItem> {
    const [existing] = await this.db
      .select()
      .from(supplierInvoices)
      .where(and(eq(supplierInvoices.id, id), isNull(supplierInvoices.deletedAt)));
    if (!existing) throw new NotFoundException('Invoice not found');
    if (existing.status === 'voided') throw new BadRequestException('Cannot update a voided invoice');
    if (existing.status === 'paid') throw new BadRequestException('Cannot update a fully paid invoice');

    const now = new Date();
    const updates: Record<string, unknown> = { updatedAt: now, ...(ctx.userId && { updatedBy: ctx.userId }) };
    if (payload.invoiceNumber !== undefined) updates.invoiceNumber = payload.invoiceNumber.trim();
    if (payload.dueDate !== undefined) updates.dueDate = new Date(payload.dueDate);
    if (payload.totalAmount !== undefined) {
      const oldTotal = Number(existing.totalAmount);
      const oldBalance = Number(existing.balanceRemaining);
      const diff = payload.totalAmount - oldTotal;
      const newBalance = oldBalance + diff;
      if (newBalance < 0) {
        throw new BadRequestException('New total would result in negative balance remaining');
      }
      updates.totalAmount = String(payload.totalAmount.toFixed(2));
      updates.balanceRemaining = String(newBalance.toFixed(2));
    }

    const [updated] = await this.db
      .update(supplierInvoices)
      .set(updates as Record<string, string | Date | null>)
      .where(eq(supplierInvoices.id, id))
      .returning({
        id: supplierInvoices.id,
        companyId: supplierInvoices.companyId,
        branchId: supplierInvoices.branchId,
        supplierId: supplierInvoices.supplierId,
        invoiceNumber: supplierInvoices.invoiceNumber,
        invoiceDate: supplierInvoices.invoiceDate,
        dueDate: supplierInvoices.dueDate,
        totalAmount: supplierInvoices.totalAmount,
        balanceRemaining: supplierInvoices.balanceRemaining,
        status: supplierInvoices.status,
        createdAt: supplierInvoices.createdAt,
      });
    if (!updated) throw new InternalServerErrorException('Failed to update invoice');

    await this.audit.log({
      entity: 'supplier_invoices',
      entityId: id,
      action: 'update',
      before: existing as object,
      after: updated as object,
      userId: ctx.userId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return updated;
  }

  async deleteInvoice(id: string, ctx: AuditContext): Promise<{ success: boolean }> {
    const [inv] = await this.db.select().from(supplierInvoices).where(and(eq(supplierInvoices.id, id), isNull(supplierInvoices.deletedAt)));
    if (!inv) throw new NotFoundException('Invoice not found');
    if (inv.status === 'voided') throw new BadRequestException('Invoice already voided');
    
    // We shouldn't void invoices that have payments against them
    if (Number(inv.totalAmount) !== Number(inv.balanceRemaining)) {
      throw new BadRequestException('Cannot void an invoice that has existing payment allocations. Void payments first.');
    }

    const now = new Date();

    await this.db.transaction(async (tx) => {
      await tx.update(supplierInvoices).set({
        status: 'voided',
        deletedAt: now,
        updatedAt: now,
        ...(ctx.userId && { updatedBy: ctx.userId }),
      }).where(eq(supplierInvoices.id, id));

      await this.audit.log(
        {
          entity: 'supplier_invoices',
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
