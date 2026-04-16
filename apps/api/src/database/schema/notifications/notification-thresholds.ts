import { pgTable, varchar, numeric, boolean, jsonb, uuid } from 'drizzle-orm/pg-core';
import { auditColumns } from '../shared';
import { companies } from '../core/companies';
import { branches } from '../core/branches';

export const notificationThresholds = pgTable(
  'notification_thresholds',
  {
    ...auditColumns,
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    branchId: uuid('branch_id')
      .references(() => branches.id, { onDelete: 'restrict' }),
    category: varchar('category', { length: 64 }).notNull(), // 'shrinkage', 'low_stock', 'variance', etc.
    thresholdType: varchar('threshold_type', { length: 32 }).notNull(), // 'percentage', 'absolute', 'days'
    thresholdValue: numeric('threshold_value', { precision: 18, scale: 2 }).notNull(),
    enabled: boolean('enabled').notNull().default(true),
    settingsJson: jsonb('settings_json'), // Additional settings per threshold type
  },
  (t) => [
    {
      name: 'notification_thresholds_company_branch_category_unique',
      columns: [t.companyId, t.branchId, t.category],
      unique: true,
    },
  ],
);
