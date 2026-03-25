/**
 * useSchedulingStore — Zustand store for academic scheduling state.
 * Manages: selected turmas, view mode, modals, and UI state.
 * API calls go through TanStack Query hooks, NOT through this store.
 */
import { create } from 'zustand'

export interface SelectedTurma {
  classInstanceId: string
  classInstanceName: string
  pathwayId?: string
  seriesId?: string
}

export interface SchedulingSelection {
  companyId: string
  classInstanceId?: string
  pathwayId?: string
  seriesId?: string
}

export interface SchedulingState {
  // Selected turmas (multiple)
  selectedTurmas: SelectedTurma[]
  addTurma: (turma: SelectedTurma) => void
  removeTurma: (classInstanceId: string) => void
  clearTurmas: () => void

  // Legacy single selection (kept for backward compat)
  selection: SchedulingSelection | null
  setSelection: (s: SchedulingSelection | null) => void

  // View mode
  viewMode: 'month' | 'week' | 'day'
  setViewMode: (mode: 'month' | 'week' | 'day') => void

  // Selected date (for day detail panel)
  selectedDate: Date | null
  setSelectedDate: (date: Date | null) => void

  // Modals
  eventModalOpen: boolean
  editingEventId: string | null
  openEventModal: (eventId?: string) => void
  closeEventModal: () => void

  batchModalOpen: boolean
  openBatchModal: () => void
  closeBatchModal: () => void

  wizardOpen: boolean
  openWizard: () => void
  closeWizard: () => void

  holidayDiscoveryOpen: boolean
  openHolidayDiscovery: () => void
  closeHolidayDiscovery: () => void

  // Recurrence edit dialog
  recurrenceDialogOpen: boolean
  recurrenceDialogEventId: string | null
  recurrenceDialogAction: 'edit' | 'delete'
  openRecurrenceDialog: (eventId: string, action: 'edit' | 'delete') => void
  closeRecurrenceDialog: () => void

  // Cascade push preview
  cascadePushOpen: boolean
  cascadePushEventId: string | null
  cascadePushEventTitle: string
  cascadePushOriginalDate: string
  cascadePushNewDate: string
  openCascadePush: (eventId: string, title: string, originalDate: string, newDate: string) => void
  closeCascadePush: () => void

  // Share modal
  shareModalOpen: boolean
  openShareModal: () => void
  closeShareModal: () => void
}

export const useSchedulingStore = create<SchedulingState>((set, get) => ({
  // Turmas
  selectedTurmas: [],
  addTurma: (turma) =>
    set((state) => {
      // Don't add duplicates
      if (state.selectedTurmas.some((t) => t.classInstanceId === turma.classInstanceId)) {
        return state
      }
      return { selectedTurmas: [...state.selectedTurmas, turma] }
    }),
  removeTurma: (classInstanceId) =>
    set((state) => ({
      selectedTurmas: state.selectedTurmas.filter((t) => t.classInstanceId !== classInstanceId),
    })),
  clearTurmas: () => set({ selectedTurmas: [] }),

  // Legacy selection
  selection: null,
  setSelection: (selection) => set({ selection }),

  // View
  viewMode: 'month',
  setViewMode: (viewMode) => set({ viewMode }),

  // Selected date
  selectedDate: null,
  setSelectedDate: (selectedDate) => set({ selectedDate }),

  // Event modal
  eventModalOpen: false,
  editingEventId: null,
  openEventModal: (eventId) =>
    set({ eventModalOpen: true, editingEventId: eventId ?? null }),
  closeEventModal: () =>
    set({ eventModalOpen: false, editingEventId: null }),

  // Batch modal
  batchModalOpen: false,
  openBatchModal: () => set({ batchModalOpen: true }),
  closeBatchModal: () => set({ batchModalOpen: false }),

  // Wizard
  wizardOpen: false,
  openWizard: () => set({ wizardOpen: true }),
  closeWizard: () => set({ wizardOpen: false }),

  // Holiday discovery
  holidayDiscoveryOpen: false,
  openHolidayDiscovery: () => set({ holidayDiscoveryOpen: true }),
  closeHolidayDiscovery: () => set({ holidayDiscoveryOpen: false }),

  // Recurrence edit dialog
  recurrenceDialogOpen: false,
  recurrenceDialogEventId: null,
  recurrenceDialogAction: 'edit' as const,
  openRecurrenceDialog: (eventId, action) =>
    set({ recurrenceDialogOpen: true, recurrenceDialogEventId: eventId, recurrenceDialogAction: action }),
  closeRecurrenceDialog: () =>
    set({ recurrenceDialogOpen: false, recurrenceDialogEventId: null }),

  // Cascade push preview
  cascadePushOpen: false,
  cascadePushEventId: null,
  cascadePushEventTitle: '',
  cascadePushOriginalDate: '',
  cascadePushNewDate: '',
  openCascadePush: (eventId, title, originalDate, newDate) =>
    set({ cascadePushOpen: true, cascadePushEventId: eventId, cascadePushEventTitle: title, cascadePushOriginalDate: originalDate, cascadePushNewDate: newDate }),
  closeCascadePush: () =>
    set({ cascadePushOpen: false, cascadePushEventId: null }),

  // Share modal
  shareModalOpen: false,
  openShareModal: () => set({ shareModalOpen: true }),
  closeShareModal: () => set({ shareModalOpen: false }),
}))
