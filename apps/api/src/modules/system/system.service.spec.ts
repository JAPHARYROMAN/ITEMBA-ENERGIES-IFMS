import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SystemService } from './system.service';
import { SystemRepository } from './system.repository';
import { AppLogger } from '../../common/logger/logger.service';
import { OpsMetricsService } from '../../common/ops/ops-metrics.service';

describe('SystemService', () => {
  let service: SystemService;
  let repo: { isDatabaseReady: jest.Mock };
  let logger: { setContext: jest.Mock; warn: jest.Mock };
  let config: { get: jest.Mock };
  let opsMetrics: { snapshot: jest.Mock };

  beforeEach(async () => {
    repo = { isDatabaseReady: jest.fn() };
    logger = { setContext: jest.fn(), warn: jest.fn() };
    config = { get: jest.fn() };
    opsMetrics = { snapshot: jest.fn(() => ({ requests: 0 })) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SystemService,
        { provide: SystemRepository, useValue: repo },
        { provide: AppLogger, useValue: logger },
        { provide: ConfigService, useValue: config },
        { provide: OpsMetricsService, useValue: opsMetrics },
      ],
    }).compile();

    service = module.get(SystemService);
  });

  it('reports liveness as ok', async () => {
    await expect(service.getLiveness()).resolves.toEqual({ status: 'ok' });
  });

  describe('getReadiness', () => {
    it('returns ok/up when the database is reachable', async () => {
      repo.isDatabaseReady.mockResolvedValue(true);
      await expect(service.getReadiness()).resolves.toEqual({ status: 'ok', database: 'up' });
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('returns error/down and logs a warning when the database is unreachable', async () => {
      repo.isDatabaseReady.mockResolvedValue(false);
      await expect(service.getReadiness()).resolves.toEqual({ status: 'error', database: 'down' });
      expect(logger.warn).toHaveBeenCalledWith('Readiness check: database is down');
    });
  });

  describe('getOpsMetrics', () => {
    it('throws NotFoundException when ops metrics are disabled', () => {
      config.get.mockReturnValue(false);
      expect(() => service.getOpsMetrics()).toThrow(NotFoundException);
      expect(opsMetrics.snapshot).not.toHaveBeenCalled();
    });

    it('returns the snapshot when ops metrics are enabled', () => {
      config.get.mockReturnValue(true);
      const snap = { requests: 5 };
      opsMetrics.snapshot.mockReturnValue(snap);
      expect(service.getOpsMetrics()).toBe(snap);
    });
  });
});
