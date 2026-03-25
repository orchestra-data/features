'use client'

/**
 * HolidayNegotiationModal — SCHED-022
 * Story 3.1: When user tries to save an event on a holiday/blocked day,
 * this modal offers: move to next business day, keep anyway, or cancel.
 * R1: Hard block without allow_on_holiday.
 */

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Badge,
} from '@cogedu/ui'
import { CalendarX, ArrowRight, ShieldAlert, Loader2 } from 'lucide-react'
import { apiFetch } from '../../../client/apiClient'

// ============================================================================
// TYPES
// ============================================================================

export type NegotiationResult =
  | { action: 'move'; newDate: string; dayOfWeek: string }
  | { action: 'keep' }
  | { action: 'cancel' }

interface HolidayNegotiationModalProps {
  isOpen: boolean
  onClose: () => void
  companyId: string
  eventDate: string // YYYY-MM-DD
  holidayName: string
  onResult: (result: NegotiationResult) => void
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

export function HolidayNegotiationModal({
  isOpen,
  onClose,
  companyId,
  eventDate,
  holidayName,
  onResult,
}: HolidayNegotiationModalProps) {
  const [nextBizDay, setNextBizDay] = useState<{ date: string; dayOfWeek: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch next business day when modal opens
  const fetchNextBizDay = async () => {
    if (nextBizDay) return // already fetched
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch<{
        nextBusinessDay: string
        dayOfWeek: string
        skippedDays: number
      }>(`/companies/${companyId}/next-business-day?from=${eventDate}`)
      setNextBizDay({ date: res.nextBusinessDay, dayOfWeek: res.dayOfWeek })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao buscar proximo dia util')
    } finally {
      setLoading(false)
    }
  }

  // Fetch on open
  if (isOpen && !nextBizDay && !loading && !error) {
    fetchNextBizDay()
  }

  // Reset on close
  const handleClose = () => {
    setNextBizDay(null)
    setError(null)
    setLoading(false)
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarX className="h-5 w-5 text-red-500" />
            Conflito com Feriado
          </DialogTitle>
          <DialogDescription>
            O dia <strong>{formatDateBR(eventDate)}</strong> e{' '}
            <Badge variant="destructive" className="text-xs">{holidayName}</Badge>.
            O que deseja fazer?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          {/* Option 1: Move to next business day */}
          <button
            type="button"
            onClick={() => {
              if (nextBizDay) {
                onResult({ action: 'move', newDate: nextBizDay.date, dayOfWeek: nextBizDay.dayOfWeek })
                handleClose()
              }
            }}
            disabled={loading || !!error || !nextBizDay}
            className="w-full rounded-lg border-2 border-primary/20 bg-primary/5 p-4 text-left transition-all hover:border-primary/40 hover:bg-primary/10 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="flex items-center gap-3">
              <ArrowRight className="h-5 w-5 text-primary shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-primary">Mover para proximo dia util</p>
                {loading ? (
                  <div className="flex items-center gap-2 mt-1">
                    <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Calculando...</span>
                  </div>
                ) : nextBizDay ? (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatDateBR(eventDate)} → <strong>{formatDateBR(nextBizDay.date)}</strong> ({nextBizDay.dayOfWeek})
                  </p>
                ) : error ? (
                  <p className="text-xs text-destructive mt-0.5">{error}</p>
                ) : null}
              </div>
            </div>
          </button>

          {/* Option 2: Keep anyway (allow_on_holiday = true) */}
          <button
            type="button"
            onClick={() => { onResult({ action: 'keep' }); handleClose() }}
            className="w-full rounded-lg border-2 border-border p-4 text-left transition-all hover:border-amber-300 hover:bg-amber-50/50"
          >
            <div className="flex items-center gap-3">
              <ShieldAlert className="h-5 w-5 text-amber-500 shrink-0" />
              <div>
                <p className="text-sm font-semibold">Manter mesmo assim</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  O evento sera marcado como &quot;permitido em feriado&quot;.
                </p>
              </div>
            </div>
          </button>

          {/* Option 3: Cancel */}
          <button
            type="button"
            onClick={() => { onResult({ action: 'cancel' }); handleClose() }}
            className="w-full rounded-lg border-2 border-border p-4 text-left transition-all hover:border-muted-foreground/30 hover:bg-muted/30"
          >
            <div className="flex items-center gap-3">
              <CalendarX className="h-5 w-5 text-muted-foreground shrink-0" />
              <div>
                <p className="text-sm font-semibold text-muted-foreground">Cancelar</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Voltar e escolher outra data.
                </p>
              </div>
            </div>
          </button>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose} className="text-xs">Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
