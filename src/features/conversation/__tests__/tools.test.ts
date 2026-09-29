import { describe, expect, it } from 'vitest';
import { EvidenceError, missingOf, numbersIn, provenNumber, totalsOf } from '../draft';
import { addToDraft, changeDraft, removeFromDraft, type AddToDraftArgs } from '../tools';

// The agent's guards: a number enters the draft only with words of the message that contain it;
// elements are named by id; the totals are the code's.

const empty: Omit<AddToDraftArgs, 'sections' | 'adjustments'> = {
  start_new: false,
  document_type: null,
  client_name: null,
  client_phone: null,
  client_address: null,
  subject: null,
  site: null,
  delivery_text: null,
  warranty_text: null,
  conditions: [],
  validity_days: null,
  tax_rate: null,
  deposit_percent: null,
};

const message =
  "Devis pour M. Kodjo, portail : 12 barres de tube 80x40 à 18 000 F, la tôle 4 feuilles à 32.000, main d'oeuvre 25 %";

const portal = (): AddToDraftArgs => ({
  ...empty,
  client_name: 'M. Kodjo',
  subject: 'Portail',
  sections: [
    {
      title: 'Portail',
      show_subtotal: true,
      lines: [
        {
          label: 'Tube 80x40',
          description: null,
          unit: 'barre',
          quantity: { value: '12', evidence: '12 barres' },
          unit_price: { value: '18000', evidence: '18 000 F' },
          flat_amount: null,
          descriptive: false,
        },
        {
          label: 'Tôle',
          description: null,
          unit: 'feuille',
          quantity: { value: '4', evidence: '4 feuilles' },
          unit_price: { value: '32000', evidence: 'à 32.000' },
          flat_amount: null,
          descriptive: false,
        },
      ],
    },
  ],
  adjustments: [
    {
      label: "Main-d'œuvre",
      mode: 'percent',
      sign: 1,
      base: 'items_total',
      value: { value: '25', evidence: "main d'oeuvre 25 %" },
    },
  ],
});

describe('numbers and their evidence', () => {
  it('reads numbers as tradesmen write them', () => {
    expect(numbersIn('12 barres à 18 000 F')).toEqual(['12', '18000']);
    expect(numbersIn('1.250.000 F, 12,5 m²')).toEqual(['1250000', '12.5']);
    expect(numbersIn('acompte 30%')).toEqual(['30']);
  });

  it('refuses a number that is not in its own words, or words not in the message', () => {
    expect(provenNumber('18000', '18 000 F', message)).toBe('18000');
    expect(() => provenNumber('20000', '18 000 F', message)).toThrow(EvidenceError);
    expect(() => provenNumber('18000', '18 000 FCFA net', message)).toThrow(EvidenceError);
    expect(provenNumber(null, null, message)).toBeNull();
  });
});

describe('the draft', () => {
  it('adds what was said, with stable ids, and totals computed by the code', () => {
    const draft = addToDraft(null, portal(), message);
    expect(draft.sections.map((s) => s.id)).toEqual(['S3']);
    expect(draft.sections[0]?.lines.map((l) => l.id)).toEqual(['L1', 'L2']);
    expect(draft.adjustments[0]).toMatchObject({ id: 'A4', mode: 'percent', value: '25' });
    expect(missingOf(draft)).toEqual([]);
    expect(totalsOf(draft)).toEqual({ itemsTotal: '344000', grandTotal: '430000' });
  });

  it('refuses the whole call when one price was not said', () => {
    const args = portal();
    const line = args.sections[0]?.lines[1];
    if (line) line.unit_price = { value: '35000', evidence: 'à 32.000' };
    expect(() => addToDraft(null, args, message)).toThrow(EvidenceError);
  });

  it('keeps an unsaid value empty and asks for it, one at a time', () => {
    const args = portal();
    const line = args.sections[0]?.lines[1];
    if (line) line.unit_price = null;
    const draft = addToDraft(null, args, message);
    expect(missingOf(draft)[0]).toMatchObject({ kind: 'unit_price', lineId: 'L2' });
    expect(totalsOf(draft)).toBeNull();
  });

  it('corrects by id, with the new number in the new message', () => {
    const draft = addToDraft(null, portal(), message);
    const fixed = changeDraft(
      draft,
      {
        changes: [
          { id: 'L2', field: 'unit_price', value: '20000', evidence: 'la tôle c est 20 000' },
        ],
      },
      'non, la tôle c est 20 000',
    );
    expect(fixed.sections[0]?.lines[1]?.unit_price).toBe('20000');
    expect(() =>
      changeDraft(
        draft,
        { changes: [{ id: 'L9', field: 'label', value: 'x', evidence: null }] },
        'x',
      ),
    ).toThrow(EvidenceError);
  });

  it('never takes a client name that was not said', () => {
    const draft = addToDraft(null, portal(), message);
    expect(() =>
      changeDraft(
        draft,
        { changes: [{ id: 'document', field: 'client_name', value: 'SOGEC', evidence: null }] },
        'change le client',
      ),
    ).toThrow(EvidenceError);
  });

  it('removes by id, and an emptied group disappears', () => {
    const draft = addToDraft(null, portal(), message);
    const smaller = removeFromDraft(draft, ['L1', 'L2', 'A4']);
    expect(smaller.sections).toEqual([]);
    expect(smaller.adjustments).toEqual([]);
  });
});
