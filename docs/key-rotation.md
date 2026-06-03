# API Key Rotation Runbook (Gemini & Groq)

The Gemini (`GEMINI_API_KEY`) and Groq (`GROQ_API_KEY`) keys were previously
present in plaintext `.env` files committed alongside the repo. Any secret that
was ever committed or shared must be treated as compromised and rotated — even
after it is removed from the working tree, it remains recoverable in git
history.

This runbook rotates those keys end to end. Do the whole thing in one sitting;
a half-rotated key (revoked but not redeployed) takes AI features down.

Where the keys are consumed:

- `GEMINI_API_KEY` → `apps/api/src/modules/ai/ai.service.ts` (model
  `gemini-1.5-flash`, endpoint `POST /ai/insights`).
- `GROQ_API_KEY` → `apps/api/src/modules/ai/ai-chat.service.ts` (model
  `llama-3.1-8b-instant`, endpoint `POST /ai/chat`).

Both are optional at the schema level (`apps/api/src/common/env/env.schema.ts`),
so if a key is missing the API still boots — the AI features just return an
"unavailable" message. That means a botched rotation fails quietly; verify
explicitly (step (d)).

---

## (a) Revoke / create new keys in the provider consoles

### Gemini — Google AI Studio

1. Go to <https://aistudio.google.com/> and sign in with the Google account
   that owns the key.
2. Open **Get API key** (left nav) / <https://aistudio.google.com/app/apikey>.
3. **Create a new key** first (so you have the replacement ready before you
   break the old one): click **Create API key**, choose the project, copy the
   new value (`AIza...`) somewhere temporary and secure.
4. Then revoke the old key: find the exposed key in the list and **Delete** it.
   (If the key is managed as a Google Cloud API key, you can instead revoke it
   under Google Cloud Console → **APIs & Services → Credentials**.)

### Groq — Groq Cloud Console

1. Go to <https://console.groq.com/> and sign in.
2. Open **API Keys** (left nav) / <https://console.groq.com/keys>.
3. Click **Create API Key**, name it, and copy the new value (`gsk_...`).
4. **Delete / revoke** the old exposed key from the same list.

> Create-new-then-delete-old minimizes downtime. If you suspect active abuse,
> delete the old key immediately regardless.

---

## (b) Update the secret in the deployment environment / GitHub secrets

Do **not** put the new value in any committed file. Inject it through the
deployment platform's secret store.

- **GitHub Actions:** repo → **Settings → Secrets and variables → Actions**.
  Update `GEMINI_API_KEY` and `GROQ_API_KEY` (Update secret → paste new value).
  Update environment-scoped secrets too if your workflows use Environments
  (e.g. `production`, `staging`).

  Via CLI:

  ```bash
  gh secret set GEMINI_API_KEY --body "AIza...new..."
  gh secret set GROQ_API_KEY   --body "gsk_...new..."
  # environment-scoped:
  gh secret set GEMINI_API_KEY --env production --body "AIza...new..."
  ```

- **Host / runtime env** (Docker, systemd, PaaS dashboard, Kubernetes secret,
  cloud secret manager): update the `GEMINI_API_KEY` / `GROQ_API_KEY` values
  wherever the running API reads its environment. Update every environment that
  had the old key (prod, staging, any shared dev).

---

## (c) Restart / redeploy the API to pick up the new value

The keys are read once at service construction (in the `ai.service.ts` /
`ai-chat.service.ts` constructors), so a process restart is required — editing
the secret store alone does nothing to a running process.

- If secrets are baked in at deploy time: trigger a redeploy (re-run the deploy
  workflow / push, or your platform's "redeploy" action).
- If secrets are read from the live environment: restart the API process /
  container so it re-reads env (`docker compose up -d --force-recreate api`,
  `systemctl restart ifms-api`, pod rollout restart, etc.).

---

## (d) Verify AI features still work

1. Check API startup logs do **not** show
   `GEMINI_API_KEY not set` or `GROQ_API_KEY not set` warnings.
2. Exercise the Gemini path (`POST /ai/insights`) and the Groq path
   (`POST /ai/chat`) with a valid auth token, e.g.:

   ```bash
   curl -X POST https://<api-host>/ai/chat \
     -H 'Authorization: Bearer <token>' \
     -H 'Content-Type: application/json' \
     -d '{"message":"ping"}'
   ```

   A real model response confirms success. Responses containing
   `AI chat is unavailable — GROQ_API_KEY not configured` or
   `AI insights unavailable — GEMINI_API_KEY not configured` mean the new key
   did not reach the running process — recheck steps (b)/(c).
3. Optionally confirm in the provider console that the new key shows recent
   usage and the old key shows none.

---

## (e) Also rotate other shared secrets, and scrub history

Because these keys lived in committed `.env` files, treat the **whole file** as
exposed and rotate anything else that may have been shared:

- `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` — rotate both (each must be ≥ 32
  chars per the env schema). Note: rotating these invalidates existing access
  and refresh tokens, forcing all users to log in again. Plan the timing.
- `ADMIN_SEED_PASSWORD` — change it and re-run the admin reset
  (`npm run db:reset-admin`) if the seed admin may still use the old value.
- Any `SMTP_PASS`, `SMS_API_KEY`, `SIGNING_KEY_PASSPHRASE`, or database
  credentials that appeared in the same committed file.

Then confirm no live secret remains in any committed file. From the repo root:

```bash
# look for provider key prefixes anywhere in tracked content
git grep -nI -e "AIza" -e "gsk_" -e "SG\." -- . ':!*.example' ':!docs/*'

# and across full git history (slower; secrets persist in old commits)
git log -p --all -S "AIza" -- . | head
git log -p --all -S "gsk_" -- . | head
```

`.env.example` files should only ever contain blank placeholders (no value
after `=`). If `git grep` finds a real-looking key in tracked content, remove
it, rotate that key, and — because git history retains it — scrub history with
[`git filter-repo`](https://github.com/newren/git-filter-repo) (or BFG) and
force-push, coordinating with the team. Rotation is still mandatory even after
history is scrubbed: assume any pushed secret was already harvested.
