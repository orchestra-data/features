# PRD — Calendário Acadêmico Definitivo

> **Epic:** Calendário Acadêmico Definitivo v5.0
> **Autor:** Steven (PO) + Chief (Squad Cogedu)
> **Data:** 2026-03-25
> **Status:** DRAFT — Aguardando aprovação antes de codar

---

## Visão Geral

Transformar o calendário acadêmico de um visualizador de eventos em um **sistema de planejamento acadêmico completo**, onde TUDO é editável a partir do calendário, com gestão inteligente de conflitos, recorrência estilo Google Calendar, e respeito total à hierarquia de conteúdo.

## O que JÁ existe (não refazer)

| Componente | Status | Linhas |
|-----------|--------|--------|
| CalendarView (FullCalendar v6) | ✅ Funcional | ~250 |
| EventModal (criar/editar) | ✅ Funcional | ~200 |
| SelectionWizard (Company→Turma→Pathway→Series) | ✅ Funcional | ~200 |
| BatchSchedulerModal (agendamento em lote) | ✅ Funcional | ~400 |
| AcademicYearPanel + MEC compliance | ✅ Funcional | ~300 |
| HolidayDiscovery (BrasilAPI) | ✅ Funcional | ~250 |
| ConflictWarningModal + MoveWarningModal | ✅ Funcional | — |
| 17 endpoints (CRUD eventos, recorrência, feriados, ano letivo) | ✅ Funcional | — |
| Tabelas: company_event, academic_year, company_blocked_day | ✅ Migradas | — |
| Drag-drop de eventos | ✅ Funcional | — |
| Filtro por turma (multi-select) | ✅ Funcional | — |
| Export ICS + Google Calendar | ✅ Funcional | — |
| **Total existente** | | **~8.443** |

---

## Os 11 Requisitos → Mapeamento

| # | Requisito Steven | Existe? | O que falta |
|---|-----------------|---------|-------------|
| 1 | Calendário ligado à instituição (Tab 8) | ✅ Sim | — |
| 2 | Puxa turmas → conteúdos (pathways, series, units, components) | 🟡 Parcial | Components com data no calendário. Início/fim de pathways marcados |
| 3 | Tudo editável via modal do calendário | 🟡 Parcial | Modal precisa TODOS os parâmetros do componente |
| 4 | Filtro multi-turma | ✅ Sim | Sem turma = todos os conteúdos da instituição |
| 5 | Eventos recorrentes (estilo Google Calendar) | 🟡 Parcial | Falta UX Google Calendar: "diário/semanal/mensal/custom", "editar este/todos/seguintes" |
| 6 | Guardrail feriados (pular, negociar) | 🟡 Parcial | Falta lógica de "pular para próximo dia útil" e negociação com usuário |
| 7 | Conceito dia letivo | 🟡 Parcial | Ano letivo existe. Falta: dias letivos calculados, conflitos com eventos existentes |
| 8 | Empurrar eventos (cascade push) | ❌ Não | Lógica de empurrar todos seguintes quando conflito |
| 9 | Constraints Unit/Pathway (stretch, não sobrepor) | ❌ Não | Validação de fronteiras |
| 10 | Eventos avulsos | ✅ Sim | — |
| 11 | Compartilhar calendário | ❌ Não | Compartilhamento entre instituições |

---

## EPIC 1 — Conteúdo no Calendário (Requisitos 2, 3, 4)

### Contexto
Hoje o calendário mostra `company_event`. O que falta é que os **componentes das turmas** (aulas, avaliações, etc.) com datas definidas apareçam diretamente no calendário, e que ao clicar, um modal mostre TODOS os parâmetros editáveis.

### Stories

#### Story 1.1 — Components como eventos no calendário
**Como** admin, **quero** ver os componentes de cada turma como blocos no calendário, **para** ter visão completa do planejamento.

