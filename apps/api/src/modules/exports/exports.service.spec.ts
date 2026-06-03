import { BadRequestException, ForbiddenException } from '@nestjs/common';
import * as fs from 'node:fs/promises';
import { ExportsService } from './exports.service';
import type { JwtPayloadUser } from '../auth/decorators/current-user.decorator';

jest.mock('node:fs/promises', () => ({
  mkdir: jest.fn(),
  writeFile: jest.fn(),
  readFile: jest.fn(),
  rename: jest.fn(),
}));

describe('ExportsService tenant scope enforcement', () => {
  const companyA = '11111111-1111-1111-1111-111111111111';
  const companyB = '22222222-2222-2222-2222-222222222222';
  const branchA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const branchB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  const makeService = () => {
    const db = {
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([]),
          }),
        }),
      }),
      insert: jest.fn().mockReturnValue({
        values: jest.fn().mockResolvedValue(undefined),
      }),
      transaction: jest.fn(),
    };
    const service = new ExportsService(
      db as any,
      { get: jest.fn((_key: string, fallback: unknown) => fallback) } as any,
      {} as any,
      {} as any,
    );
    return { service, db };
  };

  const user = (permissions: string[]): JwtPayloadUser => ({
    sub: '99999999-9999-9999-9999-999999999999',
    email: 'auditor@ifms.test',
    permissions,
  });

  it('persists resolved create scope from single company and branch permissions without mutating params', async () => {
    const { service, db } = makeService();
    const params = { dateFrom: '2026-01-01' };
    const insertedValues: Array<Record<string, unknown>> = [];
    const createdAt = new Date('2026-01-02T00:00:00Z');
    const tx = {
      insert: jest.fn().mockReturnValue({
        values: jest.fn((values: Record<string, unknown>) => {
          insertedValues.push(values);
          return {
            returning: jest.fn().mockResolvedValue([
              {
                id: '33333333-3333-3333-3333-333333333333',
                ...values,
                fileName: null,
                mimeType: null,
                sizeBytes: null,
                sha256Hash: null,
                isSigned: false,
                pdfaLevel: null,
                signatureProfile: null,
                signedAt: null,
                signedByUserId: null,
                tsaProvider: null,
                legalHold: false,
                legalHoldReason: null,
                revokedAt: null,
                createdAt,
                completedAt: null,
              },
            ]),
          };
        }),
      }),
    };
    db.transaction.mockImplementation(async (fn: (txArg: typeof tx) => Promise<unknown>) => fn(tx));

    await service.createExport(
      {
        format: 'csv',
        exportType: 'reports.overview',
        params,
      },
      user([`company:${companyA}`, `branch:${branchA}`]),
    );

    expect(insertedValues[0]).toMatchObject({
      companyId: companyA,
      branchId: branchA,
      paramsJson: expect.objectContaining({
        companyId: companyA,
        branchId: branchA,
      }),
    });
    expect(params).toEqual({ dateFrom: '2026-01-01' });
  });

  it('rejects create when multiple branch scopes are assigned and branchId is omitted', () => {
    const { service } = makeService();
    const scope = (service as any).parseScope(
      user([`company:${companyA}`, `branch:${branchA}`, `branch:${branchB}`]),
    );

    expect(() =>
      (service as any).resolveCreateScope(scope, { companyId: companyA, branchId: undefined }),
    ).toThrow(BadRequestException);
  });

  it('rejects create when the requested company is outside JWT scope', () => {
    const { service } = makeService();
    const scope = (service as any).parseScope(user([`company:${companyA}`, `branch:${branchA}`]));

    expect(() =>
      (service as any).resolveCreateScope(scope, { companyId: companyB, branchId: branchA }),
    ).toThrow(ForbiddenException);
  });

  it('requires company scope when only branch permissions are assigned', () => {
    const { service } = makeService();
    const scope = (service as any).parseScope(user([`branch:${branchA}`]));

    expect(() => (service as any).resolveCreateScope(scope, {})).toThrow(BadRequestException);
  });

  it('rejects list filters outside JWT tenant scope before querying', async () => {
    const { service, db } = makeService();

    await expect(
      service.listExports(user([`company:${companyA}`, `branch:${branchA}`]), {
        limit: 20,
        companyId: companyB,
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('rejects downloads when the JWT has no tenant scope before querying', async () => {
    const { service, db } = makeService();

    await expect(
      service.getDownloadMeta(user(['reports:read']), '33333333-3333-3333-3333-333333333333'),
    ).rejects.toThrow(ForbiddenException);
    expect(db.select).not.toHaveBeenCalled();
  });
});

describe('ExportsService verification and pipeline branches', () => {
  const now = new Date('2026-01-02T00:00:00.000Z');
  const future = new Date('2099-01-02T00:00:00.000Z');
  const companyId = '11111111-1111-1111-1111-111111111111';
  const branchId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const user = (permissions: string[] = [`company:${companyId}`, `branch:${branchId}`, 'reports:read']): JwtPayloadUser => ({
    sub: '99999999-9999-9999-9999-999999999999',
    email: 'auditor@ifms.test',
    permissions,
  });

  const baseRow = (overrides: Record<string, unknown> = {}) => ({
    id: '33333333-3333-3333-3333-333333333333',
    companyId,
    branchId,
    userId: user().sub,
    exportType: 'reports.overview',
    format: 'pdf',
    paramsJson: {},
    fileName: '33333333-3333-3333-3333-333333333333.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 123,
    sha256Hash: 'a'.repeat(64),
    verificationToken: 'facefeed12345678',
    status: 'ready',
    isSigned: true,
    pdfaLevel: 'PDF/A-2b',
    signatureProfile: 'PAdES-B-LT',
    signingStatus: 'signed',
    signedAt: now,
    signedByUserId: null,
    tsaStatus: 'stamped',
    tsaProvider: 'tsa',
    verificationLevel: 'ltv',
    legalHold: false,
    legalHoldReason: null,
    retentionUntil: future,
    revokedAt: null,
    createdAt: now,
    completedAt: now,
    expiresAt: future,
    ...overrides,
  });

  const makeDb = (selectQueue: unknown[][] = [], updateQueue: unknown[][] = []) => {
    const updateSets: Array<Record<string, unknown>> = [];
    const insertValues: Array<Record<string, unknown>> = [];
    const makeSelectChain = () => {
      const chain: any = {};
      chain.from = jest.fn(() => chain);
      chain.where = jest.fn(() => chain);
      chain.orderBy = jest.fn(() => chain);
      chain.limit = jest.fn(async () => selectQueue.shift() ?? []);
      return chain;
    };
    const makeUpdateChain = () => {
      const chain: any = {};
      chain.set = jest.fn((values: Record<string, unknown>) => {
        updateSets.push(values);
        return chain;
      });
      chain.where = jest.fn(() => chain);
      chain.returning = jest.fn(async () => updateQueue.shift() ?? []);
      return chain;
    };
    const makeWriteChain = () => {
      const chain: any = {};
      chain.values = jest.fn((values: Record<string, unknown>) => {
        insertValues.push(values);
        return chain;
      });
      chain.where = jest.fn(() => chain);
      return chain;
    };
    return {
      select: jest.fn(() => makeSelectChain()),
      update: jest.fn(() => makeUpdateChain()),
      insert: jest.fn(() => makeWriteChain()),
      delete: jest.fn(() => makeWriteChain()),
      transaction: jest.fn(),
      updateSets,
      insertValues,
    };
  };

  const makeService = (
    db = makeDb(),
    config: Record<string, unknown> = {},
    renderer: Record<string, unknown> = {},
    compliance: Record<string, unknown> = {},
  ) =>
    new ExportsService(
      db as any,
      {
        get: jest.fn((key: string, fallback?: unknown) =>
          Object.prototype.hasOwnProperty.call(config, key) ? config[key] : fallback,
        ),
      } as any,
      {
        buildVerificationReceiptPdf: jest.fn().mockResolvedValue(Buffer.from('%PDF receipt')),
        sha256: jest.fn(() => 'hash'),
        renderExport: jest.fn().mockResolvedValue({ buffer: Buffer.from('rendered'), mimeType: 'text/csv' }),
        ...renderer,
      } as any,
      {
        signDocument: jest.fn(),
        requestTimestamp: jest.fn(),
        fetchRevocationEvidence: jest.fn(),
        ...compliance,
      } as any,
    );

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('returns invalid verification results for missing, expired, unready, and revoked exports', async () => {
    await expect(makeService(makeDb([[]])).verifyByToken('missing')).resolves.toEqual({ valid: false });

    for (const row of [
      baseRow({ expiresAt: new Date('2000-01-01T00:00:00.000Z') }),
      baseRow({ status: 'queued' }),
      baseRow({ revokedAt: new Date('2020-01-01T00:00:00.000Z') }),
    ]) {
      await expect(makeService(makeDb([[row], []])).verifyByToken('token')).resolves.toMatchObject({
        valid: false,
        verificationLevel: 'ltv',
      });
    }
  });

  it('returns signed verification metadata for a ready export token', async () => {
    const signature = {
      signerSubject: 'IFMS Signer',
      certFingerprintSha256: 'fingerprint',
      timestampedAt: now,
    };

    await expect(makeService(makeDb([[baseRow()], [signature]])).verifyByToken('token')).resolves.toMatchObject({
      valid: true,
      exportType: 'reports.overview',
      sha256: 'a'.repeat(64),
      signature: {
        signer: 'IFMS Signer',
        certFingerprint: 'fingerprint',
        signedAt: now,
        timestampedAt: now,
        tsaProvider: 'tsa',
      },
    });
  });

  it('builds verification receipts with fallback metadata and rejects unknown receipt tokens', async () => {
    const renderer = {
      buildVerificationReceiptPdf: jest.fn().mockResolvedValue(Buffer.from('%PDF receipt')),
    };
    const row = baseRow({
      completedAt: null,
      expiresAt: null,
      format: 'csv',
      sha256Hash: null,
      signedAt: null,
      tsaProvider: null,
      verificationLevel: null,
    });

    await expect(
      makeService(makeDb([[row], []]), {}, renderer).getVerificationReceiptPdfByToken('token'),
    ).resolves.toEqual(Buffer.from('%PDF receipt'));
    expect(renderer.buildVerificationReceiptPdf).toHaveBeenCalledWith(
      expect.objectContaining({
        exportId: row.id,
        format: 'csv',
        verificationLevel: 'basic',
        sha256Hash: null,
        generatedAt: now,
        expiresAt: null,
        signer: null,
        certFingerprint: null,
        signedAt: null,
        timestampedAt: null,
        tsaProvider: null,
      }),
    );

    await expect(makeService(makeDb([[]])).getVerificationReceiptPdfByToken('missing')).rejects.toThrow(
      'Verification token not found',
    );
  });

  it('sanitizes public verification tokens and renders awaiting-token state', async () => {
    const service = makeService();
    jest.spyOn(service, 'verifyByToken').mockResolvedValue({
      valid: true,
      verificationLevel: 'signed',
      sha256: 'hash',
      exportType: 'reports.overview',
      expiresAt: future,
      signature: {
        signer: 'IFMS Signer',
        certFingerprint: 'fingerprint',
        signedAt: now,
        timestampedAt: now,
      },
    } as any);

    const html = await service.buildPublicVerificationPage('face!!1234');
    expect(service.verifyByToken).toHaveBeenCalledWith('face1234');
    expect(html).toContain('Valid');
    expect(html).toContain('IFMS Signer');

    jest.mocked(service.verifyByToken).mockClear();
    const awaiting = await service.buildPublicVerificationPage();
    expect(service.verifyByToken).not.toHaveBeenCalled();
    expect(awaiting).toContain('Awaiting token');

    jest.mocked(service.verifyByToken).mockResolvedValue({ valid: false, verificationLevel: 'basic' } as any);
    const invalid = await service.buildPublicVerificationPage('bad');
    expect(invalid).toContain('Expired / Revoked / Invalid');
    expect(invalid).toContain('<div class="value">basic</div>');
  });

  it('guards download metadata and legal hold update branches before file access', async () => {
    const service = makeService();
    jest.spyOn(service as any, 'getExportForUser').mockResolvedValueOnce(baseRow({ status: 'queued' }));
    await expect(service.getDownloadMeta(user(), 'export-1')).rejects.toThrow(BadRequestException);

    jest.spyOn(service as any, 'getExportForUser').mockResolvedValueOnce(baseRow({ fileName: null }));
    await expect(service.getDownloadMeta(user(), 'export-1')).rejects.toThrow('Export file metadata not found.');

    jest.spyOn(service as any, 'getExportForUser').mockResolvedValueOnce(baseRow());
    await expect(
      service.setLegalHold(user([`company:${companyId}`, `branch:${branchId}`]), 'export-1', true),
    ).rejects.toThrow(ForbiddenException);
  });

  it('returns ready download defaults and records legal hold enable and disable payloads', async () => {
    const db = makeDb([[]]);
    const service = makeService(db, { EXPORT_STORAGE_DIR: 'C:\\ifms-exports' });
    jest.spyOn(service as any, 'getExportForUser').mockResolvedValueOnce(
      baseRow({
        fileName: 'ready.csv',
        mimeType: null,
        sizeBytes: null,
        status: 'ready',
      }),
    );

    await expect(service.getDownloadMeta(user(), 'export-1')).resolves.toMatchObject({
      fileName: 'ready.csv',
      mimeType: 'application/octet-stream',
      sizeBytes: 0,
    });

    jest.spyOn(service as any, 'getExportForUser').mockResolvedValueOnce(baseRow()).mockResolvedValueOnce(baseRow());
    await service.setLegalHold(user([`company:${companyId}`, `branch:${branchId}`, 'reports:refresh']), 'export-1', true);
    await service.setLegalHold(
      user([`company:${companyId}`, `branch:${branchId}`, 'reports:refresh']),
      'export-1',
      false,
      'release',
    );

    expect(db.updateSets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ legalHold: true, legalHoldReason: 'Manual legal hold' }),
        expect.objectContaining({ legalHold: false, legalHoldReason: null }),
      ]),
    );
    expect(db.insertValues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ eventType: 'legal_hold.enabled' }),
        expect.objectContaining({ eventType: 'legal_hold.disabled' }),
      ]),
    );
  });

  it('lists exports for managers across multiple tenant scopes without a user filter', async () => {
    const db = makeDb([[baseRow({ id: 'export-manager' })]]);
    const manager = user([
      `company:${companyId}`,
      'company:22222222-2222-2222-2222-222222222222',
      `branch:${branchId}`,
      'branch:bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      'reports:refresh',
    ]);

    await expect(makeService(db).listExports(manager, {})).resolves.toEqual([
      expect.objectContaining({ id: 'export-manager' }),
    ]);
  });

  it('claims no jobs when the outbox query is empty and returns locked ids otherwise', async () => {
    await expect(makeService(makeDb([[]])).claimPendingJobs('worker-1')).resolves.toEqual([]);

    const db = makeDb([[{ id: 'job-1' }, { id: 'job-2' }]], [[{ id: 'job-1' }]]);
    await expect(makeService(db).claimPendingJobs('worker-1', 2)).resolves.toEqual(['job-1']);
    expect(db.update).toHaveBeenCalled();
  });

  it('processExportJob exits cleanly for missing jobs and deletes orphaned jobs', async () => {
    const missingJobDb = makeDb([[]]);
    await expect(makeService(missingJobDb).processExportJob('job-1')).resolves.toBeUndefined();
    expect(missingJobDb.delete).not.toHaveBeenCalled();

    const orphanDb = makeDb([[{ id: 'job-1', exportId: 'export-1' }], []]);
    await expect(makeService(orphanDb).processExportJob('job-1')).resolves.toBeUndefined();
    expect(orphanDb.delete).toHaveBeenCalled();
  });

  it('marks export and outbox rows failed when a pipeline stage throws', async () => {
    const db = makeDb([
      [{ id: 'job-1', exportId: 'export-1', stage: 'generate', attempts: 2 }],
      [baseRow({ id: 'export-1' })],
    ]);
    const service = makeService(db);
    jest.spyOn(service as any, 'executeStage').mockRejectedValue(new Error('render failed'));

    await service.processExportJob('job-1');

    expect(db.update).toHaveBeenCalledTimes(3);
    expect(db.insert).toHaveBeenCalled();
  });

  it('dispatches every pipeline stage handler including the publish default', async () => {
    const service = makeService();
    const row = baseRow({ id: 'export-1' });
    const job = { id: 'job-1', artifactPath: 'artifact.tmp' };
    const handlerResults = {
      handleGenerateStage: { complete: false },
      handleFinalizeStage: { complete: false },
      handleSignStage: { complete: false },
      handleTimestampStage: { complete: false },
      handleLtvStage: { complete: false },
      handlePublishStage: { complete: true },
    };

    for (const [name, result] of Object.entries(handlerResults)) {
      jest.spyOn(service as any, name).mockResolvedValue(result);
    }

    await expect((service as any).executeStage(row, job, 'generate')).resolves.toEqual(handlerResults.handleGenerateStage);
    await expect((service as any).executeStage(row, job, 'finalize')).resolves.toEqual(handlerResults.handleFinalizeStage);
    await expect((service as any).executeStage(row, job, 'sign_pdf')).resolves.toEqual(handlerResults.handleSignStage);
    await expect((service as any).executeStage(row, job, 'timestamp_pdf')).resolves.toEqual(handlerResults.handleTimestampStage);
    await expect((service as any).executeStage(row, job, 'ltv_embed')).resolves.toEqual(handlerResults.handleLtvStage);
    await expect((service as any).executeStage(row, job, 'publish')).resolves.toEqual(handlerResults.handlePublishStage);
    await expect((service as any).executeStage(row, job, 'unknown')).resolves.toEqual(handlerResults.handlePublishStage);

    expect((service as any).handleGenerateStage).toHaveBeenCalledWith(row, 'job-1');
    expect((service as any).handleFinalizeStage).toHaveBeenCalledWith(row, 'job-1', 'artifact.tmp');
    expect((service as any).handlePublishStage).toHaveBeenCalledTimes(2);
  });

  it('renders a generate stage artifact with null params and branch fallbacks', async () => {
    const db = makeDb();
    const renderer = {
      renderExport: jest.fn().mockResolvedValue({ buffer: Buffer.from('csv'), mimeType: 'text/csv' }),
    };
    const service = makeService(db, { EXPORT_STORAGE_DIR: 'C:\\ifms-exports' }, renderer);
    jest.mocked(fs.mkdir).mockResolvedValue(undefined as any);
    jest.mocked(fs.writeFile).mockResolvedValue(undefined as any);

    await expect(
      (service as any).handleGenerateStage(baseRow({ format: 'csv', paramsJson: null, branchId: null }), 'job-1'),
    ).resolves.toEqual({ complete: false });

    expect(renderer.renderExport).toHaveBeenCalledWith(
      expect.objectContaining({
        format: 'csv',
        params: {},
        scope: expect.objectContaining({ branchId: undefined, branchIds: [] }),
      }),
    );
    expect(fs.mkdir).toHaveBeenCalledWith(expect.stringContaining('.tmp'), { recursive: true });
    expect(fs.writeFile).toHaveBeenCalledWith(expect.stringContaining('.csv.tmp'), Buffer.from('csv'));
    expect(db.updateSets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stage: 'finalize', artifactPath: expect.stringContaining('.csv.tmp') }),
      ]),
    );
  });

  it('finalizes PDF and CSV artifacts with signing and publish next-stage branches', async () => {
    const pdfDb = makeDb();
    const service = makeService(
      pdfDb,
      { EXPORT_STORAGE_DIR: 'C:\\ifms-exports', EXPORT_SIGN_REGULATORY_ONLY: true },
      { sha256: jest.fn(() => 'pdf-hash') },
    );
    jest.mocked(fs.mkdir).mockResolvedValue(undefined as any);
    jest.mocked(fs.readFile).mockResolvedValue(Buffer.from('pdf bytes') as any);
    jest.mocked(fs.rename).mockResolvedValue(undefined as any);

    await expect(
      (service as any).handleFinalizeStage(baseRow({ format: 'pdf' }), 'job-1', 'C:\\tmp\\artifact.pdf'),
    ).resolves.toEqual({
      complete: false,
    });

    expect(fs.rename).toHaveBeenCalledWith('C:\\tmp\\artifact.pdf', expect.stringContaining('.pdf'));
    expect(pdfDb.updateSets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          mimeType: 'application/pdf',
          sha256Hash: 'pdf-hash',
          verificationLevel: 'basic',
        }),
        expect.objectContaining({ stage: 'sign_pdf' }),
      ]),
    );

    jest.clearAllMocks();
    const csvDb = makeDb();
    const csvService = makeService(
      csvDb,
      { EXPORT_STORAGE_DIR: 'C:\\ifms-exports' },
      { sha256: jest.fn(() => 'csv-hash') },
    );
    jest.mocked(fs.mkdir).mockResolvedValue(undefined as any);
    jest.mocked(fs.readFile).mockResolvedValue(Buffer.from('csv bytes') as any);
    const renameSpy = jest.mocked(fs.rename).mockResolvedValue(undefined as any);

    await expect((csvService as any).handleFinalizeStage(baseRow({ format: 'csv' }), 'job-2', null)).resolves.toEqual({
      complete: false,
    });

    expect(renameSpy).not.toHaveBeenCalled();
    expect(csvDb.updateSets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ mimeType: 'text/csv; charset=utf-8', sha256Hash: 'csv-hash' }),
        expect.objectContaining({ stage: 'publish' }),
      ]),
    );
  });

  it('signs PDFs, upserts new signatures, and advances to timestamping', async () => {
    const db = makeDb([[]]);
    const compliance = {
      signDocument: jest.fn().mockResolvedValue({
        signerSubject: 'Signer',
        certFingerprintSha256: 'fingerprint',
        certChainPem: 'cert-chain',
        signatureBytesBase64: 'signature',
        signatureProfile: 'PAdES-B-LT',
        pdfaLevel: 'PDF/A-2b',
      }),
    };
    const service = makeService(db, { EXPORT_STORAGE_DIR: 'C:\\ifms-exports' }, {}, compliance);
    jest.mocked(fs.readFile).mockResolvedValue(Buffer.from('pdf bytes') as any);

    await expect((service as any).handleSignStage(baseRow({ id: 'export-1' }), 'job-1')).resolves.toEqual({
      complete: false,
    });

    expect(compliance.signDocument).toHaveBeenCalledWith(Buffer.from('pdf bytes'), 'export-1');
    expect(db.insertValues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          exportId: 'export-1',
          signerSubject: 'Signer',
          signatureBytesBase64: 'signature',
          timestampTokenBase64: null,
        }),
      ]),
    );
    expect(db.updateSets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ signingStatus: 'signed', verificationLevel: 'signed' }),
        expect.objectContaining({ stage: 'timestamp_pdf' }),
      ]),
    );
  });

  it('continues after non-strict signing failures but rethrows strict failures', async () => {
    const nonStrictDb = makeDb();
    const nonStrict = makeService(nonStrictDb, { EXPORT_STORAGE_DIR: 'C:\\ifms-exports' });
    jest.mocked(fs.readFile).mockRejectedValue(new Error('missing file') as never);

    await expect((nonStrict as any).handleSignStage(baseRow({ id: 'export-1' }), 'job-1')).resolves.toEqual({
      complete: false,
    });
    expect(nonStrictDb.updateSets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ isSigned: false, signingStatus: 'failed', verificationLevel: 'basic' }),
        expect.objectContaining({ stage: 'timestamp_pdf' }),
      ]),
    );

    jest.clearAllMocks();
    const strict = makeService(makeDb(), { EXPORT_STORAGE_DIR: 'C:\\ifms-exports', EXPORT_STRICT_SIGNING_REQUIRED: true });
    jest.mocked(fs.readFile).mockRejectedValue(new Error('strict missing file') as never);

    await expect((strict as any).handleSignStage(baseRow({ id: 'export-1' }), 'job-1')).rejects.toThrow(
      'strict missing file',
    );
  });

  it('timestamps signed exports and keeps basic verification for unsigned exports', async () => {
    const signedDb = makeDb([[{ id: 'sig-1', timestampTokenBase64: null, timestampedAt: null }]]);
    const timestampedAt = new Date('2026-01-03T00:00:00.000Z');
    const compliance = {
      requestTimestamp: jest.fn().mockResolvedValue({
        timestampTokenBase64: 'token',
        timestampedAt,
        tsaProvider: 'tsa-provider',
      }),
    };
    const service = makeService(signedDb, {}, {}, compliance);

    await expect((service as any).handleTimestampStage(baseRow({ id: 'export-1', isSigned: true }), 'job-1')).resolves.toEqual({
      complete: false,
    });
    expect(signedDb.updateSets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ timestampTokenBase64: 'token', timestampedAt }),
        expect.objectContaining({ tsaStatus: 'stamped', verificationLevel: 'signed_timestamped' }),
        expect.objectContaining({ stage: 'ltv_embed' }),
      ]),
    );

    const unsignedDb = makeDb([[{ id: 'sig-2', timestampTokenBase64: null, timestampedAt: null }]]);
    const unsignedService = makeService(unsignedDb, {}, {}, compliance);
    await expect((unsignedService as any).handleTimestampStage(baseRow({ id: 'export-2', isSigned: false }), 'job-2')).resolves.toEqual({
      complete: false,
    });
    expect(unsignedDb.updateSets).toEqual(
      expect.arrayContaining([expect.objectContaining({ tsaStatus: 'stamped', verificationLevel: 'basic' })]),
    );
  });

  it('handles timestamp failures according to strict signing mode', async () => {
    const nonStrictDb = makeDb();
    const service = makeService(nonStrictDb);

    await expect((service as any).handleTimestampStage(baseRow({ sha256Hash: null }), 'job-1')).resolves.toEqual({
      complete: false,
    });
    expect(nonStrictDb.updateSets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tsaStatus: 'failed' }),
        expect.objectContaining({ stage: 'ltv_embed' }),
      ]),
    );

    const strict = makeService(makeDb(), { EXPORT_STRICT_SIGNING_REQUIRED: true });
    await expect((strict as any).handleTimestampStage(baseRow({ sha256Hash: null }), 'job-2')).rejects.toThrow(
      'has no SHA-256 hash',
    );
  });

  it('embeds LTV evidence when present and always advances to publish', async () => {
    const sig = {
      id: 'sig-1',
      certChainPem: 'cert-chain',
      certFingerprintSha256: 'fingerprint',
      ocspResponsesBase64: null,
      crlDataBase64: null,
    };
    const db = makeDb([[sig], [sig]]);
    const compliance = {
      fetchRevocationEvidence: jest.fn().mockResolvedValue({
        ocspResponsesBase64: 'ocsp',
        crlDataBase64: null,
      }),
    };
    const service = makeService(db, {}, {}, compliance);

    await expect((service as any).handleLtvStage(baseRow({ id: 'export-1' }), 'job-1')).resolves.toEqual({
      complete: false,
    });

    expect(compliance.fetchRevocationEvidence).toHaveBeenCalledWith('cert-chain', 'fingerprint');
    expect(db.updateSets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ocspResponsesBase64: 'ocsp', crlDataBase64: null }),
        expect.objectContaining({ verificationLevel: 'ltv' }),
        expect.objectContaining({ stage: 'publish' }),
      ]),
    );

    const emptyDb = makeDb([[]]);
    await expect((makeService(emptyDb) as any).handleLtvStage(baseRow({ id: 'export-2' }), 'job-2')).resolves.toEqual({
      complete: false,
    });
    expect(emptyDb.updateSets).toEqual(expect.arrayContaining([expect.objectContaining({ stage: 'publish' })]));
  });

  it('updates existing signatures while preserving omitted fields and no-ops without a signature', async () => {
    const existing = {
      id: 'sig-1',
      signatureBytesBase64: 'old-signature',
      timestampTokenBase64: 'old-token',
      timestampedAt: now,
      ocspResponsesBase64: 'old-ocsp',
      crlDataBase64: 'old-crl',
    };
    const db = makeDb([[existing], [existing], []]);
    const service = makeService(db);

    await (service as any).upsertSignature('export-1', {
      signerSubject: 'New Signer',
      certFingerprintSha256: 'new-fingerprint',
      certChainPem: 'new-cert',
    });
    await (service as any).updateLatestSignature('export-1', { crlDataBase64: 'new-crl' });
    await (service as any).updateLatestSignature('export-missing', { timestampTokenBase64: 'ignored' });

    expect(db.updateSets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          signerSubject: 'New Signer',
          signatureBytesBase64: 'old-signature',
          timestampTokenBase64: 'old-token',
          ocspResponsesBase64: 'old-ocsp',
        }),
        expect.objectContaining({
          timestampTokenBase64: 'old-token',
          timestampedAt: now,
          ocspResponsesBase64: 'old-ocsp',
          crlDataBase64: 'new-crl',
        }),
      ]),
    );
  });

  it('resolves signing and retention policy branches directly', async () => {
    await expect((makeService(makeDb(), { EXPORT_SIGN_REGULATORY_ONLY: false }) as any).shouldSignExport('tables.any')).resolves.toBe(
      true,
    );
    await expect((makeService(makeDb(), { EXPORT_SIGN_REGULATORY_ONLY: true }) as any).shouldSignExport('tables.any')).resolves.toBe(
      false,
    );
    await expect(
      (makeService(makeDb([[{ retentionDays: 90 }]]), { EXPORT_DEFAULT_RETENTION_DAYS: 30 }) as any).resolveRetentionDays(
        'reports.overview',
      ),
    ).resolves.toBe(90);
    await expect(
      (makeService(makeDb([[{ retentionDays: 0 }]]), { EXPORT_DEFAULT_RETENTION_DAYS: 30 }) as any).resolveRetentionDays(
        'reports.overview',
      ),
    ).resolves.toBe(30);
  });
});
