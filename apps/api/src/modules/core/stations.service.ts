import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { and, asc, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../../database/database.module';
import type * as schema from '../../database/schema';
import { stations } from '../../database/schema/core';
import { parseSort } from '../../common/dto/sort.dto';
import { getListParams } from '../../common/helpers/list.helper';
import { throwConflictIfUniqueViolation } from '../../common/utils/db-errors';
import { AuditService } from '../audit/audit.service';

type Schema = typeof schema;

const SORT_COLUMNS: Record<string, typeof stations.createdAt | typeof stations.code | typeof stations.name | typeof stations.status> = {
  created_at: stations.createdAt,
  createdAt: stations.createdAt,
  code: stations.code,
  name: stations.name,
  status: stations.status,
};

export interface StationsListParams {
  page?: number;
  pageSize?: number;
  sort?: string;
  q?: string;
  companyId?: string;
}

export interface StationItem {
  id: string;
  companyId: string;
  code: string;
  name: string;
  location: string | null;
  manager: string | null;
  status: string;
  createdAt: Date;
}

@Injectable()
export class StationsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<Schema>,
    private readonly audit: AuditService,
  ) {}

  async findPage(params: StationsListParams): Promise<{ data: StationItem[]; total: number }> {
    const { offset, limit, page, pageSize } = getListParams(params);
    const order = this.getOrder(params.sort);
    const baseWhere = isNull(stations.deletedAt);
    const conditions = [baseWhere];
    if (params.companyId) conditions.push(eq(stations.companyId, params.companyId));
    if (params.q) conditions.push(or(ilike(stations.code, `%${params.q}%`), ilike(stations.name, `%${params.q}%`))!);
    const fullWhere = conditions.length > 1 ? and(...conditions) : baseWhere;

    const [data, countResult] = await Promise.all([
      this.db
        .select({
          id: stations.id,
          companyId: stations.companyId,
          code: stations.code,
          name: stations.name,
          location: stations.location,
          manager: stations.manager,
          status: stations.status,
          createdAt: stations.createdAt,
        })
        .from(stations)
        .where(fullWhere)
        .orderBy(order)
        .limit(limit)
        .offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(stations).where(fullWhere),
    ]);
    const total = countResult[0]?.count ?? 0;
    return { data, total };
  }

  async findById(id: string): Promise<StationItem> {
    const [row] = await this.db
      .select({
        id: stations.id,
        companyId: stations.companyId,
        code: stations.code,
        name: stations.name,
        location: stations.location,
        manager: stations.manager,
        status: stations.status,
        createdAt: stations.createdAt,
      })
      .from(stations)
      .where(and(eq(stations.id, id), isNull(stations.deletedAt)));
    if (!row) throw new NotFoundException('Station not found');
    return row;
  }

  async create(
    payload: { companyId: string; code: string; name: string; location?: string; manager?: string; status?: string },
    auditContext: { userId?: string; ip?: string; userAgent?: string },
  ): Promise<StationItem> {
    const code = payload.code.trim();
    await this.assertCodeUniqueInCompany(payload.companyId, code);
    try {
      const [inserted] = await this.db
        .insert(stations)
        .values({
          companyId: payload.companyId,
          code,
          name: payload.name.trim(),
          location: payload.location?.trim() ?? null,
          manager: payload.manager?.trim() ?? null,
          status: payload.status ?? 'active',
        })
        .returning({
          id: stations.id,
          companyId: stations.companyId,
          code: stations.code,
          name: stations.name,
          location: stations.location,
          manager: stations.manager,
          status: stations.status,
          createdAt: stations.createdAt,
        });
      if (!inserted) throw new Error('Insert failed');
      await this.audit.log({
        entity: 'stations',
        entityId: inserted.id,
        action: 'create',
        after: inserted as object,
        userId: auditContext.userId,
        ip: auditContext.ip,
        userAgent: auditContext.userAgent,
      });
      return inserted;
    } catch (err) {
      throwConflictIfUniqueViolation(err, `Station with code "${code}" already exists in this company`);
      throw err;
    }
  }

  async update(
    id: string,
    payload: { companyId?: string; code?: string; name?: string; location?: string; manager?: string; status?: string },
    auditContext: { userId?: string; ip?: string; userAgent?: string },
  ): Promise<StationItem> {
    const before = await this.findByIdOrNull(id);
    if (!before) throw new NotFoundException('Station not found');
    const companyId = payload.companyId ?? before.companyId;
    if (payload.code !== undefined) {
      const code = payload.code.trim();
      if (code !== before.code) await this.assertCodeUniqueInCompany(companyId, code);
    }
    try {
      const [updated] = await this.db
        .update(stations)
        .set({
          ...(payload.companyId !== undefined && { companyId: payload.companyId }),
          ...(payload.code !== undefined && { code: payload.code.trim() }),
          ...(payload.name !== undefined && { name: payload.name.trim() }),
          ...(payload.location !== undefined && { location: payload.location?.trim() ?? null }),
          ...(payload.manager !== undefined && { manager: payload.manager?.trim() ?? null }),
          ...(payload.status !== undefined && { status: payload.status }),
          updatedAt: new Date(),
          ...(auditContext.userId && { updatedBy: auditContext.userId }),
        })
        .where(eq(stations.id, id))
        .returning({
          id: stations.id,
          companyId: stations.companyId,
          code: stations.code,
          name: stations.name,
          location: stations.location,
          manager: stations.manager,
          status: stations.status,
          createdAt: stations.createdAt,
        });
      if (!updated) throw new NotFoundException('Station not found');
      await this.audit.log({
        entity: 'stations',
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
      throwConflictIfUniqueViolation(err, `Station with code "${payload.code}" already exists in this company`);
      throw err;
    }
  }

  async remove(id: string, auditContext: { userId?: string; ip?: string; userAgent?: string }): Promise<void> {
    const before = await this.findByIdOrNull(id);
    if (!before) throw new NotFoundException('Station not found');
    await this.db
      .update(stations)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
        ...(auditContext.userId && { updatedBy: auditContext.userId }),
      })
      .where(eq(stations.id, id));
    await this.audit.log({
      entity: 'stations',
      entityId: id,
      action: 'delete',
      before: before as object,
      userId: auditContext.userId,
      ip: auditContext.ip,
      userAgent: auditContext.userAgent,
    });
  }

  private async findByIdOrNull(id: string): Promise<StationItem | null> {
    const [row] = await this.db
      .select({
        id: stations.id,
        companyId: stations.companyId,
        code: stations.code,
        name: stations.name,
        location: stations.location,
        manager: stations.manager,
        status: stations.status,
        createdAt: stations.createdAt,
      })
      .from(stations)
      .where(and(eq(stations.id, id), isNull(stations.deletedAt)));
    return row ?? null;
  }

  private async assertCodeUniqueInCompany(companyId: string, code: string): Promise<void> {
    const [existing] = await this.db
      .select({ id: stations.id })
      .from(stations)
      .where(and(eq(stations.companyId, companyId), eq(stations.code, code)));
    if (existing) throw new ConflictException(`Station with code "${code}" already exists in this company`);
  }

  private getOrder(sort?: string) {
    const parsed = parseSort(sort);
    const col = parsed ? SORT_COLUMNS[parsed.field] ?? stations.createdAt : stations.createdAt;
    const direction = parsed?.direction ?? 'desc';
    return direction === 'desc' ? desc(col) : asc(col);
  }
}
