-- Add scheduled_date column to component table
ALTER TABLE component ADD COLUMN scheduled_date TIMESTAMPTZ NULL;

-- Add index for scheduled_date to optimize queries filtering by date
CREATE INDEX idx_component_scheduled_date ON component(scheduled_date);
