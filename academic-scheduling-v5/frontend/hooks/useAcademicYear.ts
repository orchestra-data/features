/**
 * useAcademicYear — TanStack Query hooks for Academic Year (Ano Letivo)
 * Uses academic_calendar + academic_year + company_blocked_day tables
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../client/apiClient';

// ============================================================================
// HELPERS
// ============================================================================

/** Extract a human-readable error message from API error responses */
function extractErrorMessage(err: Record<string, unknown>, status: number): string {
  if (typeof err.message === 'string' && err.message !== 'Internal Server Error') return err.message;
  if (typeof err.error === 'string') return err.error;
  return `HTTP ${status}`;
}

// ============================================================================
// TYPES
// ============================================================================

export interface AcademicCalendar {
  id: string;
  title: string;
  year: number | null;
  semester: number | null;
  status: 'draft' | 'published' | 'archived';
  mecComplianceEnabled: boolean;
  educationLevel: string | null;
  courseType: string | null;
  academicRegime: string;
  calendarType: string;
  isDefault: boolean;
  cachedMetrics: Record<string, unknown>;
  createdAt: string;
  academicYearId: string | null;
  academicYearName: string | null;
  startDate: string | null;
  endDate: string | null;
}

export interface AcademicYearStats {
  calendar: {
    id: string;
    title: string;
    year: number;
    semester: number | null;
    status: string;
    educationLevel: string | null;
    academicRegime: string;
    mecComplianceEnabled: boolean;
    startDate: string;
    endDate: string;
  };
  stats: {
    totalBusinessDays: number;
    instructionalDays: number;
    instructionalHours: number;
    holidayDays: number;
    recessDays: number;
    makeupDays: number;
    saturdayClassDays: number;
    scheduledClasses: number;
    scheduledHours: number;
    eventsOnHolidays: number;
    calendarDaysPopulated: boolean;
  };
  holidays: {
    total: number;
    requiresMakeup: number;
    makeupCompleted: number;
  };
  compliance: {
    status: 'compliant' | 'warning' | 'critical';
    schoolDays: {
      current: number;
      target: number;
      percent: number;
      met: boolean;
    };
    hours: {
      current: number;
      target: number;
      percent: number;
      met: boolean;
    };
    lastAudit: {
      overallStatus: string;
      violations: unknown[];
      warnings: unknown[];
      canPublish: boolean;
      validatedAt: string;
    } | null;
  };
}

export interface AcademicHoliday {
  id: string;
  date: string;
  reason: string | null;
  createdAt: string;
}

export interface CreateAcademicYearInput {
  title: string;
  year: number;
  semester?: number | null;
  startDate: string;
  endDate: string;
  educationLevel?: string | null;
  courseType?: string | null;
  academicRegime?: string;
  mecComplianceEnabled?: boolean;
}

// ============================================================================
// QUERY KEYS
// ============================================================================

const keys = {
  all: ['academic-years'] as const,
  list: (companyId: string) => [...keys.all, companyId] as const,
  stats: (companyId: string, calendarId: string) =>
    [...keys.all, companyId, calendarId, 'stats'] as const,
  holidays: (companyId: string, calendarId: string) =>
    [...keys.all, companyId, calendarId, 'holidays'] as const,
};

// ============================================================================
// FETCH FUNCTIONS
// ============================================================================

async function fetchAcademicYears(companyId: string): Promise<AcademicCalendar[]> {
  const response = await fetch(`/api/companies/${companyId}/academic-years`, {
    headers: { ...apiClient.getAuthHeaders() },
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(extractErrorMessage(err, response.status));
  }
  const data = await response.json();
  return data.data;
}

async function fetchAcademicYearStats(
  companyId: string,
  calendarId: string,
): Promise<AcademicYearStats> {
  const response = await fetch(
    `/api/companies/${companyId}/academic-years/${calendarId}/stats`,
    { headers: { ...apiClient.getAuthHeaders() } },
  );
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(extractErrorMessage(err, response.status));
  }
  return response.json();
}

async function fetchAcademicYearHolidays(
  companyId: string,
  calendarId: string,
): Promise<AcademicHoliday[]> {
  const response = await fetch(
    `/api/companies/${companyId}/academic-years/${calendarId}/holidays`,
    { headers: { ...apiClient.getAuthHeaders() } },
  );
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(extractErrorMessage(err, response.status));
  }
  const data = await response.json();
  return data.data;
}

async function createAcademicYear(
  companyId: string,
  input: CreateAcademicYearInput,
): Promise<{ id: string; academicYearId: string }> {
  const response = await fetch(`/api/companies/${companyId}/academic-years`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...apiClient.getAuthHeaders() },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(extractErrorMessage(err, response.status));
  }
  return response.json();
}

async function deleteAcademicYear(companyId: string, calendarId: string): Promise<void> {
  const response = await fetch(
    `/api/companies/${companyId}/academic-years/${calendarId}`,
    {
      method: 'DELETE',
      headers: { ...apiClient.getAuthHeaders() },
    },
  );
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(extractErrorMessage(err, response.status));
  }
}

