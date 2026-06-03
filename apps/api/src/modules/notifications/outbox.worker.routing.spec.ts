/// <reference types="jest" />
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { OutboxWorker } from './outbox.worker';
import { NotificationMetricsService } from './notification-metrics.service';
import { RealtimeGateway } from './realtime.gateway';
import { ConfigService } from '@nestjs/config';
import { DRIZZLE } from '../../database/database.module';
import { EmailTransport } from './transports/email.transport';
import { SmsTransport } from './transports/sms.transport';
import { PushTransport } from './transports/push.transport';
import {
  notificationDeliveries,
  notificationOutbox,
  NOTIFICATION_OUTBOX_JOB_TYPE,
} from '../../database/schema/notifications/notifications';

/**
 * Builder-style mock matching the existing notifications.service.spec.ts pattern:
 * each db verb returns an object whose chain methods are individually programmed
 * per test via mockReturnValueOnce.
 */
describe('OutboxWorker channel routing', () => {
  let worker: OutboxWorker;
  let mockDb: any;
  const mockEmail = { send: jest.fn() };
  const mockSms = { send: jest.fn() };
  const mockPush = { send: jest.fn() };
  const mockGateway = { emitNotificationToUser: jest.fn() };
  const mockMetrics = {
    incrementDeliveriesSent: jest.fn(),
    incrementDeliveryFailures: jest.fn(),
    recordPermanentFailure: jest.fn(),
    recordRetry: jest.fn(),
    recordOutboxBatch: jest.fn(),
    recordOutboxProcessingTime: jest.fn(),
    recordOutboxError: jest.fn(),
  };

  // Helper: a select(...).from(...).where(...) that resolves to `rows`
  const selectWhere = (rows: any) => ({
    from: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(rows) }),
  });
  // select(...).from(...).where(...).limit(...) resolving to rows
  const selectWhereLimit = (rows: any) => ({
    from: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue(rows) }),
    }),
  });
  // update(...).set(...).where(...) resolving (terminal) to result
  const updateWhere = (result: any = { rowCount: 1 }) => ({
    set: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(result) }),
  });
  // update(...).set(...).where(...).returning(...) resolving to rows
  const updateWhereReturning = (rows: any) => ({
    set: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({ returning: jest.fn().mockResolvedValue(rows) }),
    }),
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    mockDb = { select: jest.fn(), update: jest.fn(), delete: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OutboxWorker,
        { provide: DRIZZLE, useValue: mockDb },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(30) } },
        { provide: RealtimeGateway, useValue: mockGateway },
        { provide: NotificationMetricsService, useValue: mockMetrics },
        { provide: EmailTransport, useValue: mockEmail },
        { provide: SmsTransport, useValue: mockSms },
        { provide: PushTransport, useValue: mockPush },
      ],
    }).compile();

    worker = module.get(OutboxWorker);
  });

  describe('processJob dispatch', () => {
    it('routes unknown job types to a BadRequestException', async () => {
      await expect(
        worker['processJob']({ id: 'j', jobType: 'mystery' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('in-app delivery', () => {
    it('marks deliveries sent, emits realtime events and unread counts', async () => {
      // 1. update deliveries -> returning sent rows
      mockDb.update.mockReturnValueOnce(
        updateWhereReturning([
          { id: 'd1', userId: 'u1', notificationId: 'n1' },
        ]),
      );
      // 2. select notification
      mockDb.select.mockReturnValueOnce(
        selectWhereLimit([{ id: 'n1', type: 't', severity: 'info', title: 'T', createdAt: new Date() }]),
      );
      // 3. getUnreadCount select
      mockDb.select.mockReturnValueOnce(selectWhere([{ count: 3 }]));

      await worker['processInAppDelivery']({ id: 'j1', notificationId: 'n1' });

      expect(mockGateway.emitNotificationToUser).toHaveBeenCalledWith(
        'u1',
        'notification:new',
        expect.any(Object),
      );
      expect(mockGateway.emitNotificationToUser).toHaveBeenCalledWith(
        'u1',
        'notification:unreadCount',
        { count: 3 },
      );
      expect(mockMetrics.incrementDeliveriesSent).toHaveBeenCalledWith('inapp');
    });
  });

  describe('email delivery', () => {
    it('looks up the user email and dispatches via the email transport', async () => {
      mockDb.select
        .mockReturnValueOnce(selectWhereLimit([{ id: 'n1', title: 'Subject', body: 'Body' }])) // notification
        .mockReturnValueOnce(selectWhere([{ id: 'd1', userId: 'u1' }])) // deliveries
        .mockReturnValueOnce(selectWhere([{ email: 'a@b.com', name: 'A' }])); // user lookup
      mockDb.update.mockReturnValueOnce(updateWhere());

      await worker['processEmailDelivery']({ id: 'j', notificationId: 'n1' });

      expect(mockEmail.send).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'a@b.com', subject: 'Subject', body: 'Body' }),
      );
      expect(mockMetrics.incrementDeliveriesSent).toHaveBeenCalledWith('email');
    });

    it('skips silently when the notification no longer exists', async () => {
      mockDb.select.mockReturnValueOnce(selectWhereLimit([]));
      await worker['processEmailDelivery']({ id: 'j', notificationId: 'gone' });
      expect(mockEmail.send).not.toHaveBeenCalled();
    });
  });

  describe('sms delivery', () => {
    it('marks delivery failed when the user has no phone number', async () => {
      mockDb.select
        .mockReturnValueOnce(selectWhereLimit([{ id: 'n1', title: 'T', body: 'B' }])) // notification
        .mockReturnValueOnce(selectWhere([{ id: 'd1', userId: 'u1' }])) // deliveries
        .mockReturnValueOnce(selectWhere([{ phone: null, name: 'A' }])); // user without phone
      mockDb.update.mockReturnValueOnce(updateWhere());

      await worker['processSmsDelivery']({ id: 'j', notificationId: 'n1' });

      expect(mockSms.send).not.toHaveBeenCalled();
      expect(mockDb.update).toHaveBeenCalledWith(notificationDeliveries);
    });

    it('sends an SMS when the user has a phone number', async () => {
      mockDb.select
        .mockReturnValueOnce(selectWhereLimit([{ id: 'n1', title: 'T', body: 'Hi there' }]))
        .mockReturnValueOnce(selectWhere([{ id: 'd1', userId: 'u1' }]))
        .mockReturnValueOnce(selectWhere([{ phone: '+255700', name: 'A' }]));
      mockDb.update.mockReturnValueOnce(updateWhere());

      await worker['processSmsDelivery']({ id: 'j', notificationId: 'n1' });

      expect(mockSms.send).toHaveBeenCalledWith(
        expect.objectContaining({ to: '+255700', message: 'Hi there' }),
      );
      expect(mockMetrics.incrementDeliveriesSent).toHaveBeenCalledWith('sms');
    });
  });

  describe('push delivery', () => {
    it('marks delivery failed when the user has no fcm token', async () => {
      mockDb.select
        .mockReturnValueOnce(selectWhereLimit([{ id: 'n1', title: 'T', body: 'B' }]))
        .mockReturnValueOnce(selectWhere([{ id: 'd1', userId: 'u1' }]))
        .mockReturnValueOnce(selectWhere([{ fcmToken: null, name: 'A' }]));
      mockDb.update.mockReturnValueOnce(updateWhere());

      await worker['processPushDelivery']({ id: 'j', notificationId: 'n1' });
      expect(mockPush.send).not.toHaveBeenCalled();
    });

    it('sends a push when the user has an fcm token', async () => {
      mockDb.select
        .mockReturnValueOnce(selectWhereLimit([{ id: 'n1', title: 'T', body: 'B', actionUrl: '/x' }]))
        .mockReturnValueOnce(selectWhere([{ id: 'd1', userId: 'u1' }]))
        .mockReturnValueOnce(selectWhere([{ fcmToken: 'tok-123', name: 'A' }]));
      mockDb.update.mockReturnValueOnce(updateWhere());

      await worker['processPushDelivery']({ id: 'j', notificationId: 'n1' });
      expect(mockPush.send).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'tok-123', title: 'T', data: expect.objectContaining({ actionUrl: '/x' }) }),
      );
      expect(mockMetrics.incrementDeliveriesSent).toHaveBeenCalledWith('push');
    });
  });

  describe('markJobCompleted', () => {
    it('deletes the outbox row', async () => {
      const where = jest.fn().mockResolvedValue(undefined);
      mockDb.delete.mockReturnValueOnce({ where });
      await worker['markJobCompleted']('job-1');
      expect(mockDb.delete).toHaveBeenCalledWith(notificationOutbox);
      expect(where).toHaveBeenCalled();
    });
  });

  describe('getDeliveryViaForJobType', () => {
    it('maps known job types to their channel', () => {
      expect(worker['getDeliveryViaForJobType'](NOTIFICATION_OUTBOX_JOB_TYPE.DELIVER_INAPP)).toBe('inapp');
      expect(worker['getDeliveryViaForJobType'](NOTIFICATION_OUTBOX_JOB_TYPE.SEND_EMAIL)).toBe('email');
      expect(worker['getDeliveryViaForJobType'](NOTIFICATION_OUTBOX_JOB_TYPE.SEND_SMS)).toBe('sms');
    });

    it('throws for an unknown job type', () => {
      expect(() => worker['getDeliveryViaForJobType']('weird')).toThrow(BadRequestException);
    });
  });

  describe('handleJobFailure retry/backoff (email channel)', () => {
    it('records a permanent failure once max retries are hit', async () => {
      mockDb.update
        .mockReturnValueOnce(updateWhere()) // outbox update
        .mockReturnValueOnce(updateWhere()); // deliveries update
      await worker['handleJobFailure'](
        { id: 'j', notificationId: 'n1', jobType: NOTIFICATION_OUTBOX_JOB_TYPE.SEND_EMAIL, attempts: 9 },
        new Error('boom'),
      );
      expect(mockMetrics.recordPermanentFailure).toHaveBeenCalledWith('email');
      expect(mockDb.update).toHaveBeenCalledTimes(2);
    });

    it('schedules a retry with exponential backoff below the cap', async () => {
      let captured: any;
      mockDb.update.mockReturnValueOnce({
        set: jest.fn().mockImplementation((arg: any) => {
          captured = arg;
          return { where: jest.fn().mockResolvedValue({ rowCount: 1 }) };
        }),
      });
      await worker['handleJobFailure'](
        { id: 'j', notificationId: 'n1', jobType: NOTIFICATION_OUTBOX_JOB_TYPE.SEND_SMS, attempts: 1 },
        new Error('temporary'),
      );
      expect(captured.attempts).toBe(2);
      expect(captured.runAfter).toBeInstanceOf(Date);
      expect(captured.runAfter.getTime()).toBeGreaterThan(Date.now());
      expect(mockMetrics.recordRetry).toHaveBeenCalledWith('sms');
    });
  });
});
