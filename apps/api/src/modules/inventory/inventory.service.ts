import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../../database/database.module';
import type * as schema from '../../database/schema';
import { tankDips } from '../../database/schema/inventory/tank-dips';
import { reconciliations } from '../../database/schema/inventory/reconciliations';
import { variances, VARIANCE_CLASSIFICATIONS } from '../../database/schema/inventory/variances';
import { branches } from '../../database/schema/core/branches';
import { stations } from '../../database/schema/core/stations';
import { tanks } from '../../database/schema/setup/tanks';
import { getListParams } from '../../common/helpers/list.helper';
import { AuditService } from '../audit/audit.service';
import type { CreateDipDto } from './dto/create-dip.dto';
import type { CreateReconciliationDto } from './dto/create-reconciliation.dto';

type Schema = typeof schema;

export interface TankDipItem {
  id: string;
  companyId: string;
  branchId: string;
  tankId: string;
  dipDate: Date;
  volume: string;
  waterLevel: string | null;
  temperature: string | null;
  createdAt: Date;
}

export interface ReconciliationItem {
  id: string;
  companyId: string;
  branchId: string;
  reconciliationDate: Date;
  shiftId: string | null;
  expectedVolume: string | null;
  actualVolume: string | null;
  variance: string | null;
  notes: string | null;
  status: string;
  createdAt: Date;
}

export interface VarianceItem {
  id: string;
  companyId: string;
  branchId: string;
  tankId: string | null;
  varianceDate: Date;
  volumeVariance: string;
  valueVariance: string | null;
  classification: string | null;
  notes: string | null;
  createdAt: Date;
}

