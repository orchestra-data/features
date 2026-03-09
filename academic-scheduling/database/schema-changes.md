# Schema Changes: academic-scheduling

> Gerado automaticamente em 2026-03-09T08:51:00Z
> REVISAR E COMPLETAR com colunas reais via \d tabela

## Tabelas Afetadas

### company_event
| Coluna | Tipo | Constraint |
|--------|------|------------|
| id | uuid | PK |
| name | varchar(255) | NOT NULL |
| event_type | varchar(50) | NOT NULL |
| start_datetime | timestamptz | NOT NULL |
| end_datetime | timestamptz | NOT NULL |
| is_recurring | boolean | DEFAULT false |
| recurrence_rule | jsonb | nullable |
| recurrence_parent_id | uuid | FK → company_event(id) |
| class_instance_id | uuid | FK → class_instance(id) |
| company_id | uuid | FK → company(id) |
| created_by_user_id | uuid | FK → user(id) |

> ⚠️ CONFIRMAR colunas com `\d company_event` no psql antes de usar

## Constraints Importantes

- `component_type` CHECK: live_session, video_lesson, video_lesson_playlist, reading_material, assignment, quiz, interactive_content, forum_post, survey
- UUIDs: SOMENTE hex válido (0-9, a-f)
- `start_datetime` / `end_datetime`: NUNCA usar start_date/end_date
- `created_by_user_id`: NUNCA usar created_by

## Diagrama

```
company_event ──FK──> company
company_event ──FK──> class_instance
company_event ──FK──> user (created_by_user_id)
company_event ──FK──> company_event (recurrence_parent_id, self-ref)
```
