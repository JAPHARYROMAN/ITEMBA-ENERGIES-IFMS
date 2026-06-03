import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ProductsService } from './products.service';
import { DRIZZLE } from '../../database/database.module';
import { AuditService } from '../audit/audit.service';
import { createDrizzleMock, DrizzleMock } from './__testutils__/drizzle-mock';

const mockAudit = { log: jest.fn() };

describe('ProductsService', () => {
  let service: ProductsService;
  let drizzle: DrizzleMock;

  beforeEach(async () => {
    mockAudit.log.mockClear();
    drizzle = createDrizzleMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: DRIZZLE, useValue: drizzle.db },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();
    service = module.get(ProductsService);
  });

  afterEach(() => drizzle.reset());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findPage', () => {
    it('returns paginated data and total count', async () => {
      const rows = [{ id: 'p1', code: 'A', name: 'Petrol' }];
      drizzle.queue(rows); // data select
      drizzle.queue([{ count: 7 }]); // count select
      const res = await service.findPage({ companyId: 'c1', q: 'pet', page: 1, pageSize: 10 });
      expect(res.data).toEqual(rows);
      expect(res.total).toBe(7);
    });

    it('defaults total to 0 when count row missing', async () => {
      drizzle.queue([]);
      drizzle.queue([]);
      const res = await service.findPage({});
      expect(res.total).toBe(0);
    });
  });

  describe('findById', () => {
    it('returns the product when found', async () => {
      const row = { id: 'p1', companyId: 'c1', code: 'A' };
      drizzle.queue([row]);
      await expect(service.findById('p1', 'c1')).resolves.toEqual(row);
    });

    it('throws NotFoundException when missing', async () => {
      drizzle.queue([]);
      await expect(service.findById('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('inserts a product and writes an audit log', async () => {
      drizzle.queue([]); // assertCodeUniqueInCompany -> no existing
      const inserted = { id: 'p9', companyId: 'c1', code: 'NEW' };
      drizzle.queue([inserted]); // returning()
      const res = await service.create(
        { companyId: 'c1', code: '  NEW ', name: ' Diesel ', category: ' fuel ', pricePerUnit: 12 },
        { userId: 'u1' },
      );
      expect(res).toEqual(inserted);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'products', action: 'create', entityId: 'p9' }),
      );
    });

    it('throws ConflictException when code already exists in company', async () => {
      drizzle.queue([{ id: 'existing' }]); // assertCodeUniqueInCompany finds a row
      await expect(
        service.create(
          { companyId: 'c1', code: 'DUP', name: 'x', category: 'y', pricePerUnit: '5' },
          {},
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    it('throws NotFoundException when product does not exist', async () => {
      drizzle.queue([]); // findByIdOrNull
      await expect(service.update('nope', { name: 'x' }, {})).rejects.toThrow(NotFoundException);
    });

    it('updates and audits when found', async () => {
      drizzle.queue([{ id: 'p1', companyId: 'c1', code: 'OLD' }]); // findByIdOrNull
      const updated = { id: 'p1', companyId: 'c1', code: 'OLD', name: 'Updated' };
      drizzle.queue([updated]); // returning()
      const res = await service.update('p1', { name: 'Updated' }, { userId: 'u1' });
      expect(res).toEqual(updated);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'products', action: 'update' }),
      );
    });

    it('checks code uniqueness when code changes', async () => {
      drizzle.queue([{ id: 'p1', companyId: 'c1', code: 'OLD' }]); // findByIdOrNull
      drizzle.queue([{ id: 'other' }]); // assertCodeUniqueInCompany finds conflict
      await expect(service.update('p1', { code: 'TAKEN' }, {})).rejects.toThrow(ConflictException);
    });
  });

  describe('remove', () => {
    it('throws NotFoundException when product missing', async () => {
      drizzle.queue([]); // findByIdOrNull
      await expect(service.remove('nope', {})).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when product has active tanks', async () => {
      drizzle.queue([{ id: 'p1', companyId: 'c1', code: 'A' }]); // findByIdOrNull
      drizzle.queue([{ count: 3 }]); // dependency count
      await expect(service.remove('p1', {})).rejects.toThrow(BadRequestException);
    });

    it('soft-deletes and audits when no dependencies', async () => {
      drizzle.queue([{ id: 'p1', companyId: 'c1', code: 'A' }]); // findByIdOrNull
      drizzle.queue([{ count: 0 }]); // dependency count
      drizzle.queue([]); // update (awaited)
      await service.remove('p1', { userId: 'u1' });
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'products', action: 'delete' }),
      );
    });
  });
});
