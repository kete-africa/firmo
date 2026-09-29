import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { db, getPool } from '@/platform/db';
import { manifest } from '@/platform/service';
import { inOrganization } from '@/platform/tenancy';

// Phase 0: the application role cannot bypass row-level security, and the organization is set
// per transaction only.

afterAll(async () => {
  await getPool().end();
});

describe('the foundation', () => {
  it('connects with a role that cannot bypass row-level security', async () => {
    const { rows } = await db.execute<{ bypass: boolean; superuser: boolean }>(
      sql`select rolbypassrls as bypass, rolsuper as superuser from pg_roles where rolname = current_user`,
    );
    expect(rows).toEqual([{ bypass: false, superuser: false }]);
  });

  it('sees an organization only inside its transaction', async () => {
    const inside = await inOrganization('org_a', (tx) =>
      tx.execute<{ id: string | null }>(sql`select public.current_organization_id() as id`),
    );
    expect(inside.rows).toEqual([{ id: 'org_a' }]);
    const outside = await db.execute<{ id: string | null }>(
      sql`select public.current_organization_id() as id`,
    );
    expect(outside.rows).toEqual([{ id: null }]);
  });

  it('describes itself to Kete Cockpit', () => {
    expect(manifest()).toMatchObject({
      product: 'prd_firmo',
      name: 'Firmo',
      events: ['document.issued', 'document.shared', 'ai.usage'],
    });
  });
});
