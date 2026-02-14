import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { TanksController } from './tanks.controller';
import { TanksService } from './tanks.service';
import { PumpsController } from './pumps.controller';
import { PumpsService } from './pumps.service';
import { NozzlesController } from './nozzles.controller';
import { NozzlesService } from './nozzles.service';

@Module({
  controllers: [ProductsController, TanksController, PumpsController, NozzlesController],
  providers: [ProductsService, TanksService, PumpsService, NozzlesService],
  exports: [ProductsService, TanksService, PumpsService, NozzlesService],
})
export class SetupModule {}
