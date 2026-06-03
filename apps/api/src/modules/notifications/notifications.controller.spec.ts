import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  AdminNotificationsController,
  NotificationsController,
} from './notifications.controller';
import type { NotificationMetricsService } from './notification-metrics.service';
import type { NotificationService } from './notifications.service';
import type { OutboxWorker } from './outbox.worker';

const UUID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const OTHER_UUID = '3f2504e0-4f89-41d3-9a0c-0305e82c3302';

describe('NotificationsController', () => {
  let service: jest.Mocked<
    Pick<
      NotificationService,
      | 'listUserDeliveries'
      | 'getUnreadCount'
      | 'getUserPreferences'
      | 'updateUserPreferences'
      | 'getDeliveryById'
      | 'markSeen'
      | 'markRead'
      | 'archive'
    >
  >;
  let controller: NotificationsController;

  beforeEach(() => {
    service = {
      listUserDeliveries: jest.fn(),
      getUnreadCount: jest.fn(),
      getUserPreferences: jest.fn(),
      updateUserPreferences: jest.fn(),
      getDeliveryById: jest.fn(),
      markSeen: jest.fn(),
      markRead: jest.fn(),
      archive: jest.fn(),
    } as any;

    controller = new NotificationsController(
      service as unknown as NotificationService,
      {} as OutboxWorker,
      {} as NotificationMetricsService,
    );
  });

  const user = { sub: 'user-1', permissions: [] } as any;

  it('lists current user deliveries with pagination defaults and converted date filters', async () => {
    service.listUserDeliveries.mockResolvedValue({
      deliveries: [{ id: 'delivery-1' }],
      total: 51,
    } as any);

    const result = await controller.listNotifications(user, {
      severity: 'warning',
      dateFrom: '2026-01-01T00:00:00.000Z',
      dateTo: '2026-01-31T00:00:00.000Z',
    } as any);

    expect(service.listUserDeliveries).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        severity: 'warning',
        page: 1,
        pageSize: 25,
        dateFrom: expect.any(Date),
        dateTo: expect.any(Date),
      }),
    );
    expect(result).toEqual({
      data: [{ id: 'delivery-1' }],
      pagination: { page: 1, pageSize: 25, total: 51, totalPages: 3 },
    });
  });

  it('honors explicit pagination when listing notifications', async () => {
    service.listUserDeliveries.mockResolvedValue({
      deliveries: [],
      total: 40,
    } as any);

    await controller.listNotifications(user, { page: 2, pageSize: 10 } as any);

    expect(service.listUserDeliveries).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ page: 2, pageSize: 10 }),
    );
  });

  it('returns unread count envelope', async () => {
    service.getUnreadCount.mockResolvedValue(7);
    await expect(controller.getUnreadCount(user)).resolves.toEqual({ count: 7 });
    expect(service.getUnreadCount).toHaveBeenCalledWith('user-1');
  });

  it('delegates preference reads and updates to the service', async () => {
    const preferences = { digestMode: 'daily' };
    const update = {
      channelsJson: { inapp: true, email: false, sms: false, push: false },
      severityMin: 'info',
      digestMode: 'none',
    };
    service.getUserPreferences.mockResolvedValue(preferences as any);
    service.updateUserPreferences.mockResolvedValue(undefined as any);

    await expect(controller.getPreferences(user)).resolves.toBe(preferences);
    await expect(controller.updatePreferences(user, update as any)).resolves.toEqual({
      message: 'Preferences updated successfully',
    });
    expect(service.getUserPreferences).toHaveBeenCalledWith('user-1');
    expect(service.updateUserPreferences).toHaveBeenCalledWith('user-1', update);
  });

  it('delegates delivery lookup and state transitions with current user scope', async () => {
    const delivery = { id: UUID };
    service.getDeliveryById.mockResolvedValue(delivery as any);

    await expect(controller.getById(user, UUID)).resolves.toBe(delivery);
    await expect(controller.markSeen(user, UUID)).resolves.toEqual({
      message: 'Notification marked as seen',
    });
    await expect(controller.markRead(user, UUID)).resolves.toEqual({
      message: 'Notification marked as read',
    });
    await expect(controller.archive(user, UUID)).resolves.toEqual({
      message: 'Notification archived',
    });

    expect(service.getDeliveryById).toHaveBeenCalledWith('user-1', UUID);
    expect(service.markSeen).toHaveBeenCalledWith(UUID, 'user-1');
    expect(service.markRead).toHaveBeenCalledWith(UUID, 'user-1');
    expect(service.archive).toHaveBeenCalledWith(UUID, 'user-1');
  });
});

