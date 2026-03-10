-- Create holiday_source table for caching external holiday data.
-- Stores national/state/municipal holidays fetched from BrasilAPI or manual input.

CREATE TABLE IF NOT EXISTS holiday_source (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenant(id),
  company_id UUID NOT NULL REFERENCES company(id),
  year INTEGER NOT NULL,
  source_type VARCHAR(20) NOT NULL,
  state_code VARCHAR(2),
  cep VARCHAR(9),
  holidays JSONB NOT NULL,
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_holiday_source_company_year ON holiday_source(company_id, year);
CREATE INDEX IF NOT EXISTS idx_holiday_source_tenant ON holiday_source(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_holiday_source_unique_sync
  ON holiday_source(company_id, year, source_type, COALESCE(state_code, ''), COALESCE(cep, ''));
