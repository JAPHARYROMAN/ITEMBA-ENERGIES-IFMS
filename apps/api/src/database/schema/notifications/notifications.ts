import { index, pgTable, text, timestamp, uuid, varchar, jsonb, integer, boolean } from 'drizzle-orm/pg-core';
import { auditColumns } from '../shared';
import { companies } from '../core/companies';
import { branches } from '../core/branches';
import { stations } from '../core/stations';
import { users } from '../auth/users';

export const NOTIFICATION_TYPES = {
  SYSTEM: 'system',
  SHIFT: 'shift',
  SALES: 'sales',
  INVENTORY: 'inventory',
  EXPENSE: 'expense',
  TRANSFER: 'transfer',
  APPROVAL: 'approval',
  SECURITY: 'security',
} as const;

export const NOTIFICATION_SEVERITY = {
  INFO: 'info',
  SUCCESS: 'success',
  WARNING: 'warning',
  CRITICAL: 'critical',
} as const;

export const NOTIFICATION_DELIVERY_STATUS = {
  PENDING: 'pending',
  SENT: 'sent',
  FAILED: 'failed',
} as const;

export const NOTIFICATION_DELIVERY_VIA = {
  INAPP: 'inapp',
  EMAIL: 'email',
  SMS: 'sms',
  PUSH: 'push',
} as const;

export const NOTIFICATION_DIGEST_MODE = {
  NONE: 'none',
  DAILY: 'daily',
  WEEKLY: 'weekly',
} as const;

export const NOTIFICATION_OUTBOX_JOB_TYPE = {
  DELIVER_INAPP: 'deliver_inapp',
  SEND_EMAIL: 'send_email',
  SEND_SMS: 'send_sms',
} as const;

export const notifications = pgTable(
  'notifications',
  {
    ...auditColumns,
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'restrict' }),
    stationId: uuid('station_id').references(() => stations.id, { onDelete: 'restrict' }),
    type: varchar('type', { length: 32 }).notNull(),
    severity: varchar('severity', { length: 16 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    body: text('body'),
    dataJson: jsonb('data_json'),
    actionUrl: varchar('action_url', { length: 512 }),
    dedupeKey: varchar('dedupe_key', { length: 255 }),
    expiresAt: timestamp('expires_at'),
  },
  (t) => [
    index('notifications_company_id_branch_id_created_at_idx').on(t.companyId, t.branchId, t.createdAt.desc()),
    index('notifications_type_created_at_idx').on(t.type, t.createdAt.desc()),
    index('notifications_company_station_branch_idx').on(t.companyId, t.stationId, t.branchId),
    index('notifications_dedupe_key_idx').on(t.dedupeKey),
    index('notifications_expires_at_idx').on(t.expiresAt),
  ],
);

export const notificationDeliveries = pgTable(
  'notification_deliveries',
  {
    ...auditColumns,
    notificationId: uuid('notification_id')
      .notNull()
      .references(() => notifications.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: varchar('status', { length: 16 }).notNull().default('pending'),
    readAt: timestamp('read_at'),
    seenAt: timestamp('seen_at'),
    archivedAt: timestamp('archived_at'),
    deliveredVia: varchar('delivered_via', { length: 16 }).notNull(),
    errorMessage: text('error_message'),
  },
  (t) => [
    index('notification_deliveries_user_id_read_at_created_at_idx').on(t.userId, t.readAt, t.createdAt.desc()),
    index('notification_deliveries_notification_id_idx').on(t.notificationId),
    index('notification_deliveries_status_created_at_idx').on(t.status, t.createdAt.desc()),
    index('notification_deliveries_user_unread_idx').on(t.userId, t.readAt, t.archivedAt),
  ],
);

export const notificationPreferences = pgTable(
  'notification_preferences',
  {
    ...auditColumns,
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' })
      .unique(),
    channelsJson: jsonb('channels_json').notNull().default({ inapp: true, email: false, sms: false, push: false }),
    severityMin: varchar('severity_min', { length: 16 }).notNull().default('info'),
    quietHoursJson: jsonb('quiet_hours_json'),
    digestMode: varchar('digest_mode', { length: 16 }).notNull().default('none'),
  },
  (t) => [
    index('notification_preferences_user_id_idx').on(t.userId),
  ],
);

export const notificationOutbox = pgTable(
  'notification_outbox',
  {
    ...auditColumns,
    notificationId: uuid('notification_id')
      .notNull()
      .references(() => notifications.id, { onDelete: 'cascade' }),
    jobType: varchar('job_type', { length: 32 }).notNull(),
    runAfter: timestamp('run_after').notNull().defaultNow(),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    lockedAt: timestamp('locked_at'),
    lockedBy: varchar('locked_by', { length: 255 }),
  },
  (t) => [
    index('notification_outbox_run_after_locked_at_idx').on(t.runAfter, t.lockedAt),
    index('notification_outbox_job_type_attempts_idx').on(t.jobType, t.attempts),
    index('notification_outbox_notification_id_idx').on(t.notificationId),
  ],
);
