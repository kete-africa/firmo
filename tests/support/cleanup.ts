import type pg from 'pg';

/**
 * Removes test organizations' rows, as the owner role — including issued documents, which the
 * application role can never delete (their guards are paused for the time of the deletion).
 */
export async function purgeOrganizations(owner: pg.Pool, organizations: string[]): Promise<void> {
  if (organizations.length === 0) return;
  const guards: [string, string][] = [
    ['documents', 'documents_guard_issued_delete'],
    ['document_sections', 'document_sections_guard'],
    ['document_lines', 'document_lines_guard'],
    ['document_adjustments', 'document_adjustments_guard'],
    ['document_clauses', 'document_clauses_guard'],
  ];
  const client = await owner.connect();
  try {
    await client.query('begin');
    for (const [table, trigger] of guards)
      await client.query(`alter table ${table} disable trigger ${trigger}`);
    for (const table of [
      'conversations',
      'messaging_identities',
      'document_payments',
      'documents',
    ]) {
      await client.query(`delete from ${table} where organization_id = any($1)`, [organizations]);
    }
    for (const table of [
      'frequent_items',
      'document_counters',
      'numbering_settings',
      'clauses',
      'clients',
      'organization_profiles',
    ]) {
      await client.query(`delete from ${table} where organization_id = any($1)`, [organizations]);
    }
    for (const [table, trigger] of guards)
      await client.query(`alter table ${table} enable trigger ${trigger}`);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
