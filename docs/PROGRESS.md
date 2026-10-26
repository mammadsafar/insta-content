# Progress and handoff

## 2026-10-22 — initial inspection

- Repository is empty; no pre-existing application, .git, .codegraph, project navigation guide or project-local skills.
- Authoritative specification preserved verbatim in PRODUCT_SPEC.md.
- Node v24.9.0, npm 11.6.0, Docker Compose v2.39.4 and Docker Engine 28.4.0 detected. Docker access requires the approved command prefix.
- Graphify executable: `/Users/roodin/.local/bin/graphify`, uv package `graphifyy`. Actual packaged Codex skill read from `/Users/roodin/.local/share/uv/tools/graphifyy/lib/python3.14/site-packages/graphify/skill-codex.md`; references are under `graphify/skills/codex/references/`. It was not present in ordinary skill catalogs.
- Plan and shared interfaces written before implementation. No application behavior has been verified yet.

## Status definitions

Implemented = code exists. Verified = actual command/behavior passed. Partial = specified capability has remaining work. Blocked = external dependency prevents further verification. Do not equate a successful build with a production deployment.

## 2026-10-24 — analytics, original downloads and dialog scrolling

- Published cards now expose analytics entry and original downloads directly; page-level weekly entry is available from the page header. The missing-analytics filter now uses the actual finalized checkpoint flags returned by the API.
- Content analytics are grouped by audience, engagement, sales, video and story. Required fields, zero versus missing/unavailable, resumable drafts, finalized corrections and Tehran observation timestamps are explicit. A saved weekly report retains its version so a second save corrects it rather than creating a duplicate period.
- Original post files, covers and attached music have visible individual links and an ordered ZIP. The download endpoint always serves the original even when a thumbnail query parameter is present. External music links are not fetched automatically.
- Dialogs render through a body portal, outside transformed animation ancestors. A fixed header and independently scrolling body keep controls reachable. Scroll locking is counted across nested dialogs and restores the page's original position. Long metadata fields and mobile layouts were adjusted.
- Browser regression fixtures cover desktop, iPhone and Android dimensions in light/dark themes. Four scenarios across six configurations passed: analytics/drafts/corrections and weekly entry; original-download actions; nested scrolling and shortened viewport; editor metadata/music and nested date picker. API responses and download payloads in these browser fixtures are simulated; they do not prove a live deployment.
- Real PostgreSQL/media route tests in a temporary schema inside the isolated `rooz_test` database passed, including byte-for-byte original image download and the thumbnail-query regression. Temporary schema removed afterward. Shared old test fixtures initially interfered with orphan cleanup; isolated schema execution passed without changing shared fixtures.
- No dependencies installed, deployment performed, credentials changed or Git commit created. Physical iOS/Safari keyboard behavior and the operator's production environment remain unverified.

### Account administration and personal profile photos — 2026-10-25
- Added a dedicated owner-only password reset dialog with confirmation, using the existing reset endpoint; resetting revokes all member sessions. Existing-member permissions editing no longer hides a password reset field.
- Added personal profile image upload, preview, save/removal and desktop/mobile account images, independent of page editing permissions; supported images are capped at 5 MiB.
- Migration `003_profile_avatars.sql` separates page-scoped assets from personal avatars; attachment validates the current uploader, and orphan cleanup retains saved user images. Run migration before starting the updated artifact.
- Verified six isolated PostgreSQL integration cases covering reset/session revocation, avatar ownership/persistence/privacy, migration repeatability, original media and cleanup. Type checks and production build pass.
- Account UI verification: 12/12 Playwright scenarios pass across desktop, iPhone and Android layouts in light/dark themes, covering reset confirmation and personal photo save/removal. No installation, deployment or commit performed.

### Remote mobile uploads and direct post analytics entry — 2026-10-26
- User reports direct connection (no Cloudflare): local upload works, remote mobile upload usually stalls around 45%. No remote logs were available, so exact deployed/proxy cause remains unconfirmed. Identified 120-second application timeout, parallel file uploads, and automatic video metadata requests in the editor.
- Added durable upload sessions (migration `004_media_uploads.sql`), client 2 MiB sequential chunks/server maximum 8 MiB, confirmed-offset retry, cancel/retry states, effective upload configuration endpoint, and bounded per-request memory. Ownership/permissions and actual file type are checked before completion; final bytes are streamed and preserved.
- Added `UPLOAD_REQUEST_TIMEOUT_MS` (30-minute default), documented Dokploy runtime-env verification and independent Traefik read timeouts. No external proxy settings were changed.
- Removed video preload from editor rows, set preview video preload to none, and use derived thumbnails for image previews.
- Added **صفحه‌ها → آنالیز پست‌ها** with search, checkpoint completion filters and direct entry into the type-specific analytics form, available to every active member.
- Verification: production build, TypeScript and 11 standalone checks pass, including real Fastify/filesystem reconstruction of a synthetic 101 MiB file with SHA256 equality. Published analytics entry passes in all six viewport/theme projects. Real PostgreSQL migration/session integration tests were not run because Docker Desktop is paused; added tests are available for an isolated migrated test DB. Nothing installed, deployed or committed.
