import { index, numeric, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { auditColumns } from '../shared';
import { companies } from '../core/companies';
import { branches } from '../core/branches';
import { shifts } from '../operations/shifts';
import { users } from '../auth/users';

export const SALE_STATUS_COMPLETED = 'completed';
export const SALE_STATUS_VOIDED = 'voided';
export const SALE_STATUS_PENDING_VOID_APPROVAL = 'pending_void_approval';

export const salesTransactions = pgTable(
  'sales_transactions',
  {
    ...auditColumns,
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'restrict' }),
    receiptNumber: varchar('receipt_number', { length: 64 }).notNull(),
    transactionDate: timestamp('transaction_date', { withTimezone: true }).notNull(),
    totalAmount: numeric('total_amount', { precision: 18, scale: 2 }).notNull(),
    discountAmount: numeric('discount_amount', { precision: 18, scale: 2 }).default('0'),
    discountReason: varchar('discount_reason', { length: 512 }),
    paymentType: varchar('payment_type', { length: 32 }),
    shiftId: uuid('shift_id').references(() => shifts.id, { onDelete: 'set null' }),
    status: varchar('status', { length: 20 }).notNull().default(SALE_STATUS_COMPLETED),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    voidedBy: uuid('voided_by').references(() => users.id),
    voidReason: varchar('void_reason', { length: 512 }),
  },
  (t) => [
    index('sales_transactions_company_branch_date_idx').on(t.companyId, t.branchId, t.transactionDate),
    index('sales_transactions_created_at_idx').on(t.createdAt),
    index('sales_transactions_status_idx').on(t.status),
    index('sales_transactions_shift_id_idx').on(t.shiftId),
  ],
);
