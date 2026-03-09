/**
 * Academic Scheduling v4 — barrel export.
 * Tab 8 "Calendario" in CompanyDetail.
 * Supercalendario: view, schedule, and configure components from the calendar.
 */

// Main module (lazy-loaded by CompanyDetail Tab 8)
export { default as AcademicSchedulingModule } from './AcademicSchedulingModule'

// Phase 2: Core Components
export { CalendarView } from './components/CalendarView'
export { DayDetailPanel } from './components/DayDetailPanel'
export { EventModal } from './components/EventModal'
export { SelectionWizard } from './components/SelectionWizard'
export { BatchSchedulerModal } from './components/BatchSchedulerModal'

// Phase 3: Holidays & Conflicts
export { HolidayDiscovery } from './components/HolidayDiscovery'
export { ConflictWarningModal } from './components/ConflictWarningModal'

// Phase 4: Drag & Drop
export { MoveWarningModal } from './components/MoveWarningModal'

// Phase 5: Cockpit
export { ComponentDetailModal } from './components/ComponentDetailModal'
export { ComponentInlineEditor } from './components/ComponentInlineEditor'
export { QuickActionsPopover } from './components/QuickActionsPopover'

// Hooks
export { useCalendarEvents } from './hooks/useCalendarEvents'
export { useCompanies, useClassInstances, usePathways, useSeries } from './hooks/useHierarchyData'
export { useEventDragDrop } from './hooks/useEventDragDrop'
export { useHolidayCascade } from './hooks/useHolidayCascade'

// Store
export { useSchedulingStore } from './stores/useSchedulingStore'
