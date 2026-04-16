import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, desc, eq, isNull, lte, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { randomBytes } from 'node:crypto';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import type * as schema from '../../database/schema';
import { DRIZZLE } from '../../database/database.module';
import {
  EXPORT_PIPELINE_STAGE,
  EXPORT_SIGNING_STATUS,
  EXPORT_STATUS,
  EXPORT_TSA_STATUS,
  EXPORT_VERIFICATION_LEVEL,
  exportAuditEvents,
  exportOutbox,
  exportRetentionPolicies,
  exportSignatures,
  exportsTable,
} from '../../database/schema/exports/exports';
import type { JwtPayloadUser } from '../auth/decorators/current-user.decorator';
import type { CreateExportDto } from './dto/create-export.dto';
import { extractTenantScope } from '../../common/helpers/scope.helper';
import type { ListExportsQueryDto } from './dto/list-exports-query.dto';
import type { ExportAuditContext, ExportPipelineStage, ExportScope, ExportSignatureSummary } from './exports.types';
import { ExportsRendererService } from './exports.renderer.service';
import { ExportsComplianceService } from './exports.compliance.service';

@Injectable()
export class ExportsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    private readonly config: ConfigService,
    private readonly renderer: ExportsRendererService,
    private readonly compliance: ExportsComplianceService,
  ) {}

  async createExport(dto: CreateExportDto, user: JwtPayloadUser, audit?: ExportAuditContext) {
    const scope = this.parseScope(user);
    const requestedCompany = this.getStringParam(dto.params, 'companyId') ?? scope.companyId;
    const requestedBranch = this.getStringParam(dto.params, 'branchId') ?? scope.branchId;

    if (!requestedCompany) {
      throw new BadRequestException('companyId is required in params or permission scope.');
    }

    if (scope.companyId && scope.companyId !== requestedCompany) {
      throw new ForbiddenException('Requested company is outside your access scope.');
    }

    if (scope.branchId && requestedBranch && scope.branchId !== requestedBranch) {
      throw new ForbiddenException('Requested branch is outside your access scope.');
    }

    const verificationToken = randomBytes(32).toString('hex');
    const expiresHours = this.config.get<number>('EXPORT_EXPIRES_HOURS', 72);
    const expiresAt = new Date(Date.now() + expiresHours * 60 * 60 * 1000);
    const retentionDays = await this.resolveRetentionDays(dto.exportType);
    const retentionUntil = new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000);
    const shouldSign = dto.format === 'pdf' ? await this.shouldSignExport(dto.exportType) : false;

    const [inserted] = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(exportsTable)
        .values({
          companyId: requestedCompany,
          branchId: requestedBranch ?? null,
          userId: user.sub,
          exportType: dto.exportType,
          format: dto.format,
          paramsJson: {
            ...(dto.params ?? {}),
            _clientContext: dto.clientContext ?? {},
          },
          verificationToken,
          status: EXPORT_STATUS.QUEUED,
          signingStatus: shouldSign ? EXPORT_SIGNING_STATUS.QUEUED : EXPORT_SIGNING_STATUS.FAILED,
          tsaStatus: shouldSign ? EXPORT_TSA_STATUS.QUEUED : EXPORT_TSA_STATUS.FAILED,
          verificationLevel: EXPORT_VERIFICATION_LEVEL.BASIC,
          retentionUntil,
          expiresAt,
        })
        .returning();

      await tx.insert(exportOutbox).values({ exportId: row.id, stage: EXPORT_PIPELINE_STAGE.GENERATE });
      return [row];
    });

    await this.writeAuditEvent(inserted.id, 'export.created', audit, {
      exportType: inserted.exportType,
      format: inserted.format,
      retentionUntil,
      requestedFromUrl: dto.clientContext?.requestedFromUrl,
    });

    return this.toExportResponse(inserted);
  }

  async listExports(user: JwtPayloadUser, query: ListExportsQueryDto) {
    const limit = query.limit ?? 20;
    const scope = this.parseScope(user);

    const rows = await this.db
      .select()
      .from(exportsTable)
      .where(this.buildListScopePredicate(user, scope))
      .orderBy(desc(exportsTable.createdAt))
      .limit(limit);

    return rows.map((r) => this.toExportResponse(r));
  }

  async getExport(user: JwtPayloadUser, exportId: string) {
    const row = await this.getExportForUser(user, exportId);
    return this.toExportResponse(row);
  }

  async getDownloadMeta(user: JwtPayloadUser, exportId: string) {
    const row = await this.getExportForUser(user, exportId);
    if (row.status !== EXPORT_STATUS.READY) {
      throw new BadRequestException('Export is not ready yet.');
    }
    if (!row.fileName) {
      throw new NotFoundException('Export file metadata not found.');
    }

    const fullPath = path.join(this.getStorageDir(), row.fileName);
    return {
      filePath: fullPath,
      fileName: row.fileName,
      mimeType: row.mimeType ?? 'application/octet-stream',
      sizeBytes: row.sizeBytes ?? 0,
    };
  }

  async getVerificationReceiptPdf(user: JwtPayloadUser, exportId: string): Promise<Buffer> {
    const row = await this.getExportForUser(user, exportId);
    const [signature] = await this.db
      .select()
      .from(exportSignatures)
      .where(eq(exportSignatures.exportId, row.id))
      .orderBy(desc(exportSignatures.createdAt))
      .limit(1);

    return this.renderer.buildVerificationReceiptPdf({
      exportId: row.id,
      exportType: row.exportType,
      format: row.format as 'pdf' | 'csv',
      verificationToken: row.verificationToken,
      verificationLevel: row.verificationLevel ?? EXPORT_VERIFICATION_LEVEL.BASIC,
      sha256Hash: row.sha256Hash,
      generatedAt: row.completedAt ?? row.createdAt,
      expiresAt: row.expiresAt,
      signer: signature?.signerSubject ?? null,
      certFingerprint: signature?.certFingerprintSha256 ?? null,
      signedAt: row.signedAt,
      timestampedAt: signature?.timestampedAt ?? null,
      tsaProvider: row.tsaProvider,
    });
  }

  async getVerificationReceiptPdfByToken(token: string): Promise<Buffer> {
    const [row] = await this.db
      .select()
      .from(exportsTable)
      .where(eq(exportsTable.verificationToken, token))
      .limit(1);

    if (!row) {
      throw new NotFoundException('Verification token not found');
    }

    const [signature] = await this.db
      .select()
      .from(exportSignatures)
      .where(eq(exportSignatures.exportId, row.id))
      .orderBy(desc(exportSignatures.createdAt))
      .limit(1);

    return this.renderer.buildVerificationReceiptPdf({
      exportId: row.id,
      exportType: row.exportType,
      format: row.format as 'pdf' | 'csv',
      verificationToken: row.verificationToken,
      verificationLevel: row.verificationLevel ?? EXPORT_VERIFICATION_LEVEL.BASIC,
      sha256Hash: row.sha256Hash,
      generatedAt: row.completedAt ?? row.createdAt,
      expiresAt: row.expiresAt,
      signer: signature?.signerSubject ?? null,
      certFingerprint: signature?.certFingerprintSha256 ?? null,
      signedAt: row.signedAt,
      timestampedAt: signature?.timestampedAt ?? null,
      tsaProvider: row.tsaProvider,
    });
  }

  async setLegalHold(user: JwtPayloadUser, exportId: string, enabled: boolean, reason?: string, audit?: ExportAuditContext) {
    const row = await this.getExportForUser(user, exportId);
    if (!user.permissions.includes('reports:refresh')) {
      throw new ForbiddenException('Only managers can modify legal hold state.');
    }

    await this.db
      .update(exportsTable)
      .set({
        legalHold: enabled,
        legalHoldReason: enabled ? reason ?? 'Manual legal hold' : null,
      })
      .where(eq(exportsTable.id, row.id));

    await this.writeAuditEvent(row.id, enabled ? 'legal_hold.enabled' : 'legal_hold.disabled', audit, {
      reason: reason ?? null,
    });

    const [updated] = await this.db.select().from(exportsTable).where(eq(exportsTable.id, row.id)).limit(1);
    return this.toExportResponse(updated ?? row);
  }

  async verifyByToken(token: string) {
    const [row] = await this.db
      .select()
      .from(exportsTable)
      .where(eq(exportsTable.verificationToken, token))
      .limit(1);

    if (!row) return { valid: false };

    const [signature] = await this.db
      .select()
      .from(exportSignatures)
      .where(eq(exportSignatures.exportId, row.id))
      .orderBy(desc(exportSignatures.createdAt))
      .limit(1);

    const now = new Date();
    const isExpired = row.expiresAt ? row.expiresAt.getTime() < now.getTime() : false;
    const isRevoked = row.revokedAt ? row.revokedAt.getTime() <= now.getTime() : false;
    const isReady = row.status === EXPORT_STATUS.READY;

    if (isExpired || !isReady || isRevoked) {
      return {
        valid: false,
        verificationLevel: row.verificationLevel ?? EXPORT_VERIFICATION_LEVEL.BASIC,
      };
    }

    return {
      valid: true,
      exportType: row.exportType,
      generatedAt: row.completedAt ?? row.createdAt,
      company: row.companyId,
      branch: row.branchId,
      sha256: row.sha256Hash,
      expiresAt: row.expiresAt,
      verificationLevel: row.verificationLevel ?? EXPORT_VERIFICATION_LEVEL.BASIC,
      signature: {
        signer: signature?.signerSubject ?? null,
        certFingerprint: signature?.certFingerprintSha256 ?? null,
        signedAt: row.signedAt,
        timestampedAt: signature?.timestampedAt ?? null,
        tsaProvider: row.tsaProvider,
      },
    };
  }

  async buildPublicVerificationPage(token?: string): Promise<string> {
    const sanitized = (token ?? '').replace(/[^a-fA-F0-9]/g, '').slice(0, 256);
    const result = sanitized ? await this.verifyByToken(sanitized) : null;
    const status = !result
      ? 'Awaiting token'
      : result.valid
      ? 'Valid'
      : 'Expired / Revoked / Invalid';

    const verificationLevel = result && 'verificationLevel' in result ? result.verificationLevel : 'basic';
    const signature = result && 'signature' in result ? result.signature : null;

    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>IFMS Report Verification</title>
    <style>
      body { font-family: Arial, sans-serif; background: #f8fafc; color: #0f172a; margin: 0; padding: 24px; }
      .card { max-width: 760px; margin: 0 auto; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; }
      .badge { display: inline-block; padding: 4px 10px; border-radius: 9999px; font-size: 12px; font-weight: 700; background: #e2e8f0; }
      .valid { background: #dcfce7; color: #166534; }
      .invalid { background: #ffe4e6; color: #9f1239; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 16px; margin-top: 16px; }
      .label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: .05em; }
      .value { font-size: 13px; font-weight: 600; word-break: break-word; }
      form { display: flex; gap: 8px; margin-bottom: 14px; }
      input { flex: 1; border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px; }
      button { border: 1px solid #334155; background: #0f172a; color: #fff; border-radius: 8px; padding: 10px 14px; font-weight: 700; cursor: pointer; }
    </style>
  </head>
  <body>
    <div class="card">
      <h2 style="margin:0 0 6px 0;">ITEMBA-ENERGIES • Report Verification</h2>
      <p style="margin:0 0 14px 0;color:#475569;">Paste verification token or scan report QR.</p>
      <form method="GET" action="/public/report/verify">
        <input type="text" name="token" value="${sanitized}" placeholder="verification token" />
        <button type="submit">Verify</button>
      </form>
      <div class="badge ${result?.valid ? 'valid' : 'invalid'}">${status}</div>
      <div class="grid">
        <div><div class="label">Verification Level</div><div class="value">${verificationLevel}</div></div>
        <div><div class="label">SHA-256</div><div class="value">${result && 'sha256' in result ? (result.sha256 ?? '-') : '-'}</div></div>
        <div><div class="label">Export Type</div><div class="value">${result && 'exportType' in result ? result.exportType : '-'}</div></div>
        <div><div class="label">Expires At</div><div class="value">${result && 'expiresAt' in result && result.expiresAt ? new Date(result.expiresAt as any).toISOString() : '-'}</div></div>
        <div><div class="label">Signer</div><div class="value">${signature?.signer ?? '-'}</div></div>
        <div><div class="label">Certificate Fingerprint</div><div class="value">${signature?.certFingerprint ?? '-'}</div></div>
        <div><div class="label">Signed At</div><div class="value">${signature?.signedAt ? new Date(signature.signedAt as any).toISOString() : '-'}</div></div>
        <div><div class="label">Timestamped At</div><div class="value">${signature?.timestampedAt ? new Date(signature.timestampedAt as any).toISOString() : '-'}</div></div>
      </div>
    </div>
  </body>
</html>`;
  }

  async processExportJob(outboxJobId: string): Promise<void> {
    const [job] = await this.db
      .select()
      .from(exportOutbox)
      .where(eq(exportOutbox.id, outboxJobId))
      .limit(1);

    if (!job) return;

    const [exportRow] = await this.db
      .select()
      .from(exportsTable)
      .where(eq(exportsTable.id, job.exportId))
      .limit(1);

    if (!exportRow) {
      await this.db.delete(exportOutbox).where(eq(exportOutbox.id, outboxJobId));
      return;
    }

    try {
      const currentStage = (job.stage ?? EXPORT_PIPELINE_STAGE.GENERATE) as ExportPipelineStage;
      await this.db
        .update(exportsTable)
        .set({ status: EXPORT_STATUS.PROCESSING })
        .where(eq(exportsTable.id, exportRow.id));

      const result = await this.executeStage(exportRow, job, currentStage);
      if (result.complete) {
        await this.db.delete(exportOutbox).where(eq(exportOutbox.id, outboxJobId));
      }
    } catch (error) {
      const attempts = (job.attempts ?? 0) + 1;
      const retryDelayMs = Math.min(60_000, attempts * 5_000);

      await this.db
        .update(exportsTable)
        .set({ status: EXPORT_STATUS.FAILED })
        .where(eq(exportsTable.id, exportRow.id));

      await this.db
        .update(exportOutbox)
        .set({
          attempts,
          lastError: error instanceof Error ? error.message : 'Unknown error',
          lockedAt: null,
          lockedBy: null,
          runAfter: new Date(Date.now() + retryDelayMs),
        })
        .where(eq(exportOutbox.id, outboxJobId));

      await this.writeAuditEvent(exportRow.id, 'pipeline.failed', undefined, {
        stage: job.stage,
        attempts,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private async executeStage(
    exportRow: typeof exportsTable.$inferSelect,
    job: typeof exportOutbox.$inferSelect,
    stage: ExportPipelineStage,
  ): Promise<{ complete: boolean }> {
    switch (stage) {
      case 'generate':
        return this.handleGenerateStage(exportRow, job.id);
      case 'finalize':
        return this.handleFinalizeStage(exportRow, job.id, job.artifactPath);
      case 'sign_pdf':
        return this.handleSignStage(exportRow, job.id);
      case 'timestamp_pdf':
        return this.handleTimestampStage(exportRow, job.id);
      case 'ltv_embed':
        return this.handleLtvStage(exportRow, job.id);
      case 'publish':
      default:
        return this.handlePublishStage(exportRow);
    }
  }

  private async handleGenerateStage(exportRow: typeof exportsTable.$inferSelect, outboxId: string): Promise<{ complete: boolean }> {
    const rendered = await this.renderer.renderExport({
      exportId: exportRow.id,
      exportType: exportRow.exportType,
      format: exportRow.format as 'pdf' | 'csv',
      params: (exportRow.paramsJson ?? {}) as Record<string, unknown>,
      verificationToken: exportRow.verificationToken,
      scope: {
        userId: exportRow.userId,
        permissions: [],
        companyId: exportRow.companyId,
        branchId: exportRow.branchId ?? undefined,
      },
      createdAt: exportRow.createdAt,
    });

    const ext = exportRow.format === 'pdf' ? 'pdf' : 'csv';
    const tempPath = this.getTempArtifactPath(exportRow.id, ext);
    await fs.mkdir(path.dirname(tempPath), { recursive: true });
    await fs.writeFile(tempPath, rendered.buffer);

    await this.db
      .update(exportOutbox)
      .set({
        stage: EXPORT_PIPELINE_STAGE.FINALIZE,
        artifactPath: tempPath,
        lockedAt: null,
        lockedBy: null,
        runAfter: new Date(),
      })
      .where(eq(exportOutbox.id, outboxId));

    await this.writeAuditEvent(exportRow.id, 'pipeline.generate.completed', undefined, {
      stage: 'generate',
      artifactPath: tempPath,
    });
    return { complete: false };
  }

  private async handleFinalizeStage(
    exportRow: typeof exportsTable.$inferSelect,
    outboxId: string,
    artifactPath: string | null,
  ): Promise<{ complete: boolean }> {
    const ext = exportRow.format === 'pdf' ? 'pdf' : 'csv';
    const fileName = `${exportRow.id}.${ext}`;
    const finalPath = path.join(this.getStorageDir(), fileName);
    await fs.mkdir(this.getStorageDir(), { recursive: true });

    const sourcePath = artifactPath ?? finalPath;
    const bytes = await fs.readFile(sourcePath);
    const hash = this.renderer.sha256(bytes);

    if (sourcePath !== finalPath) {
      await fs.rename(sourcePath, finalPath);
    }

    const shouldSign = exportRow.format === 'pdf' ? await this.shouldSignExport(exportRow.exportType) : false;
    const nextStage = exportRow.format === 'pdf' && shouldSign ? EXPORT_PIPELINE_STAGE.SIGN_PDF : EXPORT_PIPELINE_STAGE.PUBLISH;

    await this.db
      .update(exportsTable)
      .set({
        fileName,
        mimeType: exportRow.format === 'pdf' ? 'application/pdf' : 'text/csv; charset=utf-8',
        sizeBytes: bytes.length,
        sha256Hash: hash,
        verificationLevel: EXPORT_VERIFICATION_LEVEL.BASIC,
      })
      .where(eq(exportsTable.id, exportRow.id));

    await this.db
      .update(exportOutbox)
      .set({
        stage: nextStage,
        artifactPath: finalPath,
        lockedAt: null,
        lockedBy: null,
        runAfter: new Date(),
      })
      .where(eq(exportOutbox.id, outboxId));

    await this.writeAuditEvent(exportRow.id, 'pipeline.finalize.completed', undefined, {
      stage: 'finalize',
      nextStage,
      hash,
      fileName,
    });
    return { complete: false };
  }

  private async handleSignStage(exportRow: typeof exportsTable.$inferSelect, outboxId: string): Promise<{ complete: boolean }> {
    const strict = this.config.get<boolean>('EXPORT_STRICT_SIGNING_REQUIRED', false);
    const filePath = path.join(this.getStorageDir(), exportRow.fileName ?? `${exportRow.id}.pdf`);

    try {
      const bytes = await fs.readFile(filePath);
      const signResult = await this.compliance.signDocument(bytes, exportRow.id);

      await this.upsertSignature(exportRow.id, {
        signerSubject: signResult.signerSubject,
        certFingerprintSha256: signResult.certFingerprintSha256,
        certChainPem: signResult.certChainPem,
        signatureBytesBase64: signResult.signatureBytesBase64,
      });

      await this.db
        .update(exportsTable)
        .set({
          isSigned: true,
          pdfaLevel: signResult.pdfaLevel,
          signatureProfile: signResult.signatureProfile,
          signingStatus: EXPORT_SIGNING_STATUS.SIGNED,
          signedAt: new Date(),
          signedByUserId: exportRow.userId,
          verificationLevel: EXPORT_VERIFICATION_LEVEL.SIGNED,
        })
        .where(eq(exportsTable.id, exportRow.id));

      await this.writeAuditEvent(exportRow.id, 'pipeline.sign_pdf.completed', undefined, {
        stage: 'sign_pdf',
        profile: signResult.signatureProfile,
        pdfaLevel: signResult.pdfaLevel,
      });
    } catch (error) {
      await this.db
        .update(exportsTable)
        .set({
          isSigned: false,
          signingStatus: EXPORT_SIGNING_STATUS.FAILED,
          verificationLevel: EXPORT_VERIFICATION_LEVEL.BASIC,
        })
        .where(eq(exportsTable.id, exportRow.id));

      await this.writeAuditEvent(exportRow.id, 'pipeline.sign_pdf.failed', undefined, {
        stage: 'sign_pdf',
        error: error instanceof Error ? error.message : 'unknown signing error',
      });

      if (strict) {
        throw error;
      }
    }

    await this.db
      .update(exportOutbox)
      .set({
        stage: EXPORT_PIPELINE_STAGE.TIMESTAMP_PDF,
        lockedAt: null,
        lockedBy: null,
        runAfter: new Date(),
      })
      .where(eq(exportOutbox.id, outboxId));
    return { complete: false };
  }

  private async handleTimestampStage(exportRow: typeof exportsTable.$inferSelect, outboxId: string): Promise<{ complete: boolean }> {
    const strict = this.config.get<boolean>('EXPORT_STRICT_SIGNING_REQUIRED', false);
    try {
      const digest = exportRow.sha256Hash;
      if (!digest) {
        throw new BadRequestException(`Export ${exportRow.id} has no SHA-256 hash; cannot request timestamp`);
      }
      const ts = await this.compliance.requestTimestamp(digest);
      await this.updateLatestSignature(exportRow.id, {
        timestampTokenBase64: ts.timestampTokenBase64,
        timestampedAt: ts.timestampedAt,
      });

      await this.db
        .update(exportsTable)
        .set({
          tsaStatus: EXPORT_TSA_STATUS.STAMPED,
          tsaProvider: ts.tsaProvider,
          verificationLevel: exportRow.isSigned
            ? EXPORT_VERIFICATION_LEVEL.SIGNED_TIMESTAMPED
            : EXPORT_VERIFICATION_LEVEL.BASIC,
        })
        .where(eq(exportsTable.id, exportRow.id));

      await this.writeAuditEvent(exportRow.id, 'pipeline.timestamp_pdf.completed', undefined, {
        stage: 'timestamp_pdf',
        tsaProvider: ts.tsaProvider,
      });
    } catch (error) {
      await this.db
        .update(exportsTable)
        .set({ tsaStatus: EXPORT_TSA_STATUS.FAILED })
        .where(eq(exportsTable.id, exportRow.id));
      await this.writeAuditEvent(exportRow.id, 'pipeline.timestamp_pdf.failed', undefined, {
        stage: 'timestamp_pdf',
        error: error instanceof Error ? error.message : 'unknown timestamp error',
      });
      if (strict) {
        throw error;
      }
    }

    await this.db
      .update(exportOutbox)
      .set({
        stage: EXPORT_PIPELINE_STAGE.LTV_EMBED,
        lockedAt: null,
        lockedBy: null,
        runAfter: new Date(),
      })
      .where(eq(exportOutbox.id, outboxId));
    return { complete: false };
  }

  private async handleLtvStage(exportRow: typeof exportsTable.$inferSelect, outboxId: string): Promise<{ complete: boolean }> {
    try {
      const [sig] = await this.db
        .select()
        .from(exportSignatures)
        .where(eq(exportSignatures.exportId, exportRow.id))
        .orderBy(desc(exportSignatures.createdAt))
        .limit(1);

      if (sig) {
        const evidence = await this.compliance.fetchRevocationEvidence(sig.certChainPem, sig.certFingerprintSha256);
        await this.updateLatestSignature(exportRow.id, {
          ocspResponsesBase64: evidence.ocspResponsesBase64,
          crlDataBase64: evidence.crlDataBase64,
        });

        if (evidence.ocspResponsesBase64 || evidence.crlDataBase64) {
          await this.db
            .update(exportsTable)
            .set({ verificationLevel: EXPORT_VERIFICATION_LEVEL.LTV })
            .where(eq(exportsTable.id, exportRow.id));
        }
      }

      await this.writeAuditEvent(exportRow.id, 'pipeline.ltv_embed.completed', undefined, {
        stage: 'ltv_embed',
      });
    } finally {
      await this.db
        .update(exportOutbox)
        .set({
          stage: EXPORT_PIPELINE_STAGE.PUBLISH,
          lockedAt: null,
          lockedBy: null,
          runAfter: new Date(),
        })
        .where(eq(exportOutbox.id, outboxId));
    }

    return { complete: false };
  }

  private async handlePublishStage(exportRow: typeof exportsTable.$inferSelect): Promise<{ complete: boolean }> {
    await this.db
      .update(exportsTable)
      .set({
        status: EXPORT_STATUS.READY,
        completedAt: new Date(),
      })
      .where(eq(exportsTable.id, exportRow.id));

    await this.writeAuditEvent(exportRow.id, 'pipeline.publish.completed', undefined, {
      stage: 'publish',
    });
    return { complete: true };
  }

  async claimPendingJobs(workerId: string, limit = 10): Promise<string[]> {
    const now = new Date();
    const jobs = await this.db
      .select({ id: exportOutbox.id })
      .from(exportOutbox)
      .where(and(lte(exportOutbox.runAfter, now), isNull(exportOutbox.lockedAt)))
      .orderBy(exportOutbox.createdAt)
      .limit(limit);

    if (jobs.length === 0) return [];

    const ids = jobs.map((j) => j.id);
    const locked = await this.db
      .update(exportOutbox)
      .set({ lockedAt: now, lockedBy: workerId })
      .where(and(sql`${exportOutbox.id} = ANY(${ids})`, isNull(exportOutbox.lockedAt)))
      .returning({ id: exportOutbox.id });

    return locked.map((l) => l.id);
  }

  private async shouldSignExport(exportType: string): Promise<boolean> {
    const signRegulatoryOnly = this.config.get<boolean>('EXPORT_SIGN_REGULATORY_ONLY', true);
    if (!signRegulatoryOnly) return true;
    return exportType.startsWith('reports.');
  }

  private async resolveRetentionDays(exportType: string): Promise<number> {
    const [policy] = await this.db
      .select()
      .from(exportRetentionPolicies)
      .where(eq(exportRetentionPolicies.exportType, exportType))
      .limit(1);
    if (policy?.retentionDays && policy.retentionDays > 0) return policy.retentionDays;
    return this.config.get<number>('EXPORT_DEFAULT_RETENTION_DAYS', 2555);
  }

  private getTempArtifactPath(exportId: string, extension: string): string {
    return path.join(this.getStorageDir(), '.tmp', `${exportId}.${extension}.tmp`);
  }

  private async upsertSignature(
    exportId: string,
    values: {
      signerSubject: string;
      certFingerprintSha256: string;
      certChainPem: string;
      signatureBytesBase64?: string;
      timestampTokenBase64?: string;
      timestampedAt?: Date;
      ocspResponsesBase64?: string | null;
      crlDataBase64?: string | null;
    },
  ) {
    const [current] = await this.db
      .select()
      .from(exportSignatures)
      .where(eq(exportSignatures.exportId, exportId))
      .orderBy(desc(exportSignatures.createdAt))
      .limit(1);

    if (!current) {
      await this.db.insert(exportSignatures).values({
        exportId,
        signerSubject: values.signerSubject,
        certFingerprintSha256: values.certFingerprintSha256,
        certChainPem: values.certChainPem,
        signatureBytesBase64: values.signatureBytesBase64 ?? null,
        timestampTokenBase64: values.timestampTokenBase64 ?? null,
        timestampedAt: values.timestampedAt ?? null,
        ocspResponsesBase64: values.ocspResponsesBase64 ?? null,
        crlDataBase64: values.crlDataBase64 ?? null,
      });
      return;
    }

    await this.db
      .update(exportSignatures)
      .set({
        signerSubject: values.signerSubject,
        certFingerprintSha256: values.certFingerprintSha256,
        certChainPem: values.certChainPem,
        signatureBytesBase64: values.signatureBytesBase64 ?? current.signatureBytesBase64,
        timestampTokenBase64: values.timestampTokenBase64 ?? current.timestampTokenBase64,
        timestampedAt: values.timestampedAt ?? current.timestampedAt,
        ocspResponsesBase64: values.ocspResponsesBase64 ?? current.ocspResponsesBase64,
        crlDataBase64: values.crlDataBase64 ?? current.crlDataBase64,
      })
      .where(eq(exportSignatures.id, current.id));
  }

  private async updateLatestSignature(
    exportId: string,
    values: {
      timestampTokenBase64?: string;
      timestampedAt?: Date;
      ocspResponsesBase64?: string | null;
      crlDataBase64?: string | null;
    },
  ) {
    const [current] = await this.db
      .select()
      .from(exportSignatures)
      .where(eq(exportSignatures.exportId, exportId))
      .orderBy(desc(exportSignatures.createdAt))
      .limit(1);
    if (!current) return;

    await this.db
      .update(exportSignatures)
      .set({
        timestampTokenBase64: values.timestampTokenBase64 ?? current.timestampTokenBase64,
        timestampedAt: values.timestampedAt ?? current.timestampedAt,
        ocspResponsesBase64: values.ocspResponsesBase64 ?? current.ocspResponsesBase64,
        crlDataBase64: values.crlDataBase64 ?? current.crlDataBase64,
      })
      .where(eq(exportSignatures.id, current.id));
  }

  private async writeAuditEvent(
    exportId: string,
    eventType: string,
    audit: ExportAuditContext | undefined,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.db.insert(exportAuditEvents).values({
      exportId,
      eventType,
      actorUserId: audit?.actorUserId ?? null,
      ip: audit?.ip ?? null,
      userAgent: audit?.userAgent ?? null,
      payloadJson: payload,
    });
  }

  private buildListScopePredicate(user: JwtPayloadUser, scope: ExportScope) {
    const managerBranchAccess = user.permissions.includes('reports:refresh');
    if (!managerBranchAccess) {
      return eq(exportsTable.userId, user.sub);
    }

    if (scope.branchId) {
      if (!scope.companyId) {
        return eq(exportsTable.branchId, scope.branchId);
      }
      return and(eq(exportsTable.branchId, scope.branchId), eq(exportsTable.companyId, scope.companyId));
    }

    if (scope.companyId) {
      return eq(exportsTable.companyId, scope.companyId);
    }

    return eq(exportsTable.userId, user.sub);
  }

  private async getExportForUser(user: JwtPayloadUser, exportId: string) {
    const scope = this.parseScope(user);
    const managerBranchAccess = user.permissions.includes('reports:refresh');

    const [row] = await this.db
      .select()
      .from(exportsTable)
      .where(eq(exportsTable.id, exportId))
      .limit(1);

    if (!row) throw new NotFoundException('Export not found');

    if (row.userId === user.sub) return row;

    if (managerBranchAccess) {
      if (scope.companyId && row.companyId !== scope.companyId) {
        throw new ForbiddenException('Export outside your company scope.');
      }
      if (scope.branchId && row.branchId !== scope.branchId) {
        throw new ForbiddenException('Export outside your branch scope.');
      }
      return row;
    }

    throw new ForbiddenException('You can only access your own exports.');
  }

  private parseScope(user: JwtPayloadUser): ExportScope {
    const { companyIds, branchIds } = extractTenantScope(user.permissions);

    return {
      userId: user.sub,
      permissions: user.permissions,
      companyId: companyIds[0],
      branchId: branchIds[0],
    };
  }

  private getStringParam(params: Record<string, unknown> | undefined, key: string): string | undefined {
    const value = params?.[key];
    if (typeof value === 'string' && value.length > 0) return value;
    return undefined;
  }

  private getStorageDir(): string {
    const configured = this.config.get<string>('EXPORT_STORAGE_DIR');
    return configured && configured.length > 0
      ? configured
      : path.resolve(process.cwd(), 'storage', 'exports');
  }

  private toExportResponse(row: typeof exportsTable.$inferSelect) {
    const signature: ExportSignatureSummary = {
      signer: null,
      certFingerprint: null,
      signedAt: row.signedAt,
      timestampedAt: null,
      tsaProvider: row.tsaProvider,
    };

    return {
      id: row.id,
      companyId: row.companyId,
      branchId: row.branchId,
      userId: row.userId,
      exportType: row.exportType,
      format: row.format,
      params: row.paramsJson,
      fileName: row.fileName,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      sha256Hash: row.sha256Hash,
      verificationToken: row.verificationToken,
      status: row.status,
      isSigned: row.isSigned,
      pdfaLevel: row.pdfaLevel,
      signatureProfile: row.signatureProfile,
      signingStatus: row.signingStatus,
      signedAt: row.signedAt,
      signedByUserId: row.signedByUserId,
      tsaStatus: row.tsaStatus,
      tsaProvider: row.tsaProvider,
      verificationLevel: row.verificationLevel,
      legalHold: row.legalHold,
      legalHoldReason: row.legalHoldReason,
      retentionUntil: row.retentionUntil,
      revokedAt: row.revokedAt,
      signature,
      createdAt: row.createdAt,
      completedAt: row.completedAt,
      expiresAt: row.expiresAt,
    };
  }
}
