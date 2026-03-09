/**
 * Company Blocked Day Entity - Database Row Interface
 *
 * Records dates when a company is not available for scheduling (holidays, events, etc.).
 *
 * @see Migration: 202603040003--create_company_blocked_day.sql
 */

export interface CompanyBlockedDayRow {
  id: string;
  tenant_id: string | null;
  /** NULL means tenant-wide blocked day (applies to all child companies) */
  company_id: string | null;
  blocked_date: Date;
  reason: string | null;
  created_by_user_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateCompanyBlockedDayInput {
  tenant_id?: string | null;
  /** NULL means tenant-wide blocked day */
  company_id?: string | null;
  blocked_date: string | Date;
  reason?: string | null;
  created_by_user_id?: string | null;
}
