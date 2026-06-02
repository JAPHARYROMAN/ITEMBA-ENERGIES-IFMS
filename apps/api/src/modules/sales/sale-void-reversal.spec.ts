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
});
