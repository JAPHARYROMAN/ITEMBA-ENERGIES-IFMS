import type { JwtPayloadUser } from "../decorators/current-user.decorator";

/**
 * In-memory TTL cache for resolved user permissions, shared between the JWT
 * strategy (read/write on each request) and the auth service (invalidation
 * after role/status changes). Kept in its own module so the auth service can
 * invalidate entries without importing the JWT strategy — which would create a
 * circular dependency (the strategy imports AuthService for DI).
 */
interface CachedPermission {
  data: JwtPayloadUser;
  expiresAt: number;
}

const PERMISSION_CACHE_TTL_MS = 30_000; // 30 seconds
const PERMISSION_CACHE_MAX_SIZE = 500;
const permissionCache = new Map<string, CachedPermission>();

/** Return a cached, non-expired permission set for the user, or null. */
export function getCachedPermission(userId: string): JwtPayloadUser | null {
  const cached = permissionCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }
  return null;
}

/** Store a permission set for the user, evicting the oldest entry if full. */
export function setCachedPermission(
  userId: string,
  data: JwtPayloadUser,
): void {
  if (permissionCache.size >= PERMISSION_CACHE_MAX_SIZE) {
    const firstKey = permissionCache.keys().next().value;
    if (firstKey) permissionCache.delete(firstKey);
  }
  permissionCache.set(userId, {
    data,
    expiresAt: Date.now() + PERMISSION_CACHE_TTL_MS,
  });
}

/**
 * Drop cached permissions so changes take effect immediately. Pass a userId to
 * invalidate a single user, or omit it to clear the whole cache.
 */
export function invalidatePermissionCache(userId?: string): void {
  if (userId) {
    permissionCache.delete(userId);
  } else {
    permissionCache.clear();
  }
}
