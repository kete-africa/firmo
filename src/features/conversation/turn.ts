import { z } from 'zod';
import { Dec } from '@/features/documents';
import type { DraftAdjustment, DraftLine, DraftSection, WorkingDraft } from './draft';

/**
 * One turn of the conversation (spec 010): the model reads the whole conversation and answers
 * with one structured output — its reply, the draft as it now understands it, and at most one
 * action. The schema is enforced by the model's API; the code then checks what a schema cannot
 * say (a line is priced one way or the other) and sends any problem back to the model once.
 */

const amount = z.number().nullable();
const text = z.string().nullable();

const line = z.object({
  label: z.string().describe('Libellé du poste, avec les mots de la personne.'),
  description: text,
  unit: text.describe('Unité dite par la personne (barre, m², sac…), sinon null.'),
  quantity: amount,
  unit_price: amount,
  flat_amount: amount.describe('Montant forfaitaire, à la place de quantité × prix unitaire.'),
  descriptive: z.boolean().describe('Vrai pour une ligne qui décrit seulement, sans montant.'),
});

const section = z.object({
  title: text.describe('Nom du groupe ; null pour des postes sans groupe.'),
  show_subtotal: z.boolean(),
  lines: z.array(line),
});

const adjustment = z.object({
  label: z.string(),
  kind: z.enum(['percent', 'amount']),
  value: amount,
  direction: z.enum(['add', 'subtract']),
  base: z.enum(['items_total', 'taxable_base']),
});

export const draftOutput = z.object({
  document_type: z.enum(['quote', 'proforma', 'invoice']),
  subject: text,
  client_name: text,
  client_phone: text,
  client_address: text,
  site: text,
  delivery: text,
  warranty: text,
  validity_days: amount,
  tax_rate: amount,
  deposit_percent: amount,
  conditions: z.array(z.string()),
  sections: z.array(section),
  adjustments: z.array(adjustment),
});

export const ACTIONS = [
  'none',
  'show_preview',
  'propose_issue',
  'confirm_issue',
  'cancel_issue',
  'send_pdf',
  'convert_to_proforma',
  'convert_to_invoice',
  'open_space',
  'open_documents',
  'open_presentation',
  'open_subscription',
] as const;

export const turnOutput = z.object({
  reply: z.string().describe('Ta réponse à la personne : courte, sans aucun montant.'),
  draft: draftOutput
    .nullable()
    .describe('Le brouillon complet et à jour si quelque chose a changé ; null sinon.'),
  new_document: z
    .boolean()
    .describe('Vrai seulement si ce brouillon est un nouveau document, qui remplace le précédent.'),
  issuer_name: text.describe(
    'Le nom sous lequel ses documents partent, quand il vient de le dire.',
  ),
  action: z.enum(ACTIONS),
  document_number: text.describe(
    'Pour send_pdf ou une conversion : le numéro du document visé ; null pour le dernier émis.',
  ),
});

export type DraftOutput = z.infer<typeof draftOutput>;
export type TurnOutput = z.infer<typeof turnOutput>;
export type TurnAction = (typeof ACTIONS)[number];

// --- The model's draft, as the code keeps it --------------------------------------------------

const decimal = (value: number) => new Dec(String(value)).toFixed();

/**
 * The model's draft as a working draft — or the problems that a schema cannot express, worded
 * for the model to fix. Nothing is guessed: a value it left empty stays empty, and is asked.
 */
