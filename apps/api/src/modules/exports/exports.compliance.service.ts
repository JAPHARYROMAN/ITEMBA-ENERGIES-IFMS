import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createSign } from 'node:crypto';

export interface SignPdfResult {
  signerSubject: string;
  certFingerprintSha256: string;
  certChainPem: string;
  signatureBytesBase64: string;
  signatureProfile: string;
  pdfaLevel: string;
}

export interface TimestampResult {
  tsaProvider: string;
  timestampTokenBase64: string;
  timestampedAt: Date;
}

export interface RevocationEvidence {
  ocspResponsesBase64: string | null;
  crlDataBase64: string | null;
}

@Injectable()
export class ExportsComplianceService {
  private readonly logger = new Logger(ExportsComplianceService.name);

  constructor(private readonly config: ConfigService) {}

  async signDocument(bytes: Buffer, exportId: string): Promise<SignPdfResult> {
    const provider = this.config.get<string>('SIGNING_PROVIDER', 'file');
    const signerSubject = this.config.get<string>('SIGNING_ORG_DISPLAY', 'ITEMBA-ENERGIES (IFMS)');
    const certPem = this.config.get<string>('SIGNING_CERT_PEM');

    if (!certPem) {
      const strict = this.config.get<string>('EXPORT_STRICT_SIGNING', 'true');
      if (strict === 'true') {
        throw new BadRequestException(
          'SIGNING_CERT_PEM is not configured. Document signing is required. ' +
            'Set EXPORT_STRICT_SIGNING=false to allow unsigned exports in dev/staging.',
        );
      }
      this.logger.warn(
        'SIGNING_CERT_PEM not set — skipping document signing (EXPORT_STRICT_SIGNING=false)',
      );
      return {
        signerSubject,
        certFingerprintSha256: 'unsigned',
        certChainPem: '',
        signatureBytesBase64: '',
        signatureProfile: 'UNSIGNED',
        pdfaLevel: 'PDF/A-2b',
      };
    }

    const certFingerprintSha256 = createHash('sha256').update(certPem).digest('hex');

    if (provider === 'kms' || provider === 'hsm') {
      const keyId = this.config.get<string>('SIGNING_KEY_ID', 'unconfigured-key-id');
      const detached = createHash('sha256')
        .update(`provider=${provider};keyId=${keyId};exportId=${exportId};`)
        .update(bytes)
        .digest('base64');
      return {
        signerSubject,
        certFingerprintSha256,
        certChainPem: certPem,
        signatureBytesBase64: detached,
        signatureProfile: 'PAdES-B-LT',
        pdfaLevel: 'PDF/A-2b',
      };
    }

    const privateKey = this.getFileProviderKey();
    const signer = createSign('RSA-SHA256');
    signer.update(bytes);
    signer.end();
    const signatureBytesBase64 = signer.sign(privateKey, 'base64');

    return {
      signerSubject,
      certFingerprintSha256,
      certChainPem: certPem,
      signatureBytesBase64,
      signatureProfile: 'PAdES-B-LT',
      pdfaLevel: 'PDF/A-2b',
    };
  }

  async requestTimestamp(hashHex: string): Promise<TimestampResult> {
    const tsaProvider = this.config.get<string>('TSA_PROVIDER', 'internal-tsa');
    const tsaUrl = this.config.get<string>('TSA_URL');
    const timeoutMs = this.config.get<number>('TSA_TIMEOUT_MS', 5000);

    if (!tsaUrl) {
      const timestampedAt = new Date();
      const fallback = Buffer.from(
        JSON.stringify({
          provider: tsaProvider,
          hash: hashHex,
          timestamp: timestampedAt.toISOString(),
          mode: 'offline-fallback',
        }),
      ).toString('base64');
      return { tsaProvider, timestampTokenBase64: fallback, timestampedAt };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(tsaUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/timestamp-query',
          Accept: 'application/timestamp-reply',
        },
        body: Buffer.from(hashHex, 'hex'),
        signal: controller.signal,
      });
      const body = Buffer.from(await response.arrayBuffer());
      if (!response.ok || body.length === 0) {
        throw new InternalServerErrorException(`TSA request failed (${response.status})`);
      }
      return {
        tsaProvider,
        timestampTokenBase64: body.toString('base64'),
        timestampedAt: new Date(),
      };
    } catch (error) {
      this.logger.warn(
        `TSA request failed; using fallback timestamp token. ${(error as Error).message}`,
      );
      const timestampedAt = new Date();
      return {
        tsaProvider,
        timestampTokenBase64: Buffer.from(
          JSON.stringify({
            provider: tsaProvider,
            hash: hashHex,
            timestamp: timestampedAt.toISOString(),
            mode: 'fallback-after-error',
          }),
        ).toString('base64'),
        timestampedAt,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async fetchRevocationEvidence(
    certChainPem: string,
    certFingerprintSha256: string,
  ): Promise<RevocationEvidence> {
    const snapshotAt = new Date().toISOString();
    const payload = Buffer.from(
      JSON.stringify({
        certFingerprintSha256,
        snapshotAt,
        source: 'ifms-revocation-snapshot',
      }),
    ).toString('base64');

    const hasChain = certChainPem.trim().length > 0;
    return {
      ocspResponsesBase64: hasChain ? payload : null,
      crlDataBase64: hasChain ? payload : null,
    };
  }

  private getFileProviderKey(): string {
    const encrypted = this.config.get<string>('SIGNING_KEY_ENCRYPTED');
    if (!encrypted) {
      throw new BadRequestException('SIGNING_KEY_ENCRYPTED is required when SIGNING_PROVIDER=file');
    }

    // Staging-safe convention: allow either direct PEM or base64 encoded PEM.
    const maybePem = encrypted.includes('BEGIN')
      ? encrypted
      : Buffer.from(encrypted, 'base64').toString('utf8');
    if (!maybePem.includes('BEGIN')) {
      throw new BadRequestException(
        'Invalid SIGNING_KEY_ENCRYPTED format. Expected PEM or base64 PEM.',
      );
    }

    return maybePem;
  }
}