**Acceptance Criteria:**
- [ ] Componentes com `scheduled_date` aparecem no calendário
- [ ] Cor diferenciada por tipo (video=azul, live_session=verde, quiz=vermelho, assignment=laranja)
- [ ] Tooltip mostra: título, tipo, duração estimada, turma
- [ ] Sem turma selecionada → mostra todos os componentes da instituição
- [ ] Com turma(s) selecionada(s) → filtra apenas componentes das turmas

**Impacto Técnico:**
- Endpoint: Evoluir `GET /events-calendar` para incluir `class_instance_component_schedule`
- Frontend: CalendarView precisa renderizar 2 tipos de fonte (events + components)
- Store: Adicionar `showComponents: boolean` no useSchedulingStore

---

#### Story 1.2 — Pathways como marcos no calendário
**Como** admin, **quero** ver início e fim de cada pathway marcados no calendário, **para** visualizar a estrutura macro do curso.

**Acceptance Criteria:**
- [ ] Pathways aparecem como barras horizontais (multi-day events)
- [ ] Cor distinta (ex: borda roxa)
- [ ] Mostra: nome do pathway, turma, período
- [ ] Ao clicar: modal com detalhes do pathway

**Impacto Técnico:**
- Endpoint: `GET /events-calendar` retorna pathways com start/end date
- Frontend: FullCalendar background events para pathways
- DB: Query join `pathway` → `class_instance` → dates

---

#### Story 1.3 — Modal de componente com TODOS os parâmetros
**Como** admin, **quero** ao clicar em um componente no calendário, ver e editar TODOS os seus parâmetros, **para** não precisar sair do calendário.

**Acceptance Criteria:**
- [ ] Modal abre com tabs: Geral | Conteúdo | Agendamento | Recursos
- [ ] Tab Geral: título, descrição, tipo, duração estimada, status
- [ ] Tab Conteúdo: links, materiais, pré-requisitos
- [ ] Tab Agendamento: data, hora, turma, instrutor, sala
- [ ] Tab Recursos: facilities, equipment, instructor
- [ ] Salvar altera o componente E o evento associado
- [ ] Alteração reflete imediatamente no calendário (invalidar cache TanStack)

**Impacto Técnico:**
- Frontend: Evoluir `ComponentDetailModal` com tabs
- Endpoint: Pode precisar de `PATCH /components/:id` (verificar se existe)
- Bidireção: alterar no modal → atualiza evento; alterar evento → atualiza componente

---

## EPIC 2 — Recorrência Google Calendar Style (Requisito 5)

### Contexto
O BatchSchedulerModal já faz recorrência, mas a UX não é Google Calendar. Falta: "Repetir: diário / semanal / mensal / anual / personalizado", "Terminar: nunca / após N / em data X", e "Editar: este evento / este e seguintes / todos".

### Stories

#### Story 2.1 — Recurrence picker no EventModal
**Como** admin, **quero** ao criar/editar um evento, ter opções de recorrência iguais ao Google Calendar, **para** criar séries de eventos rapidamente.

**Acceptance Criteria:**
- [ ] Dropdown "Repetir": Não repete | Diário | Semanal (dias selecionáveis) | Mensal (dia do mês) | Anual | Personalizado
- [ ] "Terminar": Nunca | Após N ocorrências | Em data X
- [ ] Preview: "Terças e quintas até 30/06/2026 (24 eventos)"
- [ ] Checkboxes de dias da semana (Seg-Dom)
- [ ] "Pular feriados" checkbox (default: checked)
- [ ] "Pular finais de semana" checkbox (default: checked para sábados configurável)

**Impacto Técnico:**
- Frontend: Novo componente `RecurrencePicker.tsx` dentro do EventModal
- Backend: `createCompanyEvent` já suporta `recurrence_rule` — só precisa expandir o frontend

---

#### Story 2.2 — Editar série: "este / este e seguintes / todos"
**Como** admin, **quero** ao editar um evento recorrente, escolher se edito só este, este e os seguintes, ou todos, **para** ter controle granular.

