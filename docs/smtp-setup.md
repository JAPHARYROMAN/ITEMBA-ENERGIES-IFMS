# SMTP / Transactional Email Setup

This guide explains how to enable transactional email for the IFMS API
(password-reset links and notification delivery).

## How it is wired

Email is sent through a single transport:

- `apps/api/src/modules/notifications/transports/email.transport.ts`

The transport reads its configuration from the validated environment
(`apps/api/src/common/env/env.schema.ts`, fields `SMTP_*`). It uses
[`nodemailer`](https://nodemailer.com/). At startup it checks `SMTP_HOST`:

- **`SMTP_HOST` set** → a real SMTP transporter is created and email is sent.
- **`SMTP_HOST` unset** → no transporter is created. The transport logs a
  warning (`SMTP_HOST not configured. Email delivery will use console logging.`)
  and every message is written to the application log instead of being
  delivered (`[DEV EMAIL] To: ... | Subject: ... | Body: ...`).

The password-reset flow has the same fallback guard in
`apps/api/src/modules/auth/auth.service.ts` (`forgotPassword`): if `SMTP_HOST`
is unset it logs `Password reset requested for <email>, but SMTP is not
configured. Reset email was not sent.` and returns. The reset token is still
created and stored in the database, but the user never receives the link — so
in any real (production/staging) environment SMTP **must** be configured or
password reset is effectively broken.

## Environment variables

Set these in the deployment environment (not in committed files). They are
defined in `apps/api/.env.example`:

| Variable      | Required | Default              | Notes |
|---------------|----------|----------------------|-------|
| `SMTP_HOST`   | Yes (prod) | _(none)_           | Host of your SMTP relay. Unset = email skipped. |
| `SMTP_PORT`   | No       | `587`                | See port/TLS pairing below. |
| `SMTP_SECURE` | No       | `false`              | `true` = implicit TLS (port 465); `false` = STARTTLS (port 587). |
| `SMTP_USER`   | Usually  | _(none)_             | SMTP auth username (provider-specific). |
| `SMTP_PASS`   | Usually  | _(none)_             | SMTP auth password / API key. Treat as a secret. |
| `SMTP_FROM`   | Recommended | `noreply@ifms.local` | Envelope From. Most providers require a verified sender/domain. |

### Port and `SMTP_SECURE` must match

`nodemailer`'s `secure` flag decides whether TLS is negotiated immediately or
via STARTTLS:

- **Port 465 → `SMTP_SECURE=true`** — implicit/wrapper TLS. The connection is
  encrypted from the first byte.
- **Port 587 → `SMTP_SECURE=false`** — STARTTLS. The connection starts plain
  and is upgraded to TLS. This is the most common setup and the project
  default. (Port 25 also uses STARTTLS but is often blocked by cloud hosts.)

A common failure is setting port 465 with `SMTP_SECURE=false` (or 587 with
`true`) — the handshake then hangs or errors. Match the pair above.

## Provider examples

All examples assume you are setting these in the deployment env / secrets
store, never in a committed `.env`.

### Generic SMTP relay (STARTTLS)

```env
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=apikey-or-username
SMTP_PASS=your-smtp-password
SMTP_FROM=no-reply@yourdomain.com
```

### SendGrid

```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=apikey            # literal string "apikey"
SMTP_PASS=SG.xxxxxxxx...    # your SendGrid API key
SMTP_FROM=no-reply@yourdomain.com   # must be a Verified Sender / authenticated domain
```

### Mailgun

```env
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=postmaster@mg.yourdomain.com
SMTP_PASS=your-mailgun-smtp-password
SMTP_FROM=no-reply@yourdomain.com
```

### Amazon SES (SMTP interface)

```env
SMTP_HOST=email-smtp.us-east-1.amazonaws.com   # region-specific
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=AKIA...SES-SMTP-USERNAME    # SES SMTP credentials, NOT your AWS access key
SMTP_PASS=your-ses-smtp-password
SMTP_FROM=no-reply@yourdomain.com     # verified identity; account must be out of the SES sandbox
```

> For implicit-TLS on any of the above, switch to `SMTP_PORT=465` **and**
> `SMTP_SECURE=true`.

## Testing delivery

1. Set the `SMTP_*` variables in your environment and (re)start the API.
2. Confirm the startup log shows
   `Email transport configured with SMTP host: <host>` (not the "not
   configured" warning).
3. Trigger a password reset to exercise the real send path:

   ```bash
   curl -X POST http://localhost:3001/auth/forgot-password \
     -H 'Content-Type: application/json' \
     -d '{"email":"a-real-user@yourdomain.com"}'
   ```

   Use the email of an existing, non-deleted user. (The endpoint always returns
   success to avoid email enumeration, so the response alone does not confirm
   delivery.)
4. Confirm the message arrives in that mailbox, with subject
   `Reset your IFMS password` and a `/reset-password?token=...` link.
5. If nothing arrives, check the API logs:
   - Warning about SMTP not configured → `SMTP_HOST` is not set in this
     environment.
   - `nodemailer` auth/connection errors → check `SMTP_USER` / `SMTP_PASS`, the
     port/`SMTP_SECURE` pairing, and that `SMTP_FROM` is a verified sender.

## Fallback behavior summary

| `SMTP_HOST` | Notification email | Password-reset email |
|-------------|--------------------|----------------------|
| Unset       | Logged to console (`[DEV EMAIL] ...`), not delivered | Skipped; token stored but not emailed |
| Set         | Delivered via SMTP | Delivered via SMTP |

Treat console-logging mode as development-only. Always configure SMTP in
production and staging.
