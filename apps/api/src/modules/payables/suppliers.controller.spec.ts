import { SuppliersController } from './suppliers.controller';
import type { SuppliersService } from './suppliers.service';
import type { SupplierStatementService } from './supplier-statement.service';

describe('SuppliersController', () => {
  let suppliersService: jest.Mocked<
    Pick<SuppliersService, 'findPage' | 'findById' | 'create' | 'update' | 'remove'>
  >;
  let statementService: jest.Mocked<Pick<SupplierStatementService, 'getStatement'>>;
  let controller: SuppliersController;

  beforeEach(() => {
    suppliersService = {
      findPage: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };
    statementService = { getStatement: jest.fn() };
    controller = new SuppliersController(
      suppliersService as unknown as SuppliersService,
      statementService as unknown as SupplierStatementService,
    );
  });

  const user = { sub: 'u1' } as any;
  const req = { ip: '10.0.0.1', headers: { 'user-agent': 'jest' } } as any;

  it('list returns a paginated envelope', async () => {
    suppliersService.findPage.mockResolvedValue({ data: [{ id: 's1' } as any], total: 1 });
    const res = await controller.list({ page: 1, pageSize: 10, companyId: 'c1', q: 'a' } as any);
    expect(suppliersService.findPage).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 'c1', q: 'a' }),
    );
    expect(res.meta.total).toBe(1);
  });

  it('getStatement applies default date range when omitted', async () => {
    const stmt = { supplierId: 's1' } as any;
    statementService.getStatement.mockResolvedValue(stmt);
    await expect(controller.getStatement('s1', '', '')).resolves.toBe(stmt);
    const [id, from, to] = statementService.getStatement.mock.calls[0];
    expect(id).toBe('s1');
    expect(from).toBe('1970-01-01');
    expect(to).toBe(new Date().toISOString().slice(0, 10));
  });

  it('getById delegates with companyId', async () => {
    const s = { id: 's1' } as any;
    suppliersService.findById.mockResolvedValue(s);
    await expect(controller.getById('s1', 'c1')).resolves.toBe(s);
    expect(suppliersService.findById).toHaveBeenCalledWith('s1', 'c1');
  });

  it('create forwards mapped payload and audit context', async () => {
    suppliersService.create.mockResolvedValue({ id: 's1' } as any);
    const dto = { companyId: 'c1', code: 'SUP1', name: 'Acme', category: 'fuel' } as any;
    await controller.create(dto, user, req);
    expect(suppliersService.create).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 'c1', code: 'SUP1', name: 'Acme', category: 'fuel' }),
      expect.objectContaining({ userId: 'u1', ip: '10.0.0.1', userAgent: 'jest' }),
    );
  });

  it('update delegates with audit context', async () => {
    suppliersService.update.mockResolvedValue({ id: 's1' } as any);
    await controller.update('s1', { name: 'New' } as any, user, req);
    expect(suppliersService.update).toHaveBeenCalledWith(
      's1',
      { name: 'New' },
      expect.objectContaining({ userId: 'u1' }),
    );
  });

  it('delete delegates with audit context', async () => {
    suppliersService.remove.mockResolvedValue(undefined);
    await controller.delete('s1', user, req);
    expect(suppliersService.remove).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({ userId: 'u1' }),
    );
  });
});
