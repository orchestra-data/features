/**
 * SelectionWizard — 4-step hierarchy picker for academic scheduling
 * SCHED-012: Company > Class Instance > Pathway > Series
 *
 * Opens as a Dialog modal. Uses @cogedu/ui components, TailwindCSS v4, zero axios.
 */

import { useState, useCallback } from 'react';
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  Badge,
  Skeleton,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@cogedu/ui';
import {
  useCompanies,
  useClassInstances,
  usePathways,
  useSeries,
} from '../hooks/useHierarchyData';

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
}

interface StepConfig {
  number: number;
  label: string;
  description: string;
}

const STEPS: StepConfig[] = [
  { number: 1, label: 'Instituicao', description: 'Selecione a instituicao' },
  { number: 2, label: 'Turma', description: 'Selecione a turma' },
  { number: 3, label: 'Trilha', description: 'Selecione a trilha de aprendizagem' },
  { number: 4, label: 'Disciplina', description: 'Selecione a disciplina' },
];

// ============================================================================
// STEP INDICATOR
// ============================================================================

function StepIndicator({
  steps,
  currentStep,
}: {
  steps: StepConfig[];
  currentStep: number;
}) {
  return (
    <div className="flex items-center gap-2">
      {steps.map((step, index) => {
        const isActive = step.number === currentStep;
        const isCompleted = step.number < currentStep;

        return (
          <div key={step.number} className="flex items-center gap-2">
            {index > 0 && (
              <div
                className={`h-px w-8 ${
                  isCompleted ? 'bg-primary' : 'bg-muted'
                }`}
              />
            )}
            <div className="flex items-center gap-2">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : isCompleted
                      ? 'bg-primary/20 text-primary'
                      : 'bg-muted text-muted-foreground'
                }`}
              >
                {isCompleted ? (
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  step.number
                )}
              </div>
              <span
                className={`text-sm hidden sm:inline ${
                  isActive
                    ? 'font-semibold text-foreground'
                    : isCompleted
                      ? 'text-primary'
                      : 'text-muted-foreground'
                }`}
              >
                {step.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// LOADING SKELETON
// ============================================================================

function CardListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="p-4">
          <div className="space-y-3">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        </Card>
      ))}
    </div>
  );
}

// ============================================================================
// SELECTABLE CARD
// ============================================================================

function SelectableCard({
  title,
  subtitle,
  badge,
  isSelected,
  onClick,
}: {
  title: string;
  subtitle?: string | null;
  badge?: string | null;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <Card
      className={`cursor-pointer transition-all hover:shadow-md ${
        isSelected
          ? 'outline outline-2 outline-primary'
          : 'hover:outline hover:outline-1 hover:outline-primary/30'
      }`}
      style={isSelected ? { background: 'var(--color-primary-50, rgba(59, 130, 246, 0.08))', borderColor: 'var(--color-primary, hsl(var(--primary)))' } : undefined}
      onClick={onClick}
    >
      <CardHeader className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base truncate">{title}</CardTitle>
            {subtitle && (
              <CardDescription className="mt-1 truncate">{subtitle}</CardDescription>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {badge && (
              <Badge variant="secondary" className="text-xs">
                {badge}
              </Badge>
            )}
            {isSelected && (
              <svg className="h-5 w-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
        </div>
      </CardHeader>
    </Card>
  );
}

// ============================================================================
// EMPTY STATE
// ============================================================================

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <svg
        className="h-12 w-12 text-muted-foreground/50 mb-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
        />
      </svg>
      <span className="text-sm text-muted-foreground">{message}</span>
    </div>
  );
}

// ============================================================================
// ERROR STATE
// ============================================================================

function ErrorState({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <span className="text-sm text-destructive mb-2">Erro ao carregar dados</span>
      <span className="text-xs text-muted-foreground mb-4">{error.message}</span>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Tentar novamente
        </Button>
      )}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function SelectionWizard({ isOpen, onClose, onComplete, initialCompanyId }: SelectionWizardProps) {
  const [currentStep, setCurrentStep] = useState(initialCompanyId ? 2 : 1);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | undefined>(
    initialCompanyId
  );
  const [selectedClassInstanceId, setSelectedClassInstanceId] = useState<string | undefined>();
  const [selectedClassInstanceName, setSelectedClassInstanceName] = useState<string>('');
  const [selectedPathwayId, setSelectedPathwayId] = useState<string | undefined>();
  const [selectedSeriesId, setSelectedSeriesId] = useState<string | undefined>();

  // Data hooks
  const { companies, isLoading: companiesLoading, error: companiesError } = useCompanies();
  const {
    classInstances,
    isLoading: classInstancesLoading,
    error: classInstancesError,
  } = useClassInstances(selectedCompanyId);
  const {
    pathways,
    isLoading: pathwaysLoading,
    error: pathwaysError,
  } = usePathways(selectedClassInstanceId);
  const {
    series,
    isLoading: seriesLoading,
    error: seriesError,
  } = useSeries(selectedPathwayId);

  // Navigation
  const canGoNext =
    (currentStep === 1 && !!selectedCompanyId) ||
    (currentStep === 2 && !!selectedClassInstanceId) ||
    (currentStep === 3 && !!selectedPathwayId) ||
    (currentStep === 4 && !!selectedSeriesId);

  const handleNext = useCallback(() => {
    if (currentStep === 4 && selectedCompanyId && selectedClassInstanceId && selectedPathwayId && selectedSeriesId) {
      onComplete({
        companyId: selectedCompanyId,
        classInstanceId: selectedClassInstanceId,
        classInstanceName: selectedClassInstanceName,
        pathwayId: selectedPathwayId,
        seriesId: selectedSeriesId,
      });
      return;
    }
    setCurrentStep((s) => Math.min(s + 1, 4));
  }, [currentStep, selectedCompanyId, selectedClassInstanceId, selectedClassInstanceName, selectedPathwayId, selectedSeriesId, onComplete]);

  const handleBack = useCallback(() => {
    if (currentStep === 4) {
      setSelectedSeriesId(undefined);
    } else if (currentStep === 3) {
      setSelectedPathwayId(undefined);
      setSelectedSeriesId(undefined);
    } else if (currentStep === 2) {
      setSelectedClassInstanceId(undefined);
      setSelectedPathwayId(undefined);
      setSelectedSeriesId(undefined);
    }
    setCurrentStep((s) => Math.max(s - 1, 1));
  }, [currentStep]);

  // ============================================================================
  // RENDER STEPS
  // ============================================================================

  const renderStepContent = () => {
    switch (currentStep) {
      case 1: {
        if (companiesLoading) return <CardListSkeleton />;
        if (companiesError) return <ErrorState error={companiesError} />;
        if (companies.length === 0)
          return <EmptyState message="Nenhuma instituicao encontrada" />;

        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {companies.map((company) => (
              <SelectableCard
                key={company.id}
                title={company.displayName || company.legalName}
                subtitle={company.institutionalType}
                badge={company.isActive ? null : 'Inativa'}
                isSelected={selectedCompanyId === company.id}
                onClick={() => {
                  setSelectedCompanyId(company.id);
                  setSelectedClassInstanceId(undefined);
                  setSelectedPathwayId(undefined);
                  setSelectedSeriesId(undefined);
                }}
              />
            ))}
          </div>
        );
      }

      case 2: {
        if (classInstancesLoading) return <CardListSkeleton />;
        if (classInstancesError) return <ErrorState error={classInstancesError} />;
        if (classInstances.length === 0)
          return <EmptyState message="Nenhuma turma encontrada para esta instituicao" />;

        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {classInstances.map((ci) => (
              <SelectableCard
                key={ci.id}
                title={ci.name}
                subtitle={`${ci.code} - ${ci.institution}`}
                badge={ci.status}
                isSelected={selectedClassInstanceId === ci.id}
                onClick={() => {
                  setSelectedClassInstanceId(ci.id);
                  setSelectedClassInstanceName(ci.name);
                  setSelectedPathwayId(undefined);
                  setSelectedSeriesId(undefined);
                }}
              />
            ))}
          </div>
        );
      }

      case 3: {
        if (pathwaysLoading) return <CardListSkeleton />;
        if (pathwaysError) return <ErrorState error={pathwaysError} />;
        if (pathways.length === 0)
          return <EmptyState message="Nenhuma trilha encontrada para esta turma" />;

        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {pathways.map((pathway) => (
              <SelectableCard
                key={pathway.id}
                title={pathway.title}
                subtitle={pathway.objective}
                badge={pathway.status}
                isSelected={selectedPathwayId === pathway.id}
                onClick={() => {
                  setSelectedPathwayId(pathway.id);
                  setSelectedSeriesId(undefined);
                }}
              />
            ))}
          </div>
        );
      }

      case 4: {
        if (seriesLoading) return <CardListSkeleton />;
        if (seriesError) return <ErrorState error={seriesError} />;
        if (series.length === 0)
          return <EmptyState message="Nenhuma disciplina encontrada para esta trilha" />;

        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {series.map((s) => (
              <SelectableCard
                key={s.id}
                title={s.title}
                subtitle={s.code ? `Codigo: ${s.code}` : s.objective}
                isSelected={selectedSeriesId === s.id}
                onClick={() => setSelectedSeriesId(s.id)}
              />
            ))}
          </div>
        );
      }

      default:
        return null;
    }
  };

  const currentStepConfig = STEPS[currentStep - 1];

  return (
    <Dialog open={isOpen} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Selecionar Turma</DialogTitle>
          <DialogDescription>
            Navegue pela hierarquia para selecionar a turma e disciplina
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-6 py-4">
          {/* Step Indicator */}
          <StepIndicator steps={STEPS} currentStep={currentStep} />

          {/* Step Header */}
          <div>
            <h3 className="text-base font-semibold text-foreground">
              {currentStepConfig.label}
            </h3>
            <span className="text-sm text-muted-foreground">
              {currentStepConfig.description}
            </span>
          </div>

          {/* Step Content */}
          <div className="min-h-[200px]">{renderStepContent()}</div>
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between gap-2">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={currentStep === 1}
          >
            Voltar
          </Button>
          <span className="text-sm text-muted-foreground">
            Passo {currentStep} de {STEPS.length}
          </span>
          <Button onClick={handleNext} disabled={!canGoNext}>
            {currentStep === 4 ? 'Confirmar' : 'Proximo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
