'use client'

/**
 * ConflictResolutionPanel — SCHED-024
 * Story 4.2: Detect events outside school days and offer resolution.
 * Shows conflicts with actions: move to next school day, keep, or bulk resolve.
 */

import { useCallback, useEffect, useState } from 'react'
import {
  Button,
  Badge,
  Skeleton,
} from '@cogedu/ui'
import { AlertTriangle, ArrowRight, Check, Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch } from '../../../client/apiClient'

// ============================================================================
// TYPES
// ============================================================================

interface ConflictItem {
  eventId: string
  eventTitle: string
  currentDate: string
  conflictType: 'holiday' | 'weekend' | 'time_overlap' | 'outside_school_day'
  detail: string
  suggestedDate: string | null
}

interface DetectConflictsResponse {
  totalEvents: number
  totalConflicts: number
  conflicts: ConflictItem[]
}

interface ConflictResolutionPanelProps {
  companyId: string
  startDate: string
  endDate: string
  classInstanceId?: string
  onResolved?: () => void
}

// ============================================================================
// HELPERS
// ============================================================================

function formatDateBR(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

const CONFLICT_LABELS: Record<string, { label: string; color: string }> = {
  holiday: { label: 'Feriado', color: 'bg-red-100 text-red-700 border-red-200' },
  weekend: { label: 'Fim de semana', color: 'bg-orange-100 text-orange-700 border-orange-200' },
  time_overlap: { label: 'Sobreposicao', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  outside_school_day: { label: 'Fora do dia letivo', color: 'bg-purple-100 text-purple-700 border-purple-200' },
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ConflictResolutionPanel({
  companyId,
  startDate,
  endDate,
  classInstanceId,
  onResolved,
}: ConflictResolutionPanelProps) {
  const [conflicts, setConflicts] = useState<ConflictItem[]>([])
  const [totalEvents, setTotalEvents] = useState(0)
  const [loading, setLoading] = useState(false)
  const [resolving, setResolving] = useState<Set<string>>(new Set())

  const fetchConflicts = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch<DetectConflictsResponse>(
        `/companies/${companyId}/calendar/detect-conflicts`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ startDate, endDate, classInstanceId }),
        },
      )
      setConflicts(res.conflicts)
      setTotalEvents(res.totalEvents)
    } catch (err) {
      toast.error('Erro ao detectar conflitos')
    } finally {
      setLoading(false)
    }
  }, [companyId, startDate, endDate, classInstanceId])

  useEffect(() => {
    if (companyId && startDate && endDate) fetchConflicts()
  }, [fetchConflicts, companyId, startDate, endDate])

  // Move single event to suggested date
  const handleMove = useCallback(async (conflict: ConflictItem) => {
    if (!conflict.suggestedDate) return
    setResolving((prev) => new Set([...prev, conflict.eventId]))
    try {
      await apiFetch(`/companies/${companyId}/events/${conflict.eventId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDatetime: `${conflict.suggestedDate}T08:00:00`,
          endDatetime: `${conflict.suggestedDate}T09:00:00`,
        }),
      })
      setConflicts((prev) => prev.filter((c) => c.eventId !== conflict.eventId))
      toast.success(`"${conflict.eventTitle}" movido para ${formatDateBR(conflict.suggestedDate)}`)
      onResolved?.()
    } catch {
      toast.error('Erro ao mover evento')
    } finally {
      setResolving((prev) => { const n = new Set(prev); n.delete(conflict.eventId); return n })
    }
  }, [companyId, onResolved])

  // Bulk resolve: move all with suggestions
  const handleBulkResolve = useCallback(async () => {
    const moveable = conflicts.filter((c) => c.suggestedDate)
    if (moveable.length === 0) return

    setResolving(new Set(moveable.map((c) => c.eventId)))
    let moved = 0
    for (const c of moveable) {
      try {
        await apiFetch(`/companies/${companyId}/events/${c.eventId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            startDatetime: `${c.suggestedDate}T08:00:00`,
            endDatetime: `${c.suggestedDate}T09:00:00`,
          }),
        })
        moved++
      } catch { /* continue */ }
    }
    toast.success(`${moved} evento(s) movido(s)`)
    setResolving(new Set())
    fetchConflicts()
    onResolved?.()
  }, [conflicts, companyId, fetchConflicts, onResolved])

  if (loading) {
    return (
      <div className="space-y-2 p-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    )
  }

  if (conflicts.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
        <Check className="h-4 w-4 text-green-600" />
        <span className="text-sm text-green-700">
          Nenhum conflito detectado ({totalEvents} eventos verificados)
        </span>
        <Button variant="ghost" size="sm" onClick={fetchConflicts} className="ml-auto">
          <RefreshCw className="h-3 w-3" />
        </Button>
      </div>
    )
  }

  const moveableCount = conflicts.filter((c) => c.suggestedDate).length

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-semibold">
            {conflicts.length} conflito(s) detectado(s)
          </span>
          <Badge variant="outline" className="text-xs">
            {totalEvents} eventos analisados
          </Badge>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={fetchConflicts}>
            <RefreshCw className="h-3 w-3 mr-1" /> Redetectar
          </Button>
          {moveableCount > 0 && (
            <Button size="sm" onClick={handleBulkResolve} disabled={resolving.size > 0}>
              {resolving.size > 0 ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <ArrowRight className="h-3 w-3 mr-1" />
              )}
              Resolver todos ({moveableCount})
            </Button>
          )}
        </div>
      </div>

      {/* Conflict list */}
      <div className="rounded-lg border border-border divide-y divide-border/50 max-h-64 overflow-y-auto">
        {conflicts.map((c) => {
          const cfg = CONFLICT_LABELS[c.conflictType] ?? CONFLICT_LABELS.outside_school_day
          const isMoving = resolving.has(c.eventId)
          return (
            <div key={c.eventId} className="flex items-center gap-3 px-3 py-2 text-sm">
              <Badge variant="outline" className={`text-[10px] shrink-0 ${cfg.color}`}>
                {cfg.label}
              </Badge>
              <div className="flex-1 min-w-0">
                <span className="font-medium truncate block">{c.eventTitle}</span>
                <span className="text-xs text-muted-foreground">
                  {formatDateBR(c.currentDate)} — {c.detail}
                </span>
              </div>
              {c.suggestedDate && (
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-xs text-muted-foreground">{formatDateBR(c.suggestedDate)}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleMove(c)}
                    disabled={isMoving}
                    className="h-7 px-2"
                  >
                    {isMoving ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <ArrowRight className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
