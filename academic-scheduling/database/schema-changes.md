# Schema Changes: academic-scheduling

> Documentacao real das tabelas usadas pela feature academic-scheduling.
> Schemas extraidos do codigo-fonte dos endpoints (SQL queries reais).

## Tabelas EXISTENTES (ja devem estar no banco)

### academic_calendar

Armazena anos letivos da instituicao.

| Coluna | Tipo | Constraint | Descricao |
|--------|------|------------|-----------|
| id | uuid | PK, DEFAULT gen_random_uuid() | ID unico |
| tenant_id | uuid | NOT NULL | Tenant (multi-tenancy) |
| company_id | uuid | NOT NULL, FK → company(id) | Instituicao |
| title | varchar | NOT NULL | Nome do ano letivo (ex: "2026") |
| year | integer | NOT NULL | Ano numerico |
| semester | varchar | nullable | Semestre (se aplicavel) |
| academic_status | varchar | DEFAULT 'draft' | Status: draft, active, closed |
| education_level | varchar | nullable | Nivel de ensino |
| course_type | varchar | nullable | Tipo de curso |
| academic_regime | varchar | nullable | Regime academico |
| mec_compliance_enabled | boolean | DEFAULT false | Compliance MEC ativo |
| academic_year_id | uuid | FK → academic_year(id) | Periodo associado |
| created_by | uuid | NOT NULL | Quem criou |
| is_default | boolean | DEFAULT false | Calendario padrao |
| is_institutional | boolean | DEFAULT false | Calendario institucional |
| calendar_type | varchar | DEFAULT 'academic' | Tipo: academic, administrative |
| description | text | nullable | Descricao opcional |
| cached_metrics | jsonb | nullable | Cache de metricas (dias letivos, etc) |
| created_at | timestamptz | DEFAULT now() | Data de criacao |

> **NOTA:** Nao existe migration para esta tabela no monorepo. Foi criada antes do monorepo existir.
> Se a tabela NAO existir, criar manualmente com o SQL abaixo.

```sql
CREATE TABLE IF NOT EXISTS academic_calendar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  company_id uuid NOT NULL REFERENCES company(id),
  title varchar NOT NULL,
  year integer NOT NULL,
  semester varchar,
  academic_status varchar DEFAULT 'draft',
  education_level varchar,
  course_type varchar,
  academic_regime varchar,
  mec_compliance_enabled boolean DEFAULT false,
  academic_year_id uuid REFERENCES academic_year(id),
  created_by uuid NOT NULL,
  is_default boolean DEFAULT false,
  is_institutional boolean DEFAULT false,
  calendar_type varchar DEFAULT 'academic',
  description text,
  cached_metrics jsonb,
  created_at timestamptz DEFAULT now()
);
```

### academic_year

Periodos (start/end date) associados a calendarios academicos.

| Coluna | Tipo | Constraint | Descricao |
|--------|------|------------|-----------|
| id | uuid | PK, DEFAULT gen_random_uuid() | ID unico |
| tenant_id | uuid | NOT NULL | Tenant |
| year_code | varchar | NOT NULL | Codigo do ano (ex: "2026") |
| year_number | integer | NOT NULL | Numero do ano |
| display_name | varchar | NOT NULL | Nome de exibicao |
| start_date | date | NOT NULL | Inicio do periodo |
| end_date | date | NOT NULL | Fim do periodo |
| status | varchar | DEFAULT 'active' | Status: active, inactive |
| is_current_year | boolean | DEFAULT false | Se e o ano corrente |

**Constraint:** `UNIQUE (tenant_id, year_code)` — `unique_year_per_tenant`

> **NOTA:** Nao existe migration para esta tabela no monorepo. Foi criada antes do monorepo existir.

```sql
CREATE TABLE IF NOT EXISTS academic_year (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  year_code varchar NOT NULL,
  year_number integer NOT NULL,
  display_name varchar NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status varchar DEFAULT 'active',
  is_current_year boolean DEFAULT false,
  CONSTRAINT unique_year_per_tenant UNIQUE (tenant_id, year_code)
);
```

### company_blocked_day

Feriados e dias bloqueados por empresa.

| Coluna | Tipo | Constraint | Descricao |
|--------|------|------------|-----------|
| id | uuid | PK, DEFAULT gen_random_uuid() | ID unico |
| tenant_id | uuid | NOT NULL | Tenant |
| company_id | uuid | NOT NULL, FK → company(id) | Empresa |
| date | date | NOT NULL | Data do bloqueio |
| name | varchar | NOT NULL | Nome (ex: "Natal") |
| type | varchar | NOT NULL | Tipo: national, state, municipal, custom |
| scope | varchar | DEFAULT 'company' | Escopo: company, national |
| is_recurring | boolean | DEFAULT false | Recorrente anual |
| source | varchar | nullable | Fonte (ex: "brasilapi") |
| state_code | varchar(2) | nullable | UF (ex: "SP") |
| created_by | uuid | nullable | Quem criou |
| created_at | timestamptz | DEFAULT now() | Data de criacao |

