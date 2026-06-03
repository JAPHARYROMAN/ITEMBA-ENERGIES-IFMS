import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { DRIZZLE } from '../../database/database.module';
import { AuditService } from '../audit/audit.service';
import { GovernanceService } from '../governance/governance.service';
import { createDrizzleMock, DrizzleMock } from '../setup/__testutils__/drizzle-mock';

const mockAudit = { log: jest.fn() };
const mockGovernance = { initiateControlledActionRequest: jest.fn() };

/**
 * The shared drizzle mock does not implement the `.for('update')` row-locking
 * helper that some service reads chain on. We patch it onto the live chain
 * object (obtained from a `select()` call) so the thenable behaviour is
 * preserved — `.for()` simply returns the same chain.
 */
function patchForUpdate(drizzle: DrizzleMock): void {
  const chain: any = drizzle.db.select();
  chain.for = jest.fn(() => chain);
}

describe('ExpensesService (extended)', () => {
  let service: ExpensesService;
  let drizzle: DrizzleMock;

  beforeEach(async () => {
    mockAudit.log.mockClear();
    mockGovernance.initiateControlledActionRequest.mockReset();
    drizzle = createDrizzleMock();
    patchForUpdate(drizzle);
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

  const ctx = { userId: 'u1', ip: '10.0.0.1', userAgent: 'jest' };
  const managerRows = [{ roleCode: 'manager' }];

  // ----------------------------------------------------------------------
  // Category CRUD: update / delete / sort
  // ----------------------------------------------------------------------
  describe('updateExpenseCategory', () => {
    const dto: any = { code: ' NEW ', name: ' New ', description: '  ', status: 'inactive', branchId: 'b2' };

    it('updates, re-asserts branch scope and audits', async () => {
      drizzle.queue([{ id: 'cat1', companyId: 'c1', branchId: 'b1' }]); // getExpenseCategory (before)
      drizzle.queue([{ id: 'b2' }]); // assertBranchInCompany ok
      drizzle.queue([{ id: 'cat1', companyId: 'c1', code: 'NEW' }]); // update returning
      const res = await service.updateExpenseCategory('cat1', dto, ctx);
      expect(res).toEqual({ id: 'cat1', companyId: 'c1', code: 'NEW' });
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'expense_categories', action: 'update' }),
      );
    });

    it('throws NotFoundException when the category does not exist', async () => {
      drizzle.queue([]); // getExpenseCategory -> empty
      await expect(service.updateExpenseCategory('x', dto, ctx)).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when target branch is not in company', async () => {
      drizzle.queue([{ id: 'cat1', companyId: 'c1', branchId: 'b1' }]); // before
      drizzle.queue([]); // assertBranchInCompany fails
      await expect(service.updateExpenseCategory('cat1', dto, ctx)).rejects.toThrow(BadRequestException);
    });

    it('maps a unique violation on update into a ConflictException', async () => {
      drizzle.queue([{ id: 'cat1', companyId: 'c1', branchId: 'b1' }]); // before
      drizzle.queue([{ id: 'b2' }]); // branch ok
      drizzle.db.returning.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: '23505' }));
      await expect(service.updateExpenseCategory('cat1', dto, ctx)).rejects.toThrow(ConflictException);
    });

    it('throws NotFoundException when update returns nothing', async () => {
      drizzle.queue([{ id: 'cat1', companyId: 'c1', branchId: 'b1' }]); // before
      drizzle.queue([{ id: 'b1' }]); // branch ok
      drizzle.queue([]); // update returning empty
      await expect(service.updateExpenseCategory('cat1', {} as any, ctx)).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteExpenseCategory', () => {
    it('soft-deletes and audits', async () => {
      drizzle.queue([{ id: 'cat1', companyId: 'c1' }]); // getExpenseCategory
      drizzle.queue([]); // update (no returning awaited)
      await service.deleteExpenseCategory('cat1', ctx);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'expense_categories', action: 'delete' }),
      );
    });

    it('throws NotFoundException when missing', async () => {
      drizzle.queue([]);
      await expect(service.deleteExpenseCategory('x', ctx)).rejects.toThrow(NotFoundException);
    });
  });

  describe('listExpenseCategories sort branches', () => {
    it('honours an explicit ascending sort column', async () => {
      drizzle.queue([{ id: 'cat1' }]);
      drizzle.queue([{ count: 1 }]);
      const res = await service.listExpenseCategories({ sort: 'code:asc' });
      expect(res.total).toBe(1);
    });

    it('falls back to default ordering for an unknown sort field', async () => {
      drizzle.queue([{ id: 'cat1' }]);
      drizzle.queue([{ count: 1 }]);
      const res = await service.listExpenseCategories({ sort: 'bogus:desc' });
      expect(res.data).toEqual([{ id: 'cat1' }]);
    });
  });

  // ----------------------------------------------------------------------
  // Expense entry create
  // ----------------------------------------------------------------------
  describe('createExpenseEntry', () => {
    const dto: any = {
      companyId: 'c1',
      branchId: 'b1',
      categoryId: 'cat1',
      category: ' Fuel ',
      amount: 25.5,
      vendor: ' Shell ',
      paymentMethod: 'cash',
      description: ' note ',
      billableDepartment: ' Ops ',
      attachmentName: ' r.pdf ',
    };

    it('asserts scope (branch + category), inserts and audits', async () => {
      drizzle.queue([{ id: 'b1' }]); // assertBranchInCompany
      drizzle.queue([{ id: 'cat1' }]); // assertCategoryInScope
      drizzle.queue([{ id: 'e1', companyId: 'c1' }]); // insert returning
      const res = await service.createExpenseEntry(dto, ctx);
      expect(res).toEqual({ id: 'e1', companyId: 'c1' });
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'expense_entries', action: 'create' }),
      );
    });

    it('throws when category is not active in scope', async () => {
      drizzle.queue([{ id: 'b1' }]); // branch ok
      drizzle.queue([]); // category lookup empty
      await expect(service.createExpenseEntry(dto, ctx)).rejects.toThrow(BadRequestException);
    });

    it('throws when branch not in company', async () => {
      drizzle.queue([]); // branch lookup empty
      await expect(service.createExpenseEntry(dto, ctx)).rejects.toThrow(BadRequestException);
    });

    it('skips category assertion when no categoryId given', async () => {
      drizzle.queue([{ id: 'b1' }]); // branch ok
      drizzle.queue([{ id: 'e1', companyId: 'c1' }]); // insert returning
      const res = await service.createExpenseEntry({ ...dto, categoryId: undefined }, ctx);
      expect(res.id).toBe('e1');
    });

    it('throws InternalServerErrorException when insert returns nothing', async () => {
      drizzle.queue([{ id: 'b1' }]);
      drizzle.queue([{ id: 'cat1' }]);
      drizzle.queue([]); // insert returning empty
      await expect(service.createExpenseEntry(dto, ctx)).rejects.toThrow(InternalServerErrorException);
    });
  });

  // ----------------------------------------------------------------------
  // Expense entry update
  // ----------------------------------------------------------------------
  describe('updateExpenseEntry', () => {
    const base = { id: 'e1', companyId: 'c1', branchId: 'b1', categoryId: 'cat1', status: 'draft' };
    const dto: any = {
      category: ' New ',
      amount: 99.999,
      vendor: ' V ',
      paymentMethod: 'bank',
      description: '  ',
      billableDepartment: '  ',
      attachmentName: '  ',
      categoryId: 'cat2',
    };

    it('updates a draft entry, re-asserts scope and audits', async () => {
      drizzle.queue([base]); // before
      drizzle.queue([{ id: 'b1' }]); // assertBranchInCompany
      drizzle.queue([{ id: 'cat2' }]); // assertCategoryInScope (nextCategoryId)
      drizzle.queue([{ id: 'e1', amount: '100.00' }]); // update returning
      const res = await service.updateExpenseEntry('e1', dto, ctx);
      expect(res).toEqual({ id: 'e1', amount: '100.00' });
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'expense_entries', action: 'update' }),
      );
    });

    it('throws NotFoundException when entry missing', async () => {
      drizzle.queue([]);
      await expect(service.updateExpenseEntry('x', dto, ctx)).rejects.toThrow(NotFoundException);
    });

    it('rejects editing of a submitted entry', async () => {
      drizzle.queue([{ ...base, status: 'submitted' }]);
      await expect(service.updateExpenseEntry('e1', dto, ctx)).rejects.toThrow(BadRequestException);
    });

    it('allows editing a rejected entry (status resets to draft)', async () => {
      drizzle.queue([{ ...base, status: 'rejected' }]); // before
      drizzle.queue([{ id: 'b1' }]); // branch ok
      drizzle.queue([{ id: 'cat2' }]); // category ok
      drizzle.queue([{ id: 'e1', status: 'draft' }]); // returning
      const res = await service.updateExpenseEntry('e1', dto, ctx);
      expect(res.status).toBe('draft');
    });

    it('clearing the categoryId skips category scope check', async () => {
      drizzle.queue([{ ...base, categoryId: 'cat1' }]); // before
      drizzle.queue([{ id: 'b1' }]); // branch ok
      drizzle.queue([{ id: 'e1' }]); // returning
      const res = await service.updateExpenseEntry('e1', { categoryId: null } as any, ctx);
      expect(res.id).toBe('e1');
    });

    it('throws InternalServerErrorException when update returns nothing', async () => {
      drizzle.queue([base]); // before
      drizzle.queue([{ id: 'b1' }]); // branch ok
      drizzle.queue([{ id: 'cat1' }]); // category ok
      drizzle.queue([]); // returning empty
      await expect(service.updateExpenseEntry('e1', {} as any, ctx)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  // ----------------------------------------------------------------------
  // List / get / delete entry
  // ----------------------------------------------------------------------
  describe('listExpenseEntries', () => {
    it('applies all filters and search and returns total', async () => {
      drizzle.queue([{ id: 'e1' }]);
      drizzle.queue([{ count: 3 }]);
      const res = await service.listExpenseEntries({
        companyId: 'c1',
        branchId: 'b1',
        status: 'draft',
        dateFrom: '2026-01-01',
        dateTo: '2026-02-01',
        q: 'shell',
      });
      expect(res.total).toBe(3);
      expect(res.data).toEqual([{ id: 'e1' }]);
    });

    it('defaults total to 0 when count missing', async () => {
      drizzle.queue([]);
      drizzle.queue([]);
      const res = await service.listExpenseEntries({});
      expect(res.total).toBe(0);
    });
  });

  describe('deleteExpenseEntry', () => {
    it('soft-deletes a draft entry and audits', async () => {
      drizzle.queue([{ id: 'e1', companyId: 'c1', status: 'draft' }]); // before
      drizzle.queue([]); // update
      await service.deleteExpenseEntry('e1', ctx);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'expense_entries', action: 'delete' }),
      );
    });

    it('throws NotFoundException when missing', async () => {
      drizzle.queue([]);
      await expect(service.deleteExpenseEntry('x', ctx)).rejects.toThrow(NotFoundException);
    });

    it('rejects deleting a submitted entry', async () => {
      drizzle.queue([{ id: 'e1', status: 'submitted' }]);
      await expect(service.deleteExpenseEntry('e1', ctx)).rejects.toThrow(BadRequestException);
    });
  });

  // ----------------------------------------------------------------------
  // submitExpenseEntry (immediate path + idempotency + guards)
  // ----------------------------------------------------------------------
  describe('submitExpenseEntry', () => {
    const draft = {
      id: 'e1',
      companyId: 'c1',
      branchId: 'b1',
      entryNumber: 'EXP-1',
      category: 'Ops',
      amount: '100.00',
      vendor: 'V',
      description: null,
      status: 'draft',
    };

    it('throws NotFoundException when missing', async () => {
      drizzle.queue([]);
      await expect(service.submitExpenseEntry('x', ctx)).rejects.toThrow(NotFoundException);
    });

    it('is idempotent when already submitted (returns current)', async () => {
      drizzle.queue([{ ...draft, status: 'submitted' }]); // before
      drizzle.queue([{ id: 'e1', status: 'submitted' }]); // getExpenseEntry
      const res = await service.submitExpenseEntry('e1', ctx);
      expect(res.status).toBe('submitted');
      expect(mockGovernance.initiateControlledActionRequest).not.toHaveBeenCalled();
    });

    it('is idempotent when already pending_approval', async () => {
      drizzle.queue([{ ...draft, status: 'pending_approval' }]);
      drizzle.queue([{ id: 'e1', status: 'pending_approval' }]);
      const res = await service.submitExpenseEntry('e1', ctx);
      expect(res.status).toBe('pending_approval');
    });

    it('rejects submitting an approved entry', async () => {
      drizzle.queue([{ ...draft, status: 'approved' }]);
      await expect(service.submitExpenseEntry('e1', ctx)).rejects.toThrow(BadRequestException);
    });

    it('submits immediately when governance returns no request', async () => {
      mockGovernance.initiateControlledActionRequest.mockResolvedValueOnce(null);
      drizzle.queue([draft]); // before
      drizzle.queue([{ id: 'e1', companyId: 'c1', status: 'submitted' }]); // update returning
      const res = await service.submitExpenseEntry('e1', ctx);
      expect(res.status).toBe('submitted');
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'submit' }),
      );
    });

    it('immediate submit falls back to getExpenseEntry when update returns nothing', async () => {
      mockGovernance.initiateControlledActionRequest.mockResolvedValueOnce(null);
      drizzle.queue([draft]); // before
      drizzle.queue([]); // update returning empty
      drizzle.queue([{ id: 'e1', status: 'submitted' }]); // getExpenseEntry
      const res = await service.submitExpenseEntry('e1', ctx);
      expect(res.status).toBe('submitted');
    });

    it('pending path falls back to getExpenseEntry when update returns nothing', async () => {
      mockGovernance.initiateControlledActionRequest.mockResolvedValueOnce({ id: 'apr-1', status: 'submitted' });
      drizzle.queue([draft]); // before
      drizzle.queue([]); // update returning empty
      drizzle.queue([{ id: 'e1', status: 'pending_approval' }]); // getExpenseEntry
      const res = await service.submitExpenseEntry('e1', ctx);
      expect(res.status).toBe('pending_approval');
    });
  });

  // ----------------------------------------------------------------------
  // approveExpenseEntry
  // ----------------------------------------------------------------------
  describe('approveExpenseEntry', () => {
    const submitted = {
      id: 'e1',
      companyId: 'c1',
      branchId: 'b1',
      entryNumber: 'EXP-1',
      category: 'Ops',
      amount: '100.00',
      vendor: 'V',
      paymentMethod: 'bank',
      status: 'submitted',
      createdBy: 'author',
    };

    it('requires the manager role', async () => {
      drizzle.queue([]); // assertManager -> no roles
      await expect(service.approveExpenseEntry('e1', ctx)).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when entry missing', async () => {
      drizzle.queue(managerRows); // assertManager ok
      drizzle.queue([]); // tx select empty
      await expect(service.approveExpenseEntry('e1', ctx)).rejects.toThrow(NotFoundException);
    });

    it('blocks approval when an active governance workflow exists', async () => {
      drizzle.queue(managerRows); // assertManager
      drizzle.queue([submitted]); // tx select before
      drizzle.queue([{ id: 'apr-1' }]); // hasActiveExpenseApprovalRequest -> truthy
      await expect(service.approveExpenseEntry('e1', ctx)).rejects.toThrow(ConflictException);
    });

    it('blocks approval when status is pending_approval', async () => {
      drizzle.queue(managerRows);
      drizzle.queue([{ ...submitted, status: 'pending_approval' }]);
      drizzle.queue([]); // no active request, but status alone triggers
      await expect(service.approveExpenseEntry('e1', ctx)).rejects.toThrow(ConflictException);
    });

    it('rejects approving a non-submitted entry', async () => {
      drizzle.queue(managerRows);
      drizzle.queue([{ ...submitted, status: 'draft' }]);
      drizzle.queue([]); // no active request
      await expect(service.approveExpenseEntry('e1', ctx)).rejects.toThrow(BadRequestException);
    });

    it('forbids approving your own entry', async () => {
      drizzle.queue(managerRows);
      drizzle.queue([{ ...submitted, createdBy: 'u1' }]); // same as ctx.userId
      drizzle.queue([]); // no active request
      await expect(service.approveExpenseEntry('e1', ctx)).rejects.toThrow(ForbiddenException);
    });

    it('approves a bank-payment entry without touching petty cash', async () => {
      drizzle.queue(managerRows); // assertManager
      drizzle.queue([submitted]); // tx select before
      drizzle.queue([]); // hasActiveExpenseApprovalRequest -> none
      drizzle.queue([{ id: 'e1', status: 'approved' }]); // update returning
      const res = await service.approveExpenseEntry('e1', ctx);
      expect(res.status).toBe('approved');
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'approve' }),
        expect.anything(),
      );
    });

    it('approves a petty_cash entry and records a spend ledger row', async () => {
      const pc = { ...submitted, paymentMethod: 'petty_cash' };
      drizzle.queue(managerRows); // assertManager
      drizzle.queue([pc]); // tx select before
      drizzle.queue([]); // hasActiveExpenseApprovalRequest -> none
      // insertPettyCashLedgerEntry path:
      drizzle.queue([{ id: 'b1' }]); // lockPettyCashBranch
      drizzle.queue([{ topup: '500', spend: '100' }]); // getPettyCashBalance -> 400
      drizzle.queue([{ id: 'pc-row' }]); // ledger insert returning
      drizzle.queue([{ id: 'e1', status: 'approved' }]); // entry update returning
      const res = await service.approveExpenseEntry('e1', ctx);
      expect(res.status).toBe('approved');
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'petty_cash_ledger', action: 'spend' }),
        expect.anything(),
      );
    });

    it('fails petty_cash approval when balance is insufficient', async () => {
      const pc = { ...submitted, paymentMethod: 'petty_cash', amount: '1000.00' };
      drizzle.queue(managerRows);
      drizzle.queue([pc]); // before
      drizzle.queue([]); // no active request
      drizzle.queue([{ id: 'b1' }]); // lockPettyCashBranch
      drizzle.queue([{ topup: '100', spend: '50' }]); // balance 50 < 1000
      await expect(service.approveExpenseEntry('e1', ctx)).rejects.toThrow(ConflictException);
    });

    it('throws InternalServerErrorException when entry update returns nothing', async () => {
      drizzle.queue(managerRows);
      drizzle.queue([submitted]); // before
      drizzle.queue([]); // no active request
      drizzle.queue([]); // update returning empty
      await expect(service.approveExpenseEntry('e1', ctx)).rejects.toThrow(InternalServerErrorException);
    });
  });

  // ----------------------------------------------------------------------
  // rejectExpenseEntry
  // ----------------------------------------------------------------------
  describe('rejectExpenseEntry', () => {
    const submitted = {
      id: 'e1',
      companyId: 'c1',
      branchId: 'b1',
      status: 'submitted',
      createdBy: 'author',
    };

    it('requires the manager role', async () => {
      drizzle.queue([]); // assertManager -> no roles
      await expect(service.rejectExpenseEntry('e1', 'bad', ctx)).rejects.toThrow(ForbiddenException);
    });

    it('requires a non-empty reason', async () => {
      drizzle.queue(managerRows); // assertManager ok
      await expect(service.rejectExpenseEntry('e1', '   ', ctx)).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when missing', async () => {
      drizzle.queue(managerRows);
      drizzle.queue([]); // tx select empty
      await expect(service.rejectExpenseEntry('e1', 'no receipt', ctx)).rejects.toThrow(NotFoundException);
    });

    it('blocks rejection when an active governance workflow exists', async () => {
      drizzle.queue(managerRows);
      drizzle.queue([submitted]);
      drizzle.queue([{ id: 'apr-1' }]); // active request
      await expect(service.rejectExpenseEntry('e1', 'no receipt', ctx)).rejects.toThrow(ConflictException);
    });

    it('rejects a non-submitted entry with BadRequest', async () => {
      drizzle.queue(managerRows);
      drizzle.queue([{ ...submitted, status: 'draft' }]);
      drizzle.queue([]); // no active request
      await expect(service.rejectExpenseEntry('e1', 'no receipt', ctx)).rejects.toThrow(BadRequestException);
    });

    it('rejects a submitted entry, sets reason and audits', async () => {
      drizzle.queue(managerRows);
      drizzle.queue([submitted]);
      drizzle.queue([]); // no active request
      drizzle.queue([{ id: 'e1', status: 'rejected', rejectionReason: 'no receipt' }]); // returning
      const res = await service.rejectExpenseEntry('e1', '  no receipt  ', ctx);
      expect(res.status).toBe('rejected');
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'reject' }),
        expect.anything(),
      );
    });

    it('throws InternalServerErrorException when update returns nothing', async () => {
      drizzle.queue(managerRows);
      drizzle.queue([submitted]);
      drizzle.queue([]); // no active request
      drizzle.queue([]); // returning empty
      await expect(service.rejectExpenseEntry('e1', 'no receipt', ctx)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  // ----------------------------------------------------------------------
  // Petty cash transact: topup / spend
  // ----------------------------------------------------------------------
  describe('petty cash transactions', () => {
    const dto: any = { companyId: 'c1', branchId: 'b1', amount: 100, category: ' Misc ', notes: ' top up ' };

    it('topup adds to balance and audits', async () => {
      drizzle.queue([{ id: 'b1' }]); // lockPettyCashBranch
      drizzle.queue([{ topup: '0', spend: '0' }]); // balance 0
      drizzle.queue([{ id: 'pc1', balanceAfter: '100.00' }]); // insert returning
      const res = await service.topupPettyCash(dto, ctx);
      expect(res).toEqual({ id: 'pc1', balanceAfter: '100.00' });
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'petty_cash_ledger', action: 'topup' }),
        expect.anything(),
      );
    });

    it('spend subtracts from balance', async () => {
      drizzle.queue([{ id: 'b1' }]); // lock
      drizzle.queue([{ topup: '500', spend: '0' }]); // balance 500
      drizzle.queue([{ id: 'pc2', balanceAfter: '400.00' }]); // insert returning
      const res = await service.spendPettyCash({ ...dto, amount: 100, category: undefined }, ctx);
      expect(res.id).toBe('pc2');
    });

    it('rejects a non-positive amount', async () => {
      await expect(service.topupPettyCash({ ...dto, amount: 0 }, ctx)).rejects.toThrow(BadRequestException);
    });

    it('rejects spend that would overdraw the balance', async () => {
      drizzle.queue([{ id: 'b1' }]); // lock
      drizzle.queue([{ topup: '50', spend: '0' }]); // balance 50
      await expect(service.spendPettyCash({ ...dto, amount: 100 }, ctx)).rejects.toThrow(ConflictException);
    });

    it('rejects when branch lock fails (branch not in company)', async () => {
      drizzle.queue([]); // lockPettyCashBranch -> empty
      await expect(service.topupPettyCash(dto, ctx)).rejects.toThrow(BadRequestException);
    });

    it('throws InternalServerErrorException when ledger insert returns nothing', async () => {
      drizzle.queue([{ id: 'b1' }]); // lock
      drizzle.queue([{ topup: '500', spend: '0' }]); // balance
      drizzle.queue([]); // insert returning empty
      await expect(service.topupPettyCash(dto, ctx)).rejects.toThrow(InternalServerErrorException);
    });
  });

  // ----------------------------------------------------------------------
  // listPettyCashLedger with derived balance defaulting
  // ----------------------------------------------------------------------
  describe('listPettyCashLedger', () => {
    it('requires branchId as well as companyId', async () => {
      await expect(service.listPettyCashLedger({ branchId: 'b1' })).rejects.toThrow(BadRequestException);
    });

    it('coerces missing balance row to zero', async () => {
      // data, count, balance under Promise.all -> queue rows satisfying all shapes
      const row = { id: 'pc1', count: 0 };
      drizzle.queue([row]);
      drizzle.queue([row]);
      drizzle.queue([]); // balance query empty -> 0
      const res = await service.listPettyCashLedger({ companyId: 'c1', branchId: 'b1', dateTo: '2026-12-31' });
      expect(res.balance).toBe(0);
      expect(res.total).toBe(0);
    });
  });
});
