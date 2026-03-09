ALTER TABLE class_instance_component_schedule
  ADD COLUMN company_event_id UUID NULL REFERENCES company_event(id) ON DELETE SET NULL;

CREATE INDEX idx_cics_company_event
  ON class_instance_component_schedule(company_event_id)
  WHERE company_event_id IS NOT NULL;
