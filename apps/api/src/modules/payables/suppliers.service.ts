import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { and, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../../database/database.module';
import type * as schema from '../../database/schema';
import { suppliers } from '../../database/schema/payables/suppliers';
import { getListParams } from '../../common/helpers/list.helper';
import { throwConflictIfUniqueViolation } from '../../common/utils/db-errors';
import { AuditService } from '../audit/audit.service';

type Schema = typeof schema;

export interface SupplierItem {
  id: string;
  companyId: string;
  code: string;
  name: string;
  category: string | null;
  avgVariance: string | null;
  rating: string | null;
  status: string;
  createdAt: Date;
}

export interface SuppliersListParams {
  page?: number;
  pageSize?: number;
  companyId?: string;
  status?: string;
  q?: string;
}

interface AuditContext {
  userId?: string;
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class SuppliersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<Schema>,
    private readonly audit: AuditService,
  ) {}

  async findPage(params: SuppliersListParams): Promise<{ data: SupplierItem[]; total: number }> {
    const { offset, limit } = getListParams(params);
    const conditions = [isNull(suppliers.deletedAt)];
    if (params.companyId) conditions.push(eq(suppliers.companyId, params.companyId));
    if (params.status) conditions.push(eq(suppliers.status, params.status));
    const searchWhere = params.q
      ? or(ilike(suppliers.code, `%${params.q}%`), ilike(suppliers.name, `%${params.q}%`))
      : undefined;
    if (params.q) conditions.push(searchWhere!);
    const w = conditions.length > 1 ? and(...conditions) : conditions[0];
    const [data, countResult] = await Promise.all([
      this.db
        .select({
          id: suppliers.id,
          companyId: suppliers.companyId,
          code: suppliers.code,
          name: suppliers.name,
          category: suppliers.category,
          avgVariance: suppliers.avgVariance,
          rating: suppliers.rating,
          status: suppliers.status,
          createdAt: suppliers.createdAt,
        })
        .from(suppliers)
        .where(w)
        .orderBy(desc(suppliers.createdAt))
        .limit(limit)
        .offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(suppliers).where(w),
    ]);
    return { data, total: countResult[0]?.count ?? 0 };
  }

  async findById(id: string): Promise<SupplierItem> {
    const [row] = await this.db
      .select({
        id: suppliers.id,
        companyId: suppliers.companyId,
        code: suppliers.code,
        name: suppliers.name,
        category: suppliers.category,
        avgVariance: suppliers.avgVariance,
        rating: suppliers.rating,
        status: suppliers.status,
        createdAt: suppliers.createdAt,
      })
      .from(suppliers)
      .where(and(eq(suppliers.id, id), isNull(suppliers.deletedAt)));
    if (!row) throw new NotFoundException('Supplier not found');
    return row;
  }

  async create(
    payload: {
      companyId: string;
      code: string;
      name: string;
      category?: string;
      rating?: string;
      status?: string;
    },
    ctx: AuditContext,
  ): Promise<SupplierItem> {
    const code = payload.code.trim();
    try {
      const [inserted] = await this.db
        .insert(suppliers)
        .values({
          companyId: payload.companyId,
          code,
          name: payload.name.trim(),
          category: payload.category?.trim() || null,
          rating: payload.rating?.trim() || null,
          status: payload.status ?? 'active',
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        })
        .returning({
          id: suppliers.id,
          companyId: suppliers.companyId,
          code: suppliers.code,
          name: suppliers.name,
          category: suppliers.category,
          avgVariance: suppliers.avgVariance,
          rating: suppliers.rating,
          status: suppliers.status,
          createdAt: suppliers.createdAt,
        });
      if (!inserted) throw new Error('Insert failed');
      await this.audit.log({
        entity: 'suppliers',
        entityId: inserted.id,
        action: 'create',
        after: inserted as object,
        userId: ctx.userId,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      return inserted;
    } catch (err) {
      throwConflictIfUniqueViolation(err, `Supplier with code "${code}" already exists in this company`);
      throw err;
    }
  }

  async update(
    id: string,
    payload: Partial<{ code: string; name: string; category: string; rating: string; status: string }>,
    ctx: AuditContext,
  ): Promise<SupplierItem> {
    const before = await this.findById(id);
    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
      ...(ctx.userId && { updatedBy: ctx.userId }),
    };
    if (payload.code !== undefined) updates.code = payload.code.trim();
    if (payload.name !== undefined) updates.name = payload.name.trim();
    if (payload.category !== undefined) updates.category = payload.category?.trim() || null;
    if (payload.rating !== undefined) updates.rating = payload.rating?.trim() || null;
    if (payload.status !== undefined) updates.status = payload.status;
    if (payload.code !== undefined && payload.code.trim() !== before.code) {
      const [existing] = await this.db
        .select({ id: suppliers.id })
        .from(suppliers)
        .where(
          and(
            eq(suppliers.companyId, before.companyId),
            eq(suppliers.code, payload.code.trim()),
            isNull(suppliers.deletedAt),
          ),
        );
      if (existing) throw new ConflictException(`Supplier with code "${payload.code}" already exists`);
    }
    try {
      const [updated] = await this.db
        .update(suppliers)
        .set(updates as Record<string, string | Date | null>)
        .where(eq(suppliers.id, id))
        .returning({
          id: suppliers.id,
          companyId: suppliers.companyId,
          code: suppliers.code,
          name: suppliers.name,
          category: suppliers.category,
          avgVariance: suppliers.avgVariance,
          rating: suppliers.rating,
          status: suppliers.status,
          createdAt: suppliers.createdAt,
        });
      if (!updated) throw new NotFoundException('Supplier not found');
      await this.audit.log({
        entity: 'suppliers',
        entityId: id,
        action: 'update',
        before: before as object,
        after: updated as object,
        userId: ctx.userId,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      return updated;
    } catch (err) {
      if (err instanceof NotFoundException || err instanceof ConflictException) throw err;
      throw err;
    }
  }

  async remove(id: string, ctx: AuditContext): Promise<void> {
    const before = await this.findById(id);
    await this.db
      .update(suppliers)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
        ...(ctx.userId && { updatedBy: ctx.userId }),
      })
      .where(eq(suppliers.id, id));
    await this.audit.log({
      entity: 'suppliers',
      entityId: id,
      action: 'delete',
      before: before as object,
      userId: ctx.userId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
  }
}
