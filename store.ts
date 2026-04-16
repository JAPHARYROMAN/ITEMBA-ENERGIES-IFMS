import { create } from 'zustand';
import { AppState, AuthState, PermissionMatch, User } from './types';
import { setTokens, clearTokens, getRefreshToken, getAccessToken } from './lib/api/auth-token';
import * as apiAuth from './lib/api/auth';

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
  actionLabel?: string;
  actionHref?: string;
}

interface UIState {
  isSearchOpen: boolean;
  isAiPanelOpen: boolean;
  toasts: Toast[];
  setSearchOpen: (open: boolean) => void;
  setAiPanelOpen: (open: boolean) => void;
  toggleAiPanel: () => void;
  addToast: (
    message: string,
    type?: Toast['type'],
    action?: { label: string; href: string },
  ) => void;
  removeToast: (id: string) => void;
}

interface ReportsFilterState {
  dateRange: { from: string; to: string };
  stationId: string | null;
  productId: string | null;
  setFilters: (filters: Partial<ReportsFilterState>) => void;
}

export const useAppStore = create<AppState & UIState>((set) => ({
  sidebarCollapsed: localStorage.getItem('sidebar-collapsed') === 'true',
  theme: (localStorage.getItem('theme') as 'light' | 'dark') || 'light',
  isSearchOpen: false,
  isAiPanelOpen: false,
  toasts: [],

  toggleSidebar: () =>
    set((state) => {
      const newVal = !state.sidebarCollapsed;
      localStorage.setItem('sidebar-collapsed', String(newVal));
      return { sidebarCollapsed: newVal };
    }),

  setTheme: (theme) =>
    set(() => {
      localStorage.setItem('theme', theme);
      if (theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      return { theme };
    }),

  setSearchOpen: (open) => set({ isSearchOpen: open }),

  setAiPanelOpen: (open) => set({ isAiPanelOpen: open }),

  toggleAiPanel: () => set((state) => ({ isAiPanelOpen: !state.isAiPanelOpen })),

  addToast: (message, type = 'info', action) => {
    const id = Math.random().toString(36).substr(2, 9);
    set((state) => ({
      toasts: [
        ...state.toasts,
        {
          id,
          message,
          type,
          actionLabel: action?.label,
          actionHref: action?.href,
        },
      ],
    }));
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, 3000);
  },

  removeToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

function getCurrentMonthRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  return { from, to };
}

export const useReportsStore = create<ReportsFilterState>((set) => ({
  dateRange: getCurrentMonthRange(),
  stationId: null,
  productId: null,
  setFilters: (filters) => set((state) => ({ ...state, ...filters })),
}));

type PermissionAwareUser = Pick<User, 'permissions'> | null | undefined;

export function hasPermission(user: PermissionAwareUser, permission: string): boolean {
  return Boolean(user?.permissions?.includes(permission));
}

export function hasAnyPermission(
  user: PermissionAwareUser,
  permissions: string[] | undefined,
): boolean {
  if (!permissions?.length) return true;
  return permissions.some((permission) => hasPermission(user, permission));
}

export function hasAllPermissions(
  user: PermissionAwareUser,
  permissions: string[] | undefined,
): boolean {
  if (!permissions?.length) return true;
  return permissions.every((permission) => hasPermission(user, permission));
}

export function matchesPermissionRequirement(
  user: PermissionAwareUser,
  permissions: string[] | undefined,
  match: PermissionMatch = 'any',
): boolean {
  return match === 'all'
    ? hasAllPermissions(user, permissions)
    : hasAnyPermission(user, permissions);
}

function meToUser(me: { id: string; email: string; name: string; permissions?: string[] }): User {
  const permissions = [...new Set(me.permissions ?? [])];
  const permUser = { permissions };
  const isManager = hasAnyPermission(permUser, ['setup:write', 'sales:void', 'reports:refresh']);
  const isAuditor =
    hasPermission(permUser, 'audit:read') ||
    (hasPermission(permUser, 'expenses:read') && !hasPermission(permUser, 'expenses:write'));
  const role: User['role'] = isManager ? 'manager' : isAuditor ? 'auditor' : 'cashier';
  return { id: me.id, name: me.name, email: me.email, role, permissions };
}

function getInitialAuth() {
  const hasAccessToken = Boolean(getAccessToken());
  return {
    user: null as User | null,
    isAuthenticated: false,
    isAuthReady: !hasAccessToken,
  };
}

export const useAuthStore = create<AuthState>((set, get) => {
  const initial = getInitialAuth();
  return {
    user: initial.user,
    isAuthenticated: initial.isAuthenticated,
    isAuthReady: initial.isAuthReady,
    hydrateAuth: async () => {
      if (get().isAuthReady) return;
      if (!getAccessToken()) {
        set({ user: null, isAuthenticated: false, isAuthReady: true });
        return;
      }
      try {
        const me = await apiAuth.getMe();
        const user = meToUser(me);
        set({ user, isAuthenticated: true, isAuthReady: true });
      } catch {
        clearTokens();
        set({ user: null, isAuthenticated: false, isAuthReady: true });
      }
    },
    loginWithCredentials: async (email: string, password: string) => {
      const tokens = await apiAuth.login(email, password);
      setTokens(tokens.accessToken, tokens.refreshToken);
      const me = await apiAuth.getMe();
      const user = meToUser(me);
      set({ user, isAuthenticated: true, isAuthReady: true });
    },
    logout: () => {
      const refresh = getRefreshToken();
      if (refresh) {
        apiAuth.logout(refresh).catch(() => {});
      }
      clearTokens();
      set({ user: null, isAuthenticated: false, isAuthReady: true });
    },
  };
});
