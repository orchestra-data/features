'use client'

/**
 * DayDetailPanel — Side panel showing all events for a selected day
 * SCHED-010: Day detail slide-in panel with event cards and actions
 */

import { useMemo } from 'react'
import { X, Calendar, Plus, Sun } from 'lucide-react'
import { Button } from '@cogedu/ui'
import { Badge } from '@cogedu/ui'
import type { CalendarEvent, EventType } from '@cogedu/ava-database-types'

// ============================================================================
// TYPES
// ============================================================================

interface DayDetailPanelProps {
  date: Date | null
  events: CalendarEvent[]
  onClose: () => void
  onEventClick: (eventId: string) => void
  onCreateEvent: (date: Date) => void
}

// ============================================================================
// CONFIG
// ============================================================================

const EVENT_TYPE_CONFIG: Record<EventType, { label: string; badgeClass: string }> = {
  aula: { label: 'Aula', badgeClass: 'bg-blue-500 text-white' },
  estagio: { label: 'Estágio', badgeClass: 'bg-amber-500 text-white' },
  palestra: { label: 'Palestra', badgeClass: 'bg-purple-500 text-white' },
  visitacao_tecnica: { label: 'Visitação Técnica', badgeClass: 'bg-cyan-500 text-white' },
  workshop: { label: 'Workshop', badgeClass: 'bg-teal-500 text-white' },
  seminario: { label: 'Seminário', badgeClass: 'bg-indigo-500 text-white' },
  reuniao: { label: 'Reunião', badgeClass: 'bg-violet-500 text-white' },
  avaliacao: { label: 'Avaliação', badgeClass: 'bg-red-500 text-white' },
  outro: { label: 'Outro', badgeClass: 'bg-gray-500 text-white' },
}

// ============================================================================
// HELPERS
// ============================================================================

function formatDatePtBR(date: Date): string {
  return date.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function formatTime(isoString: string): string {
  const date = new Date(isoString)
  return date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function isHolidayEvent(event: CalendarEvent): boolean {
  return event.event_type === 'outro' && event.allow_on_holiday === false
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function EventCard({
  event,
  onClick,
}: {
  event: CalendarEvent
  onClick: () => void
}) {
  const config = EVENT_TYPE_CONFIG[event.event_type] ?? EVENT_TYPE_CONFIG.outro
  const holiday = isHolidayEvent(event)

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-ring ${
        holiday ? 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950' : 'border-border bg-card'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {holiday && <Sun className="h-4 w-4 shrink-0 text-red-500" />}
            <span className="truncate font-medium text-sm text-foreground">
              {event.title}
            </span>
          </div>

          <p className="mt-1 text-xs text-muted-foreground">
            {formatTime(event.start)} – {formatTime(event.end)}
          </p>

          {event.component_name && (
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {event.component_name}
            </p>
          )}
        </div>

        <Badge className={config.badgeClass}>
          {config.label}
        </Badge>
      </div>
    </button>
  )
}

function EmptyState({ onCreateEvent }: { onCreateEvent: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
      <Calendar className="h-12 w-12 text-muted-foreground/40" />
      <p className="text-sm text-muted-foreground">Nenhum evento neste dia</p>
      <Button onClick={onCreateEvent} size="sm">
        <Plus className="mr-1.5 h-4 w-4" />
        Criar Evento
      </Button>
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function DayDetailPanel({
  date,
  events,
  onClose,
  onEventClick,
  onCreateEvent,
}: DayDetailPanelProps) {
  const sortedEvents = useMemo(() => {
    return [...events].sort(
      (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
    )
  }, [events])

  if (!date) return null

  const formattedDate = formatDatePtBR(date)
  // Capitalize first letter (toLocaleDateString returns lowercase weekday in pt-BR)
  const displayDate = formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1)

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20 transition-opacity duration-300"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <aside
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-background shadow-xl transition-transform duration-300 ease-out animate-in slide-in-from-right"
        role="complementary"
        aria-label="Detalhes do dia"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-foreground">
              {displayDate}
            </h2>
            <p className="text-xs text-muted-foreground">
              {sortedEvents.length === 0
                ? 'Sem eventos'
                : sortedEvents.length === 1
                  ? '1 evento'
                  : `${sortedEvents.length} eventos`}
            </p>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Fechar painel"
            className="shrink-0"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {sortedEvents.length === 0 ? (
            <EmptyState onCreateEvent={() => onCreateEvent(date)} />
          ) : (
            <div className="flex flex-col gap-3">
              {sortedEvents.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  onClick={() => onEventClick(event.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer — only when there are events */}
        {sortedEvents.length > 0 && (
          <div className="border-t border-border px-5 py-3">
            <Button
              onClick={() => onCreateEvent(date)}
              variant="outline"
              className="w-full"
              size="sm"
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Criar Evento
            </Button>
          </div>
        )}
      </aside>
    </>
  )
}

export default DayDetailPanel
