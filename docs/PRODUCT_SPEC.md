You are the lead product engineer, full-stack developer, and UI/UX designer for this project.

Build a complete, production-oriented internal content operations platform for managing two Instagram pages.

This document is the authoritative product specification. The product requirements have already been discussed and approved. Do not restart discovery or ask questions already answered here.

Your deliverable is a working application with persistent data, real file handling, enforced permissions, background jobs, tests, documentation, and Docker-based local and production environments.

A static prototype, mock dashboard, or collection of non-functional screens is not an acceptable final deliverable.

==================================================
1. WORKING RULES
==================================================

1. Inspect the repository, environment, installed skills, and applicable project instructions before making changes.
2. If the repository is empty, initialize a suitable project.
3. If code already exists, inspect it before deciding what to reuse or replace.
4. Proceed autonomously with routine, reversible implementation decisions.
5. Ask only when an unresolved issue materially blocks correct implementation, requires unavailable credentials, incurs an external cost, or involves a destructive or production action.
6. Respect all applicable permissions and mandatory approval gates.
7. Do not deploy to a real production server or modify existing infrastructure without a separate instruction.
8. Do not stop after writing a plan or scaffolding the UI.
9. Implement coherent, working vertical slices and continue until the agreed scope is complete.
10. Never claim that a feature works without verifying its actual behavior.
11. Clearly distinguish completed, partially implemented, blocked, and unimplemented features.
12. Communicate progress and final explanations to me in Persian.
13. Use English for code identifiers, technical documentation, and repository structure unless a file specifically requires Persian UI content.
14. Preserve project continuity through maintained documentation so another Codex session can resume without rediscovering the project.

The application UI must be Persian and RTL.

==================================================
2. EXTERNAL RESEARCH AND SOURCE POLICY
==================================================

For technical research, implementation references, compatibility information, dependency documentation, and externally sourced facts:

- Use only foreign/international sources.
- Prefer official English-language documentation, vendor documentation, standards, and upstream repositories.
- Do not use Persian-language tutorials, Iranian websites, or Persian aggregators as technical sources.
- Use primary sources for technical decisions.
- Verify current dependency compatibility and browser/platform limitations from official documentation.
- Record important source URLs and the decisions they support in docs/SOURCES.md.
- Do not copy substantial third-party code without checking its license and attribution requirements.

This source policy applies to research and external references. It does not replace the application's real business data.

Production content, analytics, tasks, and reports must come from authorized user input. Do not scrape Instagram, import unrelated internet data, or fabricate production metrics.

Demo data may be synthetic, but it must be clearly labeled, isolated from production, and loaded only through an explicit development/demo process.

==================================================
3. REQUIRED GRAPHIFY SKILL
==================================================

The Graphify skill is already installed in my development environment.

You must:

1. Discover the installed Graphify skill.
2. Read its SKILL.md and follow its actual instructions.
3. Do not guess Graphify commands, arguments, or output formats.
4. Use Graphify to document and map the project according to its supported capabilities.
5. Apply it early enough to establish a useful project map.
6. Update its outputs after major architectural milestones and before final delivery.
7. Reference its generated outputs from the project documentation.
8. Keep credentials, private media, personal records, database dumps, and secrets out of Graphify inputs and outputs unless its documented workflow safely requires otherwise.

Graphify should help make the following understandable, where supported:

- Modules and responsibilities.
- Dependencies.
- Entry points.
- Data flows.
- Background jobs.
- Authorization boundaries.
- Relationships between content, schedules, approvals, publication, tasks, and analytics.

Graphify complements written documentation; it does not replace product rules, setup instructions, or operational documentation.

If the installed skill cannot be found, search the configured skill locations and report the exact missing dependency. Do not claim Graphify was used when it was not. Do not silently replace it with a different tool.

==================================================
4. REQUIRED PROJECT DOCUMENTATION
==================================================

Create and maintain:

