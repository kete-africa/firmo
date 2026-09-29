import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { calculateDocument } from '../domain/calculate';
import { Dec } from '../domain/money';
import type { AdjustmentBase, DocumentDraft } from '../domain/types';

// The reference's approved cases (document/cases): the domain converges with each one.

const CASES = fileURLToPath(new URL('../../../../document/cases', import.meta.url));
const files = readdirSync(CASES)
  .filter((file) => file.endsWith('.json'))
  .sort();

type Num = number | string;
interface Case {
  sections: { title?: string; show_subtotal?: boolean; lines: Record<string, unknown>[] }[];
  adjustments?: { label: string; mode: 'fixed' | 'percent'; value: Num; base?: AdjustmentBase }[];
  tax_rate?: Num;
  deposit_percent?: Num;
  payments?: { amount: Num }[];
  expected: Record<string, Num>;
}

// Numbers are read from the JSON text as written, so no value passes through a float.
function load(file: string): Case {
  const text = readFileSync(`${CASES}/${file}`, 'utf8').replace(
    /(:\s*)(-?\d+(?:\.\d+)?)(?=\s*[,}\]])/g,
    '$1"$2"',
  );
  return JSON.parse(text) as Case;
}

const dec = (value: unknown) => new Dec(String(value));

function draft(source: Case): DocumentDraft {
  return {
    sections: source.sections.map((section, sectionPosition) => ({
      sectionId: `section-${sectionPosition + 1}`,
      title: section.title ?? null,
      showSubtotal: Boolean(section.show_subtotal),
      position: sectionPosition,
      lines: section.lines.map((line, position) => ({
        label: String(line.label),
        unit: (line.unit as string | undefined) ?? null,
        quantity: 'quantity' in line ? dec(line.quantity) : null,
        unitPrice: 'unit_price' in line ? dec(line.unit_price) : null,
        flatAmount: 'flat_amount' in line ? dec(line.flat_amount) : null,
        position,
      })),
    })),
    adjustments: (source.adjustments ?? []).map((adjustment, position) => {
      const value = dec(adjustment.value);
      return {
        label: adjustment.label,
        mode: adjustment.mode,
        value: value.abs(),
        sign: value.isNegative() ? -1 : 1,
        base: adjustment.base ?? 'items_total',
        position,
      };
    }),
    taxRate: source.tax_rate === undefined ? null : dec(source.tax_rate),
    depositPercent: source.deposit_percent === undefined ? null : dec(source.deposit_percent),
    payments: (source.payments ?? []).map((payment) => ({ amount: dec(payment.amount) })),
  };
}

describe('the reference cases', () => {
  it('are all here', () => {
    expect(files).toHaveLength(10);
  });

  it.each(files)('%s converges with the approved totals', (file) => {
    const source = load(file);
    const result = calculateDocument(draft(source));
    const observed: Record<string, Dec | null> = {
      items_total: result.itemsTotal,
      adjustments_total: result.adjustmentsTotal,
      total_before_tax: result.taxableBase,
      tax_amount: result.taxAmount,
      grand_total: result.grandTotal,
      deposit: result.depositRequested,
      paid_total: result.paidTotal,
      balance: result.depositRequested !== null ? result.indicativeAfterDeposit : result.balanceDue,
    };
    for (const [field, expected] of Object.entries(source.expected)) {
      if (field === 'min_pages') continue;
      expect(observed[field]?.toFixed(), field).toBe(dec(expected).toFixed());
    }
  });
});
