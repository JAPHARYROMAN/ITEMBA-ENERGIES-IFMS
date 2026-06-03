import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('./lib/api/auth', () => ({
  getMe: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
}));

import * as apiAuth from './lib/api/auth';
import {
  useAppStore,
  useAuthStore,
  useReportsStore,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  matchesPermissionRequirement,
} from './store';

// Capture pristine initial states so each test starts clean.
const appInitial = useAppStore.getState();
const authInitial = useAuthStore.getState();
const reportsInitial = useReportsStore.getState();
const mockApiAuth = vi.mocked(apiAuth);

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
  document.documentElement.classList.remove('dark');
  useAppStore.setState(
    {
      ...appInitial,
      sidebarCollapsed: false,
      theme: 'light',
      isSearchOpen: false,
      isAiPanelOpen: false,
      toasts: [],
    },
    true,
  );
  useAuthStore.setState(authInitial, true);
  useReportsStore.setState(reportsInitial, true);
});

describe('useAppStore — sidebar', () => {
  test('toggleSidebar flips value and persists to localStorage', () => {
    expect(useAppStore.getState().sidebarCollapsed).toBe(false);

    useAppStore.getState().toggleSidebar();
    expect(useAppStore.getState().sidebarCollapsed).toBe(true);
    expect(localStorage.getItem('sidebar-collapsed')).toBe('true');

    useAppStore.getState().toggleSidebar();
    expect(useAppStore.getState().sidebarCollapsed).toBe(false);
    expect(localStorage.getItem('sidebar-collapsed')).toBe('false');
  });
});

describe('useAppStore — theme', () => {
  test('setTheme("dark") adds dark class and persists', () => {
    useAppStore.getState().setTheme('dark');
    expect(useAppStore.getState().theme).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('theme')).toBe('dark');
  });

  test('setTheme("light") removes dark class and persists', () => {
    useAppStore.getState().setTheme('dark');
    useAppStore.getState().setTheme('light');
    expect(useAppStore.getState().theme).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(localStorage.getItem('theme')).toBe('light');
  });
});

describe('useAppStore — search & AI panel', () => {
  test('setSearchOpen sets the flag', () => {
    useAppStore.getState().setSearchOpen(true);
    expect(useAppStore.getState().isSearchOpen).toBe(true);
    useAppStore.getState().setSearchOpen(false);
    expect(useAppStore.getState().isSearchOpen).toBe(false);
  });

  test('setAiPanelOpen and toggleAiPanel', () => {
    useAppStore.getState().setAiPanelOpen(true);
    expect(useAppStore.getState().isAiPanelOpen).toBe(true);
    useAppStore.getState().toggleAiPanel();
    expect(useAppStore.getState().isAiPanelOpen).toBe(false);
    useAppStore.getState().toggleAiPanel();
    expect(useAppStore.getState().isAiPanelOpen).toBe(true);
  });
});

describe('useAppStore — toasts', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test('addToast appends a toast with defaults', () => {
    useAppStore.getState().addToast('Saved');
    const toasts = useAppStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].message).toBe('Saved');
    expect(toasts[0].type).toBe('info');
    expect(toasts[0].id).toBeTruthy();
  });

  test('addToast stores type and action metadata', () => {
    useAppStore
      .getState()
      .addToast('Done', 'success', { label: 'View', href: '/x' });
    const toast = useAppStore.getState().toasts[0];
    expect(toast.type).toBe('success');
    expect(toast.actionLabel).toBe('View');
    expect(toast.actionHref).toBe('/x');
  });

  test('removeToast removes only the matching toast', () => {
    useAppStore.getState().addToast('A');
    useAppStore.getState().addToast('B');
    const [first] = useAppStore.getState().toasts;
    useAppStore.getState().removeToast(first.id);
    const remaining = useAppStore.getState().toasts;
    expect(remaining).toHaveLength(1);
    expect(remaining[0].message).toBe('B');
  });

  test('addToast auto-removes after 3s', () => {
    vi.useFakeTimers();
    useAppStore.getState().addToast('Ephemeral');
    expect(useAppStore.getState().toasts).toHaveLength(1);

    vi.advanceTimersByTime(2999);
    expect(useAppStore.getState().toasts).toHaveLength(1);

    vi.advanceTimersByTime(1);
    expect(useAppStore.getState().toasts).toHaveLength(0);
  });

  test('multiple toasts auto-remove independently', () => {
    vi.useFakeTimers();
    useAppStore.getState().addToast('first');
    vi.advanceTimersByTime(1000);
    useAppStore.getState().addToast('second');

    expect(useAppStore.getState().toasts).toHaveLength(2);

    vi.advanceTimersByTime(2000); // first hits 3s
    expect(useAppStore.getState().toasts.map((t) => t.message)).toEqual([
      'second',
    ]);

    vi.advanceTimersByTime(1000); // second hits 3s
    expect(useAppStore.getState().toasts).toHaveLength(0);
  });
});