- docs/PRODUCT_SPEC.md
- docs/IMPLEMENTATION_PLAN.md
- docs/DECISIONS.md
- docs/PROGRESS.md
- docs/ACCEPTANCE_CRITERIA.md
- docs/ARCHITECTURE.md
- docs/DATA_MODEL.md
- docs/PERMISSIONS.md
- docs/SOURCES.md
- docs/DEPLOYMENT.md
- docs/BACKUP_RESTORE.md
- README.md

Also preserve Graphify-generated documentation in the locations required by its skill.

Document reasonable implementation assumptions rather than repeatedly interrupting me.

Maintain a clear mapping from requirements to implementation and verification status.

==================================================
5. PRODUCT PURPOSE
==================================================

The platform manages two Instagram pages:

- A pharmacist page.
- A facial and skincare page.

Page names, avatars, usernames, and settings must be configurable.

Primary workflows:

1. Prepare upcoming content several days in advance.
2. Upload final media and publication assets.
3. Preview content in an Instagram-like presentation.
4. Obtain mandatory owner approval.
5. Provide text and voice revision feedback.
6. Download approved assets and publish manually on Instagram.
7. Record publication status and time.
8. Manage personal and assigned daily tasks.
9. Enter content analytics manually.
10. Enter weekly page reports.
11. View today's operational status and page performance trends.

The product must remain pleasant and efficient after months of daily use.

Use progressive disclosure: keep frequently used screens simple and reveal details only when relevant.

==================================================
6. VERSION ONE SCOPE
==================================================

Include:

- Real authentication.
- User and permission management.
- Persistent database storage.
- Private media storage.
- In-app notifications.
- Web Push where supported and authorized by the user.
- Installable PWA.
- Responsive mobile and desktop UI.
- Persian RTL interface.
- Jalali calendar.
- Asia/Tehran business timezone.
- Light, dark, and system theme modes.
- Dockerized local and production environments.

Exclude from version one:

- Automatic Instagram publishing.
- Automatic Instagram analytics retrieval.
- Instagram login or password storage.
- Native mobile applications.
- Native home-screen widgets.
- AI content generation.
- Professional video editing.
- General team chat.
- Billing, subscriptions, and multi-tenant SaaS features.

Do not present excluded capabilities as implemented.

==================================================
7. ARCHITECTURE
==================================================

Prefer a modular monolith with clear responsibilities and a separate background worker when appropriate.

Avoid unnecessary microservices.

If the repository already has a suitable stack, evaluate continuing with it.

For an empty repository, a mainstream TypeScript/React stack, PostgreSQL, and a suitable ORM are reasonable defaults. Select maintained, compatible versions using official sources.

The architecture must support:

- Server-side authorization.
- Transactional scheduling operations.
- Durable background jobs.
- Private media access.
- Content revisions.
- Audit history.
- Reliable retries and idempotency.
- Self-hosting without mandatory paid services.

Use the same application artifact and product behavior in local and production environments. Environment-specific configuration must not create separate implementations.

==================================================
8. MANDATORY DOCKER REQUIREMENTS
==================================================

The entire application must be Dockerized.

Provide two independently usable Compose files:

- compose.local.yml
- compose.production.yml

Do not require the user to combine both files to run either environment.

Shared implementation may use common Dockerfile stages or supported YAML mechanisms, but each documented Compose command must work as supplied.

Required services should include, as appropriate:

- Web/application service.
- Background worker.
- PostgreSQL.
- Durable queue infrastructure if the chosen architecture requires it.
- Media storage service if the chosen architecture requires one.

Do not add Redis, object storage, or additional services without a concrete architectural reason.

Provide:

- Multi-stage Docker builds.
- Development and production targets where useful.
- A production runtime without development dependencies where practical.
- A non-root runtime user where supported.
- Health checks.
- Persistent volumes for database and media.
- Environment templates without secrets.
- Appropriate restart policies.
- Graceful shutdown behavior.
- Explicit migration instructions.
- An explicit safe owner-bootstrap command.
- Reproducible dependency installation with a lockfile.

LOCAL COMPOSE

- Publish only the host ports needed for local development.
- Prefer binding database and administrative development ports to 127.0.0.1.
- Support a practical development workflow.
- Document whether source mounts and hot reload are enabled.
- Keep local data persistent across container restarts.

PRODUCTION COMPOSE

