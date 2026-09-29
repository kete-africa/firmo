import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  Dec,
  draftSnapshot,
  renderInput,
  type DocumentFacts,
  type DocumentType,
} from '@/features/documents';
import { typstRenderer } from '@/platform/typst';

// Phase 1 proof: the ten reference cases render to PDF through the whole chain — facts, canonical
// snapshot, template input, Typst — with their approved totals.

const CASES = fileURLToPath(new URL('../document/cases', import.meta.url));
const files = readdirSync(CASES)
  .filter((file) => file.endsWith('.json'))
  .sort();
const TYPES: Record<string, DocumentType> = {
  DEVIS: 'quote',
  PROFORMA: 'proforma',
  FACTURE: 'invoice',
};

type Json = Record<string, unknown>;
const dec = (value: unknown) => new Dec(String(value));

function load(file: string): Json {
  // Numbers are kept as written: no value passes through a float.
  const text = readFileSync(`${CASES}/${file}`, 'utf8').replace(
    /(:\s*)(-?\d+(?:\.\d+)?)(?=\s*[,}\]])/g,
    '$1"$2"',
  );
  return JSON.parse(text) as Json;
}

function facts(source: Json): DocumentFacts {
  const client = (source.client ?? {}) as Json;
  const [day, month, year] = String(source.date ?? '08.08.2026').split('.');
  return {
    type: TYPES[String(source.type)] ?? 'quote',
    date: `${year}-${month}-${day}`,
    subject: String(source.object ?? 'Travaux'),
    client: { name: String(client.name ?? 'Client'), address: (client.address as string) ?? null },
    validityDays: Number(source.validity_days ?? 30),
    site: (source.site as string) ?? null,
    delivery: (source.delivery as string) ?? null,
    revision: 1,
    draft: {
      sections: (source.sections as Json[]).map((section, sectionPosition) => ({
        sectionId: `s${sectionPosition}`,
        title: (section.title as string) ?? null,
        showSubtotal: Boolean(section.show_subtotal),
        position: sectionPosition,
        lines: (section.lines as Json[]).map((line, position) => ({
          label: String(line.label),
          unit: (line.unit as string) ?? null,
          quantity: 'quantity' in line ? dec(line.quantity) : null,
          unitPrice: 'unit_price' in line ? dec(line.unit_price) : null,
          flatAmount: 'flat_amount' in line ? dec(line.flat_amount) : null,
          position,
        })),
      })),
      adjustments: ((source.adjustments ?? []) as Json[]).map((adjustment, position) => {
        const value = dec(adjustment.value);
        return {
          label: String(adjustment.label),
          mode: adjustment.mode as 'fixed' | 'percent',
          value: value.abs(),
          sign: value.isNegative() ? -1 : 1,
          base: (adjustment.base as 'items_total') ?? 'items_total',
          position,
        };
      }),
      taxRate: source.tax_rate === undefined ? null : dec(source.tax_rate),
      depositPercent: source.deposit_percent === undefined ? null : dec(source.deposit_percent),
      payments: ((source.payments ?? []) as Json[]).map((p) => ({ amount: dec(p.amount) })),
    },
    clauses: ((source.conditions ?? []) as string[]).map((body) => ({ title: 'Condition', body })),
    payments: ((source.payments ?? []) as Json[]).map((p) => ({
      amount: dec(p.amount),
      paidOn: '2026-08-08',
      method: String(p.method ?? 'Espèces'),
    })),
  };
}

const renderer = typstRenderer();

describe('rendering the reference cases', () => {
  it.each(files)('%s renders to a PDF with its approved total', async (file) => {
    const source = load(file);
    const issuer = (source.issuer ?? {}) as Json;
    const snapshot = draftSnapshot(facts(source), {
      name: String(issuer.name ?? 'Atelier'),
      trade: (issuer.trade as string) ?? null,
      phone: (issuer.phone as string) ?? null,
      currency: 'XOF',
      brandColor: (issuer.color as string) ?? null,
    });
    const document = (JSON.parse(snapshot.canonicalJson) as { document: Json }).document;
    const expected = (source.expected ?? {}) as Json;
    if (expected.grand_total !== undefined) {
      expect(document.grand_total).toBe(dec(expected.grand_total).toFixed());
    }
    const rendered = await renderer.render(
      renderInput(document, { number: String(source.number ?? 'DEV-0001') }),
      { createdAt: new Date('2026-08-08T10:00:00Z') },
    );
    expect(Buffer.from(rendered.pdf.subarray(0, 5)).toString('latin1')).toBe('%PDF-');
    const pages =
      Buffer.from(rendered.pdf)
        .toString('latin1')
        .match(/\/Type\s*\/Page[^s]/g) ?? [];
    expect(pages.length).toBeGreaterThanOrEqual(Number(expected.min_pages ?? 1));
  });

  it('renders the same input to the same bytes', async () => {
    const source = load(files[0] ?? '');
    const snapshot = draftSnapshot(facts(source), { name: 'Atelier', currency: 'XOF' });
    const document = (JSON.parse(snapshot.canonicalJson) as { document: Json }).document;
    const input = renderInput(document, { number: 'BROUILLON' });
    const createdAt = new Date('2026-08-08T10:00:00Z');
    const first = await renderer.render(input, { createdAt });
    const second = await renderer.render(input, { createdAt });
    expect(first.sha256).toBe(second.sha256);
  });
});
