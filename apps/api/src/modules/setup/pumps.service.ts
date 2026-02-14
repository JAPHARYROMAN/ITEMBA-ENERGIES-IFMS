import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { and, asc, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../../database/database.module';
import type * as schema from '../../database/schema';
import { pumps } from '../../database/schema/setup';
import { parseSort } from '../../common/dto/sort.dto';
import { getListParams } from '../../common/helpers/list.helper';
import { throwConflictIfUniqueViolation } from '../../common/utils/db-errors';
import { AuditService } from '../audit/audit.service';

type Schema = typeof schema;

const SORT_COL: Record<string, typeof pumps.createdAt | typeof pumps.code | typeof pumps.name | typeof pumps.status> = {
  created_at: pumps.createdAt,
  createdAt: pumps.createdAt,
  code: pumps.code,
  name: pumps.name,
  status: pumps.status,
};

export interface PumpsListParams {
  page?: number; pageSize?: number; sort?: string; q?: string; stationId?: string;
}

export interface PumpItem {
  id: string; stationId: string; code: string; name: string | null; status: string; createdAt: Date;
}

@Injectable()
export class PumpsService {
  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase<Schema>, private readonly audit: AuditService) {}

  async findPage(params: PumpsListParams): Promise<{ data: PumpItem[]; total: number }> {
    const { offset, limit, page, pageSize } = getListParams(params);
    const conditions = [isNull(pumps.deletedAt)];
    if (params.stationId) conditions.push(eq(pumps.stationId, params.stationId));
    if (params.q) conditions.push(or(ilike(pumps.code, `%${params.q}%`), ilike(pumps.name, `%${params.q}%`))!);
    const w = conditions.length > 1 ? and(...conditions) : conditions[0];
    const parsed = parseSort(params.sort);
    const col = parsed ? SORT_COL[parsed.field] ?? pumps.createdAt : pumps.createdAt;
    const [data, cr] = await Promise.all([
      this.db.select({ id: pumps.id, stationId: pumps.stationId, code: pumps.code, name: pumps.name, status: pumps.status, createdAt: pumps.createdAt }).from(pumps).where(w).orderBy(parsed?.direction === 'asc' ? asc(col) : desc(col)).limit(limit).offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(pumps).where(w),
    ]);
    return { data, total: cr[0]?.count ?? 0 };
  }

  async findById(id: string): Promise<PumpItem> {
    const [row] = await this.db.select({ id: pumps.id, stationId: pumps.stationId, code: pumps.code, name: pumps.name, status: pumps.status, createdAt: pumps.createdAt }).from(pumps).where(and(eq(pumps.id, id), isNull(pumps.deletedAt)));
    if (!row) throw new NotFoundException('Pump not found');
    return row;
  }

  async create(payload: { stationId: string; code: string; name?: string; status?: string }, auditContext: { userId?: string; ip?: string; userAgent?: string }): Promise<PumpItem> {
    const code = payload.code.trim();
    const [ex] = await this.db.select({ id: pumps.id }).from(pumps).where(and(eq(pumps.stationId, payload.stationId), eq(pumps.code, code)));
    if (ex) throw new ConflictException(`Pump with code "${code}" already exists in this station`);
    try {
      const [ins] = await this.db.insert(pumps).values({ stationId: payload.stationId, code, name: payload.name?.trim() ?? null, status: payload.status ?? 'active' }).returning({ id: pumps.id, stationId: pumps.stationId, code: pumps.code, name: pumps.name, status: pumps.status, createdAt: pumps.createdAt });
      if (!ins) throw new Error('Insert failed');
      await this.audit.log({ entity: 'pumps', entityId: ins.id, action: 'create', after: ins as object, userId: auditContext.userId, ip: auditContext.ip, userAgent: auditContext.userAgent });
      return ins;
    } catch (err) {
      throwConflictIfUniqueViolation(err, `Pump with code "${code}" already exists in this station`);
      throw err;
    }
  }

  async update(id: string, payload: Partial<{ stationId: string; code: string; name: string; status: string }>, auditContext: { userId?: string; ip?: string; userAgent?: string }): Promise<PumpItem> {
    const before = await this.findByIdOrNull(id);
    if (!before) throw new NotFoundException('Pump not found');
    const stationId = payload.stationId ?? before.stationId;
    if (payload.code !== undefined) {
      const code = payload.code.trim();
      if (code !== before.code) {
        const [ex] = await this.db.select({ id: pumps.id }).from(pumps).where(and(eq(pumps.stationId, stationId), eq(pumps.code, code)));
        if (ex) throw new ConflictException(`Pump with code "${code}" already exists in this station`);
      }
    }
    const set: Record<string, unknown> = { updatedAt: new Date(), ...(auditContext.userId && { updatedBy: auditContext.userId }) };
    if (payload.stationId !== undefined) set.stationId = payload.stationId;
    if (payload.code !== undefined) set.code = payload.code.trim();
    if (payload.name !== undefined) set.name = payload.name.trim() ?? null;
    if (payload.status !== undefined) set.status = payload.status;
    const [upd] = await this.db.update(pumps).set(set as typeof pumps.$inferInsert).where(eq(pumps.id, id)).returning({ id: pumps.id, stationId: pumps.stationId, code: pumps.code, name: pumps.name, status: pumps.status, createdAt: pumps.createdAt });
    if (!upd) throw new NotFoundException('Pump not found');
    await this.audit.log({ entity: 'pumps', entityId: id, action: 'update', before: before as object, after: upd as object, userId: auditContext.userId, ip: auditContext.ip, userAgent: auditContext.userAgent });
    return upd;
  }

  async remove(id: string, auditContext: { userId?: string; ip?: string; userAgent?: string }): Promise<void> {
    const before = await this.findByIdOrNull(id);
    if (!before) throw new NotFoundException('Pump not found');
    await this.db.update(pumps).set({ deletedAt: new Date(), updatedAt: new Date(), ...(auditContext.userId && { updatedBy: auditContext.userId }) }).where(eq(pumps.id, id));
    await this.audit.log({ entity: 'pumps', entityId: id, action: 'delete', before: before as object, userId: auditContext.userId, ip: auditContext.ip, userAgent: auditContext.userAgent });
  }

  private async findByIdOrNull(id: string): Promise<PumpItem | null> {
    const [row] = await this.db.select({ id: pumps.id, stationId: pumps.stationId, code: pumps.code, name: pumps.name, status: pumps.status, createdAt: pumps.createdAt }).from(pumps).where(and(eq(pumps.id, id), isNull(pumps.deletedAt)));
    return row ?? null;
  }
}