**Acceptance Criteria:**
- [ ] Ao clicar em evento recorrente → dialog: "Editar este evento" | "Este e os seguintes" | "Todos os eventos da série"
- [ ] "Este evento": desvincula do grupo (recurrence_group_id = null), edita só ele
- [ ] "Este e seguintes": split do grupo na data, edita todos a partir daqui
- [ ] "Todos": edita todos do grupo (title, time, etc.)
- [ ] Mesma lógica para DELETE: "Excluir este" | "Este e seguintes" | "Todos"

**Impacto Técnico:**
- Backend: Endpoint `splitRecurrenceGroup` já existe — precisa adaptar para "editar a partir de"
- Frontend: Dialog de escolha antes de abrir EventModal

---

## EPIC 3 — Guardrail de Feriados + Negociação (Requisito 6)

### Contexto
Hoje os feriados são dias bloqueados, mas não há lógica de "pular". Se um evento cai em feriado, o sistema deve negociar com o usuário.

### Stories

#### Story 3.1 — Detecção automática de conflito com feriado
**Como** admin, **quero** que ao criar/mover um evento para um feriado, o sistema me avise e ofereça opções, **para** nunca ter aula em feriado acidentalmente.

**Acceptance Criteria:**
- [ ] Ao salvar evento em dia bloqueado → modal de negociação:
  - "Este dia é [nome do feriado]. O que deseja fazer?"
  - Opção 1: "Mover para o próximo dia útil" (calcula automaticamente)
  - Opção 2: "Manter mesmo assim" (marca allow_on_holiday = true)
  - Opção 3: "Cancelar"
- [ ] Para eventos recorrentes: "Pular este feriado" | "Pular todos os feriados da série"
- [ ] Preview mostra a nova data antes de confirmar

**Impacto Técnico:**
- Frontend: Evoluir `ConflictWarningModal` com opções de resolução
- Backend: Endpoint helper `GET /next-business-day?from=2026-04-21&companyId=X`
- Lógica: Verificar `company_blocked_day` + weekends

---

## EPIC 4 — Dia Letivo + Conflitos (Requisitos 7, 8)

### Contexto
Quando um ano letivo é criado, os dias úteis (não feriado, não fim de semana) tornam-se "dias letivos". Eventos existentes fora de dias letivos viram conflitos que precisam de resolução.

### Stories

#### Story 4.1 — Cálculo de dias letivos
**Como** admin, **quero** que ao criar um ano letivo, o sistema calcule automaticamente os dias letivos, **para** saber exatamente quantos dias de aula tenho.

**Acceptance Criteria:**
- [ ] Ao criar ano letivo → calcula: (dias totais) - (feriados) - (domingos) - (sábados se não letivos) = dias letivos
- [ ] Exibe: "2026: 200 dias letivos (meta MEC: 200)" com barra de progresso
- [ ] Sábados: configurável por ano letivo (`saturday_is_school_day: boolean`)
- [ ] Lista visual de todos os dias letivos vs não-letivos no painel

**Impacto Técnico:**
- Backend: Evoluir `getAcademicYearStats` para calcular dias letivos
- Frontend: Badge no `AcademicYearPanel` com contagem

---

#### Story 4.2 — Detecção de eventos fora de dia letivo
**Como** admin, **quero** que eventos fora de dias letivos sejam sinalizados como conflitos, **para** decidir se mantenho ou movo.

**Acceptance Criteria:**
- [ ] Após criar/editar ano letivo → varredura de todos eventos da instituição
- [ ] Eventos em dias NÃO letivos → marcados como "conflito" (badge amarelo no calendário)
- [ ] Painel de conflitos: lista com ações "Mover para próximo dia letivo" | "Manter"
- [ ] Ação em lote: "Resolver todos → mover para próximo dia letivo"

**Impacto Técnico:**
- Backend: `POST /companies/:companyId/academic-years/:id/detect-conflicts`
- Retorna: `[{ eventId, eventTitle, currentDate, conflictType, suggestedDate }]`
- Frontend: Novo componente `ConflictResolutionPanel.tsx`

