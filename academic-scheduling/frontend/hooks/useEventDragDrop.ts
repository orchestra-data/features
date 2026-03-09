/**
 * useEventDragDrop — Drag & drop event handling for FullCalendar
 * SCHED-017: Optimistic updates with revert-on-error for event moves/resizes
 */

import { useCallback, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { EventDropArg, EventResizeDoneArg } from '@fullcalendar/interaction';
import { toast } from 'sonner';

import { apiFetch } from '../../../client/apiClient';
import { calendarEventKeys } from './useCalendarEvents';

// ============================================================================
// TYPES
// ============================================================================

interface UpdateEventPayload {
  eventId: string;
  start: string;
  end: string;
}

interface RecurrenceMoveInfo {
  eventId: string;
  recurrenceGroupId: string;
  oldStart: string;
  oldEnd: string;
  newStart: string;
  newEnd: string;
  revertFn: () => void;
}

interface UseEventDragDropOptions {
  companyId: string;
  onRecurrenceMove?: (info: RecurrenceMoveInfo) => void;
}

interface UseEventDragDropReturn {
  handleEventDrop: (arg: EventDropArg) => void;
  handleEventResize: (arg: EventResizeDoneArg) => void;
  isDragging: boolean;
}

// ============================================================================
// API CALLS
// ============================================================================

const API_BASE_URL = '/api';

async function updateEventDates(
  companyId: string,
  payload: UpdateEventPayload,
): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`${API_BASE_URL}/updateCompanyEvent`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      companyId,
      eventId: payload.eventId,
      start: payload.start,
      end: payload.end,
    }),
  });
}

// ============================================================================
// HELPERS
// ============================================================================

function toISOString(date: Date | null): string {
  if (!date) return '';
  return date.toISOString();
}

// ============================================================================
// HOOK
// ============================================================================

export function useEventDragDrop({
  companyId,
  onRecurrenceMove,
}: UseEventDragDropOptions): UseEventDragDropReturn {
  const queryClient = useQueryClient();
  const [isDragging, setIsDragging] = useState(false);
  const pendingRevertRef = useRef<(() => void) | null>(null);

  // ---- Mutation ----

  const mutation = useMutation({
    mutationFn: (payload: UpdateEventPayload) =>
      updateEventDates(companyId, payload),

    onMutate: async () => {
      // Cancel outgoing refetches so they don't overwrite optimistic update
      await queryClient.cancelQueries({ queryKey: calendarEventKeys.all });
    },

    onSuccess: () => {
      // Invalidate to refetch fresh data from server
      queryClient.invalidateQueries({ queryKey: calendarEventKeys.all });
      toast.success('Evento movido com sucesso');
      pendingRevertRef.current = null;
    },

    onError: (_error) => {
      // Revert the optimistic drag
      if (pendingRevertRef.current) {
        pendingRevertRef.current();
        pendingRevertRef.current = null;
      }
      toast.error('Erro ao mover evento', {
        description: 'O evento foi revertido para a posicao original.',
      });
      // Refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: calendarEventKeys.all });
    },

    onSettled: () => {
      setIsDragging(false);
    },
  });

  // ---- Event Drop Handler ----

  const handleEventDrop = useCallback(
    (arg: EventDropArg) => {
      setIsDragging(true);

      const { event, revert } = arg;
      const recurrenceGroupId = event.extendedProps?.recurrenceGroupId as
        | string
        | null;

      // If event belongs to a recurrence group, delegate to modal handler
      if (recurrenceGroupId && onRecurrenceMove) {
        pendingRevertRef.current = revert;

        onRecurrenceMove({
          eventId: event.id,
          recurrenceGroupId,
          oldStart: toISOString(arg.oldEvent.start),
          oldEnd: toISOString(arg.oldEvent.end),
          newStart: toISOString(event.start),
          newEnd: toISOString(event.end),
          revertFn: revert,
        });
        setIsDragging(false);
        return;
      }

      // Non-recurring event: optimistic update (FullCalendar already moved it)
      pendingRevertRef.current = revert;

      mutation.mutate({
        eventId: event.id,
        start: toISOString(event.start),
        end: toISOString(event.end),
      });
    },
    [companyId, mutation, onRecurrenceMove],
  );

  // ---- Event Resize Handler ----

  const handleEventResize = useCallback(
    (arg: EventResizeDoneArg) => {
      setIsDragging(true);

      const { event, revert } = arg;
      const recurrenceGroupId = event.extendedProps?.recurrenceGroupId as
        | string
        | null;

      // If event belongs to a recurrence group, delegate to modal handler
      if (recurrenceGroupId && onRecurrenceMove) {
        pendingRevertRef.current = revert;

        onRecurrenceMove({
          eventId: event.id,
          recurrenceGroupId,
          oldStart: toISOString(arg.oldEvent.start),
          oldEnd: toISOString(arg.oldEvent.end),
          newStart: toISOString(event.start),
          newEnd: toISOString(event.end),
          revertFn: revert,
        });
        setIsDragging(false);
        return;
      }

      // Non-recurring event: optimistic update
      pendingRevertRef.current = revert;

      mutation.mutate({
        eventId: event.id,
        start: toISOString(event.start),
        end: toISOString(event.end),
      });
    },
    [companyId, mutation, onRecurrenceMove],
  );

  return {
    handleEventDrop,
    handleEventResize,
    isDragging,
  };
}

export type { RecurrenceMoveInfo, UseEventDragDropOptions };
