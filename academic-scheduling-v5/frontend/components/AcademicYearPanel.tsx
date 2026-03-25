/**
 * AcademicYearPanel — Panel below the calendar for Ano Letivo + Holidays + MEC Compliance
 * Uses existing academic_calendar + academic_year + company_blocked_day tables
 */

import { useEffect, useState } from 'react';
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  Skeleton,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Input,
  Label,
} from '@cogedu/ui';
import {
  CalendarDays,
  Plus,
  GraduationCap,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Download,
  Pencil,
  Check,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useAcademicYears,
  useAcademicYearStats,
  useAcademicYearHolidays,
  useCreateAcademicYear,
  useDeleteAcademicYear,
  useCreateHoliday,
  useUpdateHoliday,
  useDeleteHoliday,
  useSyncHolidays,
  downloadCalendarICS,
  exportToGoogleCalendar,
  openMECReport,
  type AcademicCalendar,
  type AcademicYearStats,
  type AcademicHoliday,
} from '../hooks/useAcademicYear';

// ============================================================================
// TYPES
// ============================================================================

interface AcademicYearPanelProps {
  companyId: string;
  onYearSelect?: (startDate: string) => void;
  onHolidaysChange?: (holidays: { date: string; reason: string }[]) => void;
}

// ============================================================================
// HELPERS
// ============================================================================

function ComplianceIcon({ status }: { status: string }) {
  if (status === 'compliant') return <CheckCircle2 className="h-5 w-5 text-green-500" />;
  if (status === 'warning') return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
  return <XCircle className="h-5 w-5 text-red-500" />;
}

function ComplianceLabel({ status }: { status: string }) {
  if (status === 'compliant') return <span className="text-green-600 font-medium">Conforme</span>;
  if (status === 'warning') return <span className="text-yellow-600 font-medium">Atencao</span>;
  return <span className="text-red-600 font-medium">Critico</span>;
}

function ProgressBar({ percent, color }: { percent: number; color: string }) {
  return (
    <div className="h-2 w-full rounded-full bg-muted">
      <div
        className={`h-2 rounded-full transition-all ${color}`}
        style={{ width: `${Math.min(percent, 100)}%` }}
      />
    </div>
  );
}

function getProgressColor(percent: number, met: boolean): string {
  if (met) return 'bg-green-500';
  if (percent >= 80) return 'bg-yellow-500';
  return 'bg-red-500';
}

function formatDate(dateStr: string): string {
  const clean = dateStr.substring(0, 10);
  return new Date(clean + 'T12:00:00').toLocaleDateString('pt-BR');
}

// ============================================================================
// STATS CARDS
// ============================================================================

