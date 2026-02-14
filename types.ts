
import React from 'react';

export type Role = 'manager' | 'cashier' | 'auditor';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatar?: string;
}

export interface FinancialMetric {
  label: string;
  value: string;
  change: number;
  trend: 'up' | 'down' | 'neutral';
  color: string;
}

export interface SidebarItem {
  name: string;
  icon: React.ElementType;
  path: string;
  category?: 'Operations' | 'Finance' | 'Reports' | 'Setup' | 'Governance';
  roles?: Role[];
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
  loginWithCredentials?: (email: string, password: string) => Promise<void>;
  logout: () => void;
}
