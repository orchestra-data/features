# Calendario Academico Definitivo v5.0

> **Feature:** Tab 8 — Calendario Academico no CompanyDetail
> **Autor:** Steven (PO) + Squad Cogedu
> **Data:** 2026-03-25
> **Testes:** 15/15 Playwright E2E passing
> **Linhas:** ~14.000 (backend 3.017 + frontend 10.387 + e2e 555)

---

## O que e isso?

Um sistema completo de planejamento academico que transforma o calendario da instituicao de um simples visualizador em uma ferramenta de gestao real. Tudo editavel, tudo conectado ao conteudo, tudo validado.

**Antes:** Calendario mostrava eventos avulsos, desconectados do conteudo das turmas.
**Agora:** Calendario integrado com turmas, componentes, recorrencia, feriados, conflitos, compartilhamento e assistente IA.

---

## O que FAZ (funcionalidades)

### Epic 1 — Base Calendar (100%)
- Calendario FullCalendar v6 com visualizacao mensal/semanal/diaria
- Filtro multi-turma com badges e checkboxes
- 134+ eventos visiveis, cores por tipo
- Side panel com detalhes do dia ao clicar
- Banner informativo quando sem turma selecionada

### Epic 2 — Recorrencia Google Calendar Style (100%)
- RecurrencePicker: diario/semanal/mensal/anual/personalizado
- Dias da semana selecionaveis (Seg-Dom)
- Terminar: nunca / apos N / em data X
- Pular feriados (toggle) + pular fins de semana (toggle)
- Preview texto: "Ter e Qui ate 30/06/2026 pulando feriados"
- RecurrenceEditDialog: editar "este / seguintes / todos" (R6)
- Split e shift de series recorrentes via API

### Epic 3 — Guardrail de Feriados (100%)
- HolidayNegotiationModal intercepta save em feriado (R1)
- Opcoes: mover para proximo dia util / manter / cancelar
- HolidayDiscovery sincroniza feriados via BrasilAPI
- Blocked days impedem click no calendario com toast

### Epic 4 — Dia Letivo + Conflitos + Cascade Push (100%)
- AcademicYearPanel com compliance MEC (LDB Art. 24)
- Calculo automatico: dias letivos = dias uteis - feriados
- Barra de progresso: "180/200 dias letivos (meta MEC)"
- ConflictResolutionPanel detecta eventos em feriados/weekends
- CascadePushPreviewModal com dry-run obrigatorio (R11)
- Cascade atomico (R13) + alerta cross-mes (R12)

### Epic 5 — Constraints (80%)
- R3: Unit overlap detection — impede agendar componentes de units diferentes da mesma serie no mesmo dia
- Validacao server-side em createCompanyEvent e updateCompanyEvent
- Retorna 409 com mensagem clara: "Conflito com unidade X"
- R2 (pathway bounds): NAO implementado — tabela pathway nao tem colunas de data

### Epic 6 — Compartilhamento (80%)
- ShareCalendarModal com link token-based (HMAC-signed)
- Permissoes: somente leitura / pode sugerir eventos
- Expiracao configuravel: 7/30/90 dias / sem expiracao
- Copy-to-clipboard com feedback visual
- Backend: shareCalendar + getSharedCalendar (public, auth=false)
- Falta: pagina viewer para o link compartilhado

### Epic 7 — Assistente IA (70%)
- CalendarAssistant: FAB button no canto inferior direito
- Chat panel com 5 quick-question chips
- Responde: contagem de eventos, conflitos, dias letivos, resumo, componentes sem data
- Processamento client-side (sem AI externa no MVP)
- Falta: backend com AI real, action cards clicaveis

### Correcao Critica — Link Bidirecional (commit 8aeb2e4)
- **ANTES:** Criar evento com componentId NAO atualizava o componente. 57 componentes com event_id=NULL.
- **AGORA:** createCompanyEvent e updateCompanyEvent atualizam `component.event_id` + `component.scheduled_date`
- Dropdown de componentes mostra tipo, duracao, e badge "agendado" / "sem data"

