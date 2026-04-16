import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExportsService } from './exports.service';

@Injectable()
export class ExportsWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExportsWorker.name);
  private timer: NodeJS.Timeout | null = null;
  private readonly workerId = `exports-worker-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  constructor(private readonly exportsService: ExportsService, private readonly config: ConfigService) {}

  onModuleInit(): void {
    const intervalSec = this.config.get<number>('EXPORT_OUTBOX_POLL_INTERVAL_SECONDS', 10);
    this.timer = setInterval(() => {
      this.tick().catch((err) => {
        this.logger.warn(`Export worker tick failed: ${err.message}`);
      });
    }, intervalSec * 1000);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async tick(): Promise<void> {
    const jobs = await this.exportsService.claimPendingJobs(this.workerId, 10);
    for (const jobId of jobs) {
      await this.exportsService.processExportJob(jobId);
    }
  }
}
