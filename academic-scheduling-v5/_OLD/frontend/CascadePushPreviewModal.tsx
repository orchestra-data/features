'use client'

/**
 * CascadePushPreviewModal — SCHED-023
 * Story 4.3: Preview cascade push before confirming.
 * R11: Preview is MANDATORY before cascade push.
 * R12: Alert if cascade crosses months.
 * R13: Cascade is ATOMIC — all or nothing.
 */

import { useCallback, useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Badge,
  Switch,
  Label,
} from '@cogedu/ui'
import { ArrowRight, AlertTriangle, Loader2, CheckCircle2, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch } from '../../../client/apiClient'

// ============================================================================
// TYPES
// ============================================================================

interface MovedEvent {
  eventId: string
  title: string
  from: string
  to: string
}

interface SkippedEvent {
  eventId: string
  title: string
  reason: string
}

interface CascadePreview {
  dryRun: true
  deltaDays: number
  crossesMonths: boolean
  moved: MovedEvent[]
  skipped: SkippedEvent[]
  totalAffected: number
}

interface CascadePushPreviewModalProps {
  isOpen: boolean
  onClose: () => void
  companyId: string
  eventId: string
  eventTitle: string
  originalDate: string // YYYY-MM-DD
  newDate: string // YYYY-MM-DD
  onComplete: () => void
}

// ============================================================================
// HELPERS
// ============================================================================

function formatDateBR(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

// ============================================================================
// COMPONENT
// ============================================================================

export function CascadePushPreviewModal({
  isOpen,
  onClose,
  companyId,
  eventId,
  eventTitle,
  originalDate,
  newDate,
  onComplete,
}: CascadePushPreviewModalProps) {
  const [preview, setPreview] = useState<CascadePreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [skipHolidays, setSkipHolidays] = useState(true)
  const [skipWeekends, setSkipWeekends] = useState(true)
  const [affectSameTurma, setAffectSameTurma] = useState(true)

  // Fetch preview (dry run)
  const fetchPreview = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch<CascadePreview>(
        `/companies/${companyId}/events/${eventId}/cascade-push`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            newDate,
            skipHolidays,
            skipWeekends,
            affectSameTurma,
            dryRun: true,
          }),
        },
      )
      setPreview(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao calcular preview')
    } finally {
      setLoading(false)
    }
  }, [companyId, eventId, newDate, skipHolidays, skipWeekends, affectSameTurma])

  // Auto-fetch on open
  useEffect(() => {
    if (isOpen) {
      setPreview(null)
      fetchPreview()
    }
  }, [isOpen, fetchPreview])

  // Execute cascade push (real)
  const handleExecute = useCallback(async () => {
    setExecuting(true)
    setError(null)
    try {
      await apiFetch(`/companies/${companyId}/events/${eventId}/cascade-push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newDate,
          skipHolidays,
          skipWeekends,
          affectSameTurma,
          dryRun: false,
        }),
      })

      toast.success(`${preview?.moved.length ?? 0} eventos movidos com sucesso`, {
        action: {
          label: 'Desfazer',
          onClick: () => {
            // Undo: push back to original date
            apiFetch(`/companies/${companyId}/events/${eventId}/cascade-push`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                newDate: originalDate,
                skipHolidays: false,
                skipWeekends: false,
                affectSameTurma,
                dryRun: false,
              }),
            })
              .then(() => toast.success('Empurrao desfeito'))
              .catch(() => toast.error('Erro ao desfazer'))
          },
        },
        duration: 30_000, // 30s undo window
      })

      onComplete()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao executar cascade push')
    } finally {
      setExecuting(false)
    }
  }, [companyId, eventId, newDate, skipHolidays, skipWeekends, affectSameTurma, preview, originalDate, onComplete, onClose])

  const deltaDays = preview?.deltaDays ?? 0
  const direction = deltaDays >= 0 ? 'adiante' : 'atras'

  return (
    <Dialog open={isOpen} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRight className="h-5 w-5 text-primary" />
            Empurrar Eventos em Cascata
          </DialogTitle>
          <DialogDescription>
            Mover <strong>{eventTitle}</strong> de {formatDateBR(originalDate)} para{' '}
            {formatDateBR(newDate)} e empurrar todos os eventos seguintes.
          </DialogDescription>
        </DialogHeader>

        {/* Config toggles */}
        <div className="flex flex-wrap gap-4 py-2 border-b border-border">
          <div className="flex items-center gap-2">
            <Switch checked={skipHolidays} onCheckedChange={(v) => setSkipHolidays(!!v)} />
            <Label className="text-xs cursor-pointer">Pular feriados</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={skipWeekends} onCheckedChange={(v) => setSkipWeekends(!!v)} />
            <Label className="text-xs cursor-pointer">Pular fins de semana</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={affectSameTurma} onCheckedChange={(v) => setAffectSameTurma(!!v)} />
            <Label className="text-xs cursor-pointer">Somente mesma turma</Label>
          </div>
          <Button variant="ghost" size="sm" onClick={fetchPreview} disabled={loading} className="text-xs ml-auto">
            Recalcular
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-12 gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Calculando preview...</span>
            </div>
          ) : error ? (
            <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive my-4">
              {error}
            </div>
          ) : preview ? (
            <div className="space-y-4 py-3">
              {/* Summary */}
              <div className="flex items-center gap-3 flex-wrap">
                <Badge variant="secondary" className="text-sm py-1">
                  {Math.abs(deltaDays)} dias {direction}
                </Badge>
                <Badge variant="outline" className="text-sm py-1">
                  {preview.moved.length} eventos movidos
                </Badge>
                {preview.skipped.length > 0 && (
                  <Badge variant="outline" className="text-sm py-1 border-amber-300 text-amber-700">
                    {preview.skipped.length} pulados
                  </Badge>
                )}
              </div>

              {/* R12: Cross-month warning */}
              {preview.crossesMonths && (
                <div className="flex items-center gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-700">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>Alguns eventos serao movidos para um mes diferente do original.</span>
                </div>
              )}

              {/* Moved events list */}
              {preview.moved.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Eventos que serao movidos
                  </p>
                  <div className="rounded-lg border border-border divide-y divide-border/50 max-h-48 overflow-y-auto">
                    {preview.moved.map((evt) => (
                      <div key={evt.eventId} className="flex items-center gap-2 px-3 py-2 text-sm">
                        <span className="flex-1 truncate">{evt.title}</span>
                        <span className="font-mono text-xs text-muted-foreground shrink-0">
                          {formatDateBR(evt.from)}
                        </span>
                        <ArrowRight className="h-3 w-3 text-primary shrink-0" />
                        <span className="font-mono text-xs font-medium text-primary shrink-0">
                          {formatDateBR(evt.to)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Skipped events */}
              {preview.skipped.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Eventos pulados
                  </p>
                  <div className="rounded-lg border border-amber-200 bg-amber-50/50 divide-y divide-amber-200/50 max-h-32 overflow-y-auto">
                    {preview.skipped.map((evt) => (
                      <div key={evt.eventId} className="flex items-center gap-2 px-3 py-2 text-sm">
                        <span className="flex-1 truncate text-amber-700">{evt.title}</span>
                        <span className="text-xs text-amber-600 shrink-0">{evt.reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <DialogFooter className="gap-2 pt-2 border-t border-border">
          <Button variant="outline" onClick={onClose} disabled={executing}>
            Cancelar
          </Button>
          <Button
            onClick={handleExecute}
            disabled={executing || loading || !preview || preview.moved.length === 0}
          >
            {executing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Movendo...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Confirmar ({preview?.moved.length ?? 0} eventos)
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