---

## O que NAO faz (limitacoes conhecidas)

| Item | Status | Por que |
|------|--------|---------|
| R2 pathway bounds | NAO implementado | Tabela `pathway` nao tem start_date/end_date |
| Pagina viewer de link compartilhado | Falta frontend route | Endpoint existe, falta `/calendar/shared/:token` page |
| AI real no assistente | Falta backend AI | MVP usa processamento client-side |
| Action cards no assistente | Planejado | IA sugere acoes, usuario aplica com 1 click |
| Export PDF do calendario | NAO implementado | Nao estava no escopo |
| Drag-drop em headless | Fragil | FullCalendar drag nao funciona bem em headless Chromium |

---

## Regras de Negocio (enforcement)

| # | Regra | Tipo | Onde |
|---|-------|------|------|
| R1 | Evento em feriado = HARD BLOCK sem allow_on_holiday | Backend + Frontend | HolidayNegotiationModal |
| R3 | Units da mesma serie nao podem ter eventos no mesmo dia | Backend 409 | createCompanyEvent, updateCompanyEvent |
| R5 | Cascade push pula feriados/weekends | Backend auto | cascadePushEvents |
| R6 | Editar serie recorrente = SEMPRE perguntar escopo | Frontend | RecurrenceEditDialog |
| R8 | Alteracao no calendario = alteracao no componente | Backend | Bidirectional link (event_id + scheduled_date) |
| R11 | Cascade push = preview OBRIGATORIO (dryRun) | Frontend | CascadePushPreviewModal |
| R12 | Cascade cross-mes = alerta | Frontend | crossesMonths flag |
| R13 | Cascade ATOMICO = transaction rollback | Backend | SQL Transaction |

---

## Endpoints da API

| Metodo | Path | O que faz |
|--------|------|-----------|
| GET | `/companies/:id/events-calendar` | Lista eventos (com filtros) |
| POST | `/companies/:id/events` | Cria evento + link bidirecional com componente |
| GET | `/companies/:id/events/:eventId` | Detalhe do evento |
| PATCH | `/companies/:id/events/:eventId` | Atualiza evento + sync componente |
| DELETE | `/companies/:id/events/:eventId` | Remove evento |
| POST | `/companies/:id/events/:eventId/cascade-push` | Empurra eventos seguintes |
| POST | `/companies/:id/calendar/detect-conflicts` | Detecta conflitos no periodo |
| GET | `/companies/:id/next-business-day` | Proximo dia util |
| POST | `/companies/:id/recurrence-groups` | Cria grupo recorrente |
| POST | `/recurrence-groups/:groupId/shift` | Move serie inteira |
| POST | `/recurrence-groups/:groupId/split` | Divide serie (este/seguintes) |
| POST | `/companies/:id/calendar/share` | Gera token de compartilhamento |
| GET | `/calendar/shared/:token` | Acessa calendario compartilhado (publico) |

---

## Arquitetura de Componentes

```
AcademicSchedulingModule.tsx (orquestrador)
  |
  +-- CalendarView.tsx (FullCalendar v6, overlay loading)
  +-- DayDetailPanel.tsx (side panel slide-in)
  +-- EventModal.tsx (1562 lines, 2-step create/edit)
  |     +-- RecurrencePicker.tsx (Google Calendar-style)
  |     +-- HolidayNegotiationModal.tsx (R1 enforcement)
  +-- SelectionWizard.tsx (turma multi-picker)
  +-- BatchSchedulerModal.tsx (4-step batch)
  +-- AcademicYearPanel.tsx (MEC compliance, 1057 lines)
  |     +-- HolidayDiscovery.tsx (BrasilAPI sync)
  +-- RecurrenceEditDialog.tsx (este/seguintes/todos)
  +-- CascadePushPreviewModal.tsx (dry-run + undo)
  +-- ConflictResolutionPanel.tsx (detect + bulk resolve)
  +-- ShareCalendarModal.tsx (link generation)
  +-- CalendarAssistant.tsx (FAB + chat panel)
  +-- ConflictWarningModal.tsx
  +-- MoveWarningModal.tsx
  +-- ComponentDetailModal.tsx
  +-- ComponentInlineEditor.tsx
  +-- QuickActionsPopover.tsx

Hooks:
  +-- useCalendarEvents.ts
  +-- useHierarchyData.ts
  +-- useAcademicYear.ts
  +-- useBlockedDays.ts
  +-- useEventDragDrop.ts
  +-- useHolidayCascade.ts

Store:
  +-- useSchedulingStore.ts (Zustand)
```

