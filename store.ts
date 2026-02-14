import { create } from 'zustand';
import { AppState, AuthState, User } from './types';
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
  toasts: Toast[];
  setSearchOpen: (open: boolean) => void;
  addToast: (message: string, type?: Toast['type'], action?: { label: string; href: string }) => void;
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

export const useReportsStore = create<ReportsFilterState>((set) => ({
  dateRange: { from: '2024-10-01', to: '2024-10-31' },
  stationId: null,
  productId: null,
  setFilters: (filters) => set((state) => ({ ...state, ...filters })),
}));

function meToUser(me: { id: string; email: string; name: string; permissions?: string[] }): User {
  const perms = me.permissions ?? [];
  const isManager = perms.includes('setup:write') || perms.includes('admin:write');
  const isAuditor = perms.includes('expenses:read') && !perms.includes('expenses:write');
  const role: User['role'] = isManager ? 'manager' : isAuditor ? 'auditor' : 'cashier';
  return { id: me.id, name: me.name, email: me.email, role };
}

function getInitialAuth() {
  const stored = localStorage.getItem('auth-user');
  if (!stored) return { user: null as User | null, isAuthenticated: false };
  if (!getAccessToken()) return { user: null, isAuthenticated: false };
  return { user: JSON.parse(stored) as User, isAuthenticated: true };
}

export const useAuthStore = create<AuthState>((set, get) => {
  const initial = getInitialAuth();
  return {
  user: initial.user,
  isAuthenticated: initial.isAuthenticated,
  loginWithCredentials: async (email: string, password: string) => {
    const tokens = await apiAuth.login(email, password);
    setTokens(tokens.accessToken, tokens.refreshToken);
    const me = await apiAuth.getMe();
    const user = meToUser(me);
    localStorage.setItem('auth-user', JSON.stringify(user));
    set({ user, isAuthenticated: true });
  },
  logout: () => {
    const refresh = getRefreshToken();
    if (refresh) {
      apiAuth.logout(refresh).catch(() => {});
    }
    clearTokens();
    localStorage.removeItem('auth-user');
    set({ user: null, isAuthenticated: false });
  },
};});
