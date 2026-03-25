'use client'

/**
 * ComponentInlineEditor -- SCHED-021
 * Dynamic form for editing component parameters inline within the cockpit.
 * Renders different field sets based on component_type.
 *
 * Uses @cogedu/ui components and apiFetch (ZERO axios).
 */

import { useState, useCallback, useMemo } from 'react'
import {
  Button,
  Input,
  Label,
  Switch,
  Textarea,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Separator,
} from '@cogedu/ui'
import { Loader2, Save, XCircle } from 'lucide-react'

// ============================================================================
// TYPES
// ============================================================================

interface ComponentInlineEditorProps {
  componentId: string
  componentType: string
  parameters: Record<string, unknown>
  onSave: (params: Record<string, unknown>) => void
  onCancel?: () => void
}

interface FieldConfig {
  key: string
  label: string
  type: 'text' | 'number' | 'select' | 'toggle' | 'date' | 'datetime' | 'textarea' | 'url'
  options?: { value: string; label: string }[]
  placeholder?: string
  required?: boolean
  min?: number
  max?: number
}

interface FieldError {
  [key: string]: string
}

// ============================================================================
// FIELD DEFINITIONS BY COMPONENT TYPE
// ============================================================================

const GENERAL_FIELDS: FieldConfig[] = [
  { key: 'title', label: 'Titulo', type: 'text', required: true },
  { key: 'description', label: 'Descricao', type: 'textarea' },
  {
    key: 'workload_hours',
    label: 'Carga Horaria (h)',
    type: 'number',
    min: 0,
    max: 1000,
  },
  {
    key: 'status',
    label: 'Status',
    type: 'select',
    options: [
      { value: 'draft', label: 'Rascunho' },
      { value: 'published', label: 'Publicado' },
      { value: 'archived', label: 'Arquivado' },
    ],
  },
  {
    key: 'visibility',
    label: 'Visibilidade',
    type: 'select',
    options: [
      { value: 'visible', label: 'Visivel' },
      { value: 'hidden', label: 'Oculto' },
      { value: 'restricted', label: 'Restrito' },
    ],
  },
]

const VIDEO_FIELDS: FieldConfig[] = [
  { key: 'video_url', label: 'URL do Video', type: 'url', required: true },
  { key: 'duration', label: 'Duracao (min)', type: 'number', min: 0 },
  {
    key: 'conference_provider',
    label: 'Provedor',
    type: 'select',
    options: [
      { value: 'youtube', label: 'YouTube' },
      { value: 'vimeo', label: 'Vimeo' },
      { value: 'upload', label: 'Upload Proprio' },
    ],
  },
  { key: 'autoplay', label: 'Autoplay', type: 'toggle' },
]

const ASSESSMENT_FIELDS: FieldConfig[] = [
  { key: 'max_attempts', label: 'Tentativas Maximas', type: 'number', min: 1, max: 100 },
  { key: 'time_limit', label: 'Tempo Limite (min)', type: 'number', min: 0 },
  { key: 'randomize_questions', label: 'Randomizar Questoes', type: 'toggle' },
  { key: 'show_answers', label: 'Mostrar Respostas', type: 'toggle' },
  { key: 'passing_score', label: 'Nota Minima', type: 'number', min: 0, max: 100 },
  {
    key: 'grading_type',
    label: 'Tipo de Avaliacao',
    type: 'select',
    options: [
      { value: 'numeric', label: 'Numerica' },
      { value: 'letter', label: 'Conceito' },
      { value: 'pass_fail', label: 'Aprovado/Reprovado' },
    ],
  },
]

const LIVE_SESSION_FIELDS: FieldConfig[] = [
  { key: 'conference_url', label: 'URL da Conferencia', type: 'url', required: true },
  {
    key: 'conference_provider',
    label: 'Provedor',
    type: 'select',
    options: [
      { value: 'zoom', label: 'Zoom' },
      { value: 'meet', label: 'Google Meet' },
      { value: 'teams', label: 'Microsoft Teams' },
      { value: 'jitsi', label: 'Jitsi' },
      { value: 'other', label: 'Outro' },
    ],
  },
  { key: 'start_time', label: 'Horario de Inicio', type: 'datetime' },
  { key: 'max_participants', label: 'Max Participantes', type: 'number', min: 1 },
  { key: 'conference_duration', label: 'Duracao (min)', type: 'number', min: 0 },
]

