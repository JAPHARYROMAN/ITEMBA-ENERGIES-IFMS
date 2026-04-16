import { frontendEnv } from '../env.client';
import { getAccessToken, normalizeError, apiFetch } from './client';

export type ExportFormat = 'pdf' | 'csv';

export type ExportType =
  | 'reports.overview'
  | 'reports.daily-operations'
  | 'reports.stock-loss'
  | 'reports.profitability'
  | 'reports.credit-cashflow'
  | 'reports.station-comparison'
  | 'tables.any';

export interface ExportRecord {
  id: string;
  companyId: string;
  branchId: string | null;
  userId: string;
  exportType: ExportType;
  format: ExportFormat;
  params: Record<string, unknown>;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  sha256Hash: string | null;
  verificationToken: string;
  status: 'queued' | 'processing' | 'ready' | 'failed';
  verificationLevel?: 'basic' | 'signed' | 'signed_timestamped' | 'ltv';
  isSigned?: boolean;
  pdfaLevel?: string | null;
  signatureProfile?: string | null;
  signingStatus?: 'queued' | 'signing' | 'signed' | 'failed' | null;
  signedAt?: string | null;
  tsaStatus?: 'queued' | 'stamped' | 'failed' | null;
  tsaProvider?: string | null;
  legalHold?: boolean;
  retentionUntil?: string | null;
  createdAt: string;
  completedAt: string | null;
  expiresAt: string | null;
}

export interface CreateExportPayload {
  format: ExportFormat;
  exportType: ExportType;
  params?: Record<string, unknown>;
  clientContext?: {
    requestedFromUrl?: string;
    timezone?: string;
  };
}

const VERIFY_BASE = 'https://www.itembagroup.llc/public/report/verify';

export const apiExports = {
  create: (payload: CreateExportPayload) => apiFetch<ExportRecord>('exports', { method: 'POST', body: payload }),
  list: (limit = 50) => apiFetch<ExportRecord[]>(`exports?limit=${limit}`),
  getById: (exportId: string) => apiFetch<ExportRecord>(`exports/${exportId}`),
  verifyUrl: (verificationToken: string) => `${VERIFY_BASE}?token=${verificationToken}`,
  publicReceiptUrl: (verificationToken: string) => `${VERIFY_BASE}/receipt?token=${verificationToken}`,
  downloadVerificationReceipt: async (record: ExportRecord): Promise<void> => {
    const token = getAccessToken();
    const base = frontendEnv.apiBaseUrl;
    const url = `${base}/api/exports/${record.id}/verification-receipt`;
    const res = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const err = await normalizeError(res, body);
      throw Object.assign(new Error(err.message), { statusCode: err.statusCode, apiError: err });
    }

    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = `${record.id}-verification-receipt.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(href);
  },
  download: async (record: ExportRecord): Promise<void> => {
    const token = getAccessToken();
    const base = frontendEnv.apiBaseUrl;
    const url = `${base}/api/exports/${record.id}/download`;
    const res = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const err = await normalizeError(res, body);
      throw Object.assign(new Error(err.message), { statusCode: err.statusCode, apiError: err });
    }

    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = record.fileName || `${record.id}.${record.format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(href);
  },
};
