import { HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { SystemController } from './system.controller';
import type { SystemService } from './system.service';

describe('SystemController', () => {
  let systemService: { getLiveness: jest.Mock; getReadiness: jest.Mock; getOpsMetrics: jest.Mock };
  let controller: SystemController;

  beforeEach(() => {
    systemService = {
      getLiveness: jest.fn(),
      getReadiness: jest.fn(),
      getOpsMetrics: jest.fn(),
    };
    controller = new SystemController(systemService as unknown as SystemService);
  });

  it('marks health endpoints as public', () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, controller.getLiveness)).toBe(true);
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, controller.getReadiness)).toBe(true);
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, controller.getOpsMetrics)).toBeUndefined();
  });

  it('returns readiness without changing status when database is up', async () => {
    const readiness = { status: 'ok' as const, database: 'up' as const };
    const response = { status: jest.fn() } as unknown as Response;
    systemService.getReadiness.mockResolvedValue(readiness);

    await expect(controller.getReadiness(response)).resolves.toEqual(readiness);
    expect(response.status).not.toHaveBeenCalled();
  });

  it('sets HTTP 503 when database readiness fails', async () => {
    const readiness = { status: 'error' as const, database: 'down' as const };
    const response = { status: jest.fn() } as unknown as Response;
    systemService.getReadiness.mockResolvedValue(readiness);

    await expect(controller.getReadiness(response)).resolves.toEqual(readiness);
    expect(response.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
  });
});
