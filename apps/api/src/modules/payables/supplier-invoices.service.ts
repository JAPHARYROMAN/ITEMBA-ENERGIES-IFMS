import { Injectable, NotFoundException } from '@nestjs/common';
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
    const [station] = await this.db.select({ companyId: stations.companyId }).from(stations).where(eq(stations.id, branch.stationId));
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
    if (!inserted) throw new Error('Insert failed');
    await this.audit.log({ entity: 'supplier_invoices', entityId: inserted.id, action: 'create', after: inserted as object, userId: ctx.userId, ip: ctx.ip, userAgent: ctx.userAgent });
    return inserted;
  }
}
