import { describe, expect, it } from 'vitest';
import { calculateDocument, calculateLine, CalculationError } from '../domain/calculate';
import { Dec } from '../domain/money';
import type { DocumentDraft, DocumentLine, DocumentSection } from '../domain/types';

// Ported from the reference's test_calculations.py.

const D = (value: string) => new Dec(value);
const line = (label: string, quantity: string, unitPrice: string, position = 0): DocumentLine => ({
  label,
  quantity: D(quantity),
  unitPrice: D(unitPrice),
  position,
});
const section = (sectionId: string, lines: DocumentLine[], position = 0): DocumentSection => ({
  sectionId,
  lines,
  position,
});
const text = (value: Dec | null) => (value === null ? null : value.toFixed());

describe('calculations', () => {
  it.each([
    [line('Decimal quantity', '2.5', '12'), '30'],
    [{ label: 'Flat', flatAmount: D('35000'), position: 0 }, '35000'],
    [{ label: 'Description', calculated: false, position: 0 }, null],
  ] as [DocumentLine, string | null][])(
    'calculates each line form without changing it',
    (source, expected) => {
      const result = calculateLine(source);
      expect(text(result.amount)).toBe(expected);
      expect(result.source).toBe(source);
    },
  );

  it('matches the reference case: sections, percent, fixed, deposit and balance', () => {
    const result = calculateDocument({
      sections: [
        section('portal', [line('Tube', '12', '18000'), line('Sheet', '4', '32000', 1)]),
        section('railing', [line('Square tube', '8', '15000'), line('Paint', '2', '18000', 1)], 1),
      ],
      adjustments: [
        {
          label: 'Labour',
          mode: 'percent',
          value: D('25'),
          sign: 1,
          base: 'items_total',
          position: 0,
        },
        {
          label: 'Transport',
          mode: 'fixed',
          value: D('30000'),
          sign: 1,
          base: 'items_total',
          position: 1,
        },
      ],
      depositPercent: D('30'),
    });
    expect(result.sections.map((s) => text(s.subtotal))).toEqual(['344000', '156000']);
    expect(text(result.itemsTotal)).toBe('500000');
    expect(result.adjustments.map((a) => text(a.amount))).toEqual(['125000', '30000']);
    expect(text(result.adjustmentsTotal)).toBe('155000');
    expect(text(result.grandTotal)).toBe('655000');
    expect(text(result.depositRequested)).toBe('196500');
    expect(text(result.indicativeAfterDeposit)).toBe('458500');
    expect(text(result.balanceDue)).toBe('655000');
  });

  it('takes a labour percentage above one hundred on the items total', () => {
    const result = calculateDocument({
      sections: [section('main', [line('Fournitures', '1', '200000')])],
      adjustments: [
        {
          label: "Main-d'oeuvre",
          mode: 'percent',
          value: D('300'),
          sign: 1,
          base: 'items_total',
          position: 0,
        },
      ],
    });
    expect(text(result.adjustments[0]?.amount ?? null)).toBe('600000');
    expect(text(result.grandTotal)).toBe('800000');
  });

  it('applies a discount before tax, and the tax on the reduced base', () => {
    const result = calculateDocument({
      sections: [section('mission', [line('Audit', '1', '2100000')])],
      adjustments: [
        {
          label: 'Discount',
          mode: 'percent',
          value: D('5'),
          sign: -1,
          base: 'items_total',
          position: 0,
        },
      ],
      taxRate: D('18'),
    });
    expect(text(result.adjustmentsTotal)).toBe('-105000');
    expect(text(result.taxableBase)).toBe('1995000');
    expect(text(result.taxAmount)).toBe('359100');
    expect(text(result.grandTotal)).toBe('2354100');
  });

  it('uses the running total for ordered taxable-base adjustments', () => {
    const result = calculateDocument({
      sections: [section('main', [line('Work', '1', '1001')])],
      adjustments: [
        {
          label: 'First',
          mode: 'percent',
          value: D('10'),
          sign: 1,
          base: 'taxable_base',
          position: 0,
        },
        {
          label: 'Second',
          mode: 'percent',
          value: D('10'),
          sign: 1,
          base: 'taxable_base',
          position: 1,
        },
      ],
    });
    expect(result.adjustments.map((a) => text(a.baseAmount))).toEqual(['1001', '1101']);
    expect(result.adjustments.map((a) => text(a.amount))).toEqual(['100', '110']);
    expect(text(result.grandTotal)).toBe('1211');
  });

  it('uses the explicit section base of a section adjustment', () => {
    const result = calculateDocument({
      sections: [
        section('materials', [line('Materials', '1', '400')]),
        section('work', [line('Work', '1', '600')], 1),
      ],
      adjustments: [
        {
          label: 'Materials discount',
          mode: 'percent',
          value: D('25'),
          sign: -1,
          base: 'section',
          sectionId: 'materials',
          position: 0,
        },
      ],
    });
    expect(text(result.adjustments[0]?.baseAmount ?? null)).toBe('400');
    expect(text(result.adjustments[0]?.amount ?? null)).toBe('-100');
    expect(text(result.grandTotal)).toBe('900');
  });

  it('never treats the requested deposit as a payment', () => {
    const result = calculateDocument({
      sections: [section('main', [line('Work', '1', '1000')])],
      depositPercent: D('30'),
      payments: [{ amount: D('200') }],
    });
    expect(text(result.depositRequested)).toBe('300');
    expect(text(result.indicativeAfterDeposit)).toBe('700');
    expect(text(result.paidTotal)).toBe('200');
    expect(text(result.balanceDue)).toBe('800');
  });

  const work = section('main', [line('Work', '1', '100')]);
  it.each([
    [{ sections: [] }, 'missing_sections'],
    [
      { sections: [section('note', [{ label: 'Note', calculated: false, position: 0 }])] },
      'missing_billable_line',
    ],
    [
      {
        sections: [
          section('incomplete', [
            { label: 'Work', quantity: D('2'), confirmationRequired: true, position: 0 },
          ]),
        ],
      },
      'confirmation_required',
    ],
    [
      {
        sections: [work],
        adjustments: [
          {
            label: 'Foreign',
            mode: 'percent',
            value: D('10'),
            sign: 1,
            base: 'section',
            sectionId: 'foreign',
            position: 0,
          },
        ],
      },
      'unknown_adjustment_section',
    ],
    [
      {
        sections: [work],
        adjustments: [
          {
            label: 'Excess',
            mode: 'fixed',
            value: D('101'),
            sign: -1,
            base: 'taxable_base',
            position: 0,
          },
        ],
      },
      'negative_adjustment_base',
    ],
    [{ sections: [work], payments: [{ amount: D('101') }] }, 'excess_payment'],
  ] as [DocumentDraft, string][])(
    'refuses an invalid document with a stable code (%#)',
    (draft, code) => {
      expect(() => calculateDocument(draft)).toThrow(CalculationError);
      try {
        calculateDocument(draft);
      } catch (error) {
        expect((error as CalculationError).code).toBe(code);
      }
    },
  );
});
