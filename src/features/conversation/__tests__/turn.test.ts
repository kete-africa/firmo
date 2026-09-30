import { describe, expect, it } from 'vitest';
import {
  strictJsonSchema,
  toDraftOutput,
  toWorkingDraft,
  turnOutput,
  type DraftOutput,
} from '../turn';

// Spec 010: the model's draft becomes the working draft as it is — nothing reread, nothing
// guessed — and what a schema cannot say is sent back to the model.

const base: DraftOutput = {
  document_type: 'quote',
  subject: 'Portail',
  client_name: 'M. Kodjo',
  client_phone: null,
  client_address: null,
  site: null,
  delivery: null,
  warranty: null,
  validity_days: 30,
  tax_rate: null,
  deposit_percent: 30,
  conditions: [],
  sections: [
    {
      title: 'Tube annelé',
      show_subtotal: true,
      lines: [
        {
          label: 'Tube annelé',
          description: null,
          unit: null,
          quantity: 1,
          unit_price: 140000,
          flat_amount: null,
          descriptive: false,
        },
      ],
    },
  ],
  adjustments: [
    { label: 'Remise', kind: 'amount', value: 5000, direction: 'subtract', base: 'items_total' },
  ],
};

describe("the model's draft", () => {
  it('is kept as understood, as exact decimal text, and reads back the same', () => {
    const result = toWorkingDraft(base);
    expect(result.problems).toEqual([]);
    expect(result.draft?.sections[0]?.lines[0]).toMatchObject({
      quantity: '1',
      unit_price: '140000',
      calculated: true,
    });
    expect(result.draft?.adjustments[0]).toMatchObject({ mode: 'fixed', value: '5000', sign: -1 });
    expect(result.draft && toDraftOutput(result.draft)).toEqual(base);
  });

  it('keeps a value left empty empty, for the code to ask', () => {
    const draft = structuredClone(base);
    const tube = draft.sections[0]?.lines[0];
    if (tube) tube.quantity = null;
    expect(toWorkingDraft(draft).draft?.sections[0]?.lines[0]?.quantity).toBeNull();
  });

  it('sends back what a schema cannot say', () => {
    const draft = structuredClone(base);
    const tube = draft.sections[0]?.lines[0];
    if (tube) {
      tube.flat_amount = 140000;
      tube.quantity = 0;
    }
    draft.deposit_percent = 130;
    draft.validity_days = 7.5;
    expect(toWorkingDraft(draft).problems).toEqual([
      "Tube annelé : une quantité n'est pas nulle",
      'Tube annelé : un forfait, ou une quantité et un prix, pas les deux',
      'validité : un nombre entier de jours',
      'acompte : un pourcentage de 0 à 100',
    ]);
  });
});

describe('the schema the model receives', () => {
  it('is strict: every field required, nothing else allowed', () => {
    const schema = strictJsonSchema(turnOutput) as {
      required: string[];
      additionalProperties: boolean;
    };
    expect(schema.required).toEqual([
      'reply',
      'draft',
      'new_document',
      'issuer_name',
      'action',
      'document_number',
    ]);
    expect(schema.additionalProperties).toBe(false);
  });
});
