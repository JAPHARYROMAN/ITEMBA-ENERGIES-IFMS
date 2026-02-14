import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SystemRepository } from './system.repository';
import { AppLogger } from '../../common/logger/logger.service';
import { OpsMetricsService } from '../../common/ops/ops-metrics.service';

@Injectable()
export class SystemService {
  constructor(
    private readonly systemRepository: SystemRepository,
    private readonly logger: AppLogger,
    private readonly config: ConfigService,
    private readonly opsMetrics: OpsMetricsService,
  ) {
    this.logger.setContext(SystemService.name);
  }

  async getLiveness(): Promise<{ status: string }> {
    return { status: 'ok' };
  }

  async getReadiness(): Promise<{ status: string; database: string }> {
    const dbOk = await this.systemRepository.isDatabaseReady();
    const database = dbOk ? 'up' : 'down';
    if (!dbOk) this.logger.warn('Readiness check: database is down');
    return {
      status: dbOk ? 'ok' : 'degraded',
      database,
    };
  }

  getOpsMetrics() {
    const enabled = this.config.get<boolean>('OPS_METRICS_ENABLED', false);
    if (!enabled) {
      throw new NotFoundException('ops metrics endpoint is disabled');
    }
    return this.opsMetrics.snapshot();
  }
}
