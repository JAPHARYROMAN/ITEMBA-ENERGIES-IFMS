import { describe, test, expect } from 'vitest';
import { permissionGroups } from './permissions';
import { hasAllPermissions, hasAnyPermission } from '../store';

describe('permissionGroups — structure', () => {
  test('every group is a non-empty array of "domain:action" strings', () => {
    const entries = Object.entries(permissionGroups);
    expect(entries.length).toBeGreaterThan(0);
    for (const [name, perms] of entries) {
      expect(Array.isArray(perms), `${name} should be an array`).toBe(true);
      expect(perms.length, `${name} should not be empty`).toBeGreaterThan(0);
      for (const p of perms) {
        expect(p).toMatch(/^[a-z]+:[a-z]+$/);
      }
    }
  });

  test('read/write groups expose the expected scopes', () => {
    expect(permissionGroups.setupRead).toContain('setup:read');
    expect(permissionGroups.setupWrite).toEqual(['setup:write']);
    expect(permissionGroups.inventoryAccess).toEqual([
      'inventory:read',
      'inventory:write',
    ]);
    expect(permissionGroups.usersAdmin).toEqual(['setup:write']);
  });

  test('governance groups aggregate the right scopes', () => {
    expect(permissionGroups.governanceRead).toContain('reports:read');
    expect(permissionGroups.governanceRead).toContain('shifts:read');
    expect(permissionGroups.governanceSubmit).toContain('shifts:close');
    expect(permissionGroups.governanceAct).toContain('shifts:approve');
    // act includes write-level submission scopes but not the read-only ones
    expect(permissionGroups.governanceAct).not.toContain('shifts:close');
  });
});

describe('permissionGroups — matching against a user', () => {
  test('a manager-level user satisfies write groups via hasAnyPermission', () => {
    const manager = { permissions: ['setup:write', 'reports:read'] };
    expect(hasAnyPermission(manager, permissionGroups.setupWrite)).toBe(true);
    expect(hasAnyPermission(manager, permissionGroups.governanceSubmit)).toBe(
      true,
    );
  });

  test('a read-only user fails write groups but passes read groups', () => {
    const reader = { permissions: ['setup:read', 'reports:read'] };
    expect(hasAnyPermission(reader, permissionGroups.setupWrite)).toBe(false);
    expect(hasAnyPermission(reader, permissionGroups.setupRead)).toBe(true);
  });

  test('inventoryAccess (any) vs requiring all scopes', () => {
    const readOnly = { permissions: ['inventory:read'] };
    expect(hasAnyPermission(readOnly, permissionGroups.inventoryAccess)).toBe(
      true,
    );
    expect(hasAllPermissions(readOnly, permissionGroups.inventoryAccess)).toBe(
      false,
    );

    const full = { permissions: ['inventory:read', 'inventory:write'] };
    expect(hasAllPermissions(full, permissionGroups.inventoryAccess)).toBe(true);
  });

  test('user with no governance scopes matches none of the governance groups', () => {
    const cashier = { permissions: ['sales:pos'] };
    expect(hasAnyPermission(cashier, permissionGroups.governanceRead)).toBe(
      false,
    );
    expect(hasAnyPermission(cashier, permissionGroups.governanceAct)).toBe(
      false,
    );
  });
});