- Do not use "ports:" on any service.
- Do not use host networking.
- Do not publish database, application, queue, storage, or administrative ports on the host.
- Use "expose:" for service ports where appropriate.
- Only the application service should join the network shared with an existing external reverse proxy, unless a documented requirement demands otherwise.
- Keep database, queue, and storage on private service networks.
- Assume the reverse proxy provides public ingress and HTTPS.
- Make the external proxy network name configurable.
- Document how the proxy reaches the application by service name and internal port.
- Do not assume "expose" is a firewall or security boundary; enforce isolation through network membership and application controls.
- Avoid provider-specific proxy labels unless the actual target proxy is known.
- Do not silently include an ingress service that publishes ports.

The key network difference is:
local development publishes selected ports; production exposes service ports internally only.

Production-specific build, restart, and security settings are allowed and should be documented.

Verify both Compose files using Docker Compose configuration validation. Verify the production configuration contains no published host ports.

Do not claim a production deployment succeeded merely because the Compose file validates.

==================================================
9. PRIMARY NAVIGATION
==================================================

Only three main sections:

1. Today.
2. Pages.
3. Reports.

Keep notifications accessible through a bell icon.

Place user settings, theme preferences, and owner administration in an appropriate menu.

Hide Reports from users who have no report-viewing permission.

Inside each page:

- Compact operational summary.
- Posts tab.
- Stories tab.

Avoid excessive menus, wide mobile tables, redundant cards, and deeply nested dialogs.

==================================================
10. VISUAL DESIGN
==================================================

Use an Instagram-inspired content presentation:

- Clean grid.
- Large media.
- Familiar line icons.
- Restrained spacing.
- Clear typography.
- Minimal decorative clutter.

Do not imply that this is an official Instagram application.

Use system interface fonts with suitable Persian fallbacks. Do not copy proprietary font files or unlicensed assets.

Themes:

- Light.
- Dark.
- Follow system.

Persist each user's preference.

Apply the theme consistently to forms, charts, previews, calendars, panels, and notifications.

Do not modify the actual colors of uploaded media.

Interaction quality should resemble polished iOS applications:

- Short, smooth transitions.
- Mobile bottom sheets where appropriate.
- Natural scrolling and snapping.
- No artificial waiting.
- Respect prefers-reduced-motion.
- Keyboard support.
- Visible focus states.
- Adequate contrast.
- Accessible touch targets.
- Safe-area support.
- Correct behavior with the on-screen keyboard.

==================================================
11. DATE AND TIME PICKERS
==================================================

Implement an iOS-style wheel picker.

Jalali date:

- Day column.
- Persian month column.
- Year column.
- Selected row centered inside a rounded highlight.
- Adjacent options progressively faded.
- Smooth scrolling with accurate snapping.
- Correct day validation when changing months or years.
- Correct leap-year behavior.
- Display the calculated weekday.

Time:

- Hour and minute columns.
- 24-hour format.
- Optional scheduled time.
- Explicit "No specific time" option.

Also support:

- Today.
- Tomorrow.
- This week's days with exact dates.
- Next week's days with exact dates.
- A Jalali calendar selection view.
- A clear final formatted weekday, full date, and optional time.

Use Asia/Tehran for business dates, task recurrence, reporting periods, and reminders.

Store actual instants consistently, preferably UTC.

Treat date-only schedule values as local calendar dates. Do not shift them accidentally through timezone conversion.

==================================================
12. USERS AND PERMISSIONS
==================================================

There is one primary owner with full administrative access.

All active members can view content from both pages.

Configurable permissions per user per page:

- Suggest revisions.
- Edit and manage content.
- View reports.

Editing includes:

- Creating content.
- Updating files, cover, caption, and metadata.
- Reordering carousel assets.
- Scheduling.
- Moving future posts.
- Deleting unpublished content.
- Managing story packages and story calendars.

Suggestion permission is independent of editing permission.

A user may be allowed to view and comment without being allowed to change content.

Owner-only actions:

- Final approval.
- Revoking approval.
- Managing permissions.
- Assigning analytics/report reminder responsibility.
- Creating Priority 1 tasks for members.

