'use client'

/**
 * ComponentDetailModal -- SCHED-020
 * Cockpit modal: clicking a calendar event opens a detail view showing
 * ALL component parameters organized by category. Supports inline editing
 * via ComponentInlineEditor (SCHED-021).
 *
 * Uses @cogedu/ui components and apiFetch (ZERO axios).
 */

import { useState, useEffect, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Badge,
  Button,
  Separator,
} from '@cogedu/ui'
import { Loader2, Pencil, X, Clock, CalendarDays } from 'lucide-react'
import { apiFetch } from '@/client/apiClient'
import type {
  CompanyEventRow,
  EventType,
  EventStatus,
} from '@cogedu/ava-database-types'
import { ComponentInlineEditor } from './ComponentInlineEditor'

// ============================================================================
// TYPES
// ============================================================================

interface ComponentDetailModalProps {
  isOpen: boolean
  onClose: () => void
  eventId: string
  companyId: string
}

/** Shape returned by GET /getCompanyEvent/:id (event + linked component data) */
interface EventDetail extends CompanyEventRow {
  resources: Array<{
    id: string
    name: string
    resource_type: string
    full_location: string
    pivot: { quantity: number; notes: string | null }
  }>
  component: ComponentDetail | null
}

interface ComponentDetail {
  id: string
  title: string
  description: string | null
  component_type: string
  status: string
  duration: number | null
  workload_hours: number | null
  visibility: string | null
  // Assessment
  assessment_config: Record<string, unknown> | null
  // Grading
  grading_type: string | null
  passing_score: number | null
  max_attempts: number | null
  // Conference
  conference_url: string | null
  conference_provider: string | null
  conference_duration: number | null
  // Content
  content_type: string | null
  scorm_config: Record<string, unknown> | null
  video_url: string | null
  // Completion
  completion_method: string | null
  completion_criteria: Record<string, unknown> | null
  min_progress: number | null
  // Discussion
  due_date: string | null
  min_posts: number | null
  min_replies: number | null
  moderated: boolean | null
  // Presencial
  room: string | null
  professor: string | null
  max_students: number | null
  attendance_required: boolean | null
  // Extra
  metadata: Record<string, unknown> | null
}

// ============================================================================
// CONSTANTS
// ============================================================================

const EVENT_TYPE_LABELS: Record<EventType, string> = {
  aula: 'Aula',
  estagio: 'Estagio',
  palestra: 'Palestra',
  visitacao_tecnica: 'Visitacao Tecnica',
  workshop: 'Workshop',
  seminario: 'Seminario',
  reuniao: 'Reuniao',
  avaliacao: 'Avaliacao',
  outro: 'Outro',
}

const EVENT_TYPE_BADGE: Record<EventType, string> = {
  aula: 'bg-blue-500 text-white',
  estagio: 'bg-amber-500 text-white',
  palestra: 'bg-purple-500 text-white',
  visitacao_tecnica: 'bg-cyan-500 text-white',
  workshop: 'bg-teal-500 text-white',
  seminario: 'bg-indigo-500 text-white',
  reuniao: 'bg-violet-500 text-white',
  avaliacao: 'bg-red-500 text-white',
  outro: 'bg-gray-500 text-white',
}

const STATUS_LABELS: Record<EventStatus, string> = {
  draft: 'Rascunho',
  scheduled: 'Agendado',
  in_progress: 'Em Andamento',
  completed: 'Concluido',
  cancelled: 'Cancelado',
}

// ============================================================================
// HELPERS
// ============================================================================

