import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { AppLogger } from '../logger/logger.service';
import { OpsMetricsService } from '../ops/ops-metrics.service';

@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  constructor(
    private readonly logger: AppLogger,
    private readonly opsMetrics: OpsMetricsService,
  ) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const startedAt = Date.now();
    const requestId = (req as Request & { id?: string }).id ?? 'n/a';

    this.logger.log(
      `request:start id=${requestId} method=${req.method} path=${req.originalUrl}`,
      'HTTP',
    );

    res.on('finish', () => {
      const durationMs = Date.now() - startedAt;
      this.opsMetrics.recordRequest(durationMs);
      this.logger.log(
        `request:end id=${requestId} method=${req.method} path=${req.originalUrl} status=${res.statusCode} durationMs=${durationMs}`,
        'HTTP',
      );
    });

    next();
  }
}
