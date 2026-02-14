import { index, numeric, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { auditColumns } from '../shared';
import { companies } from '../core/companies';
import { branches } from '../core/branches';
import { tanks } from '../setup/tanks';
import { products } from '../setup/products';

/** Movement types for reporting */
export const STOCK_LEDGER_MOVEMENT_GRN = 'grn';
export const STOCK_LEDGER_MOVEMENT_TRANSFER_OUT = 'transfer_out';
export const STOCK_LEDGER_MOVEMENT_TRANSFER_IN = 'transfer_in';
export const STOCK_LEDGER_MOVEMENT_ADJUSTMENT = 'adjustment';

export const stockLedger = pgTable(
  'stock_ledger',
  {
    ...auditColumns,
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'restrict' }),
    tankId: uuid('tank_id')
      .notNull()
      .references(() => tanks.id, { onDelete: 'restrict' }),
    productId: uuid('product_id').references(() => products.id, { onDelete: 'restrict' }),
    movementType: varchar('movement_type', { length: 32 }).notNull(),
    referenceType: varchar('reference_type', { length: 32 }).notNull(),
    referenceId: uuid('reference_id').notNull(),
    quantity: numeric('quantity', { precision: 18, scale: 3 }).notNull(),
    movementDate: timestamp('movement_date', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('stock_ledger_company_branch_date_idx').on(t.companyId, t.branchId, t.movementDate),
    index('stock_ledger_tank_id_idx').on(t.tankId),
    index('stock_ledger_reference_idx').on(t.referenceType, t.referenceId),
  ],
);
