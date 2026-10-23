-- A package's visible sequence must stay unambiguous even if a future writer
-- bypasses the application-level page lock. Trash retains its original position.
CREATE UNIQUE INDEX story_package_visible_position
  ON content(package_id,package_position)
  WHERE package_id IS NOT NULL AND trashed_at IS NULL;
CREATE INDEX content_package_order ON content(package_id,package_position,id);
CREATE INDEX schedule_operations_page_version ON schedule_operations(page_id,applied_version);
