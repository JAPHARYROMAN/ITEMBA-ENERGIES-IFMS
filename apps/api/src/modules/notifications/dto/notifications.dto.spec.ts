import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  ArchiveDto,
  CreateNotificationDto,
  MarkReadDto,
  MarkSeenDto,
  NotificationListQueryDto,
  NotificationRecipientsDto,
  TestNotificationDto,
  UpdatePreferencesDto,
} from './notifications.dto';

const UUID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

async function errorsFor<T extends object>(
  cls: new () => T,
  payload: object,
): Promise<string[]> {
  const instance = plainToInstance(cls, payload);
  const errors = await validate(instance as object);
  return errors.map((error) => error.property);
}

describe('notification DTO validation', () => {
  describe('NotificationRecipientsDto', () => {
    it('accepts user IDs, allowed roles and branch membership', async () => {
      await expect(
        errorsFor(NotificationRecipientsDto, {
          userIds: [UUID],
          roles: ['Manager', 'Cashier', 'Auditor'],
          branchMembership: true,
        }),
      ).resolves.toEqual([]);
    });

    it('rejects invalid UUIDs, roles and booleans', async () => {
      await expect(
        errorsFor(NotificationRecipientsDto, {
          userIds: ['not-a-uuid'],
          roles: ['Owner'],
          branchMembership: 'true',
        }),
      ).resolves.toEqual(['userIds', 'roles', 'branchMembership']);
    });
  });

  describe('CreateNotificationDto', () => {
    const valid = {
      companyId: UUID,
      branchId: UUID,
      stationId: UUID,
      type: 'system',
      severity: 'warning',
      title: 'Pump offline',
      body: 'Pump one is offline',
      data: { pumpId: 'pump-1' },
      actionUrl: '/app/system',
      dedupeKey: 'pump:offline:1',
      expiresAt: '2026-01-01T00:00:00.000Z',
      recipients: { userIds: [UUID] },
    };

    it('accepts a valid payload with nested recipients', async () => {
      await expect(errorsFor(CreateNotificationDto, valid)).resolves.toEqual([]);
    });

    it('rejects invalid scope, severity, expiration and nested recipients', async () => {
      const instance = plainToInstance(CreateNotificationDto, {
        ...valid,
        companyId: 'bad',
        branchId: 'bad',
        stationId: 'bad',
        severity: 'urgent',
        expiresAt: 'tomorrow',
        recipients: { userIds: ['bad'] },
      });

      const errors = await validate(instance as object);
      expect(errors.map((error) => error.property)).toEqual(
        expect.arrayContaining([
          'companyId',
          'branchId',
          'stationId',
          'severity',
          'expiresAt',
          'recipients',
        ]),
      );
      expect(errors.find((error) => error.property === 'recipients')?.children).toHaveLength(1);
    });
  });

  describe('NotificationListQueryDto', () => {
    it('coerces pagination and boolean query values', async () => {
      const instance = plainToInstance(NotificationListQueryDto, {
        page: '2',
        pageSize: '50',
        unread: 'true',
        status: 'sent',
        severity: 'critical',
        dateFrom: '2026-01-01T00:00:00.000Z',
        dateTo: '2026-01-31T00:00:00.000Z',
      });

      expect(instance.page).toBe(2);
      expect(instance.pageSize).toBe(50);
      expect(instance.unread).toBe(true);
      await expect(validate(instance as object)).resolves.toEqual([]);
    });

    it('applies default pagination values on an empty query', async () => {
      const instance = plainToInstance(NotificationListQueryDto, {});
      expect(instance.page).toBe(1);
      expect(instance.pageSize).toBe(25);
      await expect(validate(instance as object)).resolves.toEqual([]);
    });

    it('rejects invalid status, page bounds and page size bounds', async () => {
      await expect(
        errorsFor(NotificationListQueryDto, {
          status: 'archived',
          severity: 'urgent',
          page: 0,
          pageSize: 101,
          dateFrom: 'bad-date',
        }),
      ).resolves.toEqual(
        expect.arrayContaining(['status', 'severity', 'page', 'pageSize', 'dateFrom']),
      );
    });
  });

  describe('delivery action DTOs', () => {
    it.each([
      [MarkSeenDto, 'MarkSeenDto'],
      [MarkReadDto, 'MarkReadDto'],
      [ArchiveDto, 'ArchiveDto'],
    ])('%s accepts a UUID delivery id', async (cls) => {
      await expect(errorsFor(cls as new () => object, { deliveryId: UUID })).resolves.toEqual([]);
    });

    it.each([
      [MarkSeenDto, 'MarkSeenDto'],
      [MarkReadDto, 'MarkReadDto'],
      [ArchiveDto, 'ArchiveDto'],
    ])('%s rejects a non-UUID delivery id', async (cls) => {
      await expect(errorsFor(cls as new () => object, { deliveryId: 'bad' })).resolves.toEqual([
        'deliveryId',
      ]);
    });
  });

  describe('UpdatePreferencesDto', () => {
    const valid = {
      channelsJson: { inapp: true, email: false, sms: false, push: true },
      severityMin: 'warning',
      quietHoursJson: {
        enabled: true,
        start: '22:00',
        end: '06:00',
        timezone: 'UTC',
      },
      digestMode: 'daily',
    };

    it('accepts preference payloads', async () => {
      await expect(errorsFor(UpdatePreferencesDto, valid)).resolves.toEqual([]);
    });

    it('rejects invalid severity and digest mode', async () => {
      await expect(
        errorsFor(UpdatePreferencesDto, {
          ...valid,
          severityMin: 'success',
          digestMode: 'monthly',
        }),
      ).resolves.toEqual(expect.arrayContaining(['severityMin', 'digestMode']));
    });
  });

  describe('TestNotificationDto', () => {
    it('sets default title, body and severity on empty input', async () => {
      const instance = plainToInstance(TestNotificationDto, {});

      expect(instance.title).toBe('Test Notification');
      expect(instance.body).toBe('This is a test notification from IFMS');
      expect(instance.severity).toBe('info');
      await expect(validate(instance as object)).resolves.toEqual([]);
    });

    it('validates optional target user and branch IDs', async () => {
      await expect(
        errorsFor(TestNotificationDto, {
          title: 'Check',
          body: 'Body',
          severity: 'success',
          userId: UUID,
          branchId: UUID,
        }),
      ).resolves.toEqual([]);
      await expect(
        errorsFor(TestNotificationDto, {
          severity: 'urgent',
          userId: 'bad',
          branchId: 'bad',
        }),
      ).resolves.toEqual(expect.arrayContaining(['severity', 'userId', 'branchId']));
    });
  });
});
