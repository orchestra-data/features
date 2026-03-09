import type { RequestHandler } from 'express';
import type { Pool } from 'pg';

import { requirePermission } from '../../app/auth/permissions';

export const method = 'get';
export const path = '/companies/:companyId/events/export.ics';

export const middlewares = [requirePermission('company.read')];

type Deps = { pool: Pool };

function icalEscape(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function toICalDateUTC(dateStr: string | Date): string {
  const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function toICalDateOnly(dateStr: string): string {
  return dateStr.replace(/-/g, '');
}

/** RFC 5545 §3.1: fold lines at 75 octets */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [line.substring(0, 75)];
  let i = 75;
  while (i < line.length) {
    parts.push(' ' + line.substring(i, i + 74));
    i += 74;
  }
  return parts.join('\r\n');
}

/**
 * Convert event_type to Portuguese label for CATEGORIES
 */
function eventTypeLabel(t: string): string {
  const map: Record<string, string> = {
    aula: 'Aula',
    prova: 'Avaliacao',
    reuniao: 'Reuniao',
    conselho: 'Conselho de Classe',
    formacao: 'Formacao Docente',
    evento_institucional: 'Evento Institucional',
    recesso: 'Recesso',
    feriado: 'Feriado',
    reposicao: 'Reposicao',
    plantao: 'Plantao',
  };
  return map[t] || t || 'Evento';
}

export function handler({ pool }: Deps): RequestHandler {
  return async (req, res, next) => {
    try {
      const { companyId } = req.params;
      const tenantId = (req.headers['x-tenant-id'] as string | undefined) ?? null;

      const startDate = (req.query.startDate as string) || `${new Date().getFullYear()}-01-01`;
      const endDate = (req.query.endDate as string) || `${new Date().getFullYear()}-12-31`;
      const classInstanceId = req.query.classInstanceId as string | undefined;
      // format=google adds X-headers for better Google Calendar compatibility
      const format = (req.query.format as string) || 'standard';

      const classInstanceIds = classInstanceId
        ? classInstanceId.split(',').map((id) => id.trim()).filter(Boolean)
        : undefined;

      // 1. Events
      let eventQuery = `
        SELECT
          ce.id,
          ce.title,
          ce.description,
          ce.start_datetime AS "startDatetime",
          ce.end_datetime AS "endDatetime",
          ce.event_type AS "eventType",
          ce.status,
          ci.name AS "classInstanceName"
        FROM company_event ce
        LEFT JOIN class_instance ci ON ci.id = ce.class_instance_id
        WHERE ce.company_id = $1
          AND (ce.tenant_id IS NULL OR ce.tenant_id = $2)
          AND ce.deleted_at IS NULL AND ce.archived_at IS NULL
          AND ce.status != 'cancelled'
          AND ce.start_datetime >= $3::timestamptz
          AND ce.start_datetime <= $4::timestamptz`;

      const eventParams: unknown[] = [companyId, tenantId, startDate, endDate];

      if (classInstanceIds && classInstanceIds.length > 0) {
        eventParams.push(classInstanceIds);
        eventQuery += ` AND ce.class_instance_id = ANY($${eventParams.length})`;
      }
      eventQuery += ` ORDER BY ce.start_datetime ASC`;

      const { rows: events } = await pool.query(eventQuery, eventParams);

      // 2. Blocked days (holidays/feriados)
      const { rows: blockedDays } = await pool.query(
        `SELECT id, blocked_date AS "blockedDate", reason
         FROM company_blocked_day
         WHERE (company_id = $1 OR (company_id IS NULL AND tenant_id = $2))
           AND blocked_date >= $3::date AND blocked_date <= $4::date
         ORDER BY blocked_date ASC`,
        [companyId, tenantId, startDate, endDate],
      );

      // 3. Academic year info (for MEC metadata)
      const { rows: ayRows } = await pool.query(
        `SELECT ac.title, ac.year, ac.mec_compliance_enabled,
                ay.start_date, ay.end_date, ay.display_name
         FROM academic_calendar ac
         LEFT JOIN academic_year ay ON ac.academic_year_id = ay.id
         WHERE ac.tenant_id = $1
           AND (ac.company_id = $2 OR ac.company_id IS NULL)
           AND ac.academic_status != 'archived'
         ORDER BY ac.year DESC NULLS LAST LIMIT 1`,
        [tenantId, companyId],
      );
      const ay = ayRows[0] ?? null;

      // 4. Company info
      const { rows: companyRows } = await pool.query(
        `SELECT display_name, legal_name, registration_number FROM company WHERE id = $1 LIMIT 1`,
        [companyId],
      );
      const company = companyRows[0] ?? {};
      const companyName = company.display_name || company.legal_name || 'Instituicao';

      // 5. Stats for MEC description
      const totalEvents = events.length;
      const totalAulas = events.filter((e: any) => e.eventType === 'aula').length;
      const totalHolidays = blockedDays.length;

      // Build iCal
      const now = toICalDateUTC(new Date());
      const lines: string[] = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        `PRODID:-//Cogedu//Calendario Academico v2.0//PT-BR`,
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        `X-WR-CALNAME:${icalEscape(companyName)} - Calendario Academico`,
        'X-WR-TIMEZONE:America/Sao_Paulo',
      ];

      // Google Calendar compatibility headers
      if (format === 'google') {
        lines.push(`X-WR-CALDESC:${icalEscape(`Calendario academico de ${companyName}. ${totalAulas} aulas, ${totalHolidays} feriados.`)}`);
      }

      // VTIMEZONE for Brazil (required for proper Google Calendar import)
      lines.push(
        'BEGIN:VTIMEZONE',
        'TZID:America/Sao_Paulo',
        'BEGIN:STANDARD',
        'DTSTART:19700101T000000',
        'TZOFFSETFROM:-0300',
        'TZOFFSETTO:-0300',
        'TZNAME:BRT',
        'END:STANDARD',
        'END:VTIMEZONE',
      );

      // MEC compliance note as a special all-day event at period start
      if (ay?.mec_compliance_enabled) {
        const mecStart = ay.start_date
          ? toICalDateOnly(typeof ay.start_date === 'string' ? ay.start_date : ay.start_date.toISOString().split('T')[0])
          : toICalDateOnly(startDate);
        lines.push(
          'BEGIN:VEVENT',
          `UID:mec-compliance-${companyId}@cogedu.com`,
          `DTSTAMP:${now}`,
          `DTSTART;VALUE=DATE:${mecStart}`,
          foldLine(`SUMMARY:${icalEscape(`[MEC] ${ay.title || 'Ano Letivo'} - Calendario Oficial`)}`),
          foldLine(`DESCRIPTION:${icalEscape(
            `CALENDARIO ACADEMICO OFICIAL\\n` +
            `Instituicao: ${companyName}\\n` +
            (company.registration_number ? `CNPJ: ${company.registration_number}\\n` : '') +
            `Ano Letivo: ${ay.year || ''}\\n` +
            `Periodo: ${ay.start_date || startDate} a ${ay.end_date || endDate}\\n` +
            `Total de aulas programadas: ${totalAulas}\\n` +
            `Feriados/dias nao letivos: ${totalHolidays}\\n` +
            `\\nRef: LDB Art. 24 - Min. 200 dias letivos / 800h anuais\\n` +
            `Gerado por Cogedu em ${new Date().toLocaleDateString('pt-BR')}`
          )}`),
          'CATEGORIES:MEC,Compliance',
          'TRANSP:TRANSPARENT',
          'END:VEVENT',
        );
      }

      // Events
      for (const ev of events) {
        lines.push('BEGIN:VEVENT');
        lines.push(`UID:${ev.id}@cogedu.com`);
        lines.push(`DTSTAMP:${now}`);

        // Use TZID for proper timezone handling
        lines.push(`DTSTART;TZID=America/Sao_Paulo:${toICalDateUTC(ev.startDatetime).replace('Z', '')}`);
        if (ev.endDatetime) {
          lines.push(`DTEND;TZID=America/Sao_Paulo:${toICalDateUTC(ev.endDatetime).replace('Z', '')}`);
        }

        const titleParts = [ev.title || 'Evento'];
        if (ev.classInstanceName) titleParts.push(`(${ev.classInstanceName})`);
        lines.push(foldLine(`SUMMARY:${icalEscape(titleParts.join(' '))}`));

        if (ev.description) {
          lines.push(foldLine(`DESCRIPTION:${icalEscape(ev.description)}`));
        }

        lines.push(`CATEGORIES:${eventTypeLabel(ev.eventType)}`);

        // Status mapping
        if (ev.status === 'confirmed') lines.push('STATUS:CONFIRMED');
        else if (ev.status === 'tentative') lines.push('STATUS:TENTATIVE');

        lines.push('END:VEVENT');
      }

      // Blocked days as all-day events
      for (const bd of blockedDays) {
        const dateStr = typeof bd.blockedDate === 'string'
          ? bd.blockedDate
          : bd.blockedDate.toISOString().split('T')[0];

        lines.push('BEGIN:VEVENT');
        lines.push(`UID:feriado-${bd.id}@cogedu.com`);
        lines.push(`DTSTAMP:${now}`);
        lines.push(`DTSTART;VALUE=DATE:${toICalDateOnly(dateStr)}`);
        lines.push(foldLine(`SUMMARY:${icalEscape(`🔴 ${bd.reason || 'Feriado'}`)}`));
        lines.push(foldLine(`DESCRIPTION:${icalEscape(`Dia nao letivo - ${bd.reason || 'Feriado'}\\nCalendario academico oficial`)}`));
        lines.push('CATEGORIES:Feriado,Dia Nao Letivo');
        lines.push('TRANSP:TRANSPARENT');
        lines.push('END:VEVENT');
      }

      lines.push('END:VCALENDAR');

      const icsContent = lines.map((l) => foldLine(l)).join('\r\n') + '\r\n';

      const safeCompanyName = companyName.replace(/[^a-zA-Z0-9_-]/g, '-').substring(0, 50);
      const filename = `calendario-academico-${safeCompanyName}-${startDate.substring(0, 4)}.ics`;

      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      // Allow CORS for webcal:// subscription
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.send(icsContent);
    } catch (err) {
      next(err);
    }
  };
}
