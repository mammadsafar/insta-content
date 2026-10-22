# Architecture decisions

2026-10-22. The supplied specification is approved; implementation proceeds without reopening discovery.

- Modular monolith: Fastify 5, TypeScript, React 19, Vite 8, Node 24 LTS, PostgreSQL 17. Parameterized SQL through node-postgres is used instead of an ORM so locking, deferrable schedule constraints, and job leasing remain explicit. Exact package versions are recorded in package-lock.json.
- One database-backed durable queue; no Redis or object-storage dependency. A separate worker claims jobs with SKIP LOCKED. Shared private volume stores immutable original media and generated thumbnails.
- Authentication uses opaque random session tokens hashed in PostgreSQL, scrypt password hashes, HttpOnly SameSite cookies, Origin checks, and login throttling. No registration or default password.
- Date-only values use ISO Gregorian local dates internally and Jalali display. Instants use timestamptz. All business boundaries use Asia/Tehran.
- Schedule mutations lock the page row and check schedule_version. Sparse queues shift occupied assignments through their existing slots; only extension generates a new slot. Preview hashes/version checks prevent stale commits. Published assignments never move.
- Publication output is immutable per revision; editing creates a revision and clears approval. Scheduling and analytics are separate records. Published media/revisions cannot be edited.
- Missing metrics are omitted/null; zero is a number; unavailable is explicitly null plus an unavailable list. Finalization is a separate action with type/checkpoint validation.
- Source-only Graphify scans never include media, environment files, database volumes, or credentials. Documentation extraction is performed by the host agents, without paid API jobs.
- Saturday 09:00 Tehran is the default weekly reminder; next-day analytics reminder is 09:00 Tehran. They are configurable per page.
- External deployment, Instagram publishing, credentials, and existing infrastructure are outside this execution.
