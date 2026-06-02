export const REPORT_EXPORT_TYPES = [
  'reports.overview',
  'reports.daily-operations',
  'reports.stock-loss',
  'reports.profitability',
  'reports.credit-cashflow',
  'reports.station-comparison',
] as const;

export const EXPORT_TYPES = [...REPORT_EXPORT_TYPES, 'tables.any'] as const;
export type ExportType = (typeof EXPORT_TYPES)[number];

export type ExportFormat = 'pdf' | 'csv';

export type ExportVerificationLevel = 'basic' | 'signed' | 'signed_timestamped' | 'ltv';
export type ExportSigningStatus = 'queued' | 'signing' | 'signed' | 'failed';
export type ExportTsaStatus = 'queued' | 'stamped' | 'failed';
export type ExportPipelineStage = 'generate' | 'finalize' | 'sign_pdf' | 'timestamp_pdf' | 'ltv_embed' | 'publish';

export interface ExportScope {
  userId: string;
  permissions: string[];
  companyId?: string;
  branchId?: string;
  companyIds: string[];
  branchIds: string[];
}

export interface ExportAuditContext {
  actorUserId?: string;
  ip?: string;
  userAgent?: string;
}

export interface TableAnyPayload {
  title?: string;
  columns?: Array<{ header: string; accessorKey: string }>;
  rows?: Array<Record<string, unknown>>;
  sort?: { by?: string; direction?: 'asc' | 'desc' };
}

export interface ExportRenderInput {
  exportId: string;
  exportType: ExportType;
  format: ExportFormat;
  params: Record<string, unknown>;
  generatedAtIso: string;
  generatedAtTz: string;
  verificationToken: string;
  scopeLabel: string;
}

export interface ExportSignatureSummary {
  signer: string | null;
  certFingerprint: string | null;
  signedAt: Date | null;
  timestampedAt: Date | null;
  tsaProvider: string | null;
}
