'use client'

/**
 * RecurrenceEditDialog — SCHED-021
 * "This event" | "This and following" | "All events in series"
 * Shown when user clicks on a recurring event to edit or delete.
 * R6: ALWAYS ask scope when editing a recurring series.
 */

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
} from '@cogedu/ui'
import { Pencil, Trash2, CalendarRange, Calendar, CalendarDays } from 'lucide-react'

// ============================================================================
// TYPES
// ============================================================================

export type RecurrenceScope = 'single' | 'following' | 'all'
export type RecurrenceAction = 'edit' | 'delete'

interface RecurrenceEditDialogProps {
  isOpen: boolean
  onClose: () => void
  action: RecurrenceAction
  eventTitle: string
  seriesCount?: number
  onSelect: (scope: RecurrenceScope) => void
}

// ============================================================================
// COMPONENT
// ============================================================================

export function RecurrenceEditDialog({
  isOpen,
  onClose,
  action,
  eventTitle,
  seriesCount,
  onSelect,
}: RecurrenceEditDialogProps) {
  const isDelete = action === 'delete'
  const actionLabel = isDelete ? 'Excluir' : 'Editar'
  const ActionIcon = isDelete ? Trash2 : Pencil

  const options: Array<{
    scope: RecurrenceScope
    icon: typeof Calendar
    title: string
    description: string
  }> = [
    {
      scope: 'single',
      icon: Calendar,
      title: `${actionLabel} somente este evento`,
      description: 'Desvincula este evento da serie e aplica a alteracao apenas nele.',
    },
    {
      scope: 'following',
      icon: CalendarRange,
      title: `${actionLabel} este e os seguintes`,
      description: 'Divide a serie neste ponto. Aplica a alteracao daqui em diante.',
    },
    {
      scope: 'all',
      icon: CalendarDays,
      title: `${actionLabel} todos os eventos da serie`,
      description: seriesCount
        ? `Aplica a alteracao em todos os ${seriesCount} eventos da serie.`
        : 'Aplica a alteracao em todos os eventos da serie.',
    },
  ]

  return (
    <Dialog open={isOpen} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ActionIcon className={`h-5 w-5 ${isDelete ? 'text-destructive' : ''}`} />
            {actionLabel} evento recorrente
          </DialogTitle>
          <DialogDescription>
            <strong>{eventTitle}</strong> faz parte de uma serie recorrente.
            Como deseja prosseguir?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          {options.map((opt) => {
            const Icon = opt.icon
            return (
              <button
                key={opt.scope}
                type="button"
                onClick={() => { onSelect(opt.scope); onClose() }}
                className={`w-full rounded-lg border-2 p-4 text-left transition-all hover:border-primary/30 hover:bg-accent/30 ${
                  isDelete && opt.scope === 'all'
                    ? 'border-destructive/20 hover:border-destructive/40 hover:bg-destructive/5'
                    : 'border-border'
                }`}
              >
                <div className="flex items-start gap-3">
                  <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${
                    isDelete && opt.scope === 'all' ? 'text-destructive' : 'text-muted-foreground'
                  }`} />
                  <div>
                    <p className={`text-sm font-semibold ${
                      isDelete && opt.scope === 'all' ? 'text-destructive' : ''
                    }`}>{opt.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{opt.description}</p>
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
