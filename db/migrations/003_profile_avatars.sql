ALTER TABLE assets ALTER COLUMN page_id DROP NOT NULL;
ALTER TABLE assets DROP CONSTRAINT assets_purpose_check;
ALTER TABLE assets ADD CONSTRAINT assets_purpose_check CHECK (purpose IN ('content','feedback','music','insights','avatar','profile_avatar'));
ALTER TABLE assets ADD CONSTRAINT assets_profile_scope CHECK ((purpose='profile_avatar') = (page_id IS NULL));
ALTER TABLE users ADD COLUMN avatar_id uuid REFERENCES assets(id) ON DELETE SET NULL;
CREATE INDEX users_avatar ON users(avatar_id) WHERE avatar_id IS NOT NULL;
