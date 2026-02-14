import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ReportsRefreshService } from './reports-refresh.service';
import { ReportsMvService } from './reports-mv.service';
import { AuditModule } from '../audit/audit.module';
import { AppLogger } from '../../common/logger/logger.service';

@Module({
  imports: [AuditModule],
  controllers: [ReportsController],
  providers: [ReportsService, ReportsRefreshService, ReportsMvService, AppLogger],
  exports: [ReportsRefreshService],
})
export class ReportsModule {}