---

#### Story 4.3 — Cascade Push (empurrar eventos)
**Como** admin, **quero** ao mover um evento, poder "empurrar" todos os eventos seguintes para frente, **para** reorganizar o calendário sem mover um por um.

**Acceptance Criteria:**
- [ ] Ao mover evento → opção: "Mover só este" | "Empurrar este e todos os seguintes"
- [ ] "Empurrar": calcula delta (novo dia - dia antigo), aplica em todos os eventos subsequentes da mesma turma
- [ ] Eventos empurrados respeitam: feriados (pulam), fins de semana (pulam), dias letivos (se ano letivo existir)
- [ ] Preview antes de confirmar: lista mostrando "Evento X: 15/03 → 17/03"
- [ ] Undo: botão "Desfazer empurrão" por 30 segundos (toast com ação)

**Impacto Técnico:**
- Backend: `POST /companies/:companyId/events/:eventId/cascade-push`
  - Body: `{ direction: 'forward', skipHolidays: true, skipWeekends: true, affectSameTurma: true }`
  - Retorna: `{ moved: [{ eventId, from, to }], skipped: [{ eventId, reason }] }`
- Frontend: `CascadePushPreviewModal.tsx`

---

## EPIC 5 — Constraints Unit/Pathway (Requisito 9)

### Stories

#### Story 5.1 — Validação de fronteiras de pathway
**Como** admin, **quero** que eventos de componentes não possam ter data fora do período do pathway, **para** manter a integridade curricular.

**Acceptance Criteria:**
- [ ] Ao criar/mover evento de componente → verificar se data está dentro de [pathway.start_date, pathway.end_date]
- [ ] Se fora → bloquear com mensagem: "Este componente pertence ao pathway X (01/03 - 30/06). A data escolhida está fora."
- [ ] Opção: "Esticar o pathway até esta data" (se permitido)
- [ ] JAMAIS permitir componente fora do pathway sem confirmação explícita

**Impacto Técnico:**
- Backend: Validação no `createCompanyEvent` e `updateCompanyEvent`
- Query: JOIN component → series → pathway → check dates

---

#### Story 5.2 — Validação de não-sobreposição de units
**Como** admin, **quero** que eventos possam esticar uma unit mas nunca sobrepor duas units da mesma série, **para** manter a sequência didática.

**Acceptance Criteria:**
- [ ] Ao agendar componente de unit A → verificar se data não invade período de unit B (mesma série)
- [ ] Se invade → bloquear: "Este horário pertence à Unit B. Units não podem se sobrepor."
- [ ] Permitir: esticar (unit A termina mais tarde que planejado)
- [ ] Bloquear: sobrepor (componente de unit A no período de unit B)

**Impacto Técnico:**
- Backend: Query complexa de sobreposição de units na mesma série
- Validação server-side obrigatória (frontend é conveniência)

---

## EPIC 6 — Compartilhamento de Calendário (Requisito 11)

### Stories

#### Story 6.1 — Compartilhar calendário entre instituições
**Como** admin, **quero** compartilhar meu calendário com outras instituições, **para** coordenar eventos entre escolas.

**Acceptance Criteria:**
- [ ] Botão "Compartilhar" no calendário
- [ ] Opções: "Somente leitura" | "Pode sugerir eventos"
- [ ] Compartilhamento via link (token único) ou por instituição cadastrada
- [ ] Instituição que recebe vê eventos sobrepostos no próprio calendário (cor diferente)
- [ ] Notificação quando evento compartilhado é alterado

**Impacto Técnico:**
- ZERO TABELAS NOVAS — reusar tabela existente (verificar company_integration ou similar) ou postergar
- Endpoint: `POST /companies/:id/calendar/share`
- Endpoint: `GET /companies/:id/calendar/shared-with-me`
- Frontend: `ShareCalendarModal.tsx`

---

## EPIC 7 — IA do Calendário (Assistente Inteligente)

