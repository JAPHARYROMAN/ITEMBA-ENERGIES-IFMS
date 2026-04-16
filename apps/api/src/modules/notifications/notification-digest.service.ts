import { Injectable, Logger, Inject } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { ConfigService } from "@nestjs/config";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq, gte, isNull, sql } from "drizzle-orm";
import { DRIZZLE } from "../../database/database.module";
import type * as schema from "../../database/schema";
import {
  notificationDeliveries,
  notifications,
  notificationPreferences,
} from "../../database/schema/notifications/notifications";
import { users } from "../../database/schema/auth/users";
import { EmailTransport } from "./transports/email.transport";

@Injectable()
export class NotificationDigestService {
  private readonly logger = new Logger(NotificationDigestService.name);

  constructor(
    @Inject(DRIZZLE) private db: NodePgDatabase<typeof schema>,
    private configService: ConfigService,
    private emailTransport: EmailTransport,
  ) {}

  /** Run daily at 07:00 UTC to send daily digests */
  @Cron("0 0 7 * * *", { name: "daily-notification-digest", timeZone: "UTC" })
  async handleDailyDigest() {
    this.logger.log("Starting daily notification digest...");
    await this.processDigest("daily");
  }

  /** Run every Monday at 07:00 UTC for weekly digests */
  @Cron("0 0 7 * * 1", { name: "weekly-notification-digest", timeZone: "UTC" })
  async handleWeeklyDigest() {
    this.logger.log("Starting weekly notification digest...");
    await this.processDigest("weekly");
  }

  private async processDigest(mode: "daily" | "weekly") {
    try {
      // Find users who have digest mode set to this frequency
      const usersWithDigest = await this.db
        .select({
          userId: notificationPreferences.userId,
        })
        .from(notificationPreferences)
        .where(eq(notificationPreferences.digestMode, mode));

      if (usersWithDigest.length === 0) {
        this.logger.debug(`No users with ${mode} digest mode`);
        return;
      }

      const since =
        mode === "daily"
          ? new Date(Date.now() - 24 * 60 * 60 * 1000)
          : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      for (const { userId } of usersWithDigest) {
        try {
          await this.sendDigestForUser(userId, since, mode);
        } catch (error) {
          this.logger.error(
            `Failed to send ${mode} digest for user ${userId}:`,
            error,
          );
        }
      }

      this.logger.log(
        `${mode} digest completed for ${usersWithDigest.length} users`,
      );
    } catch (error) {
      this.logger.error(`Error processing ${mode} digest:`, error);
    }
  }

  private async sendDigestForUser(userId: string, since: Date, mode: string) {
    // Get unread notifications since the cutoff
    const unreadDeliveries = await this.db
      .select({
        title: notifications.title,
        body: notifications.body,
        severity: notifications.severity,
        type: notifications.type,
        createdAt: notifications.createdAt,
      })
      .from(notificationDeliveries)
      .innerJoin(
        notifications,
        eq(notificationDeliveries.notificationId, notifications.id),
      )
      .where(
        and(
          eq(notificationDeliveries.userId, userId),
          isNull(notificationDeliveries.readAt),
          gte(notifications.createdAt, since),
        ),
      )
      .limit(50);

    if (unreadDeliveries.length === 0) return;

    // Get user email
    const [user] = await this.db
      .select({ email: users.email, name: users.name })
      .from(users)
      .where(eq(users.id, userId));

    if (!user) return;

    // Build digest email
    const summaryLines = unreadDeliveries.map(
      (n) =>
        `[${(n.severity ?? "info").toUpperCase()}] ${n.title}${n.body ? ": " + n.body : ""}`,
    );
    const digestBody = [
      `Hi ${user.name},`,
      "",
      `Here's your ${mode} notification digest (${unreadDeliveries.length} unread):`,
      "",
      ...summaryLines,
      "",
      "— IFMS Notification Service",
    ].join("\n");

    await this.emailTransport.send({
      to: user.email,
      subject: `IFMS ${mode.charAt(0).toUpperCase() + mode.slice(1)} Digest — ${unreadDeliveries.length} notification${unreadDeliveries.length !== 1 ? "s" : ""}`,
      body: digestBody,
    });

    this.logger.debug(
      `Sent ${mode} digest to ${user.email} with ${unreadDeliveries.length} notifications`,
    );
  }
}
