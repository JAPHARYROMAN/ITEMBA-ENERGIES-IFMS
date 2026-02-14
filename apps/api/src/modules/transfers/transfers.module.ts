import { Module } from '@nestjs/common';
import { TransfersController } from './transfers.controller';
import { TransfersService } from './transfers.service';
import { AdjustmentsController } from './adjustments.controller';
import { AdjustmentsService } from './adjustments.service';
import { GovernanceModule } from '../governance/governance.module';

@Module({
  imports: [GovernanceModule],
  controllers: [TransfersController, AdjustmentsController],
  providers: [TransfersService, AdjustmentsService],
  exports: [TransfersService, AdjustmentsService],
})
export class TransfersModule {}