export function toWorkingDraft(
  output: DraftOutput,
): { draft: WorkingDraft; problems: [] } | { draft: null; problems: string[] } {
  const problems: string[] = [];
  const value = (n: number | null, what: string): string | null => {
    if (n === null) return null;
    if (!Number.isFinite(n) || n < 0) {
      problems.push(`${what} : un nombre positif`);
      return null;
    }
    return decimal(n);
  };
  const percent = (n: number | null, what: string) => {
    if (n !== null && n > 100) problems.push(`${what} : un pourcentage de 0 à 100`);
    return value(n, what);
  };

  const sections: DraftSection[] = output.sections
    .map((source) => ({
      title: source.title?.trim() || null,
      show_subtotal: source.show_subtotal,
      lines: source.lines.map((l): DraftLine => {
        const label = l.label.trim() || 'Poste';
        const quantity = value(l.quantity, `${label}, quantité`);
        const unitPrice = value(l.unit_price, `${label}, prix unitaire`);
        const flat = value(l.flat_amount, `${label}, forfait`);
        if (quantity === '0') problems.push(`${label} : une quantité n'est pas nulle`);
        if (flat !== null && (quantity !== null || unitPrice !== null)) {
          problems.push(`${label} : un forfait, ou une quantité et un prix, pas les deux`);
        }
        if (l.descriptive && (flat ?? quantity ?? unitPrice) !== null) {
          problems.push(`${label} : une ligne descriptive n'a pas de montant`);
        }
        return {
          label,
          description: l.description?.trim() || null,
          unit: l.unit?.trim() || null,
          quantity,
          unit_price: unitPrice,
          flat_amount: flat,
          calculated: !l.descriptive,
        };
      }),
    }))
    .filter((s) => s.lines.length > 0);

  const adjustments: DraftAdjustment[] = output.adjustments.map((a) => ({
    label: a.label.trim() || 'Ajustement',
    mode: a.kind === 'percent' ? 'percent' : 'fixed',
    value:
      a.kind === 'percent' ? percent(a.value, a.label) : value(a.value, a.label || 'ajustement'),
    sign: a.direction === 'subtract' ? -1 : 1,
    base: a.base,
  }));

  const days = output.validity_days;
  if (days !== null && (!Number.isInteger(days) || days <= 0)) {
    problems.push('validité : un nombre entier de jours');
  }

  const draft: WorkingDraft = {
    document_type: output.document_type,
    subject: output.subject?.trim() || null,
    client_name: output.client_name?.trim() || null,
    client_phone: output.client_phone?.trim() || null,
    client_address: output.client_address?.trim() || null,
    site: output.site?.trim() || null,
    delivery_text: output.delivery?.trim() || null,
    warranty_text: output.warranty?.trim() || null,
    validity_days: days !== null && Number.isInteger(days) && days > 0 ? String(days) : null,
    tax_rate: percent(output.tax_rate, 'TVA'),
    deposit_percent: percent(output.deposit_percent, 'acompte'),
    conditions: output.conditions.map((c) => c.trim()).filter(Boolean),
    sections,
    adjustments,
  };
  return problems.length > 0 ? { draft: null, problems } : { draft, problems: [] };
}

/** The working draft in the model's own shape: what it reads, and rewrites when it changes. */
export function toDraftOutput(draft: WorkingDraft): DraftOutput {
  const n = (v: string | null) => (v === null ? null : Number(v));
  return {
    document_type: draft.document_type,
    subject: draft.subject,
    client_name: draft.client_name,
    client_phone: draft.client_phone,
    client_address: draft.client_address,
    site: draft.site,
    delivery: draft.delivery_text,
    warranty: draft.warranty_text,
    validity_days: n(draft.validity_days),
    tax_rate: n(draft.tax_rate),
    deposit_percent: n(draft.deposit_percent),
    conditions: draft.conditions,
    sections: draft.sections.map((s) => ({
      title: s.title,
      show_subtotal: s.show_subtotal,
      lines: s.lines.map((l) => ({
        label: l.label,
        description: l.description,
        unit: l.unit,
        quantity: n(l.quantity),
        unit_price: n(l.unit_price),
        flat_amount: n(l.flat_amount),
        descriptive: !l.calculated,
      })),
    })),
    adjustments: draft.adjustments.map((a) => ({
      label: a.label,
      kind: a.mode === 'percent' ? 'percent' : 'amount',
      value: n(a.value),
      direction: a.sign === -1 ? 'subtract' : 'add',
      base: a.base,
    })),
  };
}

/** Two drafts say the same document. */
export function sameDraft(a: WorkingDraft | null, b: WorkingDraft | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// --- The schema as the model's API receives it --------------------------------------------------

/** The strict JSON schema of a Zod object: every field required, nothing more allowed. */
export function strictJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { target: 'draft-7' }) as Record<string, unknown>;
  const unsupported = new Set([
    '$schema',
    'default',
    'pattern',
    'minLength',
    'maxLength',
    'minItems',
    'maxItems',
    'minimum',
    'maximum',
    'exclusiveMinimum',
    'title',
    'format',
  ]);
  const strict = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(strict);
    if (!node || typeof node !== 'object') return node;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      if (unsupported.has(key)) continue;
      out[key] =
        key === 'properties' || key === 'definitions' || key === '$defs'
          ? Object.fromEntries(Object.entries(value as object).map(([k, v]) => [k, strict(v)]))
          : strict(value);
    }
    if (out.type === 'object' && out.properties) {
      out.required = Object.keys(out.properties as object);
      out.additionalProperties = false;
    }
    return out;
  };
  return strict(json) as Record<string, unknown>;
}
