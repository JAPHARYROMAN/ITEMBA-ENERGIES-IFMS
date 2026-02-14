import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiExcludeEndpoint } from '@nestjs/swagger';
import { SystemService } from './system.service';

@ApiTags('System')
@Controller()
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  @Get('health/live')
  @ApiExcludeEndpoint()
  getLiveness() {
    return this.systemService.getLiveness();
  }

  @Get('health/ready')
  @ApiExcludeEndpoint()
  getReadiness() {
    return this.systemService.getReadiness();
  }

  @Get('ops/metrics')
  @ApiExcludeEndpoint()
  getOpsMetrics() {
    return this.systemService.getOpsMetrics();
  }
}
