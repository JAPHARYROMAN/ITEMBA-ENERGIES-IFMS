import { Module } from '@nestjs/common';
import { SystemController } from './system.controller';
import { SystemService } from './system.service';
import { SystemRepository } from './system.repository';
import { AppLogger } from '../../common/logger/logger.service';

@Module({
  controllers: [SystemController],
  providers: [SystemService, SystemRepository, AppLogger],
  exports: [SystemService],
})
export class SystemModule {}
