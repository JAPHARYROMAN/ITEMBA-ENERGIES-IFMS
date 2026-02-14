import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { and, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../../database/database.module';
import type * as schema from '../../database/schema';
import { customers } from '../../database/schema/credit/customers';
import { branches } from '../../database/schema/core/branches';
import { stations } from '../../database/schema/core/stations';
import { getListParams } from '../../common/helpers/list.helper';
import { throwConflictIfUniqueViolation } from '../../common/utils/db-errors';
import { AuditService } from '../audit/audit.service';

type Schema = typeof schema;

export interface CustomerItem {
  id: string;
  companyId: string;
  branchId: string;
  code: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  taxId: string | null;
  creditLimit: string;
  paymentTerms: string;
  balance: string;
  status: string;
  createdAt: Date;
}

export interface CustomersListParams {
  page?: number;
  pageSize?: number;
  branchId?: string;
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
export class CustomersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<Schema>,
    private readonly audit: AuditService,
  ) {}

  async findPage(params: CustomersListParams): Promise<{ data: CustomerItem[]; total: number }> {
    const { offset, limit } = getListParams(params);
    const conditions = [isNull(customers.deletedAt)];
    if (params.branchId) conditions.push(eq(customers.branchId, params.branchId));
    if (params.companyId) conditions.push(eq(customers.companyId, params.companyId));
    if (params.status) conditions.push(eq(customers.status, params.status));
    const searchWhere = params.q
      ? or(
          ilike(customers.code, `%${params.q}%`),
          ilike(customers.name, `%${params.q}%`),
        )
      : undefined;
    if (params.q) conditions.push(searchWhere!);
    const w = conditions.length > 1 ? and(...conditions) : conditions[0];
    const [data, countResult] = await Promise.all([
      this.db
        .select({
          id: customers.id,
          companyId: customers.companyId,
          branchId: customers.branchId,
          code: customers.code,
          name: customers.name,
          email: customers.email,
          phone: customers.phone,
          address: customers.address,
          taxId: customers.taxId,
          creditLimit: customers.creditLimit,
          paymentTerms: customers.paymentTerms,
          balance: customers.balance,
          status: customers.status,
          createdAt: customers.createdAt,
        })
        .from(customers)
        .where(w)
        .orderBy(desc(customers.createdAt))
        .limit(limit)
        .offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(customers).where(w),
    ]);
    return { data, total: countResult[0]?.count ?? 0 };
  }

  async findById(id: string): Promise<CustomerItem> {
    const [row] = await this.db
      .select({
        id: customers.id,
        companyId: customers.companyId,
        branchId: customers.branchId,
        code: customers.code,
        name: customers.name,
        email: customers.email,
        phone: customers.phone,
        address: customers.address,
        taxId: customers.taxId,
        creditLimit: customers.creditLimit,
        paymentTerms: customers.paymentTerms,
        balance: customers.balance,
        status: customers.status,
        createdAt: customers.createdAt,
      })
      .from(customers)
      .where(and(eq(customers.id, id), isNull(customers.deletedAt)));
    if (!row) throw new NotFoundException('Customer not found');
    return row;
  }

  async create(
    payload: {
      branchId: string;
      code: string;
      name: string;
      email?: string;
      phone?: string;
      address?: string;
      taxId?: string;
      creditLimit: number;
      paymentTerms: string;
      status?: string;
    },
    ctx: AuditContext,
  ): Promise<CustomerItem> {
    const [branch] = await this.db
      .select({ id: branches.id, stationId: branches.stationId })
      .from(branches)
      .where(and(eq(branches.id, payload.branchId), isNull(branches.deletedAt)));
    if (!branch) throw new NotFoundException('Branch not found');
    const [station] = await this.db
      .select({ companyId: stations.companyId })
      .from(stations)
      .where(eq(stations.id, branch.stationId));
    if (!station) throw new NotFoundException('Station not found');

    const code = payload.code.trim();
    try {
      const [inserted] = await this.db
        .insert(customers)
        .values({
          companyId: station.companyId,
          branchId: payload.branchId,
          code,
          name: payload.name.trim(),
          email: payload.email?.trim() || null,
          phone: payload.phone?.trim() || null,
          address: payload.address?.trim() || null,
          taxId: payload.taxId?.trim() || null,
          creditLimit: String(payload.creditLimit),
          paymentTerms: payload.paymentTerms.trim(),
          balance: '0',
          status: payload.status ?? 'active',
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        })
        .returning({
          id: customers.id,
          companyId: customers.companyId,
          branchId: customers.branchId,
          code: customers.code,
          name: customers.name,
          email: customers.email,
          phone: customers.phone,
          address: customers.address,
          taxId: customers.taxId,
          creditLimit: customers.creditLimit,
          paymentTerms: customers.paymentTerms,
          balance: customers.balance,
          status: customers.status,
          createdAt: customers.createdAt,
        });
      if (!inserted) throw new Error('Insert failed');
      await this.audit.log({
        entity: 'customers',
        entityId: inserted.id,
        action: 'create',
        after: inserted as object,
        userId: ctx.userId,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      return inserted;
    } catch (err) {
      throwConflictIfUniqueViolation(err, `Customer with code "${code}" already exists in this branch`);
      throw err;
    }
  }

  async update(id: string, payload: Partial<{
    code: string;
    name: string;
    email: string;
    phone: string;
    address: string;
    taxId: string;
    creditLimit: number;
    paymentTerms: string;
    status: string;
  }>, ctx: AuditContext): Promise<CustomerItem> {
    const before = await this.findById(id);
    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
      ...(ctx.userId && { updatedBy: ctx.userId }),
    };
    if (payload.code !== undefined) updates.code = payload.code.trim();
    if (payload.name !== undefined) updates.name = payload.name.trim();
    if (payload.email !== undefined) updates.email = payload.email?.trim() || null;
    if (payload.phone !== undefined) updates.phone = payload.phone?.trim() || null;
    if (payload.address !== undefined) updates.address = payload.address?.trim() || null;
    if (payload.taxId !== undefined) updates.taxId = payload.taxId?.trim() || null;
    if (payload.creditLimit !== undefined) updates.creditLimit = String(payload.creditLimit);
    if (payload.paymentTerms !== undefined) updates.paymentTerms = payload.paymentTerms.trim();
    if (payload.status !== undefined) updates.status = payload.status;

    if (payload.code !== undefined && payload.code.trim() !== before.code) {
      const [existing] = await this.db
        .select({ id: customers.id })
        .from(customers)
        .where(and(
          eq(customers.companyId, before.companyId),
          eq(customers.branchId, before.branchId),
          eq(customers.code, payload.code.trim()),
          isNull(customers.deletedAt),
        ));
      if (existing) throw new ConflictException(`Customer with code "${payload.code}" already exists in this branch`);
    }
    try {
      const [updated] = await this.db
        .update(customers)
        .set(updates as Record<string, string | Date | null>)
        .where(eq(customers.id, id))
        .returning({
          id: customers.id,
          companyId: customers.companyId,
          branchId: customers.branchId,
          code: customers.code,
          name: customers.name,
          email: customers.email,
          phone: customers.phone,
          address: customers.address,
          taxId: customers.taxId,
          creditLimit: customers.creditLimit,
          paymentTerms: customers.paymentTerms,
          balance: customers.balance,
          status: customers.status,
          createdAt: customers.createdAt,
        });
      if (!updated) throw new NotFoundException('Customer not found');
      await this.audit.log({
        entity: 'customers',
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
      .update(customers)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
        ...(ctx.userId && { updatedBy: ctx.userId }),
      })
      .where(eq(customers.id, id));
    await this.audit.log({
      entity: 'customers',
      entityId: id,
      action: 'delete',
      before: before as object,
      userId: ctx.userId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
  }

  async addNote(id: string, note: string, ctx: AuditContext): Promise<{ ok: true; id: string }> {
    await this.findById(id);
    const noteId = `cn-${Date.now()}`;
    await this.audit.log({
      entity: 'customer_note',
      entityId: id,
      action: 'add-note',
      after: { noteId, note },
      userId: ctx.userId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return { ok: true, id: noteId };
  }

  async recordAction(
    id: string,
    action: string,
    payload: Record<string, unknown> | undefined,
    ctx: AuditContext,
  ): Promise<{ ok: true; action: string }> {
    await this.findById(id);
    await this.audit.log({
      entity: 'customer_action',
      entityId: id,
      action,
      after: payload ?? null,
      userId: ctx.userId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return { ok: true, action };
  }
}
