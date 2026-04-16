import { Test, TestingModule } from '@nestjs/testing';
import { SalesService } from './sales.service';
import { ConfigService } from '@nestjs/config';
import { AuditService } from '../audit/audit.service';
import { GovernanceService } from '../governance/governance.service';
import { DRIZZLE } from '../../database/database.module';
import { BadRequestException } from '@nestjs/common';

const queryBuilderMock: any = {
  select: jest.fn().mockReturnThis(),
  from: jest.fn().mockReturnThis(),
  where: jest.fn().mockResolvedValue([]),
  orderBy: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  offset: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  set: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  values: jest.fn().mockReturnThis(),
  returning: jest.fn().mockResolvedValue([{ id: 'test-id' }]),
  transaction: jest.fn(async (cb: any): Promise<any> => cb(queryBuilderMock)),
};

const mockAuditService = { log: jest.fn() };
const mockConfigService = { get: jest.fn((key, def) => def) };
const mockGovernanceService = { initiateControlledActionRequest: jest.fn() };

describe('SalesService', () => {
  let service: SalesService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesService,
        { provide: DRIZZLE, useValue: queryBuilderMock },
        { provide: AuditService, useValue: mockAuditService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: GovernanceService, useValue: mockGovernanceService },
      ],
    }).compile();

    service = module.get<SalesService>(SalesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createPosSale validations', () => {
    it('should throw BadRequestException if no items provided', async () => {
      await expect(
        service.createPosSale(
          { branchId: 'b1', items: [], payments: [{ paymentMethod: 'cash', amount: 10 }] },
          { userId: 'u1' },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if no payments provided', async () => {
      await expect(
        service.createPosSale(
          { branchId: 'b1', items: [{ productId: 'p1', nozzleId: 'n1', quantity: 1, unitPrice: 10 }], payments: [] },
          { userId: 'u1' },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if payments do not match total', async () => {
      await expect(
        service.createPosSale(
          {
            branchId: 'b1',
            items: [{ productId: 'p1', nozzleId: 'n1', quantity: 10, unitPrice: 2 }], // Subtotal 20
            payments: [{ paymentMethod: 'cash', amount: 10 }], // Only 10 paid
          },
          { userId: 'u1' },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if discount threshold reached without reason', async () => {
      await expect(
        service.createPosSale(
          {
            branchId: 'b1',
            items: [{ productId: 'p1', nozzleId: 'n1', quantity: 10, unitPrice: 2 }], // Subtotal 20
            payments: [{ paymentMethod: 'cash', amount: 5 }], // 5 paid
            discountAmount: 15, // 15 discount -> requires reason
            discountReason: '   ',
          },
          { userId: 'u1' },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
