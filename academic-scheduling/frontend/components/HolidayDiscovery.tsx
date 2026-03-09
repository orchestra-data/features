'use client'

/**
 * HolidayDiscovery — SCHED-014
 * Multi-step modal to discover holidays via BrasilAPI (by company address)
 * and selectively sync them as blocked days.
 *
 * Uses @cogedu/ui components and apiFetch (ZERO axios).
 */

import { useState, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@cogedu/ui'
import { Button, Input, Label, Checkbox } from '@cogedu/ui'
import { Loader2, Search, CalendarCheck, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch } from '@/client/apiClient'

// ============================================================================
// TYPES
// ============================================================================

interface HolidayDiscoveryProps {
  companyId: string
  isOpen: boolean
  onClose: () => void
  onSync: () => void
}

interface DiscoveredHoliday {
  date: string
  name: string
  type: 'national' | 'state'
  stateCode?: string | null
}

interface DiscoverResponse {
  companyId: string
  year: number
  postalCode: string | null
  stateCode: string | null
  totalHolidays: number
  holidays: DiscoveredHoliday[]
}

interface SyncResponse {
  companyId: string
  year: number
  stateCode: string | null
  postalCode: string | null
  totalProcessed: number
  created: number
  skipped: number
}

type Step = 'input' | 'select' | 'syncing' | 'done'

// ============================================================================
// HELPERS
// ============================================================================

function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-')
  return `${day}/${month}/${year}`
}

function getHolidayTypeBadge(type: 'national' | 'state'): string {
  return type === 'national' ? 'Nacional' : 'Estadual'
}

function getHolidayTypeBadgeClass(type: 'national' | 'state'): string {
  return type === 'national'
    ? 'bg-blue-100 text-blue-800'
    : 'bg-purple-100 text-purple-800'
}

// ============================================================================
// COMPONENT
// ============================================================================

