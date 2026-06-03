# TLS / HTTPS setup

IFMS serves traffic through the `nginx` reverse proxy (`nginx.conf`). This guide
covers how to make HTTPS work in production and staging.

There are two supported deployment paths:

- **(a) Terminate TLS at nginx** — nginx holds the certificate and serves
  `https://your-domain` directly. This is the default the shipped `nginx.conf`
  is configured for.
- **(b) Terminate TLS at an upstream load balancer / ingress** — an external LB
  (AWS ALB, GCP HTTPS LB, Cloudflare, a Kubernetes ingress, etc.) does the TLS
  handshake and forwards plain HTTP to nginx internally.

Pick **one**. Most single-VM / docker-compose deployments use (a). Managed
cloud platforms usually use (b).

---

## Placeholders you must replace

Before going live, replace these in `nginx.conf`:

| Placeholder | Replace with | Where |
|---|---|---|
| `your-domain.example.com` | Your real FQDN, e.g. `app.example.com` | `server_name` in **both** server blocks (port 80 and port 443) |

And on the host, create the two directories that the compose files mount into
the nginx container (next to `docker-compose.production.yml`):

```bash
mkdir -p ./certs ./certbot-www
```

- `./certs` → mounted read-only at `/etc/nginx/certs`. Must contain
  `fullchain.pem` and `privkey.pem`.
- `./certbot-www` → mounted read-only at `/var/www/certbot`. Webroot for ACME
  HTTP-01 challenge files.

---

## Path (a): Terminate TLS at nginx

`nginx.conf` already contains:

- A `listen 80` server that serves the ACME challenge and the
  `/nginx-health` probe, then `return 301 https://$host$request_uri` for
  everything else.
- A `listen 443 ssl; http2 on;` server with all the proxy `location` blocks,
  security headers, and:
  ```nginx
  ssl_certificate     /etc/nginx/certs/fullchain.pem;
  ssl_certificate_key /etc/nginx/certs/privkey.pem;
  ssl_protocols       TLSv1.2 TLSv1.3;
  ```

You just need to supply the certificate at `./certs/fullchain.pem` and
`./certs/privkey.pem`. Two ways to get one:

### Option A1 — Let's Encrypt via certbot (HTTP-01)

The `listen 80` server serves `/.well-known/acme-challenge/` from
`/var/www/certbot`, so certbot's HTTP-01 challenge works without taking nginx
down.

1. Point DNS for your domain at the host's public IP, and make sure port **80**
   and **443** are open to the internet.
2. Start the stack so nginx is serving on :80:
   ```bash
   docker compose -f docker-compose.production.yml up -d
   ```
3. Run certbot in webroot mode, writing challenge files into the same
   `./certbot-www` directory nginx serves, and certificates into a place you can
   copy into `./certs`:
   ```bash
   docker run --rm \
     -v "$(pwd)/certbot-www:/var/www/certbot" \
     -v "$(pwd)/letsencrypt:/etc/letsencrypt" \
     certbot/certbot certonly --webroot \
       -w /var/www/certbot \
       -d your-domain.example.com \
       --email you@example.com --agree-tos --no-eff-email
   ```
4. Copy (or symlink) the issued cert into `./certs` with the filenames nginx
   expects:
   ```bash
   cp ./letsencrypt/live/your-domain.example.com/fullchain.pem ./certs/fullchain.pem
   cp ./letsencrypt/live/your-domain.example.com/privkey.pem   ./certs/privkey.pem
   ```
5. Reload nginx to pick up the cert:
   ```bash
   docker compose -f docker-compose.production.yml exec nginx nginx -s reload
   ```

> Tip: instead of copying, you can mount the Let's Encrypt live directory
> directly. In the nginx service, replace `- ./certs:/etc/nginx/certs:ro` with
> `- ./letsencrypt/live/your-domain.example.com:/etc/nginx/certs:ro` (note: that
> directory contains symlinks, so also mount `- ./letsencrypt:/etc/letsencrypt:ro`).

### Option A2 — Bring your own certificate

If you already have a cert from a commercial CA or your org's internal CA:

1. Assemble the **full chain** (server cert + intermediates) into one PEM file.
2. Place the files:
   ```bash
   cp /path/to/your/fullchain.pem ./certs/fullchain.pem
   cp /path/to/your/privkey.pem   ./certs/privkey.pem
   ```
   The private key must be **unencrypted** (no passphrase), or nginx will fail
   to start.
3. Reload nginx as in step 5 above.

### Auto-renewal (Let's Encrypt)

Let's Encrypt certificates expire after **90 days** — renew well before then
(certbot renews when <30 days remain). Add a cron job / systemd timer on the
host, e.g. daily:

```bash
# /etc/cron.d/ifms-certbot  (runs daily, renews only if near expiry)
0 3 * * * root docker run --rm \
  -v "/srv/ifms/certbot-www:/var/www/certbot" \
  -v "/srv/ifms/letsencrypt:/etc/letsencrypt" \
  certbot/certbot renew --webroot -w /var/www/certbot --quiet && \
  cp /srv/ifms/letsencrypt/live/your-domain.example.com/fullchain.pem /srv/ifms/certs/fullchain.pem && \
  cp /srv/ifms/letsencrypt/live/your-domain.example.com/privkey.pem   /srv/ifms/certs/privkey.pem && \
  docker compose -f /srv/ifms/docker-compose.production.yml exec -T nginx nginx -s reload
```

(Adjust `/srv/ifms` to your deploy path. If you mounted the live directory
directly per the tip above, you can drop the two `cp` steps.)

---

## Path (b): Terminate TLS at an upstream LB / ingress

If TLS is handled by an external load balancer or ingress, the LB presents the
certificate and forwards **plain HTTP** to nginx on port 80. In that case nginx
should NOT redirect to HTTPS (the LB already did the upgrade), and nginx does not
need certificates mounted.

To switch `nginx.conf` to this mode:

1. In the `listen 80` server, remove the catch-all redirect:
   ```nginx
   location / {
     return 301 https://$host$request_uri;   # <- delete this block
   }
   ```
2. Move the proxy `location` blocks (and the `add_header` security headers) from
   the `listen 443 ssl` server into the `listen 80` server — or simply delete
   the entire `listen 443 ssl` server and keep the original HTTP-only proxy
   layout. Keep `location = /nginx-health` and the
   `/.well-known/acme-challenge/` block.
3. You can leave the cert volume mounts in the compose files (they're harmless
   read-only mounts) or remove the `./certs` / `./certbot-www` lines from the
   `nginx` service.
4. Configure the LB to:
   - terminate TLS with your cert,
   - forward to the nginx container on port 80,
   - set `X-Forwarded-Proto: https` (nginx forwards `$scheme` upstream, and the
     API trusts `X-Forwarded-Proto`),
   - health-check `GET /nginx-health` on port 80 (returns `200 ok`).

Make sure the API's `FRONTEND_ORIGIN` (in the compose files) still uses the
`https://` external origin — that does not change between paths (a) and (b).

---

## Verify

After bringing the stack up with a real domain and cert:

```bash
# HTTPS works and returns the expected headers
curl -I https://your-domain.example.com
# Expect: HTTP/2 200, plus Strict-Transport-Security / X-Frame-Options headers

# Plain HTTP redirects to HTTPS (path (a))
curl -I http://your-domain.example.com
# Expect: HTTP/1.1 301 Moved Permanently, Location: https://your-domain.example.com/

# Health probe still answers over HTTP (used by the LB / container healthcheck)
curl -s http://your-domain.example.com/nginx-health
# Expect: ok

# API reachable over HTTPS
curl -s https://your-domain.example.com/api/health/ready

# Inspect the served certificate (issuer, expiry)
echo | openssl s_client -connect your-domain.example.com:443 -servername your-domain.example.com 2>/dev/null \
  | openssl x509 -noout -issuer -subject -dates
```

If `curl -I https://...` fails to connect, check that:

- `./certs/fullchain.pem` and `./certs/privkey.pem` exist and are readable,
- the private key is unencrypted,
- `server_name` matches your domain,
- port 443 is published (it is in both compose files) and open in the firewall,
- `docker compose ... logs nginx` shows no TLS / config errors
  (you can validate config with `docker compose ... exec nginx nginx -t`).