describe('useReportsStore — filters', () => {
  test('default date range is the current month', () => {
    const { dateRange } = useReportsStore.getState();
    const now = new Date();
    const expectedFrom = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .slice(0, 10);
    const expectedTo = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      .toISOString()
      .slice(0, 10);
    expect(dateRange.from).toBe(expectedFrom);
    expect(dateRange.to).toBe(expectedTo);
    expect(useReportsStore.getState().stationId).toBeNull();
    expect(useReportsStore.getState().productId).toBeNull();
  });

  test('setFilters merges partial updates without clobbering others', () => {
    useReportsStore.getState().setFilters({ stationId: 'st-1' });
    expect(useReportsStore.getState().stationId).toBe('st-1');
    expect(useReportsStore.getState().productId).toBeNull();

    useReportsStore.getState().setFilters({ productId: 'p-9' });
    expect(useReportsStore.getState().stationId).toBe('st-1');
    expect(useReportsStore.getState().productId).toBe('p-9');

    const newRange = { from: '2026-01-01', to: '2026-01-31' };
    useReportsStore.getState().setFilters({ dateRange: newRange });
    expect(useReportsStore.getState().dateRange).toEqual(newRange);
    expect(useReportsStore.getState().stationId).toBe('st-1');
  });
});

describe('permission helpers', () => {
  const user = { permissions: ['sales:read', 'sales:pos', 'reports:read'] };

  test('hasPermission checks membership', () => {
    expect(hasPermission(user, 'sales:read')).toBe(true);
    expect(hasPermission(user, 'sales:void')).toBe(false);
  });

  test('hasPermission is false for null / undefined / no-permissions user', () => {
    expect(hasPermission(null, 'sales:read')).toBe(false);
    expect(hasPermission(undefined, 'sales:read')).toBe(false);
    expect(hasPermission({ permissions: undefined }, 'sales:read')).toBe(false);
  });

  test('hasAnyPermission returns true when at least one matches', () => {
    expect(hasAnyPermission(user, ['sales:void', 'sales:pos'])).toBe(true);
    expect(hasAnyPermission(user, ['sales:void', 'audit:read'])).toBe(false);
  });

  test('hasAnyPermission returns true when requirement is empty/undefined', () => {
    expect(hasAnyPermission(user, [])).toBe(true);
    expect(hasAnyPermission(user, undefined)).toBe(true);
    expect(hasAnyPermission(null, [])).toBe(true);
  });

  test('hasAllPermissions requires every permission', () => {
    expect(hasAllPermissions(user, ['sales:read', 'sales:pos'])).toBe(true);
    expect(hasAllPermissions(user, ['sales:read', 'sales:void'])).toBe(false);
  });

  test('hasAllPermissions returns true when requirement is empty/undefined', () => {
    expect(hasAllPermissions(user, [])).toBe(true);
    expect(hasAllPermissions(user, undefined)).toBe(true);
  });

  test('matchesPermissionRequirement defaults to "any"', () => {
    expect(matchesPermissionRequirement(user, ['sales:void', 'sales:pos'])).toBe(
      true,
    );
  });

  test('matchesPermissionRequirement honours "all"', () => {
    expect(
      matchesPermissionRequirement(user, ['sales:read', 'sales:void'], 'all'),
    ).toBe(false);
    expect(
      matchesPermissionRequirement(user, ['sales:read', 'sales:pos'], 'all'),
    ).toBe(true);
  });
});

