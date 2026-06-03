import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailTransport } from './email.transport';
import { SmsTransport } from './sms.transport';
import { PushTransport } from './push.transport';
import * as nodemailer from 'nodemailer';

jest.mock('nodemailer');

const makeConfig = (values: Record<string, any>): ConfigService =>
  ({
    get: jest.fn((key: string, fallback?: any) =>
      key in values ? values[key] : fallback,
    ),
  }) as any;

describe('EmailTransport', () => {
  afterEach(() => jest.clearAllMocks());

  it('uses console fallback when SMTP_HOST is not configured', async () => {
    const transport = new EmailTransport(makeConfig({}));
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
    // Should not throw and should not attempt to send mail.
    await expect(
      transport.send({ to: 'a@b.com', subject: 'Hi', body: 'Body' }),
    ).resolves.toBeUndefined();
  });

  it('sends via nodemailer when SMTP_HOST is configured', async () => {
    const sendMail = jest.fn().mockResolvedValue({ messageId: '1' });
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });

    const transport = new EmailTransport(
      makeConfig({
        SMTP_HOST: 'smtp.example.com',
        SMTP_PORT: 2525,
        SMTP_USER: 'user',
        SMTP_PASS: 'pass',
        SMTP_FROM: 'from@ifms.local',
      }),
    );

    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'smtp.example.com', port: 2525 }),
    );

    await transport.send({
      to: 'rcpt@b.com',
      subject: 'Subject',
      body: 'Plain',
      html: '<b>Plain</b>',
    });

    expect(sendMail).toHaveBeenCalledWith({
      from: 'from@ifms.local',
      to: 'rcpt@b.com',
      subject: 'Subject',
      text: 'Plain',
      html: '<b>Plain</b>',
    });
  });

  it('propagates transporter send failures', async () => {
    const sendMail = jest.fn().mockRejectedValue(new Error('smtp boom'));
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });
    const transport = new EmailTransport(makeConfig({ SMTP_HOST: 'h' }));
    await expect(
      transport.send({ to: 'x@y.com', subject: 's', body: 'b' }),
    ).rejects.toThrow('smtp boom');
  });
});

describe('SmsTransport', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    jest.clearAllMocks();
  });

  it('uses console fallback when provider is not configured', async () => {
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as any;
    const transport = new SmsTransport(makeConfig({}));
    await expect(
      transport.send({ to: '+255700000000', message: 'hello' }),
    ).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('posts to the provider when url and key are present', async () => {
    const fetchSpy = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchSpy as any;

    const transport = new SmsTransport(
      makeConfig({
        SMS_PROVIDER_URL: 'https://sms.example/send',
        SMS_API_KEY: 'secret',
      }),
    );

    await transport.send({ to: '+255700000000', message: 'hello' });

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://sms.example/send',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer secret' }),
      }),
    );
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as any).body);
    expect(body).toEqual({ to: '+255700000000', message: 'hello' });
  });

  it('throws when the provider responds with a non-ok status', async () => {
    const fetchSpy = jest.fn().mockResolvedValue({
      ok: false,
      status: 502,
      text: jest.fn().mockResolvedValue('bad gateway'),
    });
    global.fetch = fetchSpy as any;

    const transport = new SmsTransport(
      makeConfig({ SMS_PROVIDER_URL: 'https://sms.example/send', SMS_API_KEY: 'k' }),
    );

    await expect(
      transport.send({ to: '+255700000000', message: 'hi' }),
    ).rejects.toThrow(InternalServerErrorException);
  });
});

describe('PushTransport', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    jest.clearAllMocks();
  });

  it('uses console fallback when FCM is not configured', async () => {
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as any;
    const transport = new PushTransport(makeConfig({}));
    await expect(
      transport.send({ to: 'devicetoken123456', title: 'T', body: 'B' }),
    ).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sends an FCM message using a cached access token', async () => {
    const fetchSpy = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchSpy as any;

    const transport = new PushTransport(
      makeConfig({
        FCM_PROJECT_ID: 'proj-1',
        FCM_SERVICE_ACCOUNT_KEY: '{"client_email":"x","private_key":"y"}',
      }),
    );
    // Short-circuit token retrieval to avoid real crypto/oauth.
    (transport as any).cachedAccessToken = {
      token: 'cached-token',
      expiresAt: Date.now() + 3_600_000,
    };

    await transport.send({
      to: 'devicetoken123456',
      title: 'Title',
      body: 'Body',
      data: { notificationId: 'n1' },
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://fcm.googleapis.com/v1/projects/proj-1/messages:send',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer cached-token' }),
      }),
    );
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as any).body);
    expect(body.message.token).toBe('devicetoken123456');
    expect(body.message.notification).toEqual({ title: 'Title', body: 'Body' });
  });

  it('throws when FCM responds with a non-ok status', async () => {
    const fetchSpy = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: jest.fn().mockResolvedValue('invalid token'),
    });
    global.fetch = fetchSpy as any;

    const transport = new PushTransport(
      makeConfig({
        FCM_PROJECT_ID: 'proj-1',
        FCM_SERVICE_ACCOUNT_KEY: '{}',
      }),
    );
    (transport as any).cachedAccessToken = {
      token: 'tok',
      expiresAt: Date.now() + 3_600_000,
    };

    await expect(
      transport.send({ to: 'devicetoken123456', title: 'T', body: 'B' }),
    ).rejects.toThrow(InternalServerErrorException);
  });
});
