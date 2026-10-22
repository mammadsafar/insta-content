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

Open <http://localhost:3000>. Bootstrap asks for owner name, email, and a hidden password of at least 12 characters. It creates exactly two empty pages with two required daily post slots per page. Names, usernames, reminders, and settings are configurable. It refuses to replace an existing owner. No default password, demo content, or synthetic metrics are loaded.

Both Compose files stand alone. Local exposes only `127.0.0.1:3000`; PostgreSQL has no host port. Database and media use persistent named volumes. `docker compose down` retains them; **`down -v` destroys them**.

## Development and verification

The default local workflow runs the same production artifact as deployment. There are no source mounts. After edits, run `docker compose -f compose.local.yml up -d --build`. Compose Watch can rebuild on source changes with `docker compose -f compose.local.yml watch`; this is a rebuild workflow, not in-process hot reload. Host development optionally uses `npm ci`, `npm run dev`, and `npm run dev:web` with an explicitly configured development `DATABASE_URL` and `APP_ORIGIN`; database access can be through `docker compose exec db psql`, without publishing a database port. Vite development settings are in `vite.config.ts`.

```sh
npm ci
npm run check
npm test
npm run build
npm run test:e2e
```

Database integration tests require an isolated test database; see the test fixtures before setting `DATABASE_URL`. Never run integration fixtures against production. Tests must actually pass before a feature is described as verified. Current evidence and incomplete work are recorded in [acceptance criteria](docs/ACCEPTANCE_CRITERIA.md) and [progress](docs/PROGRESS.md).

## Production and operations

Use [deployment instructions](docs/DEPLOYMENT.md) for the independent `compose.production.yml`, existing HTTPS reverse proxy, migrations, safe owner creation, optional Push keys, and health checks. Production publishes no host ports. Read [backup and restore](docs/BACKUP_RESTORE.md) before retaining real data.

## Project continuity

- [Authoritative product specification](docs/PRODUCT_SPEC.md), [implementation plan](docs/IMPLEMENTATION_PLAN.md), [decisions](docs/DECISIONS.md), [acceptance mapping](docs/ACCEPTANCE_CRITERIA.md), [progress](docs/PROGRESS.md).
- [Architecture](docs/ARCHITECTURE.md), [data model](docs/DATA_MODEL.md), [permissions](docs/PERMISSIONS.md), [API contract](docs/API_CONTRACT.md), [official sources](docs/SOURCES.md).
- Graphify-generated project maps are preserved under [`graphify-out/`](graphify-out/). Consult `docs/PROGRESS.md` for the exact generation status and outputs; directory existence alone is not proof of successful generation.
