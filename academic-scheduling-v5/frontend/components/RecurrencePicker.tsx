'use client'

/**
 * RecurrencePicker — Google Calendar-style recurrence UI
 * SCHED-020: Inline recurrence configuration for EventModal
 *
 * Patterns: none | daily | weekly | monthly | yearly | custom
 * End: never | after N | on date
 * Weekday checkboxes, skip holidays, skip weekends
 */

import { useCallback, useMemo } from 'react'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Input,
  Label,
  Switch,
  Badge,
} from '@cogedu/ui'
import { Repeat, CalendarDays } from 'lucide-react'

// ============================================================================
// TYPES
// ============================================================================

export type RecurrenceFreq = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom'
export type RecurrenceEndType = 'never' | 'count' | 'until'

export interface RecurrenceConfig {
  freq: RecurrenceFreq
  interval: number
  weekdays: number[] // 0=Sun..6=Sat
  endType: RecurrenceEndType
  endCount: number
  endDate: string // YYYY-MM-DD
  skipHolidays: boolean
  skipWeekends: boolean
}

export const DEFAULT_RECURRENCE: RecurrenceConfig = {
  freq: 'none',
  interval: 1,
  weekdays: [],
  endType: 'never',
  endCount: 10,
  endDate: '',
  skipHolidays: true,
  skipWeekends: true,
}

interface RecurrencePickerProps {
  value: RecurrenceConfig
  onChange: (config: RecurrenceConfig) => void
  startDate?: string // YYYY-MM-DD — for preview text
}

// ============================================================================
// CONSTANTS
// ============================================================================

const FREQ_OPTIONS: Array<{ value: RecurrenceFreq; label: string }> = [
  { value: 'none', label: 'Nao repete' },
  { value: 'daily', label: 'Diariamente' },
  { value: 'weekly', label: 'Semanalmente' },
  { value: 'monthly', label: 'Mensalmente' },
  { value: 'yearly', label: 'Anualmente' },
  { value: 'custom', label: 'Personalizado...' },
]

const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab']

// ============================================================================
// HELPERS
// ============================================================================

function buildPreviewText(config: RecurrenceConfig, startDate?: string): string {
  if (config.freq === 'none') return ''

  const parts: string[] = []
  const interval = config.interval > 1 ? `a cada ${config.interval} ` : ''

  switch (config.freq) {
    case 'daily':
      parts.push(interval ? `${interval}dias` : 'Todo dia')
      break
    case 'weekly':
      if (config.weekdays.length > 0) {
        const days = config.weekdays.map((d) => WEEKDAY_LABELS[d]).join(', ')
        parts.push(interval ? `${interval}semanas em ${days}` : `${days}`)
      } else {
        parts.push(interval ? `${interval}semanas` : 'Toda semana')
      }
      break
    case 'monthly':
      if (startDate) {
        const day = parseInt(startDate.split('-')[2], 10)
        parts.push(interval ? `${interval}meses no dia ${day}` : `Todo mes no dia ${day}`)
      } else {
        parts.push(interval ? `${interval}meses` : 'Todo mes')
      }
      break
    case 'yearly':
      parts.push(interval ? `${interval}anos` : 'Todo ano')
      break
    case 'custom':
      if (config.weekdays.length > 0) {
        const days = config.weekdays.map((d) => WEEKDAY_LABELS[d]).join(', ')
        parts.push(`${interval || 'Toda '}semana em ${days}`)
      } else {
        parts.push('Personalizado')
      }
      break
  }

  switch (config.endType) {
    case 'count':
      parts.push(`(${config.endCount} vezes)`)
      break
    case 'until':
      if (config.endDate) {
        const [y, m, d] = config.endDate.split('-')
        parts.push(`ate ${d}/${m}/${y}`)
      }
      break
  }

  if (config.skipHolidays) parts.push('pulando feriados')

  return parts.join(' ')
}

// ============================================================================
// COMPONENT
// ============================================================================

