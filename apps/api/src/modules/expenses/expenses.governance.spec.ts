import { describe, expect, it, jest } from '@jest/globals';
import { ExpensesService } from './expenses.service';

describe('ExpensesService governance integration', () => {
  it('submitExpenseEntry sets pending_approval when governance request is created', async () => {
    const before = {
      id: 'exp-1',
      companyId: 'c1',
      branchId: 'b1',
      entryNumber: 'EXP-1',
      categoryId: null,
      category: 'Ops',
      amount: '1500.00',
      vendor: 'Vendor',
      paymentMethod: 'Cash',
      description: 'Sample expense',
      billableDepartment: null,
      attachmentName: null,
      rejectionReason: null,
      status: 'draft',
      createdAt: new Date(),
    };

    const pending = { ...before, status: 'pending_approval' };

    const selectWhere = jest.fn(async () => [before]);
    const returning = jest.fn(async () => [pending]);
    const updateWhere = jest.fn().mockReturnValue({ returning });
    const set = jest.fn().mockReturnValue({ where: updateWhere });

    const db = {
      select: jest.fn().mockReturnValue({ from: () => ({ where: selectWhere }) }),
      update: jest.fn().mockReturnValue({ set }),
    } as any;

    const audit = { log: jest.fn() } as any;
    const governance = {
      initiateControlledActionRequest: jest.fn(async () => ({ id: 'apr-1', status: 'submitted' })),
    } as any;

    const service = new ExpensesService(db, audit, governance);

    const result = await service.submitExpenseEntry('exp-1', {
      userId: 'u1',
      ip: '127.0.0.1',
      userAgent: 'jest',
    });

    expect(governance.initiateControlledActionRequest).toHaveBeenCalled();
    expect(result.status).toBe('pending_approval');
    expect(audit.log).toHaveBeenCalled();
  });
});
