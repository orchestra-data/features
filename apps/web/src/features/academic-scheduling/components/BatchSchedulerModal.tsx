import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Calendar, Check, Loader2 } from 'lucide-react';

import { Button } from '@cogedu/ui/components/button';
import { Checkbox } from '@cogedu/ui/components/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@cogedu/ui/components/dialog';
import { Input } from '@cogedu/ui/components/input';
import { Label } from '@cogedu/ui/components/label';
import { ScrollArea } from '@cogedu/ui/components/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@cogedu/ui/components/select';
import { Switch } from '@cogedu/ui/components/switch';

import { apiFetch, apiClient } from '../../../client/apiClient';
import type { RecurrencePattern } from '@cogedu/ava-database-types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SchedulableComponent {
  id: string;
  title: string;
  code?: string;
}

export interface HolidayEntry {
  date: string; // YYYY-MM-DD
  name?: string;
}

export interface ConflictEntry {
  date: string; // YYYY-MM-DD
  reason: string;
}

export interface BatchSchedulerModalProps {
  isOpen: boolean;
  onClose: () => void;
  companyId: string;
  classInstanceId: string;
  onComplete: () => void;
  /** Components available for scheduling. If not provided, fetched from API. */
  components?: SchedulableComponent[];
  /** Known holidays for the company. If not provided, fetched from API. */
  holidays?: HolidayEntry[];
  /** Known conflicts (existing events). If not provided, fetched from API. */
  conflicts?: ConflictEntry[];
}

interface RecurrenceConfig {
  pattern: RecurrencePattern;
  weekdays: number[]; // 0=Sun..6=Sat
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  duration: number; // minutes
  skipHolidays: boolean;
  eventType: string;
  title: string;
}

type Step = 'components' | 'configure' | 'preview' | 'confirm';

const STEPS: Step[] = ['components', 'configure', 'preview', 'confirm'];

const STEP_LABELS: Record<Step, string> = {
  components: 'Componentes',
  configure: 'Recorrencia',
  preview: 'Previa',
  confirm: 'Confirmar',
};

const DURATION_OPTIONS = [
  { value: '30', label: '30 min' },
  { value: '45', label: '45 min' },
  { value: '60', label: '1h' },
  { value: '90', label: '1h30' },
  { value: '120', label: '2h' },
];

const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];

