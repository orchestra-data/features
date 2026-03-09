'use client'

/**
 * QuickActionsPopover -- SCHED-022
 * Context-menu-style popover for quick event actions.
 * Appears on right-click / long-press on calendar events.
 * Provides: change professor, change room, change time, view details, remove.
 *
 * Uses @cogedu/ui components and apiFetch (ZERO axios).
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Button,
  Input,
  Label,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Separator,
} from '@cogedu/ui'
import {
  Loader2,
  UserRound,
  DoorOpen,
  Clock,
  Eye,
  Trash2,
  AlertTriangle,
} from 'lucide-react'
import { apiFetch } from '@/client/apiClient'

// ============================================================================
// TYPES
// ============================================================================

interface QuickActionsPopoverProps {
  eventId: string
  companyId: string
  position: { x: number; y: number }
  onClose: () => void
  onAction: () => void
  onViewDetails?: (eventId: string) => void
}

interface Professor {
  id: string
  name: string
}

interface Room {
  id: string
  name: string
  resource_type: string
}

type ActiveAction =
  | null
  | 'change_professor'
  | 'change_room'
  | 'change_time'
  | 'confirm_remove'

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function QuickActionsPopover({
  eventId,
  companyId,
  position,
  onClose,
  onAction,
  onViewDetails,
}: QuickActionsPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null)
  const [activeAction, setActiveAction] = useState<ActiveAction>(null)
  const [isLoading, setIsLoading] = useState(false)

  // ---- Sub-action state ----
  const [professors, setProfessors] = useState<Professor[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [selectedProfessor, setSelectedProfessor] = useState('')
  const [selectedRoom, setSelectedRoom] = useState('')
  const [newStartTime, setNewStartTime] = useState('')
  const [newEndTime, setNewEndTime] = useState('')
  const [loadingOptions, setLoadingOptions] = useState(false)

  // ---- Click outside ----
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  // ---- Escape key ----
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // ---- Compute safe position (keep popover within viewport) ----
  const [adjustedPos, setAdjustedPos] = useState(position)
  useEffect(() => {
    if (!popoverRef.current) {
      setAdjustedPos(position)
      return
    }
    const rect = popoverRef.current.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    let x = position.x
    let y = position.y

    if (x + rect.width > vw - 8) x = vw - rect.width - 8
    if (y + rect.height > vh - 8) y = vh - rect.height - 8
    if (x < 8) x = 8
    if (y < 8) y = 8

    setAdjustedPos({ x, y })
  }, [position])

  // ---- Fetch professors ----
  const fetchProfessors = useCallback(async () => {
    setLoadingOptions(true)
    try {
      const data = await apiFetch<Professor[]>(
        `/listCompanyProfessors?companyId=${companyId}`,
      )
      setProfessors(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error('[QuickActions] Failed to fetch professors:', err)
      setProfessors([])
    } finally {
      setLoadingOptions(false)
    }
  }, [companyId])

  // ---- Fetch rooms ----
  const fetchRooms = useCallback(async () => {
    setLoadingOptions(true)
    try {
      const data = await apiFetch<Room[]>(
        `/listCompanyResources?companyId=${companyId}&resource_type=sala`,
      )
      setRooms(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error('[QuickActions] Failed to fetch rooms:', err)
      setRooms([])
    } finally {
      setLoadingOptions(false)
    }
  }, [companyId])

  // ---- Action handlers ----
  const handleChangeProfessor = useCallback(async () => {
    if (!selectedProfessor) return
    setIsLoading(true)
    try {
      await apiFetch(`/updateCompanyEvent`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: eventId,
          instructor_user_id: selectedProfessor,
        }),
      })
      onAction()
      onClose()
    } catch (err) {
      console.error('[QuickActions] Change professor failed:', err)
    } finally {
      setIsLoading(false)
    }
  }, [eventId, selectedProfessor, onAction, onClose])

  const handleChangeRoom = useCallback(async () => {
    if (!selectedRoom) return
    setIsLoading(true)
    try {
      await apiFetch(`/updateCompanyEvent`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: eventId,
          metadata: { room_id: selectedRoom },
        }),
      })
      onAction()
      onClose()
    } catch (err) {
      console.error('[QuickActions] Change room failed:', err)
    } finally {
      setIsLoading(false)
    }
  }, [eventId, selectedRoom, onAction, onClose])

  const handleChangeTime = useCallback(async () => {
    if (!newStartTime || !newEndTime) return
    setIsLoading(true)
    try {
      // We update only the time portion; the API will merge with existing date
      await apiFetch(`/updateCompanyEvent`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: eventId,
          start_datetime: newStartTime,
          end_datetime: newEndTime,
        }),
      })
      onAction()
      onClose()
    } catch (err) {
      console.error('[QuickActions] Change time failed:', err)
    } finally {
      setIsLoading(false)
    }
  }, [eventId, newStartTime, newEndTime, onAction, onClose])

  const handleRemove = useCallback(async () => {
    setIsLoading(true)
    try {
      await apiFetch(`/deleteCompanyEvent`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: eventId }),
      })
      onAction()
      onClose()
    } catch (err) {
      console.error('[QuickActions] Remove failed:', err)
    } finally {
      setIsLoading(false)
    }
  }, [eventId, onAction, onClose])

  // ---- Activate sub-action ----
  const activateAction = useCallback(
    (action: ActiveAction) => {
      setActiveAction(action)
      if (action === 'change_professor') fetchProfessors()
      if (action === 'change_room') fetchRooms()
    },
    [fetchProfessors, fetchRooms],
  )

  // ---- Render sub-panels ----
  function renderSubAction() {
    switch (activeAction) {
      case 'change_professor':
        return (
          <div className="space-y-3 p-1">
            <Label className="text-xs font-semibold">Trocar Professor</Label>
            {loadingOptions ? (
              <div className="flex items-center justify-center py-3">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : professors.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">
                Nenhum professor disponivel.
              </p>
            ) : (
              <Select
                value={selectedProfessor}
                onValueChange={setSelectedProfessor}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {professors.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="flex-1 h-7 text-xs"
                onClick={() => setActiveAction(null)}
              >
                Voltar
              </Button>
              <Button
                size="sm"
                className="flex-1 h-7 text-xs"
                onClick={handleChangeProfessor}
                disabled={!selectedProfessor || isLoading}
              >
                {isLoading && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                Confirmar
              </Button>
            </div>
          </div>
        )

      case 'change_room':
        return (
          <div className="space-y-3 p-1">
            <Label className="text-xs font-semibold">Trocar Sala</Label>
            {loadingOptions ? (
              <div className="flex items-center justify-center py-3">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : rooms.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">
                Nenhuma sala disponivel.
              </p>
            ) : (
              <Select value={selectedRoom} onValueChange={setSelectedRoom}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {rooms.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="flex-1 h-7 text-xs"
                onClick={() => setActiveAction(null)}
              >
                Voltar
              </Button>
              <Button
                size="sm"
                className="flex-1 h-7 text-xs"
                onClick={handleChangeRoom}
                disabled={!selectedRoom || isLoading}
              >
                {isLoading && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                Confirmar
              </Button>
            </div>
          </div>
        )

      case 'change_time':
        return (
          <div className="space-y-3 p-1">
            <Label className="text-xs font-semibold">Alterar Horario</Label>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Inicio</Label>
                <Input
                  type="time"
                  className="h-8 text-xs"
                  value={newStartTime}
                  onChange={(e) => setNewStartTime(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  Termino
                </Label>
                <Input
                  type="time"
                  className="h-8 text-xs"
                  value={newEndTime}
                  onChange={(e) => setNewEndTime(e.target.value)}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="flex-1 h-7 text-xs"
                onClick={() => setActiveAction(null)}
              >
                Voltar
              </Button>
              <Button
                size="sm"
                className="flex-1 h-7 text-xs"
                onClick={handleChangeTime}
                disabled={!newStartTime || !newEndTime || isLoading}
              >
                {isLoading && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                Confirmar
              </Button>
            </div>
          </div>
        )

      case 'confirm_remove':
        return (
          <div className="space-y-3 p-1">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-xs font-semibold">Confirmar Remocao</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Esta acao ira remover o evento permanentemente. Deseja continuar?
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="flex-1 h-7 text-xs"
                onClick={() => setActiveAction(null)}
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="flex-1 h-7 text-xs"
                onClick={handleRemove}
                disabled={isLoading}
              >
                {isLoading && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                Remover
              </Button>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <>
      {/* Invisible backdrop for click-outside (handled by mousedown listener) */}
      <div className="fixed inset-0 z-[60]" aria-hidden="true" />

      {/* Popover */}
      <div
        ref={popoverRef}
        role="menu"
        aria-label="Acoes rapidas do evento"
        className="fixed z-[61] w-56 rounded-lg border border-border bg-popover shadow-lg animate-in fade-in-0 zoom-in-95"
        style={{ left: adjustedPos.x, top: adjustedPos.y }}
      >
        <div className="p-2">
          {activeAction ? (
            renderSubAction()
          ) : (
            <div className="flex flex-col gap-0.5">
              {/* Trocar Professor */}
              <button
                type="button"
                className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-foreground transition-colors hover:bg-muted/80 w-full text-left"
                onClick={() => activateAction('change_professor')}
              >
                <UserRound className="h-4 w-4 text-muted-foreground" />
                Trocar Professor
              </button>

              {/* Trocar Sala */}
              <button
                type="button"
                className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-foreground transition-colors hover:bg-muted/80 w-full text-left"
                onClick={() => activateAction('change_room')}
              >
                <DoorOpen className="h-4 w-4 text-muted-foreground" />
                Trocar Sala
              </button>

              {/* Alterar Horario */}
              <button
                type="button"
                className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-foreground transition-colors hover:bg-muted/80 w-full text-left"
                onClick={() => activateAction('change_time')}
              >
                <Clock className="h-4 w-4 text-muted-foreground" />
                Alterar Horario
              </button>

              {/* Ver Detalhes */}
              <button
                type="button"
                className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-foreground transition-colors hover:bg-muted/80 w-full text-left"
                onClick={() => {
                  onViewDetails?.(eventId)
                  onClose()
                }}
              >
                <Eye className="h-4 w-4 text-muted-foreground" />
                Ver Detalhes
              </button>

              <Separator className="my-1" />

              {/* Remover */}
              <button
                type="button"
                className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10 w-full text-left"
                onClick={() => activateAction('confirm_remove')}
              >
                <Trash2 className="h-4 w-4" />
                Remover
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

export default QuickActionsPopover