export function RecurrencePicker({ value, onChange, startDate }: RecurrencePickerProps) {
  const update = useCallback(
    (patch: Partial<RecurrenceConfig>) => onChange({ ...value, ...patch }),
    [value, onChange],
  )

  const toggleWeekday = useCallback(
    (day: number) => {
      const next = value.weekdays.includes(day)
        ? value.weekdays.filter((d) => d !== day)
        : [...value.weekdays, day].sort()
      update({ weekdays: next })
    },
    [value.weekdays, update],
  )

  const preview = useMemo(() => buildPreviewText(value, startDate), [value, startDate])

  const showWeekdays = value.freq === 'weekly' || value.freq === 'custom'
  const showInterval = value.freq === 'custom'
  const showEnd = value.freq !== 'none'

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Repeat className="h-4 w-4" />
        Recorrencia
      </div>

      {/* Frequency */}
      <Select value={value.freq} onValueChange={(v) => update({ freq: v as RecurrenceFreq })}>
        <SelectTrigger>
          <SelectValue placeholder="Selecione..." />
        </SelectTrigger>
        <SelectContent>
          {FREQ_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {value.freq !== 'none' && (
        <div className="space-y-3 animate-in fade-in duration-200">
          {/* Interval (custom only) */}
          {showInterval && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Repetir a cada</Label>
                <Input
                  type="number"
                  min={1}
                  max={52}
                  value={value.interval}
                  onChange={(e) => update({ interval: Math.max(1, Number(e.target.value) || 1) })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Unidade</Label>
                <Select value={value.freq} disabled>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="custom">Semana(s)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Weekday selector */}
          {showWeekdays && (
            <div className="space-y-1">
              <Label className="text-xs">Dias da semana</Label>
              <div className="flex gap-1">
                {WEEKDAY_LABELS.map((label, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => toggleWeekday(idx)}
                    className={`flex h-8 w-8 items-center justify-center rounded-md text-xs font-medium transition-colors ${
                      value.weekdays.includes(idx)
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* End condition */}
          {showEnd && (
            <div className="space-y-2">
              <Label className="text-xs">Terminar</Label>
              <div className="grid grid-cols-3 gap-2">
                {(['never', 'count', 'until'] as RecurrenceEndType[]).map((et) => (
                  <button
                    key={et}
                    type="button"
                    onClick={() => update({ endType: et })}
                    className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                      value.endType === et
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border text-muted-foreground hover:bg-accent/30'
                    }`}
                  >
                    {et === 'never' ? 'Nunca' : et === 'count' ? 'Apos N' : 'Em data'}
                  </button>
                ))}
              </div>

              {value.endType === 'count' && (
                <div className="flex items-center gap-2">
                  <Label className="text-xs whitespace-nowrap">Apos</Label>
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    value={value.endCount}
                    onChange={(e) => update({ endCount: Math.max(1, Number(e.target.value) || 1) })}
                    className="w-20"
                  />
                  <span className="text-xs text-muted-foreground">ocorrencias</span>
                </div>
              )}

              {value.endType === 'until' && (
                <Input
                  type="date"
                  value={value.endDate}
                  onChange={(e) => update({ endDate: e.target.value })}
                />
              )}
            </div>
          )}

          {/* Skip toggles */}
          <div className="flex gap-4">
            <div className="flex items-center gap-2">
              <Switch
                checked={value.skipHolidays}
                onCheckedChange={(v) => update({ skipHolidays: !!v })}
              />
              <Label className="text-xs cursor-pointer">Pular feriados</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={value.skipWeekends}
                onCheckedChange={(v) => update({ skipWeekends: !!v })}
              />
              <Label className="text-xs cursor-pointer">Pular fins de semana</Label>
            </div>
          </div>

          {/* Preview text */}
          {preview && (
            <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2">
              <CalendarDays className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground">{preview}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Convert RecurrenceConfig to the backend RecurrenceRule format
 */
export function toRecurrenceRule(config: RecurrenceConfig): {
  is_recurring: boolean
  recurrence_rule: { freq: string; interval?: number; until?: string; count?: number; byday?: string[] } | null
} {
  if (config.freq === 'none') {
    return { is_recurring: false, recurrence_rule: null }
  }

  const dayMap = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
  const freqMap: Record<string, string> = {
    daily: 'DAILY',
    weekly: 'WEEKLY',
    monthly: 'MONTHLY',
    yearly: 'YEARLY',
    custom: 'WEEKLY',
  }

  const rule: any = {
    freq: freqMap[config.freq] ?? 'WEEKLY',
  }

  if (config.interval > 1) rule.interval = config.interval
  if (config.weekdays.length > 0) rule.byday = config.weekdays.map((d) => dayMap[d])
  if (config.endType === 'count') rule.count = config.endCount
  if (config.endType === 'until' && config.endDate) rule.until = config.endDate

  return { is_recurring: true, recurrence_rule: rule }
}
