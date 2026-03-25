'use client'

/**
 * EventModal — SCHED-011
 * Modal for creating/editing calendar events.
 * - Create mode: pick a component from the hierarchy, show type-specific params
 * - Edit mode: fetch event + linked component, show params pre-filled
 *
 * Uses @cogedu/ui components and apiFetch (ZERO axios).
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
  Button,
  Input,
  Label,
  Badge,
  Skeleton,
  Switch,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Separator,
} from '@cogedu/ui'
import { Loader2, ChevronDown, ChevronRight, MapPin, Video, ClipboardCheck, BookOpen, CalendarDays, GraduationCap } from 'lucide-react'
import { toast } from 'sonner'
import { useQuery } from '@tanstack/react-query'
import { apiClient, apiFetch } from '@/client/apiClient'
import { useClassInstances } from '../hooks/useHierarchyData'
import { RecurrencePicker, DEFAULT_RECURRENCE, toRecurrenceRule } from './RecurrencePicker'
import { HolidayNegotiationModal } from './HolidayNegotiationModal'
import type { RecurrenceConfig } from './RecurrencePicker'
import type { NegotiationResult } from './HolidayNegotiationModal'
import type { EventType } from '@cogedu/ava-database-types'

// ============================================================================
// TYPES
// ============================================================================

interface EventModalProps {
  isOpen: boolean
  onClose: () => void
  companyId: string
  editingEventId?: string | null
  classInstanceId?: string
  onSave: () => void
  dayEvents?: Array<{ id: string; title: string; start: string; end: string; event_type: string }>
  selectedDate?: Date | null
  holidayMap?: Map<string, string>
}

interface ComponentItem {
  id: string
  title: string
  componentType: string
  subtype: string | null
  estimatedDurationMinutes: number | null
  unitTitle: string | null
  scheduledDate: string | null
  eventId: string | null
}

interface UnitGroup {
  unitId: string
  unitTitle: string
  components: ComponentItem[]
}

interface CompanyResource {
  id: string
  name: string
  code: string | null
  resource_type: string
  capacity: number | null
  full_location: string | null
  status: string
}

// ============================================================================
// CONSTANTS
// ============================================================================

const COMPONENT_TYPE_TO_EVENT_TYPE: Record<string, EventType> = {
  live_session: 'aula',
  presencial_activity: 'aula',
  hybrid_activity: 'aula',
  quiz: 'avaliacao',
  assignment: 'avaliacao',
  video: 'aula',
  discussion: 'seminario',
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  aula: 'Aula',
  avaliacao: 'Avaliacao',
  reuniao: 'Reuniao',
  estagio: 'Estagio',
  palestra: 'Palestra',
  visitacao_tecnica: 'Visitacao Tecnica',
  workshop: 'Workshop',
  seminario: 'Seminario',
  outro: 'Outro',
}

const COMPONENT_TYPE_LABELS: Record<string, string> = {
  live_session: 'Aula ao Vivo',
  presencial_activity: 'Atividade Presencial',
  hybrid_activity: 'Atividade Hibrida',
  quiz: 'Quiz / Prova',
  assignment: 'Trabalho / Entrega',
  video: 'Video',
  text: 'Texto',
  file: 'Arquivo',
  link: 'Link',
  interactive: 'Interativo',
  discussion: 'Discussao',
  ai_qa: 'IA Q&A',
  online_activity: 'Atividade Online',
}

const RESOURCE_TYPE_LABELS: Record<string, string> = {
  sala: 'Sala',
  laboratorio: 'Laboratorio',
  auditorio: 'Auditorio',
  equipamento: 'Equipamento',
  veiculo: 'Veiculo',
  virtual: 'Virtual',
  outro: 'Outro',
}

const COMPLETION_METHOD_LABELS: Record<string, string> = {
  upload_relatorio: 'Upload de Relatorio',
  comprovacao_presenca: 'Comprovacao de Presenca',
  ava_upload: 'Upload via AVA',
  indicacao_aluno: 'Indicacao do Aluno',
}

const CONFERENCE_PROVIDER_LABELS: Record<string, string> = {
  zoom: 'Zoom',
  teams: 'Microsoft Teams',
  meet: 'Google Meet',
  nativa: 'Plataforma Nativa',
}

const ASSESSMENT_MODE_LABELS: Record<string, string> = {
  presencial: 'Presencial',
  online: 'Online',
}

const GRADING_SYSTEM_LABELS: Record<string, string> = {
  conceito_abcde: 'Conceito (A-E)',
  notas_0_10: 'Notas (0-10)',
  rubricas: 'Rubricas',
}

// ============================================================================
// HELPERS
// ============================================================================

function buildIso(date: string, time: string): string {
  return `${date}T${time || '00:00'}:00`
}

function formatTime(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function formatDate(iso: string): string {
  if (!iso) return ''
  return iso.slice(0, 10)
}

function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = h * 60 + m + minutes
  const hh = Math.floor(total / 60) % 24
  const mm = total % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

// Safe accessor for nested JSONB
function dig(obj: any, ...keys: string[]): any {
  let cur = obj
  for (const k of keys) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = cur[k]
  }
  return cur
}

// ============================================================================
// HOOK: fetch components for a company (grouped by unit)
// ============================================================================

function useCompanyComponents(companyId: string, enabled: boolean, classInstanceId?: string) {
  const query = useQuery({
    queryKey: ['scheduling-components', companyId, classInstanceId ?? 'all'],
    queryFn: async () => {
      const params: any = { companyId, limit: 100 }
      if (classInstanceId) params.classInstanceId = classInstanceId
      const res = await apiClient.listComponents(params)
      return res
    },
    enabled: !!companyId && enabled,
    staleTime: 2 * 60_000,
  })

  const grouped = useMemo(() => {
    const items = (query.data as any)?.data ?? query.data ?? []
    if (!Array.isArray(items)) return []

    const unitMap = new Map<string, UnitGroup>()
    for (const c of items) {
      const unitId = c.unitId ?? c.unit_id ?? 'unknown'
      const unitTitle = c.unitTitle ?? c.unit_title ?? c.unitName ?? c.unit_name ?? 'Sem modulo'
      if (!unitMap.has(unitId)) {
        unitMap.set(unitId, { unitId, unitTitle, components: [] })
      }
      unitMap.get(unitId)!.components.push({
        id: c.id,
        title: c.title,
        componentType: c.componentType ?? c.component_type ?? '',
        subtype: c.subtype ?? null,
        estimatedDurationMinutes: c.estimatedDurationMinutes ?? c.estimated_duration_minutes ?? null,
        unitTitle: unitTitle,
        scheduledDate: c.scheduledDate ?? c.scheduled_date ?? null,
        eventId: c.eventId ?? c.event_id ?? null,
      })
    }

    return Array.from(unitMap.values())
  }, [query.data])

  return {
    unitGroups: grouped,
    allComponents: grouped.flatMap((g) => g.components),
    isLoading: query.isLoading,
    error: query.error,
  }
}

// ============================================================================
// HOOK: fetch single event by ID
// ============================================================================

function useEventDetails(companyId: string, eventId: string | null | undefined) {
  return useQuery({
    queryKey: ['company-event', companyId, eventId],
    queryFn: () =>
      apiFetch<any>(`/companies/${companyId}/events/${eventId}`),
    enabled: !!companyId && !!eventId,
    staleTime: 30_000,
  })
}

// ============================================================================
// HOOK: fetch full component details (content_data etc.)
// ============================================================================

function useComponentDetails(componentId: string | null | undefined) {
  return useQuery({
    queryKey: ['component-detail', componentId],
    queryFn: () => apiClient.getComponent(componentId!),
    enabled: !!componentId,
    staleTime: 60_000,
  })
}

// ============================================================================
// HOOK: fetch company resources (rooms, labs, etc.)
// ============================================================================

function useCompanyResources(companyId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['company-resources', companyId],
    queryFn: async () => {
      const res = await apiClient.listCompanyResources(companyId, { status: 'available', limit: 100 })
      return (res?.data ?? []) as CompanyResource[]
    },
    enabled: !!companyId && enabled,
    staleTime: 5 * 60_000,
  })
}

// ============================================================================
// EDITABLE PARAMETER PANELS — type-specific forms
// ============================================================================

interface ParamsPanelProps {
  comp: any
  params: Record<string, any>
  onChange: (key: string, value: any) => void
  companyId: string
}

function LiveSessionParams({ params, onChange }: ParamsPanelProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Video className="h-4 w-4" />
        Configuracao da Sessao ao Vivo
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Provedor</Label>
          <Select value={params.conferenceProvider ?? ''} onValueChange={(v) => onChange('conferenceProvider', v)}>
            <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
            <SelectContent>
              {Object.entries(CONFERENCE_PROVIDER_LABELS).map(([val, lab]) => (
                <SelectItem key={val} value={val}>{lab}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Capacidade</Label>
          <Input
            type="number"
            min={1}
            placeholder="Ex: 30"
            value={params.conferenceCapacity ?? ''}
            onChange={(e) => onChange('conferenceCapacity', e.target.value ? Number(e.target.value) : null)}
          />
        </div>
        <div className="space-y-1 col-span-2">
          <Label className="text-xs">Link da Conferencia</Label>
          <Input
            type="url"
            placeholder="https://zoom.us/j/..."
            value={params.conferenceLink ?? ''}
            onChange={(e) => onChange('conferenceLink', e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Meeting ID</Label>
          <Input
            placeholder="Ex: 123-456-789"
            value={params.conferenceMeetingId ?? ''}
            onChange={(e) => onChange('conferenceMeetingId', e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Senha</Label>
          <Input
            placeholder="Senha de acesso"
            value={params.conferencePasscode ?? ''}
            onChange={(e) => onChange('conferencePasscode', e.target.value)}
          />
        </div>
      </div>
      <div className="flex gap-6 pt-1">
        <div className="flex items-center gap-2">
          <Switch
            checked={params.conferenceRecording ?? false}
            onCheckedChange={(v) => onChange('conferenceRecording', v)}
          />
          <Label className="text-xs cursor-pointer">Gravacao</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={params.conferenceWhiteboard ?? false}
            onCheckedChange={(v) => onChange('conferenceWhiteboard', v)}
          />
          <Label className="text-xs cursor-pointer">Quadro Branco</Label>
        </div>
      </div>
    </div>
  )
}

function PresencialParams({ params, onChange, companyId }: ParamsPanelProps) {
  const { data: resources = [] } = useCompanyResources(companyId, true)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <MapPin className="h-4 w-4" />
        Configuracao Presencial
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1 col-span-2">
          <Label className="text-xs">Local / Sala</Label>
          <Select value={params.presencialResourceId ?? ''} onValueChange={(v) => onChange('presencialResourceId', v)}>
            <SelectTrigger><SelectValue placeholder="Selecione o local..." /></SelectTrigger>
            <SelectContent>
              {resources.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  <span className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {RESOURCE_TYPE_LABELS[r.resource_type] ?? r.resource_type}
                    </Badge>
                    {r.name}
                    {r.full_location && <span className="text-muted-foreground">— {r.full_location}</span>}
                    {r.capacity && <span className="text-muted-foreground">({r.capacity} lugares)</span>}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Metodo de Conclusao</Label>
          <Select value={params.completionMethod ?? ''} onValueChange={(v) => onChange('completionMethod', v)}>
            <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
            <SelectContent>
              {Object.entries(COMPLETION_METHOD_LABELS).map(([val, lab]) => (
                <SelectItem key={val} value={val}>{lab}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Topico</Label>
          <Input
            placeholder="Tema da atividade"
            value={params.presencialTopic ?? ''}
            onChange={(e) => onChange('presencialTopic', e.target.value)}
          />
        </div>
      </div>
      <div className="flex items-center gap-2 pt-1">
        <Switch
          checked={params.requiresAttendanceProof ?? false}
          onCheckedChange={(v) => onChange('requiresAttendanceProof', v)}
        />
        <Label className="text-xs cursor-pointer">Presenca Obrigatoria</Label>
      </div>
    </div>
  )
}

function AssessmentParams({ params, onChange }: ParamsPanelProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <ClipboardCheck className="h-4 w-4" />
        Configuracao da Avaliacao
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Modalidade</Label>
          <Select value={params.assessmentMode ?? ''} onValueChange={(v) => onChange('assessmentMode', v)}>
            <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
            <SelectContent>
              {Object.entries(ASSESSMENT_MODE_LABELS).map(([val, lab]) => (
                <SelectItem key={val} value={val}>{lab}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Formato</Label>
          <Select value={params.assessmentFormat ?? ''} onValueChange={(v) => onChange('assessmentFormat', v)}>
            <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="dissertativas">Dissertativas</SelectItem>
              <SelectItem value="oral">Oral</SelectItem>
              <SelectItem value="multipla_escolha">Multipla Escolha</SelectItem>
              <SelectItem value="mista">Mista</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Tempo Limite (min)</Label>
          <Input
            type="number"
            min={0}
            placeholder="Ex: 60"
            value={params.timeLimitMinutes ?? ''}
            onChange={(e) => onChange('timeLimitMinutes', e.target.value ? Number(e.target.value) : null)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Tentativas</Label>
          <Input
            type="number"
            min={1}
            max={100}
            placeholder="Ex: 3"
            value={params.maxAttempts ?? ''}
            onChange={(e) => onChange('maxAttempts', e.target.value ? Number(e.target.value) : null)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Peso (0-10)</Label>
          <Input
            type="number"
            min={0}
            max={10}
            step={0.5}
            placeholder="Ex: 5"
            value={params.assessmentWeight ?? ''}
            onChange={(e) => onChange('assessmentWeight', e.target.value ? Number(e.target.value) : null)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Sistema de Notas</Label>
          <Select value={params.gradingSystem ?? ''} onValueChange={(v) => onChange('gradingSystem', v)}>
            <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
            <SelectContent>
              {Object.entries(GRADING_SYSTEM_LABELS).map(([val, lab]) => (
                <SelectItem key={val} value={val}>{lab}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex gap-6 pt-1">
        <div className="flex items-center gap-2">
          <Switch
            checked={params.proctoringEnabled ?? false}
            onCheckedChange={(v) => onChange('proctoringEnabled', v)}
          />
          <Label className="text-xs cursor-pointer">Proctoring</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={params.antiPlagiarismEnabled ?? false}
            onCheckedChange={(v) => onChange('antiPlagiarismEnabled', v)}
          />
          <Label className="text-xs cursor-pointer">Anti-Plagio</Label>
        </div>
      </div>
    </div>
  )
}

function VideoParams({ params, onChange }: ParamsPanelProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Video className="h-4 w-4" />
        Configuracao do Video
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Provedor</Label>
          <Select value={params.videoProvider ?? ''} onValueChange={(v) => onChange('videoProvider', v)}>
            <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="youtube">YouTube</SelectItem>
              <SelectItem value="vimeo">Vimeo</SelectItem>
              <SelectItem value="smartplayer">SmartPlayer</SelectItem>
              <SelectItem value="wistia">Wistia</SelectItem>
              <SelectItem value="upload">Upload Proprio</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Duracao (min)</Label>
          <Input
            type="number"
            min={0}
            placeholder="Ex: 45"
            value={params.videoDuration ?? ''}
            onChange={(e) => onChange('videoDuration', e.target.value ? Number(e.target.value) : null)}
          />
        </div>
        <div className="space-y-1 col-span-2">
          <Label className="text-xs">URL do Video</Label>
          <Input
            type="url"
            placeholder="https://..."
            value={params.videoUrl ?? ''}
            onChange={(e) => onChange('videoUrl', e.target.value)}
          />
        </div>
      </div>
      <div className="flex gap-6 pt-1">
        <div className="flex items-center gap-2">
          <Switch checked={params.enableAiFeatures ?? false} onCheckedChange={(v) => onChange('enableAiFeatures', v)} />
          <Label className="text-xs cursor-pointer">IA Features</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={params.enableAnnotations ?? false} onCheckedChange={(v) => onChange('enableAnnotations', v)} />
          <Label className="text-xs cursor-pointer">Anotacoes</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={params.enableXapiTracking ?? false} onCheckedChange={(v) => onChange('enableXapiTracking', v)} />
          <Label className="text-xs cursor-pointer">xAPI</Label>
        </div>
      </div>
    </div>
  )
}

function DiscussionParams({ params, onChange }: ParamsPanelProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <BookOpen className="h-4 w-4" />
        Configuracao da Discussao
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1 col-span-2">
          <Label className="text-xs">Topico</Label>
          <Input
            placeholder="Tema da discussao"
            value={params.discussionTopic ?? ''}
            onChange={(e) => onChange('discussionTopic', e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Min. Membros</Label>
          <Input type="number" min={1} value={params.minMembers ?? ''} onChange={(e) => onChange('minMembers', e.target.value ? Number(e.target.value) : null)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Max. Membros</Label>
          <Input type="number" min={1} value={params.maxMembers ?? ''} onChange={(e) => onChange('maxMembers', e.target.value ? Number(e.target.value) : null)} />
        </div>
      </div>
      <div className="flex gap-6 pt-1">
        <div className="flex items-center gap-2">
          <Switch checked={params.groupWorkEnabled ?? false} onCheckedChange={(v) => onChange('groupWorkEnabled', v)} />
          <Label className="text-xs cursor-pointer">Trabalho em Grupo</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={params.discussionEnabled ?? false} onCheckedChange={(v) => onChange('discussionEnabled', v)} />
          <Label className="text-xs cursor-pointer">Discussao Habilitada</Label>
        </div>
      </div>
    </div>
  )
}

function ActivityParams({ params, onChange }: ParamsPanelProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <ClipboardCheck className="h-4 w-4" />
        Configuracao do Trabalho
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Tipo de Entrega</Label>
          <Select value={params.submissionType ?? ''} onValueChange={(v) => onChange('submissionType', v)}>
            <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="file_upload">Upload de Arquivo</SelectItem>
              <SelectItem value="text_entry">Texto</SelectItem>
              <SelectItem value="url">URL</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Tentativas</Label>
          <Input type="number" min={1} max={100} value={params.maxAttempts ?? ''} onChange={(e) => onChange('maxAttempts', e.target.value ? Number(e.target.value) : null)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Prazo</Label>
          <Input type="date" value={params.deadline ?? ''} onChange={(e) => onChange('deadline', e.target.value)} />
        </div>
      </div>
      <div className="flex items-center gap-2 pt-1">
        <Switch checked={params.groupWorkEnabled ?? false} onCheckedChange={(v) => onChange('groupWorkEnabled', v)} />
        <Label className="text-xs cursor-pointer">Trabalho em Grupo</Label>
      </div>
    </div>
  )
}

// ============================================================================
// COMPONENT: Routes to correct panel by type
// ============================================================================

function ComponentParamsPanel({ comp, companyId, params, onChange }: { comp: any; companyId: string; params: Record<string, any>; onChange: (key: string, value: any) => void }) {
  const type = comp.componentType ?? comp.component_type ?? ''
  const panelProps: ParamsPanelProps = { comp, params, onChange, companyId }

  switch (type) {
    case 'live_session':
      return <LiveSessionParams {...panelProps} />
    case 'presencial_activity':
    case 'hybrid_activity':
      return <PresencialParams {...panelProps} />
    case 'quiz':
    case 'assignment':
      return <AssessmentParams {...panelProps} />
    case 'video':
      return <VideoParams {...panelProps} />
    case 'discussion':
      return <DiscussionParams {...panelProps} />
    case 'interactive':
    case 'online_activity':
      return <ActivityParams {...panelProps} />
    default:
      return null
  }
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function EventModal({
  isOpen,
  onClose,
  companyId,
  editingEventId,
  classInstanceId,
  onSave,
  dayEvents = [],
  selectedDate,
  holidayMap,
}: EventModalProps) {
  const isEditMode = !!editingEventId

  // New event scope: institution-wide or turma-specific
  const [eventScope, setEventScope] = useState<'none' | 'institution' | 'turma'>('none')
  const [selectedTurmaId, setSelectedTurmaId] = useState<string>(classInstanceId ?? '')

  // Fetch turmas for turma picker
  const { classInstances: turmaList, isLoading: turmasLoading } = useClassInstances(companyId || undefined)

  // Fetch components — uses selectedTurmaId when in turma scope
  const componentTurmaId = eventScope === 'turma' ? selectedTurmaId : classInstanceId
  const {
    unitGroups,
    allComponents,
    isLoading: componentsLoading,
  } = useCompanyComponents(companyId, isOpen && (eventScope === 'turma' ? !!selectedTurmaId : true), componentTurmaId)

  // Cascade dropdown state for hierarchy navigation
  const [selectedUnitId, setSelectedUnitId] = useState<string>('')

  // Fetch event details for edit mode
  const { data: eventData, isLoading: eventLoading } = useEventDetails(
    companyId,
    isEditMode ? editingEventId : null,
  )

  // Form state
  const [selectedComponentId, setSelectedComponentId] = useState<string>('')
  const [title, setTitle] = useState('')
  const [eventType, setEventType] = useState<string>('aula')
  const [startDate, setStartDate] = useState('')
  const [startTime, setStartTime] = useState('08:00')
  const [endTime, setEndTime] = useState('09:00')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [paramsExpanded, setParamsExpanded] = useState(true)
  const [componentParams, setComponentParams] = useState<Record<string, any>>({})
  const [recurrence, setRecurrence] = useState<RecurrenceConfig>(DEFAULT_RECURRENCE)
  const [holidayNegOpen, setHolidayNegOpen] = useState(false)
  const [holidayNegName, setHolidayNegName] = useState('')

  // Handler for component param changes
  const handleParamChange = useCallback((key: string, value: any) => {
    setComponentParams((prev) => ({ ...prev, [key]: value }))
  }, [])

  // Also fetch components in edit mode (to find component linked via event_id)
  const {
    allComponents: allComponentsForLookup,
  } = useCompanyComponents(companyId, isOpen && isEditMode, classInstanceId)

  // Fetch full component details when selected (for content_data)
  const { data: fullComponent, isLoading: componentDetailLoading } = useComponentDetails(
    selectedComponentId || null,
  )

  // For edit mode, find the componentId from multiple sources:
  // 1. event.component_id (direct FK on event row)
  // 2. event.metadata.componentId (stored in JSONB)
  // 3. component.eventId matching editingEventId (reverse FK)
  const editComponentId = useMemo(() => {
    if (!isEditMode || !editingEventId) return null

    // Source 1 & 2: from event data
    if (eventData) {
      const evt = eventData.data ?? eventData
      const fromEvent = evt.component_id ?? evt.componentId ?? evt.metadata?.componentId ?? evt.metadata?.component_id ?? null
      if (fromEvent) return fromEvent
    }

    // Source 3: reverse lookup — find component where eventId === editingEventId
    if (allComponentsForLookup.length > 0) {
      const match = allComponentsForLookup.find((c: any) => {
        const eid = c.eventId ?? c.event_id
        return eid === editingEventId
      })
      if (match) return match.id
    }

    return null
  }, [isEditMode, editingEventId, eventData, allComponentsForLookup])

  const { data: editComponent, isLoading: editComponentLoading } = useComponentDetails(editComponentId)

  // The active component for showing params
  // Priority: user-selected component (from picker) > edit-linked component
  const activeComponent = fullComponent ?? editComponent

  // Whether event type is determined by component (locked)
  const eventTypeLocked = !!(selectedComponentId || editComponentId)

  // Selected component from list (basic info)
  const selectedComponentBasic = useMemo(
    () => allComponents.find((c) => c.id === selectedComponentId) ?? null,
    [allComponents, selectedComponentId],
  )

  // Reset form on open
  useEffect(() => {
    if (!isOpen) return
    setError(null)
    setIsSaving(false)
    setParamsExpanded(true)
    setComponentParams({})

    if (!isEditMode) {
      setSelectedComponentId('')
      setTitle('')
      setEventType('aula')
      setStartDate('')
      setStartTime('08:00')
      setEndTime('09:00')
      setRecurrence(DEFAULT_RECURRENCE)
    }
  }, [isOpen, isEditMode])

  // In edit mode, pre-select the linked component when we discover it
  useEffect(() => {
    if (isEditMode && editComponentId && !selectedComponentId) {
      setSelectedComponentId(editComponentId)
    }
  }, [isEditMode, editComponentId, selectedComponentId])

  // Initialize componentParams from loaded component data
  useEffect(() => {
    if (!activeComponent) return
    const c = activeComponent as any
    const conference = dig(c, 'contentData', 'streaming', 'conference') ?? {}
    const assessment = dig(c, 'contentData', 'assessment') ?? {}
    const assessParams = assessment.parameters ?? {}
    const assessGrading = assessment.grading ?? {}
    const assessOnline = assessment.online ?? {}
    const assessProctoring = assessment.proctoring ?? {}
    const streaming = dig(c, 'contentData', 'streaming') ?? {}
    const videoConfig = streaming.video ?? {}
    const activity = dig(c, 'contentData', 'activity') ?? {}
    const discussion = activity.discussion ?? {}

    setComponentParams({
      // Live session
      conferenceProvider: c.conferenceProvider ?? conference.provider ?? '',
      conferenceLink: c.conferenceLink ?? conference.link ?? '',
      conferenceCapacity: conference.capacity ?? null,
      conferenceMeetingId: conference.meeting_id ?? conference.meetingId ?? '',
      conferencePasscode: conference.passcode ?? '',
      conferenceRecording: conference.recording_enabled ?? conference.recordingEnabled ?? false,
      conferenceWhiteboard: conference.whiteboard_enabled ?? conference.whiteboardEnabled ?? false,
      // Presencial
      presencialResourceId: c.presencialCompanyId ?? '',
      completionMethod: c.completionMethod ?? '',
      presencialTopic: '',
      requiresAttendanceProof: false,
      // Assessment
      assessmentMode: c.assessmentMode ?? '',
      assessmentFormat: assessOnline.format ?? '',
      timeLimitMinutes: assessParams.time_limit_minutes ?? null,
      maxAttempts: assessParams.max_attempts ?? null,
      assessmentWeight: assessParams.weight ?? null,
      gradingSystem: assessGrading.system ?? '',
      proctoringEnabled: c.proctoringEnabled ?? assessProctoring.enabled ?? false,
      antiPlagiarismEnabled: c.antiPlagiarismEnabled ?? false,
      // Video
      videoProvider: c.provider ?? videoConfig.provider ?? '',
      videoDuration: c.estimatedDurationMinutes ?? null,
      videoUrl: c.contentUrl ?? videoConfig.url ?? '',
      enableAiFeatures: c.enableAiFeatures ?? false,
      enableAnnotations: c.enableAnnotations ?? false,
      enableXapiTracking: c.enableXapiTracking ?? false,
      // Discussion
      discussionTopic: discussion.topic ?? '',
      minMembers: discussion.min_members ?? discussion.minMembers ?? null,
      maxMembers: discussion.max_members ?? discussion.maxMembers ?? null,
      groupWorkEnabled: c.groupWorkEnabled ?? false,
      discussionEnabled: c.discussionEnabled ?? false,
      // Activity
      submissionType: '',
      deadline: '',
    })
  }, [activeComponent])

  // Pre-fill form when editing
  useEffect(() => {
    if (!isEditMode || !eventData) return
    const evt = eventData.data ?? eventData
    setTitle(evt.title ?? '')
    setEventType(evt.event_type ?? evt.eventType ?? 'aula')
    setStartDate(formatDate(evt.start_datetime ?? evt.startDatetime ?? ''))
    setStartTime(formatTime(evt.start_datetime ?? evt.startDatetime ?? ''))
    setEndTime(formatTime(evt.end_datetime ?? evt.endDatetime ?? ''))
  }, [isEditMode, eventData])

  // Auto-fill when component selected
  const handleComponentSelect = useCallback(
    (componentId: string) => {
      setSelectedComponentId(componentId)
      const comp = allComponents.find((c) => c.id === componentId)
      if (!comp) return

      setTitle(comp.title)
      setEventType(COMPONENT_TYPE_TO_EVENT_TYPE[comp.componentType] ?? 'aula')

      if (comp.estimatedDurationMinutes) {
        setEndTime(addMinutesToTime(startTime, comp.estimatedDurationMinutes))
      }

      if (comp.scheduledDate) {
        setStartDate(formatDate(comp.scheduledDate))
      } else if (selectedDate) {
        setStartDate(selectedDate.toISOString().split('T')[0]!)
      }

      // Auto-advance to step 2
      setTimeout(() => setStep(2), 150)
    },
    [allComponents, startTime, selectedDate],
  )

  // Validation
  function validate(): boolean {
    if (!title.trim()) {
      setError('Titulo e obrigatorio')
      return false
    }
    if (!startDate) {
      setError('Data e obrigatoria')
      return false
    }
    if (!startTime || !endTime) {
      setError('Horario inicio e termino sao obrigatorios')
      return false
    }
    setError(null)
    return true
  }

  // Build component update payload from componentParams
  function buildComponentUpdate(): Partial<any> | null {
    const compId = selectedComponentId || editComponentId
    if (!compId) return null

    const type = activeComponent?.componentType ?? ''
    const update: any = {}

    switch (type) {
      case 'live_session':
        if (componentParams.conferenceProvider) update.conferenceProvider = componentParams.conferenceProvider
        if (componentParams.conferenceLink) update.conferenceLink = componentParams.conferenceLink
        update.contentData = {
          streaming: {
            conference: {
              provider: componentParams.conferenceProvider || undefined,
              link: componentParams.conferenceLink || undefined,
              capacity: componentParams.conferenceCapacity || undefined,
              meeting_id: componentParams.conferenceMeetingId || undefined,
              passcode: componentParams.conferencePasscode || undefined,
              recording_enabled: componentParams.conferenceRecording ?? false,
              whiteboard_enabled: componentParams.conferenceWhiteboard ?? false,
            },
          },
        }
        break
      case 'presencial_activity':
      case 'hybrid_activity':
        if (componentParams.presencialResourceId) update.presencialCompanyId = componentParams.presencialResourceId
        if (componentParams.completionMethod) update.completionMethod = componentParams.completionMethod
        break
      case 'quiz':
      case 'assignment':
        if (componentParams.assessmentMode) update.assessmentMode = componentParams.assessmentMode
        update.proctoringEnabled = componentParams.proctoringEnabled ?? false
        update.antiPlagiarismEnabled = componentParams.antiPlagiarismEnabled ?? false
        update.contentData = {
          assessment: {
            parameters: {
              time_limit_minutes: componentParams.timeLimitMinutes || undefined,
              max_attempts: componentParams.maxAttempts || undefined,
              weight: componentParams.assessmentWeight || undefined,
            },
            grading: { system: componentParams.gradingSystem || undefined },
            online: { format: componentParams.assessmentFormat || undefined },
          },
        }
        break
      case 'video':
        if (componentParams.videoProvider) update.provider = componentParams.videoProvider
        if (componentParams.videoUrl) update.contentUrl = componentParams.videoUrl
        if (componentParams.videoDuration) update.estimatedDurationMinutes = componentParams.videoDuration
        update.enableAiFeatures = componentParams.enableAiFeatures ?? false
        update.enableAnnotations = componentParams.enableAnnotations ?? false
        update.enableXapiTracking = componentParams.enableXapiTracking ?? false
        break
      case 'discussion':
        update.groupWorkEnabled = componentParams.groupWorkEnabled ?? false
        update.discussionEnabled = componentParams.discussionEnabled ?? false
        break
    }

    return Object.keys(update).length > 0 ? update : null
  }

  // Holiday negotiation callback
  function handleHolidayResult(result: NegotiationResult) {
    setHolidayNegOpen(false)
    if (result.action === 'move') {
      setStartDate(result.newDate)
      toast.info(`Data alterada para ${result.newDate} (${result.dayOfWeek})`)
    } else if (result.action === 'keep') {
      doSave(true) // allow_on_holiday = true
    }
    // 'cancel' → do nothing, user stays on modal
  }

  // Save
  async function handleSave() {
    if (!validate()) return
    // Check if date is a holiday/blocked day
    const dateHoliday = holidayMap?.get(startDate)
    if (dateHoliday && !isEditMode) {
      setHolidayNegName(dateHoliday)
      setHolidayNegOpen(true)
      return
    }
    doSave(false)
  }

  async function doSave(allowOnHoliday: boolean) {
    if (!validate()) return

    setIsSaving(true)
    setError(null)
    try {
      const compId = selectedComponentId || editComponentId

      // Build resources array if a presencial resource was selected
      const resources: Array<{ resourceId: string; quantity: number }> = []
      if (componentParams.presencialResourceId) {
        resources.push({ resourceId: componentParams.presencialResourceId, quantity: 1 })
      }

      // Recurrence fields
      const recurrenceFields = !isEditMode ? toRecurrenceRule(recurrence) : {}

      const payload = {
        title: title.trim(),
        eventType,
        startDatetime: buildIso(startDate, startTime),
        endDatetime: buildIso(startDate, endTime),
        classInstanceId: eventScope === 'turma' ? selectedTurmaId : null,
        componentId: compId || undefined,
        resources,
        metadata: compId ? { componentId: compId } : undefined,
        allowOnHoliday: allowOnHoliday || undefined,
        ...recurrenceFields,
      }

      // Save event
      if (isEditMode && editingEventId) {
        await apiFetch(`/companies/${companyId}/events/${editingEventId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } else {
        await apiFetch(`/companies/${companyId}/events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }

      // Save component params (if any changed)
      const compUpdate = buildComponentUpdate()
      if (compId && compUpdate) {
        try {
          await apiClient.updateComponent(compId, compUpdate)
        } catch {
          // Component update failure shouldn't block event save
        }
      }

      onSave()
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar'
      setError(msg)
    } finally {
      setIsSaving(false)
    }
  }

  // ---- Loading & step state ----
  const isLoading = isEditMode ? eventLoading : componentsLoading
  const [step, setStep] = useState<1 | 2>(1)

  // Reset step and cascade on modal open
  useEffect(() => {
    if (isOpen) {
      setStep(isEditMode ? 2 : 1)
      setSelectedUnitId('')
      if (!isEditMode) {
        setEventScope('none')
        setSelectedTurmaId(classInstanceId ?? '')
      }
    }
  }, [isOpen, isEditMode, classInstanceId])

  // Create mode: step 1 = pick component, step 2 = configure
  // Edit mode: always step 2 (configure)
  const showStep1 = !isEditMode && step === 1
  const showStep2 = isEditMode || step === 2

  // Can proceed to step 2?
  const canProceedToStep2 =
    eventScope === 'institution' ? title.trim().length > 0 :              // institution: just needs title
    eventScope === 'turma' ? !!selectedComponentId : false                // turma: needs component selected

  return (
    <Dialog open={isOpen} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditMode
              ? title || 'Editar Evento'
              : showStep1
                ? 'Novo Evento'
                : title || 'Configurar Evento'}
          </DialogTitle>
          <DialogDescription>
            {isEditMode
              ? 'Edite os parametros do evento e do componente vinculado.'
              : showStep1
                ? 'Escolha um componente existente, crie um novo, ou adicione um evento avulso.'
                : 'Configure data, horario e parametros do componente.'}
          </DialogDescription>
          {/* Step indicator — only in create mode */}
          {!isEditMode && (
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${showStep1 ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold transition-colors ${showStep1 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>1</span>
                Componente
              </button>
              <div className="h-px w-8 bg-border" />
              <div className={`flex items-center gap-1.5 text-xs font-medium ${showStep2 ? 'text-primary' : 'text-muted-foreground'}`}>
                <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${showStep2 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>2</span>
                Configurar
              </div>
            </div>
          )}
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-4 py-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-3/4" />
          </div>
        ) : (
          <>
            {/* ================================================================ */}
            {/* STEP 1 — NEW EVENT: Scope + Component Selection                  */}
            {/* ================================================================ */}
            {showStep1 && (
              <div className="space-y-5 py-2">
                {/* Scope selector */}
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Escopo do evento
                  </Label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => { setEventScope('institution'); setSelectedTurmaId(''); setSelectedUnitId(''); setSelectedComponentId('') }}
                      className={`rounded-lg border-2 p-4 text-left transition-all ${
                        eventScope === 'institution'
                          ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                          : 'border-border hover:border-primary/30 hover:bg-accent/30'
                      }`}
                    >
                      <CalendarDays className={`h-6 w-6 mb-2 ${eventScope === 'institution' ? 'text-primary' : 'text-muted-foreground'}`} />
                      <p className={`text-sm font-semibold ${eventScope === 'institution' ? 'text-primary' : ''}`}>Instituicao</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Impacta todas as turmas</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setEventScope('turma'); setSelectedUnitId(''); setSelectedComponentId('') }}
                      className={`rounded-lg border-2 p-4 text-left transition-all ${
                        eventScope === 'turma'
                          ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                          : 'border-border hover:border-primary/30 hover:bg-accent/30'
                      }`}
                    >
                      <GraduationCap className={`h-6 w-6 mb-2 ${eventScope === 'turma' ? 'text-primary' : 'text-muted-foreground'}`} />
                      <p className={`text-sm font-semibold ${eventScope === 'turma' ? 'text-primary' : ''}`}>Turma</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Vinculado a uma turma</p>
                    </button>
                  </div>
                </div>

                {/* INSTITUTION: evento simples, SEM componente. Reuniao, recesso, etc. */}
                {eventScope === 'institution' && (
                  <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-4 animate-in fade-in duration-200">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Evento institucional</p>
                      <p className="text-xs text-muted-foreground">
                        Aparece para todas as turmas. Sem componente curricular — use para reunioes, recessos, eventos administrativos.
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Tipo</Label>
                      <Select value={eventType} onValueChange={(v) => setEventType(v)}>
                        <SelectTrigger><SelectValue placeholder="Tipo do evento..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="reuniao">Reuniao</SelectItem>
                          <SelectItem value="palestra">Palestra</SelectItem>
                          <SelectItem value="seminario">Seminario</SelectItem>
                          <SelectItem value="workshop">Workshop</SelectItem>
                          <SelectItem value="outro">Outro</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Titulo</Label>
                      <Input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Ex: Reuniao Pedagogica, Recesso de Carnaval"
                      />
                    </div>
                  </div>
                )}

                {/* TURMA: pick turma first, then component */}
                {eventScope === 'turma' && (
                  <div className="space-y-3 animate-in fade-in duration-200">
                    {/* Turma picker */}
                    <div className="space-y-1.5">
                      <Label className="text-xs">Turma</Label>
                      <Select value={selectedTurmaId} onValueChange={(v) => { setSelectedTurmaId(v); setSelectedUnitId(''); setSelectedComponentId('') }}>
                        <SelectTrigger><SelectValue placeholder="Selecione a turma..." /></SelectTrigger>
                        <SelectContent>
                          {turmasLoading ? (
                            <SelectItem value="_loading" disabled>Carregando...</SelectItem>
                          ) : (
                            (turmaList ?? []).map((ci) => (
                              <SelectItem key={ci.id} value={ci.id}>
                                {ci.name}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Component hierarchy — after turma selected */}
                    {selectedTurmaId && (
                      <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                        {componentsLoading ? (
                          <div className="space-y-2 py-2">
                            <Skeleton className="h-9 w-full" />
                            <Skeleton className="h-9 w-full" />
                          </div>
                        ) : unitGroups.length === 0 ? (
                          <div className="rounded-lg border border-dashed border-border p-4 text-center">
                            <p className="text-sm text-muted-foreground">Nenhum componente nesta turma.</p>
                          </div>
                        ) : (
                          <>
                            {/* Module dropdown */}
                            <div className="space-y-1.5">
                              <Label className="text-xs">Modulo</Label>
                              <Select value={selectedUnitId} onValueChange={(v) => { setSelectedUnitId(v); setSelectedComponentId('') }}>
                                <SelectTrigger><SelectValue placeholder="Selecione o modulo..." /></SelectTrigger>
                                <SelectContent>
                                  {unitGroups.map((g) => (
                                    <SelectItem key={g.unitId} value={g.unitId}>
                                      {g.unitTitle} ({g.components.length})
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            {/* Component dropdown — after module selected */}
                            {selectedUnitId && (
                              <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                                <div className="space-y-1.5">
                                  <Label className="text-xs">Componente existente</Label>
                                  <Select value={selectedComponentId} onValueChange={(v) => handleComponentSelect(v)}>
                                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                                    <SelectContent>
                                      {unitGroups.find((g) => g.unitId === selectedUnitId)?.components.map((comp) => (
                                        <SelectItem key={comp.id} value={comp.id}>
                                          {comp.title} — {COMPONENT_TYPE_LABELS[comp.componentType] ?? comp.componentType}
                                          {comp.estimatedDurationMinutes ? ` (${comp.estimatedDurationMinutes}min)` : ''}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>

                                {/* Create new component */}
                                <div className="relative py-1">
                                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border/50" /></div>
                                  <div className="relative flex justify-center"><span className="bg-background px-2 text-[10px] text-muted-foreground">ou criar novo</span></div>
                                </div>
                                <Select
                                  value=""
                                  onValueChange={async (componentType) => {
                                    const typeLabel = COMPONENT_TYPE_LABELS[componentType] ?? componentType
                                    const newTitle = `Novo ${typeLabel}`
                                    setTitle(newTitle)
                                    setEventType(COMPONENT_TYPE_TO_EVENT_TYPE[componentType] ?? 'aula')
                                    setComponentParams({})
                                    if (selectedDate) setStartDate(selectedDate.toISOString().split('T')[0]!)
                                    try {
                                      const created = await apiClient.createComponent({ unitId: selectedUnitId, componentType, title: newTitle } as any)
                                      const newId = (created as any)?.id ?? (created as any)?.data?.id
                                      if (newId) { setSelectedComponentId(newId); toast.success(`"${newTitle}" criado`) }
                                    } catch (err: any) { toast.error(`Erro: ${err?.message ?? 'desconhecido'}`) }
                                    setTimeout(() => setStep(2), 200)
                                  }}
                                >
                                  <SelectTrigger><SelectValue placeholder="Criar novo tipo..." /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="live_session"><span className="flex items-center gap-2"><Video className="h-3.5 w-3.5" />Aula ao Vivo</span></SelectItem>
                                    <SelectItem value="presencial_activity"><span className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5" />Atividade Presencial</span></SelectItem>
                                    <SelectItem value="hybrid_activity"><span className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5" />Atividade Hibrida</span></SelectItem>
                                    <SelectItem value="quiz"><span className="flex items-center gap-2"><ClipboardCheck className="h-3.5 w-3.5" />Quiz / Prova</span></SelectItem>
                                    <SelectItem value="assignment"><span className="flex items-center gap-2"><ClipboardCheck className="h-3.5 w-3.5" />Trabalho / Entrega</span></SelectItem>
                                    <SelectItem value="video"><span className="flex items-center gap-2"><Video className="h-3.5 w-3.5" />Video</span></SelectItem>
                                    <SelectItem value="discussion"><span className="flex items-center gap-2"><BookOpen className="h-3.5 w-3.5" />Discussao / Seminario</span></SelectItem>
                                    <SelectItem value="interactive"><span className="flex items-center gap-2"><BookOpen className="h-3.5 w-3.5" />Atividade Interativa</span></SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ================================================================ */}
            {/* STEP 2 — Configure Event + Component Parameters                  */}
            {/* B.1: Pre-filled data | B.2: Component params | B.3: Link picker  */}
            {/* ================================================================ */}
            {showStep2 && (
              <div className="space-y-5 py-2">
                {/* B.2: Component linked → summary + params */}
                {(selectedComponentBasic || (isEditMode && editComponent)) ? (
                  <div className="rounded-lg border border-border bg-muted/30 p-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">
                          {selectedComponentBasic?.title ?? (editComponent as any)?.title ?? 'Componente'}
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          <Badge variant="outline" className="text-[10px]">
                            {COMPONENT_TYPE_LABELS[(selectedComponentBasic?.componentType ?? (editComponent as any)?.componentType) as string] ?? 'Componente'}
                          </Badge>
                          {(selectedComponentBasic?.estimatedDurationMinutes ?? (editComponent as any)?.estimatedDurationMinutes) && (
                            <Badge variant="secondary" className="text-[10px]">
                              {selectedComponentBasic?.estimatedDurationMinutes ?? (editComponent as any)?.estimatedDurationMinutes} min
                            </Badge>
                          )}
                        </div>
                      </div>
                      {/* B.5: Desvincular componente */}
                      {isEditMode && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="shrink-0 text-xs text-destructive hover:text-destructive"
                          onClick={() => { setSelectedComponentId(''); setComponentParams({}) }}
                        >
                          Desvincular
                        </Button>
                      )}
                      {!isEditMode && (
                        <Button variant="ghost" size="sm" className="shrink-0 text-xs" onClick={() => setStep(1)}>
                          Trocar
                        </Button>
                      )}
                    </div>
                  </div>
                ) : isEditMode ? (
                  /* B.3: Edit mode, no component linked → inline picker to link */
                  <div className="rounded-lg border border-dashed border-border p-4 space-y-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Vincular componente (opcional)
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <Select value={selectedUnitId} onValueChange={(v) => { setSelectedUnitId(v); setSelectedComponentId('') }}>
                        <SelectTrigger className="text-sm">
                          <SelectValue placeholder="Modulo..." />
                        </SelectTrigger>
                        <SelectContent>
                          {unitGroups.map((g) => (
                            <SelectItem key={g.unitId} value={g.unitId}>{g.unitTitle}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={selectedComponentId}
                        onValueChange={(v) => handleComponentSelect(v)}
                        disabled={!selectedUnitId}
                      >
                        <SelectTrigger className="text-sm">
                          <SelectValue placeholder="Componente..." />
                        </SelectTrigger>
                        <SelectContent>
                          {unitGroups.find((g) => g.unitId === selectedUnitId)?.components.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.title} — {COMPONENT_TYPE_LABELS[c.componentType] ?? c.componentType}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ) : null}

                {/* Title */}
                <div className="space-y-1.5">
                  <Label htmlFor="evt-title">Titulo do Evento</Label>
                  <Input
                    id="evt-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Ex: Aula de Cinematografia"
                    className="text-base"
                  />
                </div>

                {/* Event Type */}
                <div className="space-y-1.5">
                  <Label>Tipo</Label>
                  {eventTypeLocked ? (
                    <div className="flex items-center gap-2">
                      <Badge className="text-sm py-1 px-3">
                        {EVENT_TYPE_LABELS[eventType] ?? eventType}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        Definido pelo componente
                      </span>
                    </div>
                  ) : (
                    <Select value={eventType} onValueChange={setEventType}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(EVENT_TYPE_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {/* Date + Times */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="evt-date">Data</Label>
                    <Input
                      id="evt-date"
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="evt-start">Inicio</Label>
                    <Input
                      id="evt-start"
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="evt-end">Termino</Label>
                    <Input
                      id="evt-end"
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                    />
                  </div>
                </div>

                {/* Recurrence Picker — Google Calendar style */}
                {!isEditMode && (
                  <>
                    <Separator />
                    <RecurrencePicker
                      value={recurrence}
                      onChange={setRecurrence}
                      startDate={startDate}
                    />
                  </>
                )}

                {/* Component Parameters — elegant section */}
                {activeComponent && (
                  <>
                    <Separator />
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-foreground">
                          Parametros do Componente
                        </h3>
                        <button
                          type="button"
                          onClick={() => setParamsExpanded(!paramsExpanded)}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {paramsExpanded ? 'Recolher' : 'Expandir'}
                        </button>
                      </div>
                      {paramsExpanded && (
                        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
                          {(componentDetailLoading || editComponentLoading) ? (
                            <div className="space-y-2">
                              <Skeleton className="h-4 w-2/3" />
                              <Skeleton className="h-4 w-1/2" />
                              <Skeleton className="h-4 w-3/4" />
                            </div>
                          ) : (
                            <ComponentParamsPanel comp={activeComponent} companyId={companyId} params={componentParams} onChange={handleParamChange} />
                          )}
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* Error */}
                {error && (
                  <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {error}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ---- Footer ---- */}
        <DialogFooter className="gap-2">
          {showStep1 ? (
            <>
              <Button variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button
                onClick={() => {
                  if (eventScope === 'institution') {
                    setSelectedComponentId('')
                    if (selectedDate) setStartDate(selectedDate.toISOString().split('T')[0]!)
                  }
                  setStep(2)
                }}
                disabled={eventScope === 'none' || !canProceedToStep2}
              >
                {eventScope === 'institution' ? 'Definir Data e Hora' : 'Configurar Componente'}
              </Button>
            </>
          ) : (
            <>
              {!isEditMode && (
                <Button variant="ghost" onClick={() => setStep(1)} className="mr-auto">
                  Voltar
                </Button>
              )}
              <Button variant="outline" onClick={onClose} disabled={isSaving}>
                {isEditMode ? 'Fechar' : 'Cancelar'}
              </Button>
              <Button onClick={handleSave} disabled={isSaving || isLoading}>
                {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {isEditMode ? 'Salvar' : 'Criar Evento'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>

      {/* Holiday negotiation sub-modal */}
      <HolidayNegotiationModal
        isOpen={holidayNegOpen}
        onClose={() => setHolidayNegOpen(false)}
        companyId={companyId}
        eventDate={startDate}
        holidayName={holidayNegName}
        onResult={handleHolidayResult}
      />
    </Dialog>
  )
}
