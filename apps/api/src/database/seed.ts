/**
 * Seed script: companies, stations, branches, roles, permissions, admin user, products, tanks, pumps, nozzles.
 * Run: npm run db:seed (from apps/api). Loads .env from apps/api so DATABASE_URL is used.
 * Admin credentials read from ADMIN_SEED_EMAIL / ADMIN_SEED_PASSWORD env vars.
 *
 * Retrieval: After seeding, use the REST API to verify (with Bearer token from POST /api/auth/login):
 *   GET /api/companies?page=1&pageSize=25
 *   GET /api/stations, GET /api/branches, GET /api/products, GET /api/tanks, GET /api/pumps, GET /api/nozzles
 */
import { config } from 'dotenv';
import { resolve } from 'path';
import * as bcrypt from 'bcrypt';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import {
  companies,
  stations,
  branches,
  roles,
  permissions,
  userRoles,
  rolePermissions,
  users,
  userBranches,
  products,
  tanks,
  pumps,
  nozzles,
  approvalPolicies,
} from './schema';
import { seedNotificationPreferences } from './seeds/notifications.seed';

// Load apps/api/.env so DATABASE_URL matches your Postgres (same as db:migrate)
config({ path: resolve(__dirname, '../../.env') });

const DATABASE_URL = process.env.DATABASE_URL;

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) {
    console.error(`Missing ${name} in environment.`);
    process.exit(1);
  }
  return val;
}

const ADMIN_EMAIL = requireEnv('ADMIN_SEED_EMAIL');
const ADMIN_PASSWORD = requireEnv('ADMIN_SEED_PASSWORD');

const CANONICAL_PERMISSION_LIST = [
  {
    code: 'setup:write',
    name: 'Setup Write',
    resource: 'setup',
    action: 'write',
  },
  { code: 'setup:read', name: 'Setup Read', resource: 'setup', action: 'read' },
  {
    code: 'shifts:open',
    name: 'Shifts Open',
    resource: 'shifts',
    action: 'open',
  },
  {
    code: 'shifts:close',
    name: 'Shifts Close',
    resource: 'shifts',
    action: 'close',
  },
  {
    code: 'shifts:read',
    name: 'Shifts Read',
    resource: 'shifts',
    action: 'read',
  },
  {
    code: 'shifts:approve',
    name: 'Shifts Approve',
    resource: 'shifts',
    action: 'approve',
  },
  { code: 'sales:pos', name: 'Sales POS', resource: 'sales', action: 'pos' },
  { code: 'sales:read', name: 'Sales Read', resource: 'sales', action: 'read' },
  { code: 'sales:void', name: 'Sales Void', resource: 'sales', action: 'void' },
  {
    code: 'reports:read',
    name: 'Reports Read',
    resource: 'reports',
    action: 'read',
  },
  {
    code: 'reports:refresh',
    name: 'Reports Refresh (Manager)',
    resource: 'reports',
    action: 'refresh',
  },
  {
    code: 'inventory:read',
    name: 'Inventory Read',
    resource: 'inventory',
    action: 'read',
  },
  {
    code: 'inventory:write',
    name: 'Inventory Write',
    resource: 'inventory',
    action: 'write',
  },
  {
    code: 'deliveries:read',
    name: 'Deliveries Read',
    resource: 'deliveries',
    action: 'read',
  },
  {
    code: 'deliveries:write',
    name: 'Deliveries Write',
    resource: 'deliveries',
    action: 'write',
  },
  {
    code: 'credit:write',
    name: 'Credit Write',
    resource: 'credit',
    action: 'write',
  },
  {
    code: 'credit:read',
    name: 'Credit Read',
    resource: 'credit',
    action: 'read',
  },
  {
    code: 'payables:write',
    name: 'Payables Write',
    resource: 'payables',
    action: 'write',
  },
  {
    code: 'payables:read',
    name: 'Payables Read',
    resource: 'payables',
    action: 'read',
  },
  {
    code: 'expenses:write',
    name: 'Expenses Write',
    resource: 'expenses',
    action: 'write',
  },
  {
    code: 'expenses:read',
    name: 'Expenses Read',
    resource: 'expenses',
    action: 'read',
  },
  {
    code: 'transfers:read',
    name: 'Transfers Read',
    resource: 'transfers',
    action: 'read',
  },
  {
    code: 'transfers:write',
    name: 'Transfers Write',
    resource: 'transfers',
    action: 'write',
  },
  {
    code: 'adjustments:write',
    name: 'Adjustments Write (Manager)',
    resource: 'adjustments',
    action: 'write',
  },
  {
    code: 'adjustments:read',
    name: 'Adjustments Read',
    resource: 'adjustments',
    action: 'read',
  },
] as const;

