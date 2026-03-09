import type { RequestHandler } from 'express';

import { requirePermission } from '../../app/auth/permissions';

export const method = 'get';

export const middlewares = [requirePermission('edu.class_instance.read')];

export type Deps = Record<string, never>;

export function handler(_deps: Deps): RequestHandler {
  return async (req, res, next) => {
    try {
      const { year } = req.query as { year?: string };

      if (!year || !/^\d{4}$/.test(year)) {
        return res.status(400).json({ error: 'year query param is required (YYYY)' });
      }
      const yearNum = parseInt(year, 10);
      if (yearNum < 2000 || yearNum > 2100) {
        return res.status(400).json({ error: 'year must be between 2000 and 2100' });
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      let response: Response;
      try {
        response = await fetch(`https://brasilapi.com.br/api/feriados/v1/${year}`, {
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        return res.status(502).json({ error: `BrasilAPI returned ${response.status}` });
      }

      const holidays = await response.json();
      res.json({ holidays });
    } catch (err) {
      next(err);
    }
  };
}
