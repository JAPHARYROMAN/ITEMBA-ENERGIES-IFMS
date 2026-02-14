import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DRIZZLE } from '../../database/database.module';
import { AuditService } from '../audit/audit.service';
import { DeliveriesService } from './deliveries.service';

describe('DeliveriesService', () => {
  let service: DeliveriesService;
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
  const deliveryId = 'delivery-1';
  const userId = 'user-1';

  beforeEach(async () => {
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    config = {
      get: jest.fn((key: string) =>
        key === 'DELIVERY_VARIANCE_REQUIRE_REASON_THRESHOLD' ? 0 : undefined,
      ),
    };

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
        DeliveriesService,
        { provide: DRIZZLE, useValue: db },
        { provide: AuditService, useValue: audit },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    service = module.get<DeliveriesService>(DeliveriesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('receiveGrn - allocation sum rule', () => {
    it('should throw BadRequestException when allocations do not sum exactly to received qty', async () => {
      const dto = {
        receivedQty: 100,
        allocations: [
          { tankId: 'tank-1', quantity: 30 },
          { tankId: 'tank-2', quantity: 50 },
        ],
      };
      // Sum = 80, receivedQty = 100 -> must throw

      await expect(
        service.receiveGrn(deliveryId, dto, { userId }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.receiveGrn(deliveryId, dto, { userId }),
      ).rejects.toThrow(/allocations must sum exactly to received qty/);
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when allocation sum exceeds received qty', async () => {
      const dto = {
        receivedQty: 50,
        allocations: [
          { tankId: 'tank-1', quantity: 30 },
          { tankId: 'tank-2', quantity: 30 },
        ],
      };
      // Sum = 60, receivedQty = 50

      await expect(
        service.receiveGrn(deliveryId, dto, { userId }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.receiveGrn(deliveryId, dto, { userId }),
      ).rejects.toThrow(/sum exactly/);
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('should not throw allocation-sum error when allocations sum exactly to received qty', async () => {
      const delivery = {
        id: deliveryId,
        companyId,
        branchId,
        deliveryNote: 'DN-001',
        supplierId: null,
        vehicleNo: null,
        driverName: null,
        productId: 'product-1',
        orderedQty: '100',
        expectedDate: new Date(),
        receivedQty: null,
        density: null,
        temperature: null,
        status: 'pending',
        createdAt: new Date(),
        createdBy: null,
        updatedAt: new Date(),
        updatedBy: null,
        deletedAt: null,
      };
      const tankRow = {
        id: 'tank-1',
        branchId,
        productId: 'product-1',
        capacity: '1000',
        currentLevel: '0',
      };
      const dto = {
        receivedQty: 100,
        allocations: [{ tankId: 'tank-1', quantity: 100 }],
      };
      const grnReturn = [{ id: 'grn-1' }];
      const detailReturn = {
        ...delivery,
        receivedQty: '100',
        status: 'completed',
        grn: {
          id: 'grn-1',
          grnNumber: 'GRN-1',
          receivedQty: '100',
          receivedAt: new Date(),
          density: null,
          temperature: null,
          varianceReason: null,
          allocations: [{ tankId: 'tank-1', quantity: '100' }],
        },
      };

      let selectCallCount = 0;
      const tx = {
        select: jest.fn().mockImplementation(() => ({
          from: jest.fn().mockImplementation(() => ({
            where: jest.fn().mockImplementation(() => {
              selectCallCount++;
              if (selectCallCount === 1) return Promise.resolve([delivery]);
              return Promise.resolve([tankRow]);
            }),
          })),
        })),
        insert: jest.fn()
          .mockReturnValueOnce({
            values: () => ({ returning: () => Promise.resolve(grnReturn) }),
          })
          .mockReturnValue({
            values: () => Promise.resolve(undefined),
          }),
        update: jest.fn().mockReturnValue({ set: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) }) }),
      };
      db.transaction.mockImplementation(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx));

      db.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn()
            .mockResolvedValueOnce([{ ...delivery, ...detailReturn }])
            .mockResolvedValueOnce([{ id: 'grn-1', deliveryId, grnNumber: 'GRN-1', receivedQty: '100', receivedAt: new Date(), density: null, temperature: null, varianceReason: null }])
            .mockResolvedValueOnce([{ tankId: 'tank-1', quantity: '100' }]),
        }),
      });

      const result = await service.receiveGrn(deliveryId, dto, { userId });
      expect(result).toBeDefined();
      expect(result.status).toBe('completed');
      expect(result.grn?.allocations).toHaveLength(1);
      expect(result.grn?.allocations[0].quantity).toBe('100');
    });
  });

  describe('findById', () => {
    it('should throw NotFoundException when delivery not found', async () => {
      db.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([]),
        }),
      });

      await expect(service.findById('missing')).rejects.toThrow(NotFoundException);
      await expect(service.findById('missing')).rejects.toThrow('Delivery not found');
    });
  });
});
