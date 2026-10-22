# Technical sources

Only official international English-language documentation and upstream projects are used for technical decisions. References are implementation guidance; they are not sources of business content or analytics. Browser availability must still be checked on the actual target devices. Reviewed during implementation on 2026-10-22.

| Official source | Decision supported |
| --- | --- |
| [Node.js release lifecycle](https://nodejs.org/en/about/previous-releases) | Use maintained Node 24 in all Docker stages; `package.json` declares the runtime requirement. |
| [Fastify support policy](https://fastify.dev/docs/latest/Reference/LTS/) and [Fastify v5 migration](https://fastify.dev/docs/latest/Guides/Migration-Guide-V5/) | Fastify 5 on a supported Node runtime; explicit schema/route and error handling. |
| [node-postgres transactions](https://node-postgres.com/features/transactions) | A transaction uses the same checked-out client for BEGIN, locking, mutations and COMMIT/ROLLBACK. Parameterized queries preserve data/code separation. |
| [PostgreSQL explicit locking](https://www.postgresql.org/docs/17/explicit-locking.html) and [SELECT locking clauses](https://www.postgresql.org/docs/17/sql-select.html#SQL-FOR-UPDATE-SHARE) | Page/content row locks, advisory migration/bootstrap locks and durable job claiming with SKIP LOCKED. |
| [PostgreSQL constraints](https://www.postgresql.org/docs/17/ddl-constraints.html) | Unique owner, assignment, report-period and deduplication constraints, including deferred slot uniqueness. |
| [Docker multistage builds](https://docs.docker.com/build/building/multi-stage/) | Compile once and copy build output and production-only dependencies into a non-root runtime stage. |
| [Docker Compose networking](https://docs.docker.com/compose/how-tos/networking/) | Service-name discovery, internal private network, existing external proxy network and separate worker egress. `expose` does not enforce isolation. |
| [Compose production guidance](https://docs.docker.com/compose/how-tos/production/) | Independent production configuration with restart policy, immutable source and runtime hardening. |
| [Compose Watch](https://docs.docker.com/compose/how-tos/file-watch/) | Optional local rebuild-on-change workflow, explicitly distinct from hot reload. |
| [PostgreSQL pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html) and [pg_restore](https://www.postgresql.org/docs/17/app-pgrestore.html) | Logical database backups and validated clean-target recovery; coordinated media backup while writers are stopped. |
| [MDN Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API), [Notifications](https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API), [Service workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API) | Secure-context feature detection, user permission, server-originated delivery and in-app fallback. Delivery timing depends on browser, permission and network. |
| [WebKit Web Push for web apps](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/) | iOS/iPadOS installation and permission behavior requires device-aware guidance; do not promise universal background Push. |
| [MDN Web app manifests](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest) | Install metadata/icons/standalone display; installation support varies by browser. |
| [Node crypto scrypt](https://nodejs.org/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback) | Salted adaptive password derivation; opaque session tokens stored as hashes rather than cleartext. |
| [MDN Intl.DateTimeFormat](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat) | Persian/Jalali presentation and explicit Asia/Tehran formatting; date-only business values stay separate from instants. |
| [jalaali-js upstream](https://github.com/jalaali/jalaali-js) | Validating Jalali days/leap years and converting picker selections; upstream behavior is covered by project date tests. |
| [Sharp documentation](https://sharp.pixelplumbing.com/) and [file-type upstream](https://github.com/sindresorhus/file-type) | Non-destructive image thumbnails and binary format validation instead of trusting client MIME or filenames. |

Exact dependency versions and integrity hashes are recorded in `package-lock.json`. This project does not bundle proprietary Instagram assets or copy tutorial implementations. Review upstream package licenses before redistributing a modified deployment.
