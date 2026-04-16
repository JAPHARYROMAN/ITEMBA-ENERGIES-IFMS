/// <reference types="jest" />
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { NotificationService } from './notifications.service';
import { OutboxWorker } from './outbox.worker';
import { NotificationMetricsService } from './notification-metrics.service';
import { RealtimeGateway } from './realtime.gateway';
import { ConfigService } from '@nestjs/config';
import { DRIZZLE } from '../../database/database.module';
import { AuditService } from '../audit/audit.service';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, eq, isNull } from 'drizzle-orm';
import { EmailTransport } from './transports/email.transport';
import { SmsTransport } from './transports/sms.transport';
import { PushTransport } from './transports/push.transport';
import {
  notifications,
  notificationDeliveries,
  notificationPreferences,
  notificationOutbox,
  NOTIFICATION_DELIVERY_STATUS,
  NOTIFICATION_DELIVERY_VIA,
  NOTIFICATION_SEVERITY,
  NOTIFICATION_OUTBOX_JOB_TYPE,
} from '../../database/schema/notifications/notifications';
import { users } from '../../database/schema/auth/users';
import { userRoles } from '../../database/schema/auth/user-roles';
import { roles } from '../../database/schema/auth/roles';

// Mock jest functions
declare const jest: any;
declare const describe: any;
declare const it: any;
declare const beforeEach: any;
declare const afterEach: any;
declare const expect: any;

describe('NotificationService', () => {
  let service: NotificationService;
  let db: NodePgDatabase<any>;
  let auditService: AuditService;
  let metricsService: NotificationMetricsService;

  const mockDb = {
    transaction: jest.fn(),
    select: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue([{}]),
      })
    }),
    insert: jest.fn(),
    update: jest.fn(),
  } as any;

  const mockAuditService = {
    log: jest.fn(),
  };

  const mockMetricsService = {
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
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        {
          provide: DRIZZLE,
          useValue: mockDb,
        },
        {
          provide: AuditService,
          useValue: mockAuditService,
        },
        {
          provide: NotificationMetricsService,
          useValue: mockMetricsService,
        },
      ],
    }).compile();

    service = module.get<NotificationService>(NotificationService);
    db = module.get(DRIZZLE) as NodePgDatabase<any>;
    auditService = module.get<AuditService>(AuditService);
    metricsService = module.get<NotificationMetricsService>(NotificationMetricsService);
  });

  describe('createNotification with deduplication', () => {
    it('should return existing notification ID if dedupe_key exists within 24h', async () => {
      const existingNotificationId = 'existing-notification-id';
      const request = {
        scope: { companyId: 'company-1' },
        type: 'test',
        severity: 'info' as const,
        title: 'Test',
        recipients: { userIds: ['user-1'] },
        dedupeKey: 'test-dedupe-key',
      };

      const mockTx = {
        select: jest.fn(),
        insert: jest.fn(),
      };

      // Mock transaction
      mockDb.transaction.mockImplementation((callback: any) => callback(mockTx));

      // Mock existing notification check
      mockTx.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValueOnce({
            limit: jest.fn().mockResolvedValueOnce([{ id: existingNotificationId }]),
          }),
        })
      });

      const result = await service.createNotification(request);

      expect(result).toBe(existingNotificationId);
      expect(mockTx.select).toHaveBeenCalled();
      expect(mockTx.insert).not.toHaveBeenCalled();
    });

    it('should create new notification if dedupe_key does not exist within 24h', async () => {
      const request = {
        scope: { companyId: 'company-1' },
        type: 'test',
        severity: 'info' as const,
        title: 'Test',
        recipients: { userIds: ['user-1'] },
        dedupeKey: 'test-dedupe-key',
      };

      const mockTx = {
        select: jest.fn(),
        insert: jest.fn(),
      };

      mockDb.transaction.mockImplementation((callback: any) => callback(mockTx));

      // Mock no existing notification
      mockTx.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValueOnce({
            limit: jest.fn().mockResolvedValueOnce([]),
          }),
        })
      });

