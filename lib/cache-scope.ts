export type AuthCacheScope = string | null | undefined;

export function resolveAuthCacheScope(
  previousUserId: AuthCacheScope,
  isAuthReady: boolean,
  currentUserId: string | null,
): { shouldReset: boolean; nextUserId: AuthCacheScope } {
  if (!isAuthReady) {
    return { shouldReset: false, nextUserId: previousUserId };
  }

  if (previousUserId === undefined) {
    return { shouldReset: false, nextUserId: currentUserId };
  }

  return {
    shouldReset: previousUserId !== currentUserId,
    nextUserId: currentUserId,
  };
}
