import { TokenCleanupService } from './token-cleanup.service';

function cleanupDb(result: unknown) {
  const where = jest.fn().mockResolvedValue(result);
  const db = {
    delete: jest.fn(() => ({ where })),
  };
  return { db, where };
}

describe('TokenCleanupService', () => {
  it('deletes expired or revoked refresh tokens and returns rowCount', async () => {
    const { db, where } = cleanupDb({ rowCount: 3 });
    const service = new TokenCleanupService(db as any);

    await expect(service.cleanup()).resolves.toEqual({ deleted: 3 });

    expect(db.delete).toHaveBeenCalledTimes(1);
    expect(where).toHaveBeenCalledTimes(1);
  });

  it('defaults deleted count to zero when the driver result omits rowCount', async () => {
    const { db } = cleanupDb({});
    const service = new TokenCleanupService(db as any);

    await expect(service.cleanup()).resolves.toEqual({ deleted: 0 });
  });

  it('logs successful scheduled cleanups', async () => {
    const service = new TokenCleanupService({} as any);
    jest.spyOn(service, 'cleanup').mockResolvedValue({ deleted: 4 });
    jest.spyOn((service as any).logger, 'log').mockImplementation(() => undefined);

    await service.handleCleanup();

    expect((service as any).logger.log).toHaveBeenCalledWith(
      'Token cleanup complete: 4 tokens removed',
    );
  });

  it('logs and swallows cleanup failures from the scheduler', async () => {
    const service = new TokenCleanupService({} as any);
    const error = new Error('database unavailable');
    jest.spyOn(service, 'cleanup').mockRejectedValue(error);
    jest.spyOn((service as any).logger, 'error').mockImplementation(() => undefined);

    await expect(service.handleCleanup()).resolves.toBeUndefined();
    expect((service as any).logger.error).toHaveBeenCalledWith(
      'Token cleanup failed: database unavailable',
      error.stack,
    );
  });
});