const CASHIER_PERMISSION_CODES = [
  'setup:read',
  'shifts:open',
  'shifts:close',
  'shifts:read',
  'sales:pos',
  'sales:read',
  'reports:read',
  'credit:read',
  'inventory:read',
  'inventory:write',
  'deliveries:read',
  'deliveries:write',
  'transfers:read',
  'transfers:write',
] as const;

const AUDITOR_PERMISSION_CODES = [
  'setup:read',
  'shifts:read',
  'sales:read',
  'reports:read',
  'credit:read',
  'payables:read',
  'expenses:read',
  'inventory:read',
  'deliveries:read',
  'transfers:read',
  'adjustments:read',
] as const;

if (!DATABASE_URL) {
  console.error(
    'Missing DATABASE_URL in apps/api/.env. Use the same URL as for db:migrate (e.g. postgres user).',
  );
  process.exit(1);
}

async function ensureCanonicalRolePermissions(db: ReturnType<typeof drizzle>) {
  const existingPerms = await db
    .select({ id: permissions.id, code: permissions.code })
    .from(permissions);
  const permByCode = new Map(existingPerms.map((p) => [p.code, p.id]));
  const missingPerms = CANONICAL_PERMISSION_LIST.filter((p) => !permByCode.has(p.code));

  if (missingPerms.length) {
    await db
      .insert(permissions)
      .values(missingPerms as unknown as (typeof permissions.$inferInsert)[]);
  }

  const allPerms = await db
    .select({ id: permissions.id, code: permissions.code })
    .from(permissions);
  const allPermByCode = new Map(allPerms.map((p) => [p.code, p.id]));
  const roleRows = await db
    .select({ id: roles.id, code: roles.code })
    .from(roles)
    .where(inArray(roles.code, ['manager', 'cashier', 'auditor']));

  const managerRole = roleRows.find((r) => r.code === 'manager');
  const cashierRole = roleRows.find((r) => r.code === 'cashier');
  const auditorRole = roleRows.find((r) => r.code === 'auditor');

  if (!managerRole) return;

  const desiredRolePermPairs: Array<{ roleId: string; permissionId: string }> = [];

  for (const perm of CANONICAL_PERMISSION_LIST) {
    const permissionId = allPermByCode.get(perm.code);
    if (permissionId) desiredRolePermPairs.push({ roleId: managerRole.id, permissionId });
  }

  if (cashierRole) {
    for (const code of CASHIER_PERMISSION_CODES) {
      const permissionId = allPermByCode.get(code);
      if (permissionId) desiredRolePermPairs.push({ roleId: cashierRole.id, permissionId });
    }
  }

  if (auditorRole) {
    for (const code of AUDITOR_PERMISSION_CODES) {
      const permissionId = allPermByCode.get(code);
      if (permissionId) desiredRolePermPairs.push({ roleId: auditorRole.id, permissionId });
    }
  }

  if (!desiredRolePermPairs.length) return;

  const targetRoleIds = [...new Set(desiredRolePermPairs.map((pair) => pair.roleId))];
  const existingRolePermRows = await db
    .select({
      roleId: rolePermissions.roleId,
      permissionId: rolePermissions.permissionId,
    })
    .from(rolePermissions)
    .where(inArray(rolePermissions.roleId, targetRoleIds));
  const existingRolePermSet = new Set(
    existingRolePermRows.map((row) => `${row.roleId}:${row.permissionId}`),
  );

  const missingRolePerms = desiredRolePermPairs.filter(
    (pair) => !existingRolePermSet.has(`${pair.roleId}:${pair.permissionId}`),
  );

  if (missingRolePerms.length) {
    await db.insert(rolePermissions).values(missingRolePerms);
    console.log(`Ensured ${missingRolePerms.length} missing role-permission mappings.`);
  }
}