function formatDateTimePtBR(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatTimePtBR(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function renderValue(value: unknown): string {
  if (value === null || value === undefined) return '--'
  if (typeof value === 'boolean') return value ? 'Sim' : 'Nao'
  if (typeof value === 'object') return JSON.stringify(value, null, 2)
  return String(value)
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function FieldRow({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <span className="text-sm font-medium text-muted-foreground shrink-0">
        {label}
      </span>
      <span className="text-sm text-foreground text-right break-words max-w-[60%]">
        {renderValue(value)}
      </span>
    </div>
  )
}

function FieldSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 mb-2">
        {title}
      </h4>
      <div className="divide-y divide-border">{children}</div>
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function ComponentDetailModal({
  isOpen,
  onClose,
  eventId,
  companyId,
}: ComponentDetailModalProps) {
  const [event, setEvent] = useState<EventDetail | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)

  // ---- Fetch event + component data ----
  const fetchEvent = useCallback(async () => {
    if (!eventId || !companyId) return
    setIsLoading(true)
    setError(null)
    try {
      const data = await apiFetch<EventDetail>(
        `/getCompanyEvent?id=${eventId}&companyId=${companyId}`,
      )
      setEvent(data)
    } catch (err) {
      console.error('[ComponentDetailModal] Fetch failed:', err)
      setError('Nao foi possivel carregar os detalhes do evento.')
    } finally {
      setIsLoading(false)
    }
  }, [eventId, companyId])

  useEffect(() => {
    if (isOpen && eventId) {
      fetchEvent()
      setIsEditing(false)
    }
  }, [isOpen, eventId, fetchEvent])

  // ---- Save handler from inline editor ----
  const handleSaveParameters = useCallback(
    async (params: Record<string, unknown>) => {
      if (!event?.component) return
      try {
        await apiFetch(`/updateComponent`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: event.component.id,
            ...params,
          }),
        })
        setIsEditing(false)
        await fetchEvent()
      } catch (err) {
        console.error('[ComponentDetailModal] Save failed:', err)
      }
    },
    [event, fetchEvent],
  )

  // ---- Derived ----
  const comp = event?.component ?? null
  const hasAssessment =
    comp?.component_type === 'assessment' || comp?.component_type === 'quiz'
  const hasConference =
    comp?.component_type === 'live_session' ||
    comp?.component_type === 'webinar'
  const hasContent =
    comp?.component_type === 'video' ||
    comp?.component_type === 'scorm' ||
    comp?.component_type === 'content'
  const hasDiscussion = comp?.component_type === 'discussion'
  const hasPresencial =
    comp?.component_type === 'presencial' || comp?.component_type === 'aula'

  return (
    <Dialog open={isOpen} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        {/* ---- Loading ---- */}
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* ---- Error ---- */}
        {error && !isLoading && (
          <div className="flex flex-col items-center gap-3 py-16">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchEvent}>
              Tentar novamente
            </Button>
          </div>
        )}

        {/* ---- Content ---- */}
        {event && !isLoading && !error && (
          <>
            <DialogHeader>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <DialogTitle className="text-lg">
                    {event.title}
                  </DialogTitle>
                  <DialogDescription className="mt-1 flex items-center gap-3 flex-wrap">
                    <span className="inline-flex items-center gap-1.5">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {formatDateTimePtBR(event.start_datetime)}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      {formatTimePtBR(event.start_datetime)} -{' '}
                      {formatTimePtBR(event.end_datetime)}
                    </span>
                  </DialogDescription>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge className={EVENT_TYPE_BADGE[event.event_type]}>
                    {EVENT_TYPE_LABELS[event.event_type]}
                  </Badge>
                  <Badge variant="outline">
                    {STATUS_LABELS[event.status]}
                  </Badge>
                </div>
              </div>
            </DialogHeader>

            <Separator className="my-3" />

            {/* ---- Edit toggle ---- */}
            {comp && !isEditing && (
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditing(true)}
                >
                  <Pencil className="h-3.5 w-3.5 mr-1.5" />
                  Editar
                </Button>
              </div>
            )}

            {isEditing && comp ? (
              <ComponentInlineEditor
                componentId={comp.id}
                componentType={comp.component_type}
                parameters={comp as unknown as Record<string, unknown>}
                onSave={handleSaveParameters}
                onCancel={() => setIsEditing(false)}
              />
            ) : (
              <Tabs defaultValue="general" className="w-full">
                <TabsList className="w-full justify-start flex-wrap">
                  <TabsTrigger value="general">Geral</TabsTrigger>
                  <TabsTrigger value="event">Evento</TabsTrigger>
                  {hasAssessment && (
                    <TabsTrigger value="assessment">Avaliacao</TabsTrigger>
                  )}
                  <TabsTrigger value="grading">Notas</TabsTrigger>
                  {hasConference && (
                    <TabsTrigger value="conference">Conferencia</TabsTrigger>
                  )}
                  {hasContent && (
                    <TabsTrigger value="content">Conteudo</TabsTrigger>
                  )}
                  <TabsTrigger value="completion">Conclusao</TabsTrigger>
                  {hasDiscussion && (
                    <TabsTrigger value="discussion">Discussao</TabsTrigger>
                  )}
                  {hasPresencial && (
                    <TabsTrigger value="presencial">Presencial</TabsTrigger>
                  )}
                  <TabsTrigger value="resources">Recursos</TabsTrigger>
                </TabsList>

                {/* ---- General ---- */}
                <TabsContent value="general" className="space-y-4">
                  <FieldSection title="Informacoes Gerais">
                    <FieldRow label="Titulo" value={comp?.title} />
                    <FieldRow label="Descricao" value={comp?.description} />
                    <FieldRow
                      label="Tipo do Componente"
                      value={comp?.component_type}
                    />
                    <FieldRow label="Status" value={comp?.status} />
                    <FieldRow label="Duracao (min)" value={comp?.duration} />
                    <FieldRow
                      label="Carga Horaria (h)"
                      value={comp?.workload_hours}
                    />
                    <FieldRow
                      label="Visibilidade"
                      value={comp?.visibility}
                    />
                  </FieldSection>
                </TabsContent>

                {/* ---- Event Details ---- */}
                <TabsContent value="event" className="space-y-4">
                  <FieldSection title="Detalhes do Evento">
                    <FieldRow label="Tipo" value={EVENT_TYPE_LABELS[event.event_type]} />
                    <FieldRow label="Status" value={STATUS_LABELS[event.status]} />
                    <FieldRow label="Inicio" value={formatDateTimePtBR(event.start_datetime)} />
                    <FieldRow label="Termino" value={formatDateTimePtBR(event.end_datetime)} />
                    <FieldRow label="Fuso Horario" value={event.timezone} />
                    <FieldRow label="Recorrente" value={event.is_recurring} />
                    <FieldRow label="Regra de Recorrencia" value={event.recurrence_rule} />
                    <FieldRow label="Max Participantes" value={event.max_participants} />
                    <FieldRow label="Permitir em Feriado" value={event.allow_on_holiday} />
                    <FieldRow label="Check-in Aberto" value={event.is_checkin_open} />
                    <FieldRow label="Modo Check-in" value={event.checkin_mode} />
                    <FieldRow label="Descricao" value={event.description} />
                  </FieldSection>
                </TabsContent>

                {/* ---- Assessment ---- */}
                {hasAssessment && (
                  <TabsContent value="assessment" className="space-y-4">
                    <FieldSection title="Configuracao de Avaliacao">
                      <FieldRow
                        label="Configuracao"
                        value={comp?.assessment_config}
                      />
                      <FieldRow
                        label="Tentativas Maximas"
                        value={comp?.max_attempts}
                      />
                    </FieldSection>
                  </TabsContent>
                )}

                {/* ---- Grading ---- */}
                <TabsContent value="grading" className="space-y-4">
                  <FieldSection title="Configuracao de Notas">
                    <FieldRow
                      label="Tipo de Avaliacao"
                      value={comp?.grading_type}
                    />
                    <FieldRow
                      label="Nota Minima"
                      value={comp?.passing_score}
                    />
                    <FieldRow
                      label="Tentativas Maximas"
                      value={comp?.max_attempts}
                    />
                  </FieldSection>
                </TabsContent>

                {/* ---- Conference ---- */}
                {hasConference && (
                  <TabsContent value="conference" className="space-y-4">
                    <FieldSection title="Conferencia">
                      <FieldRow
                        label="URL da Conferencia"
                        value={comp?.conference_url}
                      />
                      <FieldRow
                        label="Provedor"
                        value={comp?.conference_provider}
                      />
                      <FieldRow
                        label="Duracao (min)"
                        value={comp?.conference_duration}
                      />
                    </FieldSection>
                  </TabsContent>
                )}

                {/* ---- Content ---- */}
                {hasContent && (
                  <TabsContent value="content" className="space-y-4">
                    <FieldSection title="Conteudo">
                      <FieldRow
                        label="Tipo de Conteudo"
                        value={comp?.content_type}
                      />
                      <FieldRow
                        label="Configuracao SCORM"
                        value={comp?.scorm_config}
                      />
                      <FieldRow
                        label="URL do Video"
                        value={comp?.video_url}
                      />
                    </FieldSection>
                  </TabsContent>
                )}

                {/* ---- Completion ---- */}
                <TabsContent value="completion" className="space-y-4">
                  <FieldSection title="Conclusao">
                    <FieldRow
                      label="Metodo de Conclusao"
                      value={comp?.completion_method}
                    />
                    <FieldRow
                      label="Criterios"
                      value={comp?.completion_criteria}
                    />
                    <FieldRow
                      label="Progresso Minimo (%)"
                      value={comp?.min_progress}
                    />
                  </FieldSection>
                </TabsContent>

                {/* ---- Discussion ---- */}
                {hasDiscussion && (
                  <TabsContent value="discussion" className="space-y-4">
                    <FieldSection title="Discussao">
                      <FieldRow label="Data Limite" value={comp?.due_date} />
                      <FieldRow
                        label="Posts Minimos"
                        value={comp?.min_posts}
                      />
                      <FieldRow
                        label="Respostas Minimas"
                        value={comp?.min_replies}
                      />
                      <FieldRow label="Moderado" value={comp?.moderated} />
                    </FieldSection>
                  </TabsContent>
                )}

                {/* ---- Presencial ---- */}
                {hasPresencial && (
                  <TabsContent value="presencial" className="space-y-4">
                    <FieldSection title="Presencial">
                      <FieldRow label="Sala" value={comp?.room} />
                      <FieldRow label="Professor" value={comp?.professor} />
                      <FieldRow
                        label="Max Alunos"
                        value={comp?.max_students}
                      />
                      <FieldRow
                        label="Presenca Obrigatoria"
                        value={comp?.attendance_required}
                      />
                    </FieldSection>
                  </TabsContent>
                )}

                {/* ---- Resources ---- */}
                <TabsContent value="resources" className="space-y-4">
                  <FieldSection title="Recursos Alocados">
                    {event.resources.length === 0 ? (
                      <p className="py-3 text-sm text-muted-foreground">
                        Nenhum recurso alocado.
                      </p>
                    ) : (
                      event.resources.map((r) => (
                        <div
                          key={r.id}
                          className="flex items-center justify-between py-2"
                        >
                          <div>
                            <span className="text-sm font-medium text-foreground">
                              {r.name}
                            </span>
                            <span className="ml-2 text-xs text-muted-foreground">
                              {r.resource_type}
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {r.full_location}
                          </span>
                        </div>
                      ))
                    )}
                  </FieldSection>
                </TabsContent>
              </Tabs>
            )}

            {/* ---- Footer with close ---- */}
            <div className="flex justify-end pt-3">
              <Button variant="outline" onClick={onClose}>
                <X className="h-4 w-4 mr-1.5" />
                Fechar
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default ComponentDetailModal
