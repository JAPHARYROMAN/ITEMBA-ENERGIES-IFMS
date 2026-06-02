import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../../database/database.module';
import type * as schema from '../../database/schema';
import { transfers } from '../../database/schema/transfers/transfers';
import { tanks } from '../../database/schema/setup/tanks';
import { branches } from '../../database/schema/core/branches';
import { stations } from '../../database/schema/core/stations';
import {
  stockLedger,
  STOCK_LEDGER_MOVEMENT_TRANSFER_IN,
  STOCK_LEDGER_MOVEMENT_TRANSFER_OUT,
} from '../../database/schema/inventory/stock-ledger';
import { getListParams } from '../../common/helpers/list.helper';
import { AuditService } from '../audit/audit.service';
import type { TankToTankTransferDto } from './dto/tank-to-tank-transfer.dto';
import type { StationToStationTransferDto } from './dto/station-to-station-transfer.dto';
import type { UpdateTransferDto } from './dto/update-transfer.dto';

type Schema = typeof schema;

const TRANSFER_TYPE_TANK_TO_TANK = 'tank_to_tank';
const TRANSFER_TYPE_STATION_TO_STATION = 'station_to_station';

interface RawTankRow {
  [key: string]: unknown;
  id: string;
  branchId: string;
  productId: string | null;
  capacity: string;
  currentLevel: string;
}

export interface TransferItem {
  id: string;
  companyId: string;
  branchId: string;
  transferType: string;
  fromTankId: string | null;
  toTankId: string | null;
  quantity: string;
  transferDate: Date;
  reference: string | null;
  status: string;
  createdAt: Date;
}

export interface TransfersListParams {
  page?: number;
  pageSize?: number;
  branchId?: string;
  companyId?: string;
  transferType?: string;
  dateFrom?: string;
  dateTo?: string;
}

