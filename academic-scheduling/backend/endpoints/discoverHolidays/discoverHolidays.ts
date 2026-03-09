import type { RequestHandler } from 'express';
import type { Pool } from 'pg';

import { requirePermission } from '../../app/auth/permissions';

export const method = 'get';
export const path = '/companies/:companyId/holidays/discover';

export const middlewares = [requirePermission('edu.class_instance.read')];

type Deps = { pool: Pool };

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

interface BrasilApiHoliday {
  date: string;
  name: string;
  type: string;
}

export function handler({ pool }: Deps): RequestHandler {
  return async (req, res, next) => {
    try {
      const { companyId } = req.params;
      const { year } = req.query as { year?: string };

      if (!year || !/^\d{4}$/.test(year)) {
        return res.status(400).json({ error: 'year query param is required (YYYY)' });
      }
      const yearNum = parseInt(year, 10);
      if (yearNum < 2000 || yearNum > 2100) {
        return res.status(400).json({ error: 'year must be between 2000 and 2100' });
      }

      // Get company address to determine state
      const tenantId = (req.headers['x-tenant-id'] as string | undefined) ?? null;
      const client = await pool.connect();
      let postalCode: string | null = null;
      try {
        const { rows } = await client.query<{ postal_code: string | null }>(
          `SELECT a.postal_code
             FROM address a
             JOIN address_assignment aa ON aa.address_id = a.id
            WHERE aa.owner_type = 'company'
              AND aa.owner_id = $1
              AND (aa.tenant_id IS NULL OR aa.tenant_id = COALESCE($2, aa.tenant_id))
              AND a.deleted_at IS NULL
            ORDER BY a.created_at ASC
            LIMIT 1`,
          [companyId, tenantId],
        );
        postalCode = rows[0]?.postal_code ?? null;
      } finally {
        client.release();
      }

      // Fetch national holidays from BrasilAPI
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      let brasilApiResponse: Response;
      try {
        brasilApiResponse = await fetch(
          `https://brasilapi.com.br/api/feriados/v1/${year}`,
          { signal: controller.signal },
        );
      } finally {
        clearTimeout(timeout);
      }

      if (!brasilApiResponse.ok) {
        return res.status(502).json({ error: `BrasilAPI returned ${brasilApiResponse.status}` });
      }

      const allHolidays = (await brasilApiResponse.json()) as BrasilApiHoliday[];

      // Separate national from state holidays
      const nationalHolidays = allHolidays.filter((h) => h.type === 'national');

      // Determine state from CEP
      const cepPrefix = postalCode ? postalCode.replace(/\D/g, '').substring(0, 2) : null;
      const stateCode = cepPrefix ? CEP_TO_STATE[cepPrefix] ?? null : null;

      // State holidays — BrasilAPI only returns national holidays for the feriados/v1 endpoint,
      // so we filter holidays that match the state type if present
      const stateHolidays = stateCode
        ? allHolidays.filter((h) => h.type === 'state')
        : [];

      const holidays = [
        ...nationalHolidays.map((h) => ({
          date: h.date,
          name: h.name,
          type: 'national' as const,
        })),
        ...stateHolidays.map((h) => ({
          date: h.date,
          name: h.name,
          type: 'state' as const,
          stateCode,
        })),
      ];

      res.json({
        companyId,
        year: yearNum,
        postalCode,
        stateCode,
        totalHolidays: holidays.length,
        holidays,
      });
    } catch (err) {
      next(err);
    }
  };
}
