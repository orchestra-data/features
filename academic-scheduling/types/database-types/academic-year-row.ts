/**
 * Academic Year Entity - Database Row Interface
 *
 * Defines the academic calendar period (Ano Letivo) for a company/institution.
 * Used for school days calculation, MEC compliance, and event warnings.
 *
 * @see Migration: 202603090001--create_academic_year.sql
 */

export type AcademicYearStatus = 'draft' | 'active' | 'completed' | 'archived';

export interface AcademicYearRow {
  id: string;
  tenant_id: string | null;
  company_id: string;
  name: string;
  start_date: Date;
  end_date: Date;
  min_school_days: number;
  min_hours: number;
  status: AcademicYearStatus;
  created_by_user_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateAcademicYearInput {
  tenant_id?: string | null;
  company_id: string;
  name: string;
  start_date: string | Date;
  end_date: string | Date;
  min_school_days?: number;
  min_hours?: number;
  status?: AcademicYearStatus;
  created_by_user_id?: string | null;
}

export interface UpdateAcademicYearInput {
  name?: string;
  start_date?: string | Date;
  end_date?: string | Date;
  min_school_days?: number;
  min_hours?: number;
  status?: AcademicYearStatus;
}
