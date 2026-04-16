import { DrizzleD1Database } from 'drizzle-orm/d1';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { migrate as drizzleMigrate } from 'drizzle-orm/node-postgres/migrator';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../../database/schema';
import { users } from '../../database/schema/auth/users';
import { notificationPreferences, NOTIFICATION_SEVERITY, NOTIFICATION_DIGEST_MODE } from '../../database/schema/notifications/notifications';

export async function seedNotificationPreferences(db: ReturnType<typeof drizzle>) {
  console.log('🌱 Seeding notification preferences...');

  // Get all existing users
  const existingUsers = await db.select({ id: users.id }).from(users);

  if (existingUsers.length === 0) {
    console.log('ℹ️ No users found, skipping notification preferences seed');
    return;
  }

  // Check which users already have preferences
  const existingPreferences = await db
    .select({ userId: notificationPreferences.userId })
    .from(notificationPreferences);

  const usersWithPreferences = new Set(existingPreferences.map((p) => p.userId));
  const usersWithoutPreferences = existingUsers.filter((u) => !usersWithPreferences.has(u.id));

  if (usersWithoutPreferences.length === 0) {
    console.log('✅ All users already have notification preferences');
    return;
  }

  console.log(`📝 Creating default preferences for ${usersWithoutPreferences.length} users...`);

  // Create default preferences for users without them
  const defaultPreferences = usersWithoutPreferences.map((user) => ({
    userId: user.id,
    channelsJson: {
      inapp: true,
      email: false,
      sms: false,
      push: false,
    },
    severityMin: NOTIFICATION_SEVERITY.INFO,
    quietHoursJson: null,
    digestMode: NOTIFICATION_DIGEST_MODE.NONE,
  }));

  await db.insert(notificationPreferences).values(defaultPreferences);

  console.log(`✅ Created default notification preferences for ${usersWithoutPreferences.length} users`);
}
