# Instalacao: Academic Scheduling v5 — Calendario Definitivo

> **Data:** 2026-03-25
> **Commits:** 76eea85, 806e640, 5937654, 1af2ed2, a741607
> **Branch origem:** dev
> **Testado em:** localhost:3001 (harbor-dev)
> **ZERO migracoes novas.** ZERO tabelas novas. Tudo usa schema existente.

---

## Resumo das Mudancas

### Bug Fix (CRITICAL)
- `company-events-repository.ts`: SQL aliases removidos que causavam `start: undefined` no calendário

### Novos Endpoints (3)
- `POST /companies/:companyId/events/:eventId/cascade-push` — Empurra eventos em cascata (atomico, com preview)
- `POST /companies/:companyId/calendar/detect-conflicts` — Detecta conflitos (feriados, sobreposicoes, weekends)
- `GET /companies/:companyId/next-business-day?from=YYYY-MM-DD` — Proximo dia util

### Melhorias
- Endpoint `events-calendar` agora faz JOIN com tabela `component` (retorna nome, tipo, duracao)
- Frontend exibe nome do componente no titulo do evento
- Type `CalendarEvent` inclui `component_type` e `component_duration`
- **DayDetailPanel corrigido:** agora mostra eventos do dia selecionado (antes: array vazio)
- **AcademicYearPanel:** sempre visivel (pertence a instituicao, nao a turma)

---

## Passo 1: Copiar Endpoints Novos

```bash
# Novos endpoints (3 pastas)
cp -r backend/endpoints/cascadePushEvents apps/api/src/endpoints/
cp -r backend/endpoints/getNextBusinessDay apps/api/src/endpoints/
cp -r backend/endpoints/detectCalendarConflicts apps/api/src/endpoints/
```

Os endpoints sao auto-descobertos pelo `load-endpoints.ts`. NAO precisa registrar.

## Passo 2: Atualizar Repository

```bash
# Substituir o repository (FIX: SQL aliases + component JOIN)
cp backend/company-events-repository.ts apps/api/src/app/repositories/company-events-repository.ts
```

**ATENCAO:** Este arquivo foi modificado em 2 linhas especificas:
- Linha ~396: Removidos aliases SQL (`start_datetime as start` → `start_datetime`)
- Linha ~396: Adicionado LEFT JOIN com tabela `component`

Se o arquivo mudou no main desde o commit base, faca merge manual nestas linhas.

## Passo 3: Atualizar Types

```bash
cp types/company-event-row.ts libs/ava-database-types/src/company-event-row.ts
```

Campos adicionados ao `CalendarEvent`:
- `component_type: string | null`
- `component_duration: number | null`

## Passo 4: Atualizar Frontend Hook

```bash
cp frontend/useCalendarEvents.ts apps/web/src/components/academic-scheduling/hooks/useCalendarEvents.ts
cp frontend/AcademicSchedulingModule.tsx apps/web/src/components/academic-scheduling/AcademicSchedulingModule.tsx
```

Mudancas:
- Interface `CalendarEventResponse` inclui `component_type`, `component_duration`
- `mapToFullCalendarEvent` mostra nome do componente no titulo
- `extendedProps` inclui `componentType`, `componentDuration`

## Passo 5: Build e Restart

```bash
npm run build:types   # Compilar tipos
npm run dev           # Reiniciar
```

## Passo 6: Testar

```bash
# 1. Calendario carrega eventos
curl "http://localhost:3000/companies/{COMPANY_ID}/events-calendar?startDate=2026-01-01&endDate=2026-12-31" \
  -H "Authorization: Bearer {TOKEN}" -H "x-tenant-id: {TENANT_ID}"
# Esperado: JSON com data[] contendo eventos com start/end preenchidos

# 2. Proximo dia util
curl "http://localhost:3000/companies/{COMPANY_ID}/next-business-day?from=2026-04-21" \
  -H "Authorization: Bearer {TOKEN}" -H "x-tenant-id: {TENANT_ID}"
# Esperado: { nextBusinessDay: "2026-04-22", dayOfWeek: "Terca" }

# 3. Detectar conflitos
curl -X POST "http://localhost:3000/companies/{COMPANY_ID}/calendar/detect-conflicts" \
  -H "Authorization: Bearer {TOKEN}" -H "x-tenant-id: {TENANT_ID}" \
  -H "Content-Type: application/json" \
  -d '{"startDate":"2026-01-01","endDate":"2026-12-31"}'
# Esperado: { totalEvents: N, totalConflicts: N, conflicts: [...] }

# 4. Cascade Push (DRY RUN primeiro!)
curl -X POST "http://localhost:3000/companies/{COMPANY_ID}/events/{EVENT_ID}/cascade-push" \
  -H "Authorization: Bearer {TOKEN}" -H "x-tenant-id: {TENANT_ID}" \
  -H "Content-Type: application/json" \
  -d '{"newDate":"2026-04-01","dryRun":true}'
# Esperado: { dryRun: true, deltaDays: N, totalAffected: N, moved: [...] }
# ATENCAO: So rodar sem dryRun apos confirmar preview!
```

## Troubleshooting

| Problema | Causa | Solucao |
|----------|-------|---------|
| start/end undefined | SQL aliases antigos | Verificar que `company-events-repository.ts` NAO tem `as start` / `as end` |
| Endpoint nao encontrado | Pasta nao copiada | Verificar que as 3 pastas estao em `apps/api/src/endpoints/` |
| Type error em CalendarEvent | Tipo antigo | Rebuild: `npm run build:types` |
| Cascade push falha | Permissao | Verificar `company.update` no role do usuario |

---

## Regras de Negocio Implementadas

| Regra | Status |
|-------|--------|
| R11: Preview obrigatorio antes de cascade | ✅ `dryRun: true` |
| R12: Alerta se cascade cruza meses | ✅ `crossesMonths: true` |
| R13: Cascade atomico (transaction rollback) | ✅ BEGIN/COMMIT/ROLLBACK |
| Feriados: pula automaticamente | ✅ `skipHolidays: true` |
| Weekends: pula automaticamente | ✅ `skipWeekends: true` |
| Sabado configuravel | ✅ `saturdayIsSchoolDay` param |

---

*Pack gerado: 2026-03-25 por Chief (Squad Cogedu)*
*3 commits: 76eea85, 806e640, 5937654*
