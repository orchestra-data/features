# Endpoint Catalog — academic-scheduling

> Gerado manualmente — endpoints reais com rotas corretas

## Academic Year (CRUD)

| Method | Rota Real | Endpoint | Descricao |
|--------|-----------|----------|-----------|
| GET | `/companies/:companyId/academic-years` | `getAcademicYears/` | Lista anos letivos |
| POST | `/companies/:companyId/academic-years` | `createAcademicYear/` | Cria ano letivo |
| PUT | `/companies/:companyId/academic-years/:calendarId` | `updateAcademicYear/` | Atualiza ano letivo |
| DELETE | `/companies/:companyId/academic-years/:calendarId` | `deleteAcademicYear/` | Remove ano letivo |

## Academic Year Stats & Compliance

| Method | Rota Real | Endpoint | Descricao |
|--------|-----------|----------|-----------|
| GET | `/companies/:companyId/academic-years/:calendarId/stats` | `getAcademicYearStats/` | Stats + MEC compliance |
| GET | `/companies/:companyId/academic-years/:calendarId/holidays` | `getAcademicYearHolidays/` | Feriados do ano letivo |
| GET | `/companies/:companyId/academic-years/:calendarId/mec-report` | `exportMECReport/` | Relatorio MEC (HTML) |

## Holidays & Blocked Days

| Method | Rota Real | Endpoint | Descricao |
|--------|-----------|----------|-----------|
| GET | `/api/getCompanyBlockedDays` | `getCompanyBlockedDays/` | Lista feriados/bloqueios |
| POST | `/api/createCompanyBlockedDay` | `createCompanyBlockedDay/` | Cria feriado/bloqueio |
| PUT | `/api/updateCompanyBlockedDay` | `updateCompanyBlockedDay/` | Atualiza feriado/bloqueio |
| DELETE | `/api/deleteCompanyBlockedDay` | `deleteCompanyBlockedDay/` | Remove feriado/bloqueio |
| POST | `/companies/:companyId/holidays/sync` | `syncHolidays/` | Sync BrasilAPI (nacional+estadual) |
| GET | `/api/discoverHolidays` | `discoverHolidays/` | Descobre feriados disponiveis |
| GET | `/api/getPublicHolidays` | `getPublicHolidays/` | Feriados publicos nacionais |
| POST | `/api/previewCompanyBlockedDay` | `previewCompanyBlockedDay/` | Preview antes de criar |

## Calendar & Events

| Method | Rota Real | Endpoint | Descricao |
|--------|-----------|----------|-----------|
| GET | `/companies/:companyId/events/calendar` | `getCompanyEventsCalendar/` | Eventos para FullCalendar |
| GET | `/companies/:companyId/events/export.ics` | `exportCalendarICS/` | Export iCal (.ics) |
| GET | `/api/listCompanyEvents` | `listCompanyEvents/` | Lista eventos |
| GET | `/api/getCompanyEvent` | `getCompanyEvent/` | Detalhe evento |
| POST | `/api/createCompanyEvent` | `createCompanyEvent/` | Cria evento |
| PUT | `/api/updateCompanyEvent` | `updateCompanyEvent/` | Atualiza evento |
| DELETE | `/api/deleteCompanyEvent` | `deleteCompanyEvent/` | Remove evento |

## Schedule & Recurrence

| Method | Rota Real | Endpoint | Descricao |
|--------|-----------|----------|-----------|
| GET | `/api/getClassInstanceSchedule` | `getClassInstanceSchedule/` | Grade da turma |
| POST | `/api/assignClassInstanceSchedule` | `assignClassInstanceSchedule/` | Atribui grade |
| POST | `/api/createRecurrenceGroup` | `createRecurrenceGroup/` | Cria recorrencia |
| POST | `/api/shiftRecurrenceGroup` | `shiftRecurrenceGroup/` | Move recorrencia |
| POST | `/api/splitRecurrenceGroup` | `splitRecurrenceGroup/` | Divide recorrencia |

**Total: 27 endpoints**
