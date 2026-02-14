import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { and, asc, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../../database/database.module';
import type * as schema from '../../database/schema';
import { nozzles } from '../../database/schema/setup';
import { parseSort } from '../../common/dto/sort.dto';
import { getListParams } from '../../common/helpers/list.helper';
import { throwConflictIfUniqueViolation } from '../../common/utils/db-errors';
import { AuditService } from '../audit/audit.service';

type Schema = typeof schema;

const SORT_COL: Record<string, typeof nozzles.createdAt | typeof nozzles.code | typeof nozzles.status> = {
  created_at: nozzles.createdAt, createdAt: nozzles.createdAt, code: nozzles.code, status: nozzles.status,
};

export interface NozzlesListParams {
  page?: number; pageSize?: number; sort?: string; q?: string; stationId?: string;
}

export interface NozzleItem {
  id: string; stationId: string; pumpId: string; tankId: string; productId: string; code: string; status: string; createdAt: Date;
}

@Injectable()
export class NozzlesService {
  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase<Schema>, private readonly audit: AuditService) {}

  async findPage(params: NozzlesListParams): Promise<{ data: NozzleItem[]; total: number }> {
    const { offset, limit, page, pageSize } = getListParams(params);
    const conditions = [isNull(nozzles.deletedAt)];
    if (params.stationId) conditions.push(eq(nozzles.stationId, params.stationId));
    if (params.q) conditions.push(ilike(nozzles.code, `%${params.q}%`));
    const w = conditions.length > 1 ? and(...conditions) : conditions[0];
    const parsed = parseSort(params.sort);
    const col = parsed ? (SORT_COL as Record<string, typeof nozzles.createdAt>)[parsed.field] ?? nozzles.createdAt : nozzles.createdAt;
    const [data, cr] = await Promise.all([
      this.db.select({ id: nozzles.id, stationId: nozzles.stationId, pumpId: nozzles.pumpId, tankId: nozzles.tankId, productId: nozzles.productId, code: nozzles.code, status: nozzles.status, createdAt: nozzles.createdAt }).from(nozzles).where(w).orderBy(parsed?.direction === 'asc' ? asc(col) : desc(col)).limit(limit).offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(nozzles).where(w),
    ]);
    return { data, total: cr[0]?.count ?? 0 };
  }

  async findById(id: string): Promise<NozzleItem> {
    const [row] = await this.db.select({ id: nozzles.id, stationId: nozzles.stationId, pumpId: nozzles.pumpId, tankId: nozzles.tankId, productId: nozzles.productId, code: nozzles.code, status: nozzles.status, createdAt: nozzles.createdAt }).from(nozzles).where(and(eq(nozzles.id, id), isNull(nozzles.deletedAt)));
    if (!row) throw new NotFoundException('Nozzle not found');
    return row;
  }

  async create(payload: { stationId: string; pumpId: string; tankId: string; productId: string; code: string; status?: string }, auditContext: { userId?: string; ip?: string; userAgent?: string }): Promise<NozzleItem> {
    const code = payload.code.trim();
    const [ex] = await this.db.select({ id: nozzles.id }).from(nozzles).where(and(eq(nozzles.stationId, payload.stationId), eq(nozzles.code, code)));
    if (ex) throw new ConflictException(`Nozzle with code "${code}" already exists in this station`);
    try {
      const [ins] = await this.db.insert(nozzles).values({ stationId: payload.stationId, pumpId: payload.pumpId, tankId: payload.tankId, productId: payload.productId, code, status: payload.status ?? 'active' }).returning({ id: nozzles.id, stationId: nozzles.stationId, pumpId: nozzles.pumpId, tankId: nozzles.tankId, productId: nozzles.productId, code: nozzles.code, status: nozzles.status, createdAt: nozzles.createdAt });
      if (!ins) throw new Error('Insert failed');
      await this.audit.log({ entity: 'nozzles', entityId: ins.id, action: 'create', after: ins as object, userId: auditContext.userId, ip: auditContext.ip, userAgent: auditContext.userAgent });
      return ins;
    } catch (err) {
      throwConflictIfUniqueViolation(err, `Nozzle with code "${code}" already exists in this station`);
      throw err;
    }
  }

  async update(id: string, payload: Partial<{ stationId: string; pumpId: string; tankId: string; productId: string; code: string; status: string }>, auditContext: { userId?: string; ip?: string; userAgent?: string }): Promise<NozzleItem> {
    const before = await this.findByIdOrNull(id);
    if (!before) throw new NotFoundException('Nozzle not found');
    const stationId = payload.stationId ?? before.stationId;
    if (payload.code !== undefined) {
      const code = payload.code.trim();
      if (code !== before.code) {
        const [ex] = await this.db.select({ id: nozzles.id }).from(nozzles).where(and(eq(nozzles.stationId, stationId), eq(nozzles.code, code)));
        if (ex) throw new ConflictException(`Nozzle with code "${code}" already exists in this station`);
      }
    }
    const set: Record<string, unknown> = { updatedAt: new Date(), ...(auditContext.userId && { updatedBy: auditContext.userId }) };
    if (payload.stationId !== undefined) set.stationId = payload.stationId;
    if (payload.pumpId !== undefined) set.pumpId = payload.pumpId;
    if (payload.tankId !== undefined) set.tankId = payload.tankId;
    if (payload.productId !== undefined) set.productId = payload.productId;
    if (payload.code !== undefined) set.code = payload.code.trim();
    if (payload.status !== undefined) set.status = payload.status;
    const [upd] = await this.db.update(nozzles).set(set as typeof nozzles.$inferInsert).where(eq(nozzles.id, id)).returning({ id: nozzles.id, stationId: nozzles.stationId, pumpId: nozzles.pumpId, tankId: nozzles.tankId, productId: nozzles.productId, code: nozzles.code, status: nozzles.status, createdAt: nozzles.createdAt });
    if (!upd) throw new NotFoundException('Nozzle not found');
    await this.audit.log({ entity: 'nozzles', entityId: id, action: 'update', before: before as object, after: upd as object, userId: auditContext.userId, ip: auditContext.ip, userAgent: auditContext.userAgent });
    return upd;
  }

  async remove(id: string, auditContext: { userId?: string; ip?: string; userAgent?: string }): Promise<void> {
    const before = await this.findByIdOrNull(id);
    if (!before) throw new NotFoundException('Nozzle not found');
    await this.db.update(nozzles).set({ deletedAt: new Date(), updatedAt: new Date(), ...(auditContext.userId && { updatedBy: auditContext.userId }) }).where(eq(nozzles.id, id));
    await this.audit.log({ entity: 'nozzles', entityId: id, action: 'delete', before: before as object, userId: auditContext.userId, ip: auditContext.ip, userAgent: auditContext.userAgent });
  }

  private async findByIdOrNull(id: string): Promise<NozzleItem | null> {
    const [row] = await this.db.select({ id: nozzles.id, stationId: nozzles.stationId, pumpId: nozzles.pumpId, tankId: nozzles.tankId, productId: nozzles.productId, code: nozzles.code, status: nozzles.status, createdAt: nozzles.createdAt }).from(nozzles).where(and(eq(nozzles.id, id), isNull(nozzles.deletedAt)));
    return row ?? null;
  }
}
