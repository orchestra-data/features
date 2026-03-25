import type { RequestHandler } from 'express';
import type { Pool } from 'pg';
import { createHmac } from 'crypto';

export const method = 'get';
export const path = '/calendar/shared/:token';
export const auth = false; // Public endpoint — no auth required

export const middlewares: RequestHandler[] = [];

const SHARE_SECRET = process.env.CALENDAR_SHARE_SECRET || 'cogedu-calendar-share-2026';

type Deps = { pool: Pool };

export function handler({ pool }: Deps): RequestHandler {
  return async (req, res, next) => {
    try {
      const { token } = req.params;

      // Parse token
      const parts = token.split('.');
      if (parts.length !== 2) {
        return res.status(400).json({ error: 'Invalid share token' });
      }

      const [payloadB64, sig] = parts;
      let payload: string;
      try {
        payload = Buffer.from(payloadB64, 'base64url').toString('utf8');
      } catch {
        return res.status(400).json({ error: 'Invalid token encoding' });
      }

      // Verify signature
      const expectedSig = createHmac('sha256', SHARE_SECRET).update(payload).digest('hex').slice(0, 16);
      if (sig !== expectedSig) {
        return res.status(403).json({ error: 'Invalid token signature' });
      }

      const data = JSON.parse(payload) as {
        cid: string;
        tid: string | null;
        perm: string;
        exp: number | null;
        iat: number;
      };

      // Check expiry
      if (data.exp && Date.now() > data.exp) {
        return res.status(410).json({ error: 'Share link expired' });
      }

      // Fetch events
      const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };
      const effectiveStart = startDate || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
      const effectiveEnd = endDate || new Date(new Date().getFullYear(), new Date().getMonth() + 3, 0).toISOString().split('T')[0];

      const { rows: events } = await pool.query(
        `SELECT
           id, title, event_type, start_datetime, end_datetime,
           class_instance_id, status
         FROM company_event
         WHERE company_id = $1
           AND (tenant_id IS NULL OR tenant_id = $2)
           AND deleted_at IS NULL AND archived_at IS NULL
           AND status != 'cancelled'
           AND start_datetime >= $3::timestamptz
           AND start_datetime <= $4::timestamptz
         ORDER BY start_datetime`,
        [data.cid, data.tid, effectiveStart, effectiveEnd]
      );

      // Get company name
      const { rows: companyRows } = await pool.query(
        `SELECT display_name FROM company WHERE id = $1`,
        [data.cid]
      );

      res.json({
        companyName: companyRows[0]?.display_name || 'Calendario Compartilhado',
        permission: data.perm,
        events: events.map(e => ({
          id: e.id,
          title: e.title,
          eventType: e.event_type,
          start: e.start_datetime,
          end: e.end_datetime,
          status: e.status,
        })),
        totalEvents: events.length,
      });
    } catch (err) {
      next(err);
    }
  };
}
