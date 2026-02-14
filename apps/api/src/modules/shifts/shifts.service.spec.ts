import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { DRIZZLE } from '../../database/database.module';
import { AuditService } from '../audit/audit.service';
import { ShiftsService } from './shifts.service';

describe('ShiftsService', () => {
  let service: ShiftsService;
  let db: {
    select: jest.Mock;
    insert: jest.Mock;
    update: jest.Mock;
    transaction: jest.Mock;
  };
  let audit: { log: jest.Mock };
  let config: { get: jest.Mock };

  const branchId = 'branch-1';
  const stationId = 'station-1';
  const companyId = 'company-1';
  const nozzleId = 'nozzle-1';
  const userId = 'user-1';

  const openShiftDto = {
    branchId,
    openingMeterReadings: [{ nozzleId, value: 1000, pricePerUnit: 1.45 }],
  };

  beforeEach(async () => {
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    config = { get: jest.fn((key: string) => (key === 'ALLOW_OVERLAPPING_SHIFTS' ? false : (key === 'SHIFT_VARIANCE_REQUIRE_REASON_THRESHOLD' ? 0 : undefined))) };

    const defaultSelectChain = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      offset: jest.fn().mockResolvedValue([]),
    };
    db = {
      select: jest.fn().mockReturnValue(defaultSelectChain),
      insert: jest.fn(),
      update: jest.fn(),
      transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShiftsService,
        { provide: DRIZZLE, useValue: db },
        { provide: AuditService, useValue: audit },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    service = module.get<ShiftsService>(ShiftsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('open', () => {
    it('should throw ConflictException when branch already has an open shift (no overlapping allowed)', async () => {
      const existingOpenShift = { id: 'shift-existing', status: 'open' };
      const branchRow = [{ id: branchId, stationId }];
      const stationRow = [{ id: stationId, companyId }];
      const existingShiftRow = [existingOpenShift];
      let whereCallCount = 0;
      const tx = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockImplementation(() => {
              whereCallCount += 1;
              if (whereCallCount === 1) return Promise.resolve(branchRow);
              if (whereCallCount === 2) return Promise.resolve(stationRow);
              return Promise.resolve(existingShiftRow);
            }),
          }),
        }),
        insert: jest.fn().mockReturnValue({ values: jest.fn().mockReturnValue({ returning: jest.fn().mockResolvedValue([]) }) }),
        update: jest.fn(),
      };
      db.transaction.mockImplementation(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx));

      await expect(
        service.open(openShiftDto, { userId }),
      ).rejects.toThrow(ConflictException);
      await expect(
        service.open(openShiftDto, { userId }),
      ).rejects.toThrow(/already has an open shift/);
    });

    it('should open shift when no existing open shift for branch', async () => {
      const newShift = {
        id: 'shift-new',
        companyId,
        branchId,
        stationId,
        code: 'SH-123',
        type: 'standard',
        startTime: new Date(),
        endTime: null,
        status: 'open',
        openedBy: userId,
        closedBy: null,
        totalExpectedAmount: null,
        totalCollectedAmount: null,
        varianceAmount: null,
        varianceReason: null,
        submittedForApprovalAt: null,
        approvedAt: null,
        approvedBy: null,
        createdAt: new Date(),
      };
      let selectCallCount = 0;
      const tx = {
        select: jest.fn().mockImplementation(() => ({
          from: jest.fn().mockImplementation(() => ({
            where: jest.fn().mockImplementation(() => {
              selectCallCount++;
              if (selectCallCount === 1) return Promise.resolve([{ id: branchId, stationId }]);
              if (selectCallCount === 2) return Promise.resolve([{ id: stationId, companyId }]);
              if (selectCallCount === 3) return Promise.resolve([]);
              return Promise.resolve([]);
            }),
          })),
        })),
        insert: jest.fn()
          .mockReturnValueOnce({ values: () => ({ returning: () => Promise.resolve([newShift]) }) })
          .mockReturnValue({ values: () => ({ returning: () => Promise.resolve([]) }) }),
        update: jest.fn(),
      };
      db.transaction.mockImplementation(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx));

      const result = await service.open(openShiftDto, { userId });
      expect(result).toBeDefined();
      expect(result.status).toBe('open');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          entity: 'shifts',
          action: 'open',
          userId,
        }),
        expect.anything(),
      );
    });

    it('should throw NotFoundException when branch not found', async () => {
      const tx = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([]),
          }),
        }),
        insert: jest.fn(),
        update: jest.fn(),
      };
      db.transaction.mockImplementation(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx));

      await expect(service.open(openShiftDto, { userId })).rejects.toThrow(NotFoundException);
      await expect(service.open(openShiftDto, { userId })).rejects.toThrow('Branch not found');
    });
  });

  describe('findById', () => {
    it('should return shift when found', async () => {
      const shift = {
        id: 'shift-1',
        companyId,
        branchId,
        stationId,
        code: 'SH-1',
        type: 'standard',
        startTime: new Date(),
        endTime: null,
        status: 'open',
        openedBy: userId,
        closedBy: null,
        totalExpectedAmount: null,
        totalCollectedAmount: null,
        varianceAmount: null,
        varianceReason: null,
        submittedForApprovalAt: null,
        approvedAt: null,
        approvedBy: null,
        createdAt: new Date(),
      };
      db.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([shift]),
        }),
      });

      const result = await service.findById('shift-1');
      expect(result).toEqual(shift);
    });

    it('should throw NotFoundException when shift not found', async () => {
      db.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([]),
        }),
      });

      await expect(service.findById('missing')).rejects.toThrow(NotFoundException);
      await expect(service.findById('missing')).rejects.toThrow('Shift not found');
    });
  });
});
