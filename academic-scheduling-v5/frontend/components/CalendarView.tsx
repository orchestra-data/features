/**
 * CalendarView — FullCalendar v6 component connected to real API data
 * SCHED-009: Main calendar visualization for academic scheduling
 * Supports filtering by classInstanceIds (turmas)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { DateSelectArg, EventClickArg, DatesSetArg } from '@fullcalendar/core';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

import { useCalendarEvents } from '../hooks/useCalendarEvents';

// ============================================================================
// TYPES
// ============================================================================

interface HolidayInfo {
  date: string;
  reason: string;
}

interface CalendarViewProps {
  companyId: string;
  classInstanceIds?: string[];
  gotoDate?: string; // YYYY-MM-DD — navigates calendar when changed
  gotoKey?: number;  // change this to force re-navigation even if date is same
  holidays?: HolidayInfo[];
  blockedDays?: Map<string, string>; // YYYY-MM-DD → reason
  holidayMap?: Map<string, string>;  // YYYY-MM-DD → name
  onDateClick: (date: Date) => void;
  onEventClick: (eventId: string) => void;
}

// ============================================================================
// HELPERS
// ============================================================================

function toISODate(date: Date): string {
  return date.toISOString().split('T')[0]!;
}

function getInitialRange(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { start: toISODate(start), end: toISODate(end) };
}

// ============================================================================
// LOADING SKELETON
// ============================================================================

function CalendarSkeleton() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24">
      <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      <span className="text-sm text-gray-500">Carregando calendario...</span>
    </div>
  );
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function CalendarView({
  companyId,
  classInstanceIds,
  gotoDate,
  gotoKey,
  holidays = [],
  blockedDays,
  holidayMap,
  onDateClick,
  onEventClick,
}: CalendarViewProps) {
  const calendarRef = useRef<FullCalendar>(null);
  const initialRange = useMemo(getInitialRange, []);
  const navigatingRef = useRef(false);

  const [dateRange, setDateRange] = useState<{ start: string; end: string }>(initialRange);

  // Navigate calendar when gotoDate/gotoKey changes
  useEffect(() => {
    if (gotoDate && calendarRef.current) {
      navigatingRef.current = true;
      const api = calendarRef.current.getApi();
      api.gotoDate(gotoDate);
      // FullCalendar will fire datesSet after navigation — the flag clears there
    }
  }, [gotoDate, gotoKey]);

  const { events, isLoading, error } = useCalendarEvents(
    companyId,
    dateRange.start,
    dateRange.end,
    classInstanceIds,
  );

  // Show toast on error
  if (error) {
    toast.error('Erro ao carregar eventos do calendario', {
      description: error.message,
      id: 'calendar-error', // prevent duplicates
    });
  }

  // ---- Holiday map ----

  const internalHolidayMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const h of holidays) {
      map.set(h.date.substring(0, 10), h.reason);
    }
    return map;
  }, [holidays]);

  // Track view type changes to re-paint holidays
  const [viewType, setViewType] = useState('dayGridMonth');

  // Paint holiday + blocked day cells whenever data, visible dates, or view type change
  useEffect(() => {
    function paintCells() {
      if (!calendarRef.current) return;
      const calEl = calendarRef.current.getApi().el;
      if (!calEl) return;

      // Clean up previous decorations on all possible cell types
      calEl.querySelectorAll<HTMLElement>('.fc-daygrid-day, .fc-timegrid-col').forEach((cell) => {
        cell.style.backgroundColor = '';
        cell.style.opacity = '';
        cell.style.pointerEvents = '';
        cell.querySelector('.holiday-label')?.remove();
        cell.querySelector('.blocked-label')?.remove();
      });

      // Month view — paint day cells
      calEl.querySelectorAll<HTMLElement>('.fc-daygrid-day').forEach((cell) => {
        const dateStr = cell.getAttribute('data-date');
        if (!dateStr) return;

        // HARD VETO: blocked days — gray, non-clickable
        const blockedReason = blockedDays?.get(dateStr);
        if (blockedReason) {
          cell.style.backgroundColor = '#f3f4f6';
          cell.style.opacity = '0.6';
          cell.style.pointerEvents = 'none';
          const label = document.createElement('div');
          label.className = 'blocked-label';
          label.textContent = blockedReason;
          label.style.cssText =
            'font-size:9px;line-height:1.2;color:#6b7280;padding:0 2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;pointer-events:none;';
          const dayTop = cell.querySelector('.fc-daygrid-day-top');
          if (dayTop) dayTop.insertAdjacentElement('afterend', label);
          return; // blocked takes priority over holiday
        }

        // Holidays — red background
        const holidayReason = internalHolidayMap.get(dateStr) || holidayMap?.get(dateStr);
        if (holidayReason) {
          cell.style.backgroundColor = '#fef2f2';
          const label = document.createElement('div');
          label.className = 'holiday-label';
          label.textContent = holidayReason;
          label.style.cssText =
            'font-size:9px;line-height:1.2;color:#dc2626;padding:0 2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;pointer-events:none;';
          const dayTop = cell.querySelector('.fc-daygrid-day-top');
          if (dayTop) dayTop.insertAdjacentElement('afterend', label);
        }
      });

      // Week/Day view — paint timegrid columns
      calEl.querySelectorAll<HTMLElement>('.fc-timegrid-col').forEach((col) => {
        const dateStr = col.getAttribute('data-date');
        if (!dateStr) return;

        if (blockedDays?.has(dateStr)) {
          col.style.backgroundColor = '#f3f4f6';
          col.style.opacity = '0.6';
          col.style.pointerEvents = 'none';
          return;
        }
        const holidayReason = internalHolidayMap.get(dateStr) || holidayMap?.get(dateStr);
        if (holidayReason) {
          col.style.backgroundColor = '#fef2f2';
        }
      });
    }

    // Wait for FullCalendar to finish rendering the new view
    const timer = setTimeout(() => paintCells(), 50);
    return () => clearTimeout(timer);
  }, [internalHolidayMap, holidayMap, blockedDays, dateRange, viewType]);

  // ---- Callbacks ----

  const handleDatesSet = useCallback((arg: DatesSetArg) => {
    const newStart = toISODate(arg.start);
    const newEnd = toISODate(arg.end);

    // If we're in a programmatic navigation and datesSet fires with the OLD range,
    // skip the update — the next datesSet (from gotoDate) will have the correct range.
    if (navigatingRef.current && gotoDate) {
      const targetYear = gotoDate.substring(0, 4);
      const rangeYear = newStart.substring(0, 4);
      if (targetYear !== rangeYear) {
        // Stale callback from old view — ignore
        return;
      }
      // Correct range arrived — clear the flag
      navigatingRef.current = false;
    }

    setDateRange({ start: newStart, end: newEnd });
    setViewType(arg.view.type);
  }, [gotoDate]);

  const handleDateSelect = useCallback(
    (arg: DateSelectArg) => {
      onDateClick(arg.start);
    },
    [onDateClick],
  );

  const handleEventClick = useCallback(
    (arg: EventClickArg) => {
      const eventId = arg.event.id;
      if (eventId) {
        onEventClick(eventId);
      }
    },
    [onEventClick],
  );

  // ---- Render ----

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 relative">
      {isLoading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 rounded-lg">
          <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
        </div>
      )}
      <FullCalendar
        ref={calendarRef}
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        locale="pt-br"
        headerToolbar={{
          left: 'prev,next today',
          center: 'title',
          right: 'dayGridMonth,timeGridWeek,timeGridDay',
        }}
        buttonText={{
          today: 'Hoje',
          month: 'Mes',
          week: 'Semana',
          day: 'Dia',
        }}
        events={events}
        selectable
        select={handleDateSelect}
        eventClick={handleEventClick}
        datesSet={handleDatesSet}
        height="auto"
        dayMaxEvents={3}
        weekends
        firstDay={0}
        nowIndicator
        eventDisplay="block"
        eventTimeFormat={{
          hour: '2-digit',
          minute: '2-digit',
          meridiem: false,
          hour12: false,
        }}
      />
    </div>
  );
}
