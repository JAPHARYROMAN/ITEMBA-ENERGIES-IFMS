import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DRIZZLE } from '../../database/database.module';
import { AuditService } from '../audit/audit.service';
import { ShiftsService } from './shifts.service';
import { GovernanceService } from '../governance/governance.service';
import { NotificationTriggersService } from '../notifications/notification-triggers.service';

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
  let governance: { initiateControlledActionRequest: jest.Mock };
  let notifications: { notifyShiftVariance: jest.Mock };

  const branchId = 'branch-1';
  const stationId = 'station-1';
  const companyId = 'company-1';
  const nozzleId = 'nozzle-1';
  const userId = 'user-1';

  const openShiftDto = {
    branchId,
    openingMeterReadings: [{ nozzleId, value: 1000, pricePerUnit: 1.45 }],
  };

  let configValues: Record<string, unknown>;

  beforeEach(async () => {
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    configValues = {
      ALLOW_OVERLAPPING_SHIFTS: false,
      SHIFT_VARIANCE_REQUIRE_REASON_THRESHOLD: 0,
    };
    config = {
      get: jest.fn((key: string, fallback?: unknown) =>
        key in configValues ? configValues[key] : fallback,
      ),
    };
    governance = { initiateControlledActionRequest: jest.fn().mockResolvedValue(null) };
    notifications = { notifyShiftVariance: jest.fn().mockResolvedValue(undefined) };

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
        { provide: GovernanceService, useValue: governance },
        { provide: NotificationTriggersService, useValue: notifications },
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
        execute: jest.fn().mockResolvedValue({ rows: branchRow }),
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockImplementation(() => {
              whereCallCount += 1;
              if (whereCallCount === 1) return Promise.resolve(stationRow);
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
        execute: jest.fn().mockResolvedValue({ rows: [{ id: branchId, stationId }] }),
        select: jest.fn().mockImplementation(() => ({
          from: jest.fn().mockImplementation(() => ({
            where: jest.fn().mockImplementation(() => {
              selectCallCount++;
              if (selectCallCount === 1) return Promise.resolve([{ id: stationId, companyId }]);
              if (selectCallCount === 2) return Promise.resolve([]);
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
        execute: jest.fn().mockResolvedValue({ rows: [] }),
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
      db.select
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([shift]),
          }),
        })
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([]),
          }),
        });

      const result = await service.findById('shift-1');
      expect(result).toEqual({
        ...shift,
        openingMeterReadings: [],
      });
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

  describe('findPage', () => {
    const buildListChain = (rows: unknown[]) => ({
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      offset: jest.fn().mockResolvedValue(rows),
    });

    it('returns data and total, applying all filters', async () => {
      const rows = [{ id: 's1' }];
      // First select() -> data chain; second select() -> count chain (awaited via where()).
      db.select
        .mockReturnValueOnce(buildListChain(rows))
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([{ count: 7 }]),
          }),
        });

      const result = await service.findPage({
        page: 1,
        pageSize: 10,
        branchId,
        stationId,
        companyId,
        status: 'open',
        dateFrom: '2026-01-01',
        dateTo: '2026-01-31',
      });
      expect(result).toEqual({ data: rows, total: 7 });
    });

    it('defaults total to 0 when count query is empty', async () => {
      db.select
        .mockReturnValueOnce(buildListChain([]))
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue([]) }),
        });
      const result = await service.findPage({});
      expect(result.total).toBe(0);
    });
  });

  describe('close', () => {
    const baseShift = {
      id: 'shift-1',
      companyId,
      branchId,
      stationId,
      status: 'open',
      startTime: new Date('2026-01-01T08:00:00Z'),
    };

    // Build a tx whose selects return: [shiftRow], then [openingRows].
    const buildCloseTx = (
      shiftRow: unknown,
      openingRows: unknown[],
      updateReturning: unknown[],
    ) => {
      let selectCall = 0;
      const updateMock = jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue(updateReturning),
          }),
        }),
      });
      return {
        select: jest.fn().mockImplementation(() => ({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockImplementation(() => {
              selectCall += 1;
              if (selectCall === 1) return Promise.resolve(shiftRow ? [shiftRow] : []);
              return Promise.resolve(openingRows);
            }),
          }),
        })),
        insert: jest.fn().mockReturnValue({ values: jest.fn().mockResolvedValue(undefined) }),
        update: updateMock,
        _updateMock: updateMock,
      };
    };

    const wireTx = (tx: unknown) =>
      db.transaction.mockImplementation(async (fn: (t: unknown) => Promise<unknown>) => fn(tx));

    it('throws NotFoundException when the shift does not exist', async () => {
      wireTx(buildCloseTx(null, [], []));
      await expect(
        service.close('shift-1', { closingMeterReadings: [], collections: [] } as any, { userId }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when the shift is not open', async () => {
      wireTx(buildCloseTx({ ...baseShift, status: 'closed' }, [], []));
      await expect(
        service.close('shift-1', { closingMeterReadings: [], collections: [] } as any, { userId }),
      ).rejects.toThrow(/not open/);
    });

    it('throws when a closing reading has no matching opening reading', async () => {
      wireTx(buildCloseTx(baseShift, [], []));
      await expect(
        service.close(
          'shift-1',
          { closingMeterReadings: [{ nozzleId, value: 1100 }], collections: [] } as any,
          { userId },
        ),
      ).rejects.toThrow(/No opening reading/);
    });

    it('throws when a closing reading is below the opening reading', async () => {
      wireTx(buildCloseTx(baseShift, [{ nozzleId, value: '1000', pricePerUnit: '1.5' }], []));
      await expect(
        service.close(
          'shift-1',
          { closingMeterReadings: [{ nozzleId, value: 900 }], collections: [] } as any,
          { userId },
        ),
      ).rejects.toThrow(/must be >= opening/);
    });

    it('requires a variance reason when variance is non-zero (threshold 0)', async () => {
      // opening 1000 @1.5; closing 1100 => 100L => expected 150. collected 140 => variance -10.
      wireTx(buildCloseTx(baseShift, [{ nozzleId, value: '1000', pricePerUnit: '1.5' }], []));
      await expect(
        service.close(
          'shift-1',
          {
            closingMeterReadings: [{ nozzleId, value: 1100 }],
            collections: [{ paymentMethod: 'Cash', amount: 140 }],
          } as any,
          { userId },
        ),
      ).rejects.toThrow(/Variance reason is required/);
    });

    it('closes cleanly with zero variance and notifies nothing', async () => {
      const closed = { ...baseShift, status: 'closed' };
      const tx = buildCloseTx(
        baseShift,
        [{ nozzleId, value: '1000', pricePerUnit: '1.5' }],
        [closed],
      );
      wireTx(tx);
      const result = await service.close(
        'shift-1',
        {
          closingMeterReadings: [{ nozzleId, value: 1100 }],
          collections: [{ paymentMethod: 'Cash', amount: 150 }],
        } as any,
        { userId },
      );
      expect(result.status).toBe('closed');
      expect(notifications.notifyShiftVariance).not.toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'close' }),
        expect.anything(),
      );
    });

    it('closes with non-zero variance under threshold and fires a variance notification', async () => {
      // High threshold so no governance approval, but reason allowed and notification fires.
      configValues.SHIFT_VARIANCE_REQUIRE_REASON_THRESHOLD = 1000;
      const closed = { ...baseShift, status: 'closed' };
      wireTx(
        buildCloseTx(baseShift, [{ nozzleId, value: '1000', pricePerUnit: '1.5' }], [closed]),
      );
      const result = await service.close(
        'shift-1',
        {
          closingMeterReadings: [{ nozzleId, value: 1100 }],
          collections: [{ paymentMethod: 'Cash', amount: 160 }], // variance +10
        } as any,
        { userId },
      );
      expect(result.status).toBe('closed');
      expect(notifications.notifyShiftVariance).toHaveBeenCalledWith(
        expect.objectContaining({ varianceType: 'overage', varianceAmount: 10 }),
      );
    });

    it('routes to pending-approval (maker-checker) when variance exceeds threshold and governance returns a request', async () => {
      governance.initiateControlledActionRequest.mockResolvedValue({ id: 'gov-1' });
      const pending = { ...baseShift, status: 'pending_approval' };
      const tx = buildCloseTx(
        baseShift,
        [{ nozzleId, value: '1000', pricePerUnit: '1.5' }],
        [pending],
      );
      wireTx(tx);
      const result = await service.close(
        'shift-1',
        {
          closingMeterReadings: [{ nozzleId, value: 1100 }],
          collections: [{ paymentMethod: 'Cash', amount: 100 }], // variance -50 > threshold 0
          varianceReason: 'till miscount',
        } as any,
        { userId },
      );
      expect(governance.initiateControlledActionRequest).toHaveBeenCalled();
      expect(result.status).toBe('pending_approval');
      // No closing readings inserted on the approval path.
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'close_submitted_for_approval' }),
        expect.anything(),
      );
      // Notification only fires on the direct-close path.
      expect(notifications.notifyShiftVariance).not.toHaveBeenCalled();
    });

    it('continues to direct close when governance returns null even past threshold', async () => {
      governance.initiateControlledActionRequest.mockResolvedValue(null);
      const closed = { ...baseShift, status: 'closed' };
      wireTx(
        buildCloseTx(baseShift, [{ nozzleId, value: '1000', pricePerUnit: '1.5' }], [closed]),
      );
      const result = await service.close(
        'shift-1',
        {
          closingMeterReadings: [{ nozzleId, value: 1100 }],
          collections: [{ paymentMethod: 'Cash', amount: 100 }],
          varianceReason: 'reason',
        } as any,
        { userId },
      );
      expect(result.status).toBe('closed');
      expect(notifications.notifyShiftVariance).toHaveBeenCalledWith(
        expect.objectContaining({ varianceType: 'shortage' }),
      );
    });

    it('does not throw when the variance notification itself fails', async () => {
      configValues.SHIFT_VARIANCE_REQUIRE_REASON_THRESHOLD = 1000;
      notifications.notifyShiftVariance.mockRejectedValue(new Error('notify down'));
      const closed = { ...baseShift, status: 'closed' };
      wireTx(
        buildCloseTx(baseShift, [{ nozzleId, value: '1000', pricePerUnit: '1.5' }], [closed]),
      );
      await expect(
        service.close(
          'shift-1',
          {
            closingMeterReadings: [{ nozzleId, value: 1100 }],
            collections: [{ paymentMethod: 'Cash', amount: 160 }],
          } as any,
          { userId },
        ),
      ).resolves.toMatchObject({ status: 'closed' });
    });
  });

  describe('submitForApproval', () => {
    const buildSingleSelect = (rows: unknown[]) =>
      db.select.mockReturnValue({
        from: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(rows) }),
      });
    const buildUpdate = (rows: unknown[]) =>
      db.update.mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({ returning: jest.fn().mockResolvedValue(rows) }),
        }),
      });

    it('throws NotFoundException when shift missing', async () => {
      buildSingleSelect([]);
      await expect(service.submitForApproval('shift-1', { userId })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rejects shifts that are not closed', async () => {
      buildSingleSelect([{ id: 'shift-1', status: 'open' }]);
      await expect(service.submitForApproval('shift-1', { userId })).rejects.toThrow(
        /Only closed shifts/,
      );
    });

    it('rejects shifts already submitted', async () => {
      buildSingleSelect([
        { id: 'shift-1', status: 'closed', submittedForApprovalAt: new Date() },
      ]);
      await expect(service.submitForApproval('shift-1', { userId })).rejects.toThrow(
        /already submitted/,
      );
    });

    it('transitions a closed shift to pending approval', async () => {
      buildSingleSelect([
        { id: 'shift-1', status: 'closed', submittedForApprovalAt: null },
      ]);
      buildUpdate([{ id: 'shift-1', status: 'pending_approval' }]);
      const result = await service.submitForApproval('shift-1', { userId });
      expect(result.status).toBe('pending_approval');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'submit_for_approval' }),
      );
    });
  });

  describe('approve', () => {
    const buildSingleSelect = (rows: unknown[]) =>
      db.select.mockReturnValue({
        from: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(rows) }),
      });
    const buildUpdate = (rows: unknown[]) =>
      db.update.mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({ returning: jest.fn().mockResolvedValue(rows) }),
        }),
      });

    it('throws NotFoundException when shift missing', async () => {
      buildSingleSelect([]);
      await expect(service.approve('shift-1', { userId })).rejects.toThrow(NotFoundException);
    });

    it('rejects shifts that are not pending approval', async () => {
      buildSingleSelect([{ id: 'shift-1', status: 'closed' }]);
      await expect(service.approve('shift-1', { userId })).rejects.toThrow(BadRequestException);
    });

    it('approves a pending shift and writes an audit log', async () => {
      buildSingleSelect([{ id: 'shift-1', status: 'pending_approval' }]);
      buildUpdate([{ id: 'shift-1', status: 'approved' }]);
      const result = await service.approve('shift-1', { userId });
      expect(result.status).toBe('approved');
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'approve' }));
    });
  });
});
