import { index, numeric, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { auditColumns } from '../shared';
import { companies } from '../core/companies';
import { branches } from '../core/branches';

export const customers = pgTable(
  'customers',
  {
    ...auditColumns,
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'restrict' }),
    code: varchar('code', { length: 32 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    email: varchar('email', { length: 255 }),
    phone: varchar('phone', { length: 64 }),
    address: varchar('address', { length: 512 }),
    taxId: varchar('tax_id', { length: 64 }),
    creditLimit: numeric('credit_limit', { precision: 18, scale: 2 }).notNull(),
    paymentTerms: varchar('payment_terms', { length: 32 }).notNull(),
    balance: numeric('balance', { precision: 18, scale: 2 }).notNull().default('0'),
    status: varchar('status', { length: 20 }).notNull().default('active'),
  },
  (t) => [
    uniqueIndex('customers_company_branch_code_unique').on(t.companyId, t.branchId, t.code),
    index('customers_company_id_idx').on(t.companyId),
    index('customers_branch_id_idx').on(t.branchId),
    index('customers_status_idx').on(t.status),
  ],
);
