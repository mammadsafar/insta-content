# Rooz · Content operations

Persian RTL internal operations for two configurable Instagram pages. A React client and Fastify API serve private content, approval, manual publication, scheduling, tasks, analytics, and reports. PostgreSQL stores business data and durable jobs; a separate worker processes reminders. Instagram credentials, scraping, automatic publishing, and automatic analytics are outside version one.

## Local startup

Requires Docker Engine/Desktop with the Compose v2 plugin. Node 24 is required only for host development and tests.

```sh
cp .env.example .env
openssl rand -hex 32
```

Put the generated value in `POSTGRES_PASSWORD` inside `.env`; do not paste production credentials. The password must be URL-safe because it is used inside `DATABASE_URL`. Set `APP_ORIGIN` to the exact browser origin, including a changed port.

```sh
docker compose -f compose.local.yml config --quiet
docker compose -f compose.local.yml build
docker compose -f compose.local.yml up -d db
docker compose -f compose.local.yml run --rm app node dist/scripts/migrate.js
docker compose -f compose.local.yml run --rm app node dist/scripts/bootstrap.js
docker compose -f compose.local.yml up -d app worker
docker compose -f compose.local.yml ps
```

Open <http://localhost:3001>. Bootstrap asks for owner name, email, and a hidden password of at least 12 characters. It creates exactly two empty pages with two required daily post slots per page. Names, usernames, reminders, and settings are configurable. It refuses to replace an existing owner. No default password, demo content, or synthetic metrics are loaded.

Both Compose files stand alone. Local exposes only `127.0.0.1:3001`; PostgreSQL has no host port. Database and media use persistent named volumes. `docker compose down` retains them; **`down -v` destroys them**.

## Entering analytics and downloading content

In Pages, choose the published or missing-analytics filter and use **ثبت آمار** on the content card. The type-specific form groups audience, engagement, sales, video and story metrics. Required fields are marked; missing, zero and unavailable remain distinct. Observation time is entered in Tehran time. Drafts can be resumed and finalized; corrections update a versioned observation while new entries create independent snapshots.

Use **ثبت آنالیز پیج** in the page header for the completed Saturday-to-Saturday page report. Any active member may enter data; analytical report visibility still follows page permissions. The content metadata shown beside analytics remains read-only after publication.

Approved and published cards expose **دانلود محتوا**. Download publication files, a separate cover and attached music individually, or use the ordered ZIP. These links serve immutable originals. A music URL alone is an external link, not an attached downloadable audio file. Dialog headers stay visible while their bodies scroll; closing a nested dialog keeps the parent open and restores the previous page position when the final dialog closes.

## Development and verification

The default local workflow runs the same production artifact as deployment. There are no source mounts. After edits, run `docker compose -f compose.local.yml up -d --build`. Compose Watch can rebuild on source changes with `docker compose -f compose.local.yml watch`; this is a rebuild workflow, not in-process hot reload. Host development optionally uses `npm ci`, `npm run dev`, and `npm run dev:web` with an explicitly configured development `DATABASE_URL` and `APP_ORIGIN`; database access can be through `docker compose exec db psql`, without publishing a database port. Vite development settings are in `vite.config.ts`.

```sh
npm ci
npm run check
npm run test:unit
# Full integration suite: set DATABASE_URL to an isolated database ending in _test.
DATABASE_URL=postgres://USER:PASSWORD@HOST:PORT/rooz_test npm test
npm run build
E2E_BASE_URL=http://localhost:3001 E2E_EMAIL=TEST_EMAIL E2E_PASSWORD=TEST_PASSWORD npm run test:e2e
# Isolated UI regression fixtures: no server, credentials or database required after building.
node_modules/.bin/playwright test tests/e2e/content-tools.spec.ts
```

Database integration tests require an isolated test database; see the test fixtures before setting `DATABASE_URL`. Never run integration fixtures against production. Tests must actually pass before a feature is described as verified. Current evidence and incomplete work are recorded in [acceptance criteria](docs/ACCEPTANCE_CRITERIA.md) and [progress](docs/PROGRESS.md).

## Production and operations

Use [deployment instructions](docs/DEPLOYMENT.md) for the independent `compose.production.yml`, existing HTTPS reverse proxy, migrations, safe owner creation, optional Push keys, and health checks. Production publishes no host ports. Read [backup and restore](docs/BACKUP_RESTORE.md) before retaining real data.

## Project continuity

- [Authoritative product specification](docs/PRODUCT_SPEC.md), [implementation plan](docs/IMPLEMENTATION_PLAN.md), [decisions](docs/DECISIONS.md), [acceptance mapping](docs/ACCEPTANCE_CRITERIA.md), [progress](docs/PROGRESS.md).
- [Architecture](docs/ARCHITECTURE.md), [data model](docs/DATA_MODEL.md), [permissions](docs/PERMISSIONS.md), [API contract](docs/API_CONTRACT.md), [official sources](docs/SOURCES.md).
- Graphify-generated project maps are preserved under [`graphify-out/`](graphify-out/). Consult `docs/PROGRESS.md` for the exact generation status and outputs; directory existence alone is not proof of successful generation.

## Execution preferences

The operator runs installation, Docker builds/startup and deployment commands. No default admin credentials exist: run migration and the interactive owner bootstrap above. No production deployment or Git commit has been performed.

Account settings: owners can use **مدیریت تیم و صفحه‌ها → بازنشانی رمز** beside a member to set and confirm a password of at least 12 characters. Resetting a password revokes every existing session of that member. Each user can choose, preview, save or remove their own photo in **حساب و نمایش → عکس پروفایل** (JPEG/PNG/WebP/GIF/AVIF, up to 5 MiB). Personal photos require no page permissions and appear in the desktop/mobile account buttons. Uploaded photos must belong to the current user; saved photos survive orphan cleanup.

This update requires migration `003_profile_avatars.sql` **before restarting the updated app/worker**. With local Compose, run these yourself:

```sh
docker compose -f compose.local.yml build app worker
docker compose -f compose.local.yml run --rm app node dist/scripts/migrate.js
docker compose -f compose.local.yml up -d app worker
```

For production, use the same sequence with `docker compose --env-file .env.production -f compose.production.yml`. No bootstrap is needed for an existing installation. Account UI regression tests: `npx --no-install playwright test tests/e2e/account-settings.spec.ts`; database regressions: `tests/auth.test.ts`, `tests/bootstrap.test.ts`, and `tests/media-routes.test.ts` against a migrated isolated test database.

Post analytics entry is available from **صفحه‌ها → صفحه موردنظر → آنالیز پست‌ها**. Search published posts, filter incomplete checkpoints, then choose **ورود / ویرایش دیتای آنالیز**. The form supports first-hour/next-day/later observations, content-specific metrics, unavailable flags, drafts and corrections.

Large uploads now use small sequential chunks with confirmed-offset retry, an effective runtime limit from `/api/media/config`, cancellation, and explicit timeout/error messages. Migration `004_media_uploads.sql` is required before starting the new app/worker. See [Dokploy upload troubleshooting](docs/DEPLOYMENT.md#dokploy-local-upload-works-remote-stalls-partway).
