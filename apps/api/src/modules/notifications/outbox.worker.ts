import { Injectable, Logger, OnModuleInit, BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Inject } from "@nestjs/common";
import { and, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE } from "../../database/database.module";
import type * as schema from "../../database/schema";
import {
  notificationOutbox,
  notificationDeliveries,
  notifications,
  NOTIFICATION_DELIVERY_STATUS,
  NOTIFICATION_OUTBOX_JOB_TYPE,
} from "../../database/schema/notifications/notifications";
import { users } from "../../database/schema/auth/users";
import { RealtimeGateway } from "./realtime.gateway";
import { NotificationMetricsService } from "./notification-metrics.service";
import { EmailTransport } from "./transports/email.transport";
import { SmsTransport } from "./transports/sms.transport";
import { PushTransport } from "./transports/push.transport";

@Injectable()
export class OutboxWorker implements OnModuleInit {
  private readonly logger = new Logger(OutboxWorker.name);
  private pollInterval: NodeJS.Timeout | null = null;
  private readonly workerId: string;
  private readonly maxRetries = 10;
  private readonly baseDelayMs = 1000; // 1 second

  constructor(
    @Inject(DRIZZLE) private db: NodePgDatabase<typeof schema>,
    private configService: ConfigService,
    private realtimeGateway: RealtimeGateway,
    private metricsService: NotificationMetricsService,
    private emailTransport: EmailTransport,
    private smsTransport: SmsTransport,
    private pushTransport: PushTransport,
  ) {
    this.workerId = `worker-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  onModuleInit() {
    const pollIntervalSeconds = this.configService.get<number>(
      "NOTIFICATION_OUTBOX_POLL_INTERVAL",
      30,
    );
    this.logger.log(
      `Starting OutboxWorker with ID: ${this.workerId}, polling every ${pollIntervalSeconds}s`,
    );

    this.pollInterval = setInterval(() => {
      this.processJobs().catch((error) => {
        this.logger.error("Error processing outbox jobs", error);
      });
    }, pollIntervalSeconds * 1000);
  }

  async onModuleDestroy() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.logger.log(`OutboxWorker ${this.workerId} stopped`);
  }

  private async processJobs(): Promise<void> {
    const startTime = Date.now();
    let jobsFound = 0;
    let jobsProcessed = 0;
    let jobsFailed = 0;

    try {
      // Claim ready jobs (not locked and run_after <= now)
      const now = new Date();
      const jobs = await this.db
        .select()
        .from(notificationOutbox)
        .where(
          and(
            lte(notificationOutbox.runAfter, now),
            isNull(notificationOutbox.deletedAt),
            isNull(notificationOutbox.lockedAt),
            or(
              sql`${notificationOutbox.attempts} < ${this.maxRetries}`,
              isNull(notificationOutbox.attempts),
            ),
          ),
        )
        .limit(50); // Process in batches

      jobsFound = jobs.length;

      if (jobs.length === 0) {
        this.metricsService.recordOutboxProcessingTime(Date.now() - startTime);
        return;
      }

      this.logger.debug(`Found ${jobs.length} jobs to process`);

      // Lock jobs atomically
      const lockedJobIds = await this.lockJobs(jobs.map((job) => job.id));
      const lockedJobs = jobs.filter((job) => lockedJobIds.includes(job.id));

      this.logger.debug(`Successfully locked ${lockedJobs.length} jobs`);

      // Process each locked job
      for (const job of lockedJobs) {
        try {
          await this.processJob(job);
          await this.markJobCompleted(job.id);
          jobsProcessed++;
          this.logger.debug(`Successfully processed job ${job.id}`);
        } catch (error) {
          await this.handleJobFailure(job, error);
          jobsFailed++;
        }
      }

      // Record batch metrics
      this.metricsService.recordOutboxBatch(
        jobsFound,
        jobsProcessed,
        jobsFailed,
      );
      this.metricsService.recordOutboxProcessingTime(Date.now() - startTime);
    } catch (error) {
      this.logger.error("Error in processJobs", error);
      this.metricsService.recordOutboxError();
    }
  }

  private async lockJobs(jobIds: string[]): Promise<string[]> {
    const now = new Date();

    // Update jobs to set lock
    const result = await this.db
      .update(notificationOutbox)
      .set({
        lockedAt: now,
        lockedBy: this.workerId,
      })
      .where(
        and(
          sql`${notificationOutbox.id} = ANY(${jobIds})`,
          isNull(notificationOutbox.deletedAt),
          isNull(notificationOutbox.lockedAt), // Ensure not already locked
        ),
      )
      .returning({ id: notificationOutbox.id });

    return result.map((row) => row.id);
  }

  private async processJob(job: any): Promise<void> {
    switch (job.jobType) {
      case NOTIFICATION_OUTBOX_JOB_TYPE.DELIVER_INAPP:
        await this.processInAppDelivery(job);
        break;
      case NOTIFICATION_OUTBOX_JOB_TYPE.SEND_EMAIL:
        await this.processEmailDelivery(job);
        break;
      case NOTIFICATION_OUTBOX_JOB_TYPE.SEND_SMS:
        await this.processSmsDelivery(job);
        break;
      case "push":
        await this.processPushDelivery(job);
        break;
      default:
        throw new BadRequestException(`Unknown job type: ${job.jobType}`);
    }
  }

  private async processInAppDelivery(job: any): Promise<void> {
    // Mark all pending in-app deliveries for this notification as sent
    const deliveries = await this.db
      .update(notificationDeliveries)
      .set({
        status: NOTIFICATION_DELIVERY_STATUS.SENT,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(notificationDeliveries.notificationId, job.notificationId),
          eq(notificationDeliveries.deliveredVia, "inapp"),
          eq(
            notificationDeliveries.status,
            NOTIFICATION_DELIVERY_STATUS.PENDING,
          ),
        ),
      )
      .returning({
        id: notificationDeliveries.id,
        userId: notificationDeliveries.userId,
        notificationId: notificationDeliveries.notificationId,
      });

    // Get notification details for real-time payload
    const [notification] = await this.db
      .select()
      .from(notifications)
      .where(eq(notifications.id, job.notificationId))
      .limit(1);

    if (notification && deliveries.length > 0) {
      // Emit real-time events to each user
      for (const delivery of deliveries) {
        const payload = {
          delivery: {
            id: delivery.id,
            notificationId: delivery.notificationId,
            userId: delivery.userId,
            status: "sent",
            deliveredVia: "inapp",
          },
          notification: {
            id: notification.id,
            type: notification.type,
            severity: notification.severity,
            title: notification.title,
            body: notification.body,
            data: notification.dataJson,
            actionUrl: notification.actionUrl,
            createdAt: notification.createdAt,
          },
        };

        // Emit notification to user
        await this.realtimeGateway.emitNotificationToUser(
          delivery.userId,
          "notification:new",
          payload,
        );

        // Optionally emit unread count update
        const unreadCount = await this.getUnreadCount(delivery.userId);
        await this.realtimeGateway.emitNotificationToUser(
          delivery.userId,
          "notification:unreadCount",
          { count: unreadCount },
        );
      }
    }

    this.logger.debug(
      `In-app delivery completed for notification ${job.notificationId}, delivered to ${deliveries.length} users`,
    );

    // Record delivery metrics
    this.metricsService.incrementDeliveriesSent("inapp");
  }

  private async processEmailDelivery(job: any): Promise<void> {
    const [notification] = await this.db
      .select()
      .from(notifications)
      .where(eq(notifications.id, job.notificationId))
      .limit(1);

    if (!notification) {
      this.logger.warn(
        `Notification ${job.notificationId} not found for email delivery`,
      );
      return;
    }

    // Get recipient deliveries
    const deliveries = await this.db
      .select({
        id: notificationDeliveries.id,
        userId: notificationDeliveries.userId,
      })
      .from(notificationDeliveries)
      .where(
        and(
          eq(notificationDeliveries.notificationId, job.notificationId),
          eq(notificationDeliveries.deliveredVia, "email"),
          eq(
            notificationDeliveries.status,
            NOTIFICATION_DELIVERY_STATUS.PENDING,
          ),
        ),
      );

    for (const delivery of deliveries) {
      // Look up user email
      const [user] = await this.db
        .select({ email: users.email, name: users.name })
        .from(users)
        .where(eq(users.id, delivery.userId));

      if (!user) continue;

      await this.emailTransport.send({
        to: user.email,
        subject: notification.title,
        body: notification.body ?? notification.title,
        metadata: { notificationId: notification.id, deliveryId: delivery.id },
      });

      await this.db
        .update(notificationDeliveries)
        .set({
          status: NOTIFICATION_DELIVERY_STATUS.SENT,
          updatedAt: new Date(),
        })
        .where(eq(notificationDeliveries.id, delivery.id));
    }

    this.logger.debug(
      `Email delivery completed for notification ${job.notificationId}, sent to ${deliveries.length} users`,
    );
    this.metricsService.incrementDeliveriesSent("email");
  }

  private async processSmsDelivery(job: any): Promise<void> {
    const [notification] = await this.db
      .select()
      .from(notifications)
      .where(eq(notifications.id, job.notificationId))
      .limit(1);

    if (!notification) {
      this.logger.warn(
        `Notification ${job.notificationId} not found for SMS delivery`,
      );
      return;
    }

    const deliveries = await this.db
      .select({
        id: notificationDeliveries.id,
        userId: notificationDeliveries.userId,
      })
      .from(notificationDeliveries)
      .where(
        and(
          eq(notificationDeliveries.notificationId, job.notificationId),
          eq(notificationDeliveries.deliveredVia, "sms"),
          eq(
            notificationDeliveries.status,
            NOTIFICATION_DELIVERY_STATUS.PENDING,
          ),
        ),
      );

    for (const delivery of deliveries) {
      const [user] = await this.db
        .select({ phone: users.phone, name: users.name })
        .from(users)
        .where(eq(users.id, delivery.userId));

      if (!user?.phone) {
        await this.db
          .update(notificationDeliveries)
          .set({
            status: NOTIFICATION_DELIVERY_STATUS.FAILED,
            errorMessage: "User has no phone number on file.",
            updatedAt: new Date(),
          })
          .where(eq(notificationDeliveries.id, delivery.id));
        continue;
      }

      await this.smsTransport.send({
        to: user.phone,
        message: notification.body ?? notification.title,
        metadata: { notificationId: notification.id, deliveryId: delivery.id },
      });

      await this.db
        .update(notificationDeliveries)
        .set({
          status: NOTIFICATION_DELIVERY_STATUS.SENT,
          updatedAt: new Date(),
        })
        .where(eq(notificationDeliveries.id, delivery.id));
    }

    this.logger.debug(
      `SMS delivery completed for notification ${job.notificationId}, processed ${deliveries.length} recipients`,
    );
    this.metricsService.incrementDeliveriesSent("sms");
  }

  private async processPushDelivery(job: any): Promise<void> {
    const [notification] = await this.db
      .select()
      .from(notifications)
      .where(eq(notifications.id, job.notificationId))
      .limit(1);

    if (!notification) {
      this.logger.warn(
        `Notification ${job.notificationId} not found for push delivery`,
      );
      return;
    }

    const deliveries = await this.db
      .select({
        id: notificationDeliveries.id,
        userId: notificationDeliveries.userId,
      })
      .from(notificationDeliveries)
      .where(
        and(
          eq(notificationDeliveries.notificationId, job.notificationId),
          eq(notificationDeliveries.deliveredVia, "push"),
          eq(
            notificationDeliveries.status,
            NOTIFICATION_DELIVERY_STATUS.PENDING,
          ),
        ),
      );

    for (const delivery of deliveries) {
      const [user] = await this.db
        .select({ fcmToken: users.fcmToken, name: users.name })
        .from(users)
        .where(eq(users.id, delivery.userId));

      if (!user?.fcmToken) {
        await this.db
          .update(notificationDeliveries)
          .set({
            status: NOTIFICATION_DELIVERY_STATUS.FAILED,
            errorMessage: "User has no push token registered.",
            updatedAt: new Date(),
          })
          .where(eq(notificationDeliveries.id, delivery.id));
        continue;
      }

      await this.pushTransport.send({
        to: user.fcmToken,
        title: notification.title,
        body: notification.body ?? notification.title,
        data: {
          notificationId: notification.id,
          deliveryId: delivery.id,
          ...(notification.actionUrl ? { actionUrl: notification.actionUrl } : {}),
        },
      });

      await this.db
        .update(notificationDeliveries)
        .set({
          status: NOTIFICATION_DELIVERY_STATUS.SENT,
          updatedAt: new Date(),
        })
        .where(eq(notificationDeliveries.id, delivery.id));
    }

    this.logger.debug(
      `Push delivery completed for notification ${job.notificationId}, processed ${deliveries.length} recipients`,
    );
    this.metricsService.incrementDeliveriesSent("push");
  }

  private async markJobCompleted(jobId: string): Promise<void> {
    await this.db
      .delete(notificationOutbox)
      .where(eq(notificationOutbox.id, jobId));
  }

  private async handleJobFailure(job: any, error: any): Promise<void> {
    const newAttempts = (job.attempts || 0) + 1;
    const errorMessage = error?.message || "Unknown error";
    const deliveryVia = this.getDeliveryViaForJobType(job.jobType);

    // Record failure metrics
    this.metricsService.incrementDeliveryFailures(deliveryVia);

    if (newAttempts >= this.maxRetries) {
      // Mark as failed permanently
      await this.db
        .update(notificationOutbox)
        .set({
          attempts: newAttempts,
          lastError: errorMessage,
          lockedAt: null, // Release lock
          lockedBy: null,
        })
        .where(eq(notificationOutbox.id, job.id));

      // Mark corresponding deliveries as failed
      await this.db
        .update(notificationDeliveries)
        .set({
          status: NOTIFICATION_DELIVERY_STATUS.FAILED,
          errorMessage: errorMessage,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(notificationDeliveries.notificationId, job.notificationId),
            eq(notificationDeliveries.deliveredVia, deliveryVia),
          ),
        );

      this.logger.error(
        `Job ${job.id} failed permanently after ${newAttempts} attempts: ${errorMessage}`,
      );
      this.metricsService.recordPermanentFailure(deliveryVia);
    } else {
      // Schedule retry with exponential backoff
      const delayMs = this.baseDelayMs * Math.pow(2, newAttempts - 1);
      const runAfter = new Date(Date.now() + delayMs);

      await this.db
        .update(notificationOutbox)
        .set({
          attempts: newAttempts,
          lastError: errorMessage,
          runAfter,
          lockedAt: null, // Release lock
          lockedBy: null,
        })
        .where(eq(notificationOutbox.id, job.id));

      this.logger.warn(
        `Job ${job.id} failed (attempt ${newAttempts}), retrying after ${delayMs}ms: ${errorMessage}`,
      );
      this.metricsService.recordRetry(deliveryVia);
    }
  }

  private getDeliveryViaForJobType(jobType: string): string {
    switch (jobType) {
      case NOTIFICATION_OUTBOX_JOB_TYPE.DELIVER_INAPP:
        return "inapp";
      case NOTIFICATION_OUTBOX_JOB_TYPE.SEND_EMAIL:
        return "email";
      case NOTIFICATION_OUTBOX_JOB_TYPE.SEND_SMS:
        return "sms";
      default:
        throw new BadRequestException(`Unknown job type: ${jobType}`);
    }
  }

  private async getUnreadCount(userId: string): Promise<number> {
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

  // Manual trigger for testing/admin
  async processJobsOnce(): Promise<{ processed: number; failed: number }> {
    const startTime = Date.now();
    let processed = 0;
    let failed = 0;

    try {
      const now = new Date();
      const jobs = await this.db
        .select()
        .from(notificationOutbox)
        .where(
          and(
            lte(notificationOutbox.runAfter, now),
            isNull(notificationOutbox.deletedAt),
            isNull(notificationOutbox.lockedAt),
            or(
              sql`${notificationOutbox.attempts} < ${this.maxRetries}`,
              isNull(notificationOutbox.attempts),
            ),
          ),
        )
        .limit(10); // Smaller batch for manual processing

      const lockedJobIds = await this.lockJobs(jobs.map((job) => job.id));
      const lockedJobs = jobs.filter((job) => lockedJobIds.includes(job.id));

      for (const job of lockedJobs) {
        try {
          await this.processJob(job);
          await this.markJobCompleted(job.id);
          processed++;
        } catch (error) {
          await this.handleJobFailure(job, error);
          failed++;
        }
      }

      // Record manual processing metrics
      this.metricsService.recordOutboxBatch(jobs.length, processed, failed);
      this.metricsService.recordOutboxProcessingTime(Date.now() - startTime);
    } catch (error) {
      this.logger.error("Error in manual job processing", error);
      this.metricsService.recordOutboxError();
    }

    return { processed, failed };
  }
}