async function createHoliday(
  companyId: string,
  input: { blockedDate: string; reason: string },
): Promise<{ id: string }> {
  const response = await fetch(`/api/createCompanyBlockedDay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...apiClient.getAuthHeaders() },
    body: JSON.stringify({ ...input, companyId }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(extractErrorMessage(err, response.status));
  }
  return response.json();
}

async function deleteHoliday(holidayId: string): Promise<void> {
  const response = await fetch(`/api/deleteCompanyBlockedDay`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', ...apiClient.getAuthHeaders() },
    body: JSON.stringify({ id: holidayId }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(extractErrorMessage(err, response.status));
  }
}

async function updateHoliday(
  input: { id: string; blockedDate?: string; reason?: string },
): Promise<void> {
  const response = await fetch(`/api/updateCompanyBlockedDay`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...apiClient.getAuthHeaders() },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(extractErrorMessage(err, response.status));
  }
}

async function syncHolidays(
  companyId: string,
  input: { year: number; cep?: string },
): Promise<{ created: number; skipped: number }> {
  const response = await fetch(`/api/companies/${companyId}/holidays/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...apiClient.getAuthHeaders() },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(extractErrorMessage(err, response.status));
  }
  return response.json();
}

// ============================================================================
// HOOKS
// ============================================================================

export function useAcademicYears(companyId: string) {
  const query = useQuery({
    queryKey: keys.list(companyId),
    queryFn: () => fetchAcademicYears(companyId),
    enabled: !!companyId,
    staleTime: 60_000,
  });

  return {
    calendars: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
}

export function useAcademicYearStats(companyId: string, calendarId: string | undefined) {
  const query = useQuery({
    queryKey: keys.stats(companyId, calendarId ?? ''),
    queryFn: () => fetchAcademicYearStats(companyId, calendarId!),
    enabled: !!companyId && !!calendarId,
    staleTime: 30_000,
  });

  return {
    stats: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useAcademicYearHolidays(companyId: string, calendarId: string | undefined) {
  const query = useQuery({
    queryKey: keys.holidays(companyId, calendarId ?? ''),
    queryFn: () => fetchAcademicYearHolidays(companyId, calendarId!),
    enabled: !!companyId && !!calendarId,
    staleTime: 30_000,
  });

  return {
    holidays: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
}

export function useCreateAcademicYear(companyId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateAcademicYearInput) => createAcademicYear(companyId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.list(companyId) });
    },
  });
}

export function useDeleteAcademicYear(companyId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (calendarId: string) => deleteAcademicYear(companyId, calendarId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all });
    },
  });
}

export function useCreateHoliday(companyId: string, calendarId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { blockedDate: string; reason: string }) =>
      createHoliday(companyId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.holidays(companyId, calendarId ?? '') });
      queryClient.invalidateQueries({ queryKey: keys.stats(companyId, calendarId ?? '') });
    },
  });
}

export function useDeleteHoliday(companyId: string, calendarId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (holidayId: string) => deleteHoliday(holidayId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.holidays(companyId, calendarId ?? '') });
      queryClient.invalidateQueries({ queryKey: keys.stats(companyId, calendarId ?? '') });
    },
  });
}

export function useUpdateHoliday(companyId: string, calendarId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { id: string; blockedDate?: string; reason?: string }) =>
      updateHoliday(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.holidays(companyId, calendarId ?? '') });
      queryClient.invalidateQueries({ queryKey: keys.stats(companyId, calendarId ?? '') });
    },
  });
}

export function useSyncHolidays(companyId: string, calendarId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { year: number; cep?: string }) => syncHolidays(companyId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.holidays(companyId, calendarId ?? '') });
      queryClient.invalidateQueries({ queryKey: keys.stats(companyId, calendarId ?? '') });
    },
  });
}

/**
 * Fetch a file with auth headers and trigger download or open in new tab
 */
async function fetchWithAuth(url: string): Promise<Blob> {
  const response = await fetch(url, {
    headers: { ...apiClient.getAuthHeaders() },
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(extractErrorMessage(err, response.status));
  }
  return response.blob();
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function openBlobInTab(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
}

/**
 * Download calendar as .ics file (iCalendar)
 */
export async function downloadCalendarICS(
  companyId: string,
  startDate?: string,
  endDate?: string,
  format?: string,
): Promise<void> {
  const params = new URLSearchParams();
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  if (format) params.set('format', format);
  const url = `/api/companies/${companyId}/events/export.ics?${params.toString()}`;
  const blob = await fetchWithAuth(url);
  const year = startDate?.substring(0, 4) ?? new Date().getFullYear();
  downloadBlob(blob, `calendario-academico-${year}.ics`);
}

/**
 * Download .ics and open Google Calendar import page
 */
export async function exportToGoogleCalendar(
  companyId: string,
  startDate?: string,
  endDate?: string,
): Promise<void> {
  // Download the .ics first, then open Google Calendar import settings
  await downloadCalendarICS(companyId, startDate, endDate, 'google');
  // Open Google Calendar import page where user can upload the .ics
  window.open('https://calendar.google.com/calendar/r/settings/export', '_blank');
}

/**
 * Open MEC compliance report in a new tab
 */
export async function openMECReport(
  companyId: string,
  calendarId: string,
): Promise<void> {
  const url = `/api/companies/${companyId}/academic-years/${calendarId}/mec-report`;
  const blob = await fetchWithAuth(url);
  openBlobInTab(blob);
}
