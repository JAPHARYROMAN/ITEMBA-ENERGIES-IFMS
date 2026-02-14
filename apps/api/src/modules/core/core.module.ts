import { Module } from '@nestjs/common';
import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';
import { StationsController } from './stations.controller';
import { StationsService } from './stations.service';
import { BranchesController } from './branches.controller';
import { BranchesService } from './branches.service';

@Module({
  controllers: [CompaniesController, StationsController, BranchesController],
  providers: [CompaniesService, StationsService, BranchesService],
  exports: [CompaniesService, StationsService, BranchesService],
})
export class CoreModule {}
