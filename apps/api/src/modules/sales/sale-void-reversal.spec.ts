import { BadRequestException, NotFoundException } from '@nestjs/common';
import { applySaleVoidReversal } from './sale-void-reversal';

describe('applySaleVoidReversal', () => {
  const baseSale = {
    id: 'sale-1',
    companyId: 'company-1',
    branchId: 'branch-1',
    totalAmount: '100.00',
    status: 'completed',
    voidedAt: null,
    voidedBy: null,
    voidReason: null,
  };

  const originalLedger = {
    companyId: 'company-1',
    branchId: 'branch-1',
    tankId: 'tank-1',
    productId: 'product-1',
    quantity: '-50.000',
  };

  it('voids the sale and restores missing stock in one transaction helper', async () => {
    const updatedSale = {
      ...baseSale,
      status: 'voided',
      voidedAt: new Date(),
      voidedBy: 'user-1',
      voidReason: 'Duplicate receipt',
    };
    const saleUpdate = {
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([updatedSale]),
        }),
      }),
    };
    const tankUpdate = {
      set: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) }),
    };
    const insertValues = jest.fn().mockResolvedValue(undefined);
    const tx = {
      execute: jest.fn()
        .mockResolvedValueOnce({ rows: [baseSale] })
        .mockResolvedValueOnce({ rows: [originalLedger] })
        .mockResolvedValueOnce({ rows: [] }),
      update: jest.fn().mockReturnValueOnce(saleUpdate).mockReturnValueOnce(tankUpdate),
      insert: jest.fn().mockReturnValue({ values: insertValues }),
    } as any;
    const audit = { log: jest.fn().mockResolvedValue(undefined) } as any;

    const result = await applySaleVoidReversal(
      tx,
      audit,
      'sale-1',
      'Duplicate receipt',
      { userId: 'user-1' },
    );

    expect(result.statusChanged).toBe(true);
    expect(result.reversalRowsInserted).toBe(1);
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ quantity: '50.000', movementType: 'void_reversal' }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'void', entityId: 'sale-1' }),
      tx,
    );
  });

  it('does not duplicate reversal ledger or tank updates when already fully reversed', async () => {
    const tx = {
      execute: jest.fn()
        .mockResolvedValueOnce({ rows: [{ ...baseSale, status: 'voided' }] })
        .mockResolvedValueOnce({ rows: [originalLedger] })
        .mockResolvedValueOnce({ rows: [{ ...originalLedger, quantity: '50.000' }] }),
      update: jest.fn(),
      insert: jest.fn(),
    } as any;
    const audit = { log: jest.fn().mockResolvedValue(undefined) } as any;

    const result = await applySaleVoidReversal(tx, audit, 'sale-1', 'Duplicate receipt', {
      userId: 'user-1',
    });

    expect(result.statusChanged).toBe(false);
    expect(result.reversalRowsInserted).toBe(0);
    expect(tx.insert).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when the locked sale row does not exist', async () => {
    const tx = { execute: jest.fn().mockResolvedValueOnce({ rows: [] }) } as any;
    const audit = { log: jest.fn() } as any;
    await expect(
      applySaleVoidReversal(tx, audit, 'missing', 'reason', { userId: 'u1' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws BadRequestException when status cannot be voided', async () => {
    const tx = {
      execute: jest.fn().mockResolvedValueOnce({ rows: [{ ...baseSale, status: 'refunded' }] }),
    } as any;
    const audit = { log: jest.fn() } as any;
    await expect(
      applySaleVoidReversal(tx, audit, 'sale-1', 'reason', { userId: 'u1' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws InternalServerError when the void update returns no row', async () => {
    const saleUpdate = {
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({ returning: jest.fn().mockResolvedValue([]) }),
      }),
    };
    const tx = {
      execute: jest.fn().mockResolvedValueOnce({ rows: [baseSale] }),
      update: jest.fn().mockReturnValueOnce(saleUpdate),
    } as any;
    const audit = { log: jest.fn() } as any;
    await expect(
      applySaleVoidReversal(tx, audit, 'sale-1', 'reason', { userId: 'u1' }),
    ).rejects.toThrow('Failed to void sale transaction');
  });

  it('falls back to the existing void reason when none is supplied and uses a custom audit action', async () => {
    const updatedSale = { ...baseSale, status: 'voided', voidReason: 'original-reason' };
    const setSpy = jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({ returning: jest.fn().mockResolvedValue([updatedSale]) }),
    });
    const tx = {
      execute: jest.fn()
        .mockResolvedValueOnce({ rows: [{ ...baseSale, voidReason: 'original-reason' }] })
        .mockResolvedValueOnce({ rows: [] }), // no original ledger entries -> 0 reversals
      update: jest.fn().mockReturnValue({ set: setSpy }),
      insert: jest.fn(),
    } as any;
    const audit = { log: jest.fn().mockResolvedValue(undefined) } as any;

    const result = await applySaleVoidReversal(
      tx,
      audit,
      'sale-1',
      '   ', // blank -> falls back to existing.voidReason
      { userId: 'u1' },
      { auditAction: 'void_approved' },
    );

    expect(result.statusChanged).toBe(true);
    expect(result.reversalRowsInserted).toBe(0);
    expect(setSpy).toHaveBeenCalledWith(
      expect.objectContaining({ voidReason: 'original-reason' }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'void_approved' }),
      tx,
    );
  });

  it('tops up only the missing portion when a partial reversal already exists', async () => {
    const updatedSale = { ...baseSale, status: 'voided' };
    const saleUpdate = {
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({ returning: jest.fn().mockResolvedValue([updatedSale]) }),
      }),
    };
    const tankUpdate = {
      set: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) }),
    };
    const insertValues = jest.fn().mockResolvedValue(undefined);
    const tx = {
      execute: jest.fn()
        .mockResolvedValueOnce({ rows: [baseSale] })
        .mockResolvedValueOnce({ rows: [originalLedger] }) // sold -50 => need +50 reversal
        .mockResolvedValueOnce({ rows: [{ ...originalLedger, quantity: '20.000' }] }), // 20 already reversed
      update: jest.fn().mockReturnValueOnce(saleUpdate).mockReturnValueOnce(tankUpdate),
      insert: jest.fn().mockReturnValue({ values: insertValues }),
    } as any;
    const audit = { log: jest.fn().mockResolvedValue(undefined) } as any;

    const result = await applySaleVoidReversal(tx, audit, 'sale-1', 'reason', { userId: 'u1' });

    expect(result.reversalRowsInserted).toBe(1);
    // required +50, already +20 => top up 30
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ quantity: '30.000', movementType: 'void_reversal' }),
    );
  });
});
