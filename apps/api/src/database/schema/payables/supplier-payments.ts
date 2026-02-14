import { index, numeric, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { auditColumns } from '../shared';
import { companies } from '../core/companies';
import { branches } from '../core/branches';
import { suppliers } from './suppliers';

export const supplierPayments = pgTable(
  'supplier_payments',
  {
    ...auditColumns,
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'restrict' }),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id, { onDelete: 'restrict' }),
    amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
    method: varchar('method', { length: 32 }).notNull(),
    paymentDate: timestamp('payment_date', { withTimezone: true }).notNull(),
    referenceNo: varchar('reference_no', { length: 128 }),
  },
  (t) => [
    index('supplier_payments_company_branch_date_idx').on(t.companyId, t.branchId, t.paymentDate),
    index('supplier_payments_supplier_id_idx').on(t.supplierId),
  ],
);
