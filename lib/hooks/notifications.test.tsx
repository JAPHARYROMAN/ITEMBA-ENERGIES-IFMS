import { describe, test, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  useNotifications,
  useUnreadCount,
  useNotificationPreferences,
  useMarkSeen,
  useMarkRead,
  useArchive,
  useMarkAllRead,
  useOptimisticMarkRead,
  useOptimisticArchive,
  type NotificationListResponse,
  type NotificationPreferences,
} from './notifications';

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}));

import { apiClient } from '@/lib/api/client';
const getMock = vi.mocked(apiClient.get);
const postMock = vi.mocked(apiClient.post);
const patchMock = vi.mocked(apiClient.patch);

let queryClient: QueryClient;

function makeWrapper() {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useNotifications', () => {
  test('serialises filters into the query string', async () => {
    const resp: NotificationListResponse = { deliveries: [], total: 0 };
    getMock.mockResolvedValue(resp);

    const { result } = renderHook(
      () => useNotifications({ unread: true, severity: 'critical', page: 2 }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const url = getMock.mock.calls[0][0] as string;
    expect(url).toContain('/notifications?');
    expect(url).toContain('unread=true');
    expect(url).toContain('severity=critical');
    expect(url).toContain('page=2');
    expect(result.current.data).toEqual(resp);
  });

  test('omits undefined filter values', async () => {
    getMock.mockResolvedValue({ deliveries: [], total: 0 });
    const { result } = renderHook(
      () => useNotifications({ status: 'sent', type: undefined }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const url = getMock.mock.calls[0][0] as string;
    expect(url).toContain('status=sent');
    expect(url).not.toContain('type=');
  });

  test('omits null filter values while preserving false booleans', async () => {
    getMock.mockResolvedValue({ deliveries: [], total: 0 });
    const { result } = renderHook(
      () => useNotifications({ unread: false, dateFrom: null } as Parameters<typeof useNotifications>[0]),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const url = getMock.mock.calls[0][0] as string;
    expect(url).toContain('unread=false');
    expect(url).not.toContain('dateFrom=');
  });
});

describe('useUnreadCount', () => {
  test('unwraps the count from the response envelope', async () => {
    getMock.mockResolvedValue({ count: 7 });
    const { result } = renderHook(() => useUnreadCount(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getMock).toHaveBeenCalledWith('/notifications/unread-count');
    expect(result.current.data).toBe(7);
  });
});

describe('useNotificationPreferences', () => {
  const prefs: NotificationPreferences = {
    channels: { inapp: true, email: false, sms: false, push: false },
    severityMin: 'info',
    digestMode: 'none',
  };

  test('loads preferences', async () => {
    getMock.mockResolvedValue(prefs);
    const { result } = renderHook(() => useNotificationPreferences(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.preferences).toEqual(prefs));
    expect(getMock).toHaveBeenCalledWith('/notifications/preferences');
  });

  test('updatePreferences PATCHes and writes the result into the cache', async () => {
    getMock.mockResolvedValue(prefs);
    const updated: NotificationPreferences = { ...prefs, digestMode: 'daily' };
    patchMock.mockResolvedValue(updated);

    const { result } = renderHook(() => useNotificationPreferences(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.preferences).toEqual(prefs));

    act(() => result.current.updatePreferences({ digestMode: 'daily' }));

    await waitFor(() => expect(result.current.preferences).toEqual(updated));
    expect(patchMock).toHaveBeenCalledWith('/notifications/preferences', { digestMode: 'daily' });
  });
});

describe('mutation hooks invalidate notification queries', () => {
  test('useMarkSeen posts to the seen endpoint', async () => {
    postMock.mockResolvedValue(undefined);
    const { result } = renderHook(() => useMarkSeen(), { wrapper: makeWrapper() });

    act(() => result.current.mutate('d-seen'));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(postMock).toHaveBeenCalledWith('/notifications/d-seen/seen');
  });

  test('useMarkRead posts to the read endpoint and invalidates on success', async () => {
    postMock.mockResolvedValue(undefined);
    const wrapper = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useMarkRead(), { wrapper });
    act(() => result.current.mutate('d1'));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(postMock).toHaveBeenCalledWith('/notifications/d1/read');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['notifications'] });
  });

  test('useArchive posts to the archive endpoint and invalidates unread count', async () => {
    postMock.mockResolvedValue(undefined);
    const wrapper = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useArchive(), { wrapper });
    act(() => result.current.mutate('d-archive'));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(postMock).toHaveBeenCalledWith('/notifications/d-archive/archive');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['notifications', 'unread-count'] });
  });

  test('useMarkAllRead posts to the bulk endpoint', async () => {
    postMock.mockResolvedValue(undefined);
    const { result } = renderHook(() => useMarkAllRead(), { wrapper: makeWrapper() });

    act(() => result.current.mutate());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(postMock).toHaveBeenCalledWith('/notifications/mark-all-read');
  });
});

