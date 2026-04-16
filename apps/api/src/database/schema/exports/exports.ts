import { boolean, index, integer, jsonb, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { companies } from '../core/companies';
import { branches } from '../core/branches';
import { users } from '../auth/users';

export const EXPORT_STATUS = {
  QUEUED: 'queued',
  PROCESSING: 'processing',
  READY: 'ready',
  FAILED: 'failed',
} as const;

export const EXPORT_FORMAT = {
  PDF: 'pdf',
  CSV: 'csv',
} as const;

export const EXPORT_SIGNING_STATUS = {
  QUEUED: 'queued',
  SIGNING: 'signing',
  SIGNED: 'signed',
  FAILED: 'failed',
} as const;

export const EXPORT_TSA_STATUS = {
  QUEUED: 'queued',
  STAMPED: 'stamped',
  FAILED: 'failed',
} as const;

export const EXPORT_VERIFICATION_LEVEL = {
  BASIC: 'basic',
  SIGNED: 'signed',
  SIGNED_TIMESTAMPED: 'signed_timestamped',
  LTV: 'ltv',
} as const;

export const EXPORT_PIPELINE_STAGE = {
  GENERATE: 'generate',
  FINALIZE: 'finalize',
  SIGN_PDF: 'sign_pdf',
  TIMESTAMP_PDF: 'timestamp_pdf',
  LTV_EMBED: 'ltv_embed',
  PUBLISH: 'publish',
} as const;

export const exportsTable = pgTable(
  'exports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'restrict' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    exportType: varchar('export_type', { length: 128 }).notNull(),
    format: varchar('format', { length: 8 }).notNull(),
    paramsJson: jsonb('params_json').notNull().default({}),
    fileName: varchar('file_name', { length: 255 }),
    mimeType: varchar('mime_type', { length: 128 }),
    sizeBytes: integer('size_bytes'),
    sha256Hash: varchar('sha256_hash', { length: 128 }),
    verificationToken: varchar('verification_token', { length: 128 }).notNull(),
    status: varchar('status', { length: 16 }).notNull().default(EXPORT_STATUS.QUEUED),
    isSigned: boolean('is_signed').notNull().default(false),
    pdfaLevel: varchar('pdfa_level', { length: 32 }),
    signatureProfile: varchar('signature_profile', { length: 64 }),
    signingStatus: varchar('signing_status', { length: 16 }).notNull().default(EXPORT_SIGNING_STATUS.QUEUED),
    signedAt: timestamp('signed_at', { withTimezone: true }),
    signedByUserId: uuid('signed_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    tsaStatus: varchar('tsa_status', { length: 16 }).notNull().default(EXPORT_TSA_STATUS.QUEUED),
    tsaProvider: varchar('tsa_provider', { length: 255 }),
    verificationLevel: varchar('verification_level', { length: 32 })
      .notNull()
      .default(EXPORT_VERIFICATION_LEVEL.BASIC),
    legalHold: boolean('legal_hold').notNull().default(false),
    legalHoldReason: text('legal_hold_reason'),
    retentionUntil: timestamp('retention_until', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
  },
  (t) => [
    index('exports_company_branch_created_idx').on(t.companyId, t.branchId, t.createdAt.desc()),
    index('exports_user_created_idx').on(t.userId, t.createdAt.desc()),
    index('exports_status_created_idx').on(t.status, t.createdAt.desc()),
    index('exports_verification_token_idx').on(t.verificationToken),
    index('exports_expires_at_idx').on(t.expiresAt),
    index('exports_signing_status_idx').on(t.signingStatus, t.createdAt.desc()),
    index('exports_verification_level_idx').on(t.verificationLevel, t.createdAt.desc()),
    index('exports_retention_until_idx').on(t.retentionUntil),
  ],
);

export const exportOutbox = pgTable(
  'export_outbox',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    exportId: uuid('export_id')
      .notNull()
      .references(() => exportsTable.id, { onDelete: 'cascade' }),
    runAfter: timestamp('run_after', { withTimezone: true }).notNull().defaultNow(),
    stage: varchar('stage', { length: 32 }).notNull().default(EXPORT_PIPELINE_STAGE.GENERATE),
    attempts: integer('attempts').notNull().default(0),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    lockedBy: varchar('locked_by', { length: 255 }),
    lastError: text('last_error'),
    artifactPath: varchar('artifact_path', { length: 512 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('export_outbox_run_after_locked_idx').on(t.runAfter, t.lockedAt),
    index('export_outbox_export_id_idx').on(t.exportId),
    index('export_outbox_stage_run_after_idx').on(t.stage, t.runAfter),
  ],
);

export const exportSignatures = pgTable(
  'export_signatures',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    exportId: uuid('export_id')
      .notNull()
      .references(() => exportsTable.id, { onDelete: 'cascade' }),
    signerSubject: varchar('signer_subject', { length: 255 }).notNull(),
    certFingerprintSha256: varchar('cert_fingerprint_sha256', { length: 128 }).notNull(),
    certChainPem: text('cert_chain_pem').notNull(),
    signatureBytesBase64: text('signature_bytes_base64'),
    signatureRef: varchar('signature_ref', { length: 512 }),
    timestampTokenBase64: text('timestamp_token_base64'),
    timestampedAt: timestamp('timestamped_at', { withTimezone: true }),
    ocspResponsesBase64: text('ocsp_responses_base64'),
    crlDataBase64: text('crl_data_base64'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('export_signatures_export_id_idx').on(t.exportId),
    index('export_signatures_cert_fingerprint_idx').on(t.certFingerprintSha256),
  ],
);

export const exportAuditEvents = pgTable(
  'export_audit_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    exportId: uuid('export_id')
      .notNull()
      .references(() => exportsTable.id, { onDelete: 'cascade' }),
    eventType: varchar('event_type', { length: 64 }).notNull(),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    ip: varchar('ip', { length: 64 }),
    userAgent: varchar('user_agent', { length: 1024 }),
    payloadJson: jsonb('payload_json').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('export_audit_events_export_id_created_idx').on(t.exportId, t.createdAt.desc()),
    index('export_audit_events_event_type_idx').on(t.eventType),
  ],
);

export const exportRetentionPolicies = pgTable(
  'export_retention_policies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    exportType: varchar('export_type', { length: 128 }).notNull(),
    retentionDays: integer('retention_days').notNull().default(2555),
    legalHoldAllowed: boolean('legal_hold_allowed').notNull().default(true),
    purgeEnabled: boolean('purge_enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('export_retention_policies_export_type_idx').on(t.exportType),
  ],
);
