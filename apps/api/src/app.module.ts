import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { DatabaseModule } from './database/database.module';
import { AuditModule } from './modules/audit/audit.module';
import { SystemModule } from './modules/system/system.module';
import { AuthModule } from './modules/auth/auth.module';
import { CoreModule } from './modules/core/core.module';
import { SetupModule } from './modules/setup/setup.module';
import { ShiftsModule } from './modules/shifts/shifts.module';
import { SalesModule } from './modules/sales/sales.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { DeliveriesModule } from './modules/deliveries/deliveries.module';
import { TransfersModule } from './modules/transfers/transfers.module';
import { CreditModule } from './modules/credit/credit.module';
import { PayablesModule } from './modules/payables/payables.module';
import { ReportsModule } from './modules/reports/reports.module';
import { ScheduleModule } from '@nestjs/schedule';
import { AdminModule } from './modules/admin/admin.module';
import { ExpensesModule } from './modules/expenses/expenses.module';
import { GovernanceModule } from './modules/governance/governance.module';
import { envSchema } from './common/env/env.schema';
import { AppLogger } from './common/logger/logger.service';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { RequestLoggingMiddleware } from './common/middleware/request-logging.middleware';
import { OpsMetricsModule } from './common/ops/ops-metrics.module';

function resolveEnvFilePath(): string[] {
  const profile = (process.env.ENV_PROFILE ?? process.env.APP_ENV ?? process.env.NODE_ENV ?? 'development').toLowerCase();

  if (profile === 'production') {
    return ['.env.production', '.env'];
  }

  if (profile === 'staging') {
    return ['.env.staging', '.env.local', '.env'];
  }

  if (profile === 'test') {
    return ['.env.test', '.env.local', '.env'];
  }

  return ['.env.local', '.env'];
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: resolveEnvFilePath(),
      validate: (config) => envSchema.parse(config),
    }),
    OpsMetricsModule,
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1000, limit: 10 },
      { name: 'medium', ttl: 60_000, limit: 100 },
    ]),
    DatabaseModule,
    AuditModule,
    SystemModule,
    AuthModule,
    CoreModule,
    SetupModule,
    ShiftsModule,
    SalesModule,
    InventoryModule,
    DeliveriesModule,
    TransfersModule,
    CreditModule,
    PayablesModule,
    ExpensesModule,
    GovernanceModule,
    ReportsModule,
    ScheduleModule.forRoot(),
    AdminModule,
  ],
  providers: [
    AppLogger,
    RequestLoggingMiddleware,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
  exports: [AppLogger],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware, RequestLoggingMiddleware).forRoutes('*');
  }
}