### Contexto
Um assistente de IA embutido no calendário que entende o contexto acadêmico completo: turmas, pathways, conflitos, dias letivos, feriados. Começa simples e vai sendo empoderado. No futuro, o Orch Admin assume esse papel — por ora, uma IA dedicada ao calendário.

### Stories

#### Story 7.1 — Chat do calendário (MVP)
**Como** admin, **quero** um chat no calendário que entende meu contexto, **para** pedir ajuda sem sair da tela.

**Acceptance Criteria:**
- [ ] Botão flutuante "Assistente" no canto do calendário (FAB)
- [ ] Abre painel lateral com chat
- [ ] IA recebe como contexto: turmas selecionadas, eventos visíveis, período atual, feriados, ano letivo
- [ ] Exemplos de perguntas iniciais:
  - "Quantos dias letivos faltam?"
  - "Quais conflitos existem neste mês?"
  - "Reorganize as aulas da turma X para pular os feriados"
  - "Resuma o que está planejado para abril"
  - "Quais componentes ainda não têm data?"
- [ ] Respostas em linguagem natural com links clicáveis para eventos/componentes

**Impacto Técnico:**
- Frontend: `CalendarAssistant.tsx` — painel lateral com chat
- Backend: `POST /companies/:companyId/calendar/assistant` — envia contexto + pergunta
- IA: Usa endpoint existente de AI (Gemini/OpenAI via `ai-conversation`) OU Orch Admin API
- Contexto montado no frontend: serializa estado atual do calendário como JSON para o prompt

#### Story 7.2 — Ações sugeridas pela IA
**Como** admin, **quero** que a IA sugira ações e eu aprove com um clique, **para** resolver conflitos rapidamente.

**Acceptance Criteria:**
- [ ] IA detecta conflitos e sugere resoluções como cards clicáveis
- [ ] Card de ação: "Mover Aula 5 de 21/04 (feriado) para 22/04" → botão [Aplicar]
- [ ] Card de lote: "3 eventos em feriados. Mover todos para próximo dia útil?" → botão [Aplicar todos]
- [ ] Preview antes de aplicar (mesma UX do cascade push)
- [ ] Histórico de ações sugeridas e aplicadas

**Impacto Técnico:**
- Backend: Endpoint de IA retorna `{ message, suggestedActions: [{ type, eventId, from, to }] }`
- Frontend: Renderiza `suggestedActions` como cards interativos
- Ao clicar "Aplicar" → chama endpoint de update/move

#### Story 7.3 — Relatório inteligente
**Como** admin, **quero** pedir à IA um relatório do estado do calendário, **para** apresentar em reuniões.

**Acceptance Criteria:**
- [ ] "Gere um relatório deste semestre" → IA produz markdown/PDF com:
  - Total de aulas planejadas vs ministradas
  - Dias letivos usados / restantes
  - Conflitos pendentes
  - Turmas com mais/menos aulas
  - Próximos marcos (pathways terminando, avaliações)
- [ ] Export como PDF ou copiar texto

**Impacto Técnico:**
- Usa dados de `getAcademicYearStats` + `events-calendar` + conflitos
- Formatação markdown no frontend

---

## Ordem de Execução (Dependências)

```
EPIC 1 (Conteúdo no Calendário)     ← PRIMEIRO — base para tudo
  ├── Story 1.1 (Components)         ← Faz os dados aparecerem
  ├── Story 1.2 (Pathways)           ← Marcos visuais
  └── Story 1.3 (Modal completo)     ← Edição total
         ↓
EPIC 2 (Recorrência Google)          ← SEGUNDO — UX de criação
  ├── Story 2.1 (Picker)             ← Interface
  └── Story 2.2 (Editar série)       ← Controle
         ↓
EPIC 3 (Feriados)                    ← TERCEIRO — guardrails
  └── Story 3.1 (Negociação)         ← Proteção
         ↓
EPIC 4 (Dia Letivo + Cascade)        ← QUARTO — lógica avançada
  ├── Story 4.1 (Cálculo)            ← Base
  ├── Story 4.2 (Detecção)           ← Conflitos
  └── Story 4.3 (Cascade Push)       ← Reorganização
         ↓
EPIC 5 (Constraints)                 ← QUINTO — integridade
  ├── Story 5.1 (Pathway bounds)     ← Fronteiras
  └── Story 5.2 (Unit overlap)       ← Sequência
         ↓
EPIC 6 (Compartilhamento)            ← SEXTO — social
  └── Story 6.1 (Share)              ← Colaboração
         ↓
EPIC 7 (IA do Calendário)            ← SÉTIMO — inteligência
  ├── Story 7.1 (Chat MVP)           ← Contexto + perguntas
  ├── Story 7.2 (Ações sugeridas)    ← Resolver conflitos com 1 clique
  └── Story 7.3 (Relatório)          ← Resumo para reuniões
```

