import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { generateKeyPairSync } from 'crypto';
import { PushTransport } from './push.transport';

const makeConfig = (values: Record<string, any>): ConfigService =>
  ({
    get: jest.fn((key: string, fallback?: any) => (key in values ? values[key] : fallback)),
  }) as any;

const serviceAccountKey = () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return JSON.stringify({
    client_email: 'firebase@ifms.local',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  });
};

describe('PushTransport token branches', () => {
  const realFetch = global.fetch;

  afterEach(() => {
    global.fetch = realFetch;
    jest.restoreAllMocks();
  });

  it('uses fallback logging when only the FCM project id is configured', async () => {
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as any;
    const transport = new PushTransport(makeConfig({ FCM_PROJECT_ID: 'proj-1' }));

    await expect(
      transport.send({ to: 'token-1234567890', title: 'Title', body: 'Body' }),
    ).resolves.toBeUndefined();

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fetches and caches an OAuth token before sending to FCM', async () => {
    const fetchSpy = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ access_token: 'fresh-token', expires_in: 120 }),
      })
      .mockResolvedValueOnce({ ok: true });
    global.fetch = fetchSpy as any;
    const transport = new PushTransport(
      makeConfig({
        FCM_PROJECT_ID: 'proj-1',
        FCM_SERVICE_ACCOUNT_KEY: serviceAccountKey(),
      }),
    );

    await transport.send({
      to: 'token-1234567890',
      title: 'Title',
      body: 'Body',
      data: { notificationId: 'notification-1' },
    });

    expect(fetchSpy).toHaveBeenNthCalledWith(
      1,
      'https://oauth2.googleapis.com/token',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }),
    );
    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      'https://fcm.googleapis.com/v1/projects/proj-1/messages:send',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer fresh-token' }),
      }),
    );
    expect((transport as any).cachedAccessToken.token).toBe('fresh-token');
  });

  it('refreshes a cached token inside the safety window', async () => {
    const fetchSpy = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ access_token: 'refreshed-token', expires_in: 120 }),
      })
      .mockResolvedValueOnce({ ok: true });
    global.fetch = fetchSpy as any;
    const transport = new PushTransport(
      makeConfig({
        FCM_PROJECT_ID: 'proj-1',
        FCM_SERVICE_ACCOUNT_KEY: serviceAccountKey(),
      }),
    );
    (transport as any).cachedAccessToken = {
      token: 'stale-token',
      expiresAt: Date.now() + 30_000,
    };

    await transport.send({ to: 'token-1234567890', title: 'Title', body: 'Body' });

    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer refreshed-token' }),
      }),
    );
  });

  it('throws when the OAuth token endpoint rejects the service-account assertion', async () => {
    const fetchSpy = jest.fn().mockResolvedValue({
      ok: false,
      text: jest.fn().mockResolvedValue('oauth rejected'),
    });
    global.fetch = fetchSpy as any;
    const transport = new PushTransport(
      makeConfig({
        FCM_PROJECT_ID: 'proj-1',
        FCM_SERVICE_ACCOUNT_KEY: serviceAccountKey(),
      }),
    );

    await expect((transport as any).getAccessToken()).rejects.toThrow(
      InternalServerErrorException,
    );
  });
});
