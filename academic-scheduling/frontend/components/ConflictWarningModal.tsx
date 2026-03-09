'use client'

/**
 * ConflictWarningModal — SCHED-015
 * Displays calendar conflicts (time overlaps, resource clashes, holiday conflicts)
 * with per-conflict resolution actions.
 *
 * Uses @cogedu/ui components (ZERO axios, ZERO inline styles).
 */

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@cogedu/ui'
import { Button, Badge } from '@cogedu/ui'
import { AlertTriangle, Clock, Users, CalendarX } from 'lucide-react'

// ============================================================================
// TYPES
// ============================================================================

export interface ConflictItem {
  type: 'time_overlap' | 'resource_clash' | 'holiday_conflict'
  eventA: string
  eventB?: string
  date: string
  detail: string
}

interface ConflictWarningModalProps {
  isOpen: boolean
  onClose: () => void
  conflicts: ConflictItem[]
  onResolve: (resolution: string) => void
}

// ============================================================================
// CONFLICT DISPLAY CONFIG
// ============================================================================

const CONFLICT_CONFIG: Record<
  ConflictItem['type'],
  {
    label: string
    icon: typeof AlertTriangle
    badgeClass: string
    borderClass: string
    bgClass: string
  }
> = {
  time_overlap: {
    label: 'Sobreposicao de horario',
    icon: Clock,
    badgeClass: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    borderClass: 'border-yellow-300',
    bgClass: 'bg-yellow-50',
  },
  resource_clash: {
    label: 'Conflito de recurso',
    icon: Users,
    badgeClass: 'bg-orange-100 text-orange-800 border-orange-300',
    borderClass: 'border-orange-300',
    bgClass: 'bg-orange-50',
  },
  holiday_conflict: {
    label: 'Conflito com feriado',
    icon: CalendarX,
    badgeClass: 'bg-red-100 text-red-800 border-red-300',
    borderClass: 'border-red-300',
    bgClass: 'bg-red-50',
  },
}

// ============================================================================
// HELPERS
// ============================================================================

function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-')
  return `${day}/${month}/${year}`
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function ConflictCard({
  conflict,
  onResolve,
}: {
  conflict: ConflictItem
  onResolve: (resolution: string) => void
}) {
  const config = CONFLICT_CONFIG[conflict.type]
  const Icon = config.icon

  return (
    <div className={`rounded-lg border p-3 ${config.borderClass} ${config.bgClass}`}>
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-current opacity-70" />

        <div className="flex-1 space-y-2">
          {/* Header */}
          <div className="flex items-center justify-between">
            <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${config.badgeClass}`}>
              {config.label}
            </span>
            <span className="text-xs text-muted-foreground">{formatDate(conflict.date)}</span>
          </div>

          {/* Events involved */}
          <div className="space-y-1">
            <p className="text-sm font-medium">{conflict.eventA}</p>
            {conflict.eventB && (
              <p className="text-sm text-muted-foreground">
                <span className="mr-1">vs</span>
                {conflict.eventB}
              </p>
            )}
          </div>

          {/* Detail */}
          <p className="text-xs text-muted-foreground">{conflict.detail}</p>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onResolve(`move:${conflict.eventA}:${conflict.date}`)}
            >
              Mover
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onResolve(`ignore:${conflict.eventA}:${conflict.date}`)}
            >
              Ignorar
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => onResolve(`cancel:${conflict.eventA}:${conflict.date}`)}
            >
              Cancelar
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ConflictWarningModal({
  isOpen,
  onClose,
  conflicts,
  onResolve,
}: ConflictWarningModalProps) {
  const timeOverlaps = conflicts.filter((c) => c.type === 'time_overlap')
  const resourceClashes = conflicts.filter((c) => c.type === 'resource_clash')
  const holidayConflicts = conflicts.filter((c) => c.type === 'holiday_conflict')

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-600" />
            Conflitos Detectados
          </DialogTitle>
          <DialogDescription>
            Revise e resolva os conflitos abaixo antes de prosseguir.
          </DialogDescription>
        </DialogHeader>

        {/* ── Summary badges ── */}
        <div className="flex flex-wrap gap-2">
          {timeOverlaps.length > 0 && (
            <Badge variant="outline" className="border-yellow-300 bg-yellow-50 text-yellow-800">
              <Clock className="mr-1 h-3 w-3" />
              {timeOverlaps.length} sobreposicao(oes)
            </Badge>
          )}
          {resourceClashes.length > 0 && (
            <Badge variant="outline" className="border-orange-300 bg-orange-50 text-orange-800">
              <Users className="mr-1 h-3 w-3" />
              {resourceClashes.length} recurso(s)
            </Badge>
          )}
          {holidayConflicts.length > 0 && (
            <Badge variant="outline" className="border-red-300 bg-red-50 text-red-800">
              <CalendarX className="mr-1 h-3 w-3" />
              {holidayConflicts.length} feriado(s)
            </Badge>
          )}
        </div>

        {/* ── Conflict list ── */}
        <div className="max-h-96 space-y-3 overflow-y-auto pr-1">
          {conflicts.map((conflict, idx) => (
            <ConflictCard
              key={`${conflict.type}-${conflict.date}-${conflict.eventA}-${idx}`}
              conflict={conflict}
              onResolve={onResolve}
            />
          ))}

          {conflicts.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhum conflito encontrado.
            </p>
          )}
        </div>

        {/* ── Footer summary ── */}
        <DialogFooter className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {conflicts.length} conflito(s) encontrado(s)
          </span>
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
