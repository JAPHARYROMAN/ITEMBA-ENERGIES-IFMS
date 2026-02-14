import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../../database/database.module';
import type * as schema from '../../database/schema';
import { adjustments } from '../../database/schema/transfers/adjustments';
import { tanks } from '../../database/schema/setup/tanks';
import { branches } from '../../database/schema/core/branches';
import { stations } from '../../database/schema/core/stations';
import { stockLedger, STOCK_LEDGER_MOVEMENT_ADJUSTMENT } from '../../database/schema/inventory/stock-ledger';
import { getListParams } from '../../common/helpers/list.helper';
import { AuditService } from '../audit/audit.service';
import { GovernanceService } from '../governance/governance.service';
import type { CreateAdjustmentDto } from './dto/create-adjustment.dto';

type Schema = typeof schema;

export interface AdjustmentItem {
  id: string;
  companyId: string;
  branchId: string;
  tankId: string;
  adjustmentDate: Date;
  volumeDelta: string;
  reason: string;
  notes: string | null;
  createdAt: Date;
}

export interface AdjustmentsListParams {
  page?: number;
  pageSize?: number;
  branchId?: string;
  companyId?: string;
  tankId?: string;
  dateFrom?: string;
  dateTo?: string;
}

interface AuditContext {
  userId: string;
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AdjustmentsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<Schema>,
    private readonly audit: AuditService,
    private readonly governance: GovernanceService,
  ) {}

  async findPage(params: AdjustmentsListParams): Promise<{ data: AdjustmentItem[]; total: number }> {
    const { offset, limit } = getListParams(params);
    const conditions = [isNull(adjustments.deletedAt)];
    if (params.branchId) conditions.push(eq(adjustments.branchId, params.branchId));
    if (params.companyId) conditions.push(eq(adjustments.companyId, params.companyId));
    if (params.tankId) conditions.push(eq(adjustments.tankId, params.tankId));
    if (params.dateFrom) conditions.push(sql`${adjustments.adjustmentDate} >= ${params.dateFrom}::timestamptz`);
    if (params.dateTo) conditions.push(sql`${adjustments.adjustmentDate} <= ${params.dateTo}::timestamptz`);
    const w = conditions.length > 1 ? and(...conditions) : conditions[0];
    const [data, countResult] = await Promise.all([
      this.db
        .select({
          id: adjustments.id,
          companyId: adjustments.companyId,
          branchId: adjustments.branchId,
          tankId: adjustments.tankId,
          adjustmentDate: adjustments.adjustmentDate,
          volumeDelta: adjustments.volumeDelta,
          reason: adjustments.reason,
          notes: adjustments.notes,
          createdAt: adjustments.createdAt,
        })
        .from(adjustments)
        .where(w)
        .orderBy(desc(adjustments.adjustmentDate))
        .limit(limit)
        .offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(adjustments).where(w),
    ]);
    return { data, total: countResult[0]?.count ?? 0 };
  }

  async create(dto: CreateAdjustmentDto, ctx: AuditContext): Promise<AdjustmentItem> {
    const [branch] = await this.db
      .select({ id: branches.id, stationId: branches.stationId })
      .from(branches)
      .where(and(eq(branches.id, dto.branchId), isNull(branches.deletedAt)));
    if (!branch) throw new NotFoundException('Branch not found');

    const [station] = await this.db
      .select({ id: stations.id, companyId: stations.companyId })
      .from(stations)
      .where(and(eq(stations.id, branch.stationId), isNull(stations.deletedAt)));
    if (!station) throw new NotFoundException('Station not found');

    const [tankRow] = await this.db
      .select({
        id: tanks.id,
        branchId: tanks.branchId,
        productId: tanks.productId,
        capacity: tanks.capacity,
        currentLevel: tanks.currentLevel,
      })
      .from(tanks)
      .where(and(eq(tanks.id, dto.tankId), isNull(tanks.deletedAt)));
    if (!tankRow) throw new NotFoundException('Tank not found');
    if (tankRow.branchId !== dto.branchId) {
      throw new BadRequestException('Tank does not belong to the specified branch');
    }

    const current = Number(tankRow.currentLevel || 0);
    const capacity = Number(tankRow.capacity || 0);
    const newLevel = current + dto.volumeDelta;
    if (newLevel < 0) {
      throw new BadRequestException(`Adjustment would result in negative stock: current ${current}, delta ${dto.volumeDelta}`);
    }
    if (newLevel > capacity) {
      throw new BadRequestException(`Adjustment would exceed tank capacity: max ${capacity}, would be ${newLevel}`);
    }

    const adjustmentDate = dto.adjustmentDate ? new Date(dto.adjustmentDate) : new Date();
    const volumeDeltaStr = String(dto.volumeDelta.toFixed(3));

    const governanceRequest = await this.governance.initiateControlledActionRequest(
      {
        companyId: station.companyId,
        branchId: dto.branchId,
        entityType: 'stock_adjustment',
        entityId: tankRow.id,
        actionType: 'approve',
        amount: Math.abs(dto.volumeDelta),
        reason: dto.reason,
        meta: {
          tankId: dto.tankId,
          volumeDelta: dto.volumeDelta,
          adjustmentDate: adjustmentDate.toISOString(),
        },
      },
      { userId: ctx.userId, permissions: [] },
      { ip: ctx.ip, userAgent: ctx.userAgent },
    );

    if (governanceRequest) {
      throw new BadRequestException({
        message: 'Adjustment requires governance approval before execution',
        approvalRequestId: governanceRequest.id,
        approvalStatus: governanceRequest.status,
      });
    }

    const [inserted] = await this.db.transaction(async (tx) => {
      const [adj] = await tx
        .insert(adjustments)
        .values({
          companyId: station.companyId,
          branchId: dto.branchId,
          tankId: dto.tankId,
          adjustmentDate,
          volumeDelta: volumeDeltaStr,
          reason: dto.reason.trim(),
          notes: dto.notes?.trim() || null,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        })
        .returning({
          id: adjustments.id,
          companyId: adjustments.companyId,
          branchId: adjustments.branchId,
          tankId: adjustments.tankId,
          adjustmentDate: adjustments.adjustmentDate,
          volumeDelta: adjustments.volumeDelta,
          reason: adjustments.reason,
          notes: adjustments.notes,
          createdAt: adjustments.createdAt,
        });
      if (!adj) throw new Error('Failed to insert adjustment');

      await tx
        .update(tanks)
        .set({
          currentLevel: String(newLevel.toFixed(3)),
          updatedAt: adjustmentDate,
          updatedBy: ctx.userId,
        })
        .where(eq(tanks.id, dto.tankId));

      await tx.insert(stockLedger).values({
        companyId: station.companyId,
        branchId: dto.branchId,
        tankId: dto.tankId,
        productId: tankRow.productId,
        movementType: STOCK_LEDGER_MOVEMENT_ADJUSTMENT,
        referenceType: 'adjustment',
        referenceId: adj.id,
        quantity: String(dto.volumeDelta.toFixed(3)),
        movementDate: adjustmentDate,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      });

      await this.audit.log(
        {
          entity: 'adjustments',
          entityId: adj.id,
          action: 'create',
          after: adj as object,
          userId: ctx.userId,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        tx as NodePgDatabase<Schema>,
      );
      return [adj];
    });

    if (!inserted) throw new Error('Adjustment insert failed');
    return inserted;
  }
}
