# Content Operations Implementation Plan

**Goal:** Build the complete approved Persian RTL, self-hosted content operations platform.
**Architecture:** React client and Fastify modular API share one application artifact. PostgreSQL provides transactional state and durable jobs; a separate worker processes reminders and cleanup. Private files live on a persistent volume.
**Spec:** [PRODUCT_SPEC.md](PRODUCT_SPEC.md), authoritative and unchanged.

## Global constraints

Persian UI and progress updates; English source/docs; Asia/Tehran business time; server-enforced page permissions; no production deployment; no fabricated business data; independent local/production Compose files; production publishes no host ports.

## Execution and ownership

The main engineer owns foundation/schema/authentication/integration. Parallel workers own disjoint module surfaces, as authorized by the supplied AGENTS.md. Each worker reads the contracts, writes meaningful tests first, implements, and reports actual verification. Other workers' edits must be preserved.

1. Foundation: `package.json`, `server/core/*`, `server/app.ts`, `db/migrations/001_initial.sql`; session and authorization tests in `tests/auth.test.ts`.
2. Content: `server/modules/content.ts`, `scheduling.ts`, `stories.ts`, `tests/content*.test.ts`; revision/approval/publication, atomic claims, queue previews, story partial publication.
3. Operations: `server/modules/tasks.ts`, `analytics.ts`, `reports.ts`, `notifications.ts`, `server/worker.ts`, `server/core/time.ts`, `tests/operations*.test.ts`; recurrence, snapshot history, work completion, Saturday periods, durable retries and push.
4. Private files: `server/modules/media.ts`, `server/core/storage.ts`, `tests/media*.test.ts`; authenticated streaming, validation, thumbnails, downloads and upload progress contract.
5. Interface: `web/*`, `vite.config.ts`, UI tests; polished responsive RTL Today/Pages/Reports, wheel/calendar, previews, editing, audio feedback, admin, notifications, PWA and offline state.
6. Environments/operations: Dockerfile, independent Compose files, env templates, `scripts/bootstrap.ts`, `scripts/migrate.ts`, operational docs and configuration tests.
7. Integration: execute full real-file workflow against PostgreSQL, adversarial API tests, Docker recreate persistence, both Compose validations, real browser checks in multiple viewports/themes. Repair observed failures.
8. Delivery: refresh Graphify and documentation, record precise acceptance status, commands and limitations.

## Verification sequence

For each business slice: write failing assertion → run to observe failure → implement → rerun. Root integration suite uses an isolated real PostgreSQL database. `npm run check`, `npm test`, `npm run build`, Docker Compose config validation, real Compose startup and worker execution precede completion claims.

## Review focus

- Concurrent output edit versus approval/publication: all paths lock content rows and verify expected revision.
- Sparse future slots and published records: previews explain exact consequences and a page version rejects stale applications.
- Restricted members: Today/report/API/export queries cannot return unauthorized aggregates.
- Missing, zero and late snapshots: retain observation timing and independent historical observations.
- Partial story publication: old published items remain locked and renewed approvals cover only current unpublished revisions.

## Progress

See [PROGRESS.md](PROGRESS.md) for checked outcomes and [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md) for requirement mapping.
