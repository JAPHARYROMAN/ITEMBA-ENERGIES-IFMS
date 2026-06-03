import { ExpensesController } from './expenses.controller';
import type { ExpensesService } from './expenses.service';

describe('ExpensesController', () => {
  let service: jest.Mocked<
    Pick<
      ExpensesService,
      | 'listExpenseCategories'
      | 'getExpenseCategory'
      | 'createExpenseCategory'
      | 'updateExpenseCategory'
      | 'deleteExpenseCategory'
      | 'createExpenseEntry'
      | 'listExpenseEntries'
      | 'getExpenseEntry'
      | 'updateExpenseEntry'
      | 'submitExpenseEntry'
      | 'approveExpenseEntry'
      | 'rejectExpenseEntry'
      | 'deleteExpenseEntry'
      | 'topupPettyCash'
      | 'spendPettyCash'
      | 'listPettyCashLedger'
    >
  >;
  let controller: ExpensesController;

  beforeEach(() => {
    service = {
      listExpenseCategories: jest.fn(),
      getExpenseCategory: jest.fn(),
      createExpenseCategory: jest.fn(),
      updateExpenseCategory: jest.fn(),
      deleteExpenseCategory: jest.fn(),
      createExpenseEntry: jest.fn(),
      listExpenseEntries: jest.fn(),
      getExpenseEntry: jest.fn(),
      updateExpenseEntry: jest.fn(),
      submitExpenseEntry: jest.fn(),
      approveExpenseEntry: jest.fn(),
      rejectExpenseEntry: jest.fn(),
      deleteExpenseEntry: jest.fn(),
      topupPettyCash: jest.fn(),
      spendPettyCash: jest.fn(),
      listPettyCashLedger: jest.fn(),
    };
    controller = new ExpensesController(service as unknown as ExpensesService);
  });

  const user = { sub: 'u1' } as any;
  const req = { ip: '10.0.0.7', headers: { 'user-agent': 'jest' } } as any;
  const auditCtx = expect.objectContaining({ userId: 'u1', ip: '10.0.0.7', userAgent: 'jest' });

  describe('categories', () => {
    it('listCategories returns an envelope', async () => {
      service.listExpenseCategories.mockResolvedValue({ data: [{ id: 'cat1' } as any], total: 1 });
      const res = await controller.listCategories({ page: 1, pageSize: 10, q: 'fuel' } as any);
      expect(service.listExpenseCategories).toHaveBeenCalledWith(expect.objectContaining({ q: 'fuel' }));
      expect(res.meta.total).toBe(1);
    });

    it('getCategory delegates', async () => {
      service.getExpenseCategory.mockResolvedValue({ id: 'cat1' } as any);
      await expect(controller.getCategory('cat1')).resolves.toEqual({ id: 'cat1' });
      expect(service.getExpenseCategory).toHaveBeenCalledWith('cat1');
    });

    it('createCategory forwards dto and audit context', async () => {
      service.createExpenseCategory.mockResolvedValue({ id: 'cat1' } as any);
      const dto = { name: 'Fuel' } as any;
      await controller.createCategory(dto, user, req);
      expect(service.createExpenseCategory).toHaveBeenCalledWith(dto, auditCtx);
    });

    it('updateCategory delegates', async () => {
      service.updateExpenseCategory.mockResolvedValue({ id: 'cat1' } as any);
      await controller.updateCategory('cat1', { name: 'X' } as any, user, req);
      expect(service.updateExpenseCategory).toHaveBeenCalledWith('cat1', { name: 'X' }, auditCtx);
    });

    it('deleteCategory delegates', async () => {
      service.deleteExpenseCategory.mockResolvedValue(undefined as any);
      await controller.deleteCategory('cat1', user, req);
      expect(service.deleteExpenseCategory).toHaveBeenCalledWith('cat1', auditCtx);
    });
  });

  describe('entries', () => {
    it('createEntry forwards dto', async () => {
      service.createExpenseEntry.mockResolvedValue({ id: 'e1' } as any);
      const dto = { categoryId: 'cat1', amount: 50 } as any;
      await controller.createEntry(dto, user, req);
      expect(service.createExpenseEntry).toHaveBeenCalledWith(dto, auditCtx);
    });

    it('listEntries returns an envelope', async () => {
      service.listExpenseEntries.mockResolvedValue({ data: [{ id: 'e1' } as any], total: 2 });
      const res = await controller.listEntries({ page: 1, pageSize: 10, status: 'draft' } as any);
      expect(service.listExpenseEntries).toHaveBeenCalledWith(expect.objectContaining({ status: 'draft' }));
      expect(res.meta.total).toBe(2);
    });

    it('getEntry delegates', async () => {
      service.getExpenseEntry.mockResolvedValue({ id: 'e1' } as any);
      await expect(controller.getEntry('e1')).resolves.toEqual({ id: 'e1' });
      expect(service.getExpenseEntry).toHaveBeenCalledWith('e1');
    });

    it('updateEntry delegates', async () => {
      service.updateExpenseEntry.mockResolvedValue({ id: 'e1' } as any);
      await controller.updateEntry('e1', { amount: 60 } as any, user, req);
      expect(service.updateExpenseEntry).toHaveBeenCalledWith('e1', { amount: 60 }, auditCtx);
    });

    it('submitEntry delegates', async () => {
      service.submitExpenseEntry.mockResolvedValue({ id: 'e1' } as any);
      await controller.submitEntry('e1', user, req);
      expect(service.submitExpenseEntry).toHaveBeenCalledWith('e1', auditCtx);
    });

    it('approveEntry delegates', async () => {
      service.approveExpenseEntry.mockResolvedValue({ id: 'e1' } as any);
      await controller.approveEntry('e1', user, req);
      expect(service.approveExpenseEntry).toHaveBeenCalledWith('e1', auditCtx);
    });

    it('rejectEntry passes the reason', async () => {
      service.rejectExpenseEntry.mockResolvedValue({ id: 'e1' } as any);
      await controller.rejectEntry('e1', { reason: 'no receipt' } as any, user, req);
      expect(service.rejectExpenseEntry).toHaveBeenCalledWith('e1', 'no receipt', auditCtx);
    });

    it('deleteEntry delegates', async () => {
      service.deleteExpenseEntry.mockResolvedValue(undefined as any);
      await controller.deleteEntry('e1', user, req);
      expect(service.deleteExpenseEntry).toHaveBeenCalledWith('e1', auditCtx);
    });
  });

  describe('petty cash', () => {
    it('topupPettyCash delegates', async () => {
      service.topupPettyCash.mockResolvedValue({ id: 'pc1' } as any);
      const dto = { amount: 100 } as any;
      await controller.topupPettyCash(dto, user, req);
      expect(service.topupPettyCash).toHaveBeenCalledWith(dto, auditCtx);
    });

    it('spendPettyCash delegates', async () => {
      service.spendPettyCash.mockResolvedValue({ id: 'pc2' } as any);
      const dto = { amount: 30 } as any;
      await controller.spendPettyCash(dto, user, req);
      expect(service.spendPettyCash).toHaveBeenCalledWith(dto, auditCtx);
    });

    it('listPettyCashLedger returns an envelope with derived balance', async () => {
      service.listPettyCashLedger.mockResolvedValue({
        data: [{ id: 'pc1' } as any],
        total: 1,
        balance: 70,
      });
      const res = await controller.listPettyCashLedger({ page: 1, pageSize: 10 } as any);
      expect(res.meta.total).toBe(1);
      expect(res.balance).toBe(70);
    });
  });
});
