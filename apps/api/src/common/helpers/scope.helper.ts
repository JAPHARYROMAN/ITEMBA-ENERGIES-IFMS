/**
 * Extract tenant scopes (company/branch UUIDs) from the JWT permissions array.
 *
 * Permissions are encoded as `company:<uuid>` and `branch:<uuid>` strings.
 * This helper provides a single, type-safe way to extract them instead of
 * duplicating regex parsing across controllers and services.
 */

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export interface TenantScope {
  companyIds: string[];
  branchIds: string[];
}

/**
 * Parse company and branch UUIDs from JWT permissions.
 *
 * @example
 * ```ts
 * const scope = extractTenantScope(user.permissions);
 * // scope.companyIds = ['uuid-1', 'uuid-2']
 * // scope.branchIds  = ['uuid-3', 'uuid-4']
 * ```
 */
export function extractTenantScope(permissions: string[]): TenantScope {
  const companyIds: string[] = [];
  const branchIds: string[] = [];

  for (const p of permissions) {
    if (p.startsWith('company:')) {
      const id = p.slice(8);
      if (UUID_RE.test(id)) companyIds.push(id);
    } else if (p.startsWith('branch:')) {
      const id = p.slice(7);
      if (UUID_RE.test(id)) branchIds.push(id);
    }
  }

  return { companyIds, branchIds };
}

/** Check if a user has access to a specific company */
export function hasCompanyAccess(permissions: string[], companyId: string): boolean {
  return permissions.includes(`company:${companyId}`);
}

/** Check if a user has access to a specific branch */
export function hasBranchAccess(permissions: string[], branchId: string): boolean {
  return permissions.includes(`branch:${branchId}`);
}
