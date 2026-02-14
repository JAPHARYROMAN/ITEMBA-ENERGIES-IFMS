import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { and, asc, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../../database/database.module';
import type * as schema from '../../database/schema';
import { tanks } from '../../database/schema/setup';
import { parseSort } from '../../common/dto/sort.dto';
import { getListParams } from '../../common/helpers/list.helper';
import { throwConflictIfUniqueViolation } from '../../common/utils/db-errors';
import { AuditService } from '../audit/audit.service';

type Schema = typeof schema;

const SORT_COL: Record<string, typeof tanks.createdAt | typeof tanks.code | typeof tanks.status> = {
  created_at: tanks.createdAt,
  createdAt: tanks.createdAt,
  code: tanks.code,
  status: tanks.status,
};

export interface TanksListParams {
  page?: number;
  pageSize?: number;
  sort?: string;
  q?: string;
  companyId?: string;
  branchId?: string;
}

export interface TankItem {
  id: string;
  companyId: string;
  branchId: string;
  productId: string | null;
  code: string;
  capacity: string;
  minLevel: string;
  maxLevel: string;
  currentLevel: string;
  calibrationProfile: string | null;
  status: string;
  createdAt: Date;
}

@Injectable()
export class TanksService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<Schema>,
    private readonly audit: AuditService,
  ) {}

  async findPage(params: TanksListParams): Promise<{ data: TankItem[]; total: number }> {
    const { offset, limit, page, pageSize } = getListParams(params);
    const conditions = [isNull(tanks.deletedAt)];
    if (params.companyId) conditions.push(eq(tanks.companyId, params.companyId));
    if (params.branchId) conditions.push(eq(tanks.branchId, params.branchId));
    if (params.q) conditions.push(or(ilike(tanks.code, `%${params.q}%`))!);
    const w = conditions.length > 1 ? and(...conditions) : conditions[0];
    const parsed = parseSort(params.sort);
    const col = parsed ? SORT_COL[parsed.field] ?? tanks.createdAt : tanks.createdAt;
    const [data, cr] = await Promise.all([
      this.db
        .select({
          id: tanks.id,
          companyId: tanks.companyId,
          branchId: tanks.branchId,
          productId: tanks.productId,
          code: tanks.code,
          capacity: tanks.capacity,
          minLevel: tanks.minLevel,
          maxLevel: tanks.maxLevel,
          currentLevel: tanks.currentLevel,
          calibrationProfile: tanks.calibrationProfile,
          status: tanks.status,
          createdAt: tanks.createdAt,
        })
        .from(tanks)
        .where(w)
        .orderBy(parsed?.direction === 'asc' ? asc(col) : desc(col))
        .limit(limit)
        .offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(tanks).where(w),
    ]);
    return { data, total: cr[0]?.count ?? 0 };
  }

  async findById(id: string): Promise<TankItem> {
    const [row] = await this.db
      .select({
        id: tanks.id,
        companyId: tanks.companyId,
        branchId: tanks.branchId,
        productId: tanks.productId,
        code: tanks.code,
        capacity: tanks.capacity,
        minLevel: tanks.minLevel,
        maxLevel: tanks.maxLevel,
        currentLevel: tanks.currentLevel,
        calibrationProfile: tanks.calibrationProfile,
        status: tanks.status,
        createdAt: tanks.createdAt,
      })
      .from(tanks)
      .where(and(eq(tanks.id, id), isNull(tanks.deletedAt)));
    if (!row) throw new NotFoundException('Tank not found');
    return row;
  }

  async create(
    payload: {
      companyId: string;
      branchId: string;
      productId?: string;
      code: string;
      capacity: number | string;
      minLevel?: number | string;
      maxLevel: number | string;
      currentLevel?: number | string;
      calibrationProfile?: string;
      status?: string;
    },
    auditContext: { userId?: string; ip?: string; userAgent?: string },
  ): Promise<TankItem> {
    const code = payload.code.trim();
    const [ex] = await this.db.select({ id: tanks.id }).from(tanks).where(and(eq(tanks.branchId, payload.branchId), eq(tanks.code, code)));
    if (ex) throw new ConflictException(`Tank with code "${code}" already exists in this branch`);
    try {
      const [ins] = await this.db
        .insert(tanks)
        .values({
          companyId: payload.companyId,
          branchId: payload.branchId,
          productId: payload.productId ?? null,
          code,
          capacity: String(payload.capacity),
          minLevel: payload.minLevel != null ? String(payload.minLevel) : '0',
          maxLevel: String(payload.maxLevel),
          currentLevel: payload.currentLevel != null ? String(payload.currentLevel) : '0',
          calibrationProfile: payload.calibrationProfile ?? null,
          status: payload.status ?? 'active',
        })
        .returning({
          id: tanks.id,
          companyId: tanks.companyId,
          branchId: tanks.branchId,
          productId: tanks.productId,
          code: tanks.code,
          capacity: tanks.capacity,
          minLevel: tanks.minLevel,
          maxLevel: tanks.maxLevel,
          currentLevel: tanks.currentLevel,
          calibrationProfile: tanks.calibrationProfile,
          status: tanks.status,
          createdAt: tanks.createdAt,
        });
      if (!ins) throw new Error('Insert failed');
      await this.audit.log({ entity: 'tanks', entityId: ins.id, action: 'create', after: ins as object, userId: auditContext.userId, ip: auditContext.ip, userAgent: auditContext.userAgent });
      return ins;
    } catch (err) {
      throwConflictIfUniqueViolation(err, `Tank with code "${code}" already exists in this branch`);
      throw err;
    }
  }

  async update(
    id: string,
    payload: Partial<{
      companyId: string;
      branchId: string;
      productId: string;
      code: string;
      capacity: number | string;
      minLevel: number | string;
      maxLevel: number | string;
      currentLevel: number | string;
      calibrationProfile: string;
      status: string;
    }>,
    auditContext: { userId?: string; ip?: string; userAgent?: string },
  ): Promise<TankItem> {
    const before = await this.findByIdOrNull(id);
    if (!before) throw new NotFoundException('Tank not found');
    const branchId = payload.branchId ?? before.branchId;
    if (payload.code !== undefined) {
      const code = payload.code.trim();
      if (code !== before.code) {
        const [ex] = await this.db.select({ id: tanks.id }).from(tanks).where(and(eq(tanks.branchId, branchId), eq(tanks.code, code)));
        if (ex) throw new ConflictException(`Tank with code "${code}" already exists in this branch`);
      }
    }
    const set: Record<string, unknown> = { updatedAt: new Date(), ...(auditContext.userId && { updatedBy: auditContext.userId }) };
    if (payload.companyId !== undefined) set.companyId = payload.companyId;
    if (payload.branchId !== undefined) set.branchId = payload.branchId;
    if (payload.productId !== undefined) set.productId = payload.productId;
    if (payload.code !== undefined) set.code = payload.code.trim();
    if (payload.capacity !== undefined) set.capacity = String(payload.capacity);
    if (payload.minLevel !== undefined) set.minLevel = String(payload.minLevel);
    if (payload.maxLevel !== undefined) set.maxLevel = String(payload.maxLevel);
    if (payload.currentLevel !== undefined) set.currentLevel = String(payload.currentLevel);
    if (payload.calibrationProfile !== undefined) set.calibrationProfile = payload.calibrationProfile;
    if (payload.status !== undefined) set.status = payload.status;
    const [upd] = await this.db.update(tanks).set(set as typeof tanks.$inferInsert).where(eq(tanks.id, id)).returning({
      id: tanks.id,
      companyId: tanks.companyId,
      branchId: tanks.branchId,
      productId: tanks.productId,
      code: tanks.code,
      capacity: tanks.capacity,
      minLevel: tanks.minLevel,
      maxLevel: tanks.maxLevel,
      currentLevel: tanks.currentLevel,
      calibrationProfile: tanks.calibrationProfile,
      status: tanks.status,
      createdAt: tanks.createdAt,
    });
    if (!upd) throw new NotFoundException('Tank not found');
    await this.audit.log({ entity: 'tanks', entityId: id, action: 'update', before: before as object, after: upd as object, userId: auditContext.userId, ip: auditContext.ip, userAgent: auditContext.userAgent });
    return upd;
  }

  async remove(id: string, auditContext: { userId?: string; ip?: string; userAgent?: string }): Promise<void> {
    const before = await this.findByIdOrNull(id);
    if (!before) throw new NotFoundException('Tank not found');
    await this.db.update(tanks).set({ deletedAt: new Date(), updatedAt: new Date(), ...(auditContext.userId && { updatedBy: auditContext.userId }) }).where(eq(tanks.id, id));
    await this.audit.log({ entity: 'tanks', entityId: id, action: 'delete', before: before as object, userId: auditContext.userId, ip: auditContext.ip, userAgent: auditContext.userAgent });
  }

  private async findByIdOrNull(id: string): Promise<TankItem | null> {
    const [row] = await this.db
      .select({
        id: tanks.id,
        companyId: tanks.companyId,
        branchId: tanks.branchId,
        productId: tanks.productId,
        code: tanks.code,
        capacity: tanks.capacity,
        minLevel: tanks.minLevel,
        maxLevel: tanks.maxLevel,
        currentLevel: tanks.currentLevel,
        calibrationProfile: tanks.calibrationProfile,
        status: tanks.status,
        createdAt: tanks.createdAt,
      })
      .from(tanks)
      .where(and(eq(tanks.id, id), isNull(tanks.deletedAt)));
    return row ?? null;
  }
}