All active members may:

- Download approved publication assets.
- Manually publish approved content and record publication.
- Enter content analytics.
- Submit weekly page reports.

Separate data-entry access from analytical report visibility.

Users without report permission must not gain access to report aggregates through Today, other screens, exports, or APIs.

Enforce every permission on the server.

==================================================
13. CONTENT TYPES AND RECORDS
==================================================

Support:

- Reel/video.
- Single-image post.
- Image carousel.
- Video carousel.
- Mixed-media carousel.
- Image story.
- Video story.

Each content item has a stable identity independent of its current files.

Replacing an asset must not change the content identity, schedule position, or planned date.

Content fields:

- Code/short title.
- Page.
- Content type.
- Topic.
- Scenario/idea.
- Hook.
- Description.
- CTA.
- Caption.
- Ordered assets.
- Cover where relevant.
- Music instructions.
- Scheduled date.
- Optional scheduled time.
- Approval state.
- Published URL.
- Creator.
- Change history.

Allow minimal drafts.

Validate the required fields and completed uploads when submitting for approval.

Use reusable topic choices to avoid fragmented reporting caused by spelling variations.

==================================================
14. MUSIC
==================================================

Support optional music information per post/carousel and per story item.

Usage modes:

- Audio is already included in the final media.
- Add music manually in Instagram during publication.
- No additional music is required.

Allow any combination of:

- Audio attachment.
- URL.
- Track name.
- Notes.
- Desired start offset.
- Volume instructions.

Attached audio must be playable and downloadable.

A music URL does not imply permission or technical ability to fetch the audio automatically.

If music must be added later in Instagram, clearly indicate that in the preview and publication panel.

Do not pretend the preview includes audio that is only described in a note or external link.

==================================================
15. POSTS SHOWCASE
==================================================

Two modes:

PAGE PREVIEW
A clean Instagram-like grid for evaluating covers and composition.

MANAGEMENT
The same content with dates, workflow state, and compact indicators.

Use:

- One primary status badge.
- An open-revision indicator/count.
- An analytics completion indicator.
- Details on demand.

Useful filters:

- Upcoming.
- Awaiting approval.
- Changes required.
- Approved.
- Published.
- Missing analytics.

Top-of-page summary:

- Consecutive upcoming days covered by approved content.
- Empty publication slots in the next seven days.
- Awaiting-approval count.
- Changes-required count.
- Today's published count versus planned count.

Calculate coverage from actual consecutive required slots. Do not hide a gap tomorrow by counting posts prepared for a later week.

Published content must remain available through a published filter/list without creating a duplicate content record.

==================================================
16. PUBLICATION SCHEDULE
==================================================

Current schedule:

- Every day.
- Two posts per day per page.
- Four posts per day across both pages.

Each page has an independent configurable schedule.

Allow future schedule changes with an effective date.

A publication slot contains:

- A specific local date.
- An order within that day.
- An optional time.

Users can choose a specific date independently, including dates outside the default pattern. Preserve an unambiguous order.

Required operations:

SWAP
Swap two unpublished posts' slot assignments. Only those two posts exchange scheduled date/time/position.

INSERT BEFORE
Insert a post into a selected upcoming position and move subsequent scheduled posts one publication slot later.

DELETE
Move an unpublished item to trash and shift subsequent items one publication slot earlier.

EDIT CONTENT
Do not change its schedule position.

PUBLISHED CONTENT
Exclude it from normal reorder, shift, deletion, and rescheduling operations.

A shift means the next publication slot, not necessarily the next day.

When insertion extends the queue, propose a valid final slot based on the active schedule.

Show the consequences before applying a multi-item schedule change.

Changing the recurring schedule must not silently rearrange already scheduled posts.

Provide a separate explicit rescheduling operation.

Support:

- Clear swap and insert actions.
- Atomic updates.
- Conflict detection.
- Safe undo where possible.
- Trash and explicit restore behavior.

Define sparse-slot behavior explicitly. Do not silently lose intentionally selected dates or produce duplicate slot assignments.

A restore must show its scheduling consequences rather than silently displacing other content.