interface AuditContext {
  userId: string;
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class TransfersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<Schema>,
    private readonly audit: AuditService,
  ) {}

  async findPage(params: TransfersListParams): Promise<{ data: TransferItem[]; total: number }> {
    const { offset, limit } = getListParams(params);
    const conditions = [isNull(transfers.deletedAt)];
    if (params.branchId) conditions.push(eq(transfers.branchId, params.branchId));
    if (params.companyId) conditions.push(eq(transfers.companyId, params.companyId));
    if (params.transferType) conditions.push(eq(transfers.transferType, params.transferType));
    if (params.dateFrom)
      conditions.push(sql`${transfers.transferDate} >= ${params.dateFrom}::timestamptz`);
    if (params.dateTo)
      conditions.push(sql`${transfers.transferDate} <= ${params.dateTo}::timestamptz`);
    const w = conditions.length > 1 ? and(...conditions) : conditions[0];
    const [data, countResult] = await Promise.all([
      this.db
        .select({
          id: transfers.id,
          companyId: transfers.companyId,
          branchId: transfers.branchId,
          transferType: transfers.transferType,
          fromTankId: transfers.fromTankId,
          toTankId: transfers.toTankId,
          quantity: transfers.quantity,
          transferDate: transfers.transferDate,
          reference: transfers.reference,
          status: transfers.status,
          createdAt: transfers.createdAt,
        })
        .from(transfers)
        .where(w)
        .orderBy(desc(transfers.transferDate))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(transfers)
        .where(w),
    ]);
    return { data, total: countResult[0]?.count ?? 0 };
  }

  async findById(id: string): Promise<TransferItem> {
    const [row] = await this.db
      .select({
        id: transfers.id,
        companyId: transfers.companyId,
        branchId: transfers.branchId,
        transferType: transfers.transferType,
        fromTankId: transfers.fromTankId,
        toTankId: transfers.toTankId,
        quantity: transfers.quantity,
        transferDate: transfers.transferDate,
        reference: transfers.reference,
        status: transfers.status,
        createdAt: transfers.createdAt,
      })
      .from(transfers)
      .where(and(eq(transfers.id, id), isNull(transfers.deletedAt)));
    if (!row) throw new NotFoundException('Transfer not found');
    return row;
  }

  async tankToTank(dto: TankToTankTransferDto, ctx: AuditContext): Promise<TransferItem> {
    if (dto.fromTankId === dto.toTankId) {
      throw new BadRequestException('From tank and to tank must be different');
    }
    return this.executeTransfer(
      dto.fromTankId,
      dto.toTankId,
      dto.quantity,
      dto.transferDate,
      dto.reference,
      TRANSFER_TYPE_TANK_TO_TANK,
      (fromTank, toTank) => {
        if (fromTank.branchId !== toTank.branchId) {
          throw new BadRequestException(
            'Tank-to-tank transfer requires both tanks in the same branch',
          );
        }
      },
      ctx,
    );
  }

  async stationToStation(
    dto: StationToStationTransferDto,
    ctx: AuditContext,
  ): Promise<TransferItem> {
    if (dto.fromTankId === dto.toTankId) {
      throw new BadRequestException('From tank and to tank must be different');
    }
    return this.executeTransfer(
      dto.fromTankId,
      dto.toTankId,
      dto.quantity,
      dto.transferDate,
      dto.reference,
      TRANSFER_TYPE_STATION_TO_STATION,
      (fromTank, toTank) => {
        if (fromTank.branchId === toTank.branchId) {
          throw new BadRequestException(
            'Station-to-station transfer requires tanks in different branches',
          );
        }
        if (
          fromTank.stationId !== toTank.stationId &&
          fromTank.productId !== toTank.productId &&
          fromTank.productId &&
          toTank.productId
        ) {
          throw new BadRequestException('Transfers cannot mix products between tanks');
        }
      },
      ctx,
    );
  }

  private async executeTransfer(
    fromTankId: string,
    toTankId: string,
    quantity: number,
    transferDateStr: string | undefined,
    reference: string | undefined,
    transferType: string,
    validate: (
      fromTank: {
        branchId: string;
        stationId: string;
        productId: string | null;
        capacity: string;
        currentLevel: string;
      },
      toTank: {
        branchId: string;
        stationId: string;
        productId: string | null;
        capacity: string;
        currentLevel: string;
      },
    ) => void,
    ctx: AuditContext,
  ): Promise<TransferItem> {
    const transferDate = transferDateStr ? new Date(transferDateStr) : new Date();

    const [inserted] = await this.db.transaction(async (tx) => {
      // Lock tank rows in deterministic order to avoid transfer deadlocks.
      const tankResult = await tx.execute<RawTankRow>(
        sql`SELECT id, branch_id AS "branchId", product_id AS "productId", capacity, current_level AS "currentLevel"
            FROM tanks
            WHERE id = ANY(${[fromTankId, toTankId]}::uuid[]) AND deleted_at IS NULL
            ORDER BY id
            FOR UPDATE`,
      );
      const tankById = new Map(tankResult.rows.map((tank) => [tank.id, tank]));
      const fromTankRow = tankById.get(fromTankId);
      const toTankRow = tankById.get(toTankId);

      if (!fromTankRow) throw new NotFoundException('From tank not found');
      if (!toTankRow) throw new NotFoundException('To tank not found');

      const fromStation = await tx
        .select({ stationId: branches.stationId })
        .from(branches)
        .where(eq(branches.id, fromTankRow.branchId))
        .limit(1);
      const toStation = await tx
        .select({ stationId: branches.stationId })
        .from(branches)
        .where(eq(branches.id, toTankRow.branchId))
        .limit(1);
      const fromTank = { ...fromTankRow, stationId: fromStation[0]?.stationId };
      const toTank = { ...toTankRow, stationId: toStation[0]?.stationId };

      if (!fromTank.stationId) throw new NotFoundException('From tank station not found');
      if (!toTank.stationId) throw new NotFoundException('To tank station not found');

      validate(fromTank, toTank);
      this.assertSameTransferProduct(fromTank, toTank);

      const fromCurrent = Number(fromTankRow.currentLevel || 0);
      if (quantity > fromCurrent) {
        throw new BadRequestException(
          `From tank has insufficient stock: current ${fromCurrent}, requested ${quantity}`,
        );
      }
      const toCapacity = Number(toTankRow.capacity || 0);
      const toCurrent = Number(toTankRow.currentLevel || 0);
      const toFree = toCapacity - toCurrent;
      if (quantity > toFree) {
        throw new BadRequestException(
          `To tank has insufficient free capacity: free ${toFree}, requested ${quantity}`,
        );
      }

      const [stationRow] = await tx
        .select({ companyId: stations.companyId })
        .from(stations)
        .where(eq(stations.id, fromTank.stationId));
      if (!stationRow?.companyId) throw new NotFoundException('Source station company not found');
      const companyId = stationRow.companyId;
      const branchId = fromTankRow.branchId;

      const [tr] = await tx
        .insert(transfers)
        .values({
          companyId,
          branchId,
          transferType,
          fromTankId,
          toTankId,
          quantity: String(quantity.toFixed(3)),
          transferDate,
          reference: reference?.trim() || null,
          status: 'completed',
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        })
        .returning({
          id: transfers.id,
          companyId: transfers.companyId,
          branchId: transfers.branchId,
          transferType: transfers.transferType,
          fromTankId: transfers.fromTankId,
          toTankId: transfers.toTankId,
          quantity: transfers.quantity,
          transferDate: transfers.transferDate,
          reference: transfers.reference,
          status: transfers.status,
          createdAt: transfers.createdAt,
        });
      if (!tr) throw new InternalServerErrorException('Failed to insert transfer');

      const qtyStr = String(quantity.toFixed(3));
      await tx
        .update(tanks)
        .set({
          currentLevel: sql`(${tanks.currentLevel} - ${qtyStr}::numeric)`,
          updatedAt: transferDate,
          updatedBy: ctx.userId,
        })
        .where(eq(tanks.id, fromTankId));
      await tx
        .update(tanks)
        .set({
          currentLevel: sql`(${tanks.currentLevel} + ${qtyStr}::numeric)`,
          updatedAt: transferDate,
          updatedBy: ctx.userId,
        })
        .where(eq(tanks.id, toTankId));

      const [toBranchStation] = await tx
        .select({ companyId: stations.companyId })
        .from(branches)
        .innerJoin(stations, eq(branches.stationId, stations.id))
        .where(eq(branches.id, toTankRow.branchId));
      const toCompanyId = toBranchStation?.companyId ?? companyId;

      await tx.insert(stockLedger).values([
        {
          companyId,
          branchId: fromTankRow.branchId,
          tankId: fromTankId,
          productId: fromTankRow.productId,
          movementType: STOCK_LEDGER_MOVEMENT_TRANSFER_OUT,
          referenceType: 'transfer',
          referenceId: tr.id,
          quantity: `-${qtyStr}`,
          movementDate: transferDate,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        },
        {
          companyId: toCompanyId,
          branchId: toTankRow.branchId,
          tankId: toTankId,
          productId: toTankRow.productId,
          movementType: STOCK_LEDGER_MOVEMENT_TRANSFER_IN,
          referenceType: 'transfer',
          referenceId: tr.id,
          quantity: qtyStr,
          movementDate: transferDate,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        },
      ]);

      await this.audit.log(
        {
          entity: 'transfers',
          entityId: tr.id,
          action: 'create',
          after: tr as object,
          userId: ctx.userId,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        tx as NodePgDatabase<Schema>,
      );
      return [tr];
    });

    if (!inserted) throw new InternalServerErrorException('Transfer insert failed');
    return inserted;
  }

  private assertSameTransferProduct(
    fromTank: { productId: string | null },
    toTank: { productId: string | null },
  ): void {
    if (!fromTank.productId || !toTank.productId) {
      throw new BadRequestException('Both tanks must have a configured product before transfer');
    }
    if (fromTank.productId !== toTank.productId) {
      throw new BadRequestException('Transfers cannot mix products between tanks');
    }
  }

  async updateTransfer(id: string, dto: UpdateTransferDto, ctx: AuditContext): Promise<TransferItem> {
    const [existing] = await this.db
      .select()
      .from(transfers)
      .where(and(eq(transfers.id, id), isNull(transfers.deletedAt)));
    if (!existing) throw new NotFoundException('Transfer not found');
    if (existing.status === 'voided') throw new BadRequestException('Cannot update a voided transfer');

    const now = new Date();
    const updates: Record<string, unknown> = { updatedAt: now, updatedBy: ctx.userId };
    if (dto.reference !== undefined) updates.reference = dto.reference?.trim() || null;

    const [updated] = await this.db
      .update(transfers)
      .set(updates)
      .where(eq(transfers.id, id))
      .returning({
        id: transfers.id,
        companyId: transfers.companyId,
        branchId: transfers.branchId,
        transferType: transfers.transferType,
        fromTankId: transfers.fromTankId,
        toTankId: transfers.toTankId,
        quantity: transfers.quantity,
        transferDate: transfers.transferDate,
        reference: transfers.reference,
        status: transfers.status,
        createdAt: transfers.createdAt,
      });
    if (!updated) throw new InternalServerErrorException('Failed to update transfer');

    await this.audit.log({
      entity: 'transfers',
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

  async deleteTransfer(id: string, ctx: AuditContext): Promise<{ success: boolean }> {
    const now = new Date();

    await this.db.transaction(async (tx) => {
      const [tr] = await tx
        .select()
        .from(transfers)
        .where(and(eq(transfers.id, id), isNull(transfers.deletedAt)));
      if (!tr) throw new NotFoundException('Transfer not found');
      if (tr.status === 'deleted' || tr.status === 'voided')
        throw new BadRequestException('Transfer already deleted');

      const qty = Number(tr.quantity);
      if (!tr.fromTankId || !tr.toTankId || isNaN(qty)) {
        throw new BadRequestException('Invalid transfer record cannot be reversed');
      }

      const tankResult = await tx.execute<RawTankRow>(
        sql`SELECT id, current_level AS "currentLevel", product_id AS "productId", branch_id AS "branchId", capacity
            FROM tanks
            WHERE id = ANY(${[tr.fromTankId, tr.toTankId]}::uuid[])
            ORDER BY id
            FOR UPDATE`,
      );
      const tankById = new Map(tankResult.rows.map((tank) => [tank.id, tank]));
      const fromTankRow = tankById.get(tr.fromTankId);
      const toTankRow = tankById.get(tr.toTankId);

      if (!fromTankRow || !toTankRow)
        throw new NotFoundException('One or more associated tanks not found');

      const fromCurrent = Number(fromTankRow.currentLevel || 0);
      const toCurrent = Number(toTankRow.currentLevel || 0);

      if (toCurrent < qty) {
        throw new BadRequestException(
          `Cannot reverse transfer: destination tank has insufficient stock (${toCurrent}) to return ${qty}`,
        );
      }
      await tx
        .update(transfers)
        .set({ status: 'voided', deletedAt: now, updatedBy: ctx.userId, updatedAt: now })
        .where(eq(transfers.id, id));

      await tx
        .update(tanks)
        .set({
          currentLevel: sql`(${tanks.currentLevel} + ${qty.toFixed(3)}::numeric)`,
          updatedAt: now,
          updatedBy: ctx.userId,
        })
        .where(eq(tanks.id, tr.fromTankId!));

      await tx
        .update(tanks)
        .set({
          currentLevel: sql`(${tanks.currentLevel} - ${qty.toFixed(3)}::numeric)`,
          updatedAt: now,
          updatedBy: ctx.userId,
        })
        .where(eq(tanks.id, tr.toTankId!));

      await tx.insert(stockLedger).values([
        {
          companyId: tr.companyId,
          branchId: fromTankRow.branchId,
          tankId: tr.fromTankId!,
          productId: fromTankRow.productId ?? null,
          movementType: STOCK_LEDGER_MOVEMENT_TRANSFER_IN,
          referenceType: 'transfer_void',
          referenceId: tr.id,
          quantity: String(qty.toFixed(3)),
          movementDate: now,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        },
        {
          companyId: tr.companyId,
          branchId: toTankRow.branchId,
          tankId: tr.toTankId!,
          productId: toTankRow.productId ?? null,
          movementType: STOCK_LEDGER_MOVEMENT_TRANSFER_OUT,
          referenceType: 'transfer_void',
          referenceId: tr.id,
          quantity: `-${qty.toFixed(3)}`,
          movementDate: now,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        },
      ]);

      await this.audit.log(
        {
          entity: 'transfers',
          entityId: tr.id,
          action: 'delete',
          before: tr as object,
          after: { ...tr, status: 'voided', deletedAt: now } as object,
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
