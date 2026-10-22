# Data model

The migration SQL under `db/migrations/` is the schema source of truth. UUIDs identify records; timestamps are timezone-aware. JSONB stores validated versioned metadata and metric maps, while identity, permissions, ordering and work-state constraints remain relational.

| Tables | Responsibility and important constraints |
| --- | --- |
| `schema_migrations` | Applied migration filename and timestamp. Session advisory lock serializes migration runners; each migration and its marker commit atomically. |
| `users`, `sessions` | Unique email; one owner enforced by a partial unique index. Password and session-token hashes only. Active account and session expiration are checked on requests. |
| `pages`, `permissions`, `topics` | Two bootstrap pages, editable display/settings, reminder recipient, page schedule version. Per-user/page edit/suggest/report flags; topic names unique within page. |
| `assets` | Private original key, MIME, positive size, completion state, thumbnail metadata, uploader, purpose and page. File bytes live on the media volume. |
| `content`, `content_revisions` | Stable identity, current output JSON and revision, owner approval revision, follow-up member, publication claim and server timestamp, soft trash. Revision history keys `(content_id,revision)`. |
| `schedule_rules`, `schedule_slots`, `schedule_operations` | Effective-date rules; local date/position/time slot assignment; change history. One assignment per content and deferred unique page/date/position constraint support transactional shifts. |
| `story_packages` | Page, date, name, version and signature of the approved remaining sequence. Story items are content rows with package and position references. |
| `feedback` | Revision-scoped text/voice, optional asset/time reference, replies and resolution actor/time. Suggestions remain separate from output data. |
| `task_templates`, `task_occurrences` | Assignment, priority, optional weekdays/due date and owner-assigned flag. Independent completion per `(template_id,date)`. |
| `analytics_snapshots` | Content/checkpoint, actual observation time, metrics, explicit unavailable fields, draft/final state, submitter and correction version. New observations retain older rows. |
| `weekly_reports` | Unique page and period start, exact end date, Instagram page metrics, screenshots, draft/final state, submitter and correction version. |
| `work_items` | Stable deduplication key, due time, responsibility and actual completing member; links publication checkpoints and weekly reports to Today. |
| `jobs` | Durable pending/running/done/failed state, due time, attempts, lock and sanitized error. Unique deduplication key supports idempotency. |
| `notifications`, `push_subscriptions` | Recipient, event, actor, timestamp, target/deep link and read state; unique endpoint subscriptions and deduplicated events. |
| `audit_logs`, `worker_heartbeats` | Actor/action/target/detail history; worker liveness timestamps. |

## Semantics

- Content `data` includes camelCase fields such as `title`, `caption`, `topic`, `scenario`, `hook`, `description`, `cta`, ordered `assets`, `coverId`, and `music`. A content ID does not change when assets are replaced.
- Local dates are ISO Gregorian dates internally. They are not UTC midnight instants and must not pass through timezone conversion. The UI displays Jalali dates. Saturday periods and next-day reminders are computed in `Asia/Tehran`.
- Missing metrics are absent, measured zero remains `0`, and an explicitly unavailable metric is `null` with its key in `unavailable`. Draft is separate from finalized. Corrections record history; new observations append snapshots.
- `published_at` records the platform publication action time, never an Instagram-verified event. Published records remain visible rather than being copied to another table.
- Trash is a recoverable application state until the documented retention cleanup removes unreferenced files. A restored record must obtain a valid new slot without moving published records.
- Revisions and historical reports can reference older assets, so cleanup and restore must account for historical references. Do not delete files simply because they are absent from the current grid.

## Migration operations

Run the compiled migration command explicitly before starting a new release. Numbered SQL files are ordered lexically. Applied files must be immutable; schema changes use a new file. Migration scripts use an advisory lock and roll back an individual failing migration. Backup before schema changes. No automatic rollback or destructive downgrade command is provided; restore the validated backup into a clean environment when rollback requires reversing data changes.
