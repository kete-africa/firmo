import { randomBytes } from 'node:crypto';
import { memoryStorage } from '@kete/files';
import pg from 'pg';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDocuments, DocumentError, type DraftInput } from '@/features/documents';
import { getPool } from '@/platform/db';
import { LogoError, prepareLogo } from '@/platform/logo';
import { typstRenderer } from '@/platform/typst';
import { purgeOrganizations } from './support/cleanup';

// Phase 4: what the tradesman sets once — clauses, numbering, logo — reaches his documents; a
// share link opens one issued document for his client, counted, until revoked.

const run = randomBytes(3).toString('hex');
const A = { organizationId: `org_pres_a_${run}` };
const owner = new pg.Pool({ connectionString: process.env.FIRMO_TEST_OWNER_URL, max: 1 });
const documents = createDocuments({ renderer: typstRenderer(), files: memoryStorage() });

const quote: DraftInput = {
  type: 'quote',
  subject: 'Portail',
  client: { name: 'Mairie' },
  sections: [{ lines: [{ label: 'Portail', quantity: '1', unitPrice: '250000' }] }],
};

async function issue(input: DraftInput) {
  const id = await documents.createDraft(A, input);
  const { sha256 } = await documents.preview(A, id);
  return { id, ...(await documents.issue(A, id, { sha256 })) };
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'no error';
  } catch (error) {
    return error instanceof DocumentError || error instanceof LogoError
      ? error.code
      : String(error);
  }
}

beforeAll(async () => {
  await documents.saveProfile(A, { name: 'Atelier Kodjo', brandColor: '#2B5C88' });
});

afterAll(async () => {
  await owner.query('delete from document_shares where organization_id = $1', [A.organizationId]);
  await purgeOrganizations(owner, [A.organizationId]);
  await owner.end();
  await getPool().end();
});

describe('his presentation', () => {
  it('puts his default clauses on every new document, and keeps a removed one off', async () => {
    const kept = await documents.saveClause(A, {
      title: 'Paiement',
      body: 'Acompte de 30 % à la commande.',
      enabledByDefault: true,
    });
    const removed = await documents.saveClause(A, {
      title: 'Ancienne',
      body: 'Clause retirée.',
      enabledByDefault: true,
    });
    await documents.archiveClause(A, removed);
    const id = await documents.createDraft(A, quote);
    expect((await documents.get(A, id)).clauses.map((c) => c.title)).toEqual(['Paiement']);
    expect(kept).toBeGreaterThan(0);
    expect(
      await codeOf(documents.saveClause(A, { title: ' ', body: 'x', enabledByDefault: false })),
    ).toBe('invalid_input');
  });

  it('numbers with his format, and refuses a format the domain cannot write', async () => {
    await documents.saveNumbering(A, 'invoice', {
      prefix: 'FACT',
      separator: '/',
      cadence: 'continuous',
      width: 5,
    });
    const numbering = await documents.numbering(A);
    expect(numbering.find((n) => n.type === 'invoice')?.example).toBe('FACT/00001');
    expect((await issue({ ...quote, type: 'invoice' })).number).toBe('FACT/00001');
    expect(
      await codeOf(
        documents.saveNumbering(A, 'quote', {
          prefix: 'DEV 1',
          separator: '-',
          cadence: 'annual',
          width: 3,
        }),
      ),
    ).toBe('invalid_input');
  });

  it('makes a logo safe before using it, and refuses a disguised file', async () => {
    const upload = await sharp({
      create: { width: 300, height: 120, channels: 3, background: '#2B5C88' },
    })
      .jpeg()
      .toBuffer();
    const png = await prepareLogo(new Uint8Array(upload));
    expect(Buffer.from(png.subarray(1, 4)).toString('latin1')).toBe('PNG');
    await documents.setLogo(A, png);
    expect((await documents.profile(A))?.logoKey).toMatch(/logo-[0-9a-f]{16}\.png$/);
    expect(
      await codeOf(prepareLogo(new TextEncoder().encode('<svg onload="alert(1)"></svg>'))),
    ).toBe('unsupported_type');
  });

  it('shows the real first page of a document with his presentation', async () => {
    const png = await documents.presentationPreview(A);
    expect(Buffer.from(png.subarray(1, 4)).toString('latin1')).toBe('PNG');
    expect(png.length).toBeGreaterThan(5_000);
  });
});

describe('how his clients pay him (spec 011)', () => {
  it('is printed on an invoice, never on a quote', async () => {
    await documents.setPaymentInstructions(A, 'T-Money 90 12 34 56');
    const invoice = await issue({ ...quote, type: 'invoice' });
    const issuedQuote = await issue(quote);
    const issuerOf = async (id: number) =>
      ((await documents.get(A, id)).snapshot?.document as { issuer: Record<string, unknown> })
        .issuer;
    expect((await issuerOf(invoice.id)).payment).toBe('T-Money 90 12 34 56');
    expect(await issuerOf(issuedQuote.id)).not.toHaveProperty('payment');
    expect((await documents.profile(A))?.paymentAsked).toBe(true);
  });
});

describe('a share link', () => {
  it('opens one issued document, counts it, and stops once revoked', async () => {
    const issued = await issue(quote);
    const { token } = await documents.share(A, issued.id);
    const opened = await documents.openShare(token);
    expect(opened?.number).toBe(issued.number);
    expect(Buffer.from(opened?.pdf.subarray(0, 5) ?? new Uint8Array()).toString('latin1')).toBe(
      '%PDF-',
    );
    await documents.openShare(token);
    expect(await documents.shareStatus(A, issued.id)).toMatchObject({ active: true, viewCount: 2 });
    await documents.revokeShare(A, issued.id);
    expect(await documents.openShare(token)).toBeNull();
  });

  it('never exists for a draft, and an unknown token opens nothing', async () => {
    const draft = await documents.createDraft(A, quote);
    expect(await codeOf(documents.share(A, draft))).toBe('not_available');
    expect(await documents.openShare(randomBytes(24).toString('base64url'))).toBeNull();
    expect(await documents.openShare('../../etc')).toBeNull();
  });

  it('a new link replaces the previous one', async () => {
    const issued = await issue(quote);
    const first = await documents.share(A, issued.id);
    const second = await documents.share(A, issued.id);
    expect(await documents.openShare(first.token)).toBeNull();
    expect(await documents.openShare(second.token)).not.toBeNull();
  });
});