Each move/delete operation creates one summarized owner-only in-app notification, even if many posts shift.

No push notification for these move/delete events.

==================================================
17. CONTENT PREVIEW
==================================================

Open content with the preview as the primary focus.

Support:

- Profile/grid crop preview.
- Feed preview.
- Reel preview.
- Story preview.

Features:

- Play/pause.
- Seeking.
- Audio controls.
- Ordered carousel swiping.
- Cover display.
- Caption display.
- Representative Instagram interface overlays.
- Optional safe-area guides.

Keep approval and management controls outside the simulated content frame.

Make preview ratios and overlay settings centralized and maintainable.

Do not promise pixel-perfect equivalence to every Instagram version and device.

==================================================
18. WORKFLOW AND APPROVALS
==================================================

Primary states:

- Draft.
- Awaiting approval.
- Changes required.
- Approved.
- Published.

Approval must refer to a specific content revision.

Only the owner can grant final approval or revoke it.

Changes to publication output invalidate previous approval, including:

- Media.
- Cover.
- Caption.
- Asset order.
- Music/publication instructions that affect output.

A modified version becomes a draft that can be explicitly resubmitted.

Pure scheduling changes should not invalidate unchanged content approval.

Analytics entry must not invalidate approval.

Published content and its recorded publication time are locked in normal workflows.

Analytics and the publication URL can remain separately editable with appropriate history.

==================================================
19. REVISION FEEDBACK
==================================================

Users with suggestion permission can create:

- Text feedback.
- Recorded voice feedback.
- Uploaded audio feedback.
- Text and audio together.
- Timestamped video feedback.
- Slide-specific feedback.
- General feedback.

Capture:

- Author.
- Creation time.
- Content revision.
- Asset/slide.
- Video offset when relevant.
- Open/resolved state.
- Replies.

Allow capturing the current playback time and manually adjusting it.

Clicking a timestamp should seek to that point.

Member suggestions:

- Add an open-revision badge.
- Do not revoke approval.
- Do not block publication.

The owner can dismiss/resolve the suggestion or revoke approval and request mandatory changes.

A member marking "Fixed" is not equivalent to owner approval.

Keep old feedback attached to the old revision. Do not silently map its timestamps onto replacement media.

==================================================
20. MANUAL PUBLICATION
==================================================

Provide one publication preparation panel containing:

- Claim publication responsibility.
- Show who is preparing publication.
- Download ordered assets.
- Download cover.
- Copy caption while preserving formatting.
- View music instructions.
- Release/cancel responsibility.
- Mark as published.

Preserve original media for download.

For multiple assets, offer ordered individual downloads and a ZIP if appropriate.

Handle browser/mobile save limitations honestly.

Publication claiming must be atomic.

Allow the owner to release abandoned claims. Do not silently assume an abandoned claim means publication occurred.

When "Published" is clicked:

1. Revalidate permission and current approval.
2. Revalidate the content revision.
3. Record the current server time as the publication timestamp.
4. Record the publishing member.
5. Mark the content as published.
6. Create the relevant analytics reminder jobs.

The recorded time is the button-click time, not an Instagram-verified timestamp.

Repeated requests must not reset the timestamp or create duplicate jobs.

If the approved revision changes while someone is preparing publication, require them to refresh and review the current version before recording publication.

==================================================
21. STORY CALENDAR AND PACKAGES
==================================================

Each page has an independent story calendar.

Mobile default:

- Week/day selector.
- Ordered packages for the selected day.
- Navigation to future dates.

Also provide a useful monthly overview.

A day can contain:

- A default "Today's stories" package.
- Additional named packages such as morning and evening.

Each package contains ordered story items.

Before media exists, users can create slots with:

- Topic.
- Instructions.
- Position.

Attach final media later to the same item.

Editors can:

- Add.
- Edit.
- Reorder.
- Delete unpublished items.
- Move unpublished items between days/packages.

The owner approves the package as an ordered sequence.

Track publication and analytics separately for every story item.

Allow marking selected approved story items as published in one action, using that action's server timestamp for all selected items.

Partially published packages:

