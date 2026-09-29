import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildSnapshot, confirms, SnapshotError } from '../domain/snapshot';

// Ported from the reference's test_snapshots.py.

const document = () => ({
  type: 'quote',
  issuer: { name: 'Atelier Kodjo' },
  sections: [
    {
      position: 0,
      lines: [
        {
          position: 0,
          label: 'Barre tube rectangulaire 80 x 40',
          quantity: '45',
          unit_price: '17000',
          line_amount: '765000',
        },
      ],
      subtotal: '765000',
    },
  ],
  grand_total: '765000',
  conditions: ['Validité : 30 jours', 'Livraison à Agoè'],
});

function errorOf(fn: () => unknown): SnapshotError {
  try {
    fn();
  } catch (error) {
    if (error instanceof SnapshotError) return error;
  }
  throw new Error('expected a SnapshotError');
}

describe('snapshots', () => {
  it('builds versioned, compact UTF-8 JSON and its SHA-256', () => {
    const snapshot = buildSnapshot(document());
    expect(snapshot.canonicalJson.startsWith('{"document":')).toBe(true);
    expect(snapshot.canonicalJson).not.toContain('": ');
    expect(snapshot.canonicalJson).toContain('Validité');
    expect(snapshot.sha256).toBe(createHash('sha256').update(snapshot.canonicalJson).digest('hex'));
    expect(JSON.parse(snapshot.canonicalJson).schema_version).toBe(1);
  });

  it('does not depend on the insertion order of keys', () => {
    const first = buildSnapshot({ object: 'Portail', client: { name: 'Mairie', city: 'Agoè' } });
    const second = buildSnapshot({ client: { city: 'Agoè', name: 'Mairie' }, object: 'Portail' });
    expect(first).toEqual(second);
  });

  it('keeps the order of business lists, which changes the hash', () => {
    const first = buildSnapshot({ conditions: ['Acompte', 'Délai'] });
    const second = buildSnapshot({ conditions: ['Délai', 'Acompte'] });
    expect(JSON.parse(first.canonicalJson).document.conditions).toEqual(['Acompte', 'Délai']);
    expect(first.sha256).not.toBe(second.sha256);
  });

  it('confirms only the exact hash the tradesman saw', () => {
    const preview = buildSnapshot(document());
    expect(confirms(preview, preview.sha256)).toBe(true);
    expect(confirms(preview, '0'.repeat(64))).toBe(false);
    expect(buildSnapshot(document())).toEqual(preview);
  });

  it.each([
    ['grand_total', 765000],
    ['balance_due', '0765000'],
    ['tax_amount', '12.5'],
    ['amount', '-0'],
  ])('refuses money that is not a canonical integer string (%s)', (field, value) => {
    expect(errorOf(() => buildSnapshot({ [field]: value })).path).toBe(`$.${field}`);
  });

  it('keeps source numbers as exact canonical decimals', () => {
    const snapshot = buildSnapshot({
      line: { quantity: '2.5', unit_price: '12.2', flat_amount: '160000' },
      adjustment: { mode: 'percent', value: '25.5' },
    });
    const parsed = JSON.parse(snapshot.canonicalJson).document;
    expect(parsed.line.quantity).toBe('2.5');
    expect(parsed.adjustment.value).toBe('25.5');
  });

  it.each([17000, '017000', '12.20', '+12', '1.'])(
    'refuses a non-canonical source number (%s)',
    (value) => {
      expect(errorOf(() => buildSnapshot({ unit_price: value })).reason).toMatch(
        /canonical decimal/,
      );
    },
  );

  it.each([1.5, new Date(), new Set(['unordered']), () => 1])(
    'refuses a value with an implicit serialization',
    (value) => {
      const error = errorOf(() => buildSnapshot({ value }));
      expect(error.path).toBe('$.value');
      expect(error.reason).toMatch(/unsupported or ambiguous/);
    },
  );

  it('refuses the reserved key and invalid text, with a precise path', () => {
    expect(errorOf(() => buildSnapshot({ schema_version: 2 })).reason).toMatch(/reserved/);
    expect(errorOf(() => buildSnapshot({ client: { name: '\ud800' } })).path).toBe('$.client.name');
  });
});
