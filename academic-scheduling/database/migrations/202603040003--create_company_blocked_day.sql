-- company_id is nullable: NULL means tenant-wide blocked day (applies to all child companies)
CREATE TABLE company_blocked_day (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NULL,
  company_id UUID NULL REFERENCES company(id) ON DELETE CASCADE,
  blocked_date DATE NOT NULL,
  reason TEXT NULL,
  created_by_user_id UUID NULL REFERENCES "user"(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Unique per (company_id, blocked_date) — NULL company_id treated as tenant-wide
  CONSTRAINT company_blocked_day_unique UNIQUE (tenant_id, company_id, blocked_date)
);

CREATE INDEX idx_company_blocked_day_company ON company_blocked_day(company_id) WHERE company_id IS NOT NULL;
CREATE INDEX idx_company_blocked_day_tenant ON company_blocked_day(tenant_id) WHERE company_id IS NULL;

CREATE TRIGGER trg_company_blocked_day_updated_at
  BEFORE UPDATE ON company_blocked_day
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
