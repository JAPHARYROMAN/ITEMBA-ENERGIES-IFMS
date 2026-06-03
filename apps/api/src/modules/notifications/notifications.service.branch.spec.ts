import { BadRequestException, NotFoundException } from '@nestjs/common';
import { NotificationService, type CreateNotificationRequest } from './notifications.service';

const makeMetrics = () => ({
  incrementNotificationsCreated: jest.fn(),
  incrementDeliveriesSent: jest.fn(),
  incrementDeliveriesFailed: jest.fn(),
  incrementDeliveryFailures: jest.fn(),
  incrementRealtimePushes: jest.fn(),
  recordOutboxLag: jest.fn(),
  incrementRateLimited: jest.fn(),
  incrementDeduplicated: jest.fn(),
  recordOutboxBatch: jest.fn(),
  recordOutboxProcessingTime: jest.fn(),
  recordOutboxError: jest.fn(),
  recordPermanentFailure: jest.fn(),
  recordRetry: jest.fn(),
  getCurrentMetrics: jest.fn(),
  getPrometheusMetrics: jest.fn(),
  clear: jest.fn(),
});

const makeService = (db: any = {}) => {
  const metrics = makeMetrics();
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const service = new NotificationService(db, audit as any, metrics as any);
  (service as any).logger = { error: jest.fn() };
  return { service, metrics, audit };
};

const selectWhere = (rows: any[]) => ({
  from: jest.fn().mockReturnValue({
    where: jest.fn().mockResolvedValue(rows),
  }),
});

const selectWhereLimit = (rows: any[]) => ({
  from: jest.fn().mockReturnValue({
    where: jest.fn().mockReturnValue({
      limit: jest.fn().mockResolvedValue(rows),
    }),
  }),
});

const insertReturning = (rows: any[]) => ({
  values: jest.fn().mockReturnValue({
    returning: jest.fn().mockResolvedValue(rows),
  }),
});

const insertValues = () => ({
  values: jest.fn().mockResolvedValue(undefined),
});

const baseRequest = (overrides: Partial<CreateNotificationRequest> = {}): CreateNotificationRequest => ({
  scope: { companyId: 'company-1' },
  type: 'sales',
  severity: 'info',
  title: 'Notification',
  recipients: { userIds: ['user-1'] },
  ...overrides,
});

