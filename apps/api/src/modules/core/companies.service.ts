import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { and, asc, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../../database/database.module';
import type * as schema from '../../database/schema';
import { companies } from '../../database/schema/core';
import { parseSort } from '../../common/dto/sort.dto';
import { getListParams } from '../../common/helpers/list.helper';
import { throwConflictIfUniqueViolation } from '../../common/utils/db-errors';
import { AuditService } from '../audit/audit.service';

type Schema = typeof schema;

const SORT_COLUMNS: Record<string, typeof companies.createdAt | typeof companies.code | typeof companies.name | typeof companies.status> = {
  created_at: companies.createdAt,
  createdAt: companies.createdAt,
  code: companies.code,
  name: companies.name,
  status: companies.status,
};

export interface CompaniesListParams {
  page?: number;
  pageSize?: number;
  sort?: string;
  q?: string;
}

export interface CompanyItem {
  id: string;
  code: string;
  name: string;
  status: string;
  createdAt: Date;
}

export type CompanyEntity = CompanyItem & { updatedAt: Date; deletedAt: Date | null };

@Injectable()
export class CompaniesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<Schema>,
    private readonly audit: AuditService,
  ) {}

  async findPage(params: CompaniesListParams): Promise<{ data: CompanyItem[]; total: number }> {
    const { page, pageSize, offset, limit } = getListParams(params);
    const order = this.getOrder(params.sort);

    const baseWhere = isNull(companies.deletedAt);
    const searchWhere = params.q
      ? or(
          ilike(companies.code, `%${params.q}%`),
          ilike(companies.name, `%${params.q}%`),
        )
      : undefined;
    const fullWhere = params.q ? and(baseWhere, searchWhere) : baseWhere;

    const [data, countResult] = await Promise.all([
      this.db
        .select({
          id: companies.id,
          code: companies.code,
          name: companies.name,
          status: companies.status,
          createdAt: companies.createdAt,
        })
        .from(companies)
        .where(fullWhere)
        .orderBy(order)
        .limit(limit)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(companies)
        .where(fullWhere),
    ]);

    const total = countResult[0]?.count ?? 0;
    return { data, total };
  }

  async findById(id: string): Promise<CompanyItem> {
    const [row] = await this.db
      .select({
        id: companies.id,
        code: companies.code,
        name: companies.name,
        status: companies.status,
        createdAt: companies.createdAt,
      })
      .from(companies)
      .where(and(eq(companies.id, id), isNull(companies.deletedAt)));
    if (!row) throw new NotFoundException('Company not found');
    return row;
  }

  async create(
    payload: { code: string; name: string; status?: string },
    auditContext: { userId?: string; ip?: string; userAgent?: string },
  ): Promise<CompanyItem> {
    const code = payload.code.trim();
    await this.assertCodeUnique(code);
    try {
      const [inserted] = await this.db
        .insert(companies)
        .values({
          code,
          name: payload.name.trim(),
          status: payload.status ?? 'active',
        })
        .returning({
          id: companies.id,
          code: companies.code,
          name: companies.name,
          status: companies.status,
          createdAt: companies.createdAt,
        });
      if (!inserted) throw new Error('Insert failed');
      await this.audit.log({
        entity: 'companies',
        entityId: inserted.id,
        action: 'create',
        after: inserted as object,
        userId: auditContext.userId,
        ip: auditContext.ip,
        userAgent: auditContext.userAgent,
      });
      return inserted;
    } catch (err) {
      throwConflictIfUniqueViolation(err, `Company with code "${code}" already exists`);
      throw err;
    }
  }

  async update(
    id: string,
    payload: { code?: string; name?: string; status?: string },
    auditContext: { userId?: string; ip?: string; userAgent?: string },
  ): Promise<CompanyItem> {
    const before = await this.findByIdOrNull(id);
    if (!before) throw new NotFoundException('Company not found');
    if (payload.code !== undefined) {
      const code = payload.code.trim();
      if (code !== before.code) await this.assertCodeUnique(code);
    }
    try {
      const [updated] = await this.db
        .update(companies)
        .set({
          ...(payload.code !== undefined && { code: payload.code.trim() }),
          ...(payload.name !== undefined && { name: payload.name.trim() }),
          ...(payload.status !== undefined && { status: payload.status }),
          updatedAt: new Date(),
          ...(auditContext.userId && { updatedBy: auditContext.userId }),
        })
        .where(eq(companies.id, id))
        .returning({
          id: companies.id,
          code: companies.code,
          name: companies.name,
          status: companies.status,
          createdAt: companies.createdAt,
        });
      if (!updated) throw new NotFoundException('Company not found');
      await this.audit.log({
        entity: 'companies',
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
      throwConflictIfUniqueViolation(err, `Company with code "${payload.code}" already exists`);
      throw err;
    }
  }

  async remove(
    id: string,
    auditContext: { userId?: string; ip?: string; userAgent?: string },
  ): Promise<void> {
    const before = await this.findByIdOrNull(id);
    if (!before) throw new NotFoundException('Company not found');
    await this.db
      .update(companies)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
        ...(auditContext.userId && { updatedBy: auditContext.userId }),
      })
      .where(eq(companies.id, id));
    await this.audit.log({
      entity: 'companies',
      entityId: id,
      action: 'delete',
      before: before as object,
      userId: auditContext.userId,
      ip: auditContext.ip,
      userAgent: auditContext.userAgent,
    });
  }

  private async findByIdOrNull(id: string): Promise<CompanyItem | null> {
    const [row] = await this.db
      .select({
        id: companies.id,
        code: companies.code,
        name: companies.name,
        status: companies.status,
        createdAt: companies.createdAt,
      })
      .from(companies)
      .where(and(eq(companies.id, id), isNull(companies.deletedAt)));
    return row ?? null;
  }

  private async assertCodeUnique(code: string): Promise<void> {
    const [existing] = await this.db
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.code, code));
    if (existing) throw new ConflictException(`Company with code "${code}" already exists`);
  }

  private getOrder(sort?: string) {
    const parsed = parseSort(sort);
    const col = parsed ? SORT_COLUMNS[parsed.field] ?? companies.createdAt : companies.createdAt;
    const direction = parsed?.direction ?? 'desc';
    return direction === 'desc' ? desc(col) : asc(col);
  }
}