describe('useOptimisticMarkRead', () => {
  test('marks the matching delivery as read and leaves other deliveries unchanged', async () => {
    postMock.mockResolvedValue(undefined);
    const wrapper = makeWrapper();
    const { result } = renderHook(() => useOptimisticMarkRead(), { wrapper });

    const seed: NotificationListResponse = {
      total: 2,
      deliveries: [
        { id: 'd1' } as NotificationListResponse['deliveries'][number],
        { id: 'd2', readAt: 'already-read' } as NotificationListResponse['deliveries'][number],
      ],
    };
    act(() => {
      queryClient.setQueryData(['notifications'], seed);
    });

    act(() => result.current.markReadOptimistic('d1'));

    const after = queryClient.getQueryData<NotificationListResponse>(['notifications']);
    expect(after?.deliveries[0].readAt).toEqual(expect.any(String));
    expect(after?.deliveries[1].readAt).toBe('already-read');

    await waitFor(() => expect(postMock).toHaveBeenCalledWith('/notifications/d1/read'));
  });

  test('keeps an empty cache entry unchanged', async () => {
    postMock.mockResolvedValue(undefined);
    const wrapper = makeWrapper();
    const { result } = renderHook(() => useOptimisticMarkRead(), { wrapper });
    act(() => {
      queryClient.setQueryData(['notifications'], { total: 0 } as NotificationListResponse);
    });

    act(() => result.current.markReadOptimistic('missing'));

    expect(queryClient.getQueryData(['notifications'])).toEqual({ total: 0 });
    await waitFor(() => expect(postMock).toHaveBeenCalledWith('/notifications/missing/read'));
  });
});

describe('useOptimisticArchive', () => {
  test('optimistically removes the delivery from the cached list before the API resolves', async () => {
    postMock.mockResolvedValue(undefined);
    const wrapper = makeWrapper();
    const { result } = renderHook(() => useOptimisticArchive(), { wrapper });

    // Seed the cache with two deliveries.
    const seed: NotificationListResponse = {
      total: 2,
      deliveries: [
        { id: 'd1' } as NotificationListResponse['deliveries'][number],
        { id: 'd2' } as NotificationListResponse['deliveries'][number],
      ],
    };
    act(() => {
      queryClient.setQueryData(['notifications'], seed);
    });

    act(() => result.current.archiveOptimistic('d1'));

    const after = queryClient.getQueryData<NotificationListResponse>(['notifications']);
    expect(after?.deliveries.map((d) => d.id)).toEqual(['d2']);

    await waitFor(() => expect(postMock).toHaveBeenCalledWith('/notifications/d1/archive'));
  });

  test('leaves an empty cache entry unchanged', async () => {
    postMock.mockResolvedValue(undefined);
    const wrapper = makeWrapper();
    const { result } = renderHook(() => useOptimisticArchive(), { wrapper });
    act(() => {
      queryClient.setQueryData(['notifications'], { total: 0 } as NotificationListResponse);
    });

    act(() => result.current.archiveOptimistic('missing'));

    expect(queryClient.getQueryData(['notifications'])).toEqual({ total: 0 });
    await waitFor(() => expect(postMock).toHaveBeenCalledWith('/notifications/missing/archive'));
  });
});
