# Operations API response shapes

All endpoints return `{data: ...}`. Relational attributes use snake_case; JSON metric keys use camelCase. Every route requires an active session. Any active member may enter analytics and weekly reports; viewing report histories and aggregates additionally requires page `can_report`.

## Tasks

`GET /api/tasks?date=YYYY-MM-DD` returns occurrence rows joined to template fields: `id` (occurrence), `template_id`, `date`, `completed_at`, `completed_by`, `title`, `assignee_id`, `assignee_name`, `priority`, `weekdays`, `owner_assigned`, `creator_id`, `active`, `due_date`, `overdue`. Completion uses `/api/tasks/:template_id/complete` with `{date}`. Owner assignments to other members with recurrence force priority 1. Personal tasks may be edited only by their creator; owner-assigned templates may be edited only by owner. Recurring history remains on its original date; unfinished one-offs remain in the list until completed.

## Analytics

`GET /api/analytics/fields?type=reel` returns `[{key,label,kind}]`, where kind is `number`, `percent`, or `text`. Render only these content-type-specific fields. Fields: `views`, `firstHourViews`, `nextDayViews`, `viewers`, `reach`, `likes`, `comments`, `shares`, `reposts`, `saves`, `followersGained`, `profileVisits`, `leads`, `directMessages`, `orders`, `attributedSales`, `salesAttributionNotes`. Video adds `videoDurationSeconds`, `averageWatchTimeSeconds`, `skipRatePercentage`, `reelsTabPercentage`, `explorePercentage`, `nonFollowersPercentage`. Story adds `storyReplies`, `storyLinkTaps`, `storyForward`, `storyBack`, `storyExits`.

Finalized entries require checkpoint views (`firstHourViews`, `nextDayViews`, or `views` for later), `reach`, video `averageWatchTimeSeconds`, story `storyExits`. `views` is also accepted as a checkpoint views alias. Marking a required field in `unavailable` satisfies completeness honestly. A field cannot have a value and be unavailable simultaneously. Missing keys remain absent; zero remains zero. Drafts may omit required fields.

`GET /api/content/:id/analytics` returns snapshot rows plus `elapsed_hours` and `late_entry` (first-hour observations after 90 minutes). POST always creates an independent observation. PATCH requires expectedVersion and appends before/after correction audit history; it never changes old snapshots by creating a new observation implicitly. Finalized snapshots cannot be reverted to draft. Observation cannot predate publication or be in the future. Any member's finalized entry completes the checkpoint work.

## Weekly reports

`GET /api/pages/:pageId/weekly-reports` returns full rows for report-authorized users. Entry-only users receive period identity/version/completion metadata, plus their own unfinished draft values; finalized or other-user values are redacted and marked `restricted`. This permits draft resumption and collision-safe corrections without analytical visibility. Date fields include `period_start` and `period_end` ISO dates. Fields accepted within `metrics`: `followersAtEnd` (required to finalize), `follows`, `unfollows`, `views`, `reach`, `interactions`, `profileVisits`, `directMessages`, `leads`, `orders`, `attributedSales`, `salesAttributionNotes`. Optional missing metrics stay absent. Period start must be Saturday and period must have ended. The unique page/period pair returns 409 on duplicate POST; use PATCH with expectedVersion for corrections. Corrections retain audit history. Screenshots must be completed Insights files on the same page uploaded by the submitter (or owner access).

## Today

`GET /api/today`: `{date,tasks,publications,approvals,workItems,missingAnalytics,missingWeekly,pageTrends}`.

- `publications`: content identity, type/data/state, followup_user_id, published_at, scheduled_date/order/time and overdue.
- `approvals`: awaiting approval content, owner only.
- `workItems`: assigned open work (all for owner), with page_name and due_at.
- `missingAnalytics`: content_id/page_id/type/title/published_at, missing_first_hour, missing_next_day; owner or assigned page recipient only.
- `missingWeekly`: page_id/name, period_start/end; owner or assigned page recipient only.
- `pageTrends`: report-authorized pages only; page_id/name/report_id/period_start/end/metrics/submitted_at. Missing reports have null report_id and metrics.

## Reports

`GET /api/reports` supports pageId/from/to/type/topic/state and returns `{content,weeklyTrends,plannedVsPublished,completeness,tasks}`.

- `content`: one row per finalized observation, or a null observation for unmeasured content; `snapshot_age_hours` preserves comparison age. Includes content output metadata and publication URL/time.
- `weeklyTrends`: exact page-level report values, prior exact week's `previous_metrics` (null if absent) and independent `internal_publication_count`. No page reach is synthesized from post reach.
- `plannedVsPublished`: counts by page.
- `completeness`: published/first_hour_completed/next_day_completed counts by page.
- `tasks`: occurrence/completed/overdue counts by assignee, own only for members. Empty if there are no report-authorized pages.

Explicit unauthorized page filters return 403. All returned content/page metrics are constrained to server-derived authorized page IDs. No percentage with an absent or zero denominator is fabricated.

## Durable worker and push

Publication `analytics_reminder` jobs create/check checkpoint work, consult current page recipient, and suppress completed work. Weekly work is created independently by worker, using last completed Tehran Saturday-to-Saturday period. Open work is reassigned from page settings on each tick. Daily reminders are unique by work/date and share the same key as initial analytics reminders. Notifications exist in-app before push is attempted.

Worker leases use PostgreSQL `FOR UPDATE SKIP LOCKED`, five-minute stale lease recovery, token checks, exponential retries (eight attempts), and durable sanitized failure records. Browser notification tags deduplicate retried delivery. Push expiry HTTP 404/410 removes subscriptions; absence of optional VAPID settings completes push jobs with in-app fallback. Endpoints are HTTPS allowlisted browser push providers only, excluding arbitrary hosts and private IP destinations.

`GET /api/push/config` returns `{enabled,publicKey}`. Subscribe with browser subscription JSON. Notification rows contain target metadata and target.href for deep links. Listing and read updates are scoped to the signed-in user.
