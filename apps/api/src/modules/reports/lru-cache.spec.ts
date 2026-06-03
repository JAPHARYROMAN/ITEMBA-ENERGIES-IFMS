import { LruTtlCache } from './lru-cache';

describe('LruTtlCache', () => {
  it('returns null for a missing key', () => {
    const cache = new LruTtlCache<number>(10);
    expect(cache.get('missing', 1000)).toBeNull();
  });

  it('stores and retrieves a value before it expires', () => {
    const cache = new LruTtlCache<string>(10);
    cache.set('k', 'v', 1000, 0);
    expect(cache.get('k', 500)).toBe('v');
  });

  it('expires entries at or after expiresAt and evicts them', () => {
    const cache = new LruTtlCache<string>(10);
    cache.set('k', 'v', 1000, 0);
    // expiresAt = 1000; get at exactly 1000 is expired (<=).
    expect(cache.get('k', 1000)).toBeNull();
    // Subsequent get confirms the entry was deleted.
    expect(cache.get('k', 1001)).toBeNull();
  });

  it('overwrites an existing key and refreshes its TTL', () => {
    const cache = new LruTtlCache<number>(10);
    cache.set('k', 1, 1000, 0);
    cache.set('k', 2, 1000, 500);
    expect(cache.get('k', 1200)).toBe(2);
  });

  it('evicts the least-recently-used entry when capacity is exceeded', () => {
    const cache = new LruTtlCache<number>(2);
    cache.set('a', 1, 10_000, 0);
    cache.set('b', 2, 10_000, 0);
    // Access 'a' to promote it to MRU; 'b' becomes the eviction target.
    expect(cache.get('a', 1)).toBe(1);
    cache.set('c', 3, 10_000, 0);
    expect(cache.get('b', 1)).toBeNull();
    expect(cache.get('a', 1)).toBe(1);
    expect(cache.get('c', 1)).toBe(3);
  });

  it('promotes a key on read so it survives later eviction', () => {
    const cache = new LruTtlCache<number>(2);
    cache.set('a', 1, 10_000, 0);
    cache.set('b', 2, 10_000, 0);
    cache.get('a', 1); // promote a
    cache.set('c', 3, 10_000, 0); // evicts b (oldest)
    expect(cache.get('a', 1)).toBe(1);
    expect(cache.get('c', 1)).toBe(3);
    expect(cache.get('b', 1)).toBeNull();
  });
});
