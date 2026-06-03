import { InventoryController } from './inventory.controller';
import type { InventoryService } from './inventory.service';

describe('InventoryController', () => {
  let inventoryService: jest.Mocked<
    Pick<
      InventoryService,
      | 'createDip'
      | 'findDipsPage'
      | 'findDipById'
      | 'createReconciliation'
      | 'findReconciliationsPage'
      | 'findReconciliationById'
      | 'findVariancesPage'
    >
  >;
  let controller: InventoryController;

  const user = { sub: 'user-1' } as any;
  const req = { ip: '10.1.1.1', headers: { 'user-agent': 'jest' } } as any;

  beforeEach(() => {
    inventoryService = {
      createDip: jest.fn(),
      findDipsPage: jest.fn(),
      findDipById: jest.fn(),
      createReconciliation: jest.fn(),
      findReconciliationsPage: jest.fn(),
      findReconciliationById: jest.fn(),
      findVariancesPage: jest.fn(),
    };
    controller = new InventoryController(inventoryService as unknown as InventoryService);
  });

  it('creates tank dips with audit context', async () => {
    inventoryService.createDip.mockResolvedValue({ id: 'dip-1' } as any);

    await expect(controller.createDip({ tankId: 'tank-1' } as any, user, req)).resolves.toEqual({ id: 'dip-1' });

    expect(inventoryService.createDip).toHaveBeenCalledWith(
      { tankId: 'tank-1' },
      { userId: 'user-1', ip: '10.1.1.1', userAgent: 'jest' },
    );
  });

  it('lists dips in a paginated envelope', async () => {
    inventoryService.findDipsPage.mockResolvedValue({ data: [{ id: 'dip-1' } as any], total: 12 });

    const result = await controller.listDips({
      page: 2,
      pageSize: 5,
      branchId: 'branch-1',
      tankId: 'tank-1',
      dateFrom: '2026-01-01',
      dateTo: '2026-01-31',
    } as any);

    expect(inventoryService.findDipsPage).toHaveBeenCalledWith({
      page: 2,
      pageSize: 5,
      branchId: 'branch-1',
      tankId: 'tank-1',
      dateFrom: '2026-01-01',
      dateTo: '2026-01-31',
    });
    expect(result).toEqual({ data: [{ id: 'dip-1' }], meta: { page: 2, pageSize: 5, total: 12 } });
  });

  it('gets a tank dip by id', async () => {
    inventoryService.findDipById.mockResolvedValue({ id: 'dip-1' } as any);

    await expect(controller.getDip('dip-1')).resolves.toEqual({ id: 'dip-1' });
    expect(inventoryService.findDipById).toHaveBeenCalledWith('dip-1');
  });

  it('creates and lists reconciliations', async () => {
    inventoryService.createReconciliation.mockResolvedValue({ id: 'rec-1' } as any);
    inventoryService.findReconciliationsPage.mockResolvedValue({ data: [{ id: 'rec-1' } as any], total: 7 });

    await expect(controller.createReconciliation({ branchId: 'branch-1' } as any, user, req)).resolves.toEqual({
      id: 'rec-1',
    });
    const list = await controller.listReconciliations({
      page: 3,
      pageSize: 4,
      companyId: 'company-1',
      branchId: 'branch-1',
      status: 'posted',
      dateFrom: '2026-02-01',
      dateTo: '2026-02-28',
    } as any);

    expect(inventoryService.createReconciliation).toHaveBeenCalledWith(
      { branchId: 'branch-1' },
      { userId: 'user-1', ip: '10.1.1.1', userAgent: 'jest' },
    );
    expect(inventoryService.findReconciliationsPage).toHaveBeenCalledWith({
      page: 3,
      pageSize: 4,
      branchId: 'branch-1',
      companyId: 'company-1',
      status: 'posted',
      dateFrom: '2026-02-01',
      dateTo: '2026-02-28',
    });
    expect(list.meta).toEqual({ page: 3, pageSize: 4, total: 7 });
  });

  it('gets a reconciliation by id', async () => {
    inventoryService.findReconciliationById.mockResolvedValue({ id: 'rec-1' } as any);

    await expect(controller.getReconciliation('rec-1')).resolves.toEqual({ id: 'rec-1' });
    expect(inventoryService.findReconciliationById).toHaveBeenCalledWith('rec-1');
  });

  it('lists variances with classification and movement filters', async () => {
    inventoryService.findVariancesPage.mockResolvedValue({ data: [{ id: 'var-1' } as any], total: 2 });

    const result = await controller.listVariances({
      page: 1,
      pageSize: 25,
      companyId: 'company-1',
      branchId: 'branch-1',
      tankId: 'tank-1',
      classification: 'leakage',
      dateFrom: '2026-03-01',
      dateTo: '2026-03-31',
    } as any);

    expect(inventoryService.findVariancesPage).toHaveBeenCalledWith({
      page: 1,
      pageSize: 25,
      branchId: 'branch-1',
      companyId: 'company-1',
      tankId: 'tank-1',
      classification: 'leakage',
      dateFrom: '2026-03-01',
      dateTo: '2026-03-31',
    });
    expect(result).toEqual({ data: [{ id: 'var-1' }], meta: { page: 1, pageSize: 25, total: 2 } });
  });
});
