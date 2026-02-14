import { index, numeric, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { auditColumns } from '../shared';
import { companies } from '../core/companies';
import { branches } from '../core/branches';
import { tanks } from '../setup/tanks';

/** Variance classification (demo) */
export const VARIANCE_CLASSIFICATIONS = ['evaporation', 'leakage', 'calibration', 'theft', 'unknown'] as const;
export type VarianceClassification = (typeof VARIANCE_CLASSIFICATIONS)[number];

export const variances = pgTable(
  'variances',
  {
    ...auditColumns,
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'restrict' }),
    tankId: uuid('tank_id').references(() => tanks.id, { onDelete: 'set null' }),
    varianceDate: timestamp('variance_date', { withTimezone: true }).notNull(),
    volumeVariance: numeric('volume_variance', { precision: 18, scale: 3 }).notNull(),
    valueVariance: numeric('value_variance', { precision: 18, scale: 2 }),
    classification: varchar('classification', { length: 64 }),
    notes: text('notes'),
  },
  (t) => [
    index('variances_company_branch_date_idx').on(t.companyId, t.branchId, t.varianceDate),
    index('variances_variance_date_idx').on(t.varianceDate),
    index('variances_tank_id_idx').on(t.tankId),
    index('variances_classification_idx').on(t.classification),
  ],
);
