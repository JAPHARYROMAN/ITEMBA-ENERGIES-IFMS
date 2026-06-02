import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from '../../database/schema';
import {
  salesTransactions,
  SALE_STATUS_COMPLETED,
  SALE_STATUS_PENDING_VOID_APPROVAL,
  SALE_STATUS_VOIDED,
} from '../../database/schema/sales/sales-transactions';
import {
  stockLedger,
  STOCK_LEDGER_MOVEMENT_SALE,
  STOCK_LEDGER_MOVEMENT_VOID_REVERSAL,
} from '../../database/schema/inventory/stock-ledger';
import { tanks } from '../../database/schema/setup/tanks';
import type { AuditService } from '../audit/audit.service';

type Schema = typeof schema;

interface AuditContext {
  userId: string;
  ip?: string;
  userAgent?: string;
}

interface LockedSaleRow {
  [key: string]: unknown;
  id: string;
  companyId: string;
  branchId: string;
  totalAmount: string;
  status: string;
  voidedAt: Date | null;
  voidedBy: string | null;
  voidReason: string | null;
}

interface LedgerAggregateRow {
  [key: string]: unknown;
  companyId: string;
  branchId: string;
  tankId: string;
  productId: string | null;
  quantity: string;
}

interface ApplySaleVoidOptions {
  auditAction?: string;
}

export interface ApplySaleVoidResult {
  sale: LockedSaleRow;
  statusChanged: boolean;
  reversalRowsInserted: number;
}

export async function applySaleVoidReversal(
  tx: NodePgDatabase<Schema>,
  audit: AuditService,
  saleId: string,
  reason: string | null | undefined,
  ctx: AuditContext,
  options: ApplySaleVoidOptions = {},
): Promise<ApplySaleVoidResult> {
  const [existing] = (
    await tx.execute<LockedSaleRow>(sql`
      SELECT
        id,
        company_id AS "companyId",
        branch_id AS "branchId",
        total_amount AS "totalAmount",
        status,
        voided_at AS "voidedAt",
        voided_by AS "voidedBy",
        void_reason AS "voidReason"
      FROM sales_transactions
      WHERE id = ${saleId}
        AND deleted_at IS NULL
      FOR UPDATE
    `)
  ).rows;

  if (!existing) throw new NotFoundException('Sale transaction not found');

  if (
    existing.status !== SALE_STATUS_COMPLETED &&
    existing.status !== SALE_STATUS_PENDING_VOID_APPROVAL &&
    existing.status !== SALE_STATUS_VOIDED
  ) {
    throw new BadRequestException(`Transaction cannot be voided from status ${existing.status}`);
  }

  const now = new Date();
  const voidReason = reason?.trim() || existing.voidReason || null;
  let sale = existing;
  let statusChanged = false;

  if (existing.status !== SALE_STATUS_VOIDED) {
    const [updated] = await tx
      .update(salesTransactions)
      .set({
        status: SALE_STATUS_VOIDED,
        voidedAt: now,
        voidedBy: ctx.userId,
        voidReason,
        updatedAt: now,
        updatedBy: ctx.userId,
      })
      .where(
        and(
          eq(salesTransactions.id, saleId),
          isNull(salesTransactions.deletedAt),
          sql`${salesTransactions.status} <> ${SALE_STATUS_VOIDED}`,
        ),
      )
      .returning({
        id: salesTransactions.id,
        companyId: salesTransactions.companyId,
        branchId: salesTransactions.branchId,
        totalAmount: salesTransactions.totalAmount,
        status: salesTransactions.status,
        voidedAt: salesTransactions.voidedAt,
        voidedBy: salesTransactions.voidedBy,
        voidReason: salesTransactions.voidReason,
      });

    if (!updated) throw new InternalServerErrorException('Failed to void sale transaction');
    sale = updated;
    statusChanged = true;
  }

  const reversalRowsInserted = await restoreSaleStockReversal(tx, saleId, ctx.userId, now);

  if (statusChanged) {
    await audit.log(
      {
        entity: 'sales_transactions',
        entityId: saleId,
        action: options.auditAction ?? 'void',
        before: existing as object,
        after: {
          ...existing,
          status: SALE_STATUS_VOIDED,
          voidedAt: sale.voidedAt,
          voidedBy: sale.voidedBy,
          voidReason: sale.voidReason,
        } as object,
        userId: ctx.userId,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      },
      tx,
    );
  }

  return { sale, statusChanged, reversalRowsInserted };
}

async function restoreSaleStockReversal(
  tx: NodePgDatabase<Schema>,
  saleId: string,
  userId: string,
  movementDate: Date,
): Promise<number> {
  const originalEntries = (
    await tx.execute<LedgerAggregateRow>(sql`
      SELECT
        company_id AS "companyId",
        branch_id AS "branchId",
        tank_id AS "tankId",
        product_id AS "productId",
        COALESCE(SUM(quantity), 0)::text AS quantity
      FROM stock_ledger
      WHERE reference_id = ${saleId}
        AND movement_type = ${STOCK_LEDGER_MOVEMENT_SALE}
      GROUP BY company_id, branch_id, tank_id, product_id
    `)
  ).rows;

  if (!originalEntries.length) return 0;

  const existingReversals = (
    await tx.execute<LedgerAggregateRow>(sql`
      SELECT
        company_id AS "companyId",
        branch_id AS "branchId",
        tank_id AS "tankId",
        product_id AS "productId",
        COALESCE(SUM(quantity), 0)::text AS quantity
      FROM stock_ledger
      WHERE reference_id = ${saleId}
        AND movement_type = ${STOCK_LEDGER_MOVEMENT_VOID_REVERSAL}
        AND reference_type = 'void_reversal'
      GROUP BY company_id, branch_id, tank_id, product_id
    `)
  ).rows;

  const existingByKey = new Map(
    existingReversals.map((entry) => [ledgerAggregateKey(entry), Number(entry.quantity)]),
  );

  let inserted = 0;
  for (const entry of originalEntries) {
    const requiredReversalQty = Number(entry.quantity) * -1;
    const existingReversalQty = existingByKey.get(ledgerAggregateKey(entry)) ?? 0;
    const missingQty = requiredReversalQty - existingReversalQty;

    if (missingQty <= 0.0005) continue;

    const missingQtyString = missingQty.toFixed(3);
    await tx.insert(stockLedger).values({
      companyId: entry.companyId,
      branchId: entry.branchId,
      tankId: entry.tankId,
      productId: entry.productId,
      movementType: STOCK_LEDGER_MOVEMENT_VOID_REVERSAL,
      referenceType: 'void_reversal',
      referenceId: saleId,
      quantity: missingQtyString,
      movementDate,
      createdBy: userId,
      updatedBy: userId,
    });

    await tx
      .update(tanks)
      .set({
        currentLevel: sql`(${tanks.currentLevel} + ${missingQtyString}::numeric)`,
        updatedAt: movementDate,
        updatedBy: userId,
      })
      .where(eq(tanks.id, entry.tankId));

    inserted += 1;
  }

  return inserted;
}

function ledgerAggregateKey(entry: LedgerAggregateRow): string {
  return `${entry.companyId}:${entry.branchId}:${entry.tankId}:${entry.productId ?? ''}`;
}
