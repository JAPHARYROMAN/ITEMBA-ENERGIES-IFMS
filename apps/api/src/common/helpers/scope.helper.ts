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

export interface TenantScopeSource {
  permissions?: readonly string[];
  companyId?: string;
  branchId?: string;
  companyIds?: readonly string[];
  branchIds?: readonly string[];
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
export function extractTenantScope(permissions: readonly string[] = []): TenantScope {
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

  return {
    companyIds: uniqueIds(companyIds),
    branchIds: uniqueIds(branchIds),
  };
}

export function mergeTenantScope(source: TenantScopeSource | undefined): TenantScope {
  const fromPermissions = extractTenantScope(source?.permissions ?? []);
  return {
    companyIds: uniqueIds([
      ...fromPermissions.companyIds,
      ...(source?.companyIds ?? []),
      source?.companyId,
    ]),
    branchIds: uniqueIds([
      ...fromPermissions.branchIds,
      ...(source?.branchIds ?? []),
      source?.branchId,
    ]),
  };
}

export function hasTenantScope(scope: TenantScope): boolean {
  return scope.companyIds.length > 0 || scope.branchIds.length > 0;
}

export function isTenantScopedUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/** Check if a user has access to a specific company */
export function hasCompanyAccess(permissions: readonly string[], companyId: string): boolean {
  return permissions.includes(`company:${companyId}`);
}

/** Check if a user has access to a specific branch */
export function hasBranchAccess(permissions: readonly string[], branchId: string): boolean {
  return permissions.includes(`branch:${branchId}`);
}

function uniqueIds(values: readonly (string | undefined)[]): string[] {
  return [...new Set(values.filter(isTenantScopedUuid))];
}
