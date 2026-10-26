# Operator-run setup and deployment

The user runs all installation, image builds, startup/recreation and deployment commands. The agent must not install, deploy, or commit. No production deployment has been performed or verified. Do not reuse the isolated integration-test database or its accounts for real work.

## Local environment

Both Compose files work independently. Current local defaults use **3001** inside the app and on `127.0.0.1`; production uses internal **3000**. Product behavior and runtime artifact are shared.

```sh
cp .env.example .env
openssl rand -hex 32
```

Set `POSTGRES_PASSWORD` to the generated URL-safe value, and `APP_ORIGIN=http://localhost:3001`. Do not replace an existing database password casually; retained database volumes preserve their original credentials.

```sh
docker compose -f compose.local.yml config --quiet
docker compose -f compose.local.yml build
docker compose -f compose.local.yml up -d db
docker compose -f compose.local.yml run --rm app node dist/scripts/migrate.js
docker compose -f compose.local.yml run --rm app node dist/scripts/bootstrap.js
docker compose -f compose.local.yml up -d app worker
docker compose -f compose.local.yml ps
```

Open <http://localhost:3001>. Login uses the **owner's email and password entered during bootstrap**. There is no predefined admin username/password and no public registration. Bootstrap creates the owner and exactly two empty pages, and refuses to overwrite an owner or existing pages. Password entry is hidden and must have 12–256 characters. Do not pass a password in command-line arguments.

If containers are already running but no tables exist, run migration, then bootstrap. The worker retries automatically; its health becomes good after a successful processing tick. `/api/health` now returns 503 until migration is present. A previously built image may still have the older health behavior until the operator rebuilds it.

Source is not mounted. For subsequent code changes, the operator runs:

```sh
docker compose -f compose.local.yml up -d --build
```

Compose Watch is an optional rebuild workflow, not in-process hot reload. Host development may use the already installed Node dependencies with `npm run dev` and `npm run dev:web`; configure `DATABASE_URL` explicitly for a development database. Vite proxies `/api` to the configured API port in `vite.config.ts`. Never connect development/tests to production.

The web UI is compiled into the Docker image. `npm run build` on the host does not update an already running container. To apply later UI and worker changes without recreating database or media volumes, the operator can run the matching command for the environment:

```sh
docker compose -f compose.local.yml up -d --build app worker
docker compose --env-file .env.production -f compose.production.yml up -d --build app worker
```

Run only the line for the environment actually in use. The production line assumes the protected `.env.production` has already been created and configured. Reload the browser after the new `app` container is healthy; if the old interface remains, inspect the active proxy upstream and the container image rather than repeating `npm run build` on the host.

## Production environment

Copy `.env.production.example` to `.env.production` and restrict it with `chmod 600 .env.production`. Set the existing proxy network name and public HTTPS origin. Commands below are instructions for the operator, **not actions already performed**:

```sh
docker compose --env-file .env.production -f compose.production.yml config --quiet
docker compose --env-file .env.production -f compose.production.yml build
docker compose --env-file .env.production -f compose.production.yml up -d db
docker compose --env-file .env.production -f compose.production.yml run --rm app node dist/scripts/migrate.js
docker compose --env-file .env.production -f compose.production.yml run --rm app node dist/scripts/bootstrap.js
docker compose --env-file .env.production -f compose.production.yml up -d app worker
docker compose --env-file .env.production -f compose.production.yml ps
```

Skip bootstrap on upgrades. Take a coordinated backup before migrations. Migrations are ordered SQL files under `db/migrations`, protected by an advisory lock and one transaction per file. Applied migration names are retained; edit a new numbered migration for future changes. Migration failures roll back the failing file and must be resolved before serving new code. Restore database and media together when reverting an incompatible release.

Production has **no `ports:` and no host networking**. Only `app` joins `${PROXY_NETWORK}`. Connect the existing reverse proxy to that network and route to `http://app:3000`. If the shared network contains other services named `app`, configure an unambiguous proxy upstream/container alias appropriate to your proxy. The proxy terminates TLS, preserves Host, forwards the correct client/protocol headers, allows the configured upload size plus multipart overhead (for example, Nginx `client_max_body_size 320m;` for 300 MiB files) and at least 120 seconds for uploads, and streams Range responses. Configure `TRUST_PROXY` to the actual number of trusted hops, default one. Do not expose the app directly to untrusted proxy peers.

PostgreSQL belongs only to the internal private network. Worker uses private plus its own egress bridge for optional outbound Push. It has no listening HTTP service. `expose` is documentation, not a firewall; network membership provides isolation. No ingress container or provider-specific proxy labels are included.

## Configuration

