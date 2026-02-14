import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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

type Schema = typeof schema;

const TRANSFER_TYPE_TANK_TO_TANK = 'tank_to_tank';
const TRANSFER_TYPE_STATION_TO_STATION = 'station_to_station';

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
    if (params.dateFrom) conditions.push(sql`${transfers.transferDate} >= ${params.dateFrom}::timestamptz`);
    if (params.dateTo) conditions.push(sql`${transfers.transferDate} <= ${params.dateTo}::timestamptz`);
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
      this.db.select({ count: sql<number>`count(*)::int` }).from(transfers).where(w),
    ]);
    return { data, total: countResult[0]?.count ?? 0 };
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
          throw new BadRequestException('Tank-to-tank transfer requires both tanks in the same branch');
        }
      },
      ctx,
    );
  }

  async stationToStation(dto: StationToStationTransferDto, ctx: AuditContext): Promise<TransferItem> {
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
          throw new BadRequestException('Station-to-station transfer requires tanks in different branches');
        }
        if (fromTank.stationId !== toTank.stationId && fromTank.productId !== toTank.productId && fromTank.productId && toTank.productId) {
          // Optional: enforce same product for cross-station
          // Currently allow different products if needed
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
    validate: (fromTank: { branchId: string; stationId: string; productId: string | null; capacity: string; currentLevel: string }, toTank: { branchId: string; stationId: string; productId: string | null; capacity: string; currentLevel: string }) => void,
    ctx: AuditContext,
  ): Promise<TransferItem> {
    const [fromTankRow] = await this.db
      .select({
        id: tanks.id,
        branchId: tanks.branchId,
        productId: tanks.productId,
        capacity: tanks.capacity,
        currentLevel: tanks.currentLevel,
      })
      .from(tanks)
      .where(and(eq(tanks.id, fromTankId), isNull(tanks.deletedAt)));
    const [toTankRow] = await this.db
      .select({
        id: tanks.id,
        branchId: tanks.branchId,
        productId: tanks.productId,
        capacity: tanks.capacity,
        currentLevel: tanks.currentLevel,
      })
      .from(tanks)
      .where(and(eq(tanks.id, toTankId), isNull(tanks.deletedAt)));

    if (!fromTankRow) throw new NotFoundException('From tank not found');
    if (!toTankRow) throw new NotFoundException('To tank not found');

    const fromStation = await this.db.select({ stationId: branches.stationId }).from(branches).where(eq(branches.id, fromTankRow.branchId)).limit(1);
    const toStation = await this.db.select({ stationId: branches.stationId }).from(branches).where(eq(branches.id, toTankRow.branchId)).limit(1);
    const fromTank = {
      ...fromTankRow,
      stationId: fromStation[0]?.stationId ?? '',
    };
    const toTank = {
      ...toTankRow,
      stationId: toStation[0]?.stationId ?? '',
    };

    validate(fromTank, toTank);

    const fromCurrent = Number(fromTankRow.currentLevel || 0);
    if (quantity > fromCurrent) {
      throw new BadRequestException(`From tank has insufficient stock: current ${fromCurrent}, requested ${quantity}`);
    }
    const toCapacity = Number(toTankRow.capacity || 0);
    const toCurrent = Number(toTankRow.currentLevel || 0);
    const toFree = toCapacity - toCurrent;
    if (quantity > toFree) {
      throw new BadRequestException(`To tank has insufficient free capacity: free ${toFree}, requested ${quantity}`);
    }

    const transferDate = transferDateStr ? new Date(transferDateStr) : new Date();

    const [inserted] = await this.db.transaction(async (tx) => {
      const [stationRow] = await tx.select({ companyId: stations.companyId }).from(stations).where(eq(stations.id, fromTank.stationId));
      const companyId = stationRow?.companyId ?? '';
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
      if (!tr) throw new Error('Failed to insert transfer');

      const qtyStr = String(quantity.toFixed(3));
      await tx.update(tanks).set({
        currentLevel: String((fromCurrent - quantity).toFixed(3)),
        updatedAt: transferDate,
        updatedBy: ctx.userId,
      }).where(eq(tanks.id, fromTankId));
      await tx.update(tanks).set({
        currentLevel: String((toCurrent + quantity).toFixed(3)),
        updatedAt: transferDate,
        updatedBy: ctx.userId,
      }).where(eq(tanks.id, toTankId));

      const [toBranchStation] = await tx.select({ companyId: stations.companyId }).from(branches).innerJoin(stations, eq(branches.stationId, stations.id)).where(eq(branches.id, toTankRow.branchId));
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

    if (!inserted) throw new Error('Transfer insert failed');
    return inserted;
  }
}
