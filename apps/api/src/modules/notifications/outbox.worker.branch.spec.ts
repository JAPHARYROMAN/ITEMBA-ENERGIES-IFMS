import { BadRequestException } from '@nestjs/common';
import { OutboxWorker } from './outbox.worker';
import {
  notificationDeliveries,
  NOTIFICATION_OUTBOX_JOB_TYPE,
} from '../../database/schema/notifications/notifications';

const makeMetrics = () => ({
  incrementDeliveriesSent: jest.fn(),
  incrementDeliveryFailures: jest.fn(),
  recordPermanentFailure: jest.fn(),
  recordRetry: jest.fn(),
  recordOutboxBatch: jest.fn(),
  recordOutboxProcessingTime: jest.fn(),
  recordOutboxError: jest.fn(),
});

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

const updateWhere = (result: any = { rowCount: 1 }) => ({
  set: jest.fn().mockReturnValue({
    where: jest.fn().mockResolvedValue(result),
  }),
});

const makeWorker = (db: any = {}) => {
  const metrics = makeMetrics();
  const gateway = { emitNotificationToUser: jest.fn() };
  const email = { send: jest.fn() };
  const sms = { send: jest.fn() };
  const push = { send: jest.fn() };
  const config = { get: jest.fn().mockReturnValue(1) };
  const worker = new OutboxWorker(
    db,
    config as any,
    gateway as any,
    metrics as any,
    email as any,
    sms as any,
    push as any,
  );
  (worker as any).logger = {
    log: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  return { worker, metrics, gateway, email, sms, push, config };
};

describe('OutboxWorker branch behavior', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('starts and stops the polling interval', async () => {
    jest.useFakeTimers();
    const { worker, config } = makeWorker({});

    worker.onModuleInit();
    await worker.onModuleDestroy();

    expect(config.get).toHaveBeenCalledWith('NOTIFICATION_OUTBOX_POLL_INTERVAL', 30);
    expect((worker as any).pollInterval).toBeNull();
  });

  it('can be destroyed before a polling interval has been started', async () => {
    const { worker } = makeWorker({});

    await worker.onModuleDestroy();

    expect((worker as any).pollInterval).toBeNull();
  });

  it('records processing time and exits when no jobs are ready', async () => {
    const db = { select: jest.fn().mockReturnValue(selectWhereLimit([])) };
    const { worker, metrics } = makeWorker(db);

    await (worker as any).processJobs();

    expect(metrics.recordOutboxProcessingTime).toHaveBeenCalled();
    expect(metrics.recordOutboxBatch).not.toHaveBeenCalled();
  });

  it('processes only jobs that were successfully locked', async () => {
    const jobs = [
      { id: 'job-1', notificationId: 'notification-1', jobType: NOTIFICATION_OUTBOX_JOB_TYPE.DELIVER_INAPP },
      { id: 'job-2', notificationId: 'notification-2', jobType: NOTIFICATION_OUTBOX_JOB_TYPE.SEND_EMAIL },
    ];
    const db = { select: jest.fn().mockReturnValue(selectWhereLimit(jobs)) };
    const { worker, metrics } = makeWorker(db);
    jest.spyOn(worker as any, 'lockJobs').mockResolvedValue(['job-2']);
    const processSpy = jest.spyOn(worker as any, 'processJob').mockResolvedValue(undefined);
    jest.spyOn(worker as any, 'markJobCompleted').mockResolvedValue(undefined);

    await (worker as any).processJobs();

    expect(processSpy).toHaveBeenCalledTimes(1);
    expect(processSpy).toHaveBeenCalledWith(jobs[1]);
    expect(metrics.recordOutboxBatch).toHaveBeenCalledWith(2, 1, 0);
  });

  it('records failed jobs during automatic batch processing', async () => {
    const job = { id: 'job-1', notificationId: 'notification-1', jobType: NOTIFICATION_OUTBOX_JOB_TYPE.SEND_EMAIL };
    const db = { select: jest.fn().mockReturnValue(selectWhereLimit([job])) };
    const { worker, metrics } = makeWorker(db);
    jest.spyOn(worker as any, 'lockJobs').mockResolvedValue(['job-1']);
    jest.spyOn(worker as any, 'processJob').mockRejectedValue(new Error('delivery failed'));
    const failureSpy = jest.spyOn(worker as any, 'handleJobFailure').mockResolvedValue(undefined);

    await (worker as any).processJobs();

    expect(failureSpy).toHaveBeenCalledWith(job, expect.any(Error));
    expect(metrics.recordOutboxBatch).toHaveBeenCalledWith(1, 0, 1);
  });

  it('records a worker error when automatic job lookup fails', async () => {
    const db = {
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockRejectedValue(new Error('select failed')),
          }),
        }),
      }),
    };
    const { worker, metrics } = makeWorker(db);

    await (worker as any).processJobs();

    expect(metrics.recordOutboxError).toHaveBeenCalled();
  });

  it('records a worker error when manual job lookup fails', async () => {
    const db = {
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockRejectedValue(new Error('select failed')),
          }),
        }),
      }),
    };
    const { worker, metrics } = makeWorker(db);

    await expect(worker.processJobsOnce()).resolves.toEqual({ processed: 0, failed: 0 });
    expect(metrics.recordOutboxError).toHaveBeenCalled();
  });

  it('dispatches each known job type through processJob', async () => {
    const { worker } = makeWorker({});
    const inapp = jest.spyOn(worker as any, 'processInAppDelivery').mockResolvedValue(undefined);
    const email = jest.spyOn(worker as any, 'processEmailDelivery').mockResolvedValue(undefined);
    const sms = jest.spyOn(worker as any, 'processSmsDelivery').mockResolvedValue(undefined);
    const push = jest.spyOn(worker as any, 'processPushDelivery').mockResolvedValue(undefined);

    await (worker as any).processJob({ jobType: NOTIFICATION_OUTBOX_JOB_TYPE.DELIVER_INAPP });
    await (worker as any).processJob({ jobType: NOTIFICATION_OUTBOX_JOB_TYPE.SEND_EMAIL });
    await (worker as any).processJob({ jobType: NOTIFICATION_OUTBOX_JOB_TYPE.SEND_SMS });
    await (worker as any).processJob({ jobType: 'push' });

    expect(inapp).toHaveBeenCalledTimes(1);
    expect(email).toHaveBeenCalledTimes(1);
    expect(sms).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledTimes(1);
  });

  it('still rejects unknown job types through processJob', async () => {
    const { worker } = makeWorker({});

    await expect((worker as any).processJob({ jobType: 'unknown' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('skips email delivery rows when the user no longer exists', async () => {
    const db = {
      select: jest
        .fn()
        .mockReturnValueOnce(selectWhereLimit([{ id: 'notification-1', title: 'Title', body: 'Body' }]))
        .mockReturnValueOnce(selectWhere([{ id: 'delivery-1', userId: 'user-1' }]))
        .mockReturnValueOnce(selectWhere([])),
    };
    const { worker, email, metrics } = makeWorker(db);

    await (worker as any).processEmailDelivery({ notificationId: 'notification-1' });

    expect(email.send).not.toHaveBeenCalled();
    expect(metrics.incrementDeliveriesSent).toHaveBeenCalledWith('email');
  });

  it('skips SMS processing when the notification is missing', async () => {
    const db = { select: jest.fn().mockReturnValue(selectWhereLimit([])) };
    const { worker, sms } = makeWorker(db);

    await (worker as any).processSmsDelivery({ notificationId: 'missing' });

    expect(sms.send).not.toHaveBeenCalled();
  });

  it('uses the notification title as SMS body when body is null', async () => {
    const db = {
      select: jest
        .fn()
        .mockReturnValueOnce(selectWhereLimit([{ id: 'notification-1', title: 'Title', body: null }]))
        .mockReturnValueOnce(selectWhere([{ id: 'delivery-1', userId: 'user-1' }]))
        .mockReturnValueOnce(selectWhere([{ phone: '+255700000000', name: 'User' }])),
      update: jest.fn().mockReturnValue(updateWhere()),
    };
    const { worker, sms } = makeWorker(db);

    await (worker as any).processSmsDelivery({ notificationId: 'notification-1' });

    expect(sms.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: '+255700000000', message: 'Title' }),
    );
  });

  it('skips push processing when the notification is missing', async () => {
    const db = { select: jest.fn().mockReturnValue(selectWhereLimit([])) };
    const { worker, push } = makeWorker(db);

    await (worker as any).processPushDelivery({ notificationId: 'missing' });

    expect(push.send).not.toHaveBeenCalled();
  });

  it('omits actionUrl and falls back to title for push payloads when needed', async () => {
    const db = {
      select: jest
        .fn()
        .mockReturnValueOnce(selectWhereLimit([
          { id: 'notification-1', title: 'Title', body: null, actionUrl: null },
        ]))
        .mockReturnValueOnce(selectWhere([{ id: 'delivery-1', userId: 'user-1' }]))
        .mockReturnValueOnce(selectWhere([{ fcmToken: 'token-1', name: 'User' }])),
      update: jest.fn().mockReturnValue(updateWhere()),
    };
    const { worker, push } = makeWorker(db);

    await (worker as any).processPushDelivery({ notificationId: 'notification-1' });

    expect(push.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'token-1',
        body: 'Title',
        data: {
          notificationId: 'notification-1',
          deliveryId: 'delivery-1',
        },
      }),
    );
  });

  it('uses defaults when retrying a job without attempts or an Error object', async () => {
    let capturedSet: any;
    const db = {
      update: jest.fn().mockReturnValue({
        set: jest.fn().mockImplementation((value: any) => {
          capturedSet = value;
          return { where: jest.fn().mockResolvedValue({ rowCount: 1 }) };
        }),
      }),
    };
    const { worker, metrics } = makeWorker(db);

    await (worker as any).handleJobFailure(
      { id: 'job-1', notificationId: 'notification-1', jobType: NOTIFICATION_OUTBOX_JOB_TYPE.SEND_SMS },
      null,
    );

    expect(capturedSet).toEqual(
      expect.objectContaining({ attempts: 1, lastError: 'Unknown error' }),
    );
    expect(metrics.recordRetry).toHaveBeenCalledWith('sms');
  });

  it('throws when failure handling cannot map the job type to a delivery channel', async () => {
    const { worker } = makeWorker({});

    await expect(
      (worker as any).handleJobFailure({ id: 'job-1', notificationId: 'notification-1', jobType: 'push' }, null),
    ).rejects.toThrow(BadRequestException);
  });

  it('marks push deliveries failed when a user has no token', async () => {
    const db = {
      select: jest
        .fn()
        .mockReturnValueOnce(selectWhereLimit([{ id: 'notification-1', title: 'Title', body: 'Body' }]))
        .mockReturnValueOnce(selectWhere([{ id: 'delivery-1', userId: 'user-1' }]))
        .mockReturnValueOnce(selectWhere([{ fcmToken: undefined, name: 'User' }])),
      update: jest.fn().mockReturnValue(updateWhere()),
    };
    const { worker, push } = makeWorker(db);

    await (worker as any).processPushDelivery({ notificationId: 'notification-1' });

    expect(push.send).not.toHaveBeenCalled();
    expect(db.update).toHaveBeenCalledWith(notificationDeliveries);
  });
});