---

## INSTALL — Passo a Passo

### Pre-requisitos

- Cogedu rodando (API + Web + Postgres + Keycloak)
- Node.js 20+
- As tabelas `company_event`, `academic_year`, `academic_calendar`, `company_blocked_day`, `calendar_day`, `component` ja devem existir (migrations ate 190)

### 1. Backend — Endpoints

Copie cada pasta de `backend/endpoints/` para `apps/api/src/endpoints/`:

```bash
# Endpoints novos (criar pasta se nao existe)
cp -r backend/endpoints/cascadePushEvents    apps/api/src/endpoints/
cp -r backend/endpoints/detectCalendarConflicts apps/api/src/endpoints/
cp -r backend/endpoints/getNextBusinessDay   apps/api/src/endpoints/
cp -r backend/endpoints/createRecurrenceGroup apps/api/src/endpoints/
cp -r backend/endpoints/shiftRecurrenceGroup apps/api/src/endpoints/
cp -r backend/endpoints/splitRecurrenceGroup apps/api/src/endpoints/
cp -r backend/endpoints/shareCalendar        apps/api/src/endpoints/
cp -r backend/endpoints/getSharedCalendar    apps/api/src/endpoints/

# Endpoints modificados (SUBSTITUIR os existentes)
cp backend/endpoints/createCompanyEvent/createCompanyEvent.ts apps/api/src/endpoints/createCompanyEvent/
cp backend/endpoints/updateCompanyEvent/updateCompanyEvent.ts apps/api/src/endpoints/updateCompanyEvent/
```

### 2. Backend — Repositories (se nao existirem)

```bash
cp backend/repositories/company-events-repository.ts apps/api/src/app/repositories/
cp backend/repositories/company-resources-repository.ts apps/api/src/app/repositories/
```

### 3. Frontend — Componentes

```bash
# Orquestrador
cp frontend/AcademicSchedulingModule.tsx apps/web/src/components/academic-scheduling/

# Componentes (20 arquivos)
cp frontend/components/*.tsx apps/web/src/components/academic-scheduling/components/

# Hooks (6 arquivos)
cp frontend/hooks/*.ts apps/web/src/components/academic-scheduling/hooks/

# Store
cp frontend/stores/*.ts apps/web/src/components/academic-scheduling/stores/
```

### 4. Registrar Tab 8

No componente `CompanyDetail` (ou equivalente), adicione a tab "Calendario":

```tsx
import { AcademicSchedulingModule } from '../academic-scheduling/AcademicSchedulingModule'

// Na lista de tabs:
{ label: 'Calendario', value: '8', content: <AcademicSchedulingModule /> }
```

### 5. Dependencias npm (verificar se ja existem)

```bash
npm ls @fullcalendar/react @fullcalendar/daygrid @fullcalendar/timegrid @fullcalendar/interaction zustand sonner lucide-react
```

Se alguma faltar:
```bash
npm install @fullcalendar/react @fullcalendar/daygrid @fullcalendar/timegrid @fullcalendar/interaction @fullcalendar/core
```

### 6. Reiniciar API + Web

```bash
# Reiniciar para pegar novos endpoints
npm run dev
```

### 7. Rodar testes E2E

```bash
npx playwright test apps/web/e2e/academic-scheduling.spec.ts --reporter=list
# Esperado: 15/15 passing
```

---

## Mapa de Arquivos

### Backend (18 arquivos, 3.017 linhas)

