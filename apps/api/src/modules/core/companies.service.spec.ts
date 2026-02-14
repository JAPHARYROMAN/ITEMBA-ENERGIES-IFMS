import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
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
      const company = { id: 'id-1', code: 'GEC', name: 'Global Energy', status: 'active', createdAt: new Date() };
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
      const created = { id: 'new-id', code: 'NEW', name: 'New Co', status: 'active', createdAt: new Date() };
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
  });
});
