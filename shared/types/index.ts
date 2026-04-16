/**
 * Shared types between the frontend and the NestJS API.
 *
 * Only plain TypeScript interfaces and type aliases belong here.
 * Do NOT add class-validator decorators, React imports, or runtime code.
 */

// ─── Auth & Users ────────────────────────────────────────────────
export type Role = 'manager' | 'cashier' | 'auditor';
export type PermissionMatch = 'any' | 'all';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: Role;
  permissions: string[];
  avatar?: string;
}

// ─── Pagination ──────────────────────────────────────────────────
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PaginationParams {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// ─── Financial ───────────────────────────────────────────────────
export interface FinancialMetric {
  label: string;
  value: string;
  change: number;
  trend: 'up' | 'down' | 'neutral';
  color: string;
}

// ─── Entities ────────────────────────────────────────────────────
export interface BaseEntity {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface Product extends BaseEntity {
  name: string;
  code: string;
  pricePerUnit: number;
  companyId: string;
  status: string;
}

export interface Tank extends BaseEntity {
  name: string;
  code: string;
  capacity: number;
  currentLevel: number;
  productId: string;
  stationId: string;
}

export interface Customer extends BaseEntity {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  taxId?: string;
  creditLimit: number;
}

export interface Delivery extends BaseEntity {
  supplierId: string;
  status: 'pending' | 'in_transit' | 'received' | 'cancelled';
  totalAmount: number;
  items: DeliveryItem[];
}

export interface DeliveryItem {
  productId: string;
  quantity: number;
  unitPrice: number;
}

// ─── Audit ───────────────────────────────────────────────────────
export interface AuditLogEntry extends BaseEntity {
  entity: string;
  entityId: string;
  action: string;
  actorUserId: string;
  ip?: string;
  changes?: Record<string, unknown>;
}

// ─── Exports ─────────────────────────────────────────────────────
export type ExportFormat = 'pdf' | 'csv';
export type ExportStatus = 'queued' | 'processing' | 'ready' | 'failed' | 'expired';

export interface ExportRecord extends BaseEntity {
  type: string;
  format: ExportFormat;
  status: ExportStatus;
  verificationBadge?: string;
  expiresAt?: string;
  fileName?: string;
}

// ─── Governance ──────────────────────────────────────────────────
export type ApprovalStatus = 'draft' | 'pending' | 'approved' | 'rejected';

export interface ApprovalRequest extends BaseEntity {
  entityType: string;
  actionType: string;
  branchId: string;
  requestedBy: string;
  requestedAt: string;
  status: ApprovalStatus;
  steps?: ApprovalStep[];
}

export interface ApprovalStep {
  id: string;
  stepOrder: number;
  requiredPermission?: string;
  status: 'pending' | 'approved' | 'rejected';
  decidedBy?: string;
  decidedAt?: string;
  dueAt?: string;
  isOverdue?: boolean;
}

// ─── Notifications ───────────────────────────────────────────────
export type NotificationSeverity = 'info' | 'success' | 'warning' | 'critical';
export type NotificationType = 'system' | 'approval' | 'alert' | 'report';

export interface Notification {
  id: string;
  title: string;
  body?: string;
  type: NotificationType;
  severity: NotificationSeverity;
  actionUrl?: string;
  read: boolean;
  archived: boolean;
  createdAt: string;
}