function StatsCards({ data }: { data: AcademicYearStats }) {
  const { stats, compliance, holidays } = data;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Dias Letivos */}
      <Card>
        <CardHeader className="p-4 pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Dias Letivos
            </CardTitle>
            <ComplianceIcon status={compliance.schoolDays.met ? 'compliant' : 'critical'} />
          </div>
          <div className="mt-2">
            <span className="text-2xl font-bold">{compliance.schoolDays.current}</span>
            <span className="text-sm text-muted-foreground"> / {compliance.schoolDays.target}</span>
          </div>
          <ProgressBar
            percent={compliance.schoolDays.percent}
            color={getProgressColor(compliance.schoolDays.percent, compliance.schoolDays.met)}
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>{holidays.total} feriado(s)</span>
            <span>{compliance.schoolDays.percent}%</span>
          </div>
          {stats.makeupDays > 0 && (
            <div className="text-xs text-muted-foreground mt-1">
              {stats.makeupDays} dia(s) de reposicao
            </div>
          )}
        </CardHeader>
      </Card>

      {/* Carga Horaria */}
      <Card>
        <CardHeader className="p-4 pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Carga Horaria
            </CardTitle>
            <ComplianceIcon status={compliance.hours.met ? 'compliant' : 'critical'} />
          </div>
          <div className="mt-2">
            <span className="text-2xl font-bold">{compliance.hours.current}h</span>
            <span className="text-sm text-muted-foreground"> / {compliance.hours.target}h</span>
          </div>
          <ProgressBar
            percent={compliance.hours.percent}
            color={getProgressColor(compliance.hours.percent, compliance.hours.met)}
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>{stats.scheduledClasses} aula(s) agendada(s)</span>
            <span>{compliance.hours.percent}%</span>
          </div>
          {stats.eventsOnHolidays > 0 && (
            <div className="flex items-center gap-1 text-xs text-yellow-600 mt-1">
              <AlertTriangle className="h-3 w-3" />
              {stats.eventsOnHolidays} evento(s) em feriado
            </div>
          )}
        </CardHeader>
      </Card>

      {/* Compliance MEC */}
      <Card>
        <CardHeader className="p-4 pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Compliance MEC
            </CardTitle>
            <ComplianceIcon status={compliance.status} />
          </div>
          <div className="mt-2 flex items-center gap-2">
            <ComplianceLabel status={compliance.status} />
            <span className="text-xs text-muted-foreground">LDB Art. 24</span>
          </div>
          <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
            <div className="flex justify-between">
              <span>Dias uteis no periodo</span>
              <span className="font-medium text-foreground">{stats.totalBusinessDays}</span>
            </div>
            <div className="flex justify-between">
              <span>Dias letivos efetivos</span>
              <span className="font-medium text-foreground">{stats.instructionalDays}</span>
            </div>
            {compliance.lastAudit && (
              <div className="pt-1 border-t">
                <span className="text-[10px]">
                  Ultima auditoria:{' '}
                  {new Date(compliance.lastAudit.validatedAt).toLocaleDateString('pt-BR')}
                </span>
              </div>
            )}
          </div>
        </CardHeader>
      </Card>
    </div>
  );
}

// ============================================================================
// HOLIDAY LIST
// ============================================================================

