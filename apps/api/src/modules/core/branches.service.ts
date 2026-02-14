import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { and, asc, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../../database/database.module';
import type * as schema from '../../database/schema';
import { branches } from '../../database/schema/core';
import { parseSort } from '../../common/dto/sort.dto';
import { getListParams } from '../../common/helpers/list.helper';
import { throwConflictIfUniqueViolation } from '../../common/utils/db-errors';
import { AuditService } from '../audit/audit.service';

type Schema = typeof schema;

const SORT_COLUMNS: Record<string, typeof branches.createdAt | typeof branches.code | typeof branches.name | typeof branches.status> = {
  created_at: branches.createdAt,
  createdAt: branches.createdAt,
  code: branches.code,
  name: branches.name,
  status: branches.status,
};

export interface BranchesListParams {
  page?: number;
  pageSize?: number;
  sort?: string;
  q?: string;
  stationId?: string;
}

export interface BranchItem {
  id: string;
  stationId: string;
  code: string;
  name: string;
  status: string;
  createdAt: Date;
}

@Injectable()
export class BranchesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<Schema>,
    private readonly audit: AuditService,
  ) {}

  async findPage(params: BranchesListParams): Promise<{ data: BranchItem[]; total: number }> {
    const { offset, limit, page, pageSize } = getListParams(params);
    const order = this.getOrder(params.sort);
    const baseWhere = isNull(branches.deletedAt);
    const conditions = [baseWhere];
    if (params.stationId) conditions.push(eq(branches.stationId, params.stationId));
    const searchWhere = params.q
      ? or(ilike(branches.code, `%${params.q}%`), ilike(branches.name, `%${params.q}%`))
      : undefined;
    if (searchWhere) conditions.push(searchWhere);
    const fullWhere = conditions.length > 1 ? and(...conditions) : baseWhere;

    const [data, countResult] = await Promise.all([
      this.db
        .select({
          id: branches.id,
          stationId: branches.stationId,
          code: branches.code,
          name: branches.name,
          status: branches.status,
          createdAt: branches.createdAt,
        })
        .from(branches)
        .where(fullWhere)
        .orderBy(order)
        .limit(limit)
        .offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(branches).where(fullWhere),
    ]);
    const total = countResult[0]?.count ?? 0;
    return { data, total };
  }

  async findById(id: string): Promise<BranchItem> {
    const [row] = await this.db
      .select({
        id: branches.id,
        stationId: branches.stationId,
        code: branches.code,
        name: branches.name,
        status: branches.status,
        createdAt: branches.createdAt,
      })
      .from(branches)
      .where(and(eq(branches.id, id), isNull(branches.deletedAt)));
    if (!row) throw new NotFoundException('Branch not found');
    return row;
  }

  async create(
    payload: { stationId: string; code: string; name: string; status?: string },
    auditContext: { userId?: string; ip?: string; userAgent?: string },
  ): Promise<BranchItem> {
    const code = payload.code.trim();
    await this.assertCodeUniqueInStation(payload.stationId, code);
    try {
      const [inserted] = await this.db
        .insert(branches)
        .values({
          stationId: payload.stationId,
          code,
          name: payload.name.trim(),
          status: payload.status ?? 'active',
        })
        .returning({
          id: branches.id,
          stationId: branches.stationId,
          code: branches.code,
          name: branches.name,
          status: branches.status,
          createdAt: branches.createdAt,
        });
      if (!inserted) throw new Error('Insert failed');
      await this.audit.log({
        entity: 'branches',
        entityId: inserted.id,
        action: 'create',
        after: inserted as object,
        userId: auditContext.userId,
        ip: auditContext.ip,
        userAgent: auditContext.userAgent,
      });
      return inserted;
    } catch (err) {
      throwConflictIfUniqueViolation(err, `Branch with code "${code}" already exists in this station`);
      throw err;
    }
  }

  async update(
    id: string,
    payload: { stationId?: string; code?: string; name?: string; status?: string },
    auditContext: { userId?: string; ip?: string; userAgent?: string },
  ): Promise<BranchItem> {
    const before = await this.findByIdOrNull(id);
    if (!before) throw new NotFoundException('Branch not found');
    const stationId = payload.stationId ?? before.stationId;
    if (payload.code !== undefined) {
      const code = payload.code.trim();
      if (code !== before.code) await this.assertCodeUniqueInStation(stationId, code);
    }
    try {
      const [updated] = await this.db
        .update(branches)
        .set({
          ...(payload.stationId !== undefined && { stationId: payload.stationId }),
          ...(payload.code !== undefined && { code: payload.code.trim() }),
          ...(payload.name !== undefined && { name: payload.name.trim() }),
          ...(payload.status !== undefined && { status: payload.status }),
          updatedAt: new Date(),
          ...(auditContext.userId && { updatedBy: auditContext.userId }),
        })
        .where(eq(branches.id, id))
        .returning({
          id: branches.id,
          stationId: branches.stationId,
          code: branches.code,
          name: branches.name,
          status: branches.status,
          createdAt: branches.createdAt,
        });
      if (!updated) throw new NotFoundException('Branch not found');
      await this.audit.log({
        entity: 'branches',
        entityId: id,
        action: 'update',
        before: before as object,
        after: updated as object,
        userId: auditContext.userId,
        ip: auditContext.ip,
        userAgent: auditContext.userAgent,
      });
      return updated;
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throwConflictIfUniqueViolation(err, `Branch with code "${payload.code}" already exists in this station`);
      throw err;
    }
  }

  async remove(id: string, auditContext: { userId?: string; ip?: string; userAgent?: string }): Promise<void> {
    const before = await this.findByIdOrNull(id);
    if (!before) throw new NotFoundException('Branch not found');
    await this.db
      .update(branches)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
        ...(auditContext.userId && { updatedBy: auditContext.userId }),
      })
      .where(eq(branches.id, id));
    await this.audit.log({
      entity: 'branches',
      entityId: id,
      action: 'delete',
      before: before as object,
      userId: auditContext.userId,
      ip: auditContext.ip,
      userAgent: auditContext.userAgent,
    });
  }

  private async findByIdOrNull(id: string): Promise<BranchItem | null> {
    const [row] = await this.db
      .select({
        id: branches.id,
        stationId: branches.stationId,
        code: branches.code,
        name: branches.name,
        status: branches.status,
        createdAt: branches.createdAt,
      })
      .from(branches)
      .where(and(eq(branches.id, id), isNull(branches.deletedAt)));
    return row ?? null;
  }

  private async assertCodeUniqueInStation(stationId: string, code: string): Promise<void> {
    const [existing] = await this.db
      .select({ id: branches.id })
      .from(branches)
      .where(and(eq(branches.stationId, stationId), eq(branches.code, code)));
    if (existing) throw new ConflictException(`Branch with code "${code}" already exists in this station`);
  }

  private getOrder(sort?: string) {
    const parsed = parseSort(sort);
    const col = parsed ? SORT_COLUMNS[parsed.field] ?? branches.createdAt : branches.createdAt;
    const direction = parsed?.direction ?? 'desc';
    return direction === 'desc' ? desc(col) : asc(col);
  }
}