- Published items stay locked.
- Editing unpublished items preserves publication history.
- Renewed approval governs only the remaining unpublished portion.

Display package summaries:

- "3 of 5 published."
- "Analytics entered for 4 of 5."

Story changes must not trigger post-queue shifts or silently shift unrelated days.

==================================================
22. TASKS
==================================================

Task types:

1. Owner-assigned recurring tasks.
2. Personal recurring tasks.
3. One-off tasks.

Owner-assigned recurring tasks:

- Always Priority 1.
- Prominently displayed above other tasks.
- Members may complete them.
- Only the owner changes or removes their assigned recurrence template.

Members can create personal recurring and one-off tasks.

The owner can assign one-off tasks.

Support daily and selected-weekday recurrence.

Each occurrence must have independent history.

Rules:

- An incomplete recurring occurrence stays incomplete in its original day.
- A new occurrence appears on the next eligible day.
- Do not accumulate duplicate old recurring items in today's main list.
- One-off tasks remain until completed.
- Overdue state comes from due dates.
- Completed tasks appear in a collapsible section.
- Record completion time and actor.

System-generated work, such as weekly reporting, must complete when its corresponding form is finalized.

Do not create a separate manual task that remains open after the underlying work is finished.

==================================================
23. CONTENT ANALYTICS
==================================================

Preserve these fields.

Content metadata:
- Code/short title.
- Content URL.
- Publication date.
- Publication time.
- Content type.
- Topic.
- Scenario/idea.
- Hook.
- Description.
- CTA.

Metrics:
- Views during the first hour.
- Next-day views, corresponding to the requested "24-hour views" field.
- Viewers.
- Reach / accounts reached.
- Likes.
- Comments.
- Shares.
- Reposts.
- Saves.
- Followers gained.
- Profile visits.
- Leads.
- Direct messages.
- Orders.
- Attributed sales in toman.
- Sales attribution notes.
- Video duration in seconds.
- Average watch time in seconds.
- Skip rate percentage.
- Reels tab percentage.
- Explore percentage.
- Non-followers percentage.
- Story replies.
- Story link taps.
- Story forward.
- Story back.
- Story exits.

Leads, direct messages, and orders are separate fields. Do not sum them into unique customers.

Use content-type-specific forms.

FIRST-HOUR ENTRY

The first-hour metric is intended to be observed approximately one hour after publication.

If missed, do not silently substitute a later total.

Store observation/entry timing so a late entry is identifiable.

NEXT-DAY ENTRY

The team enters the statistics when they return the next day.

This may be 25, 27, or more hours after publication.

Store and display the actual snapshot time and elapsed time since publication.

Do not falsely label every next-day snapshot as measured at exactly 24 hours.

LATER ENTRIES

New observations create new snapshots.

Correcting a data-entry error in an existing snapshot is a separate operation with change history.

Distinguish:

- Missing.
- Zero.
- Unavailable/not applicable.

Allow draft saves.

Finalizing a snapshot is distinct from saving an incomplete draft.

Define minimal required fields for completion per content type. Do not force fabricated numbers for unavailable metrics.

Analytics badges must derive from actual finalized snapshot state.

==================================================
24. ANALYTICS RESPONSIBILITY AND REMINDERS
==================================================

The owner assigns a reminder recipient for each page.

This assignment controls responsibility and notifications, not exclusive entry permission.

Any active member can submit data.

When someone finalizes the required entry:

- Record the actual submitter.
- Complete the associated work item.
- Stop subsequent reminders for that checkpoint.
- Do not require duplicate submission by the assigned person.

Reassigning responsibility updates open work without duplicating jobs.

First-hour reminders derive from the recorded publication timestamp.

Use a configurable next-day reminder time with a documented default.

The actual snapshot time remains independent of the reminder time.

==================================================
25. WEEKLY PAGE REPORTS
==================================================

Submit one report per page on Saturday morning.

Reporting period:

Saturday 00:00 inclusive to the next Saturday 00:00 exclusive, Asia/Tehran.

This represents the previous Saturday through Friday.

Use a configurable reminder time, with a documented default such as 09:00.

Fields:

