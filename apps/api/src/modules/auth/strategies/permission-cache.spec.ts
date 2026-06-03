import {
  getCachedPermission,
  invalidatePermissionCache,
  setCachedPermission,
} from './permission-cache';

const payloadFor = (id: string) => ({
  sub: id,
  email: `${id}@ifms.test`,
  permissions: [`permission:${id}`],
});

describe('permission-cache', () => {
  beforeEach(() => {
    invalidatePermissionCache();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    invalidatePermissionCache();
    jest.useRealTimers();
  });

  it('returns cached permissions until the TTL expires', () => {
    const payload = payloadFor('user-1');
    setCachedPermission('user-1', payload);

    expect(getCachedPermission('user-1')).toEqual(payload);

    jest.advanceTimersByTime(30_001);
    expect(getCachedPermission('user-1')).toBeNull();
  });

  it('invalidates one user or the whole cache', () => {
    setCachedPermission('user-1', payloadFor('user-1'));
    setCachedPermission('user-2', payloadFor('user-2'));

    invalidatePermissionCache('user-1');
    expect(getCachedPermission('user-1')).toBeNull();
    expect(getCachedPermission('user-2')).toEqual(payloadFor('user-2'));

    invalidatePermissionCache();
    expect(getCachedPermission('user-2')).toBeNull();
  });

  it('evicts the oldest entry when the cache reaches max size', () => {
    for (let i = 0; i < 500; i += 1) {
      setCachedPermission(`user-${i}`, payloadFor(`user-${i}`));
    }

    setCachedPermission('user-500', payloadFor('user-500'));

    expect(getCachedPermission('user-0')).toBeNull();
    expect(getCachedPermission('user-1')).toEqual(payloadFor('user-1'));
    expect(getCachedPermission('user-500')).toEqual(payloadFor('user-500'));
  });
});
