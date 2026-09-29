import { describe, expect, it } from 'vitest';
import { canConvert, canRevise, isExpired, nextAnswers, validUntil } from '../domain/lifecycle';
import { Dec } from '../domain/money';
import {
  documentPayload,
  PROFORMA_MENTION,
  renderInput,
  type DocumentFacts,
} from '../domain/presentation';
import type { DocumentType } from '../domain/types';

// Spec 006: a quote, a proforma and an invoice are three different documents — what they may
// become, and what each one prints.

const facts = (type: DocumentType): DocumentFacts => ({
  type,
  date: '2026-09-29',
  subject: 'Portail',
  client: { name: 'Mairie' },
  validityDays: 30,
  revision: 1,
  draft: {
    sections: [
      {
        sectionId: 's1',
        position: 0,
        lines: [
          { label: 'Portail', quantity: new Dec('1'), unitPrice: new Dec('250000'), position: 0 },
        ],
      },
    ],
    adjustments: [],
    depositPercent: new Dec('30'),
  },
  clauses: [],
  payments: [],
});

const header = { name: 'Atelier Kodjo', currency: 'XOF' };

describe('what each type may become', () => {
  it('a quote is accepted, refused or left without answer; a proforma is ordered or refused', () => {
    expect(nextAnswers('quote', 'issued')).toEqual([
      'accepted',
      'refused',
      'unanswered',
      'cancelled',
    ]);
    expect(nextAnswers('quote', 'unanswered')).toEqual(['accepted', 'refused', 'cancelled']);
    expect(nextAnswers('proforma', 'issued')).toEqual(['accepted', 'refused', 'cancelled']);
    expect(nextAnswers('quote', 'accepted')).toEqual(['cancelled']);
    expect(nextAnswers('quote', 'refused')).toEqual([]);
    expect(nextAnswers('quote', 'draft')).toEqual([]);
  });

  it('an invoice is never accepted: it can only be cancelled', () => {
    expect(nextAnswers('invoice', 'issued')).toEqual(['cancelled']);
  });

  it('converts forward only, from an issued or accepted document', () => {
    expect(canConvert('quote', 'issued', 'proforma')).toBe(true);
    expect(canConvert('quote', 'accepted', 'invoice')).toBe(true);
    expect(canConvert('proforma', 'accepted', 'invoice')).toBe(true);
    expect(canConvert('proforma', 'issued', 'quote')).toBe(false);
    expect(canConvert('invoice', 'issued', 'quote')).toBe(false);
    expect(canConvert('quote', 'refused', 'invoice')).toBe(false);
    expect(canConvert('quote', 'draft', 'invoice')).toBe(false);
  });

  it('revises a quote or a proforma, never an issued invoice', () => {
    expect(canRevise('quote', 'refused')).toBe(true);
    expect(canRevise('proforma', 'issued')).toBe(true);
    expect(canRevise('invoice', 'issued')).toBe(false);
    expect(canRevise('quote', 'draft')).toBe(false);
  });

  it('computes the validity, and expires only an unanswered issued quote or proforma', () => {
    expect(validUntil('quote', '2026-09-29', 30)).toBe('2026-10-29');
    expect(validUntil('invoice', '2026-09-29', 30)).toBeNull();
    expect(isExpired('quote', 'issued', '2026-09-29', 30, '2026-10-30')).toBe(true);
    expect(isExpired('quote', 'issued', '2026-09-29', 30, '2026-10-29')).toBe(false);
    expect(isExpired('quote', 'accepted', '2026-09-29', 30, '2026-12-01')).toBe(false);
    expect(isExpired('invoice', 'issued', '2026-01-01', 30, '2026-12-01')).toBe(false);
  });
});

describe('what each type prints', () => {
  it('a quote: validity, requested deposit, signed for agreement', () => {
    const payload = documentPayload(facts('quote'), header);
    expect(payload).toMatchObject({
      validity_days: 30,
      deposit_percent: '30',
      deposit_requested: '75000',
    });
    expect(renderInput(payload as never, { number: 'DEV-2026-001' })).toMatchObject({
      type: 'DEVIS',
      signature_label: 'BON POUR ACCORD',
    });
  });

  it('a proforma says it has no accounting value, and is signed for order', () => {
    const payload = documentPayload(facts('proforma'), header);
    expect((payload.conditions as { body: string }[]).map((c) => c.body)).toContain(
      PROFORMA_MENTION,
    );
    expect(renderInput(payload as never, { number: 'PRO-2026-001' })).toMatchObject({
      type: 'FACTURE PROFORMA',
      signature_label: 'BON POUR COMMANDE',
    });
  });

  it('an invoice claims payment: no validity, no requested deposit, net to pay', () => {
    const payload = documentPayload(facts('invoice'), header);
    expect(payload).toMatchObject({
      validity_days: null,
      deposit_percent: null,
      deposit_requested: null,
      indicative_after_deposit: null,
      balance_due: '250000',
    });
    expect(renderInput(payload as never, { number: 'FAC-2026-001' })).toMatchObject({
      type: 'FACTURE',
      signature_label: 'POUR ACQUIT',
      total_label: 'NET À PAYER',
    });
  });
});
