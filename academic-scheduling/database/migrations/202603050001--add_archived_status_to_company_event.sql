-- Add archived_at to company_event for soft-archiving past events
-- Archived events are hidden from the main list but still accessible.

ALTER TABLE company_event
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_company_event_archived_at
  ON company_event(archived_at) WHERE archived_at IS NOT NULL;
