/**
 * MoveWarningModal — Warning dialog for moving recurring events
 * SCHED-018: Shows options when dragging an event that belongs to a recurrence_group
 */

import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, Calendar, ArrowRight } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
  Button,
} from '@cogedu/ui';

import { apiFetch } from '../../../client/apiClient';
import { calendarEventKeys } from '../hooks/useCalendarEvents';

// ============================================================================
// TYPES
// ============================================================================

interface CalendarEvent {
  id: string;
  title: string;
  recurrenceGroupId: string;
}

type MoveAction = 'single' | 'all_future' | 'cancel';

interface MoveWarningModalProps {
  isOpen: boolean;
  onClose: () => void;
  event: CalendarEvent;
  oldDate: Date;
  newDate: Date;
  companyId: string;
  isHoliday?: boolean;
  onConfirm: (action: MoveAction) => void;
}

// ============================================================================
// API CALLS
// ============================================================================

const API_BASE_URL = '/api';

async function splitRecurrenceGroup(
  companyId: string,
  eventId: string,
  newStart: string,
  newEnd: string,
): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`${API_BASE_URL}/splitRecurrenceGroup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      companyId,
      eventId,
      newStart,
      newEnd,
    }),
  });
}

async function shiftRecurrenceGroup(
  companyId: string,
  eventId: string,
  newStart: string,
  newEnd: string,
): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`${API_BASE_URL}/shiftRecurrenceGroup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      companyId,
      eventId,
      newStart,
      newEnd,
    }),
  });
}

// ============================================================================
// HELPERS
// ============================================================================

function formatDate(date: Date): string {
  return date.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function MoveWarningModal({
  isOpen,
  onClose,
  event,
  oldDate,
  newDate,
  companyId,
  isHoliday = false,
  onConfirm,
}: MoveWarningModalProps) {
  const queryClient = useQueryClient();
  const [selectedAction, setSelectedAction] = useState<MoveAction | null>(null);

  // Compute time delta for the shift
  const timeDelta = useMemo(() => {
    const diffMs = newDate.getTime() - oldDate.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'mesmo dia';
    const abs = Math.abs(diffDays);
    const direction = diffDays > 0 ? 'adiante' : 'atras';
    return `${abs} dia${abs > 1 ? 's' : ''} ${direction}`;
  }, [oldDate, newDate]);

  // ---- Mutations ----

  const splitMutation = useMutation({
    mutationFn: () =>
      splitRecurrenceGroup(
        companyId,
        event.id,
        newDate.toISOString(),
        newDate.toISOString(),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: calendarEventKeys.all });
      toast.success('Evento movido individualmente', {
        description: 'O evento foi separado da recorrencia e movido.',
      });
      onConfirm('single');
      handleClose();
    },
    onError: () => {
      toast.error('Erro ao mover evento', {
        description: 'Nao foi possivel separar o evento da recorrencia.',
      });
      onConfirm('cancel');
      handleClose();
    },
  });

  const shiftMutation = useMutation({
    mutationFn: () =>
      shiftRecurrenceGroup(
        companyId,
        event.id,
        newDate.toISOString(),
        newDate.toISOString(),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: calendarEventKeys.all });
      toast.success('Eventos futuros movidos', {
        description: `Este e todos os eventos futuros foram movidos ${timeDelta}.`,
      });
      onConfirm('all_future');
      handleClose();
    },
    onError: () => {
      toast.error('Erro ao mover eventos futuros', {
        description: 'Nao foi possivel mover os eventos da recorrencia.',
      });
      onConfirm('cancel');
      handleClose();
    },
  });

  const isSubmitting = splitMutation.isPending || shiftMutation.isPending;

  // ---- Handlers ----

  const handleClose = useCallback(() => {
    setSelectedAction(null);
    onClose();
  }, [onClose]);

  const handleCancel = useCallback(() => {
    onConfirm('cancel');
    handleClose();
  }, [onConfirm, handleClose]);

  const handleConfirm = useCallback(() => {
    if (selectedAction === 'single') {
      splitMutation.mutate();
    } else if (selectedAction === 'all_future') {
      shiftMutation.mutate();
    } else {
      handleCancel();
    }
  }, [selectedAction, splitMutation, shiftMutation, handleCancel]);

  // ---- Render ----

  return (
    <Dialog open={isOpen} onOpenChange={(v) => !v && handleCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Mover evento recorrente
          </DialogTitle>
          <DialogDescription>
            Este evento faz parte de uma serie recorrente. Escolha como deseja
            mover.
          </DialogDescription>
        </DialogHeader>

        {/* ---- Preview ---- */}
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <p className="mb-2 text-sm font-medium text-gray-900">
            {event.title}
          </p>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Calendar className="h-4 w-4 shrink-0" />
            <span>{formatDate(oldDate)} {formatTime(oldDate)}</span>
            <ArrowRight className="h-4 w-4 shrink-0 text-gray-400" />
            <span className="font-medium text-gray-900">
              {formatDate(newDate)} {formatTime(newDate)}
            </span>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Deslocamento: {timeDelta}
          </p>
        </div>

        {/* ---- Holiday Warning ---- */}
        {isHoliday && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
            <p className="text-sm font-medium text-red-700">
              A nova data e um feriado!
            </p>
          </div>
        )}

        {/* ---- Action Options ---- */}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => setSelectedAction('single')}
            className={`rounded-lg border p-3 text-left transition-colors ${
              selectedAction === 'single'
                ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
            } ${isSubmitting ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
          >
            <p className="text-sm font-medium text-gray-900">
              Mover apenas este evento
            </p>
            <p className="mt-0.5 text-xs text-gray-500">
              Separa este evento da serie recorrente e o move para a nova data.
            </p>
          </button>

          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => setSelectedAction('all_future')}
            className={`rounded-lg border p-3 text-left transition-colors ${
              selectedAction === 'all_future'
                ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
            } ${isSubmitting ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
          >
            <p className="text-sm font-medium text-gray-900">
              Mover este e todos os futuros
            </p>
            <p className="mt-0.5 text-xs text-gray-500">
              Move este evento e todos os seguintes da serie em {timeDelta}.
            </p>
          </button>
        </div>

        {/* ---- Footer ---- */}
        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={isSubmitting}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!selectedAction || isSubmitting}
          >
            {isSubmitting ? 'Movendo...' : 'Confirmar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type { CalendarEvent, MoveAction, MoveWarningModalProps };
