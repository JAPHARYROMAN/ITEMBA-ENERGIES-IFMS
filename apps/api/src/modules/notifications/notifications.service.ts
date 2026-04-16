import { Injectable, NotFoundException, BadRequestException, ForbiddenException, InternalServerErrorException, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { and, desc, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../../database/database.module';
import type * as schema from '../../database/schema';
import {
  notifications,
  notificationDeliveries,
  notificationPreferences,
  notificationOutbox,
  NOTIFICATION_DELIVERY_STATUS,
  NOTIFICATION_DELIVERY_VIA,
  NOTIFICATION_SEVERITY,
  NOTIFICATION_OUTBOX_JOB_TYPE,
} from '../../database/schema/notifications/notifications';
import { users } from '../../database/schema/auth/users';
import { userBranches } from '../../database/schema/auth/user-branches';
import { userRoles } from '../../database/schema/auth/user-roles';
import { roles } from '../../database/schema/auth/roles';
import { branches } from '../../database/schema/core/branches';
import { stations } from '../../database/schema/core/stations';
import { AuditService } from '../audit/audit.service';
import { NotificationMetricsService } from './notification-metrics.service';

export interface CreateNotificationRequest {
  scope: {
    companyId: string;
    branchId?: string;
    stationId?: string;
  };
  type: string;
  severity: 'info' | 'success' | 'warning' | 'critical';
  title: string;
  body?: string;
  data?: Record<string, any>;
  actionUrl?: string;
  dedupeKey?: string;
  expiresAt?: Date;
  recipients: {
    userIds?: string[];
    roles?: ('Manager' | 'Cashier' | 'Auditor')[];
    branchMembership?: boolean;
  };
}

export interface NotificationDeliveryListParams {
  status?: 'pending' | 'sent' | 'failed';
  unread?: boolean;
  severity?: 'info' | 'success' | 'warning' | 'critical';
  type?: string;
  dateFrom?: Date;
  dateTo?: Date;
  page?: number;
  pageSize?: number;
}

export interface NotificationDeliveryResponse {
  id: string;
  notificationId: string;
  userId: string;
  status: string;
  readAt?: Date;
  seenAt?: Date;
  archivedAt?: Date;
  deliveredVia: string;
  errorMessage?: string;
  notification: {
    id: string;
    type: string;
    severity: string;
    title: string;
    body?: string;
    data?: Record<string, any>;
    actionUrl?: string;
    createdAt: Date;
  };
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @Inject(DRIZZLE) private db: NodePgDatabase<typeof schema>,
    private auditService: AuditService,
    private metricsService: NotificationMetricsService,
  ) {}

  async createNotification(request: CreateNotificationRequest): Promise<string> {
    // Validate anti-spam rules
    await this.validateAntiSpamRules(request);

    // Check rate limits and potentially create summary notification
    const shouldProceed = await this.checkRateLimitsAndCreateSummary(request);
    if (!shouldProceed) {
      this.metricsService.incrementRateLimited();
      return 'rate-limited'; // Return a special ID indicating rate limiting
    }

    return await this.db.transaction(async (tx) => {
      // Check for deduplication
      if (request.dedupeKey) {
        const existing = await tx
          .select({ id: notifications.id })
          .from(notifications)
          .where(
            and(
              eq(notifications.dedupeKey, request.dedupeKey),
              eq(notifications.companyId, request.scope.companyId),
              gte(notifications.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000)), // Last 24 hours
              isNull(notifications.deletedAt),
            ),
          )
          .limit(1);

        if (existing.length > 0) {
          this.metricsService.incrementDeduplicated();
          return existing[0].id;
        }
      }

      // Create notification
      const [notification] = await tx.insert(notifications).values({
        companyId: request.scope.companyId,
        branchId: request.scope.branchId,
        stationId: request.scope.stationId,
        type: request.type,
        severity: request.severity,
        title: request.title,
        body: request.body,
        dataJson: request.data,
        actionUrl: request.actionUrl,
        dedupeKey: request.dedupeKey,
        expiresAt: request.expiresAt,
      }).returning({ id: notifications.id });

      // Determine recipient users
      const recipientUserIds = await this.resolveRecipients(tx, request);

      if (recipientUserIds.length === 0) {
        throw new BadRequestException('No valid recipients found for notification');
      }

      // Get user preferences for filtering
      const preferences = await tx
        .select({
          userId: notificationPreferences.userId,
          channelsJson: notificationPreferences.channelsJson,
          severityMin: notificationPreferences.severityMin,
        })
        .from(notificationPreferences)
        .where(inArray(notificationPreferences.userId, recipientUserIds));

      const preferencesByUserId = new Map(
        preferences.map((p) => [p.userId, { channels: p.channelsJson, severityMin: p.severityMin }])
      );

      // Create deliveries and outbox jobs
      const deliveries: typeof notificationDeliveries.$inferInsert[] = [];
      const outboxJobs: typeof notificationOutbox.$inferInsert[] = [];

      for (const userId of recipientUserIds) {
        const userPref = preferencesByUserId.get(userId) || {
          channels: { inapp: true, email: false, sms: false, push: false },
          severityMin: 'info',
          quietHoursJson: null,
        } as any;

        // Check if user should receive this notification based on severity
        if (!this.shouldReceiveNotification(request.severity, userPref.severityMin)) {
          continue;
        }

        // Check quiet hours - suppress non-critical notifications during quiet hours
        if (this.shouldSuppressDuringQuietHours(request.severity, userPref.quietHoursJson)) {
          continue;
        }

        // Create in-app delivery if enabled
        if ((userPref.channels as any).inapp) {
          deliveries.push({
            notificationId: notification.id,
            userId,
            status: NOTIFICATION_DELIVERY_STATUS.PENDING,
            deliveredVia: NOTIFICATION_DELIVERY_VIA.INAPP,
          });

          outboxJobs.push({
            notificationId: notification.id,
            jobType: NOTIFICATION_OUTBOX_JOB_TYPE.DELIVER_INAPP,
            runAfter: new Date(),
            attempts: 0,
          });
        }

        // Future: add email/sms jobs when channels are enabled
      }

      if (deliveries.length > 0) {
        await tx.insert(notificationDeliveries).values(deliveries);
        await tx.insert(notificationOutbox).values(outboxJobs);
      }

      // Audit log
      await this.auditService.log({
        userId: 'system', // This will be overridden by context middleware
        action: 'create_notification',
        entity: 'notification',
        entityId: notification.id,
      });

      // Record metrics
      this.metricsService.incrementNotificationsCreated(request.type, request.severity);

      return notification.id;
    });
  }

  async markSeen(deliveryId: string, userId: string): Promise<void> {
    const result = await this.db
      .update(notificationDeliveries)
      .set({
        seenAt: new Date(),
        updatedAt: new Date(),
        updatedBy: userId,
      })
      .where(
        and(
          eq(notificationDeliveries.id, deliveryId),
          eq(notificationDeliveries.userId, userId),
        ),
      );

    if (result.rowCount === 0) {
      throw new NotFoundException('Delivery not found or access denied');
    }
  }

  async markRead(deliveryId: string, userId: string): Promise<void> {
    const result = await this.db
      .update(notificationDeliveries)
      .set({
        readAt: new Date(),
        updatedAt: new Date(),
        updatedBy: userId,
      })
      .where(
        and(
          eq(notificationDeliveries.id, deliveryId),
          eq(notificationDeliveries.userId, userId),
        ),
      );

    if (result.rowCount === 0) {
      throw new NotFoundException('Delivery not found or access denied');
    }
  }

  async archive(deliveryId: string, userId: string): Promise<void> {
    const result = await this.db
      .update(notificationDeliveries)
      .set({
        archivedAt: new Date(),
        updatedAt: new Date(),
        updatedBy: userId,
      })
      .where(
        and(
          eq(notificationDeliveries.id, deliveryId),
          eq(notificationDeliveries.userId, userId),
        ),
      );

    if (result.rowCount === 0) {
      throw new NotFoundException('Delivery not found or access denied');
    }
  }

  async listUserDeliveries(
    userId: string,
    params: NotificationDeliveryListParams = {},
  ): Promise<{ deliveries: NotificationDeliveryResponse[]; total: number }> {
    const {
      status,
      unread,
      severity,
      type,
      dateFrom,
      dateTo,
      page = 1,
      pageSize = 25,
    } = params;

    const offset = (page - 1) * pageSize;

    // Build where conditions
    const conditions = [
      eq(notificationDeliveries.userId, userId),
      isNull(notificationDeliveries.deletedAt),
    ];

    if (status) {
      conditions.push(eq(notificationDeliveries.status, status));
    }

    if (unread) {
      conditions.push(and(isNull(notificationDeliveries.readAt), isNull(notificationDeliveries.archivedAt)) as any);
    }

    if (dateFrom) {
      conditions.push(gte(notificationDeliveries.createdAt, dateFrom));
    }

    if (dateTo) {
      conditions.push(lte(notificationDeliveries.createdAt, dateTo));
    }

    // Join with notifications for additional filtering
    const query = this.db
      .select({
        delivery: notificationDeliveries,
        notification: notifications,
      })
      .from(notificationDeliveries)
      .innerJoin(notifications, eq(notificationDeliveries.notificationId, notifications.id))
      .where(and(...conditions));

    let finalQuery = query;
    if (severity) {
      finalQuery = this.db
        .select({
          delivery: notificationDeliveries,
          notification: notifications,
        })
        .from(notificationDeliveries)
        .innerJoin(notifications, eq(notificationDeliveries.notificationId, notifications.id))
        .where(and(...conditions, eq(notifications.severity, severity)));
    }

    if (type) {
      finalQuery = this.db
        .select({
          delivery: notificationDeliveries,
          notification: notifications,
        })
        .from(notificationDeliveries)
        .innerJoin(notifications, eq(notificationDeliveries.notificationId, notifications.id))
        .where(and(...conditions, eq(notifications.type, type)));
    }

    // Get total count
    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(finalQuery.as('subquery'));

    // Get paginated results
    const results = await finalQuery
      .orderBy(desc(notificationDeliveries.createdAt))
      .limit(pageSize)
      .offset(offset);

    const deliveries: NotificationDeliveryResponse[] = results.map((row) => ({
      id: row.delivery.id,
      notificationId: row.delivery.notificationId,
      userId: row.delivery.userId,
      status: row.delivery.status,
      readAt: row.delivery.readAt || undefined,
      seenAt: row.delivery.seenAt || undefined,
      archivedAt: row.delivery.archivedAt || undefined,
      deliveredVia: row.delivery.deliveredVia,
      errorMessage: row.delivery.errorMessage || undefined,
      notification: {
        id: row.notification.id,
        type: row.notification.type,
        severity: row.notification.severity,
        title: row.notification.title,
        body: row.notification.body || undefined,
        data: row.notification.dataJson as Record<string, any> | undefined,
        actionUrl: row.notification.actionUrl || undefined,
        createdAt: row.notification.createdAt,
      },
    }));

    return { deliveries, total: Number(count) };
  }

  async getDeliveryById(userId: string, id: string): Promise<NotificationDeliveryResponse> {
    const [row] = await this.db
      .select({
        delivery: notificationDeliveries,
        notification: notifications,
      })
      .from(notificationDeliveries)
      .innerJoin(notifications, eq(notificationDeliveries.notificationId, notifications.id))
      .where(
        and(
          eq(notificationDeliveries.id, id),
          eq(notificationDeliveries.userId, userId),
          isNull(notificationDeliveries.deletedAt),
        ),
      );
    if (!row) throw new NotFoundException('Notification delivery not found');
    return {
      id: row.delivery.id,
      notificationId: row.delivery.notificationId,
      userId: row.delivery.userId,
      status: row.delivery.status,
      readAt: row.delivery.readAt || undefined,
      seenAt: row.delivery.seenAt || undefined,
      archivedAt: row.delivery.archivedAt || undefined,
      deliveredVia: row.delivery.deliveredVia,
      errorMessage: row.delivery.errorMessage || undefined,
      notification: {
        id: row.notification.id,
        type: row.notification.type,
        severity: row.notification.severity,
        title: row.notification.title,
        body: row.notification.body || undefined,
        data: row.notification.dataJson as Record<string, any> | undefined,
        actionUrl: row.notification.actionUrl || undefined,
        createdAt: row.notification.createdAt,
      },
    };
  }

  async getUnreadCount(userId: string): Promise<number> {
    const [result] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(notificationDeliveries)
      .where(
        and(
          eq(notificationDeliveries.userId, userId),
          isNull(notificationDeliveries.readAt),
          isNull(notificationDeliveries.archivedAt),
          isNull(notificationDeliveries.deletedAt),
        ),
      );

    return Number(result.count);
  }

  async getUserPreferences(userId: string): Promise<any> {
    const [pref] = await this.db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, userId))
      .limit(1);

    return (
      pref || {
        channelsJson: { inapp: true, email: false, sms: false, push: false },
        severityMin: 'info',
        quietHoursJson: null,
        digestMode: 'none',
      }
    );
  }

  async updateUserPreferences(userId: string, preferences: any): Promise<void> {
    await this.db
      .insert(notificationPreferences)
      .values({
        userId,
        channelsJson: preferences.channelsJson,
        severityMin: preferences.severityMin,
        quietHoursJson: preferences.quietHoursJson,
        digestMode: preferences.digestMode,
        createdBy: userId,
        updatedBy: userId,
      })
      .onConflictDoUpdate({
        target: notificationPreferences.userId,
        set: {
          channelsJson: preferences.channelsJson,
          severityMin: preferences.severityMin,
          quietHoursJson: preferences.quietHoursJson,
          digestMode: preferences.digestMode,
          updatedAt: new Date(),
          updatedBy: userId,
        },
      });
  }

  private async resolveRecipients(
    tx: NodePgDatabase<typeof schema>,
    request: CreateNotificationRequest,
  ): Promise<string[]> {
    const userIds = new Set<string>();

    // Explicit user IDs
    if (request.recipients.userIds) {
      request.recipients.userIds.forEach((id) => userIds.add(id));
    }

    // By role
    if (request.recipients.roles && request.recipients.roles.length > 0) {
      const roleUsers = await tx
        .select({ userId: userRoles.userId })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .where(
          and(
            inArray(roles.name, request.recipients.roles),
            isNull(userRoles.deletedAt),
            isNull(roles.deletedAt),
          ),
        );

      roleUsers.forEach((user) => userIds.add(user.userId));
    }

    // By branch membership
    if (request.recipients.branchMembership) {
      const conditions = [
        eq(stations.companyId, request.scope.companyId),
        isNull(userBranches.deletedAt),
        isNull(branches.deletedAt),
        isNull(stations.deletedAt),
      ];
      if (request.scope.stationId) {
        conditions.push(eq(branches.stationId, request.scope.stationId));
      }
      if (request.scope.branchId) {
        conditions.push(eq(userBranches.branchId, request.scope.branchId));
      }

      const branchUsers = await tx
        .selectDistinct({ id: userBranches.userId })
        .from(userBranches)
        .innerJoin(users, eq(userBranches.userId, users.id))
        .innerJoin(branches, eq(userBranches.branchId, branches.id))
        .innerJoin(stations, eq(branches.stationId, stations.id))
        .where(and(...conditions, isNull(users.deletedAt)));

      branchUsers.forEach((user) => userIds.add(user.id));
    }

    return Array.from(userIds);
  }

  private shouldReceiveNotification(notificationSeverity: string, userMinSeverity: string): boolean {
    const severityLevels: Record<string, number> = {
      info: 0,
      success: 1,
      warning: 2,
      critical: 3,
    };
    const notificationLevel = severityLevels[notificationSeverity];
    const userMinLevel = severityLevels[userMinSeverity];
    
    if (notificationLevel === undefined || userMinLevel === undefined) {
      return false;
    }
    
    return notificationLevel >= userMinLevel;
  }

  /**
   * Get outbox backlog statistics for admin health checks
   */
  async getOutboxBacklog() {
    const { and, isNull } = await import('drizzle-orm');
    const jobs = await this.db
      .select({
        id: notificationOutbox.id,
        runAfter: notificationOutbox.runAfter,
        attempts: notificationOutbox.attempts,
        lastError: notificationOutbox.lastError,
      })
      .from(notificationOutbox)
      .where(
        and(
          isNull(notificationOutbox.deletedAt),
        ),
      );

    const pendingJobs = jobs.filter((job) => (job.attempts ?? 0) === 0);
    const failedJobs = jobs.filter((job) => (job.attempts ?? 0) > 0).length;
    const oldestJob = jobs
      .filter(job => job.runAfter)
      .sort((a, b) => new Date(a.runAfter!).getTime() - new Date(b.runAfter!).getTime())[0];

    const oldestAge = oldestJob
      ? Math.floor((Date.now() - new Date(oldestJob.runAfter!).getTime()) / 1000)
      : 0;

    return {
      total: jobs.length,
      failed: failedJobs,
      oldestAge,
    };
  }

  /**
   * Get delivery statistics for admin health checks
   */
  async getDeliveryStats() {
    const { sql, isNull } = await import('drizzle-orm');
    const [stats] = await this.db
      .select({
        total: sql<number>`count(*)`,
        pending: sql<number>`count(case when status = 'pending' then 1 end)`,
        sent: sql<number>`count(case when status = 'sent' then 1 end)`,
        failed: sql<number>`count(case when status = 'failed' then 1 end)`,
      })
      .from(notificationDeliveries)
      .where(isNull(notificationDeliveries.deletedAt));

    return stats;
  }

  private async validateAntiSpamRules(request: CreateNotificationRequest): Promise<void> {
    // Check for high-frequency notifications that require dedupeKey
    const highFrequencyTypes = ['system', 'alert', 'reminder'];
    if (highFrequencyTypes.includes(request.type) && !request.dedupeKey) {
      throw new BadRequestException(
        `dedupe_key is required for high-frequency notification type: ${request.type}`
      );
    }
  }

  private async checkRateLimitsAndCreateSummary(request: CreateNotificationRequest): Promise<boolean> {
    const RATE_LIMIT_PER_HOUR = 20;
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    // Get all recipients for this notification
    const recipientUserIds = await this.resolveRecipients(this.db, request);

    for (const userId of recipientUserIds) {
      // Count notifications sent to this user in the last hour
      const recentNotifications = await this.db
        .select({ count: sql<number>`count(*)` })
        .from(notificationDeliveries)
        .where(
          and(
            eq(notificationDeliveries.userId, userId),
            gte(notificationDeliveries.createdAt, oneHourAgo),
            isNull(notificationDeliveries.deletedAt),
          ),
        );

      const count = Number(recentNotifications[0]?.count || 0);

      if (count >= RATE_LIMIT_PER_HOUR) {
        // Create a summary notification instead
        await this.createRateLimitSummaryNotification(userId, count);
        return false; // Don't proceed with the original notification
      }
    }

    return true; // Proceed with normal notification creation
  }

  private async createRateLimitSummaryNotification(userId: string, suppressedCount: number): Promise<void> {
    try {
      await this.db.insert(notifications).values({
        companyId: 'system', // Use system company for internal notifications
        type: 'system',
        severity: 'warning',
        title: 'Notification Rate Limit Exceeded',
        body: `You've received ${suppressedCount} notifications in the last hour. Some notifications have been summarized to reduce spam.`,
        dedupeKey: `rate-limit-summary:${userId}:${Date.now()}`,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // Expires in 24 hours
        createdBy: 'system',
        updatedBy: 'system',
      }).returning({ id: notifications.id }).then(async ([notification]) => {
        if (notification) {
          await this.db.insert(notificationDeliveries).values({
            notificationId: notification.id,
            userId,
            status: NOTIFICATION_DELIVERY_STATUS.PENDING,
            deliveredVia: NOTIFICATION_DELIVERY_VIA.INAPP,
          });

          await this.db.insert(notificationOutbox).values({
            notificationId: notification.id,
            jobType: NOTIFICATION_OUTBOX_JOB_TYPE.DELIVER_INAPP,
            runAfter: new Date(),
            attempts: 0,
          });
        }
      });
    } catch (error) {
      // Log error but don't fail the main operation
      this.logger.error('Failed to create rate limit summary notification:', error);
    }
  }

  private shouldSuppressDuringQuietHours(notificationSeverity: string, quietHoursJson: any): boolean {
    if (!quietHoursJson?.enabled) {
      return false;
    }

    // Never suppress critical notifications
    if (notificationSeverity === 'critical') {
      return false;
    }

    const now = new Date();
    const currentHour = now.getHours();
    const startHour = parseInt(quietHoursJson.start?.split(':')[0] || '22');
    const endHour = parseInt(quietHoursJson.end?.split(':')[0] || '8');

    if (startHour > endHour) {
      // Overnight quiet hours (e.g., 22:00 to 08:00)
      return currentHour >= startHour || currentHour < endHour;
    } else {
      // Same-day quiet hours (e.g., 01:00 to 05:00)
      return currentHour >= startHour && currentHour < endHour;
    }
  }
}
