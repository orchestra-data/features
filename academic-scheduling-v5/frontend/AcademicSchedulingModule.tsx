/**
 * AcademicSchedulingModule — Main orchestrator component for Tab 8 "Calendario".
 *
 * Connects all sub-components: CalendarView, DayDetailPanel, EventModal,
 * SelectionWizard, BatchSchedulerModal.
 *
 * State managed via Zustand (useSchedulingStore).
 * Data fetched via TanStack Query hooks (inside CalendarView).
 * ZERO axios. UI from @cogedu/ui.
 */
import { useCallback, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Button, Badge } from '@cogedu/ui'
import { X, GraduationCap, CalendarDays, Share2 } from 'lucide-react'
import { toast } from 'sonner'
import CalendarView from './components/CalendarView'
import { DayDetailPanel } from './components/DayDetailPanel'
import { EventModal } from './components/EventModal'
import { SelectionWizard } from './components/SelectionWizard'
import { BatchSchedulerModal } from './components/BatchSchedulerModal'
import { AcademicYearPanel } from './components/AcademicYearPanel'
import { RecurrenceEditDialog } from './components/RecurrenceEditDialog'
import { CascadePushPreviewModal } from './components/CascadePushPreviewModal'
import { ConflictResolutionPanel } from './components/ConflictResolutionPanel'
import { ShareCalendarModal } from './components/ShareCalendarModal'
import { CalendarAssistant } from './components/CalendarAssistant'
import type { RecurrenceScope } from './components/RecurrenceEditDialog'
import { useSchedulingStore } from './stores/useSchedulingStore'
import { useBlockedDays } from './hooks/useBlockedDays'
import { apiClient, apiFetch } from '../../client/apiClient'
import type { CalendarEvent } from '@cogedu/ava-database-types'

