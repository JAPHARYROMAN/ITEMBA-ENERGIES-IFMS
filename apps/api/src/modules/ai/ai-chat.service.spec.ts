import { Logger } from '@nestjs/common';
import { AiChatService, type ToolContext } from './ai-chat.service';

const COMPANY_A = '11111111-1111-4111-8111-111111111111';
const COMPANY_B = '22222222-2222-4222-8222-222222222222';
const BRANCH_A = '33333333-3333-4333-8333-333333333333';
const BRANCH_B = '44444444-4444-4444-8444-444444444444';
const CUSTOMER_ID = '55555555-5555-4555-8555-555555555555';

type DbMock = {
  select: jest.Mock;
};

function createSelectChain(rows: unknown[]) {
  return {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(rows),
  };
}

describe('AiChatService tenant isolation', () => {
  let db: DbMock;
  let exportsService: { createExport: jest.Mock };
  let deliveriesService: { create: jest.Mock; deleteDelivery: jest.Mock };
  let expensesService: { createExpenseEntry: jest.Mock };
  let paymentsService: { create: jest.Mock };
  let salesService: { voidTransaction: jest.Mock };
  let service: AiChatService;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  const scopedContext = (permissions: string[]): ToolContext => ({
    userId: 'user-1',
    email: 'user@example.com',
    permissions,
  });

  beforeEach(() => {
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    db = { select: jest.fn() };
    exportsService = { createExport: jest.fn() };
    deliveriesService = { create: jest.fn(), deleteDelivery: jest.fn() };
    expensesService = { createExpenseEntry: jest.fn() };
    paymentsService = { create: jest.fn() };
    salesService = { voidTransaction: jest.fn() };

    service = new AiChatService(
      { get: jest.fn() } as never,
      db as never,
      exportsService as never,
      { send: jest.fn() } as never,
      deliveriesService as never,
      expensesService as never,
      paymentsService as never,
      salesService as never,
    );
  });

  afterEach(() => {
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('fails proactive insights closed when no tenant scope is present', async () => {
    await expect(
      service.getProactiveInsights(scopedContext(['sales:read', 'inventory:read'])),
    ).rejects.toThrow('No company or branch scopes are assigned');

    expect(db.select).not.toHaveBeenCalled();
  });

  it('rejects read tool filters outside the current tenant scope before querying', async () => {
    const ai = service as unknown as {
      querySalesSummary: (
        args: Record<string, unknown>,
        context: ToolContext,
      ) => Promise<Record<string, unknown>>;
    };

    await expect(
      ai.querySalesSummary(
        { companyId: COMPANY_B },
        scopedContext(['sales:read', `company:${COMPANY_A}`, `branch:${BRANCH_A}`]),
      ),
    ).rejects.toThrow('Requested company is outside your access scope');

    expect(db.select).not.toHaveBeenCalled();
  });

  it('rejects nested tenant IDs in confirm payloads before calling write services', async () => {
    const result = await service.confirmWrite(
      'create_expense',
      {
        companyId: COMPANY_A,
        branchId: BRANCH_A,
        category: 'Maintenance',
        amount: 5000,
        vendor: 'Vendor',
        paymentMethod: 'cash',
        metadata: { branchId: BRANCH_B },
      },
      scopedContext(['expenses:write', `company:${COMPANY_A}`, `branch:${BRANCH_A}`]),
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain('Requested branch is outside your access scope');
    expect(db.select).not.toHaveBeenCalled();
    expect(expensesService.createExpenseEntry).not.toHaveBeenCalled();
  });

  it('validates customer tenant scope before recording payments', async () => {
    db.select.mockReturnValueOnce(createSelectChain([{ companyId: COMPANY_A, branchId: BRANCH_B }]));

    const result = await service.confirmWrite(
      'record_payment',
      {
        customerId: CUSTOMER_ID,
        amount: 1000,
        method: 'cash',
      },
      scopedContext(['credit:write', `company:${COMPANY_A}`, `branch:${BRANCH_A}`]),
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain('Requested branch is outside your access scope');
    expect(paymentsService.create).not.toHaveBeenCalled();
  });

  it('allows scoped expense confirmation after branch/company validation', async () => {
    db.select.mockReturnValueOnce(createSelectChain([{ id: BRANCH_A, companyId: COMPANY_A }]));
    expensesService.createExpenseEntry.mockResolvedValue({
      id: 'expense-1',
      entryNumber: 'EXP-1',
      amount: '5000.00',
    });

    const result = await service.confirmWrite(
      'create_expense',
      {
        companyId: COMPANY_A,
        branchId: BRANCH_A,
        category: 'Maintenance',
        amount: 5000,
        vendor: 'Vendor',
        paymentMethod: 'cash',
      },
      scopedContext(['expenses:write', `company:${COMPANY_A}`, `branch:${BRANCH_A}`]),
    );

    expect(result).toEqual({
      success: true,
      message: 'Expense EXP-1 (TZS 5,000) recorded.',
      entityId: 'expense-1',
    });
    expect(expensesService.createExpenseEntry).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: COMPANY_A, branchId: BRANCH_A }),
      expect.objectContaining({ userId: 'user-1', userAgent: 'ai-assistant' }),
    );
  });

  it('does not let AI reports fall back to the first company when scope is ambiguous', async () => {
    const ai = service as unknown as {
      generateReport: (
        args: Record<string, unknown>,
        context: ToolContext,
      ) => Promise<Record<string, unknown>>;
    };

    const result = await ai.generateReport(
      { reportType: 'overview', format: 'pdf' },
      scopedContext(['reports:read', `company:${COMPANY_A}`, `company:${COMPANY_B}`]),
    );

    expect(result.error).toContain('companyId is required because your company scope is ambiguous');
    expect(exportsService.createExport).not.toHaveBeenCalled();
  });
});
