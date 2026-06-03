import { BadRequestException, Logger } from '@nestjs/common';
import { generateKeyPairSync } from 'node:crypto';
import { ExportsComplianceService } from './exports.compliance.service';

describe('ExportsComplianceService', () => {
  const certPem = '-----BEGIN CERTIFICATE-----\nMIITEST\n-----END CERTIFICATE-----';

  const makeService = (config: Record<string, unknown> = {}) => {
    const cfg = {
      get: jest.fn((key: string, fallback?: unknown) =>
        Object.prototype.hasOwnProperty.call(config, key) ? config[key] : fallback,
      ),
    };
    return new ExportsComplianceService(cfg as any);
  };

  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
    jest.restoreAllMocks();
  });

  it('rejects missing signing certificates when strict signing is enabled', async () => {
    const service = makeService();

    await expect(service.signDocument(Buffer.from('pdf'), 'export-1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('returns an unsigned development signature when strict signing is disabled', async () => {
    const service = makeService({
      EXPORT_STRICT_SIGNING: 'false',
      SIGNING_ORG_DISPLAY: 'Dev Signer',
    });

    await expect(service.signDocument(Buffer.from('pdf'), 'export-1')).resolves.toMatchObject({
      signerSubject: 'Dev Signer',
      certFingerprintSha256: 'unsigned',
      signatureProfile: 'UNSIGNED',
      pdfaLevel: 'PDF/A-2b',
    });
    expect(warnSpy).toHaveBeenCalled();
  });

  it('builds a deterministic detached signature for kms and hsm providers', async () => {
    const service = makeService({
      SIGNING_PROVIDER: 'kms',
      SIGNING_KEY_ID: 'key-1',
      SIGNING_CERT_PEM: certPem,
    });

    const signed = await service.signDocument(Buffer.from('pdf-bytes'), 'export-1');

    expect(signed).toMatchObject({
      signerSubject: 'ITEMBA-ENERGIES (IFMS)',
      certChainPem: certPem,
      signatureProfile: 'PAdES-B-LT',
      pdfaLevel: 'PDF/A-2b',
    });
    expect(signed.certFingerprintSha256).toHaveLength(64);
    expect(signed.signatureBytesBase64).toEqual(expect.any(String));
  });

  it('signs with a base64 encoded file-provider private key', async () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const privateKeyPem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
    const service = makeService({
      SIGNING_CERT_PEM: certPem,
      SIGNING_KEY_ENCRYPTED: Buffer.from(privateKeyPem, 'utf8').toString('base64'),
    });

    const signed = await service.signDocument(Buffer.from('pdf-bytes'), 'export-1');

    expect(signed.signatureBytesBase64).toEqual(expect.any(String));
    expect(signed.signatureProfile).toBe('PAdES-B-LT');
  });

  it('rejects invalid file-provider key configuration', async () => {
    await expect(
      makeService({ SIGNING_CERT_PEM: certPem }).signDocument(Buffer.from('pdf'), 'export-1'),
    ).rejects.toThrow('SIGNING_KEY_ENCRYPTED is required');

    await expect(
      makeService({
        SIGNING_CERT_PEM: certPem,
        SIGNING_KEY_ENCRYPTED: Buffer.from('not a pem').toString('base64'),
      }).signDocument(Buffer.from('pdf'), 'export-1'),
    ).rejects.toThrow('Invalid SIGNING_KEY_ENCRYPTED format');
  });

  it('uses an offline timestamp token when no TSA URL is configured', async () => {
    const service = makeService({ TSA_PROVIDER: 'internal-test' });

    const result = await service.requestTimestamp('a'.repeat(64));
    const decoded = JSON.parse(Buffer.from(result.timestampTokenBase64, 'base64').toString('utf8'));

    expect(result.tsaProvider).toBe('internal-test');
    expect(decoded).toMatchObject({ provider: 'internal-test', mode: 'offline-fallback' });
  });

  it('uses TSA response bytes when the timestamp service succeeds', async () => {
    const originalFetch = global.fetch;
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => new Uint8Array(Buffer.from('tsa-token')).buffer,
    });

    try {
      const service = makeService({ TSA_URL: 'https://tsa.ifms.test', TSA_TIMEOUT_MS: 100 });
      const result = await service.requestTimestamp('b'.repeat(64));

      expect(result.timestampTokenBase64).toBe(Buffer.from('tsa-token').toString('base64'));
      expect(global.fetch).toHaveBeenCalledWith(
        'https://tsa.ifms.test',
        expect.objectContaining({ method: 'POST' }),
      );
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('falls back after TSA errors and records revocation evidence only when a chain exists', async () => {
    const originalFetch = global.fetch;
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      arrayBuffer: async () => new ArrayBuffer(0),
    });

    try {
      const service = makeService({ TSA_URL: 'https://tsa.ifms.test', TSA_PROVIDER: 'remote-tsa' });
      const result = await service.requestTimestamp('c'.repeat(64));
      const decoded = JSON.parse(Buffer.from(result.timestampTokenBase64, 'base64').toString('utf8'));

      expect(decoded.mode).toBe('fallback-after-error');
      expect(warnSpy).toHaveBeenCalled();
      await expect(service.fetchRevocationEvidence(certPem, 'fingerprint')).resolves.toMatchObject({
        ocspResponsesBase64: expect.any(String),
        crlDataBase64: expect.any(String),
      });
      await expect(service.fetchRevocationEvidence('', 'fingerprint')).resolves.toEqual({
        ocspResponsesBase64: null,
        crlDataBase64: null,
      });
    } finally {
      global.fetch = originalFetch;
    }
  });
});
