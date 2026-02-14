import { Module } from '@nestjs/common';
import { GovernanceController } from './governance.controller';
import { GovernanceService } from './governance.service';
import { PolicyEvaluatorService } from './policy-evaluator.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [GovernanceController],
  providers: [GovernanceService, PolicyEvaluatorService],
  exports: [GovernanceService, PolicyEvaluatorService],
})
export class GovernanceModule {}
