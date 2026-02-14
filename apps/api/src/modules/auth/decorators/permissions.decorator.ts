import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

/**
 * Require at least one of the given permissions.
 * Use with PermissionsGuard. Example: @Permissions('reports:read', 'setup:write')
 */
export const Permissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
