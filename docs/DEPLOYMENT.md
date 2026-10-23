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

Production has **no `ports:` and no host networking**. Only `app` joins `${PROXY_NETWORK}`. Connect the existing reverse proxy to that network and route to `http://app:3000`. If the shared network contains other services named `app`, configure an unambiguous proxy upstream/container alias appropriate to your proxy. The proxy terminates TLS, preserves Host, forwards the correct client/protocol headers, allows the configured upload size and at least 120 seconds for uploads, and streams Range responses. Configure `TRUST_PROXY` to the actual number of trusted hops, default one. Do not expose the app directly to untrusted proxy peers.

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
| `FILE_MAX_BYTES` | Upload limit in bytes; default 104857600. |
| `MEDIA_ROOT` | Persistent private filesystem directory, `/app/media` in Compose. |
| `SESSION_TTL_DAYS` | Session lifetime, bounded to 1–30 days. |
| `TRUST_PROXY` | Trusted proxy hops; local false, production one. |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Optional Web Push settings. |
| `ORPHAN_GRACE_HOURS` | Worker orphan grace period, default 24; set on both services if overriding. |

No session-signing secret or mandatory paid service is required. Session tokens are opaque and stored only as hashes.

## Files and Push

The media named volume contains immutable originals and derived thumbnails. It is never publicly served. All access goes through authenticated routes; previews necessarily deliver media bytes to authorized viewers and cannot prevent browser saving or screenshots. Download preparation checks the current approval. Video thumbnails require an explicitly uploaded cover; opening a grid never downloads every video. Uploads have progress/retry; **resumable uploads are not implemented or claimed**. References in old revisions are retained indefinitely; only unattached uploads older than the grace period are cleaned.

Generate optional VAPID keys yourself with the installed dependency:

```sh
node --input-type=module -e "import webpush from 'web-push'; console.log(webpush.generateVAPIDKeys())"
```

Put the keys only in the protected environment file and set `VAPID_SUBJECT` to your contact `mailto:` URL or HTTPS URL. Recreate app/worker yourself after changes. Users opt in from Settings. Permission denial and unsupported browsers retain in-app notifications. iOS/iPadOS may require installation to the home screen. Delivery timing depends on OS/browser/network; real Push delivery has not been tested without operator keys/devices.

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
