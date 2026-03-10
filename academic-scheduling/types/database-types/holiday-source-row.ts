/**
 * Holiday Source Entity - Database Row Interface
 *
 * Caches external holiday data (national/state/municipal) fetched from
 * BrasilAPI or entered manually. Used by academic scheduling to detect
 * conflicts with holidays.
 *
 * @see Migration 202603080003 - Create holiday_source
 */

export type HolidaySourceType = 'national' | 'state' | 'municipal' | 'manual';

export interface HolidaySourceRow {
  id: string;
  tenant_id: string | null;
  company_id: string;
  year: number;
  source_type: HolidaySourceType;
  state_code: string | null;
  cep: string | null;
  holidays: Record<string, unknown>[];
  synced_at: string | null;
  created_at: string;
}

export interface CreateHolidaySourceInput {
  tenant_id?: string | null;
  company_id: string;
  year: number;
  source_type: HolidaySourceType;
  state_code?: string | null;
  cep?: string | null;
  holidays: Record<string, unknown>[];
  synced_at?: string | null;
}
