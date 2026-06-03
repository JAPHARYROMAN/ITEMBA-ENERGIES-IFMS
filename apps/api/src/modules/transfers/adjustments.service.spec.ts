import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdjustmentsService } from './adjustments.service';
import { DRIZZLE } from '../../database/database.module';
import { AuditService } from '../audit/audit.service';
import { GovernanceService } from '../governance/governance.service';
import { createDrizzleMock, DrizzleMock } from '../setup/__testutils__/drizzle-mock';

const mockAudit = { log: jest.fn() };
const mockGovernance = { initiateControlledActionRequest: jest.fn() };

describe('AdjustmentsService', () => {
  let service: AdjustmentsService;
  let drizzle: DrizzleMock;

  beforeEach(async () => {
    mockAudit.log.mockClear();
    mockGovernance.initiateControlledActionRequest.mockReset();
    drizzle = createDrizzleMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdjustmentsService,
        { provide: DRIZZLE, useValue: drizzle.db },
        { provide: AuditService, useValue: mockAudit },
        { provide: GovernanceService, useValue: mockGovernance },
      ],
    }).compile();
    service = module.get(AdjustmentsService);
  });

  afterEach(() => drizzle.reset());

  describe('findPage', () => {
    it('returns data and total with filters', async () => {
      drizzle.queue([{ id: 'a1' }]);
      drizzle.queue([{ count: 5 }]);
      const res = await service.findPage({
        branchId: 'b1',
        companyId: 'c1',
        tankId: 't1',
        dateFrom: '2026-01-01',
        dateTo: '2026-12-31',
      });
      expect(res.total).toBe(5);
      expect(res.data).toHaveLength(1);
    });
  });

  describe('findById', () => {
    it('throws NotFoundException when missing', async () => {
      drizzle.queue([]);
      await expect(service.findById('x')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    const dto: any = {
      branchId: 'b1',
      tankId: 't1',
      volumeDelta: 100,
      reason: 'spillage',
      notes: '  note  ',
    };
    const ctx = { userId: 'u1', ip: '1.2.3.4', userAgent: 'jest' };

    it('throws NotFoundException when branch missing', async () => {
      drizzle.queue([]); // branch lookup
      await expect(service.create(dto, ctx)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when station missing', async () => {
      drizzle.queue([{ id: 'b1', stationId: 's1' }]); // branch
      drizzle.queue([]); // station
      await expect(service.create(dto, ctx)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when tank missing', async () => {
      drizzle.queue([{ id: 'b1', stationId: 's1' }]);
      drizzle.queue([{ id: 's1', companyId: 'c1' }]);
      drizzle.queue([]); // tank
      await expect(service.create(dto, ctx)).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when tank belongs to a different branch', async () => {
      drizzle.queue([{ id: 'b1', stationId: 's1' }]);
      drizzle.queue([{ id: 's1', companyId: 'c1' }]);
      drizzle.queue([{ id: 't1', branchId: 'OTHER', capacity: '1000', currentLevel: '500' }]);
      await expect(service.create(dto, ctx)).rejects.toThrow(BadRequestException);
    });

    it('inserts a pending record when governance approval is required', async () => {
      drizzle.queue([{ id: 'b1', stationId: 's1' }]);
      drizzle.queue([{ id: 's1', companyId: 'c1' }]);
      drizzle.queue([{ id: 't1', branchId: 'b1', capacity: '1000', currentLevel: '500' }]);
      mockGovernance.initiateControlledActionRequest.mockResolvedValue({ id: 'gov-req-1' });
      drizzle.queue([{ id: 'adj-pending', status: 'pending_approval', approvalRequestId: 'gov-req-1' }]); // returning

      const res = await service.create(dto, ctx);
      expect(res.status).toBe('pending_approval');
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'create_pending', entity: 'adjustments' }),
      );
    });

    it('applies the adjustment immediately when below the governance threshold', async () => {
      drizzle.queue([{ id: 'b1', stationId: 's1' }]);
      drizzle.queue([{ id: 's1', companyId: 'c1' }]);
      drizzle.queue([{ id: 't1', branchId: 'b1', capacity: '1000', currentLevel: '500' }]);
      mockGovernance.initiateControlledActionRequest.mockResolvedValue(null); // below threshold

      // Inside the transaction:
      // tx.execute(...) -> { rows: [lockedTank] }
      drizzle.db.execute.mockResolvedValueOnce({
        rows: [{ id: 't1', branchId: 'b1', productId: 'prod1', capacity: '1000', currentLevel: '500' }],
      });
      drizzle.queue([{ id: 'adj-1', status: 'completed' }]); // insert(adjustments).returning
      drizzle.queue([]); // update(tanks)
      drizzle.queue([]); // insert(stockLedger).values

      const res = await service.create(dto, ctx);
      expect(res.status).toBe('completed');
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'create', entity: 'adjustments' }),
        expect.anything(),
      );
    });

    it('rejects an adjustment that would drive stock negative', async () => {
      drizzle.queue([{ id: 'b1', stationId: 's1' }]);
      drizzle.queue([{ id: 's1', companyId: 'c1' }]);
      drizzle.queue([{ id: 't1', branchId: 'b1', capacity: '1000', currentLevel: '50' }]);
      mockGovernance.initiateControlledActionRequest.mockResolvedValue(null);
      drizzle.db.execute.mockResolvedValueOnce({
        rows: [{ id: 't1', branchId: 'b1', productId: 'prod1', capacity: '1000', currentLevel: '50' }],
      });
      await expect(service.create({ ...dto, volumeDelta: -100 }, ctx)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects an adjustment that would exceed tank capacity', async () => {
      drizzle.queue([{ id: 'b1', stationId: 's1' }]);
      drizzle.queue([{ id: 's1', companyId: 'c1' }]);
      drizzle.queue([{ id: 't1', branchId: 'b1', capacity: '1000', currentLevel: '950' }]);
      mockGovernance.initiateControlledActionRequest.mockResolvedValue(null);
      drizzle.db.execute.mockResolvedValueOnce({
        rows: [{ id: 't1', branchId: 'b1', productId: 'prod1', capacity: '1000', currentLevel: '950' }],
      });
      await expect(service.create({ ...dto, volumeDelta: 100 }, ctx)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
