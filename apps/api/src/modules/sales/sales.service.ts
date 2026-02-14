import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../../database/database.module';
import type * as schema from '../../database/schema';
import {
  salesTransactions,
  SALE_STATUS_COMPLETED,
  SALE_STATUS_PENDING_VOID_APPROVAL,
  SALE_STATUS_VOIDED,
} from '../../database/schema/sales/sales-transactions';
import { saleItems } from '../../database/schema/sales/sale-items';
import { salePayments } from '../../database/schema/sales/sale-payments';
import { receipts } from '../../database/schema/sales/receipts';
import { branches } from '../../database/schema/core/branches';
import { stations } from '../../database/schema/core/stations';
import { getListParams } from '../../common/helpers/list.helper';
import { AuditService } from '../audit/audit.service';
import { GovernanceService } from '../governance/governance.service';
import type { CreatePosSaleDto } from './dto/create-pos-sale.dto';

type Schema = typeof schema;

export interface SaleTransactionItem {
  id: string;
  saleTransactionId: string;
  productId: string;
  quantity: string;
  unitPrice: string;
  taxAmount: string;
  totalAmount: string;
}

export interface SalePaymentItem {
  id: string;
  saleTransactionId: string;
  paymentMethod: string;
  amount: string;
}

export interface SaleTransactionDetail {
  id: string;
  companyId: string;
  branchId: string;
  receiptNumber: string;
  transactionDate: Date;
  totalAmount: string;
  discountAmount: string | null;
  discountReason: string | null;
  shiftId: string | null;
  status: string;
  voidedAt: Date | null;
  voidedBy: string | null;
  voidReason: string | null;
  createdAt: Date;
  items: SaleTransactionItem[];
  payments: SalePaymentItem[];
}

export interface SaleTransactionListItem {
  id: string;
  companyId: string;
  branchId: string;
  receiptNumber: string;
  transactionDate: Date;
  totalAmount: string;
  status: string;
  createdAt: Date;
}

export interface SalesListParams {
  page?: number;
  pageSize?: number;
  branchId?: string;
  companyId?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
}