| Variable | Purpose |
| --- | --- |
| `POSTGRES_PASSWORD` | Required URL-safe database secret; not checked into source. |
| `DATABASE_URL` | Constructed in Compose; explicit on host. |
| `APP_ORIGIN` | Exact browser origin; HTTPS for non-loopback production. |
| `LOCAL_APP_PORT` | Local host port, default 3001; match APP_ORIGIN. |
| `PROXY_NETWORK` | Required existing external proxy network in production. |
| `APP_IMAGE` | Production image name/tag. |
| `UPLOAD_REQUEST_TIMEOUT_MS` | App request timeout in milliseconds; default 1800000 (30 minutes). Reverse-proxy timeouts are configured separately. |
| `FILE_MAX_BYTES` | Upload limit in bytes; default 314572800 (300 MiB per content file). Personal profile photos remain capped at 5 MiB. |
| `MEDIA_ROOT` | Persistent private filesystem directory, `/app/media` in Compose. |
| `SESSION_TTL_DAYS` | Session lifetime, bounded to 1–30 days. |
| `TRUST_PROXY` | Trusted proxy hops; local false, production one. |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Optional Web Push settings. |
| `ORPHAN_GRACE_HOURS` | Worker orphan grace period, default 24; set on both services if overriding. |

No session-signing secret or mandatory paid service is required. Session tokens are opaque and stored only as hashes.

## Files and Push

The media named volume contains immutable originals and derived thumbnails. It is never publicly served. All access goes through authenticated routes; previews necessarily deliver media bytes to authorized viewers and cannot prevent browser saving or screenshots. Download preparation checks the current approval. Video thumbnails require an explicitly uploaded cover; opening a grid never downloads every video. Uploads are queued per picker. Files larger than 2 MiB use 2 MiB chunks (server accepts up to 8 MiB per request); retry resumes from the confirmed server offset while the picker stays open. Closing/reloading the page loses the in-memory file selection; select the file again to start a new session. Upload sessions expire after 24 hours without a successful chunk. Small files use multipart upload. Original bytes are validated and assembled using streams. References in old revisions are retained indefinitely; only unattached uploads older than the grace period are cleaned.

Generate optional VAPID keys yourself with the installed dependency:

```sh
node --input-type=module -e "import webpush from 'web-push'; console.log(webpush.generateVAPIDKeys())"
```

Put the generated key pair only in the protected environment file and set `VAPID_SUBJECT` to your contact `mailto:` URL or HTTPS URL. The settings screen validates the key format and reports missing or invalid configuration; the browser decodes the public key before creating its subscription. Recreate app/worker yourself after changes. Users opt in from Settings. Permission denial and unsupported browsers retain in-app notifications. iOS/iPadOS may require installation to the home screen. Delivery timing depends on OS/browser/network; real Push delivery has not been tested against an operator's browser push service.

## Monitoring and verification

Inspect health, worker heartbeat, job failures, disk usage and backup age. Worker records retry attempts and sanitized errors, reclaims abandoned leases and reconciles completed submissions before reminders. Failed jobs remain durable after eight attempts; investigate before explicitly resetting a specific failed job to pending. Do not blindly replay all jobs.

```sh
docker compose -f compose.local.yml logs --tail 100 worker
npm run check
npm run test:unit
DATABASE_URL=postgres://USER:PASSWORD@HOST:PORT/rooz_test npm run test:coverage
E2E_BASE_URL=http://localhost:3000 E2E_EMAIL=TEST_EMAIL E2E_PASSWORD=TEST_PASSWORD npm run test:e2e
```

Integration tests require an isolated `_test` database. Playwright is configured to use the already installed Google Chrome; it does not download a browser. Viewport emulation is not real iOS/Android-device verification. See ACCEPTANCE_CRITERIA and PROGRESS for exact observed results.

### Dokploy: local upload works, remote stalls partway

Changing only `FILE_MAX_BYTES` does not change the reverse proxy's request timeout, nor does redeploying an old code/image add the chunk protocol. Apply this source version, build the app/worker image, run migration `004_media_uploads.sql` using `node dist/scripts/migrate.js` in the newly built app container, then restart the updated app and worker. Never run bootstrap again for this upgrade. Set Dokploy environment variables:

```dotenv
FILE_MAX_BYTES=314572800
UPLOAD_REQUEST_TIMEOUT_MS=1800000
```

In the **app container** console, inspect only the relevant nonsecret settings:

```sh
node -e 'console.log({FILE_MAX_BYTES:process.env.FILE_MAX_BYTES,UPLOAD_REQUEST_TIMEOUT_MS:process.env.UPLOAD_REQUEST_TIMEOUT_MS})'
```

While logged in, open `/api/media/config`: the updated server must return `maxBytes: 314572800`, `chunkBytes: 8388608`, and `chunked: true`. The upload picker displays the effective per-file limit. A missing route or HTML response indicates the new backend is not serving this domain.

If an upload consistently stops at a similar elapsed time, inspect Traefik access/error logs for that request. Traefik's documented `entryPoints.<name>.transport.respondingTimeouts.readTimeout` default is 60s and covers the entire request body, independently of the app's env ([official reference](https://doc.traefik.io/traefik/reference/install-configuration/entrypoints/)). Chunking shortens requests. If the connection is too slow even for small chunks, merge a bounded timeout into the existing HTTP/HTTPS entry point configuration in Dokploy's Traefik settings, preserving its other settings:

```yaml
entryPoints:
  websecure:
    transport:
      respondingTimeouts:
        readTimeout: 300s
```

Use the actual entry point name configured on the server; this is **Traefik static configuration**, not an app environment variable or middleware label. Applying it may require restarting Traefik and affects the shared proxy. Do not replace the entire existing Traefik configuration with this fragment. The user performs infrastructure changes. No server-side proxy configuration was changed by this code update.
