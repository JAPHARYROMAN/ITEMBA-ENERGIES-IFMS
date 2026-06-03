import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { TransfersService } from './transfers.service';

/**
 * db.select() mock serving a FIFO queue of result-sets. Each awaited terminal
 * (`.where`, `.limit`, or awaiting the chain directly) shifts the next set off.
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
    chain.offset = jest.fn(ret);
    chain.innerJoin = jest.fn(ret);
    chain.leftJoin = jest.fn(ret);
    chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      resolveNext().then(resolve, reject);
    return chain;
  });
}

function writableUpdate(): jest.Mock {
  return jest.fn().mockReturnValue({
    set: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([]),
      }),
    }),
  });
}

const branchId = 'branch-1';
const stationId = 'station-1';
const companyId = 'company-1';
const fromTankId = 'tank-from';
const toTankId = 'tank-to';
const userId = 'user-1';
const ctx = { userId, ip: '1.2.3.4', userAgent: 'jest' };

function makeAudit() {
  return { log: jest.fn().mockResolvedValue(undefined) };
}

describe('TransfersService', () => {
  describe('product validation', () => {
    const service = new TransfersService({} as any, { log: jest.fn() } as any);

    it('rejects transfers between tanks with different products', () => {
      expect(() =>
        (service as any).assertSameTransferProduct(
          { productId: 'product-a' },
          { productId: 'product-b' },
        ),
      ).toThrow(BadRequestException);
    });

    it('rejects transfers when either tank has no configured product', () => {
      expect(() =>
        (service as any).assertSameTransferProduct({ productId: 'product-a' }, { productId: null }),
      ).toThrow(BadRequestException);
    });

    it('accepts transfers between tanks with the same product', () => {
      expect(() =>
        (service as any).assertSameTransferProduct(
          { productId: 'product-a' },
          { productId: 'product-a' },
        ),
      ).not.toThrow();
    });
  });

  describe('tankToTank / stationToStation same-tank guard', () => {
    const service = new TransfersService({} as any, makeAudit() as any);

    it('rejects tank-to-tank transfer when from and to tanks are identical', async () => {
      await expect(
        service.tankToTank({ fromTankId: 't1', toTankId: 't1', quantity: 10 } as any, ctx),
      ).rejects.toThrow(/must be different/);
    });

    it('rejects station-to-station transfer when from and to tanks are identical', async () => {
      await expect(
        service.stationToStation({ fromTankId: 't1', toTankId: 't1', quantity: 10 } as any, ctx),
      ).rejects.toThrow(/must be different/);
    });
  });

  describe('findById', () => {
    it('throws NotFoundException when the transfer does not exist', async () => {
      const db: any = { select: queuedSelect([[]]) };
      const service = new TransfersService(db, makeAudit() as any);
      await expect(service.findById('missing')).rejects.toThrow(NotFoundException);
    });

    it('returns the transfer row when found', async () => {
      const row = { id: 't1', companyId, branchId, transferType: 'tank_to_tank' };
      const db: any = { select: queuedSelect([[row]]) };
      const service = new TransfersService(db, makeAudit() as any);
      await expect(service.findById('t1')).resolves.toEqual(row);
    });
  });

  describe('findPage', () => {
    it('returns data and total honouring filters', async () => {
      const db: any = { select: queuedSelect([[{ id: 't1' }], [{ count: 3 }]]) };
      const service = new TransfersService(db, makeAudit() as any);
      const res = await service.findPage({
        branchId,
        companyId,
        transferType: 'tank_to_tank',
        dateFrom: '2026-01-01',
        dateTo: '2026-12-31',
      });
      expect(res.total).toBe(3);
      expect(res.data).toHaveLength(1);
    });

    it('defaults total to 0 when no count row is returned', async () => {
      const db: any = { select: queuedSelect([[], []]) };
      const service = new TransfersService(db, makeAudit() as any);
      const res = await service.findPage({});
      expect(res.total).toBe(0);
    });
  });

  describe('updateTransfer', () => {
    it('throws NotFoundException when the transfer is missing', async () => {
      const db: any = { select: queuedSelect([[]]) };
      const service = new TransfersService(db, makeAudit() as any);
      await expect(service.updateTransfer('x', {} as any, ctx)).rejects.toThrow(NotFoundException);
    });

    it('rejects updating a voided transfer', async () => {
      const db: any = { select: queuedSelect([[{ id: 't1', status: 'voided' }]]) };
      const service = new TransfersService(db, makeAudit() as any);
      await expect(service.updateTransfer('t1', {} as any, ctx)).rejects.toThrow(
        /voided transfer/,
      );
    });

    it('updates the reference and audits the change', async () => {
      const audit = makeAudit();
      const updated = { id: 't1', reference: 'REF', status: 'completed' };
      const setSpy = jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({ returning: jest.fn().mockResolvedValue([updated]) }),
      });
      const db: any = {
        select: queuedSelect([[{ id: 't1', status: 'completed' }]]),
        update: jest.fn().mockReturnValue({ set: setSpy }),
      };
      const service = new TransfersService(db, audit as any);
      const res = await service.updateTransfer('t1', { reference: '  REF  ' } as any, ctx);
      expect(res).toEqual(updated);
      expect(setSpy.mock.calls[0][0].reference).toBe('REF');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'transfers', action: 'update' }),
      );
    });

    it('throws InternalServerErrorException when the update returns nothing', async () => {
      const db: any = {
        select: queuedSelect([[{ id: 't1', status: 'completed' }]]),
        update: writableUpdate(),
      };
      const service = new TransfersService(db, makeAudit() as any);
      await expect(service.updateTransfer('t1', {} as any, ctx)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  /**
   * Helper to drive executeTransfer via tankToTank/stationToStation. Builds a
   * tx whose locked-tank execute returns the supplied tank rows, and whose
   * select() serves the station/company lookups in order.
   */
  function buildTransferTx(opts: {
    tankRows: any[];
    branchStations?: unknown[][]; // results for the two branch->stationId selects + source-station company + dest company
    inserted?: any[];
  }) {
    const selectQueue = [...(opts.branchStations ?? [])];
    const insertValues = jest.fn().mockResolvedValue(undefined);
    const tx: any = {
      execute: jest.fn().mockResolvedValue({ rows: opts.tankRows }),
      select: queuedSelect(selectQueue),
      insert: jest.fn().mockImplementation(() => ({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue(opts.inserted ?? []),
        }),
      })),
      update: jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) }),
      }),
    };
    // First insert (transfers) returns inserted; subsequent inserts (stockLedger) resolve undefined.
    tx.insert
      .mockReturnValueOnce({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue(opts.inserted ?? []),
        }),
      })
      .mockReturnValue({ values: insertValues });
    return tx;
  }

  describe('executeTransfer - validation paths', () => {
    it('throws NotFoundException when the source tank cannot be locked', async () => {
      const tx = buildTransferTx({ tankRows: [{ id: toTankId, branchId, productId: 'p', capacity: '1000', currentLevel: '0' }] });
      const db: any = { transaction: jest.fn(async (fn: any) => fn(tx)) };
      const service = new TransfersService(db, makeAudit() as any);
      await expect(
        service.tankToTank({ fromTankId, toTankId, quantity: 10 } as any, ctx),
      ).rejects.toThrow(/From tank not found/);
    });

    it('throws NotFoundException when the destination tank cannot be locked', async () => {
      const tx = buildTransferTx({ tankRows: [{ id: fromTankId, branchId, productId: 'p', capacity: '1000', currentLevel: '500' }] });
      const db: any = { transaction: jest.fn(async (fn: any) => fn(tx)) };
      const service = new TransfersService(db, makeAudit() as any);
      await expect(
        service.tankToTank({ fromTankId, toTankId, quantity: 10 } as any, ctx),
      ).rejects.toThrow(/To tank not found/);
    });

    it('throws NotFoundException when the source tank station is missing', async () => {
      const tx = buildTransferTx({
        tankRows: [
          { id: fromTankId, branchId, productId: 'p', capacity: '1000', currentLevel: '500' },
          { id: toTankId, branchId, productId: 'p', capacity: '1000', currentLevel: '0' },
        ],
        branchStations: [[], []], // both station lookups empty
      });
      const db: any = { transaction: jest.fn(async (fn: any) => fn(tx)) };
      const service = new TransfersService(db, makeAudit() as any);
      await expect(
        service.tankToTank({ fromTankId, toTankId, quantity: 10 } as any, ctx),
      ).rejects.toThrow(/From tank station not found/);
    });

    it('rejects tank-to-tank when the two tanks are in different branches', async () => {
      const tx = buildTransferTx({
        tankRows: [
          { id: fromTankId, branchId: 'b1', productId: 'p', capacity: '1000', currentLevel: '500' },
          { id: toTankId, branchId: 'b2', productId: 'p', capacity: '1000', currentLevel: '0' },
        ],
        branchStations: [[{ stationId }], [{ stationId }]],
      });
      const db: any = { transaction: jest.fn(async (fn: any) => fn(tx)) };
      const service = new TransfersService(db, makeAudit() as any);
      await expect(
        service.tankToTank({ fromTankId, toTankId, quantity: 10 } as any, ctx),
      ).rejects.toThrow(/same branch/);
    });

    it('rejects station-to-station when both tanks are in the same branch', async () => {
      const tx = buildTransferTx({
        tankRows: [
          { id: fromTankId, branchId, productId: 'p', capacity: '1000', currentLevel: '500' },
          { id: toTankId, branchId, productId: 'p', capacity: '1000', currentLevel: '0' },
        ],
        branchStations: [[{ stationId }], [{ stationId }]],
      });
      const db: any = { transaction: jest.fn(async (fn: any) => fn(tx)) };
      const service = new TransfersService(db, makeAudit() as any);
      await expect(
        service.stationToStation({ fromTankId, toTankId, quantity: 10 } as any, ctx),
      ).rejects.toThrow(/different branches/);
    });

    it('rejects when both tanks lack a configured product', async () => {
      const tx = buildTransferTx({
        tankRows: [
          { id: fromTankId, branchId, productId: null, capacity: '1000', currentLevel: '500' },
          { id: toTankId, branchId, productId: null, capacity: '1000', currentLevel: '0' },
        ],
        branchStations: [[{ stationId }], [{ stationId }]],
      });
      const db: any = { transaction: jest.fn(async (fn: any) => fn(tx)) };
      const service = new TransfersService(db, makeAudit() as any);
      await expect(
        service.tankToTank({ fromTankId, toTankId, quantity: 10 } as any, ctx),
      ).rejects.toThrow(/configured product/);
    });

    it('rejects when the source tank has insufficient stock', async () => {
      const tx = buildTransferTx({
        tankRows: [
          { id: fromTankId, branchId, productId: 'p', capacity: '1000', currentLevel: '5' },
          { id: toTankId, branchId, productId: 'p', capacity: '1000', currentLevel: '0' },
        ],
        branchStations: [[{ stationId }], [{ stationId }]],
      });
      const db: any = { transaction: jest.fn(async (fn: any) => fn(tx)) };
      const service = new TransfersService(db, makeAudit() as any);
      await expect(
        service.tankToTank({ fromTankId, toTankId, quantity: 100 } as any, ctx),
      ).rejects.toThrow(/insufficient stock/);
    });

    it('rejects when the destination tank lacks free capacity', async () => {
      const tx = buildTransferTx({
        tankRows: [
          { id: fromTankId, branchId, productId: 'p', capacity: '1000', currentLevel: '500' },
          { id: toTankId, branchId, productId: 'p', capacity: '1000', currentLevel: '990' },
        ],
        branchStations: [[{ stationId }], [{ stationId }]],
      });
      const db: any = { transaction: jest.fn(async (fn: any) => fn(tx)) };
      const service = new TransfersService(db, makeAudit() as any);
      await expect(
        service.tankToTank({ fromTankId, toTankId, quantity: 100 } as any, ctx),
      ).rejects.toThrow(/insufficient free capacity/);
    });

    it('throws NotFoundException when the source station company is missing', async () => {
      const tx = buildTransferTx({
        tankRows: [
          { id: fromTankId, branchId, productId: 'p', capacity: '1000', currentLevel: '500' },
          { id: toTankId, branchId, productId: 'p', capacity: '1000', currentLevel: '0' },
        ],
        // from station, to station, then source-station company lookup empty
        branchStations: [[{ stationId }], [{ stationId }], []],
      });
      const db: any = { transaction: jest.fn(async (fn: any) => fn(tx)) };
      const service = new TransfersService(db, makeAudit() as any);
      await expect(
        service.tankToTank({ fromTankId, toTankId, quantity: 10 } as any, ctx),
      ).rejects.toThrow(/station company not found/);
    });

    it('completes a valid tank-to-tank transfer, writes stock ledger and audits', async () => {
      const audit = makeAudit();
      const inserted = {
        id: 'transfer-1',
        companyId,
        branchId,
        transferType: 'tank_to_tank',
        fromTankId,
        toTankId,
        quantity: '100.000',
        status: 'completed',
      };
      const tx = buildTransferTx({
        tankRows: [
          { id: fromTankId, branchId, productId: 'p', capacity: '1000', currentLevel: '500' },
          { id: toTankId, branchId, productId: 'p', capacity: '1000', currentLevel: '0' },
        ],
        // from station, to station, source company, dest branch->company
        branchStations: [[{ stationId }], [{ stationId }], [{ companyId }], [{ companyId }]],
        inserted: [inserted],
      });
      const db: any = { transaction: jest.fn(async (fn: any) => fn(tx)) };
      const service = new TransfersService(db, audit as any);
      const res = await service.tankToTank(
        { fromTankId, toTankId, quantity: 100, reference: '  REF  ' } as any,
        ctx,
      );
      expect(res).toEqual(inserted);
      expect(tx.update).toHaveBeenCalledTimes(2); // debit + credit
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'transfers', action: 'create' }),
        expect.anything(),
      );
    });
  });

  describe('deleteTransfer', () => {
    it('throws NotFoundException when the transfer is missing', async () => {
      const tx: any = { select: queuedSelect([[]]), execute: jest.fn(), update: jest.fn(), insert: jest.fn() };
      const db: any = { transaction: jest.fn(async (fn: any) => fn(tx)) };
      const service = new TransfersService(db, makeAudit() as any);
      await expect(service.deleteTransfer('x', ctx)).rejects.toThrow(NotFoundException);
    });

    it('rejects deleting an already-voided transfer', async () => {
      const tx: any = {
        select: queuedSelect([[{ id: 't1', status: 'voided' }]]),
        execute: jest.fn(),
        update: jest.fn(),
        insert: jest.fn(),
      };
      const db: any = { transaction: jest.fn(async (fn: any) => fn(tx)) };
      const service = new TransfersService(db, makeAudit() as any);
      await expect(service.deleteTransfer('t1', ctx)).rejects.toThrow(/already deleted/);
    });

    it('rejects reversing a transfer record with invalid tank references', async () => {
      const tx: any = {
        select: queuedSelect([[{ id: 't1', status: 'completed', fromTankId: null, toTankId, quantity: '10' }]]),
        execute: jest.fn(),
        update: jest.fn(),
        insert: jest.fn(),
      };
      const db: any = { transaction: jest.fn(async (fn: any) => fn(tx)) };
      const service = new TransfersService(db, makeAudit() as any);
      await expect(service.deleteTransfer('t1', ctx)).rejects.toThrow(/cannot be reversed/);
    });

    it('throws NotFoundException when an associated tank is missing on reversal', async () => {
      const tx: any = {
        select: queuedSelect([
          [{ id: 't1', status: 'completed', companyId, fromTankId, toTankId, quantity: '10' }],
        ]),
        execute: jest.fn().mockResolvedValue({ rows: [{ id: fromTankId, currentLevel: '100', branchId, capacity: '1000' }] }),
        update: jest.fn(),
        insert: jest.fn(),
      };
      const db: any = { transaction: jest.fn(async (fn: any) => fn(tx)) };
      const service = new TransfersService(db, makeAudit() as any);
      await expect(service.deleteTransfer('t1', ctx)).rejects.toThrow(/tanks not found/);
    });

    it('rejects reversal when the destination tank has insufficient stock to return', async () => {
      const tx: any = {
        select: queuedSelect([
          [{ id: 't1', status: 'completed', companyId, fromTankId, toTankId, quantity: '100' }],
        ]),
        execute: jest.fn().mockResolvedValue({
          rows: [
            { id: fromTankId, currentLevel: '0', productId: 'p', branchId, capacity: '1000' },
            { id: toTankId, currentLevel: '50', productId: 'p', branchId, capacity: '1000' },
          ],
        }),
        update: jest.fn(),
        insert: jest.fn(),
      };
      const db: any = { transaction: jest.fn(async (fn: any) => fn(tx)) };
      const service = new TransfersService(db, makeAudit() as any);
      await expect(service.deleteTransfer('t1', ctx)).rejects.toThrow(/insufficient stock/);
    });

    it('reverses tank levels, writes reversal ledger entries and audits the void', async () => {
      const audit = makeAudit();
      const tx: any = {
        select: queuedSelect([
          [{ id: 't1', status: 'completed', companyId, fromTankId, toTankId, quantity: '100' }],
        ]),
        execute: jest.fn().mockResolvedValue({
          rows: [
            { id: fromTankId, currentLevel: '0', productId: 'p', branchId, capacity: '1000' },
            { id: toTankId, currentLevel: '100', productId: 'p', branchId, capacity: '1000' },
          ],
        }),
        update: jest.fn().mockReturnValue({
          set: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) }),
        }),
        insert: jest.fn().mockReturnValue({ values: jest.fn().mockResolvedValue(undefined) }),
      };
      const db: any = { transaction: jest.fn(async (fn: any) => fn(tx)) };
      const service = new TransfersService(db, audit as any);
      const res = await service.deleteTransfer('t1', ctx);
      expect(res).toEqual({ success: true });
      // void transfer + restore from-tank + reduce to-tank = 3 updates
      expect(tx.update).toHaveBeenCalledTimes(3);
      expect(tx.insert).toHaveBeenCalledTimes(1); // batched ledger insert
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'transfers', action: 'delete' }),
        expect.anything(),
      );
    });
  });
});
