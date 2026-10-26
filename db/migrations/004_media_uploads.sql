CREATE TABLE media_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uploader_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  page_id uuid REFERENCES pages(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('content','feedback','music','insights','avatar','profile_avatar')),
  original_name text NOT NULL,
  mime_type text NOT NULL,
  size bigint NOT NULL CHECK (size > 0),
  received bigint NOT NULL DEFAULT 0 CHECK (received >= 0 AND received <= size),
  asset_id uuid REFERENCES assets(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((purpose='profile_avatar') = (page_id IS NULL))
);
CREATE INDEX media_uploads_expiry ON media_uploads(updated_at);
