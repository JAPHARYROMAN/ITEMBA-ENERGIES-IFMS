import { index, numeric, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { auditColumns } from '../shared';
import { companies } from '../core/companies';
import { branches } from '../core/branches';
import { tanks } from '../setup/tanks';

export const tankDips = pgTable(
  'tank_dips',
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
    dipDate: timestamp('dip_date', { withTimezone: true }).notNull(),
    volume: numeric('volume', { precision: 18, scale: 3 }).notNull(),
    waterLevel: numeric('water_level', { precision: 18, scale: 3 }),
    temperature: numeric('temperature', { precision: 8, scale: 2 }),
  },
  (t) => [
    index('tank_dips_company_branch_date_idx').on(t.companyId, t.branchId, t.dipDate),
    index('tank_dips_tank_id_idx').on(t.tankId),
    index('tank_dips_dip_date_idx').on(t.dipDate),
  ],
);
