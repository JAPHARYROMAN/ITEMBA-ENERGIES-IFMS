import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { DRIZZLE } from '../../database/database.module';
import { AuditService } from '../audit/audit.service';
import { NotificationTriggersService } from '../notifications/notification-triggers.service';
import { createDrizzleMock, DrizzleMock } from '../setup/__testutils__/drizzle-mock';

const mockAudit = { log: jest.fn() };
const mockNotifications = { notifyShrinkageVariance: jest.fn() };

describe('InventoryService edge cases', () => {
  let service: InventoryService;
  let drizzle: DrizzleMock;
  const ctx = { userId: 'u1' };

  beforeEach(async () => {
    mockAudit.log.mockClear();
    mockNotifications.notifyShrinkageVariance.mockReset();
    drizzle = createDrizzleMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryService,
        { provide: DRIZZLE, useValue: drizzle.db },
        { provide: AuditService, useValue: mockAudit },
        { provide: NotificationTriggersService, useValue: mockNotifications },
      ],
    }).compile();
    service = module.get(InventoryService);
  });

  afterEach(() => drizzle.reset());

  describe('createDip', () => {
    const dto: any = { branchId: 'b1', tankId: 't1', dipDate: '2026-01-01', volume: 500 };

    it('throws NotFoundException when the station is missing', async () => {
      drizzle.queue([{ id: 'b1', stationId: 's1' }]); // branch
      drizzle.queue([]); // station missing
      await expect(service.createDip(dto, ctx)).rejects.toThrow(NotFoundException);
    });

    it('persists waterLevel and temperature when provided', async () => {
      const fullDto = { ...dto, waterLevel: 12, temperature: 25 };
      drizzle.queue([{ id: 'b1', stationId: 's1' }]);
      drizzle.queue([{ id: 's1', companyId: 'c1' }]);
      drizzle.queue([{ id: 't1', branchId: 'b1' }]);
      drizzle.queue([{ id: 'dip1' }]); // returning
      await service.createDip(fullDto, ctx);
      const values = drizzle.db.values.mock.calls[0][0];
      expect(values.waterLevel).toBe('12');
      expect(values.temperature).toBe('25');
    });

    it('stores null for optional sensor fields when absent', async () => {
      drizzle.queue([{ id: 'b1', stationId: 's1' }]);
      drizzle.queue([{ id: 's1', companyId: 'c1' }]);
      drizzle.queue([{ id: 't1', branchId: 'b1' }]);
      drizzle.queue([{ id: 'dip1' }]);
      await service.createDip(dto, ctx);
      const values = drizzle.db.values.mock.calls[0][0];
      expect(values.waterLevel).toBeNull();
      expect(values.temperature).toBeNull();
    });
  });

  describe('createReconciliation', () => {
    const baseDto: any = { branchId: 'b1', reconciliationDate: '2026-01-01', actualVolume: 1000 };

    it('throws NotFoundException when the station is missing', async () => {
      drizzle.queue([{ id: 'b1', stationId: 's1' }]);
      drizzle.queue([]); // station missing
      await expect(service.createReconciliation(baseDto, ctx)).rejects.toThrow(NotFoundException);
    });

    it('treats an empty tank list as zero expected volume', async () => {
      const dto = { ...baseDto, actualVolume: 50 };
      drizzle.queue([{ id: 'b1', stationId: 's1' }]);
      drizzle.queue([{ id: 's1', companyId: 'c1' }]);
      drizzle.queue([]); // no tanks -> expected 0, variance +50 -> 'unknown'
      drizzle.queue([{ id: 'rec1' }]); // reconciliation
      drizzle.queue([{ id: 'var1' }]); // variance
      await service.createReconciliation(dto, ctx);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          entity: 'variances',
          after: expect.objectContaining({ classification: 'unknown' }),
        }),
      );
      // expectedVolume === 0 -> variancePercentage guarded to 0 (no shrinkage anyway).
      expect(mockNotifications.notifyShrinkageVariance).not.toHaveBeenCalled();
    });

    it('classifies a negative variance exactly at the threshold as shrinkage and alerts', async () => {
      // expected 600, actual 500 -> variance -100 == -threshold -> shrinkage
      const dto = { ...baseDto, actualVolume: 500 };
      drizzle.queue([{ id: 'b1', stationId: 's1' }]);
      drizzle.queue([{ id: 's1', companyId: 'c1' }]);
      drizzle.queue([{ id: 't1', currentLevel: '600' }]);
      drizzle.queue([{ id: 'rec1' }]);
      drizzle.queue([{ id: 'var1' }]);
      await service.createReconciliation(dto, ctx);
      expect(mockNotifications.notifyShrinkageVariance).toHaveBeenCalledWith(
        expect.objectContaining({ thresholdValue: 100 }),
      );
    });

    it('falls back to auto-classification when an invalid classification is supplied', async () => {
      // 'not-a-real-class' is not in VARIANCE_CLASSIFICATIONS -> use auto ('shrinkage')
      const dto = { ...baseDto, actualVolume: 100, varianceClassification: 'not-a-real-class' };
      drizzle.queue([{ id: 'b1', stationId: 's1' }]);
      drizzle.queue([{ id: 's1', companyId: 'c1' }]);
      drizzle.queue([{ id: 't1', currentLevel: '500' }]); // variance -400 -> shrinkage
      drizzle.queue([{ id: 'rec1' }]);
      drizzle.queue([{ id: 'var1' }]);
      await service.createReconciliation(dto, ctx);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          entity: 'variances',
          after: expect.objectContaining({ classification: 'shrinkage' }),
        }),
      );
    });

    it('does not throw when the shrinkage notification trigger fails', async () => {
      const dto = { ...baseDto, actualVolume: 100 };
      mockNotifications.notifyShrinkageVariance.mockRejectedValueOnce(new Error('notif down'));
      drizzle.queue([{ id: 'b1', stationId: 's1' }]);
      drizzle.queue([{ id: 's1', companyId: 'c1' }]);
      drizzle.queue([{ id: 't1', currentLevel: '500' }]);
      drizzle.queue([{ id: 'rec1' }]);
      drizzle.queue([{ id: 'var1' }]);
      // Should resolve despite the notification rejection (error is swallowed/logged).
      await expect(service.createReconciliation(dto, ctx)).resolves.toEqual({ id: 'rec1' });
    });

    it('trims notes and stores null when blank', async () => {
      const dto = { ...baseDto, actualVolume: 1000, notes: '   ' };
      drizzle.queue([{ id: 'b1', stationId: 's1' }]);
      drizzle.queue([{ id: 's1', companyId: 'c1' }]);
      drizzle.queue([{ id: 't1', currentLevel: '1000' }]); // variance 0 -> no variance row
      drizzle.queue([{ id: 'rec1' }]);
      await service.createReconciliation(dto, ctx);
      const values = drizzle.db.values.mock.calls[0][0];
      expect(values.notes).toBeNull();
    });
  });
});