const PRESENCIAL_FIELDS: FieldConfig[] = [
  { key: 'room', label: 'Sala', type: 'text' },
  { key: 'professor', label: 'Professor', type: 'text' },
  { key: 'max_students', label: 'Max Alunos', type: 'number', min: 1 },
  { key: 'attendance_required', label: 'Presenca Obrigatoria', type: 'toggle' },
]

const DISCUSSION_FIELDS: FieldConfig[] = [
  { key: 'due_date', label: 'Data Limite', type: 'date' },
  { key: 'min_posts', label: 'Posts Minimos', type: 'number', min: 0 },
  { key: 'min_replies', label: 'Respostas Minimas', type: 'number', min: 0 },
  { key: 'moderated', label: 'Moderado', type: 'toggle' },
]

const COMPLETION_FIELDS: FieldConfig[] = [
  {
    key: 'completion_method',
    label: 'Metodo de Conclusao',
    type: 'select',
    options: [
      { value: 'automatic', label: 'Automatico' },
      { value: 'manual', label: 'Manual' },
      { value: 'grade', label: 'Por Nota' },
      { value: 'progress', label: 'Por Progresso' },
    ],
  },
  { key: 'min_progress', label: 'Progresso Minimo (%)', type: 'number', min: 0, max: 100 },
]

// ============================================================================
// FIELD MAPPING
// ============================================================================

