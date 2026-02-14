import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { and, asc, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../../database/database.module';
import type * as schema from '../../database/schema';
import {
  expenseCategories,
  expenseEntries,
  pettyCashLedger,
  roles,
  userRoles,
} from '../../database/schema';
import { getListParams } from '../../common/helpers/list.helper';
import { parseSort } from '../../common/dto/sort.dto';
import { throwConflictIfUniqueViolation } from '../../common/utils/db-errors';
import { AuditService } from '../audit/audit.service';
import { GovernanceService } from '../governance/governance.service';
import type { CreateExpenseCategoryDto } from './dto/create-expense-category.dto';
import type { UpdateExpenseCategoryDto } from './dto/update-expense-category.dto';
import type { CreateExpenseEntryDto } from './dto/create-expense-entry.dto';
import type { CreatePettyCashTxDto } from './dto/create-petty-cash-tx.dto';

type Schema = typeof schema;

const EXPENSE_STATUS_DRAFT = 'draft';
const EXPENSE_STATUS_SUBMITTED = 'submitted';
const EXPENSE_STATUS_PENDING_APPROVAL = 'pending_approval';
const EXPENSE_STATUS_APPROVED = 'approved';
const EXPENSE_STATUS_REJECTED = 'rejected';

const TX_TOPUP = 'topup';
const TX_SPEND = 'spend';

const CATEGORY_SORT_COLUMNS: Record<
  string,
  | typeof expenseCategories.createdAt
  | typeof expenseCategories.code
  | typeof expenseCategories.name
  | typeof expenseCategories.status
> = {
  created_at: expenseCategories.createdAt,
  createdAt: expenseCategories.createdAt,
  code: expenseCategories.code,
  name: expenseCategories.name,
  status: expenseCategories.status,
};

interface AuditContext {
  userId: string;
  ip?: string;
  userAgent?: string;
}

export interface ExpenseCategoryItem {
  id: string;
  companyId: string;
  branchId: string;
  code: string;
  name: string;
  description: string | null;
  status: string;
  createdAt: Date;
}

export interface ExpenseEntryItem {
  id: string;
  companyId: string;
  branchId: string;
  entryNumber: string;
  categoryId: string | null;
  category: string;
  amount: string;
  vendor: string;
  paymentMethod: string;
  description: string | null;
  billableDepartment: string | null;
  attachmentName: string | null;
  rejectionReason: string | null;
  status: string;
  createdAt: Date;
}

export interface PettyCashLedgerItem {
  id: string;
  companyId: string;
  branchId: string;
  transactionType: string;
  amount: string;
  category: string | null;
  notes: string;
  balanceAfter: string;
  createdAt: Date;
}

@Injectable()
export class ExpensesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<Schema>,
    private readonly audit: AuditService,
    private readonly governance: GovernanceService,
  ) {}

  async listExpenseCategories(params: {
    page?: number;
    pageSize?: number;
    sort?: string;
    q?: string;
    companyId?: string;
    branchId?: string;
    status?: string;
  }): Promise<{ data: ExpenseCategoryItem[]; total: number }> {
    const { offset, limit } = getListParams(params);
    const order = this.getCategoryOrder(params.sort);
    const conditions = [isNull(expenseCategories.deletedAt)];
    if (params.companyId) conditions.push(eq(expenseCategories.companyId, params.companyId));
    if (params.branchId) conditions.push(eq(expenseCategories.branchId, params.branchId));
    if (params.status) conditions.push(eq(expenseCategories.status, params.status));
    if (params.q) {
      conditions.push(
        or(
          ilike(expenseCategories.code, `%${params.q}%`),
          ilike(expenseCategories.name, `%${params.q}%`),
          ilike(expenseCategories.description, `%${params.q}%`),
        )!,
      );
    }
    const w = conditions.length > 1 ? and(...conditions) : conditions[0];
    const [data, countResult] = await Promise.all([
      this.db
        .select({
          id: expenseCategories.id,
          companyId: expenseCategories.companyId,
          branchId: expenseCategories.branchId,
          code: expenseCategories.code,
          name: expenseCategories.name,
          description: expenseCategories.description,
          status: expenseCategories.status,
          createdAt: expenseCategories.createdAt,
        })
        .from(expenseCategories)
        .where(w)
        .orderBy(order)
        .limit(limit)
        .offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(expenseCategories).where(w),
    ]);
    return { data, total: countResult[0]?.count ?? 0 };
  }

  async getExpenseCategory(id: string): Promise<ExpenseCategoryItem> {
    const [row] = await this.db
      .select({
        id: expenseCategories.id,
        companyId: expenseCategories.companyId,
        branchId: expenseCategories.branchId,
        code: expenseCategories.code,
        name: expenseCategories.name,
        description: expenseCategories.description,
        status: expenseCategories.status,
        createdAt: expenseCategories.createdAt,
      })
      .from(expenseCategories)
      .where(and(eq(expenseCategories.id, id), isNull(expenseCategories.deletedAt)));
    if (!row) throw new NotFoundException('Expense category not found');
    return row;
  }

  async createExpenseCategory(
    dto: CreateExpenseCategoryDto,
    ctx: AuditContext,
  ): Promise<ExpenseCategoryItem> {
    try {
      const [inserted] = await this.db
        .insert(expenseCategories)
        .values({
          companyId: dto.companyId,
          branchId: dto.branchId,
          code: dto.code.trim(),
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          status: dto.status ?? 'active',
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        })
        .returning({
          id: expenseCategories.id,
          companyId: expenseCategories.companyId,
          branchId: expenseCategories.branchId,
          code: expenseCategories.code,
          name: expenseCategories.name,
          description: expenseCategories.description,
          status: expenseCategories.status,
          createdAt: expenseCategories.createdAt,
        });
      if (!inserted) throw new Error('Insert failed');
      await this.audit.log({
        entity: 'expense_categories',
        entityId: inserted.id,
        action: 'create',
        after: inserted as object,
        userId: ctx.userId,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      return inserted;
    } catch (err) {
      throwConflictIfUniqueViolation(err, `Expense category code "${dto.code}" already exists in this branch`);
    }
  }

  async updateExpenseCategory(
    id: string,
    dto: UpdateExpenseCategoryDto,
    ctx: AuditContext,
  ): Promise<ExpenseCategoryItem> {
    const before = await this.getExpenseCategory(id);
    const set: Record<string, unknown> = {
      updatedAt: new Date(),
      updatedBy: ctx.userId,
    };
    if (dto.companyId !== undefined) set.companyId = dto.companyId;
    if (dto.branchId !== undefined) set.branchId = dto.branchId;
    if (dto.code !== undefined) set.code = dto.code.trim();
    if (dto.name !== undefined) set.name = dto.name.trim();
    if (dto.description !== undefined) set.description = dto.description?.trim() || null;
    if (dto.status !== undefined) set.status = dto.status;

    try {
      const [updated] = await this.db
        .update(expenseCategories)
        .set(set as typeof expenseCategories.$inferInsert)
        .where(eq(expenseCategories.id, id))
        .returning({
          id: expenseCategories.id,
          companyId: expenseCategories.companyId,
          branchId: expenseCategories.branchId,
          code: expenseCategories.code,
          name: expenseCategories.name,
          description: expenseCategories.description,
          status: expenseCategories.status,
          createdAt: expenseCategories.createdAt,
        });
      if (!updated) throw new NotFoundException('Expense category not found');
      await this.audit.log({
        entity: 'expense_categories',
        entityId: updated.id,
        action: 'update',
        before: before as object,
        after: updated as object,
        userId: ctx.userId,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      return updated;
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throwConflictIfUniqueViolation(err, `Expense category code "${dto.code}" already exists in this branch`);
    }
  }

  async deleteExpenseCategory(id: string, ctx: AuditContext): Promise<void> {
    const before = await this.getExpenseCategory(id);
    await this.db
      .update(expenseCategories)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
        updatedBy: ctx.userId,
      })
      .where(eq(expenseCategories.id, id));
    await this.audit.log({
      entity: 'expense_categories',
      entityId: id,
      action: 'delete',
      before: before as object,
      userId: ctx.userId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
  }

  async createExpenseEntry(dto: CreateExpenseEntryDto, ctx: AuditContext): Promise<ExpenseEntryItem> {
    const entryNumber = `EXP-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const [inserted] = await this.db
      .insert(expenseEntries)
      .values({
        companyId: dto.companyId,
        branchId: dto.branchId,
        entryNumber,
        categoryId: dto.categoryId ?? null,
        category: dto.category.trim(),
        amount: String(dto.amount.toFixed(2)),
        vendor: dto.vendor.trim(),
        paymentMethod: dto.paymentMethod,
        description: dto.description?.trim() || null,
        billableDepartment: dto.billableDepartment?.trim() || null,
        attachmentName: dto.attachmentName?.trim() || null,
        status: EXPENSE_STATUS_DRAFT,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      })
      .returning({
        id: expenseEntries.id,
        companyId: expenseEntries.companyId,
        branchId: expenseEntries.branchId,
        entryNumber: expenseEntries.entryNumber,
        categoryId: expenseEntries.categoryId,
        category: expenseEntries.category,
        amount: expenseEntries.amount,
        vendor: expenseEntries.vendor,
        paymentMethod: expenseEntries.paymentMethod,
        description: expenseEntries.description,
        billableDepartment: expenseEntries.billableDepartment,
        attachmentName: expenseEntries.attachmentName,
        rejectionReason: expenseEntries.rejectionReason,
        status: expenseEntries.status,
        createdAt: expenseEntries.createdAt,
      });
    if (!inserted) throw new Error('Failed to insert expense entry');
    await this.audit.log({
      entity: 'expense_entries',
      entityId: inserted.id,
      action: 'create',
      after: inserted as object,
      userId: ctx.userId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return inserted;
  }

  async listExpenseEntries(params: {
    page?: number;
    pageSize?: number;
    companyId?: string;
    branchId?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
    q?: string;
  }): Promise<{ data: ExpenseEntryItem[]; total: number }> {
    const { offset, limit } = getListParams(params);
    const conditions = [isNull(expenseEntries.deletedAt)];
    if (params.companyId) conditions.push(eq(expenseEntries.companyId, params.companyId));
    if (params.branchId) conditions.push(eq(expenseEntries.branchId, params.branchId));
    if (params.status) conditions.push(eq(expenseEntries.status, params.status));
    if (params.dateFrom) conditions.push(sql`${expenseEntries.createdAt} >= ${params.dateFrom}::timestamptz`);
    if (params.dateTo) conditions.push(sql`${expenseEntries.createdAt} <= ${params.dateTo}::timestamptz`);
    if (params.q) {
      conditions.push(
        or(
          ilike(expenseEntries.entryNumber, `%${params.q}%`),
          ilike(expenseEntries.vendor, `%${params.q}%`),
          ilike(expenseEntries.category, `%${params.q}%`),
          ilike(expenseEntries.description, `%${params.q}%`),
        )!,
      );
    }
    const w = conditions.length > 1 ? and(...conditions) : conditions[0];
    const [data, countResult] = await Promise.all([
      this.db
        .select({
          id: expenseEntries.id,
          companyId: expenseEntries.companyId,
          branchId: expenseEntries.branchId,
          entryNumber: expenseEntries.entryNumber,
          categoryId: expenseEntries.categoryId,
          category: expenseEntries.category,
          amount: expenseEntries.amount,
          vendor: expenseEntries.vendor,
          paymentMethod: expenseEntries.paymentMethod,
          description: expenseEntries.description,
          billableDepartment: expenseEntries.billableDepartment,
          attachmentName: expenseEntries.attachmentName,
          rejectionReason: expenseEntries.rejectionReason,
          status: expenseEntries.status,
          createdAt: expenseEntries.createdAt,
        })
        .from(expenseEntries)
        .where(w)
        .orderBy(desc(expenseEntries.createdAt))
        .limit(limit)
        .offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(expenseEntries).where(w),
    ]);
    return { data, total: countResult[0]?.count ?? 0 };
  }

  async submitExpenseEntry(id: string, ctx: AuditContext): Promise<ExpenseEntryItem> {
    const [before] = await this.db.select().from(expenseEntries).where(and(eq(expenseEntries.id, id), isNull(expenseEntries.deletedAt)));
    if (!before) throw new NotFoundException('Expense entry not found');
    if (before.status !== EXPENSE_STATUS_DRAFT) {
      throw new BadRequestException(`Only ${EXPENSE_STATUS_DRAFT} entries can be submitted`);
    }

    const governanceRequest = await this.governance.initiateControlledActionRequest(
      {
        companyId: before.companyId,
        branchId: before.branchId,
        entityType: 'expense_entry',
        entityId: before.id,
        actionType: 'approve',
        amount: Number(before.amount),
        reason: before.description ?? undefined,
        meta: {
          amount: Number(before.amount),
          category: before.category,
          vendor: before.vendor,
        },
      },
      { userId: ctx.userId, permissions: [] },
      { ip: ctx.ip, userAgent: ctx.userAgent },
    );

    if (governanceRequest) {
      const [pending] = await this.db
        .update(expenseEntries)
        .set({
          status: EXPENSE_STATUS_PENDING_APPROVAL,
          rejectionReason: null,
          updatedAt: new Date(),
          updatedBy: ctx.userId,
        })
        .where(eq(expenseEntries.id, id))
        .returning({
          id: expenseEntries.id,
          companyId: expenseEntries.companyId,
          branchId: expenseEntries.branchId,
          entryNumber: expenseEntries.entryNumber,
          categoryId: expenseEntries.categoryId,
          category: expenseEntries.category,
          amount: expenseEntries.amount,
          vendor: expenseEntries.vendor,
          paymentMethod: expenseEntries.paymentMethod,
          description: expenseEntries.description,
          billableDepartment: expenseEntries.billableDepartment,
          attachmentName: expenseEntries.attachmentName,
          rejectionReason: expenseEntries.rejectionReason,
          status: expenseEntries.status,
          createdAt: expenseEntries.createdAt,
        });
      if (!pending) throw new Error('Failed to set expense pending approval');

      await this.audit.log({
        entity: 'expense_entries',
        entityId: id,
        action: 'submit_for_approval',
        before: before as object,
        after: pending as object,
        userId: ctx.userId,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });

      return pending;
    }

    const [updated] = await this.db
      .update(expenseEntries)
      .set({
        status: EXPENSE_STATUS_SUBMITTED,
        rejectionReason: null,
        updatedAt: new Date(),
        updatedBy: ctx.userId,
      })
      .where(eq(expenseEntries.id, id))
      .returning({
        id: expenseEntries.id,
        companyId: expenseEntries.companyId,
        branchId: expenseEntries.branchId,
        entryNumber: expenseEntries.entryNumber,
        categoryId: expenseEntries.categoryId,
        category: expenseEntries.category,
        amount: expenseEntries.amount,
        vendor: expenseEntries.vendor,
        paymentMethod: expenseEntries.paymentMethod,
        description: expenseEntries.description,
        billableDepartment: expenseEntries.billableDepartment,
        attachmentName: expenseEntries.attachmentName,
        rejectionReason: expenseEntries.rejectionReason,
        status: expenseEntries.status,
        createdAt: expenseEntries.createdAt,
      });
    if (!updated) throw new Error('Failed to update expense entry');
    await this.audit.log({
      entity: 'expense_entries',
      entityId: id,
      action: 'submit',
      before: before as object,
      after: updated as object,
      userId: ctx.userId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return updated;
  }

  async approveExpenseEntry(id: string, ctx: AuditContext): Promise<ExpenseEntryItem> {
    await this.assertManager(ctx.userId);
    const [before] = await this.db.select().from(expenseEntries).where(and(eq(expenseEntries.id, id), isNull(expenseEntries.deletedAt)));
    if (!before) throw new NotFoundException('Expense entry not found');
    if (before.status !== EXPENSE_STATUS_SUBMITTED) {
      throw new BadRequestException(`Only ${EXPENSE_STATUS_SUBMITTED} entries can be approved`);
    }
    const [updated] = await this.db
      .update(expenseEntries)
      .set({
        status: EXPENSE_STATUS_APPROVED,
        rejectionReason: null,
        updatedAt: new Date(),
        updatedBy: ctx.userId,
      })
      .where(eq(expenseEntries.id, id))
      .returning({
        id: expenseEntries.id,
        companyId: expenseEntries.companyId,
        branchId: expenseEntries.branchId,
        entryNumber: expenseEntries.entryNumber,
        categoryId: expenseEntries.categoryId,
        category: expenseEntries.category,
        amount: expenseEntries.amount,
        vendor: expenseEntries.vendor,
        paymentMethod: expenseEntries.paymentMethod,
        description: expenseEntries.description,
        billableDepartment: expenseEntries.billableDepartment,
        attachmentName: expenseEntries.attachmentName,
        rejectionReason: expenseEntries.rejectionReason,
        status: expenseEntries.status,
        createdAt: expenseEntries.createdAt,
      });
    if (!updated) throw new Error('Failed to update expense entry');
    await this.audit.log({
      entity: 'expense_entries',
      entityId: id,
      action: 'approve',
      before: before as object,
      after: updated as object,
      userId: ctx.userId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return updated;
  }

  async rejectExpenseEntry(id: string, reason: string, ctx: AuditContext): Promise<ExpenseEntryItem> {
    await this.assertManager(ctx.userId);
    const trimmedReason = reason.trim();
    if (!trimmedReason) throw new BadRequestException('Rejection reason is required');

    const [before] = await this.db.select().from(expenseEntries).where(and(eq(expenseEntries.id, id), isNull(expenseEntries.deletedAt)));
    if (!before) throw new NotFoundException('Expense entry not found');
    if (before.status !== EXPENSE_STATUS_SUBMITTED) {
      throw new BadRequestException(`Only ${EXPENSE_STATUS_SUBMITTED} entries can be rejected`);
    }
    const [updated] = await this.db
      .update(expenseEntries)
      .set({
        status: EXPENSE_STATUS_REJECTED,
        rejectionReason: trimmedReason,
        updatedAt: new Date(),
        updatedBy: ctx.userId,
      })
      .where(eq(expenseEntries.id, id))
      .returning({
        id: expenseEntries.id,
        companyId: expenseEntries.companyId,
        branchId: expenseEntries.branchId,
        entryNumber: expenseEntries.entryNumber,
        categoryId: expenseEntries.categoryId,
        category: expenseEntries.category,
        amount: expenseEntries.amount,
        vendor: expenseEntries.vendor,
        paymentMethod: expenseEntries.paymentMethod,
        description: expenseEntries.description,
        billableDepartment: expenseEntries.billableDepartment,
        attachmentName: expenseEntries.attachmentName,
        rejectionReason: expenseEntries.rejectionReason,
        status: expenseEntries.status,
        createdAt: expenseEntries.createdAt,
      });
    if (!updated) throw new Error('Failed to update expense entry');
    await this.audit.log({
      entity: 'expense_entries',
      entityId: id,
      action: 'reject',
      before: before as object,
      after: updated as object,
      userId: ctx.userId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return updated;
  }

  async topupPettyCash(dto: CreatePettyCashTxDto, ctx: AuditContext): Promise<PettyCashLedgerItem> {
    return this.createPettyCashTx(TX_TOPUP, dto, ctx);
  }

  async spendPettyCash(dto: CreatePettyCashTxDto, ctx: AuditContext): Promise<PettyCashLedgerItem> {
    return this.createPettyCashTx(TX_SPEND, dto, ctx);
  }

  async listPettyCashLedger(params: {
    page?: number;
    pageSize?: number;
    companyId?: string;
    branchId?: string;
    dateFrom?: string;
    dateTo?: string;
  }): Promise<{ data: PettyCashLedgerItem[]; total: number; balance: number }> {
    if (!params.companyId || !params.branchId) {
      throw new BadRequestException('companyId and branchId are required');
    }
    const { offset, limit } = getListParams(params);
    const conditions = [
      isNull(pettyCashLedger.deletedAt),
      eq(pettyCashLedger.companyId, params.companyId),
      eq(pettyCashLedger.branchId, params.branchId),
    ];
    if (params.dateFrom) conditions.push(sql`${pettyCashLedger.createdAt} >= ${params.dateFrom}::timestamptz`);
    if (params.dateTo) conditions.push(sql`${pettyCashLedger.createdAt} <= ${params.dateTo}::timestamptz`);
    const w = and(...conditions);

    const [data, countResult, balance] = await Promise.all([
      this.db
        .select({
          id: pettyCashLedger.id,
          companyId: pettyCashLedger.companyId,
          branchId: pettyCashLedger.branchId,
          transactionType: pettyCashLedger.transactionType,
          amount: pettyCashLedger.amount,
          category: pettyCashLedger.category,
          notes: pettyCashLedger.notes,
          balanceAfter: pettyCashLedger.balanceAfter,
          createdAt: pettyCashLedger.createdAt,
        })
        .from(pettyCashLedger)
        .where(w)
        .orderBy(desc(pettyCashLedger.createdAt))
        .limit(limit)
        .offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(pettyCashLedger).where(w),
      this.getPettyCashBalance(params.companyId, params.branchId),
    ]);
    return { data, total: countResult[0]?.count ?? 0, balance };
  }

  private async createPettyCashTx(
    txType: 'topup' | 'spend',
    dto: CreatePettyCashTxDto,
    ctx: AuditContext,
  ): Promise<PettyCashLedgerItem> {
    const amount = Number(dto.amount);
    if (!(amount > 0)) throw new BadRequestException('Amount must be greater than zero');

    return this.db.transaction(async (tx) => {
      const balance = await this.getPettyCashBalance(dto.companyId, dto.branchId, tx as NodePgDatabase<Schema>);
      const nextBalance = txType === TX_TOPUP ? balance + amount : balance - amount;
      if (nextBalance < 0) throw new ConflictException('Insufficient petty cash balance');

      const [inserted] = await tx
        .insert(pettyCashLedger)
        .values({
          companyId: dto.companyId,
          branchId: dto.branchId,
          transactionType: txType,
          amount: String(amount.toFixed(2)),
          category: dto.category?.trim() || null,
          notes: dto.notes.trim(),
          balanceAfter: String(nextBalance.toFixed(2)),
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        })
        .returning({
          id: pettyCashLedger.id,
          companyId: pettyCashLedger.companyId,
          branchId: pettyCashLedger.branchId,
          transactionType: pettyCashLedger.transactionType,
          amount: pettyCashLedger.amount,
          category: pettyCashLedger.category,
          notes: pettyCashLedger.notes,
          balanceAfter: pettyCashLedger.balanceAfter,
          createdAt: pettyCashLedger.createdAt,
        });
      if (!inserted) throw new Error('Failed to insert petty cash ledger entry');

      await this.audit.log(
        {
          entity: 'petty_cash_ledger',
          entityId: inserted.id,
          action: txType,
          after: inserted as object,
          userId: ctx.userId,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        tx as NodePgDatabase<Schema>,
      );
      return inserted;
    });
  }

  private async getPettyCashBalance(
    companyId: string,
    branchId: string,
    tx?: NodePgDatabase<Schema>,
  ): Promise<number> {
    const client = tx ?? this.db;
    const [row] = await client
      .select({
        topup: sql<number>`coalesce(sum(case when ${pettyCashLedger.transactionType} = ${TX_TOPUP} then ${pettyCashLedger.amount} else 0 end), 0)::numeric`,
        spend: sql<number>`coalesce(sum(case when ${pettyCashLedger.transactionType} = ${TX_SPEND} then ${pettyCashLedger.amount} else 0 end), 0)::numeric`,
      })
      .from(pettyCashLedger)
      .where(
        and(
          eq(pettyCashLedger.companyId, companyId),
          eq(pettyCashLedger.branchId, branchId),
          isNull(pettyCashLedger.deletedAt),
        ),
      );
    const topup = Number(row?.topup ?? 0);
    const spend = Number(row?.spend ?? 0);
    return Math.round((topup - spend) * 100) / 100;
  }

  private async assertManager(userId: string): Promise<void> {
    const rows = await this.db
      .select({ roleCode: roles.code })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(and(eq(userRoles.userId, userId), isNull(roles.deletedAt)));
    const isManager = rows.some((r) => r.roleCode === 'manager');
    if (!isManager) throw new ForbiddenException('Manager role required');
  }

  private getCategoryOrder(sort?: string) {
    const parsed = parseSort(sort);
    const col = parsed ? CATEGORY_SORT_COLUMNS[parsed.field] ?? expenseCategories.createdAt : expenseCategories.createdAt;
    const direction = parsed?.direction ?? 'desc';
    return direction === 'desc' ? desc(col) : asc(col);
  }
}
