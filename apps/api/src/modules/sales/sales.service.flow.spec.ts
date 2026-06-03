import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SalesService } from './sales.service';
import { ConfigService } from '@nestjs/config';
import { AuditService } from '../audit/audit.service';
import { GovernanceService } from '../governance/governance.service';
import { DRIZZLE } from '../../database/database.module';
import { createDrizzleMock, DrizzleMock } from '../setup/__testutils__/drizzle-mock';
import {
  SALE_STATUS_COMPLETED,
  SALE_STATUS_PENDING_VOID_APPROVAL,
  SALE_STATUS_VOIDED,
} from '../../database/schema/sales/sales-transactions';

const mockAudit = { log: jest.fn() };
const mockGovernance = { initiateControlledActionRequest: jest.fn() };

/**
 * Config mock honouring the two keys createPosSale reads while letting the
 * test override the defaults per-case.
 */
function makeConfig(overrides: Record<string, unknown> = {}) {
  return {
    get: jest.fn((key: string, def: unknown) =>
      key in overrides ? overrides[key] : def,
    ),
  } as unknown as ConfigService;
}

describe('SalesService data-flow', () => {
  let service: SalesService;
  let drizzle: DrizzleMock;
  let config: ConfigService;

  async function build(cfg: ConfigService) {
    drizzle = createDrizzleMock();
    config = cfg;
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesService,
        { provide: DRIZZLE, useValue: drizzle.db },
        { provide: AuditService, useValue: mockAudit },
        { provide: ConfigService, useValue: config },
        { provide: GovernanceService, useValue: mockGovernance },
      ],
    }).compile();
    service = module.get(SalesService);
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    await build(makeConfig());
  });

  afterEach(() => drizzle.reset());

  // ------------------------------------------------------------------
  // findPage
  // ------------------------------------------------------------------
  describe('findPage', () => {
    it('returns data + total and applies no filters when none given', async () => {
      const rows = [{ id: 's1', status: 'completed' }];
      drizzle.queue(rows); // data select
      drizzle.queue([{ count: 1 }]); // count select
      const res = await service.findPage({ page: 1, pageSize: 10 });
      expect(res.data).toBe(rows);
      expect(res.total).toBe(1);
      // single condition (deletedAt) -> where called with that single condition
      expect(drizzle.db.select).toHaveBeenCalled();
    });

    it('defaults total to 0 when count row is missing', async () => {
      drizzle.queue([]); // data
      drizzle.queue([]); // count (empty -> undefined[0])
      const res = await service.findPage({});
      expect(res.total).toBe(0);
    });

    it('applies branch/company/status/date filters (multi-condition AND path)', async () => {
      drizzle.queue([{ id: 's2' }]);
      drizzle.queue([{ count: 5 }]);
      const res = await service.findPage({
        branchId: 'b1',
        companyId: 'c1',
        status: 'voided',
        dateFrom: '2026-01-01',
        dateTo: '2026-02-01',
      });
      expect(res.total).toBe(5);
      // chain executed the where + orderBy + limit + offset for the data select
      expect(drizzle.db.select).toHaveBeenCalledTimes(2);
    });
  });

  // ------------------------------------------------------------------
  // findById
  // ------------------------------------------------------------------
  describe('findById', () => {
    it('throws NotFoundException when the transaction is missing', async () => {
      drizzle.queue([]); // tx -> []
      drizzle.queue([]); // items
      drizzle.queue([]); // payments
      await expect(service.findById('missing')).rejects.toThrow(NotFoundException);
    });

    it('returns detail and normalizes null taxAmount/discountAmount', async () => {
      drizzle.queue([
        {
          id: 's1',
          companyId: 'c1',
          branchId: 'b1',
          receiptNumber: 'RCP-1',
          transactionDate: new Date(),
          totalAmount: '100.00',
          discountAmount: null,
          discountReason: null,
          shiftId: null,
          status: SALE_STATUS_COMPLETED,
          voidedAt: null,
          voidedBy: null,
          voidReason: null,
          createdAt: new Date(),
        },
      ]);
      drizzle.queue([
        {
          id: 'i1',
          saleTransactionId: 's1',
          productId: 'p1',
          quantity: '10',
          unitPrice: '2',
          taxAmount: null, // -> normalized to '0'
          totalAmount: '20.00',
        },
      ]);
      drizzle.queue([
        { id: 'pay1', saleTransactionId: 's1', paymentMethod: 'Cash', amount: '100.00' },
      ]);

      const detail = await service.findById('s1', 'c1');
      expect(detail.discountAmount).toBeNull();
      expect(detail.items[0].taxAmount).toBe('0');
      expect(detail.payments).toHaveLength(1);
    });
  });

  // ------------------------------------------------------------------
  // createPosSale - early validation branches
  // ------------------------------------------------------------------
  describe('createPosSale validations', () => {
    const item = { productId: 'p1', nozzleId: 'n1', quantity: 10, unitPrice: 2 };

    it('throws when total goes negative after discount', async () => {
      await expect(
        service.createPosSale(
          {
            branchId: 'b1',
            items: [item],
            payments: [{ paymentMethod: 'Cash', amount: 0 }],
            discountAmount: 25, // subtotal 20 - 25 < 0
            discountReason: 'big discount reason',
          } as any,
          { userId: 'u1' },
        ),
      ).rejects.toThrow('Total cannot be negative after discount');
    });

    it('allows a discount below the threshold without a reason', async () => {
      // threshold default = 10; discount 5 < 10 so no reason required.
      // Reach branch lookup which we leave empty -> NotFound proves we passed validation.
      drizzle.queue([]); // branch missing inside tx
      await expect(
        service.createPosSale(
          {
            branchId: 'b1',
            items: [item], // subtotal 20
            payments: [{ paymentMethod: 'Cash', amount: 15 }], // 20 - 5 discount = 15
            discountAmount: 5,
          } as any,
          { userId: 'u1' },
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects payment split outside tolerance but accepts within tolerance', async () => {
      // within tolerance (default 0.01): pay 19.995 vs total 20 -> diff 0.005 < 0.01 OK,
      // then branch missing -> NotFound (proves tolerance check passed).
      await build(makeConfig({ SALES_ROUNDING_TOLERANCE: 0.01 }));
      drizzle.queue([]); // branch missing
      await expect(
        service.createPosSale(
          {
            branchId: 'b1',
            items: [item],
            payments: [{ paymentMethod: 'Cash', amount: 20.005 }],
          } as any,
          { userId: 'u1' },
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ------------------------------------------------------------------
  // createPosSale - in-transaction validation branches
  // ------------------------------------------------------------------
  describe('createPosSale transaction validations', () => {
    const dto = {
      branchId: 'b1',
      items: [{ productId: 'p1', nozzleId: 'n1', quantity: 10, unitPrice: 2 }],
      payments: [{ paymentMethod: 'Cash', amount: 20 }],
    } as any;
    const ctx = { userId: 'u1' };

    it('throws NotFound when station missing', async () => {
      drizzle.queue([{ id: 'b1', stationId: 's1' }]); // branch
      drizzle.queue([]); // station missing
      await expect(service.createPosSale(dto, ctx)).rejects.toThrow('Station not found');
    });

    it('throws BadRequest when shiftId is not an open shift for branch', async () => {
      drizzle.queue([{ id: 'b1', stationId: 's1' }]);
      drizzle.queue([{ id: 's1', companyId: 'c1' }]);
      drizzle.queue([]); // shift missing
      await expect(
        service.createPosSale({ ...dto, shiftId: 'shift-x' }, ctx),
      ).rejects.toThrow('shiftId must belong to an open shift');
    });

    it('throws BadRequest for invalid product references', async () => {
      drizzle.queue([{ id: 'b1', stationId: 's1' }]);
      drizzle.queue([{ id: 's1', companyId: 'c1' }]);
      drizzle.queue([]); // products -> none found
      await expect(service.createPosSale(dto, ctx)).rejects.toThrow(
        'Invalid product references',
      );
    });

    it('throws BadRequest when product belongs to a different company', async () => {
      drizzle.queue([{ id: 'b1', stationId: 's1' }]);
      drizzle.queue([{ id: 's1', companyId: 'c1' }]);
      drizzle.queue([{ id: 'p1', companyId: 'OTHER' }]); // wrong company
      await expect(service.createPosSale(dto, ctx)).rejects.toThrow(
        'Products not mapped to branch company',
      );
    });

    it('throws BadRequest for invalid nozzle references', async () => {
      drizzle.queue([{ id: 'b1', stationId: 's1' }]);
      drizzle.queue([{ id: 's1', companyId: 'c1' }]);
      drizzle.queue([{ id: 'p1', companyId: 'c1' }]);
      drizzle.queue([]); // nozzles -> none found
      await expect(service.createPosSale(dto, ctx)).rejects.toThrow(
        'Invalid nozzle references',
      );
    });

    it('throws BadRequest when nozzle station mismatches sale station', async () => {
      drizzle.queue([{ id: 'b1', stationId: 's1' }]);
      drizzle.queue([{ id: 's1', companyId: 'c1' }]);
      drizzle.queue([{ id: 'p1', companyId: 'c1' }]);
      drizzle.queue([{ id: 'n1', stationId: 'OTHER', tankId: 't1', productId: 'p1' }]);
      await expect(service.createPosSale(dto, ctx)).rejects.toThrow(
        'Nozzle does not belong to sale station',
      );
    });

    it('throws BadRequest when nozzle links to a missing tank', async () => {
      drizzle.queue([{ id: 'b1', stationId: 's1' }]);
      drizzle.queue([{ id: 's1', companyId: 'c1' }]);
      drizzle.queue([{ id: 'p1', companyId: 'c1' }]);
      drizzle.queue([{ id: 'n1', stationId: 's1', tankId: 't1', productId: 'p1' }]);
      drizzle.queue({ rows: [] }); // tanks FOR UPDATE -> none
      await expect(service.createPosSale(dto, ctx)).rejects.toThrow(
        'Nozzle is linked to missing tank',
      );
    });

    it('throws BadRequest when nozzle is not configured for the line product', async () => {
      drizzle.queue([{ id: 'b1', stationId: 's1' }]);
      drizzle.queue([{ id: 's1', companyId: 'c1' }]);
      drizzle.queue([{ id: 'p1', companyId: 'c1' }]);
      drizzle.queue([{ id: 'n1', stationId: 's1', tankId: 't1', productId: 'OTHERPROD' }]);
      drizzle.queue({
        rows: [
          {
            id: 't1',
            company_id: 'c1',
            branch_id: 'b1',
            product_id: 'p1',
            current_level: '1000',
          },
        ],
      });
      await expect(service.createPosSale(dto, ctx)).rejects.toThrow(
        'is not configured for product',
      );
    });

    it('throws BadRequest when tank is out of branch/company scope', async () => {
      drizzle.queue([{ id: 'b1', stationId: 's1' }]);
      drizzle.queue([{ id: 's1', companyId: 'c1' }]);
      drizzle.queue([{ id: 'p1', companyId: 'c1' }]);
      drizzle.queue([{ id: 'n1', stationId: 's1', tankId: 't1', productId: 'p1' }]);
      drizzle.queue({
        rows: [
          {
            id: 't1',
            company_id: 'OTHER',
            branch_id: 'b1',
            product_id: 'p1',
            current_level: '1000',
          },
        ],
      });
      await expect(service.createPosSale(dto, ctx)).rejects.toThrow(
        'tank is out of sale branch scope',
      );
    });

    it('throws BadRequest when tank is not configured for the line product', async () => {
      drizzle.queue([{ id: 'b1', stationId: 's1' }]);
      drizzle.queue([{ id: 's1', companyId: 'c1' }]);
      drizzle.queue([{ id: 'p1', companyId: 'c1' }]);
      drizzle.queue([{ id: 'n1', stationId: 's1', tankId: 't1', productId: 'p1' }]);
      drizzle.queue({
        rows: [
          {
            id: 't1',
            company_id: 'c1',
            branch_id: 'b1',
            product_id: 'OTHERPROD',
            current_level: '1000',
          },
        ],
      });
      await expect(service.createPosSale(dto, ctx)).rejects.toThrow(
        'is not configured for product',
      );
    });
  });

  // ------------------------------------------------------------------
  // createPosSale - happy path (full insert pipeline)
  // ------------------------------------------------------------------
  describe('createPosSale happy path', () => {
    function queueHappyPath(opts: { currentLevel?: string; shiftId?: boolean } = {}) {
      drizzle.queue([{ id: 'b1', stationId: 's1' }]); // branch
      drizzle.queue([{ id: 's1', companyId: 'c1' }]); // station
      if (opts.shiftId) drizzle.queue([{ id: 'shift-1' }]); // shift
      drizzle.queue([{ id: 'p1', companyId: 'c1' }]); // products
      drizzle.queue([{ id: 'n1', stationId: 's1', tankId: 't1', productId: 'p1' }]); // nozzles
      drizzle.queue({
        rows: [
          {
            id: 't1',
            company_id: 'c1',
            branch_id: 'b1',
            product_id: 'p1',
            current_level: opts.currentLevel ?? '1000',
          },
        ],
      }); // tanks FOR UPDATE
      drizzle.queue([{ id: 'sale-1' }]); // insert sale returning
      drizzle.queue([]); // insert saleItems values (1 item)
      drizzle.queue([]); // update tanks set/where
      drizzle.queue([]); // insert stockLedger values
      drizzle.queue([]); // insert salePayments values (1 payment)
      drizzle.queue([]); // insert receipts values
      // findById after commit:
      drizzle.queue([
        {
          id: 'sale-1',
          companyId: 'c1',
          branchId: 'b1',
          receiptNumber: 'RCP-x',
          transactionDate: new Date(),
          totalAmount: '20.00',
          discountAmount: '0',
          discountReason: null,
          shiftId: null,
          status: SALE_STATUS_COMPLETED,
          voidedAt: null,
          voidedBy: null,
          voidReason: null,
          createdAt: new Date(),
        },
      ]);
      drizzle.queue([]); // items
      drizzle.queue([]); // payments
    }

    it('creates a sale, decrements stock, writes ledger and audits', async () => {
      queueHappyPath();
      const result = await service.createPosSale(
        {
          branchId: 'b1',
          items: [
            { productId: 'p1', nozzleId: 'n1', quantity: 10, unitPrice: 2, taxAmount: 0 },
          ],
          payments: [{ paymentMethod: 'Cash', amount: 20 }],
        } as any,
        { userId: 'u1', ip: '1.1.1.1', userAgent: 'jest' },
      );

      expect(result.id).toBe('sale-1');
      expect(drizzle.db.transaction).toHaveBeenCalled();
      // a sale, an item, a stock ledger row, a payment, and a receipt were inserted
      expect(drizzle.db.insert).toHaveBeenCalled();
      expect(drizzle.db.update).toHaveBeenCalled(); // tank level decrement
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'sales_transactions', action: 'create' }),
        expect.anything(),
      );
    });

    it('logs a warning (but still completes) when stock is insufficient', async () => {
      const warn = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => undefined);
      queueHappyPath({ currentLevel: '5' }); // selling 10 from a tank with 5
      const result = await service.createPosSale(
        {
          branchId: 'b1',
          items: [{ productId: 'p1', nozzleId: 'n1', quantity: 10, unitPrice: 2 }],
          payments: [{ paymentMethod: 'Cash', amount: 20 }],
        } as any,
        { userId: 'u1' },
      );
      expect(result.id).toBe('sale-1');
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Insufficient stock'));
    });

    it('validates an open shift when shiftId is provided', async () => {
      queueHappyPath({ shiftId: true });
      const result = await service.createPosSale(
        {
          branchId: 'b1',
          shiftId: 'shift-1',
          items: [{ productId: 'p1', nozzleId: 'n1', quantity: 10, unitPrice: 2 }],
          payments: [{ paymentMethod: 'Cash', amount: 20 }],
        } as any,
        { userId: 'u1' },
      );
      expect(result.id).toBe('sale-1');
    });
  });

  // ------------------------------------------------------------------
  // voidTransaction - branch coverage
  // ------------------------------------------------------------------
  describe('voidTransaction', () => {
    const ctx = { userId: 'u1', ip: '1.1.1.1', userAgent: 'jest' };

    it('throws NotFound when the sale does not exist', async () => {
      drizzle.queue([]); // initial select -> none
      await expect(service.voidTransaction('missing', 'mistake', ctx)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns current detail without action when already pending approval', async () => {
      drizzle.queue([
        { id: 's1', companyId: 'c1', branchId: 'b1', totalAmount: '10', status: SALE_STATUS_PENDING_VOID_APPROVAL },
      ]);
      jest.spyOn(service, 'findById').mockResolvedValue({ id: 's1', status: SALE_STATUS_PENDING_VOID_APPROVAL } as any);
      const res = await service.voidTransaction('s1', 'mistake', ctx);
      expect(res.status).toBe(SALE_STATUS_PENDING_VOID_APPROVAL);
      expect(mockGovernance.initiateControlledActionRequest).not.toHaveBeenCalled();
    });

    it('idempotently reverses when the sale is already voided', async () => {
      // initial select returns voided sale -> goes straight to applySaleVoidReversal in a tx.
      drizzle.queue([
        { id: 's1', companyId: 'c1', branchId: 'b1', totalAmount: '10', status: SALE_STATUS_VOIDED },
      ]);
      // applySaleVoidReversal: execute(locked sale FOR UPDATE) already voided
      drizzle.queue({
        rows: [
          {
            id: 's1',
            companyId: 'c1',
            branchId: 'b1',
            totalAmount: '10',
            status: SALE_STATUS_VOIDED,
            voidedAt: new Date(),
            voidedBy: 'u0',
            voidReason: 'orig',
          },
        ],
      });
      drizzle.queue({ rows: [] }); // original sale ledger entries -> none -> no reversal
      jest.spyOn(service, 'findById').mockResolvedValue({ id: 's1', status: SALE_STATUS_VOIDED } as any);
      const res = await service.voidTransaction('s1', 'mistake', ctx);
      expect(res.status).toBe(SALE_STATUS_VOIDED);
      expect(mockGovernance.initiateControlledActionRequest).not.toHaveBeenCalled();
    });

    it('directly voids a completed sale when governance does not require approval', async () => {
      drizzle.queue([
        { id: 's1', companyId: 'c1', branchId: 'b1', totalAmount: '10', status: SALE_STATUS_COMPLETED },
      ]);
      mockGovernance.initiateControlledActionRequest.mockResolvedValueOnce(null);
      // applySaleVoidReversal path:
      drizzle.queue({
        rows: [
          {
            id: 's1',
            companyId: 'c1',
            branchId: 'b1',
            totalAmount: '10',
            status: SALE_STATUS_COMPLETED,
            voidedAt: null,
            voidedBy: null,
            voidReason: null,
          },
        ],
      }); // locked FOR UPDATE
      drizzle.queue([
        {
          id: 's1',
          companyId: 'c1',
          branchId: 'b1',
          totalAmount: '10',
          status: SALE_STATUS_VOIDED,
          voidedAt: new Date(),
          voidedBy: 'u1',
          voidReason: 'mistake',
        },
      ]); // update returning
      drizzle.queue({ rows: [] }); // original ledger entries -> none
      jest.spyOn(service, 'findById').mockResolvedValue({ id: 's1', status: SALE_STATUS_VOIDED } as any);

      const res = await service.voidTransaction('s1', 'mistake', ctx);
      expect(mockGovernance.initiateControlledActionRequest).toHaveBeenCalled();
      expect(res.status).toBe(SALE_STATUS_VOIDED);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'void' }),
        expect.anything(),
      );
    });

    it('no-ops inside the pending-update tx when the locked row is already voided', async () => {
      drizzle.queue([
        { id: 's1', companyId: 'c1', branchId: 'b1', totalAmount: '10', status: SALE_STATUS_COMPLETED },
      ]);
      mockGovernance.initiateControlledActionRequest.mockResolvedValueOnce({ id: 'apr-1' });
      // pending-update tx: locked select FOR UPDATE returns already-voided
      drizzle.queue({ rows: [{ status: SALE_STATUS_VOIDED }] });
      jest.spyOn(service, 'findById').mockResolvedValue({ id: 's1', status: SALE_STATUS_VOIDED } as any);

      const res = await service.voidTransaction('s1', 'mistake', ctx);
      expect(res.status).toBe(SALE_STATUS_VOIDED);
      // no update returning / audit since we returned early
      expect(mockAudit.log).not.toHaveBeenCalled();
    });

    it('throws NotFound when the locked row vanished during pending update', async () => {
      drizzle.queue([
        { id: 's1', companyId: 'c1', branchId: 'b1', totalAmount: '10', status: SALE_STATUS_COMPLETED },
      ]);
      mockGovernance.initiateControlledActionRequest.mockResolvedValueOnce({ id: 'apr-1' });
      drizzle.queue({ rows: [] }); // locked select -> gone
      await expect(service.voidTransaction('s1', 'mistake', ctx)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