- Page.
- Exact reporting period.
- Followers at period end.
- Follows and unfollows where available.
- Views.
- Reach.
- Interactions.
- Profile visits.
- Recorded direct messages.
- Leads.
- Orders.
- Attributed sales.
- Attribution notes.
- General notes.
- Optional Insights screenshots.
- Submitter.
- Submission time.

Enforce uniqueness per page and reporting period.

Allow corrections with history.

Compute internal publication counts from platform records.

Do not replace Instagram page-level metrics with sums of post metrics, especially reach.

Missing reports must display "Not submitted," not zero.

==================================================
26. TODAY AND REPORTING
==================================================

OWNER TODAY

Prioritize actions:

- Awaiting approvals.
- Revised submissions.
- Today's publications.
- Overdue publications.
- Team Priority 1 status.
- Missing analytics.
- Missing weekly reports.
- Compact page trends with last-report date.

MEMBER TODAY

- Priority 1 tasks first.
- Personal recurring tasks.
- One-off tasks.
- Relevant publication work.
- Assigned analytics/report work.

REPORTS

Filters:

- Page.
- Date range.
- Content type.
- Topic.
- Workflow state.

Include:

- Content metric comparisons.
- Weekly page trends.
- Previous-week comparisons.
- Planned versus published counts.
- Data completeness.
- Task completion and overdue work.

Do not invent an opaque "page health" score.

Show metric-specific trends.

Handle zero denominators and missing comparison periods correctly.

Show snapshot age when comparing content metrics.

Do not silently compare a two-day-old snapshot with a twenty-day-old snapshot as though they were measured at the same age.

Do not mix report visibility with permission to enter report data.

==================================================
27. NOTIFICATIONS
==================================================

Notification records include:

- Type.
- Timestamp.
- Read/unread state.
- Actor when relevant.
- Target page/content/task/report.
- Deep link.

Events:

- Submitted for approval: owner.
- Mandatory changes requested: responsible editor.
- Revised submission: owner.
- Approval: relevant content/publication participant.
- Suggested revision: owner and relevant participants according to a documented policy.
- Task assignment: assignee.
- Analytics/report deadline: assigned page recipient.
- Move/delete: owner only, in-app only.

Default the content creator as its follow-up responsible person, with reassignment to an authorized member.

This assignment does not restrict other members from publishing approved content.

Aggregate related events.

Keep notifications, tasks, and submission state synchronized.

Avoid repeated push notifications for minor edits.

==================================================
28. FILES AND PERFORMANCE
==================================================

Private files with controlled access.

Implement:

- File type and size validation.
- Configurable size limits.
- Upload progress.
- Retry behavior.
- Draft preservation on failure.
- Upload completion validation before approval submission.
- Efficient thumbnails.
- Lazy-loaded grids.
- On-demand video loading.
- Original-file downloads.
- Orphan-file cleanup.
- Documented trash/retention behavior.
- Private voice-feedback attachments.
- Error logging without secrets.

If resumable uploads are claimed, implement and test them.

Do not download every video when opening a grid.

Do not perform destructive compression of the publication originals.

==================================================
29. PWA AND BROWSER BEHAVIOR
==================================================

Provide:

- Web app manifest.
- Appropriate icons.
- Standalone display.
- Device-aware installation guidance.
- User-initiated notification permission request.
- Permission-denied handling.
- Expired subscription handling.
- In-app notification fallback.
- Useful offline state.

Server jobs must trigger reminders even when the app is closed.

Push delivery may depend on browser, OS, permissions, and network. Do not promise exact-second delivery.

Do not mark offline approval, publication, or queue changes as successful before the server confirms them.

Prevent cached private data from leaking between signed-in users.

==================================================
30. SECURITY AND CONCURRENCY
==================================================

No public registration is required.

The owner creates or invites members.

Implement:

- Secure authentication and sessions.
- Environment-based secrets.
- Safe .env.example files.
- Server-side authorization.
- Protected file access.
- Appropriate XSS/CSRF protections.
- Rate limiting for sensitive endpoints.
- Safe text rendering.
- Audit logs.
- Revision or optimistic concurrency checks.
- Transactional queue operations.
- Idempotent publication and job creation.
- Durable job retries.
- Recovery from partial failures.

