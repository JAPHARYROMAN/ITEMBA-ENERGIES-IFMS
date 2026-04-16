import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
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
import { products } from '../../database/schema/setup/products';
import { nozzles } from '../../database/schema/setup/nozzles';
import { tanks } from '../../database/schema/setup/tanks';
import {
  stockLedger,
  STOCK_LEDGER_MOVEMENT_SALE,
  STOCK_LEDGER_MOVEMENT_VOID_REVERSAL,
} from '../../database/schema/inventory/stock-ledger';
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
  private readonly logger = new Logger(SalesService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<Schema>,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly governance: GovernanceService,
  ) {}

  async findPage(
    params: SalesListParams,
  ): Promise<{ data: SaleTransactionListItem[]; total: number }> {
    const { offset, limit, page, pageSize } = getListParams(params);
    const conditions = [isNull(salesTransactions.deletedAt)];
    if (params.branchId) conditions.push(eq(salesTransactions.branchId, params.branchId));
    if (params.companyId) conditions.push(eq(salesTransactions.companyId, params.companyId));
    if (params.status) conditions.push(eq(salesTransactions.status, params.status));
    if (params.dateFrom)
      conditions.push(sql`${salesTransactions.transactionDate} >= ${params.dateFrom}::timestamptz`);
    if (params.dateTo)
      conditions.push(sql`${salesTransactions.transactionDate} <= ${params.dateTo}::timestamptz`);
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
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(salesTransactions)
        .where(w),
    ]);
    return { data, total: countResult[0]?.count ?? 0 };
  }

  async findById(id: string, companyId?: string): Promise<SaleTransactionDetail> {
    const conditions = [eq(salesTransactions.id, id), isNull(salesTransactions.deletedAt)];
    if (companyId) conditions.push(eq(salesTransactions.companyId, companyId));

    const [[tx], items, payments] = await Promise.all([
      this.db
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
        .where(and(...conditions)),
      this.db
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
        .where(eq(saleItems.saleTransactionId, id)),
      this.db
        .select({
          id: salePayments.id,
          saleTransactionId: salePayments.saleTransactionId,
          paymentMethod: salePayments.paymentMethod,
          amount: salePayments.amount,
        })
        .from(salePayments)
        .where(eq(salePayments.saleTransactionId, id)),
    ]);
    if (!tx) throw new NotFoundException('Sale transaction not found');

    return {
      ...tx,
      discountAmount: tx.discountAmount ?? null,
      items: items.map((r) => ({ ...r, taxAmount: r.taxAmount ?? '0' })),
      payments,
    };
  }

  async createPosSale(dto: CreatePosSaleDto, ctx: AuditContext): Promise<SaleTransactionDetail> {
    const tolerance = this.config.get<number>('SALES_ROUNDING_TOLERANCE', 0.01);
    const discountThreshold = this.config.get<number>(
      'SALES_DISCOUNT_REQUIRE_MANAGER_THRESHOLD',
      10,
    );

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

      const productIds = [...new Set(dto.items.map((i) => i.productId))];
      const nozzleIds = [...new Set(dto.items.map((i) => i.nozzleId))];

      const productRows = await tx
        .select({ id: products.id, companyId: products.companyId })
        .from(products)
        .where(and(inArray(products.id, productIds), isNull(products.deletedAt)));
      const productById = new Map(productRows.map((p) => [p.id, p]));
      const missingProducts = productIds.filter((id) => !productById.has(id));
      if (missingProducts.length) {
        throw new BadRequestException(`Invalid product references: ${missingProducts.join(', ')}`);
      }

      const wrongCompanyProducts = productRows
        .filter((p) => p.companyId !== station.companyId)
        .map((p) => p.id);
      if (wrongCompanyProducts.length) {
        throw new BadRequestException(
          `Products not mapped to branch company: ${wrongCompanyProducts.join(', ')}`,
        );
      }

      const nozzleRows = await tx
        .select({
          id: nozzles.id,
          stationId: nozzles.stationId,
          tankId: nozzles.tankId,
          productId: nozzles.productId,
        })
        .from(nozzles)
        .where(and(inArray(nozzles.id, nozzleIds), isNull(nozzles.deletedAt)));
      const nozzleById = new Map(nozzleRows.map((n) => [n.id, n]));
      const missingNozzles = nozzleIds.filter((id) => !nozzleById.has(id));
      if (missingNozzles.length) {
        throw new BadRequestException(`Invalid nozzle references: ${missingNozzles.join(', ')}`);
      }

      const nozzleStationMismatch = nozzleRows
        .filter((n) => n.stationId !== branch.stationId)
        .map((n) => n.id);
      if (nozzleStationMismatch.length) {
        throw new BadRequestException(
          `Nozzle does not belong to sale station: ${nozzleStationMismatch.join(', ')}`,
        );
      }

      const tankIds = [...new Set(nozzleRows.map((n) => n.tankId))];
      // Use SELECT FOR UPDATE to lock tank rows and prevent concurrent sale race conditions
      const tankRows = await tx.execute<{
        id: string;
        company_id: string;
        branch_id: string;
        product_id: string;
        current_level: string;
      }>(sql`SELECT id, company_id, branch_id, product_id, current_level
             FROM tanks
             WHERE id = ANY(${tankIds}::uuid[]) AND deleted_at IS NULL
             FOR UPDATE`);
      const tankById = new Map(
        tankRows.rows.map((t) => [
          t.id,
          {
            id: t.id,
            companyId: t.company_id,
            branchId: t.branch_id,
            productId: t.product_id,
            currentLevel: t.current_level,
          },
        ]),
      );
      const missingTanks = tankIds.filter((id) => !tankById.has(id));
      if (missingTanks.length) {
        throw new BadRequestException(
          `Nozzle is linked to missing tank: ${missingTanks.join(', ')}`,
        );
      }

      const requiredByTank = new Map<string, { quantity: number; productId: string }>();
      for (const i of dto.items) {
        const nozzle = nozzleById.get(i.nozzleId);
        if (!nozzle) throw new BadRequestException(`Invalid nozzle reference: ${i.nozzleId}`);
        if (nozzle.productId !== i.productId) {
          throw new BadRequestException(
            `Nozzle ${i.nozzleId} is not configured for product ${i.productId}`,
          );
        }

        const tank = tankById.get(nozzle.tankId);
        if (!tank)
          throw new BadRequestException(`Nozzle ${i.nozzleId} is linked to an unavailable tank`);
        if (tank.companyId !== station.companyId || tank.branchId !== dto.branchId) {
          throw new BadRequestException(`Nozzle ${i.nozzleId} tank is out of sale branch scope`);
        }
        if (tank.productId !== i.productId) {
          throw new BadRequestException(
            `Tank ${tank.id} is not configured for product ${i.productId}`,
          );
        }

        const current = requiredByTank.get(tank.id);
        const qty = Number(i.quantity);
        requiredByTank.set(tank.id, {
          quantity: (current?.quantity ?? 0) + qty,
          productId: i.productId,
        });
      }

      // Warn on insufficient stock but do NOT block the sale — fuel was already dispensed
      for (const [tankId, requirement] of requiredByTank.entries()) {
        const tank = tankById.get(tankId);
        const currentLevel = Number(tank?.currentLevel ?? 0);
        if (requirement.quantity > currentLevel) {
          this.logger.warn(
            `Insufficient stock in tank ${tankId}: available=${currentLevel}, sold=${requirement.quantity}. ` +
              `Tank level will go negative. Branch=${dto.branchId}`,
          );
        }
      }

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

      if (!sale) throw new InternalServerErrorException('Failed to insert sale transaction');

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

      for (const [tankId, requirement] of requiredByTank.entries()) {
        const tank = tankById.get(tankId);
        const currentLevel = Number(tank?.currentLevel ?? 0);
        const nextLevel = currentLevel - requirement.quantity;

        await tx
          .update(tanks)
          .set({
            currentLevel: String(nextLevel.toFixed(3)),
            updatedAt: transactionDate,
            updatedBy: ctx.userId,
          })
          .where(eq(tanks.id, tankId));

        await tx.insert(stockLedger).values({
          companyId: station.companyId,
          branchId: dto.branchId,
          tankId,
          productId: requirement.productId,
          movementType: STOCK_LEDGER_MOVEMENT_SALE,
          referenceType: 'sale',
          referenceId: sale.id,
          quantity: `-${requirement.quantity.toFixed(3)}`,
          movementDate: transactionDate,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
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
          after: {
            id: sale.id,
            receiptNumber,
            totalAmount,
            status: SALE_STATUS_COMPLETED,
          } as object,
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

  async voidTransaction(
    id: string,
    reason: string,
    ctx: AuditContext,
  ): Promise<SaleTransactionDetail> {
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
        after: {
          ...existing,
          status: SALE_STATUS_PENDING_VOID_APPROVAL,
          voidReason: reason.trim(),
        } as object,
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

    if (!updated) throw new InternalServerErrorException('Failed to void sale transaction');

    // Reverse stock ledger entries for the voided sale
    const originalEntries = await this.db
      .select()
      .from(stockLedger)
      .where(
        and(
          eq(stockLedger.referenceId, id),
          eq(stockLedger.movementType, STOCK_LEDGER_MOVEMENT_SALE),
        ),
      );
    for (const entry of originalEntries) {
      const reversalQty = (Number(entry.quantity) * -1).toFixed(3);
      await this.db.insert(stockLedger).values({
        companyId: entry.companyId,
        branchId: entry.branchId,
        tankId: entry.tankId,
        productId: entry.productId,
        movementType: STOCK_LEDGER_MOVEMENT_VOID_REVERSAL,
        referenceType: 'void_reversal',
        referenceId: id,
        quantity: reversalQty,
        movementDate: now,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      });
      // Restore tank level
      await this.db
        .update(tanks)
        .set({
          currentLevel: sql`(COALESCE(CAST(${tanks.currentLevel} AS numeric), 0) + ${Number(reversalQty)})::text`,
          updatedAt: now,
          updatedBy: ctx.userId,
        })
        .where(eq(tanks.id, entry.tankId));
    }

    await this.audit.log({
      entity: 'sales_transactions',
      entityId: id,
      action: 'void',
      before: existing as object,
      after: {
        ...existing,
        status: SALE_STATUS_VOIDED,
        voidedAt: now,
        voidedBy: ctx.userId,
        voidReason: reason.trim(),
      } as object,
      userId: ctx.userId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    return this.findById(id);
  }
}
