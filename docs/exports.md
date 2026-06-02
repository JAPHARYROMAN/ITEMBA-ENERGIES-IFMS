# Unified Export System

## Overview
IFMS uses a unified export pipeline for reports and table views. Exports are generated server-side as PDF or CSV, stored securely, and verified using a tokenized public verification endpoint.

For PDF exports, the pipeline now supports legal-grade controls:
- PDF/A archival target (`PDF/A-2b`)
- PAdES signing profile (`PAdES-B-LT` target)
- RFC 3161 timestamp token capture (or safe fallback)
- LTV evidence persistence (OCSP/CRL snapshot payloads)
- immutable-style audit trail events for lifecycle transitions
- retention and legal hold state

## Supported Export Types
- `reports.overview`
- `reports.daily-operations`
- `reports.stock-loss`
- `reports.profitability`
- `reports.credit-cashflow`
- `reports.station-comparison`
- `tables.any`

## API
### POST `/api/exports`
Request body:

```json
{
  "format": "pdf",
  "exportType": "reports.overview",
  "params": {
    "dateFrom": "2026-01-01",
    "dateTo": "2026-01-31",
    "companyId": "...",
    "branchId": "..."
  },
  "clientContext": {
    "requestedFromUrl": "/app/reports/overview",
    "timezone": "Africa/Dar_es_Salaam"
  }
}
```

### GET `/api/exports`
Returns export history for the current user (manager scope rules apply).

### GET `/api/exports/:exportId`
Returns status and metadata.

### GET `/api/exports/:exportId/download`
Downloads the generated file (only when status is `ready`).

### GET `/api/exports/:exportId/verification-receipt`
Downloads a PDF verification receipt with:
- export reference and verification token
- verification level and hash summary
- signer/certificate fingerprint summary (if signed)
- timestamp authority metadata (if available)

### PATCH `/api/exports/:exportId/legal-hold`
Manager-only endpoint (`reports:refresh`) to place or remove legal hold.

Request body:

```json
{
  "enabled": true,
  "reason": "Regulatory review case 2026-Q1"
}
```

## Verification
Public endpoints:
- `GET /public/report/verify?token=<verification_token>`
- `GET /public/report/verify/receipt?token=<verification_token>`

The verify endpoint supports:
- JSON response for API consumers
- HTML response for human-readable verification pages (when browser accepts `text/html`)

Rate limited and returns safe metadata only.

## Storage and Integrity
- Storage path: `storage/exports/<exportId>.<ext>` relative to the API runtime directory (normally `apps/api/storage/exports/...` locally)
- Runtime export files under `apps/api/storage/` are ignored and must not be committed.
- SHA-256 is calculated after render and persisted in `exports.sha256_hash`
- `verification_token` is generated per export
- Export expiry is controlled via `EXPORT_EXPIRES_HOURS`

## Worker Pipeline
Staged idempotent flow:
1. `generate` - renderer creates initial artifact.
2. `finalize` - file metadata/hash persisted.
3. `sign_pdf` - PAdES signature metadata recorded for eligible PDFs.
4. `timestamp_pdf` - RFC 3161 token requested and linked.
5. `ltv_embed` - revocation evidence snapshot persisted.
6. `publish` - export marked ready and public verification finalized.

On failure, status/attempts/error are updated and job is retried according to outbox policy.

## Verification Levels
- `basic`: hash-only verification
- `signed`: signature captured
- `signed_timestamped`: signature + RFC 3161 timestamp
- `ltv`: signature + timestamp + revocation evidence

## Environment Variables
- `EXPORT_STORAGE_DIR` (default: `storage/exports`)
- `EXPORT_EXPIRES_HOURS` (default: `72`)
- `EXPORT_OUTBOX_POLL_INTERVAL_SECONDS` (default: `10`)
- `EXPORT_VERIFY_BASE_URL` (default: `https://www.itembagroup.llc/public/report/verify`)
- `EXPORT_DEFAULT_RETENTION_DAYS` (default: `2555`, ~7 years)
- `EXPORT_SIGN_REGULATORY_ONLY` (`true` signs only `reports.*` by default)
- `EXPORT_STRICT_SIGNING_REQUIRED` (fail export if signing/timestamp fails)
- `SIGNING_PROVIDER` (`file`, `kms`, `hsm`)
- `SIGNING_KEY_ID` (for KMS/HSM)
- `SIGNING_CERT_PEM` (certificate chain payload)
- `SIGNING_KEY_ENCRYPTED` (PEM or base64 PEM for file-provider signing)
- `SIGNING_KEY_PASSPHRASE` (reserved for encrypted private key handling)
- `SIGNING_ORG_DISPLAY` (signature display subject)
- `TSA_PROVIDER` (timestamp provider label)
- `TSA_URL` (RFC 3161 endpoint)
- `TSA_TIMEOUT_MS` (timestamp request timeout)

## Frontend Integration
- Shared component: `components/ifms/ExportButton.tsx`
- Exports history page: `/app/exports`
- Export actions wired across report pages and generic tables.