export function HolidayDiscovery({
  companyId,
  isOpen,
  onClose,
  onSync,
}: HolidayDiscoveryProps) {
  const [step, setStep] = useState<Step>('input')
  const [year, setYear] = useState<string>(String(new Date().getFullYear()))
  const [holidays, setHolidays] = useState<DiscoveredHoliday[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [discoverMeta, setDiscoverMeta] = useState<{ stateCode: string | null; postalCode: string | null }>({
    stateCode: null,
    postalCode: null,
  })
  const [isDiscovering, setIsDiscovering] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── Reset state on close ───────────────────────────────────────────
  const handleClose = useCallback(() => {
    setStep('input')
    setYear(String(new Date().getFullYear()))
    setHolidays([])
    setSelected(new Set())
    setError(null)
    setIsDiscovering(false)
    setIsSyncing(false)
    onClose()
  }, [onClose])

  // ── Step 1: Discover holidays ──────────────────────────────────────
  const handleDiscover = useCallback(async () => {
    if (!/^\d{4}$/.test(year)) {
      setError('Informe um ano valido (ex: 2026)')
      return
    }

    setIsDiscovering(true)
    setError(null)

    try {
      const data = await apiFetch<DiscoverResponse>(
        `/companies/${companyId}/holidays/discover?year=${year}`,
      )

      setHolidays(data.holidays)
      setDiscoverMeta({ stateCode: data.stateCode, postalCode: data.postalCode })

      // Select all by default
      const allIndices = new Set(data.holidays.map((_, i) => i))
      setSelected(allIndices)
      setStep('select')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao descobrir feriados'
      setError(message)
      toast.error('Erro ao descobrir feriados', { description: message })
    } finally {
      setIsDiscovering(false)
    }
  }, [companyId, year])

  // ── Toggle individual holiday ──────────────────────────────────────
  const toggleHoliday = useCallback((index: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }, [])

  // ── Toggle all ────────────────────────────────────────────────────
  const toggleAll = useCallback(() => {
    if (selected.size === holidays.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(holidays.map((_, i) => i)))
    }
  }, [selected.size, holidays.length])

  // ── Step 3: Sync selected holidays ────────────────────────────────
  const handleSync = useCallback(async () => {
    if (selected.size === 0) {
      setError('Selecione ao menos um feriado')
      return
    }

    setIsSyncing(true)
    setStep('syncing')
    setError(null)

    try {
      const data = await apiFetch<SyncResponse>(
        `/companies/${companyId}/holidays/sync`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ year: parseInt(year, 10) }),
        },
      )

      toast.success('Feriados sincronizados', {
        description: `${data.created} adicionado(s), ${data.skipped} ja existente(s)`,
      })
      setStep('done')
      onSync()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao sincronizar feriados'
      setError(message)
      setStep('select')
      toast.error('Erro ao sincronizar', { description: message })
    } finally {
      setIsSyncing(false)
    }
  }, [companyId, year, selected, onSync])

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarCheck className="h-5 w-5" />
            Descobrir Feriados
          </DialogTitle>
          <DialogDescription>
            Descubra e importe feriados nacionais e estaduais automaticamente.
          </DialogDescription>
        </DialogHeader>

        {/* ── Error banner ── */}
        {error && (
          <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {/* ── Step: Input year ── */}
        {step === 'input' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="holiday-year">Ano</Label>
              <Input
                id="holiday-year"
                type="text"
                inputMode="numeric"
                maxLength={4}
                placeholder="2026"
                value={year}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, '').slice(0, 4)
                  setYear(v)
                  setError(null)
                }}
              />
              <p className="text-xs text-muted-foreground">
                Os feriados serao descobertos com base no endereco cadastrado da instituicao.
              </p>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                Cancelar
              </Button>
              <Button onClick={handleDiscover} disabled={isDiscovering || year.length !== 4}>
                {isDiscovering ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Search className="mr-2 h-4 w-4" />
                )}
                Descobrir
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* ── Step: Select holidays ── */}
        {step === 'select' && (
          <div className="space-y-4">
            {discoverMeta.stateCode && (
              <p className="text-sm text-muted-foreground">
                Estado detectado: <span className="font-medium">{discoverMeta.stateCode}</span>
                {discoverMeta.postalCode && (
                  <> (CEP: {discoverMeta.postalCode})</>
                )}
              </p>
            )}

            <div className="flex items-center justify-between border-b pb-2">
              <span className="text-sm font-medium">
                {selected.size} de {holidays.length} selecionado(s)
              </span>
              <Button variant="ghost" size="sm" onClick={toggleAll}>
                {selected.size === holidays.length ? 'Desmarcar todos' : 'Selecionar todos'}
              </Button>
            </div>

            <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
              {holidays.map((holiday, idx) => (
                <label
                  key={`${holiday.date}-${holiday.name}`}
                  className="flex cursor-pointer items-center gap-3 rounded-md p-2 transition-colors hover:bg-accent"
                >
                  <Checkbox
                    checked={selected.has(idx)}
                    onCheckedChange={() => toggleHoliday(idx)}
                  />
                  <div className="flex flex-1 items-center justify-between">
                    <div>
                      <span className="text-sm font-medium">{holiday.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {formatDate(holiday.date)}
                      </span>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${getHolidayTypeBadgeClass(holiday.type)}`}
                    >
                      {getHolidayTypeBadge(holiday.type)}
                    </span>
                  </div>
                </label>
              ))}

              {holidays.length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  Nenhum feriado encontrado para o ano {year}.
                </p>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('input')}>
                Voltar
              </Button>
              <Button onClick={handleSync} disabled={selected.size === 0}>
                <CalendarCheck className="mr-2 h-4 w-4" />
                Sincronizar ({selected.size})
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* ── Step: Syncing ── */}
        {step === 'syncing' && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Sincronizando feriados...</p>
          </div>
        )}

        {/* ── Step: Done ── */}
        {step === 'done' && (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-3 py-6">
              <CalendarCheck className="h-10 w-10 text-green-600" />
              <p className="text-sm font-medium text-green-700">
                Feriados sincronizados com sucesso!
              </p>
            </div>
            <DialogFooter>
              <Button onClick={handleClose}>Fechar</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
