/**
 * Seed script: companies, stations, branches, roles, permissions, admin user, products, tanks, pumps, nozzles.
 * Run: npm run db:seed (from apps/api). Loads .env from apps/api so DATABASE_URL is used.
 * Default admin: admin@ifms.com / Admin123!
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
import { and, eq, isNull, or } from 'drizzle-orm';
import {
  companies,
  stations,
  branches,
  roles,
  permissions,
  userRoles,
  rolePermissions,
  users,
  products,
  tanks,
  pumps,
  nozzles,
  approvalPolicies,
} from './schema';

// Load apps/api/.env so DATABASE_URL matches your Postgres (same as db:migrate)
config({ path: resolve(__dirname, '../../.env') });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL in apps/api/.env. Use the same URL as for db:migrate (e.g. postgres user).');
  process.exit(1);
}

async function seed() {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const db = drizzle(pool);

  const [existing] = await db.select({ id: companies.id }).from(companies).where(eq(companies.code, 'GEC'));
  if (existing) {
    console.log('Database already seeded (company GEC exists). Ensuring admin user exists...');
    const [adminExists] = await db.select({ id: users.id }).from(users).where(eq(users.email, 'admin@ifms.com'));
    const [existingBranch] = await db
      .select({ id: branches.id })
      .from(branches)
      .innerJoin(stations, eq(branches.stationId, stations.id))
      .where(eq(stations.companyId, existing.id));
    if (adminExists) {
      const adminPasswordHash = await bcrypt.hash('Admin123!', 10);
      await db.update(users).set({ passwordHash: adminPasswordHash, updatedAt: new Date() }).where(eq(users.id, adminExists.id));
      console.log('Admin password reset to Admin123!');
    } else {
      const [roleManager] = await db.select({ id: roles.id }).from(roles).where(eq(roles.code, 'manager'));
      if (roleManager) {
        const adminPasswordHash = await bcrypt.hash('Admin123!', 10);
        const [adminUser] = await db.insert(users).values({
          email: 'admin@ifms.com',
          passwordHash: adminPasswordHash,
          name: 'Default Admin',
          status: 'active',
        }).returning({ id: users.id });
        if (adminUser) {
          await db.insert(userRoles).values({ userId: adminUser.id, roleId: roleManager.id });
          console.log('Admin user created: admin@ifms.com / Admin123!');
        }
      } else {
        console.log('Cannot create admin: manager role missing. Run full seed on a fresh DB.');
      }
    }
    if (existingBranch) {
      await upsertDefaultGovernancePolicies(db, existing.id, existingBranch.id);
      console.log('Governance policies ensured');
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
      stationId: station1.id,
      code: 'BR-02',
      name: 'Lubricant Bay',
      status: 'active',
    })
    .returning({ id: branches.id });
  if (!branch2) throw new Error('Failed to insert branch');

  const [roleManager] = await db
    .insert(roles)
    .values({ code: 'manager', name: 'Manager', description: 'Station manager' })
    .returning({ id: roles.id });
  const [roleCashier] = await db
    .insert(roles)
    .values({ code: 'cashier', name: 'Cashier', description: 'POS operator' })
    .returning({ id: roles.id });
  const [roleAuditor] = await db
    .insert(roles)
    .values({ code: 'auditor', name: 'Auditor', description: 'Read-only auditor' })
    .returning({ id: roles.id });
  if (!roleManager || !roleCashier || !roleAuditor) throw new Error('Failed to insert roles');
  console.log('  roles');

  const permList = [
    { code: 'setup:write', name: 'Setup Write', resource: 'setup', action: 'write' },
    { code: 'setup:read', name: 'Setup Read', resource: 'setup', action: 'read' },
    { code: 'shifts:open', name: 'Shifts Open', resource: 'shifts', action: 'open' },
    { code: 'shifts:close', name: 'Shifts Close', resource: 'shifts', action: 'close' },
    { code: 'shifts:read', name: 'Shifts Read', resource: 'shifts', action: 'read' },
    { code: 'shifts:approve', name: 'Shifts Approve', resource: 'shifts', action: 'approve' },
    { code: 'sales:pos', name: 'Sales POS', resource: 'sales', action: 'pos' },
    { code: 'sales:read', name: 'Sales Read', resource: 'sales', action: 'read' },
    { code: 'sales:void', name: 'Sales Void', resource: 'sales', action: 'void' },
    { code: 'reports:read', name: 'Reports Read', resource: 'reports', action: 'read' },
    { code: 'reports:refresh', name: 'Reports Refresh (Manager)', resource: 'reports', action: 'refresh' },
    { code: 'inventory:read', name: 'Inventory Read', resource: 'inventory', action: 'read' },
    { code: 'inventory:write', name: 'Inventory Write', resource: 'inventory', action: 'write' },
    { code: 'deliveries:read', name: 'Deliveries Read', resource: 'deliveries', action: 'read' },
    { code: 'deliveries:write', name: 'Deliveries Write', resource: 'deliveries', action: 'write' },
    { code: 'credit:write', name: 'Credit Write', resource: 'credit', action: 'write' },
    { code: 'credit:read', name: 'Credit Read', resource: 'credit', action: 'read' },
    { code: 'payables:write', name: 'Payables Write', resource: 'payables', action: 'write' },
    { code: 'payables:read', name: 'Payables Read', resource: 'payables', action: 'read' },
    { code: 'expenses:write', name: 'Expenses Write', resource: 'expenses', action: 'write' },
    { code: 'expenses:read', name: 'Expenses Read', resource: 'expenses', action: 'read' },
    { code: 'transfers:read', name: 'Transfers Read', resource: 'transfers', action: 'read' },
    { code: 'transfers:write', name: 'Transfers Write', resource: 'transfers', action: 'write' },
    { code: 'adjustments:write', name: 'Adjustments Write (Manager)', resource: 'adjustments', action: 'write' },
    { code: 'adjustments:read', name: 'Adjustments Read', resource: 'adjustments', action: 'read' },
  ];
  const perms = await db.insert(permissions).values(permList).returning({ id: permissions.id, code: permissions.code });
  const permByCode = Object.fromEntries(perms.map((p) => [p.code, p.id]));

  await db.insert(rolePermissions).values(
    perms.map((p) => ({ roleId: roleManager.id, permissionId: p.id })),
  );
  const cashierPermIds = ['setup:read', 'shifts:open', 'shifts:close', 'shifts:read', 'sales:pos', 'sales:read', 'reports:read', 'credit:read', 'inventory:read', 'inventory:write', 'deliveries:read', 'deliveries:write', 'transfers:read', 'transfers:write']
    .map((c) => permByCode[c])
    .filter(Boolean);
  const auditorPermIds = ['setup:read', 'shifts:read', 'sales:read', 'reports:read', 'credit:read', 'payables:read', 'expenses:read', 'inventory:read', 'deliveries:read', 'transfers:read', 'adjustments:read']
    .map((c) => permByCode[c])
    .filter(Boolean);
  await db.insert(rolePermissions).values([
    ...cashierPermIds.map((permissionId) => ({ roleId: roleCashier.id, permissionId })),
    ...auditorPermIds.map((permissionId) => ({ roleId: roleAuditor.id, permissionId })),
  ]);
  console.log('  permissions + role_permissions');

  const adminPasswordHash = await bcrypt.hash('Admin123!', 10);
  const [adminUser] = await db
    .insert(users)
    .values({
      email: 'admin@ifms.com',
      passwordHash: adminPasswordHash,
      name: 'Default Admin',
      status: 'active',
    })
    .returning({ id: users.id });
  if (!adminUser) throw new Error('Failed to insert admin user');
  await db.insert(userRoles).values([
    { userId: adminUser.id, roleId: roleManager.id },
  ]);
  console.log('  users + user_roles (admin@ifms.com / Admin123!)');

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

  await upsertDefaultGovernancePolicies(db, company1.id, branch1.id);
  console.log('  governance policies');

  await pool.end();
  console.log('Seed completed.');
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
        { stepOrder: 1, requiredPermission: 'expenses:write', dueHours: 4, allowSelfApproval: false },
        { stepOrder: 2, requiredPermission: 'setup:write', dueHours: 24, allowSelfApproval: false },
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
        { stepOrder: 1, requiredPermission: 'adjustments:write', dueHours: 6, allowSelfApproval: false },
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
        { stepOrder: 1, requiredPermission: 'sales:void', dueHours: 2, allowSelfApproval: false },
        { stepOrder: 2, requiredPermission: 'setup:write', dueHours: 12, allowSelfApproval: false },
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
        { stepOrder: 1, requiredPermission: 'sales:void', dueHours: 2, allowSelfApproval: false },
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
        { stepOrder: 1, requiredPermission: 'shifts:approve', dueHours: 4, allowSelfApproval: false },
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

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