const EVENT_TYPE_OPTIONS = [
  { value: 'aula', label: 'Aula' },
  { value: 'estagio', label: 'Estagio' },
  { value: 'palestra', label: 'Palestra' },
  { value: 'visitacao_tecnica', label: 'Visitacao Tecnica' },
  { value: 'workshop', label: 'Workshop' },
  { value: 'seminario', label: 'Seminario' },
  { value: 'reuniao', label: 'Reuniao' },
  { value: 'avaliacao', label: 'Avaliacao' },
  { value: 'outro', label: 'Outro' },
];

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function formatDateBR(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function isWeekend(d: Date): boolean {
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getISOWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export interface GeneratedDate {
  date: string; // YYYY-MM-DD
  isHoliday: boolean;
  holidayName?: string;
  isConflict: boolean;
  conflictReason?: string;
}

/**
 * Generate recurrence dates client-side for preview.
 * Mirrors the backend logic in createRecurrenceGroup.ts.
 */
export function generateRecurrenceDates(
  config: RecurrenceConfig,
  holidays: HolidayEntry[],
  conflicts: ConflictEntry[]
): GeneratedDate[] {
  const holidayMap = new Map(holidays.map((h) => [h.date, h.name ?? 'Feriado']));
  const conflictMap = new Map(conflicts.map((c) => [c.date, c.reason]));

  const start = new Date(config.startDate + 'T00:00:00Z');
  const end = new Date(config.endDate + 'T00:00:00Z');
  const results: GeneratedDate[] = [];

  if (end < start) return results;

  const startWeek = getISOWeek(start);
  const cursor = new Date(start);

  while (cursor <= end) {
    const dayOfWeek = cursor.getUTCDay();
    const dateStr = toDateStr(cursor);
    const isHol = holidayMap.has(dateStr);
    const isConf = conflictMap.has(dateStr);

    let include = false;

    switch (config.pattern) {
      case 'weekly':
        if (config.weekdays.length > 0) {
          include = config.weekdays.includes(dayOfWeek);
        } else {
          include = !isWeekend(cursor);
        }
        break;

      case 'biweekly': {
        const weekDelta = getISOWeek(cursor) - startWeek;
        const isActiveWeek = weekDelta % 2 === 0;
        if (!isActiveWeek) break;
        if (config.weekdays.length > 0) {
          include = config.weekdays.includes(dayOfWeek);
        } else {
          include = !isWeekend(cursor);
        }
        break;
      }

      case 'custom':
        if (config.weekdays.length > 0) {
          include = config.weekdays.includes(dayOfWeek);
        } else {
          include = !isWeekend(cursor);
        }
        break;

      default:
        include = !isWeekend(cursor);
    }

    if (include) {
      // If skipHolidays, still add to list but mark it
      if (config.skipHolidays && isHol) {
        results.push({
          date: dateStr,
          isHoliday: true,
          holidayName: holidayMap.get(dateStr),
          isConflict: isConf,
          conflictReason: conflictMap.get(dateStr),
        });
      } else {
        results.push({
          date: dateStr,
          isHoliday: isHol,
          holidayName: isHol ? holidayMap.get(dateStr) : undefined,
          isConflict: isConf,
          conflictReason: isConf ? conflictMap.get(dateStr) : undefined,
        });
      }
    }

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return results;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BatchSchedulerModal({
  isOpen,
  onClose,
  companyId,
  classInstanceId,
  onComplete,
  components: propComponents,
  holidays: propHolidays,
  conflicts: propConflicts,
}: BatchSchedulerModalProps) {
  // ---- State ----
  const [step, setStep] = useState<Step>('components');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1 — component selection
  const [components, setComponents] = useState<SchedulableComponent[]>(propComponents ?? []);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [componentsFetched, setComponentsFetched] = useState(!!propComponents);

  // Step 2 — recurrence config
  const [config, setConfig] = useState<RecurrenceConfig>({
    pattern: 'weekly',
    weekdays: [1, 3, 5], // Mon, Wed, Fri default
    startDate: '',
    endDate: '',
    startTime: '08:00',
    duration: 60,
    skipHolidays: true,
    eventType: 'aula',
    title: '',
  });

  // Resources for events
  const [resources, setResources] = useState<Array<{ id: string; name: string; resource_type: string }>>([]);
  const [resourcesFetched, setResourcesFetched] = useState(false);
  const [selectedResourceIds, setSelectedResourceIds] = useState<Set<string>>(new Set());

  // Data for preview
  const [holidays, setHolidays] = useState<HolidayEntry[]>(propHolidays ?? []);
  const [holidaysFetched, setHolidaysFetched] = useState(!!propHolidays);
  const [conflictsData, setConflictsData] = useState<ConflictEntry[]>(propConflicts ?? []);

  // ---- Reset on close/open ----
  useEffect(() => {
    if (isOpen) {
      setStep('components');
      setSelectedIds(new Set());
      setSelectedResourceIds(new Set());
      setError(null);
      setSubmitting(false);
      if (propComponents) setComponents(propComponents);
    }
  }, [isOpen, propComponents]);

  // ---- Fetch components if not provided ----
  useEffect(() => {
    if (!isOpen || componentsFetched || propComponents) return;

    let cancelled = false;
    setLoading(true);

    apiFetch<{ data: Array<{ id: string; title: string; code?: string }> }>(
      `/listComponents${classInstanceId ? `?classInstanceId=${classInstanceId}` : ''}`
    )
      .then((res) => {
        if (cancelled) return;
        setComponents(
          res.data.map((c) => ({ id: c.id, title: c.title, code: c.code }))
        );
        setComponentsFetched(true);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(`Erro ao carregar componentes: ${err.message}`);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, componentsFetched, companyId, classInstanceId, propComponents]);

  // ---- Fetch holidays if not provided ----
  useEffect(() => {
    if (!isOpen || holidaysFetched || propHolidays) return;

    let cancelled = false;

    apiFetch<{ blockedDays: Array<{ blockedDate: string; reason?: string }> }>(
      `/getCompanyBlockedDays?companyId=${companyId}`
    )
      .then((res) => {
        if (cancelled) return;
        setHolidays(
          (res.blockedDays ?? []).map((h) => ({
            date: String(h.blockedDate).slice(0, 10),
            name: h.reason,
          }))
        );
        setHolidaysFetched(true);
      })
      .catch(() => {
        // Non-critical: proceed without holidays
        if (!cancelled) setHolidaysFetched(true);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, holidaysFetched, companyId, propHolidays]);

  // ---- Fetch resources ----
  useEffect(() => {
    if (!isOpen || resourcesFetched) return;

    let cancelled = false;

    apiClient.listCompanyResources(companyId, { status: 'available', limit: 100 })
      .then((res: any) => {
        if (cancelled) return;
        setResources(
          (res?.data ?? []).map((r: any) => ({
            id: r.id,
            name: r.name,
            resource_type: r.resource_type,
          }))
        );
        setResourcesFetched(true);
      })
      .catch(() => {
        if (!cancelled) setResourcesFetched(true);
      });

    return () => { cancelled = true; };
  }, [isOpen, resourcesFetched, companyId]);

  // ---- Toggle resource selection ----
  const toggleResource = useCallback((id: string) => {
    setSelectedResourceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // ---- Toggle component selection ----
  const toggleComponent = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedIds((prev) =>
      prev.size === components.length ? new Set() : new Set(components.map((c) => c.id))
    );
  }, [components]);

  // ---- Toggle weekday ----
  const toggleWeekday = useCallback((day: number) => {
    setConfig((prev) => {
      const next = prev.weekdays.includes(day)
        ? prev.weekdays.filter((d) => d !== day)
        : [...prev.weekdays, day].sort();
      return { ...prev, weekdays: next };
    });
  }, []);

  // ---- Generated dates ----
  const generatedDates = useMemo(() => {
    if (!config.startDate || !config.endDate) return [];
    return generateRecurrenceDates(config, holidays, conflictsData);
  }, [config, holidays, conflictsData]);

  const activeDates = useMemo(
    () =>
      generatedDates.filter(
        (d) => !(config.skipHolidays && d.isHoliday)
      ),
    [generatedDates, config.skipHolidays]
  );

  const holidayDates = useMemo(
    () => generatedDates.filter((d) => d.isHoliday),
    [generatedDates]
  );

  const conflictDates = useMemo(
    () => generatedDates.filter((d) => d.isConflict && !(config.skipHolidays && d.isHoliday)),
    [generatedDates, config.skipHolidays]
  );

  // ---- Validation per step ----
  const canAdvance = useMemo(() => {
    switch (step) {
      case 'components':
        return selectedIds.size > 0;
      case 'configure':
        return (
          config.startDate !== '' &&
          config.endDate !== '' &&
          config.startDate <= config.endDate &&
          (config.pattern !== 'custom' || config.weekdays.length > 0)
        );
      case 'preview':
        return activeDates.length > 0;
      case 'confirm':
        return true;
      default:
        return false;
    }
  }, [step, selectedIds.size, config, activeDates.length]);

  // ---- Navigation ----
  const currentIdx = STEPS.indexOf(step);

  const goNext = useCallback(() => {
    const next = STEPS[currentIdx + 1];
    if (next) setStep(next);
  }, [currentIdx]);

  const goBack = useCallback(() => {
    const prev = STEPS[currentIdx - 1];
    if (prev) setStep(prev);
  }, [currentIdx]);

  // ---- Submit ----
  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    setError(null);

    try {
      await apiFetch(`/companies/${companyId}/recurrence-groups`, {
        method: 'POST',
        body: JSON.stringify({
          classInstanceId,
          pattern: config.pattern,
          customDays: config.weekdays.length > 0 ? config.weekdays : null,
          startDate: config.startDate,
          endDate: config.endDate,
          startTime: config.startTime,
          duration: config.duration,
          componentIds: Array.from(selectedIds),
          resourceIds: Array.from(selectedResourceIds),
          eventType: config.eventType,
          title: config.title || undefined,
          timezone: 'America/Sao_Paulo',
        }),
      });

      onComplete();
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }, [companyId, classInstanceId, config, selectedIds, onComplete, onClose]);

  // ---- Render helpers ----
  const endTime = addMinutes(config.startTime, config.duration);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Agendamento em Lote</DialogTitle>
          <DialogDescription>
            Agende componentes curriculares com recorrencia automatica.
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <nav className="flex items-center gap-2 pb-4 border-b border-border">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              {i > 0 && <div className="h-px w-4 bg-muted-foreground/30" />}
              <button
                type="button"
                onClick={() => i < currentIdx && setStep(s)}
                disabled={i > currentIdx}
                className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${
                  s === step
                    ? 'text-primary'
                    : i < currentIdx
                      ? 'text-muted-foreground hover:text-foreground cursor-pointer'
                      : 'text-muted-foreground/50 cursor-not-allowed'
                }`}
              >
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                    s === step
                      ? 'bg-primary text-primary-foreground'
                      : i < currentIdx
                        ? 'bg-primary/20 text-primary'
                        : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {i < currentIdx ? <Check className="h-3 w-3" /> : i + 1}
                </span>
                <span className="hidden sm:inline">{STEP_LABELS[s]}</span>
              </button>
            </div>
          ))}
        </nav>

        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Step content */}
        <div className="flex-1 overflow-hidden">
          {/* STEP 1: Components */}
          {step === 'components' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">
                  Selecione os componentes ({selectedIds.size}/{components.length})
                </Label>
                <button
                  type="button"
                  onClick={toggleAll}
                  className="text-xs text-primary hover:underline"
                >
                  {selectedIds.size === components.length ? 'Desmarcar todos' : 'Selecionar todos'}
                </button>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : components.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Nenhum componente encontrado para esta turma.
                </p>
              ) : (
                <ScrollArea className="h-64">
                  <div className="space-y-1 pr-3">
                    {components.map((comp) => (
                      <label
                        key={comp.id}
                        className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-accent/50 cursor-pointer transition-colors"
                      >
                        <Checkbox
                          checked={selectedIds.has(comp.id)}
                          onCheckedChange={() => toggleComponent(comp.id)}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{comp.title}</p>
                          {comp.code && (
                            <p className="text-xs text-muted-foreground">{comp.code}</p>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          )}

          {/* STEP 2: Configure recurrence */}
          {step === 'configure' && (
            <div className="space-y-4">
              {/* Pattern */}
              <div className="space-y-1.5">
                <Label htmlFor="pattern">Tipo de recorrencia</Label>
                <Select
                  value={config.pattern}
                  onValueChange={(v) =>
                    setConfig((prev) => ({ ...prev, pattern: v as RecurrencePattern }))
                  }
                >
                  <SelectTrigger id="pattern">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Semanal</SelectItem>
                    <SelectItem value="biweekly">Quinzenal</SelectItem>
                    <SelectItem value="custom">Personalizado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Weekday selector */}
              <div className="space-y-1.5">
                <Label>Dias da semana</Label>
                <div className="flex gap-1">
                  {WEEKDAY_LABELS.map((label, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => toggleWeekday(idx)}
                      className={`flex h-9 w-9 items-center justify-center rounded-md text-xs font-medium transition-colors ${
                        config.weekdays.includes(idx)
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground hover:bg-muted/80'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Date range */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="startDate">Data inicio</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={config.startDate}
                    onChange={(e) =>
                      setConfig((prev) => ({ ...prev, startDate: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="endDate">Data fim</Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={config.endDate}
                    min={config.startDate}
                    onChange={(e) =>
                      setConfig((prev) => ({ ...prev, endDate: e.target.value }))
                    }
                  />
                </div>
              </div>

              {/* Time and duration */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="startTime">Horario inicio</Label>
                  <Input
                    id="startTime"
                    type="time"
                    value={config.startTime}
                    onChange={(e) =>
                      setConfig((prev) => ({ ...prev, startTime: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="duration">Duracao</Label>
                  <Select
                    value={String(config.duration)}
                    onValueChange={(v) =>
                      setConfig((prev) => ({ ...prev, duration: Number(v) }))
                    }
                  >
                    <SelectTrigger id="duration">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DURATION_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Event type */}
              <div className="space-y-1.5">
                <Label htmlFor="eventType">Tipo de evento</Label>
                <Select
                  value={config.eventType}
                  onValueChange={(v) =>
                    setConfig((prev) => ({ ...prev, eventType: v }))
                  }
                >
                  <SelectTrigger id="eventType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EVENT_TYPE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Title */}
              <div className="space-y-1.5">
                <Label htmlFor="eventTitle">Titulo (opcional)</Label>
                <Input
                  id="eventTitle"
                  placeholder="Ex: Aula de Matematica"
                  value={config.title}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, title: e.target.value }))
                  }
                />
              </div>

              {/* Skip holidays toggle */}
              <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                <div>
                  <Label className="text-sm">Pular feriados</Label>
                  <p className="text-xs text-muted-foreground">
                    Dias bloqueados nao terao eventos criados
                  </p>
                </div>
                <Switch
                  checked={config.skipHolidays}
                  onCheckedChange={(checked) =>
                    setConfig((prev) => ({ ...prev, skipHolidays: !!checked }))
                  }
                />
              </div>

              {/* Resource selection */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">
                  Recurso / Local ({selectedResourceIds.size} selecionado{selectedResourceIds.size !== 1 ? 's' : ''})
                </Label>
                {resources.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-1">
                    Nenhum recurso cadastrado para esta instituicao.
                  </p>
                ) : (
                  <ScrollArea className="h-32 rounded-md border border-border">
                    <div className="space-y-0.5 p-2">
                      {resources.map((r) => (
                        <label
                          key={r.id}
                          className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-accent/50 cursor-pointer transition-colors"
                        >
                          <Checkbox
                            checked={selectedResourceIds.has(r.id)}
                            onCheckedChange={() => toggleResource(r.id)}
                          />
                          <span className="text-sm">{r.name}</span>
                          <span className="text-xs text-muted-foreground">({r.resource_type})</span>
                        </label>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </div>
            </div>
          )}

          {/* STEP 3: Preview */}
          {step === 'preview' && (
            <div className="space-y-3">
              {/* Summary bar */}
              <div className="flex items-center gap-4 rounded-md bg-muted/50 px-3 py-2 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">
                  {activeDates.length} eventos serao criados
                </span>
                {holidayDates.length > 0 && config.skipHolidays && (
                  <span className="text-muted-foreground">
                    ({holidayDates.length} feriados pulados)
                  </span>
                )}
                {conflictDates.length > 0 && (
                  <span className="text-amber-600">
                    ({conflictDates.length} conflitos)
                  </span>
                )}
              </div>

              {/* Time info */}
              <p className="text-xs text-muted-foreground">
                {config.startTime} - {endTime} ({config.duration} min) &middot;{' '}
                {selectedIds.size} componente{selectedIds.size !== 1 ? 's' : ''} &middot;{' '}
                Distribuicao: 1 componente por dia (sequencial)
                {selectedResourceIds.size > 0 && (
                  <> &middot; {selectedResourceIds.size} recurso{selectedResourceIds.size !== 1 ? 's' : ''}</>
                )}
              </p>

              {/* Date list */}
              <ScrollArea className="h-56">
                <div className="space-y-0.5 pr-3">
                  {generatedDates.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      Nenhuma data gerada. Verifique o intervalo e os dias selecionados.
                    </p>
                  ) : (
                    generatedDates.map((gd) => {
                      const isSkipped = config.skipHolidays && gd.isHoliday;
                      return (
                        <div
                          key={gd.date}
                          className={`flex items-center gap-2 rounded px-2 py-1 text-sm ${
                            isSkipped
                              ? 'text-destructive line-through opacity-60'
                              : gd.isConflict
                                ? 'text-amber-600 bg-amber-500/10'
                                : 'text-foreground'
                          }`}
                        >
                          {gd.isConflict && !isSkipped && (
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                          )}
                          <span className="font-mono">{formatDateBR(gd.date)}</span>
                          <span className="text-xs text-muted-foreground">
                            {WEEKDAY_LABELS[new Date(gd.date + 'T12:00:00Z').getUTCDay()]}
                          </span>
                          {gd.isHoliday && (
                            <span className="text-xs">
                              {gd.holidayName ?? 'Feriado'}
                            </span>
                          )}
                          {gd.isConflict && !isSkipped && (
                            <span className="text-xs">
                              {gd.conflictReason ?? 'Conflito'}
                            </span>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* STEP 4: Confirm */}
          {step === 'confirm' && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Resumo do agendamento</h3>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Componentes</span>
                  <span className="font-medium">{selectedIds.size}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Recorrencia</span>
                  <span className="font-medium">
                    {config.pattern === 'weekly'
                      ? 'Semanal'
                      : config.pattern === 'biweekly'
                        ? 'Quinzenal'
                        : 'Personalizado'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Dias</span>
                  <span className="font-medium">
                    {config.weekdays.map((d) => WEEKDAY_LABELS[d]).join(', ') || 'Dias uteis'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Periodo</span>
                  <span className="font-medium">
                    {formatDateBR(config.startDate)} - {formatDateBR(config.endDate)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Horario</span>
                  <span className="font-medium">
                    {config.startTime} - {endTime}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tipo</span>
                  <span className="font-medium">
                    {EVENT_TYPE_OPTIONS.find((o) => o.value === config.eventType)?.label ?? config.eventType}
                  </span>
                </div>
                {config.title && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Titulo</span>
                    <span className="font-medium">{config.title}</span>
                  </div>
                )}

                <div className="my-2 h-px bg-border" />

                <div className="flex justify-between">
                  <span className="text-muted-foreground">Datas</span>
                  <span className="font-medium">{activeDates.length}</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>Total de eventos</span>
                  <span>{Math.min(activeDates.length, activeDates.length)}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  1 componente por dia, distribuidos sequencialmente
                </p>
              </div>

              {conflictDates.length > 0 && (
                <div className="flex items-center gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-600">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {conflictDates.length} data{conflictDates.length !== 1 ? 's' : ''} com
                  conflitos serao criadas mesmo assim.
                </div>
              )}

              {/* Components list */}
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Componentes selecionados:</p>
                <div className="flex flex-wrap gap-1">
                  {components
                    .filter((c) => selectedIds.has(c.id))
                    .map((c) => (
                      <span
                        key={c.id}
                        className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                      >
                        {c.title}
                      </span>
                    ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="gap-2 pt-4 border-t border-border">
          {currentIdx > 0 && (
            <Button variant="outline" onClick={goBack} disabled={submitting}>
              Voltar
            </Button>
          )}
          <div className="flex-1" />
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>

          {step === 'confirm' ? (
            <Button onClick={handleSubmit} disabled={submitting || !canAdvance}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Criando...
                </>
              ) : (
                'Confirmar'
              )}
            </Button>
          ) : (
            <Button onClick={goNext} disabled={!canAdvance}>
              Proximo
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