export function AcademicSchedulingModule() {
  const { companyId = '' } = useParams<{ companyId: string }>()
  const store = useSchedulingStore()
  const [calendarGoto, setCalendarGoto] = useState<{ date: string; key: number } | undefined>(undefined)
  const [holidays, setHolidays] = useState<{ date: string; reason: string }[]>([])
  const [allCalendarEvents, setAllCalendarEvents] = useState<Array<{ id: string; title: string; start: string; event_type: string }>>([])

  // Derive classInstanceIds for filtering
  const classInstanceIds = useMemo(
    () => store.selectedTurmas.map((t) => t.classInstanceId),
    [store.selectedTurmas],
  )

  // HARD VETO: blocked days data
  const { blockedDays, holidayMap } = useBlockedDays(companyId)

  // Fetch events for selected day (DayDetailPanel)
  const selectedDateStr = store.selectedDate
    ? store.selectedDate.toISOString().split('T')[0]!
    : null
  const nextDayStr = store.selectedDate
    ? new Date(store.selectedDate.getTime() + 86400000).toISOString().split('T')[0]!
    : null

  const { data: dayEventsData } = useQuery({
    queryKey: ['day-events', companyId, selectedDateStr, classInstanceIds],
    queryFn: async () => {
      const params = new URLSearchParams({
        startDate: selectedDateStr!,
        endDate: nextDayStr!,
      })
      if (classInstanceIds.length > 0) {
        params.set('classInstanceId', classInstanceIds.join(','))
      }
      const res = await fetch(
        `/api/companies/${companyId}/events-calendar?${params}`,
        { headers: { ...apiClient.getAuthHeaders() } }
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      return json.data as CalendarEvent[]
    },
    enabled: !!selectedDateStr && !!companyId,
    staleTime: 10_000,
  })
  const dayEvents = dayEventsData ?? []

  const hasTurmas = store.selectedTurmas.length > 0

  // Handlers
  const handleEventClick = useCallback((eventId: string) => {
    // Check if event is recurring — look in dayEvents or calendar events
    const evt = dayEvents.find((e) => e.id === eventId) as any
    if (evt?.recurrence_group_id) {
      // R6: ALWAYS ask scope for recurring events
      store.openRecurrenceDialog(eventId, 'edit')
    } else {
      store.openEventModal(eventId)
    }
  }, [store, dayEvents])

  const handleSave = useCallback(() => {
    store.closeEventModal()
  }, [store])

  const handleBatchComplete = useCallback(() => {
    store.closeBatchModal()
  }, [store])

  const handleWizardComplete = useCallback(
    (sel: {
      companyId: string
      classInstanceId: string
      classInstanceName: string
      pathwayId: string
      seriesId: string
    }) => {
      // Add turma to the list (not replace)
      store.addTurma({
        classInstanceId: sel.classInstanceId,
        classInstanceName: sel.classInstanceName,
        pathwayId: sel.pathwayId,
        seriesId: sel.seriesId,
      })
      // Also set legacy selection
      store.setSelection({
        companyId: sel.companyId,
        classInstanceId: sel.classInstanceId,
        pathwayId: sel.pathwayId,
        seriesId: sel.seriesId,
      })
      store.closeWizard()
    },
    [store],
  )

  // HARD VETO: date click validation
  const handleDateClickWithVeto = useCallback((date: Date) => {
    const dateStr = date.toISOString().split('T')[0]!
    // V2.1: Blocked day — toast and reject
    if (blockedDays.has(dateStr)) {
      toast.error(`Dia bloqueado: ${blockedDays.get(dateStr) ?? 'Motivo nao informado'}`)
      return
    }
    // V2.3: Holiday — toast and reject
    const holidayName = holidayMap.get(dateStr)
    if (holidayName) {
      toast.warning(`Feriado: ${holidayName}. Para agendar neste dia, marque "permitir em feriado" no evento.`)
      return
    }
    store.setSelectedDate(date)
  }, [store, blockedDays, holidayMap])

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* INFO BANNER: no turma selected — calendar shows all institution events */}
      {!hasTurmas && (
        <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <CalendarDays className="h-5 w-5 text-slate-500 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-900">
              Mostrando todos os eventos da instituicao
            </p>
            <p className="text-xs text-slate-600 mt-0.5">
              Filtre por turma para ver apenas seus eventos, ou crie eventos avulsos diretamente.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => store.openWizard()}>
            Filtrar por Turma
          </Button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        {/* Left: selected turmas */}
        <div className="flex items-center gap-2 flex-wrap min-h-[36px]">
          {hasTurmas ? (
            <>
              <GraduationCap className="h-4 w-4 text-muted-foreground shrink-0" />
              {store.selectedTurmas.map((turma) => (
                <Badge
                  key={turma.classInstanceId}
                  variant="secondary"
                  className="flex items-center gap-1.5 pl-3 pr-1.5 py-1 text-sm"
                >
                  {turma.classInstanceName}
                  <button
                    type="button"
                    onClick={() => store.removeTurma(turma.classInstanceId)}
                    className="rounded-full p-0.5 hover:bg-muted-foreground/20 transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              {store.selectedTurmas.length > 1 && (
                <button
                  type="button"
                  onClick={() => store.clearTurmas()}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Limpar todas
                </button>
              )}
            </>
          ) : (
            <span className="text-sm text-muted-foreground">
              Nenhuma turma selecionada
            </span>
          )}
        </div>

        {/* Right: actions — Lote requer turma, Evento avulso sempre pode */}
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="icon" onClick={() => store.openShareModal()} title="Compartilhar calendario">
            <Share2 className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={() => store.openWizard()}>
            {hasTurmas ? 'Adicionar Turma' : 'Filtrar por Turma'}
          </Button>
          <Button
            variant="outline"
            onClick={() => store.openBatchModal()}
            disabled={!hasTurmas}
            title={!hasTurmas ? 'Selecione uma turma para agendamento em lote' : undefined}
          >
            Agendamento em Lote
          </Button>
          <Button onClick={() => store.openEventModal()}>
            Novo Evento
          </Button>
        </div>
      </div>

      {/* Calendar + Day Panel */}
      <div className="flex gap-4">
        <div className={`flex-1 transition-all ${store.selectedDate ? 'w-2/3' : 'w-full'}`}>
          <CalendarView
            companyId={companyId}
            classInstanceIds={classInstanceIds.length > 0 ? classInstanceIds : undefined}
            gotoDate={calendarGoto?.date}
            gotoKey={calendarGoto?.key}
            holidays={holidays}
            blockedDays={blockedDays}
            holidayMap={holidayMap}
            onDateClick={handleDateClickWithVeto}
            onEventClick={handleEventClick}
          />
        </div>

        {store.selectedDate && (
          <div className="w-1/3 min-w-[320px]">
            <DayDetailPanel
              date={store.selectedDate}
              events={dayEvents}
              onClose={() => store.setSelectedDate(null)}
              onEventClick={handleEventClick}
              onCreateEvent={(date) => {
                store.setSelectedDate(date)
                store.openEventModal()
              }}
            />
          </div>
        )}
      </div>

      {/* Conflict Resolution — detects events on holidays/weekends */}
      <ConflictResolutionPanel
        companyId={companyId}
        startDate={new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]!}
        endDate={new Date(new Date().getFullYear(), new Date().getMonth() + 2, 0).toISOString().split('T')[0]!}
        classInstanceId={classInstanceIds[0]}
        onResolved={handleSave}
      />

      {/* Academic Year Panel — Pertence a INSTITUICAO, nao a turma. Sempre visivel. */}
      {(
        <details className="group">
          <summary className="flex items-center gap-2 cursor-pointer select-none text-sm font-medium text-muted-foreground hover:text-foreground transition-colors py-2">
            <span className="text-xs transition-transform group-open:rotate-90">&#9654;</span>
            Compliance MEC &amp; Ano Letivo (opcional)
          </summary>
          <div className="mt-2">
            <AcademicYearPanel
              companyId={companyId}
              onYearSelect={(date) => setCalendarGoto({ date, key: Date.now() })}
              onHolidaysChange={setHolidays}
            />
          </div>
        </details>
      )}

      {/* Modals */}
      <EventModal
        isOpen={store.eventModalOpen}
        onClose={store.closeEventModal}
        companyId={companyId}
        editingEventId={store.editingEventId}
        classInstanceId={classInstanceIds[0] ?? undefined}
        onSave={handleSave}
        dayEvents={dayEvents}
        selectedDate={store.selectedDate}
        holidayMap={holidayMap}
      />

      <SelectionWizard
        isOpen={store.wizardOpen}
        onClose={store.closeWizard}
        onComplete={handleWizardComplete}
        initialCompanyId={companyId}
        alreadySelected={classInstanceIds}
      />

      <BatchSchedulerModal
        isOpen={store.batchModalOpen}
        onClose={store.closeBatchModal}
        companyId={companyId}
        classInstanceId={store.selection?.classInstanceId ?? ''}
        onComplete={handleBatchComplete}
      />

      <RecurrenceEditDialog
        isOpen={store.recurrenceDialogOpen}
        onClose={store.closeRecurrenceDialog}
        action={store.recurrenceDialogAction}
        eventTitle={dayEvents.find((e) => e.id === store.recurrenceDialogEventId)?.title ?? ''}
        onSelect={async (scope: RecurrenceScope) => {
          const eid = store.recurrenceDialogEventId
          if (!eid) return
          store.closeRecurrenceDialog()

          const evt = dayEvents.find((e) => e.id === eid) as any
          const groupId = evt?.recurrence_group_id

          if (store.recurrenceDialogAction === 'delete') {
            try {
              if (scope === 'single') {
                await apiFetch(`/companies/${companyId}/events/${eid}`, { method: 'DELETE' })
                toast.success('Evento excluido')
              } else if (scope === 'following' && groupId) {
                await apiFetch(`/recurrence-groups/${groupId}/split`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ eventId: eid, splitReason: 'delete_following' }),
                })
                toast.success('Serie dividida e eventos futuros removidos')
              } else if (scope === 'all' && groupId) {
                await apiFetch(`/recurrence-groups/${groupId}`, { method: 'DELETE' })
                toast.success('Toda a serie excluida')
              }
              handleSave()
            } catch (err: any) {
              toast.error(err?.message ?? 'Erro ao excluir')
            }
          } else {
            // Edit: for 'single', split first then open editor
            if (scope === 'single' && groupId) {
              try {
                await apiFetch(`/recurrence-groups/${groupId}/split`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ eventId: eid, splitReason: 'edit_single' }),
                })
              } catch { /* split may fail if only 1 event — proceed anyway */ }
            }
            store.openEventModal(eid)
          }
        }}
      />

      <CascadePushPreviewModal
        isOpen={store.cascadePushOpen}
        onClose={store.closeCascadePush}
        companyId={companyId}
        eventId={store.cascadePushEventId ?? ''}
        eventTitle={store.cascadePushEventTitle}
        originalDate={store.cascadePushOriginalDate}
        newDate={store.cascadePushNewDate}
        onComplete={handleSave}
      />

      <ShareCalendarModal
        isOpen={store.shareModalOpen}
        onClose={store.closeShareModal}
        companyId={companyId}
      />

      {/* Epic 7: IA Calendar Assistant (FAB) */}
      <CalendarAssistant
        companyId={companyId}
        classInstanceIds={classInstanceIds.length > 0 ? classInstanceIds : undefined}
        visibleEvents={allCalendarEvents}
      />
    </div>
  )
}
