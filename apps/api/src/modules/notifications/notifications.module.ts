import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { ScheduleModule } from "@nestjs/schedule";
import { NotificationsController } from "./notifications.controller";
import { NotificationService } from "./notifications.service";
import { OutboxWorker } from "./outbox.worker";
import { RealtimeGateway } from "./realtime.gateway";
import { SocketAuthGuard } from "./guards/socket-auth.guard";
import { NotificationTriggersService } from "./notification-triggers.service";
import { NotificationSchedulerService } from "./notification-scheduler.service";
import { NotificationMetricsService } from "./notification-metrics.service";
import { NotificationDigestService } from "./notification-digest.service";
import { EmailTransport } from "./transports/email.transport";
import { SmsTransport } from "./transports/sms.transport";
import { PushTransport } from "./transports/push.transport";
import { DatabaseModule } from "../../database/database.module";
import { AuditModule } from "../audit/audit.module";

@Module({
  imports: [
    ConfigModule,
    JwtModule.register({}),
    ScheduleModule.forRoot(),
    DatabaseModule,
    AuditModule,
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationService,
    OutboxWorker,
    RealtimeGateway,
    SocketAuthGuard,
    NotificationTriggersService,
    NotificationSchedulerService,
    NotificationMetricsService,
    NotificationDigestService,
    EmailTransport,
    SmsTransport,
    PushTransport,
  ],
  exports: [
    NotificationService,
    OutboxWorker,
    RealtimeGateway,
    NotificationTriggersService,
    NotificationSchedulerService,
    NotificationMetricsService,
    NotificationDigestService,
    EmailTransport,
    SmsTransport,
    PushTransport,
  ],
})
export class NotificationsModule {}
