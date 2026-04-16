/* ------------------------------------------------------------------ */
/*  Versioned localStorage wrapper with error handling                 */
/* ------------------------------------------------------------------ */

const STORAGE_VERSION_KEY = 'ifms-storage-version';
const CURRENT_STORAGE_VERSION = 1;

/**
 * Safely get a JSON value from localStorage.
 * Returns `null` if the key doesn't exist, the parse fails, or an error occurs.
 */
export function getStorageItem<T = unknown>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Safely set a JSON value to localStorage.
 * Returns `true` on success, `false` on error (e.g. quota exceeded).
 */
export function setStorageItem(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/**
 * Safely remove a key from localStorage.
 */
export function removeStorageItem(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Silently ignore removal errors
  }
}

/**
 * Check the stored schema version. If it differs from CURRENT_STORAGE_VERSION,
 * clear all IFMS-prefixed keys and stamp the new version.
 * Call this once at app startup.
 */
export function migrateStorageIfNeeded(): void {
  try {
    const stored = localStorage.getItem(STORAGE_VERSION_KEY);
    if (stored === String(CURRENT_STORAGE_VERSION)) return;

    // Version mismatch — clear stale IFMS data
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('ifms-')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));

    localStorage.setItem(STORAGE_VERSION_KEY, String(CURRENT_STORAGE_VERSION));
  } catch {
    // If storage is completely inaccessible, bail silently
  }
}
