/**
 * useCalendarEvents — TanStack Query hook for FullCalendar event data
 * SCHED-009: Fetches company events and maps to FullCalendar EventInput format
 * Supports filtering by classInstanceIds (turmas)
 */

import { useQuery } from '@tanstack/react-query';
import type { EventInput } from '@fullcalendar/core';
import type { EventType, EventStatus } from '@cogedu/ava-database-types';
import { apiClient } from '../../../client/apiClient';

// ============================================================================
// TYPES
// ============================================================================

interface CalendarEventResponse {
  id: string;
  title: string;
  start: string;
  end: string;
  event_type: EventType;
  status: EventStatus;
  company_id: string;
  class_instance_id: string | null;
  component_id: string | null;
  component_name: string | null;
  recurrence_group_id: string | null;
  allow_on_holiday: boolean;
  resources: Array<{ id: string; name: string }>;
}

interface CalendarEventsApiResponse {
  data: CalendarEventResponse[];
  period: {
    startDate: string;
    endDate: string;
  };
}

// ============================================================================
// COLOR MAP — Tailwind-friendly hex values per event_type
// ============================================================================

const EVENT_TYPE_COLORS: Record<EventType, { bg: string; border: string; text: string }> = {
  aula:              { bg: '#3b82f6', border: '#2563eb', text: '#ffffff' },
  avaliacao:         { bg: '#ef4444', border: '#dc2626', text: '#ffffff' },
  reuniao:           { bg: '#a855f7', border: '#9333ea', text: '#ffffff' },
  estagio:           { bg: '#10b981', border: '#059669', text: '#ffffff' },
  palestra:          { bg: '#06b6d4', border: '#0891b2', text: '#ffffff' },
  visitacao_tecnica: { bg: '#f97316', border: '#ea580c', text: '#ffffff' },
  workshop:          { bg: '#14b8a6', border: '#0d9488', text: '#ffffff' },
  seminario:         { bg: '#8b5cf6', border: '#7c3aed', text: '#ffffff' },
  outro:             { bg: '#6b7280', border: '#4b5563', text: '#ffffff' },
};

// ============================================================================
// QUERY KEYS
// ============================================================================

export const calendarEventKeys = {
  all: ['calendar-events'] as const,
  range: (companyId: string, start: string, end: string, classInstanceIds?: string[]) =>
    [...calendarEventKeys.all, companyId, start, end, ...(classInstanceIds ?? [])] as const,
};

// ============================================================================
// MAPPER — API response to FullCalendar EventInput
// ============================================================================

function mapToFullCalendarEvent(event: CalendarEventResponse): EventInput {
  const colors = EVENT_TYPE_COLORS[event.event_type] ?? EVENT_TYPE_COLORS.outro;

  return {
    id: event.id,
    title: event.title,
    start: event.start,
    end: event.end,
    backgroundColor: colors.bg,
    borderColor: colors.border,
    textColor: colors.text,
    extendedProps: {
      eventType: event.event_type,
      status: event.status,
      companyId: event.company_id,
      classInstanceId: event.class_instance_id,
      componentId: event.component_id,
      componentName: event.component_name,
      recurrenceGroupId: event.recurrence_group_id,
      allowOnHoliday: event.allow_on_holiday,
      resources: event.resources,
    },
  };
}

// ============================================================================
// HOOK
// ============================================================================

const API_BASE_URL = '/api';

async function fetchCalendarEvents(
  companyId: string,
  startDate: string,
  endDate: string,
  classInstanceIds?: string[],
): Promise<CalendarEventsApiResponse> {
  const searchParams = new URLSearchParams({ startDate, endDate });
  if (classInstanceIds && classInstanceIds.length > 0) {
    searchParams.set('classInstanceId', classInstanceIds.join(','));
  }
  const url = `${API_BASE_URL}/companies/${companyId}/events/calendar?${searchParams}`;

  const response = await fetch(url, {
    headers: {
      ...apiClient.getAuthHeaders(),
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

export function useCalendarEvents(
  companyId: string,
  startDate: string,
  endDate: string,
  classInstanceIds?: string[],
) {
  const query = useQuery({
    queryKey: calendarEventKeys.range(companyId, startDate, endDate, classInstanceIds),
    queryFn: () => fetchCalendarEvents(companyId, startDate, endDate, classInstanceIds),
    enabled: !!companyId && !!startDate && !!endDate,
    staleTime: 30_000,
  });

  const events: EventInput[] = (query.data?.data ?? []).map(mapToFullCalendarEvent);

  return {
    events,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

export { EVENT_TYPE_COLORS };
export type { CalendarEventResponse };