async function seed() {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const db = drizzle(pool);

  const [existing] = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.code, 'GEC'));
  if (existing) {
    console.log('Database already seeded (company GEC exists). Ensuring admin user exists...');
    await ensureCanonicalRolePermissions(db);
    const [roleManager] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.code, 'manager'));
    if (!roleManager) {
      console.log('Cannot ensure admin role: manager role missing. Run full seed on a fresh DB.');
      await pool.end();
      return;
    }
    const [adminExists] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, ADMIN_EMAIL));
    const [existingBranch] = await db
      .select({ id: branches.id })
      .from(branches)
      .innerJoin(stations, eq(branches.stationId, stations.id))
      .where(eq(stations.companyId, existing.id));
    let adminUserId = adminExists?.id;

    if (adminExists) {
      const adminPasswordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
      await db
        .update(users)
        .set({ passwordHash: adminPasswordHash, updatedAt: new Date() })
        .where(eq(users.id, adminExists.id));
      console.log(`Admin password reset for ${ADMIN_EMAIL}.`);
    } else {
      const adminPasswordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
      const [adminUser] = await db
        .insert(users)
        .values({
          email: ADMIN_EMAIL,
          passwordHash: adminPasswordHash,
          name: 'Default Admin',
          status: 'active',
        })
        .returning({ id: users.id });
      if (adminUser) {
        adminUserId = adminUser.id;
        console.log(`Admin user created: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
      }
    }

    if (adminUserId) {
      const [hasManagerRole] = await db
        .select({ userId: userRoles.userId })
        .from(userRoles)
        .where(and(eq(userRoles.userId, adminUserId), eq(userRoles.roleId, roleManager.id)));

      if (!hasManagerRole) {
        await db.insert(userRoles).values({ userId: adminUserId, roleId: roleManager.id });
        console.log(`Manager role attached to ${ADMIN_EMAIL}`);
      }

      if (existingBranch) {
        await db
          .insert(userBranches)
          .values([{ userId: adminUserId, branchId: existingBranch.id }])
          .onConflictDoNothing();
        console.log(`Branch assignment ensured for ${ADMIN_EMAIL}`);
      }
    }

    if (existingBranch) {
      try {
        await upsertDefaultGovernancePolicies(db, existing.id, existingBranch.id);
        console.log('Governance policies ensured');
      } catch (error) {
        if (isMissingGovernancePoliciesTableError(error)) {
          console.log(
            'Skipping governance policy seed: governance_policies table not found. Run db:migrate to enable governance policies.',
          );
        } else {
          throw error;
        }
      }
    }
    await pool.end();
    return;
  }

  console.log('Seeding IFMS database...');

  const [company1] = await db
    .insert(companies)
    .values({
      code: 'GEC',
      name: 'Global Energy Corp',
      currency: 'TZS',
      status: 'active',
    })
    .returning({ id: companies.id });
  if (!company1) throw new Error('Failed to insert company');
  console.log('  companies');

  const [company2] = await db
    .insert(companies)
    .values({
      code: 'RFL',
      name: 'Regional Fuels Ltd',
      currency: 'TZS',
      status: 'active',
    })
    .returning({ id: companies.id });
  if (!company2) throw new Error('Failed to insert company');

  const [station1] = await db
    .insert(stations)
    .values({
      companyId: company1.id,
      code: 'STN-01',
      name: 'Downtown Station',
      location: '123 Main St',
      manager: 'John Doe',
      status: 'active',
    })
    .returning({ id: stations.id });
  if (!station1) throw new Error('Failed to insert station');
  console.log('  stations');

  const [station2] = await db
    .insert(stations)
    .values({
      companyId: company1.id,
      code: 'STN-02',
      name: 'Airport Express',
      location: 'Terminal 5',
      manager: 'Jane Smith',
      status: 'active',
    })
    .returning({ id: stations.id });
  if (!station2) throw new Error('Failed to insert station');

  const [branch1] = await db
    .insert(branches)
    .values({
      companyId: company1.id,
      stationId: station1.id,
      code: 'BR-01',
      name: 'Main Forecourt',
      status: 'active',
    })
    .returning({ id: branches.id });
  if (!branch1) throw new Error('Failed to insert branch');
  console.log('  branches');

  const [branch2] = await db
    .insert(branches)
    .values({
      companyId: company1.id,
      stationId: station1.id,
      code: 'BR-02',
      name: 'Lubricant Bay',
      status: 'active',
    })
    .returning({ id: branches.id });
  if (!branch2) throw new Error('Failed to insert branch');

  const [roleManager] = await db
    .insert(roles)
    .values({
      code: 'manager',
      name: 'Manager',
      description: 'Station manager',
    })
    .returning({ id: roles.id });
  const [roleCashier] = await db
    .insert(roles)
    .values({ code: 'cashier', name: 'Cashier', description: 'POS operator' })
    .returning({ id: roles.id });
  const [roleAuditor] = await db
    .insert(roles)
    .values({
      code: 'auditor',
      name: 'Auditor',
      description: 'Read-only auditor',
    })
    .returning({ id: roles.id });
  if (!roleManager || !roleCashier || !roleAuditor) throw new Error('Failed to insert roles');
  console.log('  roles');

  const permList = [
    {
      code: 'setup:write',
      name: 'Setup Write',
      resource: 'setup',
      action: 'write',
    },
    {
      code: 'setup:read',
      name: 'Setup Read',
      resource: 'setup',
      action: 'read',
    },
    {
      code: 'shifts:open',
      name: 'Shifts Open',
      resource: 'shifts',
      action: 'open',
    },
    {
      code: 'shifts:close',
      name: 'Shifts Close',
      resource: 'shifts',
      action: 'close',
    },
    {
      code: 'shifts:read',
      name: 'Shifts Read',
      resource: 'shifts',
      action: 'read',
    },
    {
      code: 'shifts:approve',
      name: 'Shifts Approve',
      resource: 'shifts',
      action: 'approve',
    },
    { code: 'sales:pos', name: 'Sales POS', resource: 'sales', action: 'pos' },
    {
      code: 'sales:read',
      name: 'Sales Read',
      resource: 'sales',
      action: 'read',
    },
    {
      code: 'sales:void',
      name: 'Sales Void',
      resource: 'sales',
      action: 'void',
    },
    {
      code: 'reports:read',
      name: 'Reports Read',
      resource: 'reports',
      action: 'read',
    },
    {
      code: 'reports:refresh',
      name: 'Reports Refresh (Manager)',
      resource: 'reports',
      action: 'refresh',
    },
    {
      code: 'inventory:read',
      name: 'Inventory Read',
      resource: 'inventory',
      action: 'read',
    },
    {
      code: 'inventory:write',
      name: 'Inventory Write',
      resource: 'inventory',
      action: 'write',
    },
    {
      code: 'deliveries:read',
      name: 'Deliveries Read',
      resource: 'deliveries',
      action: 'read',
    },
    {
      code: 'deliveries:write',
      name: 'Deliveries Write',
      resource: 'deliveries',
      action: 'write',
    },
    {
      code: 'credit:write',
      name: 'Credit Write',
      resource: 'credit',
      action: 'write',
    },
    {
      code: 'credit:read',
      name: 'Credit Read',
      resource: 'credit',
      action: 'read',
    },
    {
      code: 'payables:write',
      name: 'Payables Write',
      resource: 'payables',
      action: 'write',
    },
    {
      code: 'payables:read',
      name: 'Payables Read',
      resource: 'payables',
      action: 'read',
    },
    {
      code: 'expenses:write',
      name: 'Expenses Write',
      resource: 'expenses',
      action: 'write',
    },
    {
      code: 'expenses:read',
      name: 'Expenses Read',
      resource: 'expenses',
      action: 'read',
    },
    {
      code: 'transfers:read',
      name: 'Transfers Read',
      resource: 'transfers',
      action: 'read',
    },
    {
      code: 'transfers:write',
      name: 'Transfers Write',
      resource: 'transfers',
      action: 'write',
    },
    {
      code: 'adjustments:write',
      name: 'Adjustments Write (Manager)',
      resource: 'adjustments',
      action: 'write',
    },
    {
      code: 'adjustments:read',
      name: 'Adjustments Read',
      resource: 'adjustments',
      action: 'read',
    },
  ];
  const perms = await db
    .insert(permissions)
    .values(permList)
    .returning({ id: permissions.id, code: permissions.code });
  const permByCode = Object.fromEntries(perms.map((p) => [p.code, p.id]));

  await db
    .insert(rolePermissions)
    .values(perms.map((p) => ({ roleId: roleManager.id, permissionId: p.id })));
  const cashierPermIds = [
    'setup:read',
    'shifts:open',
    'shifts:close',
    'shifts:read',
    'sales:pos',
    'sales:read',
    'reports:read',
    'credit:read',
    'inventory:read',
    'inventory:write',
    'deliveries:read',
    'deliveries:write',
    'transfers:read',
    'transfers:write',
  ]
    .map((c) => permByCode[c])
    .filter(Boolean);
  const auditorPermIds = [
    'setup:read',
    'shifts:read',
    'sales:read',
    'reports:read',
    'credit:read',
    'payables:read',
    'expenses:read',
    'inventory:read',
    'deliveries:read',
    'transfers:read',
    'adjustments:read',
  ]
    .map((c) => permByCode[c])
    .filter(Boolean);
  await db.insert(rolePermissions).values([
    ...cashierPermIds.map((permissionId) => ({
      roleId: roleCashier.id,
      permissionId,
    })),
    ...auditorPermIds.map((permissionId) => ({
      roleId: roleAuditor.id,
      permissionId,
    })),
  ]);
  console.log('  permissions + role_permissions');

  const adminPasswordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const [adminUser] = await db
    .insert(users)
    .values({
      email: ADMIN_EMAIL,
      passwordHash: adminPasswordHash,
      name: 'Default Admin',
      status: 'active',
    })
    .returning({ id: users.id });
  if (!adminUser) throw new Error('Failed to insert admin user');
  await db.insert(userRoles).values([{ userId: adminUser.id, roleId: roleManager.id }]);
  await db
    .insert(userBranches)
    .values([
      { userId: adminUser.id, branchId: branch1.id },
      { userId: adminUser.id, branchId: branch2.id },
    ])
    .onConflictDoNothing();
  console.log(`  users + user_roles + user_branches (${ADMIN_EMAIL} / ${ADMIN_PASSWORD})`);

  const [product1] = await db
    .insert(products)
    .values({
      companyId: company1.id,
      code: 'ULP95',
      name: 'Unleaded 95',
      category: 'Fuel',
      pricePerUnit: '1.45',
      unit: 'L',
      status: 'active',
    })
    .returning({ id: products.id });
  const [product2] = await db
    .insert(products)
    .values({
      companyId: company1.id,
      code: 'DSL',
      name: 'Diesel High Speed',
      category: 'Fuel',
      pricePerUnit: '1.32',
      unit: 'L',
      status: 'active',
    })
    .returning({ id: products.id });
  if (!product1 || !product2) throw new Error('Failed to insert products');
  console.log('  products');

  const [tank1] = await db
    .insert(tanks)
    .values({
      companyId: company1.id,
      branchId: branch1.id,
      code: 'TNK-01',
      productId: product1.id,
      capacity: '20000',
      minLevel: '1000',
      maxLevel: '19500',
      currentLevel: '12500',
      calibrationProfile: 'Standard-V1',
      status: 'active',
    })
    .returning({ id: tanks.id });
  if (!tank1) throw new Error('Failed to insert tank');
  console.log('  tanks');

  const [pump1] = await db
    .insert(pumps)
    .values({
      stationId: station1.id,
      code: 'PMP-01',
      name: 'Pump 1',
      status: 'active',
    })
    .returning({ id: pumps.id });
  const [pump2] = await db
    .insert(pumps)
    .values({
      stationId: station1.id,
      code: 'PMP-02',
      name: 'Pump 2',
      status: 'active',
    })
    .returning({ id: pumps.id });
  if (!pump1 || !pump2) throw new Error('Failed to insert pumps');
  console.log('  pumps');

  await db.insert(nozzles).values([
    {
      stationId: station1.id,
      pumpId: pump1.id,
      tankId: tank1.id,
      productId: product1.id,
      code: 'NOZ-01',
      status: 'active',
    },
    {
      stationId: station1.id,
      pumpId: pump2.id,
      tankId: tank1.id,
      productId: product2.id,
      code: 'NOZ-02',
      status: 'active',
    },
  ]);
  console.log('  nozzles');

  try {
    await upsertDefaultGovernancePolicies(db, company1.id, branch1.id);
    console.log('  governance policies');
  } catch (error) {
    if (isMissingGovernancePoliciesTableError(error)) {
      console.log(
        '  governance policies skipped (table missing). Run db:migrate to enable governance policies.',
      );
    } else {
      throw error;
    }
  }

  await seedNotificationPreferences(db);
  console.log('\n✅ Database seeded successfully!');
}

async function upsertDefaultGovernancePolicies(
  db: ReturnType<typeof drizzle>,
  companyId: string,
  branchId: string,
) {
  const defaults = [
    {
      companyId,
      branchId,
      entityType: 'expense_entry',
      actionType: 'approve',
      thresholdAmount: '1000.00',
      thresholdPct: null,
      approvalStepsJson: [
        {
          stepOrder: 1,
          requiredPermission: 'expenses:write',
          dueHours: 4,
          allowSelfApproval: false,
        },
        {
          stepOrder: 2,
          requiredPermission: 'setup:write',
          dueHours: 24,
          allowSelfApproval: false,
        },
      ],
      isEnabled: true,
    },
    {
      companyId,
      branchId,
      entityType: 'stock_adjustment',
      actionType: 'approve',
      thresholdAmount: null,
      thresholdPct: null,
      approvalStepsJson: [
        {
          stepOrder: 1,
          requiredPermission: 'adjustments:write',
          dueHours: 6,
          allowSelfApproval: false,
        },
      ],
      isEnabled: true,
    },
    {
      companyId,
      branchId,
      entityType: 'sale_transaction',
      actionType: 'void',
      thresholdAmount: null,
      thresholdPct: null,
      approvalStepsJson: [
        {
          stepOrder: 1,
          requiredPermission: 'sales:void',
          dueHours: 2,
          allowSelfApproval: false,
        },
        {
          stepOrder: 2,
          requiredPermission: 'setup:write',
          dueHours: 12,
          allowSelfApproval: false,
        },
      ],
      isEnabled: true,
    },
    {
      companyId,
      branchId,
      entityType: 'sale_transaction',
      actionType: 'discount_override',
      thresholdAmount: null,
      thresholdPct: '0.1000',
      approvalStepsJson: [
        {
          stepOrder: 1,
          requiredPermission: 'sales:void',
          dueHours: 2,
          allowSelfApproval: false,
        },
      ],
      isEnabled: true,
    },
    {
      companyId,
      branchId,
      entityType: 'shift',
      actionType: 'close_variance',
      thresholdAmount: null,
      thresholdPct: null,
      approvalStepsJson: [
        {
          stepOrder: 1,
          requiredPermission: 'shifts:approve',
          dueHours: 4,
          allowSelfApproval: false,
        },
      ],
      isEnabled: true,
    },
  ];

  for (const policy of defaults) {
    const [existing] = await db
      .select({ id: approvalPolicies.id })
      .from(approvalPolicies)
      .where(
        and(
          isNull(approvalPolicies.deletedAt),
          eq(approvalPolicies.companyId, policy.companyId),
          eq(approvalPolicies.entityType, policy.entityType),
          eq(approvalPolicies.actionType, policy.actionType),
          or(eq(approvalPolicies.branchId, policy.branchId), isNull(approvalPolicies.branchId)),
        ),
      );

    if (existing) continue;

    await db.insert(approvalPolicies).values(policy as typeof approvalPolicies.$inferInsert);
  }
}

function isMissingGovernancePoliciesTableError(error: unknown): boolean {
  const pgError = error as { code?: string; message?: string } | undefined;
  return pgError?.code === '42P01' && (pgError.message ?? '').includes('governance_policies');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