## Regras de Negócio (VETO — impossibilitam caminhos errados)

| # | Regra | Tipo | Enforcement |
|---|-------|------|-------------|
| R1 | Evento NÃO pode estar em feriado sem `allow_on_holiday = true` | HARD BLOCK | Backend + Frontend |
| R2 | Componente NÃO pode ter data fora do pathway | HARD BLOCK | Backend |
| R3 | Units da mesma série NÃO podem se sobrepor | HARD BLOCK | Backend |
| R4 | Evento fora de dia letivo = CONFLITO (após criação de ano letivo) | SOFT BLOCK | Frontend (aviso) |
| R5 | Cascade push SEMPRE pula feriados e fins de semana | AUTOMÁTICO | Backend |
| R6 | Recorrência: ao editar série, SEMPRE perguntar escopo | UX OBRIGATÓRIO | Frontend |
| R7 | Sem turma selecionada = mostra TODOS os conteúdos da instituição | DEFAULT | Frontend |
| R8 | Alteração no calendário = alteração no conteúdo (bidirecional) | SINCRONIZAÇÃO | Backend |
| R9 | Sábado é dia letivo = CONFIGURÁVEL por ano letivo | CONFIG | Backend + Frontend |
| R10 | Compartilhamento = somente leitura por default | SEGURANÇA | Backend |
| R11 | Empurrar eventos = preview OBRIGATÓRIO antes de confirmar | UX OBRIGATÓRIO | Frontend |
| R12 | Cascade Push que afeta eventos de meses diferentes do original → alerta ao usuário | SOFT BLOCK | Frontend (alerta) + Backend (detecta) |
| R13 | Cascade Push é ATÔMICO: se 1 evento de 50 falhar por constraint, NENHUM move. Transaction Rollback. | HARD BLOCK | Backend (SQL Transaction) |
| R14 | Recursos (salas, labs, equipamentos) não podem ter conflito de horário — detect-conflicts verifica | SOFT BLOCK | Backend (detectCalendarConflicts) |
| R15 | Eventos herdam recursos da instituição — ao vincular sala a evento, verifica disponibilidade | AUTOMÁTICO | Backend (event_resource + company_resource.operating_hours) |

## Estimativa por Epic

| Epic | Stories | Complexidade | Estimativa |
|------|---------|-------------|------------|
| 1 — Conteúdo | 3 | Média | 2 sessões |
| 2 — Recorrência | 2 | Média | 1-2 sessões |
| 3 — Feriados | 1 | Baixa | 1 sessão |
| 4 — Dia Letivo + Cascade | 3 | **Alta** | 2-3 sessões |
| 5 — Constraints | 2 | Alta | 1-2 sessões |
| 6 — Compartilhamento | 1 | Média | 1-2 sessões |
| 7 — IA do Calendário | 3 | Média-Alta | 2-3 sessões |
| **TOTAL** | **15 stories** | | **10-15 sessões** |

---

*PRD gerado por Chief (Squad Cogedu) — 2026-03-25*
*Filosofia: Pedro Valério — "Impossibilitar caminhos errados"*
*Base: 8.443 linhas existentes, 17 endpoints, 5 tabelas*
