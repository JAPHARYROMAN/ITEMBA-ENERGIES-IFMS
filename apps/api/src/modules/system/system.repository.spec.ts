import { Test, TestingModule } from '@nestjs/testing';
import { DRIZZLE } from '../../database/database.module';
import { SystemRepository } from './system.repository';

describe('SystemRepository', () => {
  let repo: SystemRepository;
  let db: { execute: jest.Mock };

  beforeEach(async () => {
    db = { execute: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [SystemRepository, { provide: DRIZZLE, useValue: db }],
    }).compile();
    repo = module.get(SystemRepository);
  });

  it('returns true when the probe query succeeds', async () => {
    db.execute.mockResolvedValue([{ '?column?': 1 }]);
    await expect(repo.isDatabaseReady()).resolves.toBe(true);
    expect(db.execute).toHaveBeenCalledTimes(1);
  });

  it('returns false when the probe query throws', async () => {
    db.execute.mockRejectedValue(new Error('connection refused'));
    await expect(repo.isDatabaseReady()).resolves.toBe(false);
  });
});