describe('AdminNotificationsController', () => {
  let service: jest.Mocked<
    Pick<
      NotificationService,
      'createNotification' | 'getOutboxBacklog' | 'getDeliveryStats'
    >
  >;
  let outboxWorker: jest.Mocked<Pick<OutboxWorker, 'processJobsOnce'>>;
  let metrics: jest.Mocked<
    Pick<NotificationMetricsService, 'getCurrentMetrics' | 'getPrometheusMetrics'>
  >;
  let controller: AdminNotificationsController;

  beforeEach(() => {
    service = {
      createNotification: jest.fn(),
      getOutboxBacklog: jest.fn(),
      getDeliveryStats: jest.fn(),
    } as any;
    outboxWorker = { processJobsOnce: jest.fn() } as any;
    metrics = {
      getCurrentMetrics: jest.fn(),
      getPrometheusMetrics: jest.fn(),
    } as any;

    controller = new AdminNotificationsController(
      service as unknown as NotificationService,
      outboxWorker as unknown as OutboxWorker,
      metrics as unknown as NotificationMetricsService,
    );
  });

  const adminUser = {
    sub: 'admin-1',
    permissions: ['notifications:admin', `company:${UUID}`, `branch:${OTHER_UUID}`],
  } as any;

  it('creates admin notifications with mapped scope and Date expiration', async () => {
    service.createNotification.mockResolvedValue('notification-1');

    const result = await controller.createNotification(
      {
        companyId: UUID,
        branchId: OTHER_UUID,
        type: 'system',
        severity: 'critical',
        title: 'Outage',
        body: 'Pump offline',
        data: { pumpId: 'pump-1' },
        actionUrl: '/app/system',
        dedupeKey: 'system:pump-1',
        expiresAt: '2026-02-01T00:00:00.000Z',
        recipients: { roles: ['Manager'] },
      } as any,
      adminUser,
    );

    expect(service.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: { companyId: UUID, branchId: OTHER_UUID, stationId: undefined },
        type: 'system',
        severity: 'critical',
        expiresAt: expect.any(Date),
        recipients: { roles: ['Manager'] },
      }),
    );
    expect(result).toEqual({
      notificationId: 'notification-1',
      message: 'Notification created successfully',
    });
  });

  it('rejects admin create without notification admin permission', async () => {
    await expect(
      controller.createNotification({ companyId: UUID } as any, {
        sub: 'u1',
        permissions: [],
      } as any),
    ).rejects.toThrow(ForbiddenException);
  });

  it('sends a test notification to current user defaults', async () => {
    service.createNotification.mockResolvedValue('test-1');

    const result = await controller.sendTestNotification({} as any, {
      sub: 'user-1',
      permissions: ['notifications:test', `company:${UUID}`, `branch:${OTHER_UUID}`],
    } as any);

    expect(service.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: { companyId: UUID, branchId: OTHER_UUID },
        type: 'system',
        severity: 'info',
        title: 'Test Notification',
        body: 'This is a test notification from IFMS',
        recipients: { userIds: ['user-1'] },
      }),
    );
    expect(result).toEqual({
      notificationId: 'test-1',
      message: 'Test notification sent successfully',
    });
  });

  it('can target a specific user or branch for test notifications', async () => {
    service.createNotification.mockResolvedValue('test-2');

    await controller.sendTestNotification(
      { userId: 'target-user', title: 'Direct' } as any,
      { sub: 'user-1', permissions: ['notifications:test', `company:${UUID}`] } as any,
    );
    await controller.sendTestNotification(
      { branchId: OTHER_UUID, title: 'Branch' } as any,
      { sub: 'user-1', permissions: ['notifications:test', `company:${UUID}`] } as any,
    );

    expect(service.createNotification).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ recipients: { userIds: ['target-user'] } }),
    );
    expect(service.createNotification).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        scope: { companyId: UUID, branchId: OTHER_UUID },
        recipients: { branchMembership: true },
      }),
    );
  });

  it('rejects test notifications without permission or company scope', async () => {
    await expect(
      controller.sendTestNotification({} as any, {
        sub: 'u1',
        permissions: [`company:${UUID}`],
      } as any),
    ).rejects.toThrow(ForbiddenException);

    await expect(
      controller.sendTestNotification({} as any, {
        sub: 'u1',
        permissions: ['notifications:test'],
      } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('processes outbox only for notification admins', async () => {
    outboxWorker.processJobsOnce.mockResolvedValue({ processed: 2, failed: 1 });

    await expect(controller.processOutbox(adminUser)).resolves.toEqual({
      message: 'Outbox processing completed',
      processed: 2,
      failed: 1,
    });
    await expect(
      controller.processOutbox({ sub: 'u1', permissions: [] } as any),
    ).rejects.toThrow(ForbiddenException);
  });

  it('returns health with warning status when backlog is high', async () => {
    service.getOutboxBacklog.mockResolvedValue({
      total: 1001,
      oldestAge: 60,
      failed: 3,
    } as any);
    service.getDeliveryStats.mockResolvedValue({ sent: 9 } as any);
    metrics.getCurrentMetrics.mockReturnValue({ deliveriesSent: 9 } as any);

    const result = await controller.getHealth(adminUser);

    expect(result).toEqual(
      expect.objectContaining({
        status: 'warning',
        outbox: {
          total_pending: 1001,
          oldest_job_age_seconds: 60,
          failed_jobs: 3,
        },
        deliveries: { sent: 9 },
        metrics: { deliveriesSent: 9 },
      }),
    );
    expect(result.timestamp).toEqual(expect.any(String));
  });

  it('returns healthy status for smaller backlog and exposes prometheus metrics', async () => {
    service.getOutboxBacklog.mockResolvedValue({
      total: 5,
      oldestAge: 10,
      failed: 0,
    } as any);
    service.getDeliveryStats.mockResolvedValue({ sent: 5 } as any);
    metrics.getCurrentMetrics.mockReturnValue({ deliveriesSent: 5 } as any);
    metrics.getPrometheusMetrics.mockReturnValue('deliveries_sent_total 5\n');

    await expect(controller.getHealth(adminUser)).resolves.toEqual(
      expect.objectContaining({ status: 'healthy' }),
    );
    expect(controller.getPrometheusMetrics()).toBe('deliveries_sent_total 5\n');
  });

  it('rejects health access without notification admin permission', async () => {
    await expect(
      controller.getHealth({ sub: 'u1', permissions: [] } as any),
    ).rejects.toThrow(ForbiddenException);
  });
});
