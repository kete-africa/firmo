import { formatMoney } from '@/features/documents';
import * as m from '@/paraglide/messages.js';
import { totalsOf, type WorkingDraft } from './draft';

/**
 * The draft as the person reads it — every amount written by the code, from the code's
 * calculation, never by the model. Every level of the total is shown, and what each percentage
 * is taken on, so that he can check it at a glance and correct what Firmo chose.
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

/** A signed amount: « + 35 600 F CFA », « − 17 800 F CFA ». */
const signed = (value: string, locale: ChatLocale) =>
  value.startsWith('-') ? `− ${money(value.slice(1), locale)}` : `+ ${money(value, locale)}`;

export function summaryForPerson(draft: WorkingDraft, locale: ChatLocale = 'fr'): string {
  const totals = totalsOf(draft);
  const lines: string[] = [
    m.chat_summary_title({ type: typeLabel(draft.document_type, locale) }, { locale }),
  ];
  if (draft.subject) lines.push(m.chat_summary_subject({ subject: draft.subject }, { locale }));
  if (draft.client_name) lines.push(m.chat_summary_client({ name: draft.client_name }, { locale }));

  const grouped = draft.sections.length > 1;
  draft.sections.forEach((section, s) => {
    if (section.title) lines.push(section.title);
    section.lines.forEach((line, l) => {
      const label = line.unit ? `${line.label} (${line.unit})` : line.label;
      const amount = totals?.sections[s]?.lines[l] ?? null;
      if (!line.calculated) lines.push(m.chat_line_descriptive({ label }, { locale }));
      else if (line.flat_amount !== null) {
        lines.push(
          m.chat_line_flat({ label, amount: money(line.flat_amount, locale) }, { locale }),
        );
      } else if (line.quantity !== null && line.unit_price !== null) {
        const priced = {
          label,
          quantity: number(line.quantity, locale),
          price: money(line.unit_price, locale),
        };
        lines.push(
          amount === null
            ? m.chat_line_priced(priced, { locale })
            : m.chat_line_priced_amount({ ...priced, amount: money(amount, locale) }, { locale }),
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
    });
    const subtotal = totals?.sections[s]?.subtotal;
    if (grouped && section.title && section.lines.length > 1 && subtotal) {
      lines.push(
        m.chat_group_subtotal(
          { title: section.title, amount: money(subtotal, locale) },
          { locale },
        ),
      );
    }
  });

  const hasTax = draft.tax_rate !== null;
  if (totals && (draft.adjustments.length > 0 || hasTax)) {
    lines.push(m.chat_items_total({ amount: money(totals.itemsTotal, locale) }, { locale }));
  }
  draft.adjustments.forEach((adjustment, a) => {
    const amount = totals?.adjustments[a];
    if (adjustment.value === null) {
      lines.push(m.chat_adjustment_missing({ label: adjustment.label }, { locale }));
    } else if (adjustment.mode === 'percent') {
      // Before any other adjustment, the running total is the items subtotal: said as such.
      const base =
        adjustment.base === 'items_total' || a === 0
          ? m.chat_base_items({}, { locale })
          : m.chat_base_running({}, { locale });
      const value = number(adjustment.value, locale);
      lines.push(
        amount === undefined
          ? m.chat_adjustment_percent({ label: adjustment.label, value, base }, { locale })
          : m.chat_adjustment_percent_amount(
              { label: adjustment.label, value, base, amount: signed(amount, locale) },
              { locale },
            ),
      );
    } else {
      const value = adjustment.sign === -1 ? `-${adjustment.value}` : adjustment.value;
      lines.push(
        m.chat_adjustment_fixed(
          { label: adjustment.label, amount: signed(amount ?? value, locale) },
          { locale },
        ),
      );
    }
  });

  if (totals) {
    if (hasTax && totals.taxAmount !== null && draft.tax_rate !== null) {
      lines.push(m.chat_total_ht({ amount: money(totals.taxableBase, locale) }, { locale }));
      lines.push(
        m.chat_tax_amount(
          { rate: number(draft.tax_rate, locale), amount: signed(totals.taxAmount, locale) },
          { locale },
        ),
      );
      lines.push(m.chat_total_ttc({ amount: money(totals.grandTotal, locale) }, { locale }));
    } else {
      lines.push(m.chat_summary_total({ amount: money(totals.grandTotal, locale) }, { locale }));
    }
    if (totals.depositRequested !== null && draft.deposit_percent !== null) {
      lines.push(
        m.chat_deposit_amount(
          {
            percent: number(draft.deposit_percent, locale),
            amount: money(totals.depositRequested, locale),
          },
          { locale },
        ),
      );
    }
  }

  const details: [string, string | null][] = [
    [m.chat_label_site({}, { locale }), draft.site],
    [m.chat_label_delivery({}, { locale }), draft.delivery_text],
    [
      m.chat_label_validity({}, { locale }),
      draft.validity_days ? m.chat_days({ days: draft.validity_days }, { locale }) : null,
    ],
    [m.chat_label_warranty({}, { locale }), draft.warranty_text],
    // Once the total is known, the tax and the deposit are shown with their amounts above.
    [
      m.chat_label_tax({}, { locale }),
      !totals && draft.tax_rate ? `${number(draft.tax_rate, locale)} %` : null,
    ],
    [
      m.chat_label_deposit({}, { locale }),
      !totals && draft.deposit_percent ? `${number(draft.deposit_percent, locale)} %` : null,
    ],
    [m.chat_label_conditions({}, { locale }), draft.conditions.join(' · ') || null],
  ];
  for (const [label, value] of details) {
    if (value) lines.push(m.chat_summary_detail({ label, value }, { locale }));
  }
  return lines.join('\n');
}
