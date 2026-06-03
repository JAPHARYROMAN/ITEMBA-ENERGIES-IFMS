import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiTags, ApiExcludeEndpoint } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { SystemService } from './system.service';

@ApiTags('System')
@Controller()
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  @Get('health/live')
  @Public()
  @SkipThrottle({ short: true, medium: true })
  @ApiExcludeEndpoint()
  getLiveness() {
    return this.systemService.getLiveness();
  }

  @Get('health/ready')
  @Public()
  @SkipThrottle({ short: true, medium: true })
  @ApiExcludeEndpoint()
  async getReadiness(@Res({ passthrough: true }) res: Response) {
    const readiness = await this.systemService.getReadiness();
    if (readiness.status !== 'ok') {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return readiness;
  }

  @Get('ops/metrics')
  @ApiExcludeEndpoint()
  getOpsMetrics() {
    return this.systemService.getOpsMetrics();
  }
}
