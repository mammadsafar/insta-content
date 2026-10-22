CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, email text NOT NULL UNIQUE,
 password_hash text NOT NULL, role text NOT NULL CHECK(role IN ('owner','member')) DEFAULT 'member',
 active boolean NOT NULL DEFAULT true, theme text NOT NULL DEFAULT 'system' CHECK(theme IN ('light','dark','system')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX one_owner ON users(role) WHERE role='owner';
CREATE TABLE sessions (token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE pages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, username text NOT NULL DEFAULT '', avatar_id uuid,
 settings jsonb NOT NULL DEFAULT '{"nextDayReminderTime":"09:00","weeklyReminderTime":"09:00"}',
 reminder_user_id uuid REFERENCES users(id), schedule_version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE permissions (user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, page_id uuid NOT NULL REFERENCES pages(id), can_edit boolean NOT NULL DEFAULT false, can_suggest boolean NOT NULL DEFAULT false, can_report boolean NOT NULL DEFAULT false, PRIMARY KEY(user_id,page_id));
CREATE TABLE topics (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), page_id uuid NOT NULL REFERENCES pages(id), name text NOT NULL, UNIQUE(page_id,name));
CREATE TABLE assets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), page_id uuid NOT NULL REFERENCES pages(id), uploader_id uuid NOT NULL REFERENCES users(id),
 purpose text NOT NULL CHECK(purpose IN ('content','feedback','music','insights','avatar')), original_name text NOT NULL,
 storage_key text NOT NULL UNIQUE, mime_type text NOT NULL, size bigint NOT NULL CHECK(size>0), thumbnail_key text,
 width integer, height integer, completed boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE story_packages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), page_id uuid NOT NULL REFERENCES pages(id), date date NOT NULL,
 name text NOT NULL DEFAULT 'داستان‌های امروز', version integer NOT NULL DEFAULT 1,
 approved_signature jsonb, approved_by uuid REFERENCES users(id), approved_at timestamptz,
 created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE content (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), page_id uuid NOT NULL REFERENCES pages(id),
 type text NOT NULL CHECK(type IN ('reel','image','image_carousel','video_carousel','mixed_carousel','image_story','video_story')),
 data jsonb NOT NULL DEFAULT '{}', revision integer NOT NULL DEFAULT 1,
 state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','awaiting_approval','changes_required','approved','published')),
 approved_revision integer, approved_by uuid REFERENCES users(id), approved_at timestamptz,
 creator_id uuid NOT NULL REFERENCES users(id), followup_user_id uuid NOT NULL REFERENCES users(id),
 package_id uuid REFERENCES story_packages(id), package_position integer,
 claim_user_id uuid REFERENCES users(id), claim_revision integer, claimed_at timestamptz,
 published_at timestamptz, published_by uuid REFERENCES users(id), publication_url text,
 trashed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK((state='published')=(published_at IS NOT NULL)),
 CHECK(state NOT IN ('approved','published') OR approved_revision=revision)
);
CREATE INDEX content_page_state ON content(page_id,state) WHERE trashed_at IS NULL;
CREATE TABLE content_revisions (content_id uuid NOT NULL REFERENCES content(id), revision integer NOT NULL, data jsonb NOT NULL, author_id uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(content_id,revision));
CREATE TABLE schedule_rules (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), page_id uuid NOT NULL REFERENCES pages(id), effective_date date NOT NULL, posts_per_day integer NOT NULL DEFAULT 2 CHECK(posts_per_day BETWEEN 1 AND 24), times jsonb NOT NULL DEFAULT '[]', UNIQUE(page_id,effective_date));
CREATE TABLE schedule_slots (
 page_id uuid NOT NULL REFERENCES pages(id), date date NOT NULL, position integer NOT NULL CHECK(position>0), time time,
 content_id uuid NOT NULL UNIQUE REFERENCES content(id),
 CONSTRAINT slot_assignment PRIMARY KEY(page_id,date,position) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE schedule_operations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), page_id uuid NOT NULL REFERENCES pages(id), actor_id uuid NOT NULL REFERENCES users(id), operation text NOT NULL, before_state jsonb NOT NULL, after_state jsonb NOT NULL, applied_version integer NOT NULL, undone boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE feedback (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), content_id uuid NOT NULL REFERENCES content(id), revision integer NOT NULL,
 author_id uuid NOT NULL REFERENCES users(id), text text, audio_id uuid REFERENCES assets(id), asset_id uuid REFERENCES assets(id),
 offset_seconds numeric CHECK(offset_seconds>=0), parent_id uuid REFERENCES feedback(id), resolved boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), resolved_by uuid REFERENCES users(id), resolved_at timestamptz
);
CREATE TABLE task_templates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL, creator_id uuid NOT NULL REFERENCES users(id), assignee_id uuid NOT NULL REFERENCES users(id),
 priority integer NOT NULL DEFAULT 2 CHECK(priority BETWEEN 1 AND 3), weekdays jsonb, due_date date, owner_assigned boolean NOT NULL DEFAULT false,
 active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE task_occurrences (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), template_id uuid NOT NULL REFERENCES task_templates(id), date date NOT NULL,
 completed_at timestamptz, completed_by uuid REFERENCES users(id), UNIQUE(template_id,date)
);
CREATE TABLE analytics_snapshots (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), content_id uuid NOT NULL REFERENCES content(id), checkpoint text NOT NULL CHECK(checkpoint IN ('first_hour','next_day','later')),
 observed_at timestamptz NOT NULL, metrics jsonb NOT NULL DEFAULT '{}', unavailable jsonb NOT NULL DEFAULT '[]', finalized boolean NOT NULL DEFAULT false,
 submitter_id uuid NOT NULL REFERENCES users(id), finalized_at timestamptz, version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE weekly_reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), page_id uuid NOT NULL REFERENCES pages(id), period_start date NOT NULL, period_end date NOT NULL,
 metrics jsonb NOT NULL DEFAULT '{}', notes text NOT NULL DEFAULT '', screenshots jsonb NOT NULL DEFAULT '[]', finalized boolean NOT NULL DEFAULT false,
 submitter_id uuid NOT NULL REFERENCES users(id), submitted_at timestamptz, version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(page_id,period_start)
);
CREATE TABLE work_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), dedupe_key text NOT NULL UNIQUE, type text NOT NULL,
 page_id uuid NOT NULL REFERENCES pages(id), content_id uuid REFERENCES content(id), checkpoint text, period_start date,
 assignee_id uuid REFERENCES users(id), due_at timestamptz NOT NULL, completed_at timestamptz, completed_by uuid REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), dedupe_key text NOT NULL UNIQUE, type text NOT NULL, payload jsonb NOT NULL DEFAULT '{}',
 run_at timestamptz NOT NULL DEFAULT now(), status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','done','failed')),
 attempts integer NOT NULL DEFAULT 0, locked_at timestamptz, last_error text, created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
);
CREATE INDEX jobs_due ON jobs(run_at) WHERE status='pending';
CREATE TABLE notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), type text NOT NULL, title text NOT NULL,
 target jsonb NOT NULL DEFAULT '{}', actor_id uuid REFERENCES users(id), read_at timestamptz,
 dedupe_key text UNIQUE, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE push_subscriptions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), endpoint text NOT NULL UNIQUE, subscription jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE audit_logs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid REFERENCES users(id), action text NOT NULL, target_type text NOT NULL, target_id text NOT NULL, detail jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE worker_heartbeats (id text PRIMARY KEY, updated_at timestamptz NOT NULL DEFAULT now());