**Migration:** `202603040003--create_company_blocked_day.sql`

### company_event

Eventos e aulas da empresa (ja existia, ALTERADA por esta feature).

| Coluna | Tipo | Constraint | Descricao |
|--------|------|------------|-----------|
| id | uuid | PK | ID unico |
| tenant_id | uuid | NOT NULL | Tenant |
| company_id | uuid | NOT NULL, FK → company(id) | Empresa |
| name | varchar(255) | NOT NULL | Nome do evento |
| event_type | varchar(50) | NOT NULL | Tipo do evento |
| start_datetime | timestamptz | NOT NULL | Inicio |
| end_datetime | timestamptz | NOT NULL | Fim |
| is_recurring | boolean | DEFAULT false | **(NOVO)** Recorrente |
| recurrence_rule | jsonb | nullable | **(NOVO)** Regra de recorrencia |
| recurrence_parent_id | uuid | FK → company_event(id) | **(NOVO)** Evento pai |
| archived_at | timestamptz | nullable | **(NOVO)** Data de arquivamento |
| class_instance_id | uuid | FK → class_instance(id) | Turma |
| created_by_user_id | uuid | FK → user(id) | Quem criou |

**Migrations que ALTERAM esta tabela:**
- `202603040005--add_company_event_id_to_schedule.sql`
- `202603050001--add_archived_status_to_company_event.sql`
- `202603080002--add_recurrence_columns_to_company_event.sql`

### company

Usada para leitura (display_name, registration_number para relatorio MEC).

### class_instance

Usada para leitura (turmas vinculadas a eventos e grades).

## Tabelas OPCIONAIS (codigo usa try/catch)

Estas tabelas SAO referenciadas pelo codigo mas com tratamento de erro.
Se nao existirem, os endpoints degradam graciosamente.

### holiday_source

Fontes de feriados sincronizadas (BrasilAPI).

| Coluna | Tipo | Constraint | Descricao |
|--------|------|------------|-----------|
| id | uuid | PK, DEFAULT gen_random_uuid() | ID unico |
| tenant_id | uuid | NOT NULL | Tenant |
| company_id | uuid | NOT NULL, FK → company(id) | Empresa |
| source_type | varchar | NOT NULL | Tipo: brasilapi, manual |
| last_sync_at | timestamptz | nullable | Ultima sincronizacao |
| sync_status | varchar | DEFAULT 'pending' | Status: pending, synced, error |
| year | integer | NOT NULL | Ano sincronizado |
| state_code | varchar(2) | nullable | UF |
| holidays_count | integer | DEFAULT 0 | Qtd feriados |
| created_at | timestamptz | DEFAULT now() | Data de criacao |

**Migration:** `202603080003--create_holiday_source.sql`

### calendar_day

Dias letivos detalhados (pode nao existir).

### mec_compliance_audit

Auditorias de compliance MEC (pode nao existir).

## Migrations Incluidas neste Pack

| Arquivo | O que faz |
|---------|-----------|
| `202603040003--create_company_blocked_day.sql` | Cria tabela company_blocked_day |
| `202603040005--add_company_event_id_to_schedule.sql` | Adiciona company_event_id ao schedule |
| `202603050001--add_archived_status_to_company_event.sql` | Adiciona archived_at a company_event |
| `202603080002--add_recurrence_columns_to_company_event.sql` | Adiciona colunas de recorrencia a company_event |
| `202603080003--create_holiday_source.sql` | Cria tabela holiday_source |

## Diagrama de Relacionamentos

```
academic_year ←──── academic_calendar.academic_year_id
company ←──── academic_calendar.company_id
company ←──── company_blocked_day.company_id
company ←──── company_event.company_id
company ←──── holiday_source.company_id
class_instance ←──── company_event.class_instance_id
company_event ←──── company_event.recurrence_parent_id (self-ref)
```

## Ordem de Execucao das Migrations

```bash
# 1. Verificar se academic_calendar e academic_year existem:
psql -c "\d academic_calendar"
psql -c "\d academic_year"

# Se NAO existirem, criar com os SQLs acima (secao "Tabelas EXISTENTES")

# 2. Rodar migrations na ordem:
psql -f 202603040003--create_company_blocked_day.sql
psql -f 202603040005--add_company_event_id_to_schedule.sql
psql -f 202603050001--add_archived_status_to_company_event.sql
psql -f 202603080002--add_recurrence_columns_to_company_event.sql
psql -f 202603080003--create_holiday_source.sql
```
