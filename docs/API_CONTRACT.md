# Shared implementation contract

All API routes use `/api`. Success is `{data: value}`, errors `{error: string, code?: string}`. Body/property names are camelCase; returned SQL rows use snake_case unless explicitly mapped. UUID ids. JSON dates are ISO dates/instants. Expected versions/revisions are required on edits. User: `{id,name,email,role:'owner'|'member',active,theme,permissions:[{page_id,can_edit,can_suggest,can_report}]}`.

## Foundation exports

`server/core/db.ts`: `pool: Pool`, `query(text, values?): Promise<any[]>`, `one(text,values?): Promise<any|undefined>`, `transaction<T>(fn:(client:PoolClient)=>Promise<T>):Promise<T>`.
`server/core/security.ts`: `HttpError(statusCode,message,code?)`, `requireUser(request):User`, `requireOwner(user):void`, `can(user,pageId,'edit'|'suggest'|'report'):boolean`, `authorize(user,pageId,permission):void`, `audit(client,actorId,action,targetType,targetId,detail):Promise<void>`, `notify(client,userId,type,title,target,actorId?,dedupeKey?):Promise<void>`.
`server/core/time.ts` operations worker owns this file; exports `localDate(instant?:Date):string`, `weeklyPeriod(instant?:Date):{start:string,end:string}`, `nextDayReminder(publishedAt:Date,time?:string):Date`.
All module route functions: `export async function registerX(app:FastifyInstance):Promise<void>`; authenticated `/api` requests have `request.user` populated by root hook. Use `zod` validation and `HttpError`; DB failures are centrally sanitized.

## Routes

- Auth: POST `/auth/login` `{email,password}`; POST `/auth/logout`; GET `/auth/me`; PATCH `/auth/me` `{theme?,name?,password?,currentPassword?}`. Owner GET/POST `/users`; PATCH `/users/:id` `{name?,active?,password?,permissions?:[{pageId,canEdit,canSuggest,canReport}]}`.
- Pages GET `/pages`; PATCH `/pages/:id` owner `{name?,username?,avatarId?,settings?,reminderUserId?}`. GET/POST `/pages/:id/topics` `{name}`.
- Content GET `/pages/:pageId/content?state=&kind=post|story&trash=` returns array joined slot fields; POST same `{type,title?,caption?,topic?,scenario?,hook?,description?,cta?,assets?:string[],coverId?,music?:object,packageId?,packagePosition?,scheduledDate?,scheduledOrder?,scheduledTime?}`; GET `/content/:id` returns content joined slots plus revisions, feedback, assets metadata. PATCH `/content/:id` `{expectedRevision,...output fields,followupUserId?}`; POST `/content/:id/submit|approve|revoke` `{expectedRevision,reason?}`; POST `/content/:id/feedback` `{text?,audioId?,assetId?,offsetSeconds?,parentId?}`; PATCH `/feedback/:id` `{resolved}`.
- Publication POST `/content/:id/claim|release|publish` `{expectedRevision,url?}`; PATCH `/content/:id/publication-url` `{url}`. Publish creates jobs with dedupe keys `analytics:<contentId>:first_hour|next_day`, payload `{contentId,pageId,checkpoint}`; runAt derived from published time.
- Scheduling POST `/pages/:pageId/schedule/preview` `{operation:'swap'|'insert'|'delete'|'restore',contentId,targetId?,slot?:{date,position,time?}}`; POST `/pages/:pageId/schedule/apply` same plus `{expectedVersion,previewHash}`. GET/POST `/pages/:pageId/schedule/rules` `{effectiveDate,postsPerDay,times?:string[]}`. Preview returns `{version,previewHash,changes:[{contentId,from,to}],operation,...}`; page row schedule_version lock. Undo endpoint optional implemented safely with version.
- Stories GET/POST `/pages/:pageId/packages?date=` `{date,name}`; PATCH `/packages/:id` `{name?,date?,expectedVersion}`; POST `/packages/:id/approve` `{expectedVersion}`; POST `/packages/:id/publish` `{items:[{id,revision}]}`. Story content routes otherwise common. Approvals store package signature of unpublished item revisions/order.
- Media POST `/media?purpose=content|feedback|music|insights|avatar&pageId=` multipart file field `file`, returns `{id,...}` metadata. GET `/media/:id` streams preview with Range; GET `/media/:id/download`; GET `/content/:id/download.zip` approved/published ordered originals. Query `thumbnail=1` for generated images. File list references are UUIDs in revisions and content.data.assets.
- Tasks GET `/tasks?date=`; POST `/tasks` `{title,assigneeId?,priority?,dueDate?,recurrence?:{weekdays:number[]}}` Saturday=6 JS weekdays; POST `/tasks/:id/complete` `{date?}`; PATCH `/tasks/:id` `{title?,active?,dueDate?}`. Returned occurrences include template metadata.
- Analytics GET `/content/:id/analytics` entry history allowed to members; POST same `{checkpoint:'first_hour'|'next_day'|'later',observedAt,metrics,unavailable?:string[],finalized:boolean}`; PATCH `/analytics/:id` `{expectedVersion,...}` correction audit. GET `/analytics/fields?type=` field definitions. Metrics keys camelCase from spec.
- Weekly GET/POST `/pages/:pageId/weekly-reports` `{periodStart,metrics,notes?,screenshots?:string[],finalized}`; PATCH `/weekly-reports/:id` `{expectedVersion,...}`. Work completion updates reminders.
- Today GET `/today` operational data with report aggregates only for authorized pages.
- Reports GET `/reports?pageId=&from=&to=&type=&topic=&state=` only authorized pages; returns named datasets without fabricating zero/missing.
- Notifications GET `/notifications`; PATCH `/notifications/:id` `{read:true}`; GET `/push/config`; POST `/push/subscriptions` browser subscription JSON; DELETE same `{endpoint}`.

## Database

Read `db/migrations/001_initial.sql` before implementation. JSONB output metadata uses camelCase; relational columns snake_case. UUID defaults use gen_random_uuid(). `pages.settings` contains default `nextDayReminderTime` and `weeklyReminderTime` (09:00). Modules may add a separate numbered migration, never modify another worker's files. Shared schema changes must be coordinated with root.
