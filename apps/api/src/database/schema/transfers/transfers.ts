import { index, numeric, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { auditColumns } from '../shared';
import { companies } from '../core/companies';
import { branches } from '../core/branches';
import { tanks } from '../setup/tanks';

export const transfers = pgTable(
  'transfers',
  {
    ...auditColumns,
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'restrict' }),
    transferType: varchar('transfer_type', { length: 32 }).notNull(),
    fromTankId: uuid('from_tank_id').references(() => tanks.id, { onDelete: 'restrict' }),
    toTankId: uuid('to_tank_id').references(() => tanks.id, { onDelete: 'restrict' }),
    quantity: numeric('quantity', { precision: 18, scale: 3 }).notNull(),
    transferDate: timestamp('transfer_date', { withTimezone: true }).notNull(),
    reference: varchar('reference', { length: 128 }),
    status: varchar('status', { length: 20 }).notNull().default('completed'),
  },
  (t) => [
    index('transfers_company_branch_date_idx').on(t.companyId, t.branchId, t.transferDate),
    index('transfers_from_tank_id_idx').on(t.fromTankId),
    index('transfers_to_tank_id_idx').on(t.toTankId),
    index('transfers_status_idx').on(t.status),
  ],
);