// removed recipient resolution as no query runs for explicitly declared recipients

      // Mock preferences
      mockTx.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValueOnce([{
            userId: 'user-1',
            channelsJson: { inapp: true, email: false, sms: false, push: false },
            severityMin: 'info',
          }]),
        })
      });

      // Mock notification creation
      mockTx.insert.mockReturnValueOnce({
        values: jest.fn().mockReturnValueOnce({
          returning: jest.fn().mockResolvedValueOnce([{ id: 'new-notification-id' }]),
        }),
      });

      // Mock delivery and outbox creation
      mockTx.insert.mockReturnValueOnce({
        values: jest.fn().mockResolvedValueOnce([]),
      });
      mockTx.insert.mockReturnValueOnce({
        values: jest.fn().mockResolvedValueOnce([]),
      });

      const result = await service.createNotification(request);

      expect(result).toBe('new-notification-id');
      expect(mockTx.insert).toHaveBeenCalledTimes(3); // notification, deliveries, outbox
    });

    it('should create notification without dedupe_key check when no dedupe_key provided', async () => {
      const request = {
        scope: { companyId: 'company-1' },
        type: 'test',
        severity: 'info' as const,
        title: 'Test',
        recipients: { userIds: ['user-1'] },
      };

      const mockTx = {
        select: jest.fn(),
        insert: jest.fn(),
      };

      mockDb.transaction.mockImplementation((callback: any) => callback(mockTx));

// removed recipient resolution as no query runs for explicitly declared recipients

      // Mock preferences
      mockTx.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValueOnce([{
            userId: 'user-1',
            channelsJson: { inapp: true, email: false, sms: false, push: false },
            severityMin: 'info',
          }]),
        })
      });

      // Mock notification creation
      mockTx.insert.mockReturnValueOnce({
        values: jest.fn().mockReturnValueOnce({
          returning: jest.fn().mockResolvedValueOnce([{ id: 'new-notification-id' }]),
        }),
      });

      // Mock delivery and outbox creation
      mockTx.insert.mockReturnValueOnce({
        values: jest.fn().mockResolvedValueOnce([]),
      });
      mockTx.insert.mockReturnValueOnce({
        values: jest.fn().mockResolvedValueOnce([]),
      });

      const result = await service.createNotification(request);

      expect(result).toBe('new-notification-id');
      expect(mockTx.insert).toHaveBeenCalledTimes(3);
    });
  });

  describe('markSeen', () => {
    it('should mark notification as seen for valid user', async () => {
      const deliveryId = 'delivery-1';
      const userId = 'user-1';

      mockDb.update.mockReturnValueOnce({
        set: jest.fn().mockReturnValueOnce({
          where: jest.fn().mockResolvedValueOnce({ rowCount: 1 }),
        }),
      });

      await service.markSeen(deliveryId, userId);

      expect(mockDb.update).toHaveBeenCalledWith(notificationDeliveries);
      expect(mockDb.update).toHaveBeenCalledTimes(1);
    });

    it('should throw NotFoundException for invalid delivery or user', async () => {
      const deliveryId = 'invalid-delivery';
      const userId = 'user-1';

      mockDb.update.mockReturnValueOnce({
        set: jest.fn().mockReturnValueOnce({
          where: jest.fn().mockResolvedValueOnce({ rowCount: 0 }),
        }),
      });

      await expect(service.markSeen(deliveryId, userId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('markRead', () => {
    it('should mark notification as read for valid user', async () => {
      const deliveryId = 'delivery-1';
      const userId = 'user-1';

      mockDb.update.mockReturnValueOnce({
        set: jest.fn().mockReturnValueOnce({
          where: jest.fn().mockResolvedValueOnce({ rowCount: 1 }),
        }),
      });

      await service.markRead(deliveryId, userId);

      expect(mockDb.update).toHaveBeenCalledWith(notificationDeliveries);
    });

    it('should throw NotFoundException for invalid delivery or user', async () => {
      const deliveryId = 'invalid-delivery';
      const userId = 'user-1';

      mockDb.update.mockReturnValueOnce({
        set: jest.fn().mockReturnValueOnce({
          where: jest.fn().mockResolvedValueOnce({ rowCount: 0 }),
        }),
      });

      await expect(service.markRead(deliveryId, userId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('archive', () => {
    it('should archive notification for valid user', async () => {
      const deliveryId = 'delivery-1';
      const userId = 'user-1';

      mockDb.update.mockReturnValueOnce({
        set: jest.fn().mockReturnValueOnce({
          where: jest.fn().mockResolvedValueOnce({ rowCount: 1 }),
        }),
      });

      await service.archive(deliveryId, userId);

      expect(mockDb.update).toHaveBeenCalledWith(notificationDeliveries);
    });

    it('should throw NotFoundException for invalid delivery or user', async () => {
      const deliveryId = 'invalid-delivery';
      const userId = 'user-1';

      mockDb.update.mockReturnValueOnce({
        set: jest.fn().mockReturnValueOnce({
          where: jest.fn().mockResolvedValueOnce({ rowCount: 0 }),
        }),
      });

      await expect(service.archive(deliveryId, userId)).rejects.toThrow(NotFoundException);
    });
  });
});

describe('OutboxWorker', () => {
  let worker: OutboxWorker;
  let db: NodePgDatabase<any>;
  let configService: ConfigService;
  let realtimeGateway: RealtimeGateway;
  let metricsService: NotificationMetricsService;

  const mockDb = {
    select: jest.fn(),
    update: jest.fn(),
  } as any;

  const mockConfigService = {
    get: jest.fn().mockReturnValue(30), // 30 seconds
  };

  const mockRealtimeGateway = {
    emitNotificationToUser: jest.fn(),
  };

  const mockEmailTransport = {
    send: jest.fn(),
  };

  const mockSmsTransport = {
    send: jest.fn(),
  };

  const mockPushTransport = {
    send: jest.fn(),
  };

  const mockMetricsService = {
    incrementDeliveriesSent: jest.fn(),
    incrementDeliveryFailures: jest.fn(),
    recordPermanentFailure: jest.fn(),
    recordRetry: jest.fn(),
    recordOutboxBatch: jest.fn(),
    recordOutboxProcessingTime: jest.fn(),
    recordOutboxError: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OutboxWorker,
        {
          provide: DRIZZLE,
          useValue: mockDb,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: RealtimeGateway,
          useValue: mockRealtimeGateway,
        },
        {
          provide: NotificationMetricsService,
          useValue: mockMetricsService,
        },
        {
          provide: EmailTransport,
          useValue: mockEmailTransport,
        },
        {
          provide: SmsTransport,
          useValue: mockSmsTransport,
        },
        {
          provide: PushTransport,
          useValue: mockPushTransport,
        },
      ],
    }).compile();

    worker = module.get<OutboxWorker>(OutboxWorker);
    db = module.get(DRIZZLE) as NodePgDatabase<any>;
    configService = module.get<ConfigService>(ConfigService);
    realtimeGateway = module.get<RealtimeGateway>(RealtimeGateway);
    metricsService = module.get<NotificationMetricsService>(NotificationMetricsService);
  });

  describe('lockJobs', () => {
    it('should lock available jobs successfully', async () => {
      const jobIds = ['job-1', 'job-2', 'job-3'];
      const lockedJobIds = ['job-1', 'job-2'];

      mockDb.update.mockReturnValueOnce({
        set: jest.fn().mockReturnValueOnce({
          where: jest.fn().mockReturnValueOnce({
            returning: jest.fn().mockResolvedValueOnce(
              lockedJobIds.map(id => ({ id }))
            ),
          }),
        }),
      });

      const result = await worker['lockJobs'](jobIds);

      expect(result).toEqual(lockedJobIds);
      expect(mockDb.update).toHaveBeenCalledWith(notificationOutbox);
    });

    it('should return empty array when no jobs can be locked', async () => {
      const jobIds = ['job-1', 'job-2'];

      mockDb.update.mockReturnValueOnce({
        set: jest.fn().mockReturnValueOnce({
          where: jest.fn().mockReturnValueOnce({
            returning: jest.fn().mockResolvedValueOnce([]),
          }),
        }),
      });

      const result = await worker['lockJobs'](jobIds);

      expect(result).toEqual([]);
    });
  });

  describe('handleJobFailure', () => {
    it('should mark job as permanently failed after max retries', async () => {
      const job = {
        id: 'job-1',
        notificationId: 'notification-1',
        jobType: NOTIFICATION_OUTBOX_JOB_TYPE.DELIVER_INAPP,
        attempts: 9, // Will become 10 after this failure
      };

      const error = new Error('Permanent failure');

      // Mock outbox update
      mockDb.update.mockReturnValueOnce({
        set: jest.fn().mockReturnValueOnce({
          where: jest.fn().mockResolvedValueOnce({ rowCount: 1 }),
        }),
      });

      // Mock delivery update
      mockDb.update.mockReturnValueOnce({
        set: jest.fn().mockReturnValueOnce({
          where: jest.fn().mockResolvedValueOnce({ rowCount: 1 }),
        }),
      });

      await worker['handleJobFailure'](job, error);

      expect(mockDb.update).toHaveBeenCalledTimes(2);
      expect(mockDb.update).toHaveBeenCalledWith(notificationOutbox);
      expect(mockDb.update).toHaveBeenCalledWith(notificationDeliveries);
    });

    it('should schedule retry with exponential backoff for non-max retries', async () => {
      const job = {
        id: 'job-1',
        notificationId: 'notification-1',
        jobType: NOTIFICATION_OUTBOX_JOB_TYPE.DELIVER_INAPP,
        attempts: 2, // Will become 3 after this failure
      };

      const error = new Error('Temporary failure');

      // Capture the set() arguments via a spy closure
      let capturedSetArg: any = null;
      const setMock = jest.fn().mockImplementation((arg: any) => {
        capturedSetArg = arg;
        return {
          where: jest.fn().mockResolvedValueOnce({ rowCount: 1 }),
        };
      });

      mockDb.update.mockReturnValueOnce({
        set: setMock,
      });

      await worker['handleJobFailure'](job, error);

      expect(mockDb.update).toHaveBeenCalledTimes(1);
      expect(mockDb.update).toHaveBeenCalledWith(notificationOutbox);

      // Verify exponential backoff via the captured set() argument
      expect(capturedSetArg).toBeDefined();
      expect(capturedSetArg.runAfter).toBeInstanceOf(Date);
      expect(capturedSetArg.runAfter.getTime()).toBeGreaterThan(Date.now());
      expect(capturedSetArg.attempts).toBe(3); // 2 + 1
    });
  });

  describe('processJobsOnce', () => {
    it('should process jobs and return success/failure counts', async () => {
      const jobs = [
        { id: 'job-1', notificationId: 'notif-1', jobType: 'deliver_inapp' },
        { id: 'job-2', notificationId: 'notif-2', jobType: 'deliver_inapp' },
      ];

      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValueOnce({
            limit: jest.fn().mockResolvedValueOnce(jobs),
          }),
        })
      });

      // Mock lockJobs
      jest.spyOn(worker as any, 'lockJobs').mockResolvedValue(['job-1', 'job-2']);

      // Mock processJob
      jest.spyOn(worker as any, 'processJob').mockResolvedValue(undefined);

      // Mock markJobCompleted
      jest.spyOn(worker as any, 'markJobCompleted').mockResolvedValue(undefined);

      const result = await worker.processJobsOnce();

      expect(result).toEqual({ processed: 2, failed: 0 });
      expect(worker['lockJobs']).toHaveBeenCalledWith(['job-1', 'job-2']);
      expect(worker['processJob']).toHaveBeenCalledTimes(2);
    });

    it('should handle job failures correctly', async () => {
      const jobs = [
        { id: 'job-1', notificationId: 'notif-1', jobType: 'deliver_inapp' },
        { id: 'job-2', notificationId: 'notif-2', jobType: 'deliver_inapp' },
      ];

      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValueOnce({
            limit: jest.fn().mockResolvedValueOnce(jobs),
          }),
        })
      });

      // Mock lockJobs
      jest.spyOn(worker as any, 'lockJobs').mockResolvedValue(['job-1', 'job-2']);

      // Mock processJob - first succeeds, second fails
      jest.spyOn(worker as any, 'processJob')
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Processing failed'));

      // Mock handleJobFailure
      jest.spyOn(worker as any, 'handleJobFailure').mockResolvedValue(undefined);

      // Mock markJobCompleted
      jest.spyOn(worker as any, 'markJobCompleted').mockResolvedValue(undefined);

      const result = await worker.processJobsOnce();

      expect(result).toEqual({ processed: 1, failed: 1 });
      expect(worker['handleJobFailure']).toHaveBeenCalledTimes(1);
    });
  });

  describe('Quiet Hours Enforcement', () => {
    let notificationService: NotificationService;
    let mockDb: any;
    let mockAuditService: any;

    beforeEach(() => {
      mockDb = {
        transaction: jest.fn(),
        select: jest.fn(),
        insert: jest.fn(),
        update: jest.fn(),
      };

      mockAuditService = {
        log: jest.fn(),
      };

      const mockMetricsService = {
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
      };

      notificationService = new NotificationService(mockDb, mockAuditService, mockMetricsService as any);
    });

    describe('shouldSuppressDuringQuietHours', () => {
      beforeEach(() => {
        // Mock Date to a fixed time for consistent testing
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2024-01-15T14:30:00Z')); // 2:30 PM UTC
      });

      afterEach(() => {
        jest.useRealTimers();
      });

      it('should not suppress when quiet hours are disabled', () => {
        const quietHoursJson = { enabled: false };
        expect(notificationService['shouldSuppressDuringQuietHours']('warning', quietHoursJson)).toBe(false);
        expect(notificationService['shouldSuppressDuringQuietHours']('info', quietHoursJson)).toBe(false);
      });

      it('should not suppress critical notifications during quiet hours', () => {
        const quietHoursJson = {
          enabled: true,
          start: '22:00',
          end: '08:00',
          timezone: 'UTC'
        };
        expect(notificationService['shouldSuppressDuringQuietHours']('critical', quietHoursJson)).toBe(false);
      });

      it('should suppress non-critical notifications during quiet hours', () => {
        // Set time to 2:30 AM UTC (within 22:00-08:00 quiet hours)
        jest.setSystemTime(new Date('2024-01-15T02:30:00Z'));

        const quietHoursJson = {
          enabled: true,
          start: '22:00',
          end: '08:00',
          timezone: 'UTC'
        };

        expect(notificationService['shouldSuppressDuringQuietHours']('warning', quietHoursJson)).toBe(true);
        expect(notificationService['shouldSuppressDuringQuietHours']('info', quietHoursJson)).toBe(true);
      });

      it('should not suppress notifications outside quiet hours', () => {
        // Set time to 2:30 PM UTC (outside 22:00-08:00 quiet hours)
        jest.setSystemTime(new Date('2024-01-15T14:30:00Z'));

        const quietHoursJson = {
          enabled: true,
          start: '22:00',
          end: '08:00',
          timezone: 'UTC'
        };

        expect(notificationService['shouldSuppressDuringQuietHours']('warning', quietHoursJson)).toBe(false);
        expect(notificationService['shouldSuppressDuringQuietHours']('info', quietHoursJson)).toBe(false);
      });

      it('should handle cross-day quiet hours correctly', () => {
        // Set time to 2:30 AM UTC (within 22:00-08:00 which crosses midnight)
        jest.setSystemTime(new Date('2024-01-15T02:30:00Z'));

        const quietHoursJson = {
          enabled: true,
          start: '22:00',
          end: '08:00',
          timezone: 'UTC'
        };

        expect(notificationService['shouldSuppressDuringQuietHours']('info', quietHoursJson)).toBe(true);
      });

      it('should handle invalid quiet hours configuration gracefully', () => {
        const invalidQuietHoursJson = {
          enabled: true,
          start: 'invalid',
          end: 'time',
        };

        expect(notificationService['shouldSuppressDuringQuietHours']('warning', invalidQuietHoursJson)).toBe(false);
      });
    });
  });
});
