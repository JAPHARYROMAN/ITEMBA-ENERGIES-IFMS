import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useRealtimeNotifications } from './useRealtimeNotifications';

// --- socket.io-client mock: io() returns a fake socket with spies. ---
type Handler = (...args: unknown[]) => void;

interface FakeSocket {
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
  emit: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  __handlers: Record<string, Handler[]>;
  __fire: (event: string, ...args: unknown[]) => void;
}

function createFakeSocket(): FakeSocket {
  const handlers: Record<string, Handler[]> = {};
  const socket: FakeSocket = {
    __handlers: handlers,
    on: vi.fn((event: string, cb: Handler) => {
      (handlers[event] ??= []).push(cb);
      return socket;
    }),
    // off() with no args clears everything (mirrors socket.io semantics used in cleanup).
    off: vi.fn((event?: string) => {
      if (event === undefined) {
        Object.keys(handlers).forEach((k) => delete handlers[k]);
      } else {
        delete handlers[event];
      }
      return socket;
    }),
    emit: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    __fire: (event: string, ...args: unknown[]) => {
      (handlers[event] ?? []).forEach((cb) => cb(...args));
    },
  };
  return socket;
}

const ioMock = vi.fn();

vi.mock('socket.io-client', () => ({
  io: (...args: unknown[]) => ioMock(...args),
}));

const getAccessTokenMock = vi.fn();
vi.mock('@/lib/api/auth-token', () => ({
  getAccessToken: () => getAccessTokenMock(),
}));

vi.mock('@/lib/env.client', () => ({
  frontendEnv: { apiBaseUrl: 'http://api.test' },
}));

let fakeSocket: FakeSocket;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  fakeSocket = createFakeSocket();
  ioMock.mockReturnValue(fakeSocket as unknown);
  getAccessTokenMock.mockReturnValue('tok-123');
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useRealtimeNotifications', () => {
  test('connects with bearer token and realtime namespace when a token exists', () => {
    renderHook(() => useRealtimeNotifications());

    expect(ioMock).toHaveBeenCalledTimes(1);
    const [url, opts] = ioMock.mock.calls[0] as [string, { auth: { token: string } }];
    expect(url).toBe('http://api.test/realtime');
    expect(opts.auth.token).toBe('Bearer tok-123');
  });

  test('sets a connection error and does NOT open a socket without a token', () => {
    getAccessTokenMock.mockReturnValue(null);
    const { result } = renderHook(() => useRealtimeNotifications());

    expect(ioMock).not.toHaveBeenCalled();
    expect(result.current.connectionError).toBe('No authentication token available');
    expect(result.current.isConnected).toBe(false);
  });

  test('connect event flips isConnected true and clears error', () => {
    const { result } = renderHook(() => useRealtimeNotifications());
    expect(result.current.isConnected).toBe(false);

    act(() => fakeSocket.__fire('connect'));
    expect(result.current.isConnected).toBe(true);
    expect(result.current.connectionError).toBeNull();
  });

  test('connect_error event surfaces the error message and marks disconnected', () => {
    const { result } = renderHook(() => useRealtimeNotifications());
    act(() => fakeSocket.__fire('connect'));

    act(() => fakeSocket.__fire('connect_error', new Error('handshake failed')));
    expect(result.current.connectionError).toBe('handshake failed');
    expect(result.current.isConnected).toBe(false);
  });

  test('notification:new prepends a realtime-flagged notification', () => {
    const { result } = renderHook(() => useRealtimeNotifications());

    const payloadA = {
      delivery: { id: 'd1', notificationId: 'n1', userId: 'u1', status: 'sent', deliveredVia: 'ws' },
      notification: { id: 'n1', type: 'alert', severity: 'info', title: 'First', createdAt: 'now' },
    };
    const payloadB = {
      delivery: { id: 'd2', notificationId: 'n2', userId: 'u1', status: 'sent', deliveredVia: 'ws' },
      notification: { id: 'n2', type: 'alert', severity: 'warning', title: 'Second', createdAt: 'now' },
    };

    act(() => fakeSocket.__fire('notification:new', payloadA));
    act(() => fakeSocket.__fire('notification:new', payloadB));

    expect(result.current.realtimeNotifications).toHaveLength(2);
    // Newest first.
    expect(result.current.realtimeNotifications[0].id).toBe('d2');
    expect(result.current.realtimeNotifications[0].isRealtime).toBe(true);
    expect(result.current.realtimeNotifications[0].notification.title).toBe('Second');
    expect(result.current.realtimeNotifications[1].id).toBe('d1');
  });

  test('clearRealtimeNotifications empties the buffer', () => {
    const { result } = renderHook(() => useRealtimeNotifications());
    act(() =>
      fakeSocket.__fire('notification:new', {
        delivery: { id: 'd1', notificationId: 'n1', userId: 'u1', status: 'sent', deliveredVia: 'ws' },
        notification: { id: 'n1', type: 'alert', severity: 'info', title: 'X', createdAt: 'now' },
      }),
    );
    expect(result.current.realtimeNotifications).toHaveLength(1);

    act(() => result.current.clearRealtimeNotifications());
    expect(result.current.realtimeNotifications).toHaveLength(0);
  });

  test('server-initiated disconnect schedules a manual reconnect after 1s', () => {
    renderHook(() => useRealtimeNotifications());
    act(() => fakeSocket.__fire('connect'));

    act(() => fakeSocket.__fire('disconnect', 'io server disconnect'));
    expect(fakeSocket.connect).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1000));
    expect(fakeSocket.connect).toHaveBeenCalledTimes(1);
  });

  test('client-initiated disconnect does NOT schedule a reconnect', () => {
    renderHook(() => useRealtimeNotifications());
    act(() => fakeSocket.__fire('connect'));

    act(() => fakeSocket.__fire('disconnect', 'io client disconnect'));
    act(() => vi.advanceTimersByTime(5000));
    expect(fakeSocket.connect).not.toHaveBeenCalled();
  });

  test('unmount removes all listeners and disconnects the socket', () => {
    const { unmount } = renderHook(() => useRealtimeNotifications());
    unmount();

    expect(fakeSocket.off).toHaveBeenCalled();
    expect(fakeSocket.disconnect).toHaveBeenCalled();
  });

  test('an ifms:auth-logout window event disconnects and clears notifications', () => {
    const { result } = renderHook(() => useRealtimeNotifications());
    act(() => fakeSocket.__fire('connect'));
    act(() =>
      fakeSocket.__fire('notification:new', {
        delivery: { id: 'd1', notificationId: 'n1', userId: 'u1', status: 'sent', deliveredVia: 'ws' },
        notification: { id: 'n1', type: 'alert', severity: 'info', title: 'X', createdAt: 'now' },
      }),
    );
    expect(result.current.realtimeNotifications).toHaveLength(1);

    act(() => window.dispatchEvent(new Event('ifms:auth-logout')));

    expect(fakeSocket.disconnect).toHaveBeenCalled();
    expect(result.current.isConnected).toBe(false);
    expect(result.current.realtimeNotifications).toHaveLength(0);
  });
});
