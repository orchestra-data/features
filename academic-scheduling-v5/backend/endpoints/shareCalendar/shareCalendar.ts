import type { RequestHandler } from 'express';
import type { Pool } from 'pg';
import { createHmac, randomBytes } from 'crypto';

import { requirePermission } from '../../app/auth/permissions';

export const method = 'post';
export const path = '/companies/:companyId/calendar/share';

export const middlewares = [requirePermission('company.read')];

const SHARE_SECRET = process.env.CALENDAR_SHARE_SECRET || 'cogedu-calendar-share-2026';

type Deps = { pool: Pool };

export function handler({ pool }: Deps): RequestHandler {
  return async (req, res, next) => {
    try {
      const { companyId } = req.params;
      const tenantId = (req.headers['x-tenant-id'] as string | undefined) ?? null;
      const body = req.body as {
        permission?: 'read' | 'suggest';
        expiryDays?: number;
      };

      // Verify company exists
      const { rows } = await pool.query(
        `SELECT id, display_name FROM company WHERE id = $1 AND (tenant_id IS NULL OR tenant_id = $2) AND deleted_at IS NULL`,
        [companyId, tenantId]
      );
      if (rows.length === 0) {
        return res.status(404).json({ error: 'Company not found' });
      }

      const permission = body.permission || 'read';
      const expiryDays = body.expiryDays || 30;
      const expiresAt = expiryDays > 0 ? Date.now() + expiryDays * 86400000 : null;

      const payload = JSON.stringify({
        cid: companyId,
        tid: tenantId,
        perm: permission,
        exp: expiresAt,
        iat: Date.now(),
        nonce: randomBytes(8).toString('hex'),
      });

      const signature = createHmac('sha256', SHARE_SECRET).update(payload).digest('hex').slice(0, 16);
      const token = Buffer.from(payload).toString('base64url') + '.' + signature;

      res.json({
        token,
        permission,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        companyName: rows[0].display_name,
      });
    } catch (err) {
      next(err);
    }
  };
}
