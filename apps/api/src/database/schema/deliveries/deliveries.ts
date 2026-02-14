import { index, numeric, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { auditColumns } from '../shared';
import { companies } from '../core/companies';
import { branches } from '../core/branches';
import { products } from '../setup/products';
import { suppliers } from '../payables/suppliers';

export const deliveries = pgTable(
  'deliveries',
  {
    ...auditColumns,
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'restrict' }),
    deliveryNote: varchar('delivery_note', { length: 128 }).notNull(),
    supplierId: uuid('supplier_id').references(() => suppliers.id, { onDelete: 'set null' }),
    vehicleNo: varchar('vehicle_no', { length: 64 }),
    driverName: varchar('driver_name', { length: 255 }),
    productId: uuid('product_id').references(() => products.id, { onDelete: 'restrict' }),
    orderedQty: numeric('ordered_qty', { precision: 18, scale: 3 }).notNull(),
    expectedDate: timestamp('expected_date', { withTimezone: true }).notNull(),
    receivedQty: numeric('received_qty', { precision: 18, scale: 3 }),
    density: numeric('density', { precision: 10, scale: 4 }),
    temperature: numeric('temperature', { precision: 8, scale: 2 }),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
  },
  (t) => [
    index('deliveries_company_branch_date_idx').on(t.companyId, t.branchId, t.createdAt),
    index('deliveries_status_idx').on(t.status),
  ],
);
