import { ConfigService } from '@nestjs/config';
import { NotificationDigestService } from './notification-digest.service';
import type { EmailTransport } from './transports/email.transport';

const selectWhere = (rows: any[]) => ({
  from: jest.fn().mockReturnValue({
    where: jest.fn().mockResolvedValue(rows),
  }),
});

const selectDigestRows = (rows: any[]) => ({
  from: jest.fn().mockReturnValue({
    innerJoin: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue(rows),
      }),
    }),
  }),
});

describe('NotificationDigestService', () => {
  let db: { select: jest.Mock };
  let email: jest.Mocked<Pick<EmailTransport, 'send'>>;
  let service: NotificationDigestService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-08T07:00:00.000Z'));
    db = { select: jest.fn() };
    email = { send: jest.fn().mockResolvedValue(undefined) } as any;
    service = new NotificationDigestService(
      db as any,
      {} as ConfigService,
      email as unknown as EmailTransport,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('sends daily digest emails for users with unread notifications', async () => {
    db.select
      .mockReturnValueOnce(selectWhere([{ userId: 'user-1' }]))
      .mockReturnValueOnce(
        selectDigestRows([
          {
            title: 'Pump offline',
            body: 'Pump 1',
            severity: 'warning',
            type: 'system',
            createdAt: new Date('2026-03-08T06:00:00.000Z'),
          },
          {
            title: 'Shift variance',
            body: null,
            severity: null,
            type: 'shift',
            createdAt: new Date('2026-03-08T05:00:00.000Z'),
          },
        ]),
      )
      .mockReturnValueOnce(selectWhere([{ email: 'user@ifms.local', name: 'Jane' }]));

    await service.handleDailyDigest();

    expect(email.send).toHaveBeenCalledWith({
      to: 'user@ifms.local',
      subject: 'IFMS Daily Digest \u2014 2 notifications',
      body: expect.stringContaining('Pump offline: Pump 1'),
    });
    expect(email.send.mock.calls[0][0].body).toContain('[INFO] Shift variance');
  });

  it('uses singular weekly digest subject for one notification', async () => {
    db.select
      .mockReturnValueOnce(selectWhere([{ userId: 'user-1' }]))
      .mockReturnValueOnce(
        selectDigestRows([
          {
            title: 'One item',
            body: 'Read this',
            severity: 'critical',
            type: 'system',
            createdAt: new Date('2026-03-07T07:00:00.000Z'),
          },
        ]),
      )
      .mockReturnValueOnce(selectWhere([{ email: 'user@ifms.local', name: 'Jane' }]));

    await service.handleWeeklyDigest();

    expect(email.send).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'IFMS Weekly Digest \u2014 1 notification',
        body: expect.stringContaining("Here's your weekly notification digest (1 unread):"),
      }),
    );
  });

  it('does nothing when there are no digest users, no unread deliveries, or no user email row', async () => {
    db.select.mockReturnValueOnce(selectWhere([]));
    await service.handleDailyDigest();
    expect(email.send).not.toHaveBeenCalled();

    db.select
      .mockReturnValueOnce(selectWhere([{ userId: 'user-1' }]))
      .mockReturnValueOnce(selectDigestRows([]));
    await service.handleDailyDigest();
    expect(email.send).not.toHaveBeenCalled();

    db.select
      .mockReturnValueOnce(selectWhere([{ userId: 'user-2' }]))
      .mockReturnValueOnce(
        selectDigestRows([
          { title: 'Unread', body: 'Body', severity: 'info', createdAt: new Date() },
        ]),
      )
      .mockReturnValueOnce(selectWhere([]));
    await service.handleDailyDigest();
    expect(email.send).not.toHaveBeenCalled();
  });

  it('continues digest processing when one user fails and catches top-level errors', async () => {
    email.send.mockRejectedValueOnce(new Error('smtp down'));
    db.select
      .mockReturnValueOnce(selectWhere([{ userId: 'user-1' }, { userId: 'user-2' }]))
      .mockReturnValueOnce(
        selectDigestRows([
          { title: 'First', body: 'Body', severity: 'info', createdAt: new Date() },
        ]),
      )
      .mockReturnValueOnce(selectWhere([{ email: 'first@ifms.local', name: 'First' }]))
      .mockReturnValueOnce(
        selectDigestRows([
          { title: 'Second', body: 'Body', severity: 'warning', createdAt: new Date() },
        ]),
      )
      .mockReturnValueOnce(selectWhere([{ email: 'second@ifms.local', name: 'Second' }]));

    await expect(service.handleDailyDigest()).resolves.toBeUndefined();

    expect(email.send).toHaveBeenCalledTimes(2);

    db.select.mockReturnValueOnce({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockRejectedValue(new Error('db down')),
      }),
    });
    await expect(service.handleDailyDigest()).resolves.toBeUndefined();
  });
});
