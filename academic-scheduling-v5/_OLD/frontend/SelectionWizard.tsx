/**
 * SelectionWizard — Turma multi-picker for calendar filtering
 * Simplified: just pick turmas (no pathway/series needed for filtering)
 * Multi-select with checkboxes. Search included.
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  Button,
  Badge,
  Skeleton,
  Input,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@cogedu/ui';
import { Search, GraduationCap, X } from 'lucide-react';
import { useClassInstances } from '../hooks/useHierarchyData';

// ============================================================================
// TYPES
// ============================================================================

export interface HierarchySelection {
  companyId: string;
  classInstanceId: string;
  classInstanceName: string;
  pathwayId: string;
  seriesId: string;
}

interface SelectionWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (selection: HierarchySelection) => void;
  initialCompanyId?: string;
  /** Already selected turma IDs — shown as checked */
  alreadySelected?: string[];
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function SelectionWizard({
  isOpen,
  onClose,
  onComplete,
  initialCompanyId,
  alreadySelected = [],
}: SelectionWizardProps) {
  const companyId = initialCompanyId ?? '';
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Map<string, string>>(new Map());

  // Fetch all turmas for this company
  const {
    classInstances,
    isLoading,
    error,
  } = useClassInstances(companyId || undefined);

  // Initialize with already selected turmas
  useEffect(() => {
    if (isOpen) {
      setSearch('');
      const initial = new Map<string, string>();
      for (const ci of classInstances) {
        if (alreadySelected.includes(ci.id)) {
          initial.set(ci.id, ci.name);
        }
      }
      setSelected(initial);
    }
  }, [isOpen, classInstances, alreadySelected]);

  // Filter by search
  const filtered = useMemo(() => {
    if (!search.trim()) return classInstances;
    const q = search.toLowerCase();
    return classInstances.filter(
      (ci) =>
        ci.name.toLowerCase().includes(q) ||
        (ci.code && ci.code.toLowerCase().includes(q)) ||
        (ci.status && ci.status.toLowerCase().includes(q))
    );
  }, [classInstances, search]);

  // Toggle selection
  const toggle = useCallback((id: string, name: string) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.set(id, name);
      }
      return next;
    });
  }, []);

  // Select all visible
  const selectAll = useCallback(() => {
    setSelected((prev) => {
      const next = new Map(prev);
      for (const ci of filtered) {
        next.set(ci.id, ci.name);
      }
      return next;
    });
  }, [filtered]);

  // Clear all
  const clearAll = useCallback(() => {
    setSelected(new Map());
  }, []);

  // Confirm — emit one onComplete per selected turma
  const handleConfirm = useCallback(() => {
    for (const [id, name] of selected) {
      if (!alreadySelected.includes(id)) {
        onComplete({
          companyId,
          classInstanceId: id,
          classInstanceName: name,
          pathwayId: '',
          seriesId: '',
        });
      }
    }
    onClose();
  }, [selected, alreadySelected, companyId, onComplete, onClose]);

  // Status badge color
  const statusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-700 border-green-200';
      case 'scheduled': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'completed': return 'bg-gray-100 text-gray-500 border-gray-200';
      case 'cancelled': return 'bg-red-100 text-red-500 border-red-200';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case 'active': return 'Ativa';
      case 'scheduled': return 'Agendada';
      case 'completed': return 'Concluida';
      case 'cancelled': return 'Cancelada';
      default: return status;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5" />
            Filtrar por Turmas
          </DialogTitle>
          <DialogDescription>
            Selecione uma ou mais turmas para filtrar o calendario. Sem selecao, todos os eventos aparecem.
          </DialogDescription>
        </DialogHeader>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar turma..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Selection summary */}
        {selected.size > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">{selected.size} selecionada(s):</span>
            {Array.from(selected.entries()).slice(0, 3).map(([id, name]) => (
              <Badge key={id} variant="secondary" className="text-xs flex items-center gap-1 pl-2 pr-1">
                {name.length > 20 ? name.slice(0, 20) + '...' : name}
                <button
                  type="button"
                  onClick={() => toggle(id, name)}
                  className="rounded-full p-0.5 hover:bg-muted-foreground/20"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </Badge>
            ))}
            {selected.size > 3 && (
              <span className="text-xs text-muted-foreground">+{selected.size - 3} mais</span>
            )}
          </div>
        )}

        {/* Turma list */}
        <div className="flex-1 overflow-y-auto min-h-0 rounded-lg border border-border divide-y divide-border/50">
          {isLoading ? (
            <div className="p-4 space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : error ? (
            <div className="p-8 text-center text-sm text-destructive">
              Erro ao carregar turmas: {error.message}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {search ? 'Nenhuma turma encontrada para esta busca.' : 'Nenhuma turma cadastrada.'}
            </div>
          ) : (
            filtered.map((ci) => {
              const isChecked = selected.has(ci.id);
              const dates = ci.startDate && ci.endDate
                ? `${new Date(ci.startDate).toLocaleDateString('pt-BR')} - ${new Date(ci.endDate).toLocaleDateString('pt-BR')}`
                : null;

              return (
                <button
                  key={ci.id}
                  type="button"
                  onClick={() => toggle(ci.id, ci.name)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-all ${
                    isChecked ? 'bg-primary/5' : 'hover:bg-accent/40'
                  }`}
                >
                  {/* Checkbox */}
                  <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors ${
                    isChecked ? 'border-primary bg-primary' : 'border-muted-foreground/30'
                  }`}>
                    {isChecked && (
                      <svg className="h-3 w-3 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <span className={`block text-sm ${isChecked ? 'font-semibold text-primary' : 'font-medium'}`}>
                      {ci.name}
                    </span>
                    {dates && (
                      <span className="block text-xs text-muted-foreground mt-0.5">{dates}</span>
                    )}
                  </div>

                  {/* Status */}
                  <Badge variant="outline" className={`text-[10px] shrink-0 ${statusColor(ci.status)}`}>
                    {statusLabel(ci.status)}
                  </Badge>
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="flex items-center justify-between sm:justify-between gap-2">
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={selectAll} className="text-xs">
              Selecionar todas
            </Button>
            <Button variant="ghost" size="sm" onClick={clearAll} className="text-xs" disabled={selected.size === 0}>
              Limpar
            </Button>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={handleConfirm}>
              {selected.size === 0 ? 'Mostrar todas' : `Filtrar (${selected.size})`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