export interface DipsListParams {
  page?: number;
  pageSize?: number;
  branchId?: string;
  tankId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface ReconciliationsListParams {
  page?: number;
  pageSize?: number;
  branchId?: string;
  companyId?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface VariancesListParams {
  page?: number;
  pageSize?: number;
  branchId?: string;
  companyId?: string;
  tankId?: string;
  classification?: string;
  dateFrom?: string;
  dateTo?: string;
}

interface AuditContext {
  userId: string;
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class InventoryService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<Schema>,
    private readonly audit: AuditService,
  ) {}

  async createDip(dto: CreateDipDto, ctx: AuditContext): Promise<TankDipItem> {
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

    const [tank] = await this.db
      .select({ id: tanks.id, branchId: tanks.branchId })
      .from(tanks)
      .where(and(eq(tanks.id, dto.tankId), isNull(tanks.deletedAt)));
    if (!tank) throw new NotFoundException('Tank not found');
    if (tank.branchId !== dto.branchId) throw new BadRequestException('Tank does not belong to branch');

    const [inserted] = await this.db
      .insert(tankDips)
      .values({
        companyId: station.companyId,
        branchId: dto.branchId,
        tankId: dto.tankId,
        dipDate: new Date(dto.dipDate),
        volume: String(dto.volume),
        waterLevel: dto.waterLevel != null ? String(dto.waterLevel) : null,
        temperature: dto.temperature != null ? String(dto.temperature) : null,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      })
      .returning({
        id: tankDips.id,
        companyId: tankDips.companyId,
        branchId: tankDips.branchId,
        tankId: tankDips.tankId,
        dipDate: tankDips.dipDate,
        volume: tankDips.volume,
        waterLevel: tankDips.waterLevel,
        temperature: tankDips.temperature,
        createdAt: tankDips.createdAt,
      });

    if (!inserted) throw new Error('Failed to insert dip');
    await this.audit.log({
      entity: 'tank_dips',
      entityId: inserted.id,
      action: 'create',
      after: inserted as object,
      userId: ctx.userId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return inserted;
  }

  async findDipsPage(params: DipsListParams): Promise<{ data: TankDipItem[]; total: number }> {
    const { offset, limit, page, pageSize } = getListParams(params);
    const conditions = [isNull(tankDips.deletedAt)];
    if (params.branchId) conditions.push(eq(tankDips.branchId, params.branchId));
    if (params.tankId) conditions.push(eq(tankDips.tankId, params.tankId));
    if (params.dateFrom) conditions.push(sql`${tankDips.dipDate} >= ${params.dateFrom}::timestamptz`);
    if (params.dateTo) conditions.push(sql`${tankDips.dipDate} <= ${params.dateTo}::timestamptz`);
    const w = conditions.length > 1 ? and(...conditions) : conditions[0];
    const [data, countResult] = await Promise.all([
      this.db
        .select({
          id: tankDips.id,
          companyId: tankDips.companyId,
          branchId: tankDips.branchId,
          tankId: tankDips.tankId,
          dipDate: tankDips.dipDate,
          volume: tankDips.volume,
          waterLevel: tankDips.waterLevel,
          temperature: tankDips.temperature,
          createdAt: tankDips.createdAt,
        })
        .from(tankDips)
        .where(w)
        .orderBy(desc(tankDips.dipDate))
        .limit(limit)
        .offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(tankDips).where(w),
    ]);
    return { data, total: countResult[0]?.count ?? 0 };
  }

  async createReconciliation(dto: CreateReconciliationDto, ctx: AuditContext): Promise<ReconciliationItem> {
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

    const branchTanks = await this.db
      .select({ id: tanks.id, currentLevel: tanks.currentLevel })
      .from(tanks)
      .where(and(eq(tanks.branchId, dto.branchId), isNull(tanks.deletedAt)));

    const expectedVolume = branchTanks.reduce((sum, t) => sum + Number(t.currentLevel || 0), 0);
    const actualVolume = Number(dto.actualVolume);
    const variance = Math.round((actualVolume - expectedVolume) * 1000) / 1000;
    const classification = dto.varianceClassification && VARIANCE_CLASSIFICATIONS.includes(dto.varianceClassification as any)
      ? dto.varianceClassification
      : (variance !== 0 ? 'unknown' : null);

    const [inserted] = await this.db
      .insert(reconciliations)
      .values({
        companyId: station.companyId,
        branchId: dto.branchId,
        reconciliationDate: new Date(dto.reconciliationDate),
        shiftId: dto.shiftId ?? null,
        expectedVolume: String(expectedVolume.toFixed(3)),
        actualVolume: String(actualVolume.toFixed(3)),
        variance: String(variance.toFixed(3)),
        notes: dto.notes?.trim() || null,
        status: 'completed',
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      })
      .returning({
        id: reconciliations.id,
        companyId: reconciliations.companyId,
        branchId: reconciliations.branchId,
        reconciliationDate: reconciliations.reconciliationDate,
        shiftId: reconciliations.shiftId,
        expectedVolume: reconciliations.expectedVolume,
        actualVolume: reconciliations.actualVolume,
        variance: reconciliations.variance,
        notes: reconciliations.notes,
        status: reconciliations.status,
        createdAt: reconciliations.createdAt,
      });

    if (!inserted) throw new Error('Failed to insert reconciliation');
    await this.audit.log({
      entity: 'reconciliations',
      entityId: inserted.id,
      action: 'create',
      after: inserted as object,
      userId: ctx.userId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    if (variance !== 0 && classification) {
      const [varRow] = await this.db
        .insert(variances)
        .values({
          companyId: station.companyId,
          branchId: dto.branchId,
          tankId: null,
          varianceDate: new Date(dto.reconciliationDate),
          volumeVariance: String(variance.toFixed(3)),
          valueVariance: null,
          classification,
          notes: dto.notes?.trim() || null,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        })
        .returning({ id: variances.id });
      if (varRow) {
        await this.audit.log({
          entity: 'variances',
          entityId: varRow.id,
          action: 'create',
          after: { id: varRow.id, volumeVariance: variance, classification } as object,
          userId: ctx.userId,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        });
      }
    }

    return inserted;
  }

  async findReconciliationsPage(params: ReconciliationsListParams): Promise<{ data: ReconciliationItem[]; total: number }> {
    const { offset, limit, page, pageSize } = getListParams(params);
    const conditions = [isNull(reconciliations.deletedAt)];
    if (params.branchId) conditions.push(eq(reconciliations.branchId, params.branchId));
    if (params.companyId) conditions.push(eq(reconciliations.companyId, params.companyId));
    if (params.status) conditions.push(eq(reconciliations.status, params.status));
    if (params.dateFrom) conditions.push(sql`${reconciliations.reconciliationDate} >= ${params.dateFrom}::timestamptz`);
    if (params.dateTo) conditions.push(sql`${reconciliations.reconciliationDate} <= ${params.dateTo}::timestamptz`);
    const w = conditions.length > 1 ? and(...conditions) : conditions[0];
    const [data, countResult] = await Promise.all([
      this.db
        .select({
          id: reconciliations.id,
          companyId: reconciliations.companyId,
          branchId: reconciliations.branchId,
          reconciliationDate: reconciliations.reconciliationDate,
          shiftId: reconciliations.shiftId,
          expectedVolume: reconciliations.expectedVolume,
          actualVolume: reconciliations.actualVolume,
          variance: reconciliations.variance,
          notes: reconciliations.notes,
          status: reconciliations.status,
          createdAt: reconciliations.createdAt,
        })
        .from(reconciliations)
        .where(w)
        .orderBy(desc(reconciliations.reconciliationDate))
        .limit(limit)
        .offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(reconciliations).where(w),
    ]);
    return { data, total: countResult[0]?.count ?? 0 };
  }

  async findVariancesPage(params: VariancesListParams): Promise<{ data: VarianceItem[]; total: number }> {
    const { offset, limit, page, pageSize } = getListParams(params);
    const conditions = [isNull(variances.deletedAt)];
    if (params.branchId) conditions.push(eq(variances.branchId, params.branchId));
    if (params.companyId) conditions.push(eq(variances.companyId, params.companyId));
    if (params.tankId) conditions.push(eq(variances.tankId, params.tankId));
    if (params.classification) conditions.push(eq(variances.classification, params.classification));
    if (params.dateFrom) conditions.push(sql`${variances.varianceDate} >= ${params.dateFrom}::timestamptz`);
    if (params.dateTo) conditions.push(sql`${variances.varianceDate} <= ${params.dateTo}::timestamptz`);
    const w = conditions.length > 1 ? and(...conditions) : conditions[0];
    const [data, countResult] = await Promise.all([
      this.db
        .select({
          id: variances.id,
          companyId: variances.companyId,
          branchId: variances.branchId,
          tankId: variances.tankId,
          varianceDate: variances.varianceDate,
          volumeVariance: variances.volumeVariance,
          valueVariance: variances.valueVariance,
          classification: variances.classification,
          notes: variances.notes,
          createdAt: variances.createdAt,
        })
        .from(variances)
        .where(w)
        .orderBy(desc(variances.varianceDate))
        .limit(limit)
        .offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(variances).where(w),
    ]);
    return { data, total: countResult[0]?.count ?? 0 };
  }
}
