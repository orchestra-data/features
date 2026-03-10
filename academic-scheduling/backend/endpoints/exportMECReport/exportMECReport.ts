import type { RequestHandler } from 'express';
import type { Pool } from 'pg';

import { requirePermission } from '../../app/auth/permissions';

export const method = 'get';
export const path = '/companies/:companyId/academic-years/:calendarId/mec-report';

export const middlewares = [requirePermission('edu.class_instance.read')];

type Deps = { pool: Pool };

const MEC_DEFAULTS: Record<string, { minDays: number; minHours: number; label: string }> = {
  infantil:           { minDays: 200, minHours: 800, label: 'Educacao Infantil' },
  fundamental_1:      { minDays: 200, minHours: 800, label: 'Ensino Fundamental I' },
  fundamental_2:      { minDays: 200, minHours: 800, label: 'Ensino Fundamental II' },
  medio:              { minDays: 200, minHours: 800, label: 'Ensino Medio' },
  medio_tecnico:      { minDays: 200, minHours: 800, label: 'Ensino Medio Tecnico' },
  superior_anual:     { minDays: 200, minHours: 800, label: 'Ensino Superior (Anual)' },
  superior_semestral: { minDays: 100, minHours: 400, label: 'Ensino Superior (Semestral)' },
};

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function handler({ pool }: Deps): RequestHandler {
  return async (req, res, next) => {
    try {
      const { companyId, calendarId } = req.params;
      const tenantId = (req.headers['x-tenant-id'] as string | undefined) ?? null;

      // 1. Calendar + Year info
      const { rows: calRows } = await pool.query(
        `SELECT
           ac.id, ac.title, ac.year, ac.semester,
           ac.academic_status AS "status",
           ac.mec_compliance_enabled AS "mecEnabled",
           ac.education_level AS "educationLevel",
           ac.academic_regime AS "regime",
           ay.start_date AS "startDate",
           ay.end_date AS "endDate",
           ay.display_name AS "yearName"
         FROM academic_calendar ac
         LEFT JOIN academic_year ay ON ac.academic_year_id = ay.id
         WHERE ac.id = $1 AND ac.tenant_id = $2
           AND (ac.company_id = $3 OR ac.company_id IS NULL)`,
        [calendarId, tenantId, companyId],
      );

      if (calRows.length === 0) {
        return res.status(404).json({ error: 'Academic calendar not found' });
      }

      const cal = calRows[0];
      const effectiveStart = cal.startDate ?? `${cal.year}-01-01`;
      const effectiveEnd = cal.endDate ?? `${cal.year}-12-31`;

      // 2. Company info
      const { rows: companyRows } = await pool.query(
        `SELECT display_name, legal_name, registration_number FROM company WHERE id = $1 LIMIT 1`,
        [companyId],
      );
      const company = companyRows[0] ?? {};
      const companyName = company.display_name || company.legal_name || 'Instituicao';

      // 3. Business days
      const { rows: bizRows } = await pool.query(
        `SELECT COUNT(*)::integer AS count
         FROM generate_series($1::date, $2::date, '1 day'::interval) AS d
         WHERE EXTRACT(DOW FROM d) NOT IN (0, 6)`,
        [effectiveStart, effectiveEnd],
      );
      const totalBusinessDays = parseInt(bizRows[0].count, 10);

      // 4. Blocked days
      const { rows: blockedRows } = await pool.query(
        `SELECT blocked_date AS "date", reason
         FROM company_blocked_day
         WHERE (company_id = $1 OR (company_id IS NULL AND tenant_id = $2))
           AND blocked_date >= $3::date AND blocked_date <= $4::date
           AND EXTRACT(DOW FROM blocked_date) NOT IN (0, 6)
         ORDER BY blocked_date ASC`,
        [companyId, tenantId, effectiveStart, effectiveEnd],
      );
      const blockedOnBusinessDays = blockedRows.length;

      // 5. All holidays in range (including weekends)
      const { rows: allHolidays } = await pool.query(
        `SELECT blocked_date AS "date", reason
         FROM company_blocked_day
         WHERE (company_id = $1 OR (company_id IS NULL AND tenant_id = $2))
           AND blocked_date >= $3::date AND blocked_date <= $4::date
         ORDER BY blocked_date ASC`,
        [companyId, tenantId, effectiveStart, effectiveEnd],
      );

      // 6. Events (aulas)
      const { rows: eventStats } = await pool.query(
        `SELECT
           COUNT(*)::integer AS "totalEvents",
           COUNT(*) FILTER (WHERE event_type = 'aula')::integer AS "totalAulas",
           COALESCE(SUM(EXTRACT(EPOCH FROM (end_datetime - start_datetime)) / 3600)
             FILTER (WHERE event_type = 'aula'), 0) AS "totalAulaHours"
         FROM company_event
         WHERE company_id = $1
           AND (tenant_id IS NULL OR tenant_id = $2)
           AND deleted_at IS NULL AND archived_at IS NULL
           AND status != 'cancelled'
           AND start_datetime >= $3::timestamptz
           AND start_datetime <= $4::timestamptz`,
        [companyId, tenantId, effectiveStart, effectiveEnd],
      );
      const es = eventStats[0];

      // 7. Calendar_day stats if populated (table may not exist yet)
      let ds = { instructionalDays: 0, instructionalHours: '0', totalDays: 0 };
      try {
        const { rows: dayStats } = await pool.query(
          `SELECT
             COUNT(*) FILTER (WHERE is_instructional = true)::integer AS "instructionalDays",
             COALESCE(SUM(instructional_hours) FILTER (WHERE is_instructional = true), 0)::numeric AS "instructionalHours",
             COUNT(*)::integer AS "totalDays"
           FROM calendar_day
           WHERE academic_calendar_id = $1`,
          [calendarId],
        );
        ds = dayStats[0] ?? ds;
      } catch {
        // calendar_day table may not exist yet
      }

      // 8. Compliance calculation
      const mecDefaults = MEC_DEFAULTS[cal.educationLevel ?? 'medio'] ?? MEC_DEFAULTS.medio;
      const instructionalDays = ds.totalDays > 0
        ? ds.instructionalDays
        : totalBusinessDays - blockedOnBusinessDays;
      const instructionalHours = parseFloat(ds.instructionalHours) > 0
        ? parseFloat(parseFloat(ds.instructionalHours).toFixed(1))
        : parseFloat(parseFloat(es.totalAulaHours).toFixed(1));

      const schoolDaysMet = instructionalDays >= mecDefaults.minDays;
      const hoursMet = instructionalHours >= mecDefaults.minHours;
      const schoolDaysPercent = Math.min(Math.round((instructionalDays / mecDefaults.minDays) * 100), 100);
      const hoursPercent = Math.min(Math.round((instructionalHours / mecDefaults.minHours) * 100), 100);

      let complianceStatus: string;
      if (schoolDaysMet && hoursMet) complianceStatus = 'CONFORME';
      else if (schoolDaysPercent >= 80 && hoursPercent >= 80) complianceStatus = 'ATENCAO';
      else complianceStatus = 'NAO CONFORME';

      const statusColor = complianceStatus === 'CONFORME' ? '#16a34a'
        : complianceStatus === 'ATENCAO' ? '#ca8a04' : '#dc2626';

      // Format dates for display
      const fmtDate = (d: string | Date) => {
        const dt = typeof d === 'string' ? new Date(d + 'T12:00:00') : d;
        return dt.toLocaleDateString('pt-BR');
      };

      const now = new Date().toLocaleDateString('pt-BR');
      const nowFull = new Date().toLocaleString('pt-BR');

      // Build holiday table rows
      const holidayRows = allHolidays.map((h: any) =>
        `<tr><td>${fmtDate(h.date)}</td><td>${escapeHtml(h.reason || 'Feriado')}</td></tr>`
      ).join('');

      // Generate HTML report
      const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Relatorio de Compliance MEC - ${escapeHtml(companyName)} - ${cal.year || ''}</title>
  <style>
    @media print {
      body { margin: 0; }
      .no-print { display: none !important; }
      @page { margin: 2cm; size: A4; }
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; color: #1a1a1a; line-height: 1.5; background: #f5f5f5; }
    .container { max-width: 800px; margin: 0 auto; background: white; padding: 48px; }
    .header { border-bottom: 3px solid #1a1a1a; padding-bottom: 24px; margin-bottom: 32px; }
    .header h1 { font-size: 22px; font-weight: 700; }
    .header h2 { font-size: 16px; font-weight: 400; color: #666; margin-top: 4px; }
    .badge { display: inline-block; padding: 4px 16px; border-radius: 4px; font-weight: 700; font-size: 14px; color: white; background: ${statusColor}; }
    .section { margin-bottom: 28px; }
    .section-title { font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #666; border-bottom: 1px solid #e5e5e5; padding-bottom: 8px; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #e5e5e5; }
    th { font-weight: 600; color: #666; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
    .value { font-weight: 600; font-size: 15px; }
    .met { color: #16a34a; }
    .not-met { color: #dc2626; }
    .progress-bar { height: 8px; border-radius: 4px; background: #e5e5e5; overflow: hidden; margin-top: 4px; }
    .progress-fill { height: 100%; border-radius: 4px; }
    .footer { margin-top: 48px; padding-top: 24px; border-top: 2px solid #e5e5e5; font-size: 11px; color: #999; }
    .legal-ref { background: #f8f8f8; padding: 16px; border-radius: 8px; font-size: 12px; color: #666; margin-top: 16px; }
    .stamp { border: 2px solid ${statusColor}; border-radius: 8px; padding: 16px; text-align: center; margin: 24px 0; }
    .btn-print { position: fixed; bottom: 24px; right: 24px; background: #1a1a1a; color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-size: 14px; box-shadow: 0 2px 8px rgba(0,0,0,0.2); }
    .btn-print:hover { background: #333; }
  </style>
</head>
<body>
  <button class="btn-print no-print" onclick="window.print()">Imprimir / Salvar PDF</button>

  <div class="container">
    <div class="header">
      <h1>RELATORIO DE CONFORMIDADE DO CALENDARIO ACADEMICO</h1>
      <h2>${escapeHtml(companyName)}${company.registration_number ? ` — CNPJ: ${escapeHtml(company.registration_number)}` : ''}</h2>
    </div>

    <!-- Status Stamp -->
    <div class="stamp">
      <div style="font-size: 12px; color: #666; margin-bottom: 8px;">STATUS DE CONFORMIDADE MEC</div>
      <div class="badge">${complianceStatus}</div>
      <div style="font-size: 11px; color: #999; margin-top: 8px;">Gerado em ${nowFull}</div>
    </div>

    <!-- Identification -->
    <div class="section">
      <div class="section-title">Identificacao</div>
      <table>
        <tr><td style="width:200px;color:#666">Instituicao</td><td class="value">${escapeHtml(companyName)}</td></tr>
        ${company.registration_number ? `<tr><td style="color:#666">CNPJ</td><td class="value">${escapeHtml(company.registration_number)}</td></tr>` : ''}
        <tr><td style="color:#666">Ano Letivo</td><td class="value">${escapeHtml(cal.title || `${cal.year}`)}</td></tr>
        <tr><td style="color:#666">Periodo</td><td class="value">${fmtDate(effectiveStart)} a ${fmtDate(effectiveEnd)}</td></tr>
        <tr><td style="color:#666">Regime</td><td class="value">${cal.regime === 'semestral' ? 'Semestral' : 'Anual'}${cal.semester ? ` — ${cal.semester}º Semestre` : ''}</td></tr>
        <tr><td style="color:#666">Nivel de Ensino</td><td class="value">${escapeHtml(mecDefaults.label)}</td></tr>
      </table>
    </div>

    <!-- Compliance Summary -->
    <div class="section">
      <div class="section-title">Indicadores de Conformidade — LDB Art. 24</div>
      <table>
        <tr>
          <td style="width:200px;color:#666">Dias Letivos</td>
          <td>
            <span class="value ${schoolDaysMet ? 'met' : 'not-met'}">${instructionalDays}</span>
            <span style="color:#999"> / ${mecDefaults.minDays} minimo</span>
            <span style="float:right;font-weight:600" class="${schoolDaysMet ? 'met' : 'not-met'}">${schoolDaysPercent}%</span>
            <div class="progress-bar">
              <div class="progress-fill" style="width:${schoolDaysPercent}%;background:${schoolDaysMet ? '#16a34a' : schoolDaysPercent >= 80 ? '#ca8a04' : '#dc2626'}"></div>
            </div>
          </td>
        </tr>
        <tr>
          <td style="color:#666">Carga Horaria</td>
          <td>
            <span class="value ${hoursMet ? 'met' : 'not-met'}">${instructionalHours}h</span>
            <span style="color:#999"> / ${mecDefaults.minHours}h minimo</span>
            <span style="float:right;font-weight:600" class="${hoursMet ? 'met' : 'not-met'}">${hoursPercent}%</span>
            <div class="progress-bar">
              <div class="progress-fill" style="width:${hoursPercent}%;background:${hoursMet ? '#16a34a' : hoursPercent >= 80 ? '#ca8a04' : '#dc2626'}"></div>
            </div>
          </td>
        </tr>
      </table>
    </div>

    <!-- Stats Detail -->
    <div class="section">
      <div class="section-title">Detalhamento</div>
      <table>
        <tr><td style="width:250px;color:#666">Dias uteis no periodo</td><td class="value">${totalBusinessDays}</td></tr>
        <tr><td style="color:#666">Feriados em dias uteis</td><td class="value">${blockedOnBusinessDays}</td></tr>
        <tr><td style="color:#666">Dias letivos efetivos</td><td class="value">${instructionalDays}</td></tr>
        <tr><td style="color:#666">Aulas agendadas</td><td class="value">${es.totalAulas}</td></tr>
        <tr><td style="color:#666">Horas-aula agendadas</td><td class="value">${parseFloat(parseFloat(es.totalAulaHours).toFixed(1))}h</td></tr>
        <tr><td style="color:#666">Total de eventos</td><td class="value">${es.totalEvents}</td></tr>
      </table>
    </div>

    <!-- Holidays -->
    <div class="section">
      <div class="section-title">Feriados e Dias Nao Letivos (${allHolidays.length})</div>
      ${allHolidays.length > 0
        ? `<table><thead><tr><th>Data</th><th>Descricao</th></tr></thead><tbody>${holidayRows}</tbody></table>`
        : '<p style="color:#999;font-size:13px;">Nenhum feriado cadastrado para este periodo.</p>'}
    </div>

    <!-- Legal Reference -->
    <div class="legal-ref">
      <strong>Fundamentacao Legal</strong><br>
      <strong>LDB — Lei nº 9.394/1996</strong><br>
      <strong>Art. 24, I:</strong> A carga horaria minima anual sera de oitocentas horas para o ensino fundamental e para o ensino medio, distribuidas por um minimo de duzentos dias de efetivo trabalho escolar, excluido o tempo reservado aos exames finais, quando houver.<br><br>
      <strong>Art. 47 (Ensino Superior):</strong> Na educacao superior, o ano letivo regular, independente do ano civil, tem, no minimo, duzentos dias de trabalho academico efetivo, excluido o tempo reservado aos exames finais, quando houver.
    </div>

    <!-- Footer -->
    <div class="footer">
      <p>Documento gerado automaticamente pelo sistema Cogedu em ${nowFull}.</p>
      <p>Este relatorio tem carater informativo e auxilia no acompanhamento do cumprimento das exigencias legais do MEC referentes ao calendario academico.</p>
      <p style="margin-top:8px">Calendario ID: ${calendarId}</p>
    </div>
  </div>
</body>
</html>`;

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (err) {
      next(err);
    }
  };
}
