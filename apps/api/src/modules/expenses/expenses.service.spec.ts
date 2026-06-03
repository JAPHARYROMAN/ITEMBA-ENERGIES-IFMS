import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { DRIZZLE } from '../../database/database.module';
import { AuditService } from '../audit/audit.service';
import { GovernanceService } from '../governance/governance.service';
import { createDrizzleMock, DrizzleMock } from '../setup/__testutils__/drizzle-mock';

const mockAudit = { log: jest.fn() };
const mockGovernance = { initiateControlledActionRequest: jest.fn() };

describe('ExpensesService', () => {
  let service: ExpensesService;
  let drizzle: DrizzleMock;

  beforeEach(async () => {
    mockAudit.log.mockClear();
    drizzle = createDrizzleMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpensesService,
        { provide: DRIZZLE, useValue: drizzle.db },
        { provide: AuditService, useValue: mockAudit },
        { provide: GovernanceService, useValue: mockGovernance },
      ],
    }).compile();
    service = module.get(ExpensesService);
  });

  afterEach(() => drizzle.reset());

  const ctx = { userId: 'u1' };

  describe('listExpenseCategories', () => {
    it('returns data and total with filters and search', async () => {
      drizzle.queue([{ id: 'cat1' }]);
      drizzle.queue([{ count: 5 }]);
      const res = await service.listExpenseCategories({ companyId: 'c1', branchId: 'b1', status: 'active', q: 'fuel' });
      expect(res.total).toBe(5);
      expect(res.data).toEqual([{ id: 'cat1' }]);
    });

    it('defaults total to 0 when count missing', async () => {
      drizzle.queue([]);
      drizzle.queue([]);
      const res = await service.listExpenseCategories({});
      expect(res.total).toBe(0);
    });
  });

  describe('getExpenseCategory', () => {
    it('returns the category', async () => {
      drizzle.queue([{ id: 'cat1', name: 'Fuel' }]);
      await expect(service.getExpenseCategory('cat1')).resolves.toEqual({ id: 'cat1', name: 'Fuel' });
    });

    it('throws NotFoundException when missing', async () => {
      drizzle.queue([]);
      await expect(service.getExpenseCategory('x')).rejects.toThrow(NotFoundException);
    });
  });

  describe('createExpenseCategory', () => {
    const dto: any = { companyId: 'c1', branchId: 'b1', code: ' FUEL ', name: ' Fuel ' };

    it('throws BadRequestException when branch not in company', async () => {
      drizzle.queue([]); // assertBranchInCompany -> branch lookup empty
      await expect(service.createExpenseCategory(dto, ctx)).rejects.toThrow(BadRequestException);
    });

    it('inserts and audits on success', async () => {
      drizzle.queue([{ id: 'b1' }]); // branch lookup ok
      drizzle.queue([{ id: 'cat1', companyId: 'c1', code: 'FUEL' }]); // insert returning
      const res = await service.createExpenseCategory(dto, ctx);
      expect(res).toEqual({ id: 'cat1', companyId: 'c1', code: 'FUEL' });
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'expense_categories', action: 'create' }),
      );
    });

    it('maps a unique violation into a ConflictException', async () => {
      drizzle.queue([{ id: 'b1' }]); // branch lookup ok
      drizzle.db.returning.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: '23505' }));
      await expect(service.createExpenseCategory(dto, ctx)).rejects.toThrow(ConflictException);
    });
  });

  describe('getExpenseEntry', () => {
    it('returns the entry', async () => {
      drizzle.queue([{ id: 'e1' }]);
      await expect(service.getExpenseEntry('e1')).resolves.toEqual({ id: 'e1' });
    });

    it('throws NotFoundException when missing', async () => {
      drizzle.queue([]);
      await expect(service.getExpenseEntry('x')).rejects.toThrow(NotFoundException);
    });
  });

  describe('listPettyCashLedger', () => {
    it('requires companyId and branchId', async () => {
      await expect(service.listPettyCashLedger({ companyId: 'c1' })).rejects.toThrow(BadRequestException);
    });

    it('returns ledger data, total and derived balance', async () => {
      // The three reads run under Promise.all and the FIFO mock cannot
      // guarantee which await consumes which row, so queue a row that satisfies
      // every shape (id for data, count for total, topup/spend for balance).
      const row = { id: 'pc1', count: 2, topup: '500', spend: '200' };
      drizzle.queue([row]);
      drizzle.queue([row]);
      drizzle.queue([row]);
      const res = await service.listPettyCashLedger({ companyId: 'c1', branchId: 'b1', dateFrom: '2026-01-01' });
      expect(res.total).toBe(2);
      expect(res.balance).toBe(300); // topup 500 - spend 200
      expect(res.data).toEqual([row]);
    });
  });
});
