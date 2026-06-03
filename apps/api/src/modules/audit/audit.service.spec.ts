import { Test, TestingModule } from '@nestjs/testing';
import { AuditService, AuditEntry } from './audit.service';
import { DRIZZLE } from '../../database/database.module';
import { auditLog } from '../../database/schema/audit-log';

describe('AuditService', () => {
  let service: AuditService;
  let insertSpy: jest.Mock;
  let valuesSpy: jest.Mock;
  let mockDb: any;

  beforeEach(async () => {
    valuesSpy = jest.fn().mockResolvedValue(undefined);
    insertSpy = jest.fn().mockReturnValue({ values: valuesSpy });
    mockDb = { insert: insertSpy };

    const module: TestingModule = await Test.createTestingModule({
      providers: [AuditService, { provide: DRIZZLE, useValue: mockDb }],
    }).compile();

    service = module.get(AuditService);
  });

  it('writes an immutable row to audit_log with all fields mapped', async () => {
    const entry: AuditEntry = {
      entity: 'expense_entries',
      entityId: 'e1',
      action: 'create',
      before: { status: 'draft' },
      after: { status: 'approved' },
      userId: 'u1',
      companyId: 'c1',
      ip: '10.0.0.1',
      userAgent: 'jest',
    };

    await service.log(entry);

    expect(insertSpy).toHaveBeenCalledWith(auditLog);
    expect(valuesSpy).toHaveBeenCalledWith({
      entity: 'expense_entries',
      entityId: 'e1',
      action: 'create',
      beforeJson: { status: 'draft' },
      afterJson: { status: 'approved' },
      actorUserId: 'u1',
      companyId: 'c1',
      ip: '10.0.0.1',
      userAgent: 'jest',
    });
  });

  it('defaults all optional fields to null when omitted', async () => {
    await service.log({ entity: 'tanks', entityId: 't1', action: 'update' });

    expect(valuesSpy).toHaveBeenCalledWith({
      entity: 'tanks',
      entityId: 't1',
      action: 'update',
      beforeJson: null,
      afterJson: null,
      actorUserId: null,
      companyId: null,
      ip: null,
      userAgent: null,
    });
  });

  it('coerces explicit null before/after to stored null', async () => {
    await service.log({
      entity: 'x',
      entityId: 'y',
      action: 'z',
      before: null,
      after: null,
      userId: null,
      companyId: null,
    });

    const args = valuesSpy.mock.calls[0][0];
    expect(args.beforeJson).toBeNull();
    expect(args.afterJson).toBeNull();
    expect(args.actorUserId).toBeNull();
  });

  it('logs through the provided transaction client instead of the base db', async () => {
    const txValues = jest.fn().mockResolvedValue(undefined);
    const txInsert = jest.fn().mockReturnValue({ values: txValues });
    const tx: any = { insert: txInsert };

    await service.log({ entity: 'shifts', entityId: 's1', action: 'close' }, tx);

    expect(txInsert).toHaveBeenCalledWith(auditLog);
    expect(txValues).toHaveBeenCalledTimes(1);
    // Base db must not be touched when a tx is supplied.
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it('propagates insert failures to the caller', async () => {
    valuesSpy.mockRejectedValueOnce(new Error('db down'));
    await expect(
      service.log({ entity: 'x', entityId: 'y', action: 'z' }),
    ).rejects.toThrow('db down');
  });
});
