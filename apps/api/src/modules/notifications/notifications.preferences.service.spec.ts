/// <reference types="jest" />
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { NotificationService } from './notifications.service';
import {
  notificationPreferences,
} from '../../database/schema/notifications/notifications';

const metricsStub = () => ({
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

describe('NotificationService preferences & routing', () => {
  let service: NotificationService;
  let mockDb: any;
  let mockMetrics: ReturnType<typeof metricsStub>;
  const mockAudit = { log: jest.fn() };

  // select(...).from(...).where(...) -> rows
  const selectWhere = (rows: any) => ({
    from: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(rows) }),
  });
  // select(...).from(...).where(...).limit(...) -> rows
  const selectWhereLimit = (rows: any) => ({
    from: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue(rows) }),
    }),
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockMetrics = metricsStub();
    mockDb = {
      transaction: jest.fn(),
      select: jest.fn(),
      insert: jest.fn(),
      update: jest.fn(),
    };
    service = new NotificationService(mockDb, mockAudit as any, mockMetrics as any);
  });

  describe('shouldReceiveNotification (severity threshold)', () => {
    it('delivers when notification severity meets the user minimum', () => {
      expect(service['shouldReceiveNotification']('warning', 'info')).toBe(true);
      expect(service['shouldReceiveNotification']('critical', 'warning')).toBe(true);
      expect(service['shouldReceiveNotification']('info', 'info')).toBe(true);
    });

    it('suppresses when below the user minimum severity', () => {
      expect(service['shouldReceiveNotification']('info', 'warning')).toBe(false);
      expect(service['shouldReceiveNotification']('success', 'critical')).toBe(false);
    });

    it('returns false for unknown severities', () => {
      expect(service['shouldReceiveNotification']('bogus', 'info')).toBe(false);
      expect(service['shouldReceiveNotification']('info', 'bogus')).toBe(false);
    });
  });

  describe('validateAntiSpamRules', () => {
    it('requires a dedupeKey for high-frequency types', async () => {
      await expect(
        service.createNotification({
          scope: { companyId: 'c1' },
          type: 'alert',
          severity: 'info',
          title: 'T',
          recipients: { userIds: ['u1'] },
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('checkRateLimitsAndCreateSummary', () => {
    it('returns rate-limited and creates a summary when the hourly cap is exceeded', async () => {
      // resolveRecipients uses explicit userIds (no db read) -> ['u1'].
      // Per-user recent count select -> 20 (>= limit).
      mockDb.select.mockReturnValueOnce(selectWhere([{ count: 20 }]));
      // createRateLimitSummaryNotification: insert notification -> returning -> then deliveries + outbox
      const notifReturning = jest
        .fn()
        .mockReturnValue({ then: (cb: any) => cb([{ id: 'sum1' }]) });
      mockDb.insert
        .mockReturnValueOnce({ values: jest.fn().mockReturnValue({ returning: notifReturning }) }) // summary notification
        .mockReturnValueOnce({ values: jest.fn().mockResolvedValue([]) }) // delivery
        .mockReturnValueOnce({ values: jest.fn().mockResolvedValue([]) }); // outbox

      const result = await service.createNotification({
        scope: { companyId: 'c1' },
        type: 'info-type',
        severity: 'info',
        title: 'Hi',
        recipients: { userIds: ['u1'] },
      });

      expect(result).toBe('rate-limited');
      expect(mockMetrics.incrementRateLimited).toHaveBeenCalled();
    });
  });

  describe('createNotification recipient resolution', () => {
    it('throws BadRequestException when no recipients resolve', async () => {
      // No userIds / roles / branchMembership -> resolveRecipients returns [] with
      // zero db reads, so the rate-limit loop is skipped and we proceed.
      const mockTx = { select: jest.fn(), insert: jest.fn() };
      mockDb.transaction.mockImplementation((cb: any) => cb(mockTx));
      // insert notification -> returning id
      mockTx.insert.mockReturnValueOnce({
        values: jest.fn().mockReturnValue({ returning: jest.fn().mockResolvedValue([{ id: 'n1' }]) }),
      });

      await expect(
        service.createNotification({
          scope: { companyId: 'c1' },
          type: 'plain',
          severity: 'info',
          title: 'T',
          recipients: {},
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('skips a recipient whose minimum severity is above the notification severity', async () => {
      mockDb.select.mockReturnValueOnce(selectWhere([{ count: 0 }])); // rate-limit ok

      const mockTx = { select: jest.fn(), insert: jest.fn() };
      mockDb.transaction.mockImplementation((cb: any) => cb(mockTx));
      // notification insert
      mockTx.insert.mockReturnValueOnce({
        values: jest.fn().mockReturnValue({ returning: jest.fn().mockResolvedValue([{ id: 'n1' }]) }),
      });
      // preferences: user requires 'critical' minimum, notification is 'info' -> skipped
      mockTx.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([
            { userId: 'u1', channelsJson: { inapp: true }, severityMin: 'critical' },
          ]),
        }),
      });

      const result = await service.createNotification({
        scope: { companyId: 'c1' },
        type: 'plain',
        severity: 'info',
        title: 'T',
        recipients: { userIds: ['u1'] },
      });

      expect(result).toBe('n1');
      // No deliveries inserted because the only recipient was filtered out:
      // tx.insert called only once (the notification itself).
      expect(mockTx.insert).toHaveBeenCalledTimes(1);
    });
  });

  describe('getUserPreferences', () => {
    it('returns stored preferences when present', async () => {
      const pref = { userId: 'u1', severityMin: 'warning', channelsJson: { inapp: true } };
      mockDb.select.mockReturnValueOnce(selectWhereLimit([pref]));
      const res = await service.getUserPreferences('u1');
      expect(res).toEqual(pref);
    });

    it('returns sensible defaults when no preference row exists', async () => {
      mockDb.select.mockReturnValueOnce(selectWhereLimit([]));
      const res = await service.getUserPreferences('u1');
      expect(res.severityMin).toBe('info');
      expect(res.channelsJson).toEqual({ inapp: true, email: false, sms: false, push: false });
    });
  });

  describe('updateUserPreferences', () => {
    it('upserts the preferences row keyed on userId', async () => {
      const onConflictDoUpdate = jest.fn().mockResolvedValue(undefined);
      const values = jest.fn().mockReturnValue({ onConflictDoUpdate });
      mockDb.insert.mockReturnValueOnce({ values });

      await service.updateUserPreferences('u1', {
        channelsJson: { inapp: true },
        severityMin: 'warning',
        quietHoursJson: null,
        digestMode: 'none',
      });

      expect(mockDb.insert).toHaveBeenCalledWith(notificationPreferences);
      expect(onConflictDoUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ target: notificationPreferences.userId }),
      );
    });
  });

  describe('getUnreadCount', () => {
    it('returns the numeric unread count', async () => {
      mockDb.select.mockReturnValueOnce(selectWhere([{ count: '7' }]));
      const res = await service.getUnreadCount('u1');
      expect(res).toBe(7);
    });
  });

  describe('getOutboxBacklog', () => {
    it('summarises total, failed and oldest job age', async () => {
      const old = new Date(Date.now() - 120_000);
      mockDb.select.mockReturnValueOnce(selectWhere([
        { id: 'a', runAfter: old, attempts: 0, lastError: null },
        { id: 'b', runAfter: new Date(), attempts: 3, lastError: 'x' },
      ]));
      const res = await service.getOutboxBacklog();
      expect(res.total).toBe(2);
      expect(res.failed).toBe(1);
      expect(res.oldestAge).toBeGreaterThanOrEqual(100);
    });
  });

  describe('getDeliveryById', () => {
    it('throws NotFoundException when the delivery is missing', async () => {
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          innerJoin: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue([]) }),
        }),
      });
      await expect(service.getDeliveryById('u1', 'd1')).rejects.toThrow(NotFoundException);
    });
  });
});
