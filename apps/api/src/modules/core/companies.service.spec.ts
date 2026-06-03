import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DRIZZLE } from '../../database/database.module';
import { AuditService } from '../audit/audit.service';
import { CompaniesService } from './companies.service';

describe('CompaniesService', () => {
  let service: CompaniesService;
  let db: {
    select: jest.Mock;
    insert: jest.Mock;
    update: jest.Mock;
  };
  let audit: { log: jest.Mock };

  beforeEach(async () => {
    const selectChain = { from: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), orderBy: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), offset: jest.fn().mockReturnThis() };
    db = {
      select: jest.fn().mockReturnValue(selectChain),
      insert: jest.fn().mockReturnValue({ values: jest.fn().mockReturnValue({ returning: jest.fn() }) }),
      update: jest.fn().mockReturnValue({ set: jest.fn().mockReturnValue({ where: jest.fn().mockReturnValue({ returning: jest.fn() }) }) }),
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompaniesService,
        { provide: DRIZZLE, useValue: db },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get<CompaniesService>(CompaniesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findById', () => {
    it('should return company when found', async () => {
      const company = { id: 'id-1', code: 'GEC', name: 'Global Energy', currency: 'USD', status: 'active', createdAt: new Date() };
      const whereMock = jest.fn().mockResolvedValue([company]);
      db.select.mockReturnValue({ from: jest.fn().mockReturnValue({ where: whereMock }) });

      const result = await service.findById('id-1');
      expect(result).toEqual(company);
    });

    it('should throw NotFoundException when not found', async () => {
      const whereMock = jest.fn().mockResolvedValue([]);
      db.select.mockReturnValue({ from: jest.fn().mockReturnValue({ where: whereMock }) });

      await expect(service.findById('missing')).rejects.toThrow(NotFoundException);
      await expect(service.findById('missing')).rejects.toThrow('Company not found');
    });
  });

  describe('create', () => {
    it('should create company and log audit', async () => {
      const created = { id: 'new-id', code: 'NEW', name: 'New Co', currency: 'USD', status: 'active', createdAt: new Date() };
      db.select.mockReturnValue({ from: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue([]) }) });
      db.insert.mockReturnValue({
        values: jest.fn().mockReturnValue({ returning: jest.fn().mockResolvedValue([created]) }),
      });

      const result = await service.create(
        { code: 'NEW', name: 'New Co' },
        { userId: 'user-1', ip: '127.0.0.1' },
      );
      expect(result).toEqual(created);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          entity: 'companies',
          entityId: 'new-id',
          action: 'create',
          after: created,
          userId: 'user-1',
          ip: '127.0.0.1',
        }),
      );
    });

    it('should throw ConflictException when code already exists', async () => {
      db.select.mockReturnValue({
        from: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue([{ id: 'existing' }]) }),
      });

      await expect(
        service.create({ code: 'GEC', name: 'Duplicate' }, {}),
      ).rejects.toThrow(ConflictException);
      await expect(
        service.create({ code: 'GEC', name: 'Duplicate' }, {}),
      ).rejects.toThrow(/already exists/);
    });

    it('should default currency to USD and status to active when omitted, trimming inputs', async () => {
      const created = { id: 'c2', code: 'AAA', name: 'A Co', currency: 'USD', status: 'active', createdAt: new Date() };
      db.select.mockReturnValue({ from: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue([]) }) });
      const valuesMock = jest.fn().mockReturnValue({ returning: jest.fn().mockResolvedValue([created]) });
      db.insert.mockReturnValue({ values: valuesMock });

      await service.create({ code: '  AAA  ', name: '  A Co  ' }, {});
      expect(valuesMock).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'AAA', name: 'A Co', currency: 'USD', status: 'active' }),
      );
    });

    it('should uppercase provided currency and pass through explicit status', async () => {
      const created = { id: 'c3', code: 'BBB', name: 'B Co', currency: 'EUR', status: 'inactive', createdAt: new Date() };
      db.select.mockReturnValue({ from: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue([]) }) });
      const valuesMock = jest.fn().mockReturnValue({ returning: jest.fn().mockResolvedValue([created]) });
      db.insert.mockReturnValue({ values: valuesMock });

      await service.create({ code: 'BBB', name: 'B Co', currency: 'eur', status: 'inactive' }, {});
      expect(valuesMock).toHaveBeenCalledWith(
        expect.objectContaining({ currency: 'EUR', status: 'inactive' }),
      );
    });

    it('should throw InternalServerErrorException when insert returns nothing', async () => {
      db.select.mockReturnValue({ from: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue([]) }) });
      db.insert.mockReturnValue({
        values: jest.fn().mockReturnValue({ returning: jest.fn().mockResolvedValue([]) }),
      });

      await expect(service.create({ code: 'X', name: 'X' }, {})).rejects.toThrow('Insert failed');
    });

    it('should translate a pg unique violation in the insert into a ConflictException', async () => {
      db.select.mockReturnValue({ from: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue([]) }) });
      const pgErr = Object.assign(new Error('dup'), { code: '23505' });
      db.insert.mockReturnValue({
        values: jest.fn().mockReturnValue({ returning: jest.fn().mockRejectedValue(pgErr) }),
      });

      await expect(service.create({ code: 'DUP', name: 'Dup' }, {})).rejects.toThrow(ConflictException);
    });

    it('should rethrow non-unique-violation insert errors unchanged', async () => {
      db.select.mockReturnValue({ from: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue([]) }) });
      const boom = new Error('boom');
      db.insert.mockReturnValue({
        values: jest.fn().mockReturnValue({ returning: jest.fn().mockRejectedValue(boom) }),
      });

      await expect(service.create({ code: 'Z', name: 'Z' }, {})).rejects.toThrow('boom');
    });
  });

  describe('findPage', () => {
    function mockListSelect(rows: unknown[], count: number) {
      // first select() -> data chain; second select() -> count chain
      const dataChain = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        offset: jest.fn().mockResolvedValue(rows),
      };
      const countChain = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([{ count }]),
      };
      db.select.mockReturnValueOnce(dataChain).mockReturnValueOnce(countChain);
      return { dataChain, countChain };
    }

    it('returns data and total without a search query (base where only)', async () => {
      const rows = [{ id: 'a', code: 'A', name: 'A', currency: 'USD', status: 'active', createdAt: new Date() }];
      mockListSelect(rows, 1);

      const result = await service.findPage({});
      expect(result.data).toEqual(rows);
      expect(result.total).toBe(1);
    });

    it('applies the search filter when q is provided', async () => {
      const { dataChain } = mockListSelect([], 0);
      const result = await service.findPage({ q: 'glob' });
      expect(dataChain.where).toHaveBeenCalled();
      expect(result.total).toBe(0);
    });

    it('defaults total to 0 when the count result is empty', async () => {
      mockListSelect([], 0);
      // Override count chain to return [] so countResult[0] is undefined.
      const dataChain = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        offset: jest.fn().mockResolvedValue([]),
      };
      const countChain = { from: jest.fn().mockReturnThis(), where: jest.fn().mockResolvedValue([]) };
      db.select.mockReset();
      db.select.mockReturnValueOnce(dataChain).mockReturnValueOnce(countChain);

      const result = await service.findPage({});
      expect(result.total).toBe(0);
    });

    it('honors an ascending sort on a known column', async () => {
      const { dataChain } = mockListSelect([], 0);
      await service.findPage({ sort: 'name:asc' });
      expect(dataChain.orderBy).toHaveBeenCalled();
    });

    it('falls back to default order for an unknown sort field', async () => {
      const { dataChain } = mockListSelect([], 0);
      await service.findPage({ sort: 'bogus:asc' });
      expect(dataChain.orderBy).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    function mockFindByIdOrNull(row: unknown) {
      db.select.mockReturnValueOnce({ from: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(row ? [row] : []) }) });
    }

    const existing = { id: 'u1', code: 'OLD', name: 'Old', currency: 'USD', status: 'active', createdAt: new Date() };

    it('throws NotFoundException when the company does not exist', async () => {
      mockFindByIdOrNull(null);
      await expect(service.update('u1', { name: 'New' }, {})).rejects.toThrow(NotFoundException);
    });

    it('updates only provided fields and logs audit', async () => {
      mockFindByIdOrNull(existing);
      const updated = { ...existing, name: 'New' };
      const setMock = jest.fn().mockReturnValue({ where: jest.fn().mockReturnValue({ returning: jest.fn().mockResolvedValue([updated]) }) });
      db.update.mockReturnValue({ set: setMock });

      const result = await service.update('u1', { name: '  New  ' }, { userId: 'admin' });
      expect(result).toEqual(updated);
      expect(setMock).toHaveBeenCalledWith(expect.objectContaining({ name: 'New', updatedBy: 'admin' }));
      // currency/status/code not touched
      const setArg = setMock.mock.calls[0][0];
      expect(setArg).not.toHaveProperty('currency');
      expect(setArg).not.toHaveProperty('status');
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'update', before: existing }));
    });

    it('checks code uniqueness only when the code actually changes', async () => {
      mockFindByIdOrNull(existing);
      // assertCodeUnique select -> no existing
      db.select.mockReturnValueOnce({ from: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue([]) }) });
      const updated = { ...existing, code: 'NEW' };
      db.update.mockReturnValue({ set: jest.fn().mockReturnValue({ where: jest.fn().mockReturnValue({ returning: jest.fn().mockResolvedValue([updated]) }) }) });

      const result = await service.update('u1', { code: 'NEW', currency: 'gbp', status: 'inactive' }, {});
      expect(result.code).toBe('NEW');
    });

    it('skips the uniqueness check when the code is unchanged', async () => {
      mockFindByIdOrNull(existing);
      const updated = { ...existing };
      db.update.mockReturnValue({ set: jest.fn().mockReturnValue({ where: jest.fn().mockReturnValue({ returning: jest.fn().mockResolvedValue([updated]) }) }) });

      // Only one select call (findByIdOrNull); no assertCodeUnique select queued.
      await service.update('u1', { code: 'OLD' }, {});
      expect(db.select).toHaveBeenCalledTimes(1);
    });

    it('throws ConflictException when the new code is taken', async () => {
      mockFindByIdOrNull(existing);
      db.select.mockReturnValueOnce({ from: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue([{ id: 'other' }]) }) });
      await expect(service.update('u1', { code: 'TAKEN' }, {})).rejects.toThrow(ConflictException);
    });

    it('throws NotFoundException when the update returns no row', async () => {
      mockFindByIdOrNull(existing);
      db.update.mockReturnValue({ set: jest.fn().mockReturnValue({ where: jest.fn().mockReturnValue({ returning: jest.fn().mockResolvedValue([]) }) }) });
      await expect(service.update('u1', { name: 'x' }, {})).rejects.toThrow(NotFoundException);
    });

    it('translates a pg unique violation during update into a ConflictException', async () => {
      mockFindByIdOrNull(existing);
      // code changes OLD -> DUP, so assertCodeUnique runs first and finds nothing.
      db.select.mockReturnValueOnce({ from: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue([]) }) });
      const pgErr = Object.assign(new Error('dup'), { code: '23505' });
      db.update.mockReturnValue({ set: jest.fn().mockReturnValue({ where: jest.fn().mockReturnValue({ returning: jest.fn().mockRejectedValue(pgErr) }) }) });
      await expect(service.update('u1', { code: 'DUP' }, {})).rejects.toThrow(ConflictException);
    });

    it('rethrows a NotFoundException raised inside the try block', async () => {
      mockFindByIdOrNull(existing);
      db.update.mockReturnValue({ set: jest.fn().mockReturnValue({ where: jest.fn().mockReturnValue({ returning: jest.fn().mockResolvedValue([]) }) }) });
      await expect(service.update('u1', { name: 'x' }, {})).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    const existing = { id: 'r1', code: 'R', name: 'R', currency: 'USD', status: 'active', createdAt: new Date() };

    it('throws NotFoundException when the company does not exist', async () => {
      db.select.mockReturnValueOnce({ from: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue([]) }) });
      await expect(service.remove('r1', {})).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when active stations depend on the company', async () => {
      db.select
        .mockReturnValueOnce({ from: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue([existing]) }) })
        .mockReturnValueOnce({ from: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue([{ count: 3 }]) }) });
      await expect(service.remove('r1', {})).rejects.toThrow(BadRequestException);
    });

    it('soft-deletes and logs audit when there are no dependent stations', async () => {
      db.select
        .mockReturnValueOnce({ from: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue([existing]) }) })
        .mockReturnValueOnce({ from: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue([{ count: 0 }]) }) });
      const whereMock = jest.fn().mockResolvedValue(undefined);
      const setMock = jest.fn().mockReturnValue({ where: whereMock });
      db.update.mockReturnValue({ set: setMock });

      await service.remove('r1', { userId: 'admin' });
      expect(setMock).toHaveBeenCalledWith(expect.objectContaining({ updatedBy: 'admin' }));
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'delete', before: existing }));
    });

    it('omits updatedBy when no userId is present in the audit context', async () => {
      db.select
        .mockReturnValueOnce({ from: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue([existing]) }) })
        .mockReturnValueOnce({ from: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue([{ count: 0 }]) }) });
      const setMock = jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) });
      db.update.mockReturnValue({ set: setMock });

      await service.remove('r1', {});
      expect(setMock.mock.calls[0][0]).not.toHaveProperty('updatedBy');
    });
  });
});