interface AuditContext {
  userId: string;
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class SalesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<Schema>,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly governance: GovernanceService,
  ) {}

  async findPage(params: SalesListParams): Promise<{ data: SaleTransactionListItem[]; total: number }> {
    const { offset, limit, page, pageSize } = getListParams(params);
    const conditions = [isNull(salesTransactions.deletedAt)];
    if (params.branchId) conditions.push(eq(salesTransactions.branchId, params.branchId));
    if (params.companyId) conditions.push(eq(salesTransactions.companyId, params.companyId));
    if (params.status) conditions.push(eq(salesTransactions.status, params.status));
    if (params.dateFrom) conditions.push(sql`${salesTransactions.transactionDate} >= ${params.dateFrom}::timestamptz`);
    if (params.dateTo) conditions.push(sql`${salesTransactions.transactionDate} <= ${params.dateTo}::timestamptz`);
    const w = conditions.length > 1 ? and(...conditions) : conditions[0];
    const [data, countResult] = await Promise.all([
      this.db
        .select({
          id: salesTransactions.id,
          companyId: salesTransactions.companyId,
          branchId: salesTransactions.branchId,
          receiptNumber: salesTransactions.receiptNumber,
          transactionDate: salesTransactions.transactionDate,
          totalAmount: salesTransactions.totalAmount,
          status: salesTransactions.status,
          createdAt: salesTransactions.createdAt,
        })
        .from(salesTransactions)
        .where(w)
        .orderBy(desc(salesTransactions.transactionDate))
        .limit(limit)
        .offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(salesTransactions).where(w),
    ]);
    return { data, total: countResult[0]?.count ?? 0 };
  }

  async findById(id: string): Promise<SaleTransactionDetail> {
    const [tx] = await this.db
      .select({
        id: salesTransactions.id,
        companyId: salesTransactions.companyId,
        branchId: salesTransactions.branchId,
        receiptNumber: salesTransactions.receiptNumber,
        transactionDate: salesTransactions.transactionDate,
        totalAmount: salesTransactions.totalAmount,
        discountAmount: salesTransactions.discountAmount,
        discountReason: salesTransactions.discountReason,
        shiftId: salesTransactions.shiftId,
        status: salesTransactions.status,
        voidedAt: salesTransactions.voidedAt,
        voidedBy: salesTransactions.voidedBy,
        voidReason: salesTransactions.voidReason,
        createdAt: salesTransactions.createdAt,
      })
      .from(salesTransactions)
      .where(and(eq(salesTransactions.id, id), isNull(salesTransactions.deletedAt)));
    if (!tx) throw new NotFoundException('Sale transaction not found');

    const items = await this.db
      .select({
        id: saleItems.id,
        saleTransactionId: saleItems.saleTransactionId,
        productId: saleItems.productId,
        quantity: saleItems.quantity,
        unitPrice: saleItems.unitPrice,
        taxAmount: saleItems.taxAmount,
        totalAmount: saleItems.totalAmount,
      })
      .from(saleItems)
      .where(eq(saleItems.saleTransactionId, id));

    const payments = await this.db
      .select({
        id: salePayments.id,
        saleTransactionId: salePayments.saleTransactionId,
        paymentMethod: salePayments.paymentMethod,
        amount: salePayments.amount,
      })
      .from(salePayments)
      .where(eq(salePayments.saleTransactionId, id));

    return {
      ...tx,
      discountAmount: tx.discountAmount ?? null,
      items: items.map((r) => ({ ...r, taxAmount: r.taxAmount ?? '0' })),
      payments,
    };
  }

  async createPosSale(dto: CreatePosSaleDto, ctx: AuditContext): Promise<SaleTransactionDetail> {
    const tolerance = this.config.get<number>('SALES_ROUNDING_TOLERANCE', 0.01);
    const discountThreshold = this.config.get<number>('SALES_DISCOUNT_REQUIRE_MANAGER_THRESHOLD', 10);

    if (!dto.items?.length) throw new BadRequestException('At least one item is required');
    if (!dto.payments?.length) throw new BadRequestException('At least one payment is required');

    const discountAmount = Number(dto.discountAmount) || 0;
    if (discountAmount > 0 && discountAmount >= discountThreshold) {
      if (!dto.discountReason?.trim()) {
        throw new BadRequestException(
          `Discount of ${discountAmount} exceeds threshold ${discountThreshold}; reason is required`,
        );
      }
    }

    const subtotal = dto.items.reduce((sum, i) => {
      const qty = Number(i.quantity);
      const unit = Number(i.unitPrice);
      const tax = Number(i.taxAmount) || 0;
      return sum + qty * unit + tax;
    }, 0);
    const totalAmount = Math.round((subtotal - discountAmount) * 100) / 100;
    if (totalAmount < 0) throw new BadRequestException('Total cannot be negative after discount');

    const paymentSum = dto.payments.reduce((s, p) => s + Number(p.amount), 0);
    const diff = Math.abs(paymentSum - totalAmount);
    if (diff > tolerance) {
      throw new BadRequestException(
        `Payment split sum (${paymentSum}) must equal total (${totalAmount}) within tolerance ${tolerance}`,
      );
    }

    const createdId = await this.db.transaction(async (tx) => {
      const [branch] = await tx
        .select({ id: branches.id, stationId: branches.stationId })
        .from(branches)
        .where(and(eq(branches.id, dto.branchId), isNull(branches.deletedAt)));
      if (!branch) throw new NotFoundException('Branch not found');

      const [station] = await tx
        .select({ id: stations.id, companyId: stations.companyId })
        .from(stations)
        .where(and(eq(stations.id, branch.stationId), isNull(stations.deletedAt)));
      if (!station) throw new NotFoundException('Station not found');

      const receiptNumber = `RCP-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      const transactionDate = new Date();

      const [sale] = await tx
        .insert(salesTransactions)
        .values({
          companyId: station.companyId,
          branchId: dto.branchId,
          receiptNumber,
          transactionDate,
          totalAmount: String(totalAmount.toFixed(2)),
          discountAmount: discountAmount > 0 ? String(discountAmount.toFixed(2)) : '0',
          discountReason: dto.discountReason?.trim() || null,
          paymentType: dto.payments.length === 1 ? dto.payments[0].paymentMethod : null,
          shiftId: dto.shiftId ?? null,
          status: SALE_STATUS_COMPLETED,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        })
        .returning({ id: salesTransactions.id });

      if (!sale) throw new Error('Failed to insert sale transaction');

      for (const i of dto.items) {
        const qty = Number(i.quantity);
        const unit = Number(i.unitPrice);
        const tax = Number(i.taxAmount) || 0;
        const lineTotal = Math.round((qty * unit + tax) * 100) / 100;
        await tx.insert(saleItems).values({
          saleTransactionId: sale.id,
          productId: i.productId,
          quantity: String(qty),
          unitPrice: String(unit),
          taxAmount: String(tax.toFixed(2)),
          totalAmount: String(lineTotal.toFixed(2)),
        });
      }

      for (const p of dto.payments) {
        await tx.insert(salePayments).values({
          saleTransactionId: sale.id,
          paymentMethod: p.paymentMethod,
          amount: String(Number(p.amount).toFixed(2)),
        });
      }

      await tx.insert(receipts).values({
        saleTransactionId: sale.id,
        receiptNumber,
        totalAmount: String(totalAmount.toFixed(2)),
        contentHtml: null,
      });

      await this.audit.log(
        {
          entity: 'sales_transactions',
          entityId: sale.id,
          action: 'create',
          after: { id: sale.id, receiptNumber, totalAmount, status: SALE_STATUS_COMPLETED } as object,
          userId: ctx.userId,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        tx as NodePgDatabase<Schema>,
      );

      return sale.id;
    });
    return this.findById(createdId);
  }

  async voidTransaction(id: string, reason: string, ctx: AuditContext): Promise<SaleTransactionDetail> {
    const [existing] = await this.db
      .select()
      .from(salesTransactions)
      .where(and(eq(salesTransactions.id, id), isNull(salesTransactions.deletedAt)));
    if (!existing) throw new NotFoundException('Sale transaction not found');
    if (existing.status === SALE_STATUS_VOIDED) {
      throw new BadRequestException('Transaction is already voided');
    }
    if (existing.status === SALE_STATUS_PENDING_VOID_APPROVAL) {
      throw new BadRequestException('Transaction void is already pending approval');
    }

    const governanceRequest = await this.governance.initiateControlledActionRequest(
      {
        companyId: existing.companyId,
        branchId: existing.branchId,
        entityType: 'sale_transaction',
        entityId: existing.id,
        actionType: 'void',
        amount: Number(existing.totalAmount),
        reason: reason.trim(),
        meta: {
          voidReason: reason.trim(),
          amount: Number(existing.totalAmount),
        },
      },
      { userId: ctx.userId, permissions: [] },
      { ip: ctx.ip, userAgent: ctx.userAgent },
    );

    if (governanceRequest) {
      const nowPending = new Date();
      await this.db
        .update(salesTransactions)
        .set({
          status: SALE_STATUS_PENDING_VOID_APPROVAL,
          voidReason: reason.trim(),
          updatedAt: nowPending,
          updatedBy: ctx.userId,
        })
        .where(eq(salesTransactions.id, id));

      await this.audit.log({
        entity: 'sales_transactions',
        entityId: id,
        action: 'void_submitted_for_approval',
        before: existing as object,
        after: { ...existing, status: SALE_STATUS_PENDING_VOID_APPROVAL, voidReason: reason.trim() } as object,
        userId: ctx.userId,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });

      return this.findById(id);
    }

    const now = new Date();
    const [updated] = await this.db
      .update(salesTransactions)
      .set({
        status: SALE_STATUS_VOIDED,
        voidedAt: now,
        voidedBy: ctx.userId,
        voidReason: reason.trim(),
        updatedAt: now,
        updatedBy: ctx.userId,
      })
      .where(eq(salesTransactions.id, id))
      .returning({
        id: salesTransactions.id,
        status: salesTransactions.status,
        voidedAt: salesTransactions.voidedAt,
        voidedBy: salesTransactions.voidedBy,
        voidReason: salesTransactions.voidReason,
      });

    if (!updated) throw new Error('Update failed');

    await this.audit.log({
      entity: 'sales_transactions',
      entityId: id,
      action: 'void',
      before: existing as object,
      after: { ...existing, status: SALE_STATUS_VOIDED, voidedAt: now, voidedBy: ctx.userId, voidReason: reason.trim() } as object,
      userId: ctx.userId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    return this.findById(id);
  }
}