Protect against direct object reference attacks.

Do not rely on client-side state to determine approval validity.

Document database and media backup/restore.

==================================================
31. IMPLEMENTATION MILESTONES
==================================================

Use working vertical slices.

Suggested sequence:

1. Repository inspection, specification, decisions, Graphify discovery.
2. Docker local/production foundations and data model.
3. Authentication, permissions, page settings, themes, navigation.
4. Content upload, storage, grid, previews.
5. Revision history, voice/text feedback, approval.
6. Scheduling, swaps, insertion shifts, deletion, restore.
7. Story calendar and package workflows.
8. Manual publication and concurrency protection.
9. Tasks and Today views.
10. Analytics snapshots and weekly reporting.
11. Reports and visibility enforcement.
12. Durable notifications, reminders, and PWA.
13. End-to-end verification, performance review, documentation, Graphify refresh.

Adjust ordering when justified by dependencies.

Do not silently drop approved requirements.

==================================================
32. REQUIRED VERIFICATION
==================================================

Test meaningful business rules:

- Unauthorized API edits are rejected.
- Suggestion-only users cannot modify content.
- Suggestions do not revoke approval.
- Output-affecting changes invalidate approval.
- Scheduling-only changes preserve approval.
- Swap changes only two assignments.
- Insert/delete shifts are correct.
- Published items remain unchanged.
- Concurrent scheduling operations cannot corrupt order.
- Repeated publication requests preserve timestamp and avoid duplicate jobs.
- Old approval cannot authorize a new revision.
- Partially published story packages preserve published history.
- Recurring task occurrences remain independent.
- Overdue one-off tasks persist.
- Another member's analytics submission completes the responsible member's work.
- New analytics snapshots preserve old observations.
- Missing and zero remain distinct.
- Saturday reports use the correct Iran-local period.
- Jalali dates and timezone boundaries are correct.
- Report restrictions apply to dashboards and APIs.
- Production Compose contains no host-published ports.
- Persistent data survives container recreation with retained volumes.

Run an end-to-end workflow:

Create content
→ upload assets
→ submit for approval
→ add a suggested revision
→ owner requests changes
→ upload a new revision
→ owner approves
→ claim publication
→ download assets
→ record manual publication
→ enter analytics
→ submit weekly report
→ view authorized reports.

Verify the UI on representative iPhone, Android, and desktop viewports in both themes.

Check:

- RTL.
- Overflow.
- Safe areas.
- Mobile keyboard.
- Video controls.
- Wheel picker behavior.
- Reduced-motion behavior.
- Loading, empty, error, and retry states.

Do not claim real Instagram publication was tested; only the platform's manual-publication recording flow can be tested without actual external publication.

==================================================
33. DEFINITION OF DONE
==================================================

The project is ready only when:

- Local startup works through compose.local.yml.
- Production configuration works through compose.production.yml.
- Production publishes no host ports.
- Reverse-proxy networking is documented.
- Database and media persist across restarts.
- Real assets upload, preview, and download.
- Server permissions are enforced.
- Approval and publication workflows function.
- Queue mutations are transactional and reliable.
- Tasks and reports persist.
- Background jobs operate without an open browser.
- Both themes and mobile layouts are verified.
- External setup requirements are accurately documented.
- Demo content is clearly isolated.
- No dead buttons or hidden placeholders remain.
- Tests have actually run and results are reported.
- Graphify documentation has been generated and refreshed.

Final delivery must include:

1. Completed feature summary.
2. Exact local startup commands.
3. Production build and startup instructions.
4. Reverse-proxy connection instructions.
5. Safe initial owner creation.
6. Required environment variables.
7. File-storage and Push setup.
8. Migration procedure.
9. Test and verification results.
10. Known limitations and remaining work.
11. Backup and restore instructions.
12. Locations of written and Graphify-generated documentation.

Start by inspecting the environment, locating the installed Graphify skill, documenting the implementation plan, and then building the application.

Do not ask me to repeat decisions already specified above.