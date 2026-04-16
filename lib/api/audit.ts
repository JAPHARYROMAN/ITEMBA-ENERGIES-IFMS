import { apiFetch } from "./client";

export interface AuditLogEntry {
  id: string;
  entity: string;
  entityId: string;
  action: string;
  beforeJson: Record<string, unknown> | null;
  afterJson: Record<string, unknown> | null;
  actorUserId: string | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface AuditLogResponse {
  data: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
}

export async function fetchAuditLogs(params: {
  page?: number;
  pageSize?: number;
  entity?: string;
  action?: string;
  actorUserId?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<AuditLogResponse> {
  const qs = new URLSearchParams();
  if (params.page) qs.set("page", String(params.page));
  if (params.pageSize) qs.set("pageSize", String(params.pageSize));
  if (params.entity) qs.set("entity", params.entity);
  if (params.action) qs.set("action", params.action);
  if (params.actorUserId) qs.set("actorUserId", params.actorUserId);
  if (params.dateFrom) qs.set("dateFrom", params.dateFrom);
  if (params.dateTo) qs.set("dateTo", params.dateTo);
  return apiFetch<AuditLogResponse>(`audit/logs?${qs.toString()}`);
}
