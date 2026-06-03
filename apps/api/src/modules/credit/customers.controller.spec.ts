import { CustomersController } from './customers.controller';
import type { CustomersService } from './customers.service';
import type { CreditStatementService } from './credit-statement.service';

describe('CustomersController', () => {
  let customersService: jest.Mocked<
    Pick<
      CustomersService,
      'findPage' | 'findById' | 'create' | 'update' | 'remove' | 'addNote' | 'recordAction'
    >
  >;
  let statementService: jest.Mocked<Pick<CreditStatementService, 'getStatement'>>;
  let controller: CustomersController;

  const user = { sub: 'u1' } as any;
  const req = { ip: '10.0.0.9', headers: { 'user-agent': 'jest' } } as any;

  beforeEach(() => {
    customersService = {
      findPage: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      addNote: jest.fn(),
      recordAction: jest.fn(),
    };
    statementService = { getStatement: jest.fn() };
    controller = new CustomersController(
      customersService as unknown as CustomersService,
      statementService as unknown as CreditStatementService,
    );
  });

  it('list returns an envelope with total', async () => {
    customersService.findPage.mockResolvedValue({ data: [{ id: 'c1' } as any], total: 5 });
    const res = await controller.list({ page: 1, pageSize: 10, q: 'acme' } as any);
    expect(customersService.findPage).toHaveBeenCalledWith(
      expect.objectContaining({ q: 'acme' }),
    );
    expect(res.meta.total).toBe(5);
  });

  it('getStatement defaults date range when not supplied', async () => {
    statementService.getStatement.mockResolvedValue({ customerId: 'c1' } as any);
    await controller.getStatement('c1', '', '');
    const call = statementService.getStatement.mock.calls[0];
    expect(call[0]).toBe('c1');
    expect(call[1]).toBeTruthy();
    expect(call[2]).toBeTruthy();
  });

  it('getStatement forwards explicit dates', async () => {
    statementService.getStatement.mockResolvedValue({} as any);
    await controller.getStatement('c1', '2026-01-01', '2026-06-01');
    expect(statementService.getStatement).toHaveBeenCalledWith('c1', '2026-01-01', '2026-06-01');
  });

  it('getById delegates with companyId', async () => {
    const cust = { id: 'c1' } as any;
    customersService.findById.mockResolvedValue(cust);
    await expect(controller.getById('c1', 'co1')).resolves.toBe(cust);
    expect(customersService.findById).toHaveBeenCalledWith('c1', 'co1');
  });

  it('create maps dto and forwards audit context', async () => {
    customersService.create.mockResolvedValue({ id: 'c1' } as any);
    const dto = {
      branchId: 'br1',
      code: 'C001',
      name: 'Acme',
      creditLimit: 1000,
      paymentTerms: 'net30',
    } as any;
    await controller.create(dto, user, req);
    expect(customersService.create).toHaveBeenCalledWith(
      expect.objectContaining({ branchId: 'br1', code: 'C001' }),
      expect.objectContaining({ userId: 'u1', ip: '10.0.0.9' }),
    );
  });

  it('update delegates with audit context', async () => {
    customersService.update.mockResolvedValue({ id: 'c1' } as any);
    await controller.update('c1', { name: 'New' } as any, user, req);
    expect(customersService.update).toHaveBeenCalledWith(
      'c1',
      { name: 'New' },
      expect.objectContaining({ userId: 'u1' }),
    );
  });

  it('delete delegates to remove', async () => {
    customersService.remove.mockResolvedValue(undefined);
    await controller.delete('c1', user, req);
    expect(customersService.remove).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({ userId: 'u1' }),
    );
  });

  it('addNote delegates with the note body', async () => {
    customersService.addNote.mockResolvedValue({ ok: true, id: 'cn-1' });
    await controller.addNote('c1', { note: 'hi' } as any, user, req);
    expect(customersService.addNote).toHaveBeenCalledWith(
      'c1',
      'hi',
      expect.objectContaining({ userId: 'u1' }),
    );
  });

  it('recordAction merges note and payload', async () => {
    customersService.recordAction.mockResolvedValue({ ok: true, action: 'flag' });
    await controller.recordAction(
      'c1',
      { action: 'flag', note: 'late', payload: { severity: 'high' } } as any,
      user,
      req,
    );
    expect(customersService.recordAction).toHaveBeenCalledWith(
      'c1',
      'flag',
      expect.objectContaining({ note: 'late', severity: 'high' }),
      expect.objectContaining({ userId: 'u1' }),
    );
  });
});
