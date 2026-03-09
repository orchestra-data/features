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
import { Button, Badge } from '@cogedu/ui'
import { X, GraduationCap } from 'lucide-react'
import CalendarView from './components/CalendarView'
import { DayDetailPanel } from './components/DayDetailPanel'
import { EventModal } from './components/EventModal'
import { SelectionWizard } from './components/SelectionWizard'
import { BatchSchedulerModal } from './components/BatchSchedulerModal'
import { AcademicYearPanel } from './components/AcademicYearPanel'
import { useSchedulingStore } from './stores/useSchedulingStore'

export function AcademicSchedulingModule() {
  const { companyId = '' } = useParams<{ companyId: string }>()
  const store = useSchedulingStore()
  const [calendarGoto, setCalendarGoto] = useState<{ date: string; key: number } | undefined>(undefined)
  const [holidays, setHolidays] = useState<{ date: string; reason: string }[]>([])

  // Derive classInstanceIds for filtering
  const classInstanceIds = useMemo(
    () => store.selectedTurmas.map((t) => t.classInstanceId),
    [store.selectedTurmas],
  )

  // Handlers
  const handleDateClick = useCallback((date: Date) => {
    store.setSelectedDate(date)
  }, [store])

  const handleEventClick = useCallback((eventId: string) => {
    store.openEventModal(eventId)
  }, [store])

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

  const hasTurmas = store.selectedTurmas.length > 0

  return (
    <div className="flex flex-col gap-4 p-4">
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
              Nenhuma turma selecionada — mostrando todos os eventos
            </span>
          )}
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" onClick={() => store.openWizard()}>
            {hasTurmas ? 'Adicionar Turma' : 'Selecionar Turma'}
          </Button>
          <Button variant="outline" onClick={() => store.openBatchModal()}>
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
            onDateClick={handleDateClick}
            onEventClick={handleEventClick}
          />
        </div>

        {store.selectedDate && (
          <div className="w-1/3 min-w-[320px]">
            <DayDetailPanel
              date={store.selectedDate}
              events={[]}
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

      {/* Academic Year Panel */}
      <AcademicYearPanel
        companyId={companyId}
        onYearSelect={(date) => setCalendarGoto({ date, key: Date.now() })}
        onHolidaysChange={setHolidays}
      />

      {/* Modals */}
      <EventModal
        isOpen={store.eventModalOpen}
        onClose={store.closeEventModal}
        companyId={companyId}
        editingEventId={store.editingEventId}
        classInstanceId={classInstanceIds[0] ?? undefined}
        onSave={handleSave}
      />

      <SelectionWizard
        isOpen={store.wizardOpen}
        onClose={store.closeWizard}
        onComplete={handleWizardComplete}
        initialCompanyId={companyId}
      />

      <BatchSchedulerModal
        isOpen={store.batchModalOpen}
        onClose={store.closeBatchModal}
        companyId={companyId}
        classInstanceId={store.selection?.classInstanceId ?? ''}
        onComplete={handleBatchComplete}
      />
    </div>
  )
}
