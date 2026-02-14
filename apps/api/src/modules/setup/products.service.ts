import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { and, asc, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../../database/database.module';
import type * as schema from '../../database/schema';
import { products } from '../../database/schema/setup';
import { parseSort } from '../../common/dto/sort.dto';
import { getListParams } from '../../common/helpers/list.helper';
import { throwConflictIfUniqueViolation } from '../../common/utils/db-errors';
import { AuditService } from '../audit/audit.service';

type Schema = typeof schema;

const SORT_COLUMNS: Record<string, typeof products.createdAt | typeof products.code | typeof products.name | typeof products.status> = {
  created_at: products.createdAt,
  createdAt: products.createdAt,
  code: products.code,
  name: products.name,
  status: products.status,
};

export interface ProductsListParams {
  page?: number;
  pageSize?: number;
  sort?: string;
  q?: string;
  companyId?: string;
}

export interface ProductItem {
  id: string;
  companyId: string;
  code: string;
  name: string;
  category: string;
  pricePerUnit: string;
  unit: string;
  status: string;
  createdAt: Date;
}

@Injectable()
export class ProductsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<Schema>,
    private readonly audit: AuditService,
  ) {}

  async findPage(params: ProductsListParams): Promise<{ data: ProductItem[]; total: number }> {
    const { offset, limit, page, pageSize } = getListParams(params);
    const order = this.getOrder(params.sort);
    const conditions = [isNull(products.deletedAt)];
    if (params.companyId) conditions.push(eq(products.companyId, params.companyId));
    if (params.q) conditions.push(or(ilike(products.code, `%${params.q}%`), ilike(products.name, `%${params.q}%`))!);
    const fullWhere = conditions.length > 1 ? and(...conditions) : conditions[0];

    const [data, countResult] = await Promise.all([
      this.db
        .select({
          id: products.id,
          companyId: products.companyId,
          code: products.code,
          name: products.name,
          category: products.category,
          pricePerUnit: products.pricePerUnit,
          unit: products.unit,
          status: products.status,
          createdAt: products.createdAt,
        })
        .from(products)
        .where(fullWhere)
        .orderBy(order)
        .limit(limit)
        .offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(products).where(fullWhere),
    ]);
    return { data, total: countResult[0]?.count ?? 0 };
  }

  async findById(id: string): Promise<ProductItem> {
    const [row] = await this.db
      .select({
        id: products.id,
        companyId: products.companyId,
        code: products.code,
        name: products.name,
        category: products.category,
        pricePerUnit: products.pricePerUnit,
        unit: products.unit,
        status: products.status,
        createdAt: products.createdAt,
      })
      .from(products)
      .where(and(eq(products.id, id), isNull(products.deletedAt)));
    if (!row) throw new NotFoundException('Product not found');
    return row;
  }

  async create(
    payload: {
      companyId: string;
      code: string;
      name: string;
      category: string;
      pricePerUnit: number | string;
      unit?: string;
      status?: string;
    },
    auditContext: { userId?: string; ip?: string; userAgent?: string },
  ): Promise<ProductItem> {
    const code = payload.code.trim();
    await this.assertCodeUniqueInCompany(payload.companyId, code);
    const price = typeof payload.pricePerUnit === 'number' ? String(payload.pricePerUnit) : payload.pricePerUnit;
    try {
      const [inserted] = await this.db
        .insert(products)
        .values({
          companyId: payload.companyId,
          code,
          name: payload.name.trim(),
          category: payload.category.trim(),
          pricePerUnit: price,
          unit: payload.unit ?? 'L',
          status: payload.status ?? 'active',
        })
        .returning({
          id: products.id,
          companyId: products.companyId,
          code: products.code,
          name: products.name,
          category: products.category,
          pricePerUnit: products.pricePerUnit,
          unit: products.unit,
          status: products.status,
          createdAt: products.createdAt,
        });
      if (!inserted) throw new Error('Insert failed');
      await this.audit.log({
        entity: 'products',
        entityId: inserted.id,
        action: 'create',
        after: inserted as object,
        userId: auditContext.userId,
        ip: auditContext.ip,
        userAgent: auditContext.userAgent,
      });
      return inserted;
    } catch (err) {
      throwConflictIfUniqueViolation(err, `Product with code "${code}" already exists in this company`);
      throw err;
    }
  }

  async update(
    id: string,
    payload: Partial<{
      companyId: string;
      code: string;
      name: string;
      category: string;
      pricePerUnit: number | string;
      unit: string;
      status: string;
    }>,
    auditContext: { userId?: string; ip?: string; userAgent?: string },
  ): Promise<ProductItem> {
    const before = await this.findByIdOrNull(id);
    if (!before) throw new NotFoundException('Product not found');
    const companyId = payload.companyId ?? before.companyId;
    if (payload.code !== undefined) {
      const code = payload.code.trim();
      if (code !== before.code) await this.assertCodeUniqueInCompany(companyId, code);
    }
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (auditContext.userId) set.updatedBy = auditContext.userId;
    if (payload.companyId !== undefined) set.companyId = payload.companyId;
    if (payload.code !== undefined) set.code = payload.code.trim();
    if (payload.name !== undefined) set.name = payload.name.trim();
    if (payload.category !== undefined) set.category = payload.category.trim();
    if (payload.pricePerUnit !== undefined) set.pricePerUnit = String(payload.pricePerUnit);
    if (payload.unit !== undefined) set.unit = payload.unit;
    if (payload.status !== undefined) set.status = payload.status;
    try {
      const [updated] = await this.db
        .update(products)
        .set(set as typeof products.$inferInsert)
        .where(eq(products.id, id))
        .returning({
          id: products.id,
          companyId: products.companyId,
          code: products.code,
          name: products.name,
          category: products.category,
          pricePerUnit: products.pricePerUnit,
          unit: products.unit,
          status: products.status,
          createdAt: products.createdAt,
        });
      if (!updated) throw new NotFoundException('Product not found');
      await this.audit.log({
        entity: 'products',
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
      throwConflictIfUniqueViolation(err, `Product with code "${payload.code}" already exists in this company`);
      throw err;
    }
  }

  async remove(id: string, auditContext: { userId?: string; ip?: string; userAgent?: string }): Promise<void> {
    const before = await this.findByIdOrNull(id);
    if (!before) throw new NotFoundException('Product not found');
    await this.db
      .update(products)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
        ...(auditContext.userId && { updatedBy: auditContext.userId }),
      })
      .where(eq(products.id, id));
    await this.audit.log({
      entity: 'products',
      entityId: id,
      action: 'delete',
      before: before as object,
      userId: auditContext.userId,
      ip: auditContext.ip,
      userAgent: auditContext.userAgent,
    });
  }

  private async findByIdOrNull(id: string): Promise<ProductItem | null> {
    const [row] = await this.db
      .select({
        id: products.id,
        companyId: products.companyId,
        code: products.code,
        name: products.name,
        category: products.category,
        pricePerUnit: products.pricePerUnit,
        unit: products.unit,
        status: products.status,
        createdAt: products.createdAt,
      })
      .from(products)
      .where(and(eq(products.id, id), isNull(products.deletedAt)));
    return row ?? null;
  }

  private async assertCodeUniqueInCompany(companyId: string, code: string): Promise<void> {
    const [existing] = await this.db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.companyId, companyId), eq(products.code, code)));
    if (existing) throw new ConflictException(`Product with code "${code}" already exists in this company`);
  }

  private getOrder(sort?: string) {
    const parsed = parseSort(sort);
    const col = parsed ? SORT_COLUMNS[parsed.field] ?? products.createdAt : products.createdAt;
    const direction = parsed?.direction ?? 'desc';
    return direction === 'desc' ? desc(col) : asc(col);
  }
}