describe('useAuthStore', () => {
  test('hydrateAuth exits early when auth is already ready', async () => {
    await useAuthStore.getState().hydrateAuth();
    expect(mockApiAuth.getMe).not.toHaveBeenCalled();
    expect(useAuthStore.getState().isAuthReady).toBe(true);
  });

  test('hydrateAuth marks ready when no access token is available', async () => {
    useAuthStore.setState({ ...authInitial, isAuthReady: false }, true);

    await useAuthStore.getState().hydrateAuth();

    expect(mockApiAuth.getMe).not.toHaveBeenCalled();
    expect(useAuthStore.getState()).toMatchObject({
      user: null,
      isAuthenticated: false,
      isAuthReady: true,
    });
  });

  test('hydrateAuth maps manager users from permissions', async () => {
    sessionStorage.setItem('ifms_access_token', 'access-1');
    useAuthStore.setState({ ...authInitial, isAuthReady: false }, true);
    mockApiAuth.getMe.mockResolvedValue({
      id: 'u1',
      email: 'manager@ifms.local',
      name: 'Manager',
      status: 'active',
      permissions: ['setup:write', 'setup:write', 'reports:read'],
    });

    await useAuthStore.getState().hydrateAuth();

    expect(useAuthStore.getState().user).toEqual({
      id: 'u1',
      email: 'manager@ifms.local',
      name: 'Manager',
      role: 'manager',
      permissions: ['setup:write', 'reports:read'],
    });
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  test('hydrateAuth maps auditor users and clears tokens on failure', async () => {
    sessionStorage.setItem('ifms_access_token', 'access-2');
    useAuthStore.setState({ ...authInitial, isAuthReady: false }, true);
    mockApiAuth.getMe.mockResolvedValueOnce({
      id: 'u2',
      email: 'auditor@ifms.local',
      name: 'Auditor',
      status: 'active',
      permissions: ['expenses:read'],
    });

    await useAuthStore.getState().hydrateAuth();
    expect(useAuthStore.getState().user?.role).toBe('auditor');

    sessionStorage.setItem('ifms_access_token', 'access-3');
    sessionStorage.setItem('ifms_refresh_token', 'refresh-3');
    useAuthStore.setState({ ...authInitial, isAuthReady: false }, true);
    mockApiAuth.getMe.mockRejectedValueOnce(new Error('expired'));

    await useAuthStore.getState().hydrateAuth();

    expect(sessionStorage.getItem('ifms_access_token')).toBeNull();
    expect(sessionStorage.getItem('ifms_refresh_token')).toBeNull();
    expect(useAuthStore.getState()).toMatchObject({
      user: null,
      isAuthenticated: false,
      isAuthReady: true,
    });
  });

  test('loginWithCredentials stores tokens and maps cashier fallback role', async () => {
    mockApiAuth.login.mockResolvedValue({
      accessToken: 'access-login',
      refreshToken: 'refresh-login',
      expiresIn: 3600,
    });
    mockApiAuth.getMe.mockResolvedValue({
      id: 'u3',
      email: 'cashier@ifms.local',
      name: 'Cashier',
      status: 'active',
      permissions: ['sales:pos'],
    });

    await useAuthStore.getState().loginWithCredentials?.('cashier@ifms.local', 'secret');

    expect(mockApiAuth.login).toHaveBeenCalledWith('cashier@ifms.local', 'secret');
    expect(sessionStorage.getItem('ifms_access_token')).toBe('access-login');
    expect(sessionStorage.getItem('ifms_refresh_token')).toBe('refresh-login');
    expect(useAuthStore.getState().user?.role).toBe('cashier');
  });

  test('logout calls API when refresh token exists and always clears local auth state', async () => {
    sessionStorage.setItem('ifms_access_token', 'access');
    sessionStorage.setItem('ifms_refresh_token', 'refresh');
    useAuthStore.setState(
      {
        ...authInitial,
        user: {
          id: 'u1',
          name: 'Manager',
          email: 'manager@ifms.local',
          role: 'manager',
          permissions: ['setup:write'],
        },
        isAuthenticated: true,
      },
      true,
    );
    mockApiAuth.logout.mockRejectedValueOnce(new Error('network'));

    useAuthStore.getState().logout();
    await Promise.resolve();

    expect(mockApiAuth.logout).toHaveBeenCalledWith('refresh');
    expect(sessionStorage.getItem('ifms_access_token')).toBeNull();
    expect(useAuthStore.getState()).toMatchObject({
      user: null,
      isAuthenticated: false,
      isAuthReady: true,
    });
  });
});
