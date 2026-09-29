import { randomBytes } from 'node:crypto';
import { memoryStorage } from '@kete/files';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDocuments, DocumentError, type DraftInput } from '@/features/documents';
import { getPool } from '@/platform/db';
import { inOrganization } from '@/platform/tenancy';
import { typstRenderer } from '@/platform/typst';
import { sql } from 'drizzle-orm';

// Phase 1 proofs on the Neon "test" branch, as the application role: a document is drafted,
// previewed, issued with its number burnt and its content frozen; converted, revised, paid; and
// two organizations never see each other's documents.

const run = randomBytes(4).toString('hex');
const A = { organizationId: `org_docs_a_${run}` };
const B = { organizationId: `org_docs_b_${run}` };
const files = memoryStorage();
const documents = createDocuments({
  renderer: typstRenderer(),
  files,
  now: () => new Date('2026-09-29T10:00:00Z'),
});
const owner = new pg.Pool({ connectionString: process.env.FIRMO_TEST_OWNER_URL, max: 1 });

const portal: DraftInput = {
  type: 'quote',
  subject: 'Portail et garde-corps',
  client: { name: 'société Bati Plus' },
  sections: [
    {
      title: 'Portail coulissant',
      showSubtotal: true,
      lines: [
        { label: 'Tube rectangulaire 80 x 40', unit: 'barre', quantity: '12', unitPrice: '18000' },
        { label: 'Tôle noire 20/10', unit: 'feuille', quantity: '4', unitPrice: '32000' },
      ],
    },
    {
      title: 'Garde-corps',
      showSubtotal: true,
      lines: [
        { label: 'Tube carré 40 x 40', unit: 'barre', quantity: '8', unitPrice: '15000' },
        { label: 'Peinture antirouille', unit: 'boîte', quantity: '2', unitPrice: '18000' },
      ],
    },
  ],
  adjustments: [
    { label: "Main-d'œuvre", mode: 'percent', value: '25' },
    { label: 'Transport et pose', mode: 'fixed', value: '30000' },
  ],
  depositPercent: '30',
};

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'no error';
  } catch (error) {
    return error instanceof DocumentError ? error.code : String(error);
  }
}

beforeAll(async () => {
  await documents.saveProfile(A, {
    name: 'Atelier Kodjo',
    trade: 'Chaudronnerie',
    brandColor: '#A8391F',
  });
  await documents.saveProfile(B, { name: 'Menuiserie Béni' });
});

afterAll(async () => {
  for (const org of [A.organizationId, B.organizationId]) {
    // The owner may delete what the application role never can: issued documents.
    await owner.query('alter table documents disable trigger documents_guard_issued_delete');
    await owner.query('alter table document_sections disable trigger document_sections_guard');
    await owner.query('alter table document_lines disable trigger document_lines_guard');
    await owner.query(
      'alter table document_adjustments disable trigger document_adjustments_guard',
    );
    await owner.query('alter table document_clauses disable trigger document_clauses_guard');
    await owner.query('delete from document_payments where organization_id = $1', [org]);
    await owner.query('delete from documents where organization_id = $1', [org]);
    await owner.query('alter table documents enable trigger documents_guard_issued_delete');
    await owner.query('alter table document_sections enable trigger document_sections_guard');
    await owner.query('alter table document_lines enable trigger document_lines_guard');
    await owner.query('alter table document_adjustments enable trigger document_adjustments_guard');
    await owner.query('alter table document_clauses enable trigger document_clauses_guard');
    for (const table of [
      'frequent_items',
      'document_counters',
      'numbering_settings',
      'clauses',
      'clients',
      'organization_profiles',
    ]) {
      await owner.query(`delete from ${table} where organization_id = $1`, [org]);
    }
  }
  await owner.end();
  await getPool().end();
});