function HolidayRow({
  holiday,
  onUpdate,
  onDelete,
  isUpdating,
  isDeleting,
}: {
  holiday: AcademicHoliday;
  onUpdate: (id: string, data: { blockedDate?: string; reason?: string }) => void;
  onDelete: (id: string) => void;
  isUpdating: boolean;
  isDeleting: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [editDate, setEditDate] = useState(holiday.date);
  const [editReason, setEditReason] = useState(holiday.reason || '');

  const handleSave = () => {
    const changes: { blockedDate?: string; reason?: string } = {};
    if (editDate !== holiday.date) changes.blockedDate = editDate;
    if (editReason !== (holiday.reason || '')) changes.reason = editReason;
    if (Object.keys(changes).length > 0) {
      onUpdate(holiday.id, changes);
    }
    setEditing(false);
  };

  const handleCancel = () => {
    setEditDate(holiday.date);
    setEditReason(holiday.reason || '');
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-2 text-xs py-1.5 px-2 rounded bg-muted/50">
        <Input
          type="date"
          value={editDate}
          onChange={(e) => setEditDate(e.target.value)}
          className="h-7 text-xs w-36"
        />
        <Input
          type="text"
          value={editReason}
          onChange={(e) => setEditReason(e.target.value)}
          className="h-7 text-xs flex-1"
          placeholder="Motivo"
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={isUpdating}
          className="text-green-600 hover:text-green-700 p-0.5"
          title="Salvar"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={handleCancel}
          className="text-muted-foreground hover:text-foreground p-0.5"
          title="Cancelar"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between text-xs py-1.5 px-2 rounded hover:bg-muted/50 group">
      <div className="flex items-center gap-2">
        <span className="font-medium text-foreground w-20">
          {formatDate(holiday.date)}
        </span>
        <span className="text-muted-foreground">{holiday.reason || '—'}</span>
      </div>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-muted-foreground hover:text-foreground p-0.5"
          title="Editar feriado"
        >
          <Pencil className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={() => onDelete(holiday.id)}
          disabled={isDeleting}
          className="text-red-400 hover:text-red-600 p-0.5"
          title="Remover feriado"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function HolidaySection({
  companyId,
  calendarId,
  year,
  onHolidaysChange,
}: {
  companyId: string;
  calendarId: string;
  year: number | null;
  onHolidaysChange?: (holidays: { date: string; reason: string }[]) => void;
}) {
  const { holidays, isLoading } = useAcademicYearHolidays(companyId, calendarId);

  // Emit holidays to parent for calendar rendering
  useEffect(() => {
    if (onHolidaysChange && holidays) {
      onHolidaysChange(holidays.map((h) => ({ date: h.date, reason: h.reason || 'Feriado' })));
    }
  }, [holidays, onHolidaysChange]);
  const deleteMutation = useDeleteHoliday(companyId, calendarId);
  const createMutation = useCreateHoliday(companyId, calendarId);
  const updateMutation = useUpdateHoliday(companyId, calendarId);
  const syncMutation = useSyncHolidays(companyId, calendarId);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [newReason, setNewReason] = useState('');

  const handleSync = async () => {
    if (!year) return;
    try {
      const result = await syncMutation.mutateAsync({ year });
      toast.success(`Feriados sincronizados: ${result.created} novo(s), ${result.skipped} existente(s)`);
    } catch (err: any) {
      toast.error('Erro ao sincronizar feriados', { description: err.message });
    }
  };

  const handleAdd = async () => {
    if (!newDate) return;
    try {
      await createMutation.mutateAsync({ blockedDate: newDate, reason: newReason || 'Feriado' });
      toast.success('Feriado adicionado');
      setNewDate('');
      setNewReason('');
      setShowAddForm(false);
    } catch (err: any) {
      toast.error('Erro ao adicionar feriado', { description: err.message });
    }
  };

  const handleUpdate = async (id: string, data: { blockedDate?: string; reason?: string }) => {
    try {
      await updateMutation.mutateAsync({ id, ...data });
      toast.success('Feriado atualizado');
    } catch (err: any) {
      toast.error('Erro ao atualizar feriado', { description: err.message });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMutation.mutateAsync(id);
      toast.success('Feriado removido');
    } catch (err: any) {
      toast.error('Erro ao remover feriado', { description: err.message });
    }
  };

  if (isLoading) {
    return <Skeleton className="h-24" />;
  }

  return (
    <Card>
      <CardHeader className="p-4 pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Feriados e Dias Nao Letivos ({holidays.length})
          </CardTitle>
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSync}
              disabled={syncMutation.isPending || !year}
              title="Sincronizar feriados nacionais (BrasilAPI)"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
              <span className="ml-1 text-xs">Sincronizar</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAddForm(!showAddForm)}
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="ml-1 text-xs">Adicionar</span>
            </Button>
          </div>
        </div>

        {/* Add form */}
        {showAddForm && (
          <div className="flex items-end gap-2 mt-3 pt-3 border-t">
            <div className="flex-1">
              <Label htmlFor="hol-date" className="text-xs">Data</Label>
              <Input
                id="hol-date"
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="flex-1">
              <Label htmlFor="hol-reason" className="text-xs">Motivo</Label>
              <Input
                id="hol-reason"
                type="text"
                placeholder="Ex: Carnaval"
                value={newReason}
                onChange={(e) => setNewReason(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <Button
              size="sm"
              onClick={handleAdd}
              disabled={!newDate || createMutation.isPending}
              className="h-8"
            >
              {createMutation.isPending ? '...' : 'Salvar'}
            </Button>
          </div>
        )}

        {/* Holiday list */}
        {holidays.length === 0 ? (
          <div className="text-xs text-muted-foreground mt-3 text-center py-3">
            Nenhum feriado definido. Use "Sincronizar" para importar feriados nacionais.
          </div>
        ) : (
          <div className="mt-3 space-y-1 max-h-48 overflow-y-auto">
            {holidays.map((h) => (
              <HolidayRow
                key={h.id}
                holiday={h}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
                isUpdating={updateMutation.isPending}
                isDeleting={deleteMutation.isPending}
              />
            ))}
          </div>
        )}
      </CardHeader>
    </Card>
  );
}

// ============================================================================
// CREATE MODAL
// ============================================================================

function formatCep(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

const CEP_TO_STATE: Record<string, string> = {
  '01': 'SP', '02': 'SP', '03': 'SP', '04': 'SP', '05': 'SP',
  '06': 'SP', '07': 'SP', '08': 'SP', '09': 'SP',
  '20': 'RJ', '21': 'RJ', '22': 'RJ', '23': 'RJ', '24': 'RJ',
  '25': 'RJ', '26': 'RJ', '27': 'RJ', '28': 'RJ',
  '29': 'ES',
  '30': 'MG', '31': 'MG', '32': 'MG', '33': 'MG', '34': 'MG',
  '35': 'MG', '36': 'MG', '37': 'MG', '38': 'MG', '39': 'MG',
  '40': 'BA', '41': 'BA', '42': 'BA', '43': 'BA', '44': 'BA',
  '45': 'BA', '46': 'BA', '47': 'BA', '48': 'BA',
  '49': 'SE',
  '50': 'PE', '51': 'PE', '52': 'PE', '53': 'PE', '54': 'PE',
  '55': 'PE', '56': 'PE',
  '57': 'AL', '58': 'PB', '59': 'RN',
  '60': 'CE', '61': 'CE', '62': 'CE', '63': 'CE',
  '64': 'PI', '65': 'MA',
  '66': 'PA', '67': 'PA', '68': 'PA',
  '69': 'AM',
  '70': 'DF', '71': 'DF', '72': 'DF', '73': 'DF',
  '74': 'GO', '75': 'GO', '76': 'GO',
  '77': 'TO', '78': 'MT', '79': 'MS',
  '80': 'PR', '81': 'PR', '82': 'PR', '83': 'PR', '84': 'PR',
  '85': 'PR', '86': 'PR', '87': 'PR',
  '88': 'SC', '89': 'SC',
  '90': 'RS', '91': 'RS', '92': 'RS', '93': 'RS', '94': 'RS',
  '95': 'RS', '96': 'RS', '97': 'RS', '98': 'RS', '99': 'RS',
};

function getStateFromCep(cep: string): string | null {
  const digits = cep.replace(/\D/g, '');
  if (digits.length < 2) return null;
  return CEP_TO_STATE[digits.slice(0, 2)] ?? null;
}

function CreateAcademicYearModal({
  isOpen,
  onClose,
  companyId,
  existingYears,
}: {
  isOpen: boolean;
  onClose: () => void;
  companyId: string;
  existingYears: number[];
}) {
  const currentYear = new Date().getFullYear();
  const nextYear = existingYears.length > 0
    ? Math.max(...existingYears) + 1
    : currentYear;

  const [year, setYear] = useState(String(nextYear));
  const [startDate, setStartDate] = useState(`${nextYear}-02-03`);
  const [endDate, setEndDate] = useState(`${nextYear}-12-18`);
  const [cep, setCep] = useState('');
  const [syncingHolidays, setSyncingHolidays] = useState(false);

  const detectedState = getStateFromCep(cep);

  const handleYearChange = (val: string) => {
    setYear(val);
    const y = parseInt(val, 10);
    if (y >= 2000 && y <= 2100) {
      setStartDate(`${y}-02-03`);
      setEndDate(`${y}-12-18`);
    }
  };

  const createMutation = useCreateAcademicYear(companyId);
  const syncMutation = useSyncHolidays(companyId, undefined);

  const handleSubmit = async () => {
    if (!startDate || !endDate) return;
    const y = parseInt(year, 10);

    try {
      await createMutation.mutateAsync({
        title: `Ano Letivo ${y}`,
        year: y,
        startDate,
        endDate,
        academicRegime: 'semestral',
        mecComplianceEnabled: true,
      });

      // Auto-sync holidays after creation
      setSyncingHolidays(true);
      try {
        const cepDigits = cep.replace(/\D/g, '');
        const result = await syncMutation.mutateAsync({
          year: y,
          cep: cepDigits.length >= 2 ? cepDigits : undefined,
        });
        toast.success(
          `Ano Letivo ${y} criado com ${result.created} feriado(s) importado(s)`,
        );
      } catch {
        // Sync failure is non-critical
        toast.success(`Ano Letivo ${y} criado (feriados podem ser sincronizados depois)`);
      } finally {
        setSyncingHolidays(false);
      }

      onClose();
    } catch (err: any) {
      toast.error('Erro ao criar ano letivo', { description: err.message });
    }
  };

  const isPending = createMutation.isPending || syncingHolidays;

  return (
    <Dialog open={isOpen} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Novo Ano Letivo</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-4">
          <div>
            <Label htmlFor="ay-year">Ano</Label>
            <Input
              id="ay-year"
              type="number"
              value={year}
              onChange={(e) => handleYearChange(e.target.value)}
            />
            {existingYears.length > 0 && (
              <span className="text-xs text-muted-foreground mt-1 block">
                Anos existentes: {existingYears.sort().join(', ')}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="ay-start">Inicio</Label>
              <Input
                id="ay-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="ay-end">Fim</Label>
              <Input
                id="ay-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          {/* CEP para feriados */}
          <div>
            <Label htmlFor="ay-cep">CEP (para feriados estaduais)</Label>
            <Input
              id="ay-cep"
              type="text"
              placeholder="00000-000"
              value={cep}
              onChange={(e) => setCep(formatCep(e.target.value))}
              maxLength={9}
            />
            <span className="text-xs text-muted-foreground mt-1 block">
              {detectedState
                ? `Estado detectado: ${detectedState} — feriados nacionais + estaduais serao importados`
                : 'Informe o CEP da escola para incluir feriados estaduais. Sem CEP, apenas feriados nacionais.'}
            </span>
          </div>

          <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
            <div className="flex justify-between">
              <span>Min. dias letivos (LDB)</span>
              <span className="font-medium">200 dias</span>
            </div>
            <div className="flex justify-between">
              <span>Min. carga horaria (LDB)</span>
              <span className="font-medium">800 horas</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!startDate || !endDate || isPending}
          >
            {isPending
              ? syncingHolidays ? 'Importando feriados...' : 'Criando...'
              : 'Criar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// DELETE CONFIRM MODAL
// ============================================================================

function DeleteConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  yearTitle,
  isPending,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  yearTitle: string;
  isPending: boolean;
}) {
  return (
    <Dialog open={isOpen} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Excluir Ano Letivo</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground py-4">
          Tem certeza que deseja excluir <strong>{yearTitle}</strong>?
          Esta acao nao pode ser desfeita.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isPending}
          >
            {isPending ? 'Excluindo...' : 'Excluir'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// YEAR TABS
// ============================================================================

function YearTabs({
  calendars,
  selectedId,
  onSelect,
  onDelete,
}: {
  calendars: AcademicCalendar[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  onDelete: (cal: AcademicCalendar) => void;
}) {
  if (calendars.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5">
      {calendars.map((c) => {
        const isSelected = c.id === selectedId;
        return (
          <div key={c.id} className="relative group">
            <button
              type="button"
              onClick={() => onSelect(c.id)}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                isSelected
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {c.year ?? c.title}
            </button>
            {isSelected && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(c);
                }}
                className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                title="Excluir ano letivo"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// EXPORT MENU
// ============================================================================

function ExportMenu({
  companyId,
  calendarId,
  calendar,
}: {
  companyId: string;
  calendarId: string;
  calendar: AcademicCalendar;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);

  // Ensure dates are YYYY-MM-DD (API may return ISO timestamps)
  const toDateOnly = (d: string) => d.substring(0, 10);
  const start = toDateOnly(calendar.startDate ?? `${calendar.year}-01-01`);
  const end = toDateOnly(calendar.endDate ?? `${calendar.year}-12-31`);

  const runExport = async (key: string, fn: () => Promise<void>) => {
    setLoading(key);
    try {
      await fn();
      setOpen(false);
    } catch (err: any) {
      toast.error('Erro na exportacao', { description: err.message });
    } finally {
      setLoading(null);
    }
  };

  const handleICalDownload = () =>
    runExport('ical', () => downloadCalendarICS(companyId, start, end));

  const handleGoogleCalendar = () =>
    runExport('google', () => exportToGoogleCalendar(companyId, start, end));

  const handleOutlookDownload = () =>
    runExport('outlook', () => downloadCalendarICS(companyId, start, end));

  const handleMECReport = () =>
    runExport('mec', () => openMECReport(companyId, calendarId));

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(!open)}
        disabled={!!loading}
      >
        <Download className="h-4 w-4 mr-1" />
        {loading ? 'Exportando...' : 'Exportar'}
      </Button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          {/* Dropdown — opens UPWARD */}
          <div className="absolute right-0 bottom-full mb-1 z-50 w-72 rounded-lg border bg-white shadow-lg py-1">
            <button
              type="button"
              onClick={handleICalDownload}
              disabled={loading === 'ical'}
              className="w-full text-left px-4 py-2.5 text-sm hover:bg-muted/50 transition-colors disabled:opacity-50"
            >
              <div className="font-medium">
                {loading === 'ical' ? 'Baixando...' : 'iCalendar (.ics)'}
              </div>
              <div className="text-xs text-muted-foreground">
                Apple Calendar, Thunderbird, apps de calendario
              </div>
            </button>

            <button
              type="button"
              onClick={handleGoogleCalendar}
              disabled={loading === 'google'}
              className="w-full text-left px-4 py-2.5 text-sm hover:bg-muted/50 transition-colors disabled:opacity-50"
            >
              <div className="font-medium">
                {loading === 'google' ? 'Preparando...' : 'Google Calendar'}
              </div>
              <div className="text-xs text-muted-foreground">
                Baixa .ics e abre a pagina de importacao do Google
              </div>
            </button>

            <button
              type="button"
              onClick={handleOutlookDownload}
              disabled={loading === 'outlook'}
              className="w-full text-left px-4 py-2.5 text-sm hover:bg-muted/50 transition-colors disabled:opacity-50"
            >
              <div className="font-medium">
                {loading === 'outlook' ? 'Baixando...' : 'Microsoft Outlook'}
              </div>
              <div className="text-xs text-muted-foreground">
                Arquivo .ics compativel com Outlook e Office 365
              </div>
            </button>

            <div className="border-t my-1" />

            <button
              type="button"
              onClick={handleMECReport}
              disabled={loading === 'mec'}
              className="w-full text-left px-4 py-2.5 text-sm hover:bg-muted/50 transition-colors disabled:opacity-50"
            >
              <div className="font-medium">
                {loading === 'mec' ? 'Gerando...' : 'Relatorio Compliance MEC'}
              </div>
              <div className="text-xs text-muted-foreground">
                LDB Art. 24 — dias letivos, carga horaria, feriados (PDF)
              </div>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// MAIN PANEL
// ============================================================================

export function AcademicYearPanel({ companyId, onYearSelect, onHolidaysChange }: AcademicYearPanelProps) {
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AcademicCalendar | null>(null);
  const { calendars, isLoading } = useAcademicYears(companyId);

  const currentYear = new Date().getFullYear();

  // Default to current year (2026), or first published, or first available
  const defaultCalendar =
    calendars.find((c) => c.year === currentYear) ??
    calendars.find((c) => c.status === 'published') ??
    calendars[0];

  const [selectedCalendarId, setSelectedCalendarId] = useState<string | undefined>(undefined);
  const effectiveCalendarId = selectedCalendarId ?? defaultCalendar?.id;
  const selectedCalendar = calendars.find((c) => c.id === effectiveCalendarId);

  const { stats, isLoading: statsLoading } = useAcademicYearStats(companyId, effectiveCalendarId);
  const deleteMutation = useDeleteAcademicYear(companyId);

  // When year tab is selected, navigate the FullCalendar to that year
  const handleYearSelect = (calendarId: string) => {
    setSelectedCalendarId(calendarId);
    const cal = calendars.find((c) => c.id === calendarId);
    if (cal?.startDate && onYearSelect) {
      onYearSelect(cal.startDate.substring(0, 10));
    } else if (cal?.year && onYearSelect) {
      onYearSelect(`${cal.year}-02-01`);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      toast.success(`${deleteTarget.title} excluido`);
      setDeleteTarget(null);
      // If we deleted the selected one, reset
      if (deleteTarget.id === effectiveCalendarId) {
        setSelectedCalendarId(undefined);
      }
    } catch (err: any) {
      toast.error('Erro ao excluir ano letivo', { description: err.message });
    }
  };

  if (isLoading) {
    return (
      <Card className="p-4">
        <div className="space-y-3">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-32" />
          <div className="grid grid-cols-3 gap-4">
            <Skeleton className="h-36" />
            <Skeleton className="h-36" />
            <Skeleton className="h-36" />
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <GraduationCap className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Ano Letivo</h2>
          <YearTabs
            calendars={calendars}
            selectedId={effectiveCalendarId}
            onSelect={handleYearSelect}
            onDelete={(cal) => setDeleteTarget(cal)}
          />
        </div>
        <div className="flex items-center gap-2">
          {effectiveCalendarId && selectedCalendar && (
            <ExportMenu
              companyId={companyId}
              calendarId={effectiveCalendarId}
              calendar={selectedCalendar}
            />
          )}
          <Button variant="outline" size="sm" onClick={() => setCreateModalOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Novo Ano Letivo
          </Button>
        </div>
      </div>

      {/* Content */}
      {!effectiveCalendarId ? (
        <Card className="p-8">
          <div className="flex flex-col items-center justify-center text-center gap-3">
            <CalendarDays className="h-12 w-12 text-muted-foreground/50" />
            <div>
              <p className="font-medium text-foreground">Nenhum ano letivo configurado</p>
              <p className="text-sm text-muted-foreground mt-1">
                Crie um ano letivo para acompanhar dias letivos, carga horaria e compliance MEC.
              </p>
            </div>
            <Button onClick={() => setCreateModalOpen(true)} className="mt-2">
              <Plus className="h-4 w-4 mr-1" />
              Criar Ano Letivo
            </Button>
          </div>
        </Card>
      ) : statsLoading ? (
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
        </div>
      ) : stats ? (
        <>
          <StatsCards data={stats} />
          <HolidaySection
            companyId={companyId}
            calendarId={effectiveCalendarId}
            year={selectedCalendar?.year ?? null}
            onHolidaysChange={onHolidaysChange}
          />
        </>
      ) : null}

      {/* Create Modal */}
      <CreateAcademicYearModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        companyId={companyId}
        existingYears={calendars.map((c) => c.year).filter((y): y is number => y !== null)}
      />

      {/* Delete Confirm Modal */}
      <DeleteConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        yearTitle={deleteTarget?.title ?? ''}
        isPending={deleteMutation.isPending}
      />
    </div>
  );
}
