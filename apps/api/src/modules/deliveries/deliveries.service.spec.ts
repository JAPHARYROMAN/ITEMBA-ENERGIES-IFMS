import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DRIZZLE } from '../../database/database.module';
import { AuditService } from '../audit/audit.service';
import { DeliveriesService } from './deliveries.service';

/**
 * Build a db.select() mock that serves a FIFO queue of result-sets. Each
 * awaited terminal (`.where(...)`, `.offset(...)`) shifts the next set off.
 * The chain methods are all chainable; awaiting the chain (.then) or the
 * terminal resolves to the next queued result-set.
 */
function queuedSelect(resultSets: unknown[][]): jest.Mock {
  return jest.fn().mockImplementation(() => {
    const resolveNext = () => Promise.resolve(resultSets.shift() ?? []);
    const chain: any = {};
    const ret = () => chain;
    chain.from = jest.fn(ret);
    chain.where = jest.fn(ret);
    chain.orderBy = jest.fn(ret);
    chain.limit = jest.fn(ret);
    chain.offset = jest.fn(() => resolveNext());
    chain.groupBy = jest.fn(ret);
    chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      resolveNext().then(resolve, reject);
    return chain;
  });
}

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
        allocations: [
          { tankId: 'tank-1', quantity: 40 },
          { tankId: 'tank-1', quantity: 60 },
        ],
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

      const tx = {
        execute: jest.fn()
          .mockResolvedValueOnce({ rows: [delivery] })
          .mockResolvedValueOnce({ rows: [tankRow] }),
        select: jest.fn(),
        insert: jest.fn()
          .mockReturnValueOnce({
            values: () => ({ returning: () => Promise.resolve(grnReturn) }),
          })
          .mockReturnValue({
            values: () => Promise.resolve(undefined),
          }),
        update: jest.fn().mockReturnValue({
          set: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              returning: jest.fn().mockResolvedValue([{ id: deliveryId }]),
            }),
          }),
        }),
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

    it('should aggregate duplicate tank allocations before capacity checks', async () => {
      const delivery = {
        id: deliveryId,
        companyId,
        branchId,
        deliveryNote: 'DN-001',
        supplierId: null,
        vehicleNo: null,
        driverName: null,
        productId: 'product-1',
        orderedQty: '60',
        expectedDate: new Date(),
        receivedQty: null,
        density: null,
        temperature: null,
        status: 'pending',
        createdAt: new Date(),
      };
      const tankRow = {
        id: 'tank-1',
        branchId,
        productId: 'product-1',
        capacity: '1000',
        currentLevel: '950',
      };
      const dto = {
        receivedQty: 60,
        allocations: [
          { tankId: 'tank-1', quantity: 30 },
          { tankId: 'tank-1', quantity: 30 },
        ],
      };
      const tx = {
        execute: jest.fn()
          .mockResolvedValueOnce({ rows: [delivery] })
          .mockResolvedValueOnce({ rows: [tankRow] }),
        insert: jest.fn(),
        update: jest.fn(),
      };
      db.transaction.mockImplementation(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx));

      await expect(service.receiveGrn(deliveryId, dto, { userId })).rejects.toThrow(
        /free capacity is 50; cannot allocate 60/,
      );
      expect(tx.insert).not.toHaveBeenCalled();
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

    it('returns the delivery without a GRN when none exists', async () => {
      const row = { id: deliveryId, companyId, branchId, status: 'pending', orderedQty: '100' };
      db.select = queuedSelect([[row], []]); // delivery row, no grn
      const res = await service.findById(deliveryId);
      expect(res.id).toBe(deliveryId);
      expect(res.grn).toBeUndefined();
    });

    it('hydrates the GRN and its allocations when present', async () => {
      const row = { id: deliveryId, companyId, branchId, status: 'completed', orderedQty: '100' };
      const grnRow = {
        id: 'grn-1',
        grnNumber: 'GRN-1',
        receivedQty: '100',
        receivedAt: new Date(),
        density: '0.84',
        temperature: '15',
        varianceReason: null,
      };
      db.select = queuedSelect([
        [row],
        [grnRow],
        [{ tankId: 'tank-1', quantity: '60' }, { tankId: 'tank-2', quantity: '40' }],
      ]);
      const res = await service.findById(deliveryId, companyId);
      expect(res.grn?.grnNumber).toBe('GRN-1');
      expect(res.grn?.allocations).toHaveLength(2);
      expect(res.grn?.density).toBe('0.84');
    });
  });

  describe('findPage', () => {
    it('applies all filters and returns data with total', async () => {
      db.select = queuedSelect([[{ id: deliveryId }], [{ count: 7 }]]);
      const res = await service.findPage({
        branchId,
        companyId,
        status: 'pending',
        dateFrom: '2026-01-01',
        dateTo: '2026-12-31',
        page: 1,
        pageSize: 10,
      });
      expect(res.total).toBe(7);
      expect(res.data).toHaveLength(1);
    });

    it('defaults total to 0 when count query returns nothing', async () => {
      db.select = queuedSelect([[], []]);
      const res = await service.findPage({});
      expect(res.total).toBe(0);
      expect(res.data).toEqual([]);
    });
  });

  describe('create', () => {
    const dto = {
      branchId,
      deliveryNote: '  DN-001  ',
      orderedQty: 100,
      expectedDate: '2026-06-01',
      vehicleNo: '  T123  ',
      driverName: '  John  ',
    } as any;
    const ctx = { userId, ip: '1.2.3.4', userAgent: 'jest' };

    it('throws NotFoundException when branch missing', async () => {
      db.select = queuedSelect([[]]);
      await expect(service.create(dto, ctx)).rejects.toThrow(/Branch not found/);
    });

    it('throws NotFoundException when station missing', async () => {
      db.select = queuedSelect([[{ id: branchId, stationId }], []]);
      await expect(service.create(dto, ctx)).rejects.toThrow(/Station not found/);
    });

    it('inserts a pending delivery, trims fields and writes an audit log', async () => {
      db.select = queuedSelect([
        [{ id: branchId, stationId }],
        [{ id: stationId, companyId }],
      ]);
      const inserted = { id: deliveryId, companyId, branchId, status: 'pending' };
      const valuesSpy = jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([inserted]),
      });
      db.insert.mockReturnValue({ values: valuesSpy });

      const res = await service.create(dto, ctx);
      expect(res).toEqual(inserted);
      const valuesArg = valuesSpy.mock.calls[0][0];
      expect(valuesArg.deliveryNote).toBe('DN-001');
      expect(valuesArg.vehicleNo).toBe('T123');
      expect(valuesArg.driverName).toBe('John');
      expect(valuesArg.companyId).toBe(companyId);
      expect(valuesArg.status).toBe('pending');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'deliveries', action: 'create' }),
      );
    });

    it('throws InternalServerErrorException when insert returns nothing', async () => {
      db.select = queuedSelect([
        [{ id: branchId, stationId }],
        [{ id: stationId, companyId }],
      ]);
      db.insert.mockReturnValue({
        values: jest.fn().mockReturnValue({ returning: jest.fn().mockResolvedValue([]) }),
      });
      await expect(service.create(dto, ctx)).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('updateDelivery', () => {
    const ctx = { userId };

    it('throws NotFoundException when delivery missing', async () => {
      db.select = queuedSelect([[]]);
      await expect(service.updateDelivery('x', {} as any, ctx)).rejects.toThrow(NotFoundException);
    });

    it('rejects updating an already-completed delivery', async () => {
      db.select = queuedSelect([[{ id: deliveryId, status: 'completed' }]]);
      await expect(service.updateDelivery(deliveryId, {} as any, ctx)).rejects.toThrow(
        /already been received/,
      );
    });

    it('applies provided fields and audits the update', async () => {
      db.select = queuedSelect([[{ id: deliveryId, status: 'pending' }]]);
      const updated = { id: deliveryId, status: 'pending', deliveryNote: 'DN-2' };
      const setSpy = jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([updated]),
        }),
      });
      db.update.mockReturnValue({ set: setSpy });

      const res = await service.updateDelivery(
        deliveryId,
        { deliveryNote: '  DN-2  ', orderedQty: 50, vehicleNo: '' } as any,
        ctx,
      );
      expect(res).toEqual(updated);
      const setArg = setSpy.mock.calls[0][0];
      expect(setArg.deliveryNote).toBe('DN-2');
      expect(setArg.orderedQty).toBe('50');
      expect(setArg.vehicleNo).toBeNull();
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'deliveries', action: 'update' }),
      );
    });

    it('throws InternalServerErrorException when update returns nothing', async () => {
      db.select = queuedSelect([[{ id: deliveryId, status: 'pending' }]]);
      db.update.mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({ returning: jest.fn().mockResolvedValue([]) }),
        }),
      });
      await expect(service.updateDelivery(deliveryId, {} as any, ctx)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('receiveGrn - variance threshold', () => {
    const baseDelivery = {
      id: deliveryId,
      companyId,
      branchId,
      productId: 'product-1',
      orderedQty: '100',
      status: 'pending',
    };

    it('requires a variance reason when variance exceeds the configured threshold', async () => {
      config.get.mockImplementation((key: string) =>
        key === 'DELIVERY_VARIANCE_REQUIRE_REASON_THRESHOLD' ? 5 : undefined,
      );
      const tx = {
        execute: jest.fn().mockResolvedValueOnce({ rows: [baseDelivery] }),
        insert: jest.fn(),
        update: jest.fn(),
      };
      db.transaction.mockImplementation(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx));
      // received 80 -> variance 20 > 5, no reason
      await expect(
        service.receiveGrn(
          deliveryId,
          { receivedQty: 80, allocations: [{ tankId: 'tank-1', quantity: 80 }] } as any,
          { userId },
        ),
      ).rejects.toThrow(/variance reason is required/);
      expect(tx.insert).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the locked delivery row does not exist', async () => {
      const tx = {
        execute: jest.fn().mockResolvedValueOnce({ rows: [] }),
        insert: jest.fn(),
        update: jest.fn(),
      };
      db.transaction.mockImplementation(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx));
      await expect(
        service.receiveGrn(
          deliveryId,
          { receivedQty: 100, allocations: [{ tankId: 'tank-1', quantity: 100 }] } as any,
          { userId },
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects when the delivery is no longer pending', async () => {
      const tx = {
        execute: jest.fn().mockResolvedValueOnce({ rows: [{ ...baseDelivery, status: 'completed' }] }),
        insert: jest.fn(),
        update: jest.fn(),
      };
      db.transaction.mockImplementation(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx));
      await expect(
        service.receiveGrn(
          deliveryId,
          { receivedQty: 100, allocations: [{ tankId: 'tank-1', quantity: 100 }] } as any,
          { userId },
        ),
      ).rejects.toThrow(/already received/);
    });

    it('throws NotFoundException when an allocated tank cannot be locked', async () => {
      const tx = {
        execute: jest
          .fn()
          .mockResolvedValueOnce({ rows: [baseDelivery] })
          .mockResolvedValueOnce({ rows: [] }),
        insert: jest.fn(),
        update: jest.fn(),
      };
      db.transaction.mockImplementation(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx));
      await expect(
        service.receiveGrn(
          deliveryId,
          { receivedQty: 100, allocations: [{ tankId: 'tank-1', quantity: 100 }] } as any,
          { userId },
        ),
      ).rejects.toThrow(/Tank tank-1 not found/);
    });

    it('rejects when an allocated tank belongs to a different branch', async () => {
      const tx = {
        execute: jest
          .fn()
          .mockResolvedValueOnce({ rows: [baseDelivery] })
          .mockResolvedValueOnce({
            rows: [{ id: 'tank-1', branchId: 'other-branch', productId: 'product-1', capacity: '1000', currentLevel: '0' }],
          }),
        insert: jest.fn(),
        update: jest.fn(),
      };
      db.transaction.mockImplementation(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx));
      await expect(
        service.receiveGrn(
          deliveryId,
          { receivedQty: 100, allocations: [{ tankId: 'tank-1', quantity: 100 }] } as any,
          { userId },
        ),
      ).rejects.toThrow(/does not belong to delivery branch/);
    });

    it('rejects when an allocated tank product does not match the delivery product', async () => {
      const tx = {
        execute: jest
          .fn()
          .mockResolvedValueOnce({ rows: [baseDelivery] })
          .mockResolvedValueOnce({
            rows: [{ id: 'tank-1', branchId, productId: 'other-product', capacity: '1000', currentLevel: '0' }],
          }),
        insert: jest.fn(),
        update: jest.fn(),
      };
      db.transaction.mockImplementation(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx));
      await expect(
        service.receiveGrn(
          deliveryId,
          { receivedQty: 100, allocations: [{ tankId: 'tank-1', quantity: 100 }] } as any,
          { userId },
        ),
      ).rejects.toThrow(/product does not match/);
    });
  });

  describe('deleteDelivery', () => {
    const ctx = { userId };

    it('throws NotFoundException when delivery missing', async () => {
      const tx = { execute: jest.fn().mockResolvedValueOnce({ rows: [] }), update: jest.fn(), insert: jest.fn() };
      db.transaction.mockImplementation(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx));
      await expect(service.deleteDelivery('x', ctx)).rejects.toThrow(NotFoundException);
    });

    it('rejects when the delivery is already voided', async () => {
      const tx = {
        execute: jest.fn().mockResolvedValueOnce({ rows: [{ id: deliveryId, status: 'voided' }] }),
        update: jest.fn(),
        insert: jest.fn(),
      };
      db.transaction.mockImplementation(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx));
      await expect(service.deleteDelivery(deliveryId, ctx)).rejects.toThrow(/already voided/);
    });

    it('voids a pending delivery without reversing stock', async () => {
      const updateChain = { set: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) }) };
      const tx = {
        execute: jest.fn().mockResolvedValueOnce({
          rows: [{ id: deliveryId, companyId, branchId, status: 'pending' }],
        }),
        update: jest.fn().mockReturnValue(updateChain),
        insert: jest.fn(),
      };
      db.transaction.mockImplementation(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx));

      const res = await service.deleteDelivery(deliveryId, ctx);
      expect(res).toEqual({ success: true });
      // pending -> no stock-ledger reversal inserts
      expect(tx.insert).not.toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'deliveries', action: 'delete' }),
        expect.anything(),
      );
    });

    it('reverses GRN allocations and stock ledger for a completed delivery', async () => {
      const updateChain = { set: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) }) };
      const allocSelectChain = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockResolvedValue([{ tankId: 'tank-1', quantity: '40' }]),
      };
      const tx = {
        execute: jest
          .fn()
          .mockResolvedValueOnce({ rows: [{ id: deliveryId, companyId, branchId, status: 'completed' }] })
          .mockResolvedValueOnce({ rows: [{ id: 'grn-1' }] }) // locked grn
          .mockResolvedValueOnce({
            rows: [{ id: 'tank-1', branchId, productId: 'product-1', capacity: '1000', currentLevel: '40' }],
          }),
        select: jest.fn().mockReturnValue(allocSelectChain),
        update: jest.fn().mockReturnValue(updateChain),
        insert: jest.fn().mockReturnValue({ values: jest.fn().mockResolvedValue(undefined) }),
      };
      db.transaction.mockImplementation(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx));

      const res = await service.deleteDelivery(deliveryId, ctx);
      expect(res).toEqual({ success: true });
      // one stock-ledger reversal insert for the single allocated tank
      expect(tx.insert).toHaveBeenCalledTimes(1);
      expect(tx.update).toHaveBeenCalled();
    });
  });
});