describe('a document, from draft to issued', () => {
  let quoteId = 0;
  let quoteNumber = '';

  it('drafts and previews with the exact totals, marked as a draft', async () => {
    quoteId = await documents.createDraft(A, portal);
    const preview = await documents.preview(A, quoteId);
    expect(preview.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(Buffer.from(preview.pdf.subarray(0, 5)).toString('latin1')).toBe('%PDF-');
  });

  it('refuses to issue what the tradesman did not see', async () => {
    expect(await codeOf(documents.issue(A, quoteId, { sha256: '0'.repeat(64) }))).toBe(
      'draft_changed',
    );
  });

  it('issues: burns the number, freezes the snapshot and keeps the PDF', async () => {
    const { sha256 } = await documents.preview(A, quoteId);
    const issued = await documents.issue(A, quoteId, { sha256 });
    expect(issued.number).toBe('DEV-2026-001');
    quoteNumber = issued.number;
    const stored = await documents.get(A, quoteId);
    expect(stored.state).toBe('issued');
    expect((stored.snapshot?.document as Record<string, unknown>).grand_total).toBe('655000');
    expect((await documents.pdf(A, quoteId)).pdf.length).toBeGreaterThan(1000);
    // Repeating the same confirmation returns the same document, without a second number.
    const again = await documents.issue(A, quoteId, { sha256 });
    expect(again).toMatchObject({ number: quoteNumber, repeated: true });
  });

  it('keeps an issued document immutable, in the code and in the database', async () => {
    expect(await codeOf(documents.updateDraft(A, quoteId, portal))).toBe('not_a_draft');
    // The database refuses it too, even to the application's own role (the error is the cause).
    const refusal = async (query: ReturnType<typeof sql>) => {
      try {
        await inOrganization(A.organizationId, (tx) => tx.execute(query));
        return 'accepted';
      } catch (error) {
        return String((error as { cause?: Error }).cause?.message ?? error);
      }
    };
    expect(
      await refusal(sql`update documents set subject = 'Changed' where id = ${quoteId}`),
    ).toMatch(/immutable/);
    expect(
      await refusal(sql`update document_lines set unit_price = 1 where section_id in
        (select id from document_sections where document_id = ${quoteId})`),
    ).toMatch(/immutable/);
    expect(await refusal(sql`delete from documents where id = ${quoteId}`)).toMatch(
      /cannot be deleted/,
    );
  });

  it('numbers the next quote in the same series', async () => {
    const id = await documents.createDraft(A, { ...portal, subject: 'Second portail' });
    const { sha256 } = await documents.preview(A, id);
    expect((await documents.issue(A, id, { sha256 })).number).toBe('DEV-2026-002');
  });

  it('revises an issued quote as /R2 of its root, without consuming the series', async () => {
    const revisionId = await documents.revise(A, quoteId);
    const { sha256 } = await documents.preview(A, revisionId);
    expect((await documents.issue(A, revisionId, { sha256 })).number).toBe(`${quoteNumber}/R2`);
  });

  it('converts the quote to an invoice without retyping, then records payments within the balance', async () => {
    const invoiceId = await documents.convert(A, quoteId, 'invoice');
    const draft = await documents.get(A, invoiceId);
    expect(draft).toMatchObject({ type: 'invoice', state: 'draft', sourceDocumentId: quoteId });
    const { sha256 } = await documents.preview(A, invoiceId);
    expect((await documents.issue(A, invoiceId, { sha256 })).number).toBe('FAC-2026-001');
    expect(
      await documents.recordPayment(A, invoiceId, {
        amount: '196500',
        paidOn: '2026-09-29',
        method: 'Mobile money',
      }),
    ).toEqual({ paidTotal: '196500', balanceDue: '458500' });
    expect(
      await codeOf(
        documents.recordPayment(A, invoiceId, {
          amount: '458501',
          paidOn: '2026-09-29',
          method: 'Espèces',
        }),
      ),
    ).toBe('not_available');
    expect(await codeOf(documents.convert(A, invoiceId, 'quote'))).toBe('not_available');
  });

  it('accepts a manual number once, and never one of the automatic series', async () => {
    const first = await documents.createDraft(A, { ...portal, subject: 'Manuel' });
    const { sha256 } = await documents.preview(A, first);
    expect(await codeOf(documents.issue(A, first, { sha256, manualNumber: 'DEV-2026-050' }))).toBe(
      'invalid_input',
    );
    expect((await documents.issue(A, first, { sha256, manualNumber: 'MAIRIE-7' })).number).toBe(
      'MAIRIE-7',
    );
    const second = await documents.createDraft(A, { ...portal, subject: 'Manuel bis' });
    const preview = await documents.preview(A, second);
    expect(
      await codeOf(
        documents.issue(A, second, { sha256: preview.sha256, manualNumber: 'MAIRIE-7' }),
      ),
    ).toBe('number_taken');
  });

  it('never issues a line whose value Firmo could not read', async () => {
    const id = await documents.createDraft(A, {
      ...portal,
      sections: [{ lines: [{ label: 'Tôle', quantity: '2', confirmationRequired: true }] }],
      adjustments: [],
    });
    expect(await codeOf(documents.preview(A, id))).toBe('not_issuable');
  });
});

describe('two organizations', () => {
  it("never see, change or issue each other's documents (not found, never forbidden)", async () => {
    const theirs = await documents.createDraft(B, { ...portal, subject: 'Porte en bois' });
    expect(await codeOf(documents.get(A, theirs))).toBe('not_found');
    expect(await codeOf(documents.preview(A, theirs))).toBe('not_found');
    expect(await codeOf(documents.updateDraft(A, theirs, portal))).toBe('not_found');
    expect(await codeOf(documents.issue(A, theirs, { sha256: '0'.repeat(64) }))).toBe('not_found');
    expect((await documents.list(A)).some((d) => d.id === theirs)).toBe(false);
    expect((await documents.list(B)).map((d) => d.id)).toEqual([theirs]);
  });

  it('number their series independently', async () => {
    const id = (await documents.list(B))[0]?.id ?? 0;
    const { sha256 } = await documents.preview(B, id);
    expect((await documents.issue(B, id, { sha256 })).number).toBe('DEV-2026-001');
  });
});