| Arquivo | Destino no Cogedu | O que faz |
|---------|-------------------|-----------|
| `backend/endpoints/createCompanyEvent/createCompanyEvent.ts` | `apps/api/src/endpoints/createCompanyEvent/` | CRUD + R3 validation + bidirectional link |
| `backend/endpoints/updateCompanyEvent/updateCompanyEvent.ts` | `apps/api/src/endpoints/updateCompanyEvent/` | PATCH + R3 validation + sync scheduled_date |
| `backend/endpoints/cascadePushEvents/*` | `apps/api/src/endpoints/cascadePushEvents/` | Empurrar eventos seguintes (R5, R11, R13) |
| `backend/endpoints/detectCalendarConflicts/*` | `apps/api/src/endpoints/detectCalendarConflicts/` | Detectar conflitos por periodo |
| `backend/endpoints/getNextBusinessDay/*` | `apps/api/src/endpoints/getNextBusinessDay/` | Proximo dia util (pula feriados) |
| `backend/endpoints/createRecurrenceGroup/*` | `apps/api/src/endpoints/createRecurrenceGroup/` | Criar grupo recorrente |
| `backend/endpoints/shiftRecurrenceGroup/*` | `apps/api/src/endpoints/shiftRecurrenceGroup/` | Mover serie inteira |
| `backend/endpoints/splitRecurrenceGroup/*` | `apps/api/src/endpoints/splitRecurrenceGroup/` | Dividir serie (este/seguintes/todos) |
| `backend/endpoints/shareCalendar/*` | `apps/api/src/endpoints/shareCalendar/` | Gerar token de compartilhamento |
| `backend/endpoints/getSharedCalendar/*` | `apps/api/src/endpoints/getSharedCalendar/` | Acessar calendario publico |
| `backend/repositories/company-events-repository.ts` | `apps/api/src/app/repositories/` | Queries de eventos |
| `backend/repositories/company-resources-repository.ts` | `apps/api/src/app/repositories/` | Queries de recursos |

### Frontend (27 arquivos, 10.387 linhas)

| Arquivo | Destino no Cogedu | O que faz |
|---------|-------------------|-----------|
| `frontend/AcademicSchedulingModule.tsx` | `apps/web/src/components/academic-scheduling/` | Orquestrador principal |
| `frontend/components/CalendarView.tsx` | `.../components/` | FullCalendar v6 wrapper |
| `frontend/components/EventModal.tsx` | `.../components/` | Criar/editar eventos (1562 lines) |
| `frontend/components/RecurrencePicker.tsx` | `.../components/` | Config recorrencia Google-style |
| `frontend/components/RecurrenceEditDialog.tsx` | `.../components/` | Este/seguintes/todos |
| `frontend/components/HolidayNegotiationModal.tsx` | `.../components/` | R1: guardrail feriados |
| `frontend/components/CascadePushPreviewModal.tsx` | `.../components/` | R11: preview cascade |
| `frontend/components/ConflictResolutionPanel.tsx` | `.../components/` | Detect + resolve conflitos |
| `frontend/components/AcademicYearPanel.tsx` | `.../components/` | MEC compliance (1057 lines) |
| `frontend/components/HolidayDiscovery.tsx` | `.../components/` | Sync BrasilAPI |
| `frontend/components/BatchSchedulerModal.tsx` | `.../components/` | Agendamento em lote 4 steps |
| `frontend/components/SelectionWizard.tsx` | `.../components/` | Turma multi-picker |
| `frontend/components/DayDetailPanel.tsx` | `.../components/` | Side panel do dia |
| `frontend/components/ShareCalendarModal.tsx` | `.../components/` | Compartilhar calendario |
| `frontend/components/CalendarAssistant.tsx` | `.../components/` | Assistente IA MVP |
| `frontend/components/ConflictWarningModal.tsx` | `.../components/` | Alerta de conflito |
| `frontend/components/MoveWarningModal.tsx` | `.../components/` | Alerta de movimentacao |
| `frontend/components/ComponentDetailModal.tsx` | `.../components/` | Detalhe do componente |
| `frontend/components/ComponentInlineEditor.tsx` | `.../components/` | Edicao inline |
| `frontend/components/QuickActionsPopover.tsx` | `.../components/` | Acoes rapidas |
| `frontend/hooks/useCalendarEvents.ts` | `.../hooks/` | TanStack Query para eventos |
| `frontend/hooks/useHierarchyData.ts` | `.../hooks/` | Turmas, pathways, series |
| `frontend/hooks/useAcademicYear.ts` | `.../hooks/` | Ano letivo + MEC |
| `frontend/hooks/useBlockedDays.ts` | `.../hooks/` | Feriados + dias bloqueados |
| `frontend/hooks/useEventDragDrop.ts` | `.../hooks/` | Drag-drop de eventos |
| `frontend/hooks/useHolidayCascade.ts` | `.../hooks/` | Cascade em feriados |
| `frontend/stores/useSchedulingStore.ts` | `.../stores/` | Zustand state management |

