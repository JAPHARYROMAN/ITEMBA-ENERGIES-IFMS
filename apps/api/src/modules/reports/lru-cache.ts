export interface LruEntry<T> {
  value: T;
  expiresAt: number;
}

export class LruTtlCache<T> {
  private readonly store = new Map<string, LruEntry<T>>();

  constructor(private readonly maxEntries: number) {}

  get(key: string, now: number): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= now) {
      this.store.delete(key);
      return null;
    }
    // Promote to most-recently-used.
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T, ttlMs: number, now: number): void {
    if (this.store.has(key)) {
      this.store.delete(key);
    }
    this.store.set(key, { value, expiresAt: now + ttlMs });
    this.trim();
  }

  private trim(): void {
    while (this.store.size > this.maxEntries) {
      const oldestKey = this.store.keys().next().value as string | undefined;
      if (!oldestKey) break;
      this.store.delete(oldestKey);
    }
  }
}
