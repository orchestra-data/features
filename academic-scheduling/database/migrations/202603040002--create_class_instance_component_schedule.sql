CREATE TABLE class_instance_component_schedule (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NULL,
  class_instance_id UUID NOT NULL REFERENCES class_instance(id) ON DELETE CASCADE,
  component_id UUID NOT NULL REFERENCES component(id) ON DELETE CASCADE,
  scheduled_date TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ NULL
);

CREATE UNIQUE INDEX class_instance_component_schedule_unique
  ON class_instance_component_schedule(class_instance_id, component_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_cics_class_instance ON class_instance_component_schedule(class_instance_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_cics_component ON class_instance_component_schedule(component_id) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_cics_updated_at
  BEFORE UPDATE ON class_instance_component_schedule
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
