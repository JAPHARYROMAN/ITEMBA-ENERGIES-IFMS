import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { DRIZZLE } from '../../database/database.module';
import { AuditService } from '../audit/audit.service';
import { NotificationTriggersService } from '../notifications/notification-triggers.service';
import { createDrizzleMock, DrizzleMock } from '../setup/__testutils__/drizzle-mock';

const mockAudit = { log: jest.fn() };
const mockNotifications = { notifyShrinkageVariance: jest.fn() };

describe('InventoryService', () => {
  let service: InventoryService;
  let drizzle: DrizzleMock;

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
    const ctx = { userId: 'u1' };

    it('throws NotFoundException when branch missing', async () => {
      drizzle.queue([]);
      await expect(service.createDip(dto, ctx)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when tank missing', async () => {
      drizzle.queue([{ id: 'b1', stationId: 's1' }]); // branch
      drizzle.queue([{ id: 's1', companyId: 'c1' }]); // station
      drizzle.queue([]); // tank
      await expect(service.createDip(dto, ctx)).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when tank belongs to a different branch', async () => {
      drizzle.queue([{ id: 'b1', stationId: 's1' }]);
      drizzle.queue([{ id: 's1', companyId: 'c1' }]);
      drizzle.queue([{ id: 't1', branchId: 'OTHER' }]);
      await expect(service.createDip(dto, ctx)).rejects.toThrow(BadRequestException);
    });

    it('inserts the dip and audits on success', async () => {
      drizzle.queue([{ id: 'b1', stationId: 's1' }]);
      drizzle.queue([{ id: 's1', companyId: 'c1' }]);
      drizzle.queue([{ id: 't1', branchId: 'b1' }]);
      const dip = { id: 'dip1', tankId: 't1' };
      drizzle.queue([dip]); // returning
      const res = await service.createDip(dto, ctx);
      expect(res).toEqual(dip);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'tank_dips', action: 'create' }),
      );
    });
  });

  describe('findDipById', () => {
    it('throws NotFoundException when missing', async () => {
      drizzle.queue([]);
      await expect(service.findDipById('x')).rejects.toThrow(NotFoundException);
    });
  });

  describe('createReconciliation', () => {
    const baseDto: any = {
      branchId: 'b1',
      reconciliationDate: '2026-01-01',
      actualVolume: 1000,
    };
    const ctx = { userId: 'u1' };

    it('throws NotFoundException when branch missing', async () => {
      drizzle.queue([]);
      await expect(service.createReconciliation(baseDto, ctx)).rejects.toThrow(NotFoundException);
    });

    it('computes expected volume from branch tanks and records a reconciliation', async () => {
      drizzle.queue([{ id: 'b1', stationId: 's1' }]); // branch
      drizzle.queue([{ id: 's1', companyId: 'c1' }]); // station
      drizzle.queue([{ id: 't1', currentLevel: '600' }, { id: 't2', currentLevel: '400' }]); // tanks -> expected 1000
      const rec = { id: 'rec1', variance: '0.000' };
      drizzle.queue([rec]); // returning -> variance 0, no variance row
      const res = await service.createReconciliation(baseDto, ctx);
      expect(res).toEqual(rec);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'reconciliations', action: 'create' }),
      );
    });

    it('records a variance row when actual differs from expected', async () => {
      drizzle.queue([{ id: 'b1', stationId: 's1' }]);
      drizzle.queue([{ id: 's1', companyId: 'c1' }]);
      drizzle.queue([{ id: 't1', currentLevel: '500' }]); // expected 500, actual 1000 -> variance 500
      drizzle.queue([{ id: 'rec1' }]); // reconciliation returning
      drizzle.queue([{ id: 'var1' }]); // variance returning
      const res = await service.createReconciliation(baseDto, ctx);
      expect(res).toEqual({ id: 'rec1' });
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'variances', action: 'create' }),
      );
    });

    it('honours an explicit valid variance classification', async () => {
      const dto = { ...baseDto, actualVolume: 100, varianceClassification: 'theft' };
      drizzle.queue([{ id: 'b1', stationId: 's1' }]);
      drizzle.queue([{ id: 's1', companyId: 'c1' }]);
      drizzle.queue([{ id: 't1', currentLevel: '500' }]); // expected 500, actual 100 -> variance -400
      drizzle.queue([{ id: 'rec1' }]);
      drizzle.queue([{ id: 'var1' }]);
      const res = await service.createReconciliation(dto, ctx);
      expect(res).toEqual({ id: 'rec1' });
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          entity: 'variances',
          action: 'create',
          after: expect.objectContaining({ classification: 'theft' }),
        }),
      );
      // 'shrinkage' is not a stored classification, so the notification branch
      // is never reached for reconciliation-level variances.
      expect(mockNotifications.notifyShrinkageVariance).not.toHaveBeenCalled();
    });
  });

  describe('list queries', () => {
    it('findReconciliationsPage returns data and total', async () => {
      drizzle.queue([{ id: 'rec1' }]);
      drizzle.queue([{ count: 2 }]);
      const res = await service.findReconciliationsPage({ branchId: 'b1', status: 'completed' });
      expect(res.total).toBe(2);
    });

    it('findVariancesPage returns data and total', async () => {
      drizzle.queue([{ id: 'var1' }]);
      drizzle.queue([{ count: 1 }]);
      const res = await service.findVariancesPage({ classification: 'shrinkage' });
      expect(res.total).toBe(1);
    });

    it('findDipsPage returns data and total', async () => {
      drizzle.queue([{ id: 'dip1' }]);
      drizzle.queue([{ count: 4 }]);
      const res = await service.findDipsPage({ tankId: 't1', dateFrom: '2026-01-01' });
      expect(res.total).toBe(4);
    });

    it('findReconciliationById throws NotFoundException when missing', async () => {
      drizzle.queue([]);
      await expect(service.findReconciliationById('x')).rejects.toThrow(NotFoundException);
    });
  });
});
