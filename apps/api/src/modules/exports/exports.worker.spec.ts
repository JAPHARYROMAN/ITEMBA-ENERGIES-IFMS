import { Logger } from '@nestjs/common';
import { ExportsWorker } from './exports.worker';

describe('ExportsWorker', () => {
  const makeWorker = (jobs: string[] = []) => {
    const exportsService = {
      claimPendingJobs: jest.fn().mockResolvedValue(jobs),
      processExportJob: jest.fn().mockResolvedValue(undefined),
    };
    const config = {
      get: jest.fn((_key: string, fallback?: unknown) => fallback),
    };
    return {
      worker: new ExportsWorker(exportsService as any, config as any),
      exportsService,
      config,
    };
  };

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('claims pending jobs with its worker id and processes them sequentially', async () => {
    const { worker, exportsService } = makeWorker(['job-1', 'job-2']);

    await (worker as any).tick();

    expect(exportsService.claimPendingJobs).toHaveBeenCalledWith(
      expect.stringMatching(/^exports-worker-/),
      10,
    );
    expect(exportsService.processExportJob).toHaveBeenNthCalledWith(1, 'job-1');
    expect(exportsService.processExportJob).toHaveBeenNthCalledWith(2, 'job-2');
  });

  it('starts a polling interval and clears it on destroy', () => {
    jest.useFakeTimers();
    const { worker, config } = makeWorker([]);
    config.get.mockReturnValue(2);
    const tickSpy = jest.spyOn(worker as any, 'tick').mockResolvedValue(undefined);

    worker.onModuleInit();
    jest.advanceTimersByTime(2000);
    worker.onModuleDestroy();
    jest.advanceTimersByTime(4000);

    expect(tickSpy).toHaveBeenCalledTimes(1);
    expect((worker as any).timer).toBeNull();
  });

  it('logs and continues when an interval tick rejects', async () => {
    jest.useFakeTimers();
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { worker } = makeWorker([]);
    jest.spyOn(worker as any, 'tick').mockRejectedValue(new Error('db offline'));

    worker.onModuleInit();
    jest.advanceTimersByTime(10_000);
    await Promise.resolve();

    expect(warnSpy).toHaveBeenCalledWith('Export worker tick failed: db offline');
    worker.onModuleDestroy();
  });
});
