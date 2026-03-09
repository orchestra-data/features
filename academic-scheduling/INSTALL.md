# Instalacao: academic-scheduling

> Feature completa: CRUD ano letivo, feriados (BrasilAPI sync), compliance MEC, exportacao (iCal, MEC HTML), calendario FullCalendar com feriados pintados

## Pre-requisitos

- PostgreSQL 17 rodando
- Keycloak 26.x acessivel
- Node 22+
- Monorepo clonado e `npm install` executado

## Passo 1: Copiar Endpoints (27 endpoints)

```bash
# Copiar TODOS os endpoints do delivery pack:
cp -r academic-scheduling/backend/endpoints/* apps/api/src/endpoints/

# Verificar (deve listar 27 pastas novas/atualizadas):
ls apps/api/src/endpoints/ | grep -iE "academic|blocked|holiday|sync|export|calendar|event|schedule|recurrence"
```

Os endpoints sao auto-registrados pelo filesystem router — nao precisa registrar manualmente.

### Endpoints criados nesta feature:

**Academic Year CRUD:**
- `getAcademicYears/` — GET `/companies/:companyId/academic-years`
- `createAcademicYear/` — POST `/companies/:companyId/academic-years`
- `updateAcademicYear/` — PUT `/companies/:companyId/academic-years/:calendarId`
- `deleteAcademicYear/` — DELETE `/companies/:companyId/academic-years/:calendarId`

**Stats & Compliance MEC:**
- `getAcademicYearStats/` — GET `.../stats` (dias letivos, horas, compliance)
- `getAcademicYearHolidays/` — GET `.../holidays`
- `exportMECReport/` — GET `.../mec-report` (HTML para impressao)

**Feriados & Blocked Days:**
- `getCompanyBlockedDays/` — GET
- `createCompanyBlockedDay/` — POST
- `updateCompanyBlockedDay/` — PUT
- `deleteCompanyBlockedDay/` — DELETE
- `syncHolidays/` — POST `/companies/:companyId/holidays/sync` (BrasilAPI)
- `discoverHolidays/` — GET
- `getPublicHolidays/` — GET
- `previewCompanyBlockedDay/` — POST

**Export:**
- `exportCalendarICS/` — GET `/companies/:companyId/events/export.ics`

## Passo 2: Copiar Frontend

```bash
# Copiar feature completa:
mkdir -p apps/web/src/features/academic-scheduling
cp -r academic-scheduling/frontend/* apps/web/src/features/academic-scheduling/

# NAO copiar pipeline-artifacts (sao artefatos de CI, nao codigo):
rm -rf apps/web/src/features/academic-scheduling/pipeline-artifacts
rm -f apps/web/src/features/academic-scheduling/CONTEXT_INJECTION.md
```

## Passo 3: Copiar Types

```bash
# Database types:
cp academic-scheduling/types/database-types/* libs/ava-database-types/src/
```

## Passo 4: Registrar Rota no Router

Abrir `apps/web/src/router.tsx` e verificar se a rota do calendario academico existe.
A feature e acessada via CompanyDetail Tab 8 (Calendario Academico).

> IMPORTANTE: O router usa createBrowserRouter (estatico). Apos mudar, REINICIAR o Vite.

## Passo 5: Dependencias Frontend

A feature usa FullCalendar. Verificar se esta instalado:

```bash
cd apps/web
npm ls @fullcalendar/react || npm install @fullcalendar/react @fullcalendar/daygrid @fullcalendar/timegrid @fullcalendar/interaction
```

## Passo 6: Tabelas do Banco

As seguintes tabelas SAO USADAS (ja devem existir):
- `academic_calendar` — anos letivos
- `academic_year` — periodos (start_date, end_date)
- `company_blocked_day` — feriados e bloqueios
- `company_event` — aulas e eventos
- `company` — dados da instituicao (display_name, registration_number)
- `class_instance` — turmas

Tabelas que PODEM NAO EXISTIR (codigo usa try/catch):
- `calendar_day` — dias letivos detalhados
- `mec_compliance_audit` — auditorias MEC
- `holiday_source` — fontes de feriados

## Passo 7: Verificar

```bash
# 1. Reiniciar API:
npm run dev --workspace=apps/api

# 2. Obter token:
TOKEN=$(curl -s -X POST "http://localhost:8080/realms/cogedu/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=cogedu-admin&grant_type=password&username=admin@cogedu.com&password=admin123" \
  | jq -r '.access_token')

# 3. Testar endpoints novos:
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/companies/{COMPANY_ID}/academic-years" | jq .

curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/getCompanyBlockedDays?companyId={COMPANY_ID}" | jq .

# 4. Frontend — abrir pagina da empresa, tab Calendario Academico
# F12 → Console → ZERO erros

# 5. Build:
npm run build
```

## Problemas?

Consultar: `TROUBLESHOOTING.md`