describe('NotificationService branch behavior', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('anti-spam validation', () => {
    it('requires a dedupe key for high-frequency notification types', async () => {
      const { service } = makeService();

      await expect(
        (service as any).validateAntiSpamRules(baseRequest({ type: 'system' })),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows high-frequency notifications when a dedupe key is present', async () => {
      const { service } = makeService();

      await expect(
        (service as any).validateAntiSpamRules(
          baseRequest({ type: 'alert', dedupeKey: 'alert:user-1' }),
        ),
      ).resolves.toBeUndefined();
    });
  });

  describe('recipient and severity helpers', () => {
    it('resolves explicit users, roles, and branch membership without duplicates', async () => {
      const { service } = makeService();
      const roleQuery = {
        from: jest.fn().mockReturnValue({
          innerJoin: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([
              { userId: 'role-user' },
              { userId: 'shared-user' },
            ]),
          }),
        }),
      };
      const branchQuery = {
        from: jest.fn().mockReturnValue({
          innerJoin: jest.fn().mockReturnValue({
            innerJoin: jest.fn().mockReturnValue({
              innerJoin: jest.fn().mockReturnValue({
                where: jest.fn().mockResolvedValue([
                  { id: 'branch-user' },
                  { id: 'shared-user' },
                ]),
              }),
            }),
          }),
        }),
      };
      const tx = {
        select: jest.fn().mockReturnValue(roleQuery),
        selectDistinct: jest.fn().mockReturnValue(branchQuery),
      };

      const result = await (service as any).resolveRecipients(
        tx,
        baseRequest({
          scope: { companyId: 'company-1', stationId: 'station-1', branchId: 'branch-1' },
          recipients: {
            userIds: ['explicit-user', 'shared-user'],
            roles: ['Manager'],
            branchMembership: true,
          },
        }),
      );

      expect(result).toEqual(['explicit-user', 'shared-user', 'role-user', 'branch-user']);
      expect(tx.select).toHaveBeenCalledTimes(1);
      expect(tx.selectDistinct).toHaveBeenCalledTimes(1);
    });

    it('rejects unknown severities and honors minimum severity ordering', () => {
      const { service } = makeService();

      expect((service as any).shouldReceiveNotification('warning', 'success')).toBe(true);
      expect((service as any).shouldReceiveNotification('info', 'warning')).toBe(false);
      expect((service as any).shouldReceiveNotification('unknown', 'info')).toBe(false);
      expect((service as any).shouldReceiveNotification('info', 'unknown')).toBe(false);
    });
  });

  describe('quiet hours', () => {
    it('uses default overnight quiet hours when start and end are omitted', () => {
      jest.useFakeTimers().setSystemTime(new Date('2024-01-15T23:00:00Z'));
      const { service } = makeService();

      expect((service as any).shouldSuppressDuringQuietHours('info', { enabled: true })).toBe(true);
    });

    it('handles same-day quiet hour windows both inside and outside the window', () => {
      const { service } = makeService();
      const quietHours = { enabled: true, start: '09:00', end: '17:00' };

      jest.useFakeTimers().setSystemTime(new Date('2024-01-15T12:00:00Z'));
      expect((service as any).shouldSuppressDuringQuietHours('warning', quietHours)).toBe(true);

      jest.setSystemTime(new Date('2024-01-15T18:00:00Z'));
      expect((service as any).shouldSuppressDuringQuietHours('warning', quietHours)).toBe(false);
    });
  });

  describe('preferences and delivery listing', () => {
    it('returns stored preferences when they exist', async () => {
      const db = { select: jest.fn().mockReturnValue(selectWhereLimit([{ userId: 'user-1' }])) };
      const { service } = makeService(db);

      await expect(service.getUserPreferences('user-1')).resolves.toEqual({ userId: 'user-1' });
    });

    it('returns default preferences when none are stored', async () => {
      const db = { select: jest.fn().mockReturnValue(selectWhereLimit([])) };
      const { service } = makeService(db);

      await expect(service.getUserPreferences('user-1')).resolves.toEqual({
        channelsJson: { inapp: true, email: false, sms: false, push: false },
        severityMin: 'info',
        quietHoursJson: null,
        digestMode: 'none',
      });
    });

    it('lists deliveries with default pagination and maps nullable optional fields', async () => {
      const finalQuery = makeFinalQuery([
        {
          delivery: {
            id: 'delivery-1',
            notificationId: 'notification-1',
            userId: 'user-1',
            status: 'pending',
            readAt: null,
            seenAt: null,
            archivedAt: null,
            deliveredVia: 'inapp',
            errorMessage: null,
          },
          notification: {
            id: 'notification-1',
            type: 'sales',
            severity: 'info',
            title: 'Sale',
            body: null,
            dataJson: undefined,
            actionUrl: null,
            createdAt: new Date('2024-01-15T10:00:00Z'),
          },
        },
      ]);
      const db = {
        select: jest
          .fn()
          .mockReturnValueOnce(selectJoinWhere(finalQuery))
          .mockReturnValueOnce({ from: jest.fn().mockResolvedValue([{ count: '1' }]) }),
      };
      const { service } = makeService(db);

      const result = await service.listUserDeliveries('user-1');

      expect(result.total).toBe(1);
      expect(result.deliveries[0]).toEqual(
        expect.objectContaining({
          readAt: undefined,
          seenAt: undefined,
          archivedAt: undefined,
          errorMessage: undefined,
          notification: expect.objectContaining({
            body: undefined,
            actionUrl: undefined,
          }),
        }),
      );
      expect(finalQuery.limit).toHaveBeenCalledWith(25);
      expect(finalQuery.offset).toHaveBeenCalledWith(0);
    });

    it('applies every optional list filter and preserves populated optional fields', async () => {
      const createdAt = new Date('2024-01-15T10:00:00Z');
      const finalQuery = makeFinalQuery([
        {
          delivery: {
            id: 'delivery-1',
            notificationId: 'notification-1',
            userId: 'user-1',
            status: 'sent',
            readAt: createdAt,
            seenAt: createdAt,
            archivedAt: createdAt,
            deliveredVia: 'email',
            errorMessage: 'none',
          },
          notification: {
            id: 'notification-1',
            type: 'sales',
            severity: 'critical',
            title: 'Sale',
            body: 'Body',
            dataJson: { orderId: 'order-1' },
            actionUrl: '/orders/order-1',
            createdAt,
          },
        },
      ]);
      const db = {
        select: jest
          .fn()
          .mockReturnValueOnce(selectJoinWhere(finalQuery))
          .mockReturnValueOnce(selectJoinWhere(finalQuery))
          .mockReturnValueOnce(selectJoinWhere(finalQuery))
          .mockReturnValueOnce({ from: jest.fn().mockResolvedValue([{ count: 1 }]) }),
      };
      const { service } = makeService(db);

      const result = await service.listUserDeliveries('user-1', {
        status: 'sent',
        unread: true,
        severity: 'critical',
        type: 'sales',
        dateFrom: new Date('2024-01-01T00:00:00Z'),
        dateTo: new Date('2024-01-31T00:00:00Z'),
        page: 2,
        pageSize: 10,
      });

      expect(result).toEqual({
        total: 1,
        deliveries: [
          expect.objectContaining({
            readAt: createdAt,
            seenAt: createdAt,
            archivedAt: createdAt,
            errorMessage: 'none',
            notification: expect.objectContaining({
              body: 'Body',
              actionUrl: '/orders/order-1',
            }),
          }),
        ],
      });
      expect(finalQuery.limit).toHaveBeenCalledWith(10);
      expect(finalQuery.offset).toHaveBeenCalledWith(10);
    });

    it('throws when a requested delivery cannot be found', async () => {
      const db = { select: jest.fn().mockReturnValue(selectJoinWhere([])) };
      const { service } = makeService(db);

      await expect(service.getDeliveryById('user-1', 'missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('notification creation filtering', () => {
    it('throws when the resolved recipient list is empty', async () => {
      const tx = { insert: jest.fn().mockReturnValue(insertReturning([{ id: 'notification-1' }])) };
      const db = { transaction: jest.fn((callback: (tx: any) => Promise<unknown>) => callback(tx)) };
      const { service } = makeService(db);
      jest.spyOn(service as any, 'validateAntiSpamRules').mockResolvedValue(undefined);
      jest.spyOn(service as any, 'checkRateLimitsAndCreateSummary').mockResolvedValue(true);
      jest.spyOn(service as any, 'resolveRecipients').mockResolvedValue([]);

      await expect(service.createNotification(baseRequest())).rejects.toThrow(BadRequestException);
    });

    it('skips delivery inserts when preferences filter out all recipients', async () => {
      const tx = {
        insert: jest.fn().mockReturnValueOnce(insertReturning([{ id: 'notification-1' }])),
        select: jest.fn().mockReturnValueOnce(
          selectWhere([
            {
              userId: 'user-1',
              channelsJson: { inapp: true, email: false, sms: false, push: false },
              severityMin: 'critical',
            },
          ]),
        ),
      };
      const db = { transaction: jest.fn((callback: (tx: any) => Promise<unknown>) => callback(tx)) };
      const { service, metrics, audit } = makeService(db);
      jest.spyOn(service as any, 'validateAntiSpamRules').mockResolvedValue(undefined);
      jest.spyOn(service as any, 'checkRateLimitsAndCreateSummary').mockResolvedValue(true);
      jest.spyOn(service as any, 'resolveRecipients').mockResolvedValue(['user-1']);

      await expect(service.createNotification(baseRequest())).resolves.toBe('notification-1');

      expect(tx.insert).toHaveBeenCalledTimes(1);
      expect(audit.log).toHaveBeenCalled();
      expect(metrics.incrementNotificationsCreated).toHaveBeenCalledWith('sales', 'info');
    });

    it('uses default preferences and creates in-app delivery jobs when no preference row exists', async () => {
      const tx = {
        insert: jest
          .fn()
          .mockReturnValueOnce(insertReturning([{ id: 'notification-1' }]))
          .mockReturnValueOnce(insertValues())
          .mockReturnValueOnce(insertValues()),
        select: jest.fn().mockReturnValueOnce(selectWhere([])),
      };
      const db = { transaction: jest.fn((callback: (tx: any) => Promise<unknown>) => callback(tx)) };
      const { service } = makeService(db);
      jest.spyOn(service as any, 'validateAntiSpamRules').mockResolvedValue(undefined);
      jest.spyOn(service as any, 'checkRateLimitsAndCreateSummary').mockResolvedValue(true);
      jest.spyOn(service as any, 'resolveRecipients').mockResolvedValue(['user-1']);

      await expect(service.createNotification(baseRequest())).resolves.toBe('notification-1');

      expect(tx.insert).toHaveBeenCalledTimes(3);
    });
  });

  describe('rate limiting', () => {
    it('creates a summary notification and blocks delivery when a recipient is over the limit', async () => {
      const db = { select: jest.fn().mockReturnValue(selectWhere([{ count: 20 }])) };
      const { service } = makeService(db);
      jest.spyOn(service as any, 'resolveRecipients').mockResolvedValue(['user-1']);
      const summarySpy = jest
        .spyOn(service as any, 'createRateLimitSummaryNotification')
        .mockResolvedValue(undefined);

      await expect((service as any).checkRateLimitsAndCreateSummary(baseRequest())).resolves.toBe(false);

      expect(summarySpy).toHaveBeenCalledWith('user-1', 20);
    });

    it('continues when recent delivery counts are missing or below the limit', async () => {
      const db = { select: jest.fn().mockReturnValue(selectWhere([])) };
      const { service } = makeService(db);
      jest.spyOn(service as any, 'resolveRecipients').mockResolvedValue(['user-1']);

      await expect((service as any).checkRateLimitsAndCreateSummary(baseRequest())).resolves.toBe(true);
    });

    it('writes delivery and outbox rows for a rate-limit summary notification', async () => {
      const db = {
        insert: jest
          .fn()
          .mockReturnValueOnce(insertReturning([{ id: 'summary-1' }]))
          .mockReturnValueOnce(insertValues())
          .mockReturnValueOnce(insertValues()),
      };
      const { service } = makeService(db);

      await (service as any).createRateLimitSummaryNotification('user-1', 21);

      expect(db.insert).toHaveBeenCalledTimes(3);
    });

    it('does not write delivery rows when summary notification creation returns no row', async () => {
      const db = { insert: jest.fn().mockReturnValueOnce(insertReturning([])) };
      const { service } = makeService(db);

      await (service as any).createRateLimitSummaryNotification('user-1', 21);

      expect(db.insert).toHaveBeenCalledTimes(1);
    });

    it('logs summary creation failures without throwing', async () => {
      const db = {
        insert: jest.fn(() => {
          throw new Error('insert failed');
        }),
      };
      const { service } = makeService(db);

      await expect(
        (service as any).createRateLimitSummaryNotification('user-1', 21),
      ).resolves.toBeUndefined();
      expect((service as any).logger.error).toHaveBeenCalled();
    });
  });

  describe('admin statistics', () => {
    it('computes outbox backlog stats with failed jobs and an oldest age', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2024-01-15T10:00:00Z'));
      const db = {
        select: jest.fn().mockReturnValue(
          selectWhere([
            {
              id: 'job-1',
              attempts: null,
              runAfter: new Date('2024-01-15T09:59:00Z'),
              lastError: null,
            },
            {
              id: 'job-2',
              attempts: 2,
              runAfter: null,
              lastError: 'failed',
            },
          ]),
        ),
      };
      const { service } = makeService(db);

      await expect(service.getOutboxBacklog()).resolves.toEqual({
        total: 2,
        failed: 1,
        oldestAge: 60,
      });
    });

    it('returns zero oldest age when no jobs have runAfter timestamps', async () => {
      const db = {
        select: jest.fn().mockReturnValue(
          selectWhere([{ id: 'job-1', attempts: 0, runAfter: null, lastError: null }]),
        ),
      };
      const { service } = makeService(db);

      await expect(service.getOutboxBacklog()).resolves.toEqual({
        total: 1,
        failed: 0,
        oldestAge: 0,
      });
    });
  });
});

const selectJoinWhere = (result: any) => ({
  from: jest.fn().mockReturnValue({
    innerJoin: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue(result),
    }),
  }),
});

const makeFinalQuery = (rows: any[]) => {
  const query = {
    as: jest.fn().mockReturnValue('subquery'),
    offset: jest.fn().mockResolvedValue(rows),
    limit: jest.fn(),
    orderBy: jest.fn(),
  };
  query.limit.mockReturnValue({ offset: query.offset });
  query.orderBy.mockReturnValue({ limit: query.limit });
  return query;
};