### E2E (1 arquivo + 15 screenshots)

| Arquivo | O que testa |
|---------|-------------|
| `e2e/academic-scheduling.spec.ts` | 15 testes end-to-end |
| `e2e/screenshots/01-calendar.png` | Calendario com 134+ eventos |
| `e2e/screenshots/02-day-panel.png` | Side panel do dia |
| `e2e/screenshots/03-wizard.png` | Turma picker |
| `e2e/screenshots/04-event-step1.png` | EventModal step 1 |
| `e2e/screenshots/04-event-step2.png` | EventModal step 2 com RecurrencePicker |
| `e2e/screenshots/05-turma-hierarchy.png` | Hierarquia turma > modulo > componente |
| `e2e/screenshots/06-recurrence.png` | RecurrencePicker weekly config |
| `e2e/screenshots/07-batch.png` | Batch scheduler |
| `e2e/screenshots/08-week.png` | Vista semanal |
| `e2e/screenshots/09-academic-year.png` | Ano letivo + MEC |
| `e2e/screenshots/10-edit-event.png` | Edit modal |
| `e2e/screenshots/11-recurrence-setup.png` | Configuracao recorrencia |
| `e2e/screenshots/12-share-modal.png` | Modal compartilhamento |
| `e2e/screenshots/13-assistant-fab.png` | Assistente IA FAB |
| `e2e/screenshots/15-academic-year-stats.png` | Stats MEC compliance |

---

## Dados de Teste (seed)

O ambiente dev ja vem com:
- 1 empresa: CoGEdu (ID: `00000000-0000-4000-8000-000000000001`)
- 5 turmas: Producao, Workshop, Cinematografia, CS Fundamentals, Completa
- 57 componentes: 18 video, 11 quiz, 8 assignment, 5 live_session, etc.
- 15 units, 8 series, 5 pathways
- 134+ eventos no calendario
- Feriados BrasilAPI sincronizados
- Keycloak: admin@cogedu.dev / admin123

---

## Screenshots

Todas as screenshots estao em `e2e/screenshots/`. Conferir visualmente para ter certeza de que o frontend esta renderizando corretamente.

---

## Historico de Commits (24 commits, branch dev)

```
8aeb2e4 fix(calendar): bidirectional component<>event link + rich dropdown
9d93e8e feat(calendar): Epic 5-7 — constraints, sharing, IA assistant + 15 E2E tests
5ca1900 fix(e2e): handle Keycloak re-auth in goToTab8 + bump timeouts
fd40aad feat(calendar): Story 2.2 + 4.2 — recurrence split/shift + conflict resolution
2328470 test(calendar): 10 Playwright E2E tests — all passing
af07cc7 feat(calendar): Epic 2-4 — recurrence picker, holiday negotiation, cascade push
b59eb9a fix(calendar): map unit_title and series_title in component transformer
...
```

---

## Contato

- **PO:** Steven (steevens@gmail.com)
- **Squad:** Cogedu Orchestra
- **Repo:** orchestra-data/features (branch: feature/academic-scheduling-v5)
