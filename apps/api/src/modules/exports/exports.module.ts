import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ExportsController, PublicReportVerificationController } from './exports.controller';
import { ExportsService } from './exports.service';
import { ExportsRendererService } from './exports.renderer.service';
import { ExportsComplianceService } from './exports.compliance.service';
import { ExportsWorker } from './exports.worker';
import { ReportsModule } from '../reports/reports.module';

@Module({
  imports: [ConfigModule, ReportsModule],
  controllers: [ExportsController, PublicReportVerificationController],
  providers: [ExportsService, ExportsRendererService, ExportsComplianceService, ExportsWorker],
  exports: [ExportsService],
})
export class ExportsModule {}