function getFieldsForType(componentType: string): {
  sections: { title: string; fields: FieldConfig[] }[]
} {
  const sections: { title: string; fields: FieldConfig[] }[] = [
    { title: 'Geral', fields: GENERAL_FIELDS },
  ]

  switch (componentType) {
    case 'video':
      sections.push({ title: 'Video', fields: VIDEO_FIELDS })
      break
    case 'assessment':
    case 'quiz':
      sections.push({ title: 'Avaliacao', fields: ASSESSMENT_FIELDS })
      break
    case 'live_session':
    case 'webinar':
      sections.push({ title: 'Sessao ao Vivo', fields: LIVE_SESSION_FIELDS })
      break
    case 'presencial':
    case 'aula':
      sections.push({ title: 'Presencial', fields: PRESENCIAL_FIELDS })
      break
    case 'discussion':
      sections.push({ title: 'Discussao', fields: DISCUSSION_FIELDS })
      break
    default:
      break
  }

  sections.push({ title: 'Conclusao', fields: COMPLETION_FIELDS })

  return { sections }
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function ComponentInlineEditor({
  componentId,
  componentType,
  parameters,
  onSave,
  onCancel,
}: ComponentInlineEditorProps) {
  const [form, setForm] = useState<Record<string, unknown>>({ ...parameters })
  const [errors, setErrors] = useState<FieldError>({})
  const [isSaving, setIsSaving] = useState(false)

  const { sections } = useMemo(
    () => getFieldsForType(componentType),
    [componentType],
  )

  // ---- Change handler ----
  const handleChange = useCallback((key: string, value: unknown) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }, [])

  // ---- Validation ----
  const validate = useCallback((): boolean => {
    const nextErrors: FieldError = {}
    for (const section of sections) {
      for (const field of section.fields) {
        const val = form[field.key]
        if (field.required && (val === null || val === undefined || val === '')) {
          nextErrors[field.key] = `${field.label} e obrigatorio`
        }
        if (field.type === 'number' && val !== null && val !== undefined && val !== '') {
          const num = Number(val)
          if (isNaN(num)) {
            nextErrors[field.key] = 'Valor numerico invalido'
          } else {
            if (field.min !== undefined && num < field.min) {
              nextErrors[field.key] = `Minimo: ${field.min}`
            }
            if (field.max !== undefined && num > field.max) {
              nextErrors[field.key] = `Maximo: ${field.max}`
            }
          }
        }
        if (field.type === 'url' && val && typeof val === 'string') {
          try {
            new URL(val)
          } catch {
            nextErrors[field.key] = 'URL invalida'
          }
        }
      }
    }
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }, [form, sections])

  // ---- Save ----
  const handleSave = useCallback(async () => {
    if (!validate()) return
    setIsSaving(true)
    try {
      // Build only changed fields
      const changed: Record<string, unknown> = {}
      for (const section of sections) {
        for (const field of section.fields) {
          const newVal = form[field.key]
          const oldVal = parameters[field.key]
          if (newVal !== oldVal) {
            changed[field.key] =
              field.type === 'number' && newVal !== null && newVal !== undefined && newVal !== ''
                ? Number(newVal)
                : newVal
          }
        }
      }
      await onSave(changed)
    } finally {
      setIsSaving(false)
    }
  }, [validate, form, parameters, sections, onSave])

  // ---- Cancel ----
  const handleCancel = useCallback(() => {
    setForm({ ...parameters })
    setErrors({})
    onCancel?.()
  }, [parameters, onCancel])

  // ---- Render a single field ----
  function renderField(field: FieldConfig) {
    const value = form[field.key]
    const fieldError = errors[field.key]
    const fieldId = `edit-${componentId}-${field.key}`

    switch (field.type) {
      case 'text':
      case 'url':
        return (
          <div key={field.key} className="space-y-1.5">
            <Label htmlFor={fieldId}>
              {field.label}
              {field.required && ' *'}
            </Label>
            <Input
              id={fieldId}
              type={field.type === 'url' ? 'url' : 'text'}
              value={typeof value === 'string' ? value : ''}
              onChange={(e) => handleChange(field.key, e.target.value)}
              placeholder={field.placeholder}
            />
            {fieldError && (
              <p className="text-xs text-destructive">{fieldError}</p>
            )}
          </div>
        )

      case 'number':
        return (
          <div key={field.key} className="space-y-1.5">
            <Label htmlFor={fieldId}>
              {field.label}
              {field.required && ' *'}
            </Label>
            <Input
              id={fieldId}
              type="number"
              value={value !== null && value !== undefined ? String(value) : ''}
              onChange={(e) => handleChange(field.key, e.target.value)}
              min={field.min}
              max={field.max}
            />
            {fieldError && (
              <p className="text-xs text-destructive">{fieldError}</p>
            )}
          </div>
        )

      case 'textarea':
        return (
          <div key={field.key} className="space-y-1.5">
            <Label htmlFor={fieldId}>{field.label}</Label>
            <Textarea
              id={fieldId}
              value={typeof value === 'string' ? value : ''}
              onChange={(e) => handleChange(field.key, e.target.value)}
              rows={3}
            />
            {fieldError && (
              <p className="text-xs text-destructive">{fieldError}</p>
            )}
          </div>
        )

      case 'select':
        return (
          <div key={field.key} className="space-y-1.5">
            <Label>
              {field.label}
              {field.required && ' *'}
            </Label>
            <Select
              value={typeof value === 'string' ? value : ''}
              onValueChange={(v) => handleChange(field.key, v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
              <SelectContent>
                {field.options?.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldError && (
              <p className="text-xs text-destructive">{fieldError}</p>
            )}
          </div>
        )

      case 'toggle':
        return (
          <div
            key={field.key}
            className="flex items-center justify-between rounded-md border border-border px-3 py-2.5"
          >
            <Label htmlFor={fieldId} className="cursor-pointer">
              {field.label}
            </Label>
            <Switch
              id={fieldId}
              checked={Boolean(value)}
              onCheckedChange={(v) => handleChange(field.key, v)}
            />
          </div>
        )

      case 'date':
        return (
          <div key={field.key} className="space-y-1.5">
            <Label htmlFor={fieldId}>{field.label}</Label>
            <Input
              id={fieldId}
              type="date"
              value={typeof value === 'string' ? value.slice(0, 10) : ''}
              onChange={(e) => handleChange(field.key, e.target.value)}
            />
            {fieldError && (
              <p className="text-xs text-destructive">{fieldError}</p>
            )}
          </div>
        )

      case 'datetime':
        return (
          <div key={field.key} className="space-y-1.5">
            <Label htmlFor={fieldId}>{field.label}</Label>
            <Input
              id={fieldId}
              type="datetime-local"
              value={typeof value === 'string' ? value.slice(0, 16) : ''}
              onChange={(e) => handleChange(field.key, e.target.value)}
            />
            {fieldError && (
              <p className="text-xs text-destructive">{fieldError}</p>
            )}
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="space-y-6">
      {sections.map((section, idx) => (
        <div key={section.title}>
          {idx > 0 && <Separator className="mb-4" />}
          <h4 className="text-sm font-semibold text-foreground mb-3">
            {section.title}
          </h4>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {section.fields.map((field) => renderField(field))}
          </div>
        </div>
      ))}

      {/* ---- Actions ---- */}
      <Separator />
      <div className="flex items-center justify-end gap-3">
        <Button
          variant="outline"
          onClick={handleCancel}
          disabled={isSaving}
        >
          <XCircle className="h-4 w-4 mr-1.5" />
          Cancelar
        </Button>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? (
            <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
          ) : (
            <Save className="h-4 w-4 mr-1.5" />
          )}
          Salvar Alteracoes
        </Button>
      </div>
    </div>
  )
}

export default ComponentInlineEditor
