import { formatMoney } from '@/features/documents';
import * as m from '@/paraglide/messages.js';
import { totalsOf, type WorkingDraft } from './draft';

/**
 * The draft as the person reads it — every amount written by the code, from the code's
 * calculation, never by the model.
 */
export type ChatLocale = 'fr' | 'en';

const typeLabel = (type: WorkingDraft['document_type'], locale: ChatLocale) =>
  ({
    quote: m.chat_type_quote({}, { locale }),
    proforma: m.chat_type_proforma({}, { locale }),
    invoice: m.chat_type_invoice({}, { locale }),
  })[type];

const number = (value: string, locale: ChatLocale) => {
  const [integer = '0', fraction] = value.split('.');
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return fraction ? `${grouped}${locale === 'fr' ? ',' : '.'}${fraction}` : grouped;
};

const money = (value: string, locale: ChatLocale) =>
  m.chat_money({ amount: formatMoney(value) }, { locale });

export function summaryForPerson(draft: WorkingDraft, locale: ChatLocale = 'fr'): string {
  const lines: string[] = [
    m.chat_summary_title({ type: typeLabel(draft.document_type, locale) }, { locale }),
  ];
  if (draft.subject) lines.push(m.chat_summary_subject({ subject: draft.subject }, { locale }));
  if (draft.client_name) lines.push(m.chat_summary_client({ name: draft.client_name }, { locale }));
  for (const section of draft.sections) {
    if (section.title) lines.push(`${section.title}`);
    for (const line of section.lines) {
      const label = line.unit ? `${line.label} (${line.unit})` : line.label;
      if (!line.calculated) lines.push(m.chat_line_descriptive({ label }, { locale }));
      else if (line.flat_amount !== null) {
        lines.push(
          m.chat_line_flat({ label, amount: money(line.flat_amount, locale) }, { locale }),
        );
      } else if (line.quantity !== null && line.unit_price !== null) {
        lines.push(
          m.chat_line_priced(
            {
              label,
              quantity: number(line.quantity, locale),
              price: money(line.unit_price, locale),
            },
            { locale },
          ),
        );
      } else if (line.quantity !== null) {
        // What he said stays in sight; only what is missing is marked.
        lines.push(
          m.chat_line_price_missing({ label, quantity: number(line.quantity, locale) }, { locale }),
        );
      } else if (line.unit_price !== null) {
        lines.push(
          m.chat_line_quantity_missing(
            { label, price: money(line.unit_price, locale) },
            { locale },
          ),
        );
      } else lines.push(m.chat_line_missing({ label }, { locale }));
    }
  }
  if (draft.adjustments.length > 0) {
    lines.push(m.chat_summary_adjustments({}, { locale }));
    for (const adjustment of draft.adjustments) {
      const label = adjustment.sign === -1 ? `${adjustment.label} (−)` : adjustment.label;
      if (adjustment.value === null) lines.push(m.chat_adjustment_missing({ label }, { locale }));
      else if (adjustment.mode === 'percent') {
        lines.push(
          m.chat_adjustment_percent({ label, value: number(adjustment.value, locale) }, { locale }),
        );
      } else {
        lines.push(
          m.chat_adjustment_fixed({ label, amount: money(adjustment.value, locale) }, { locale }),
        );
      }
    }
  }
  const totals = totalsOf(draft);
  if (totals)
    lines.push(m.chat_summary_total({ amount: money(totals.grandTotal, locale) }, { locale }));
  const details: [string, string | null][] = [
    [m.chat_label_site({}, { locale }), draft.site],
    [m.chat_label_delivery({}, { locale }), draft.delivery_text],
    [
      m.chat_label_validity({}, { locale }),
      draft.validity_days ? m.chat_days({ days: draft.validity_days }, { locale }) : null,
    ],
    [m.chat_label_warranty({}, { locale }), draft.warranty_text],
    [
      m.chat_label_tax({}, { locale }),
      draft.tax_rate ? `${number(draft.tax_rate, locale)} %` : null,
    ],
    [
      m.chat_label_deposit({}, { locale }),
      draft.deposit_percent ? `${number(draft.deposit_percent, locale)} %` : null,
    ],
    [m.chat_label_conditions({}, { locale }), draft.conditions.join(' · ') || null],
  ];
  for (const [label, value] of details) {
    if (value) lines.push(m.chat_summary_detail({ label, value }, { locale }));
  }
  return lines.join('\n');
}
