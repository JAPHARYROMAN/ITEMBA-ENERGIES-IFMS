import React from 'react';

// Re-export shared types so existing imports from '@/types' keep working
export type {
  Role,
  PermissionMatch,
  FinancialMetric,
  PaginatedResponse,
  PaginationParams,
  BaseEntity,
  Product,
  Tank,
  Customer,
  Delivery,
  DeliveryItem,
  AuditLogEntry,
  ExportFormat,
  ExportStatus,
  ExportRecord,
  ApprovalStatus,
  ApprovalRequest,
  ApprovalStep,
  NotificationSeverity,
  NotificationType,
  Notification,
} from '@shared/types';

import type { Role, PermissionMatch } from '@shared/types';
import type { UserProfile } from '@shared/types';

// Frontend-specific alias — keeps existing consumer code unchanged
export type User = UserProfile;

// Frontend-only types (depend on React)
export interface SidebarItem {
  name: string;
  icon: React.ElementType;
  path: string;
  category?: 'Operations' | 'Finance' | 'Reports' | 'Setup' | 'Governance';
  roles?: Role[];
  permissions?: string[];
  permissionMatch?: PermissionMatch;
  children?: SidebarItem[];
  badge?: string;
}

export interface AppState {
  sidebarCollapsed: boolean;
  theme: 'light' | 'dark';
  toggleSidebar: () => void;
  setTheme: (theme: 'light' | 'dark') => void;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isAuthReady: boolean;
  hydrateAuth: () => Promise<void>;
  loginWithCredentials?: (email: string, password: string) => Promise<void>;
  logout: () => void;
}
