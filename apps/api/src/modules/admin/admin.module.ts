import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { ReportsModule } from '../reports/reports.module';

@Module({
  imports: [ReportsModule],
  controllers: [AdminController],
})
export class AdminModule {}
