import { z } from 'zod';
import {
  EMPTY_DRAFT,
  EvidenceError,
  provenNumber,
  saidText,
  type DraftAdjustment,
  type DraftLine,
  type DraftSection,
  type WorkingDraft,
} from './draft';

/**
 * The agent's tools. Each one is a use case with its guard: the model proposes, the code checks
 * against the person's message and applies — or refuses and says why, so the model asks instead.
 * Schemas are strict (every field present, `null` when absent) for structured tool calls.
 */

/** A number said by the person, with the exact words that contain it. */
const said = z.object({ value: z.string(), evidence: z.string() }).nullable();
const text = z.string().nullable();

const lineArgs = z.object({
  label: z.string(),
  description: text,
  unit: text,
  quantity: said,
  unit_price: said,
  flat_amount: said,
  /** A line that only describes, with no amount. */
  descriptive: z.boolean(),
});

export const addToDraftArgs = z.object({
  /** True only when the person asks for a new document and gives its content. */
  start_new: z.boolean(),
  document_type: z.enum(['quote', 'proforma', 'invoice']).nullable(),
  client_name: text,
  client_phone: text,
  client_address: text,
  subject: text,
  site: text,
  delivery_text: text,
  warranty_text: text,
  conditions: z.array(z.string()),
  validity_days: said,
  tax_rate: said,
  deposit_percent: said,
  sections: z.array(
    z.object({ title: text, show_subtotal: z.boolean(), lines: z.array(lineArgs) }),
  ),
  adjustments: z.array(
    z.object({
      label: z.string(),
      mode: z.enum(['percent', 'fixed']),
      sign: z.union([z.literal(1), z.literal(-1)]),
      base: z.enum(['items_total', 'taxable_base']),
      value: said,
    }),
  ),
});

const CHANGE_FIELDS = [
  'label',
  'description',
  'unit',
  'quantity',
  'unit_price',
  'flat_amount',
  'title',
  'show_subtotal',
  'value',
  'mode',
  'document_type',
  'client_name',
  'client_phone',
  'client_address',
  'subject',
  'site',
  'delivery_text',
  'warranty_text',
  'validity_days',
  'tax_rate',
  'deposit_percent',
  'add_condition',
  'remove_condition',
] as const;

export const changeDraftArgs = z.object({
  changes: z.array(
    z.object({
      /** L3, S1, A2 — or "document" for the document's own facts. */
      id: z.string(),
      field: z.enum(CHANGE_FIELDS),
      value: text,
      /** The exact words of the message that give the new value. */
      evidence: text,
    }),
  ),
});

export const removeFromDraftArgs = z.object({ ids: z.array(z.string()) });
export const issuerNameArgs = z.object({ name: z.string() });
export const openSpaceArgs = z.object({ page: z.enum(['home', 'documents', 'presentation']) });
export const convertArgs = z.object({ target: z.enum(['proforma', 'invoice']) });
export const findArgs = z.object({ query: z.string() });
export const noArgs = z.object({});

export type AddToDraftArgs = z.infer<typeof addToDraftArgs>;
export type ChangeDraftArgs = z.infer<typeof changeDraftArgs>;

export const TOOLS = {
  add_to_draft: {
    args: addToDraftArgs,
    description:
      "Ajoute au brouillon ce que la personne vient de chiffrer (postes, groupes, ajustements, client, objet, conditions). Chaque nombre avec les mots exacts du message qui le contiennent. N'invente rien : une valeur non dite reste null.",
  },
  change_draft: {
    args: changeDraftArgs,
    description:
      "Corrige ou complète le brouillon : vise un élément par son id (L3, S1, A2) ou 'document'. Chaque nouvelle valeur avec les mots exacts du message.",
  },
  remove_from_draft: {
    args: removeFromDraftArgs,
    description:
      'Retire des éléments du brouillon, par leurs ids, quand la personne le demande clairement.',
  },
  set_issuer_name: {
    args: issuerNameArgs,
    description:
      'Enregistre le nom sous lequel ses documents partent (réponse à « Sous quel nom veux-tu que ce devis parte ? »).',
  },
  start_new_document: {
    args: noArgs,
    description:
      'Abandonne le brouillon actif pour repartir de zéro, à la demande explicite de la personne.',
  },
  show_preview: {
    args: noArgs,
    description: "Envoie l'aperçu PDF gratuit du brouillon, marqué BROUILLON.",
  },
  propose_issue: {
    args: noArgs,
    description:
      "Propose l'émission du document final (numéro définitif) ; la personne devra confirmer.",
  },
  confirm_issue: {
    args: noArgs,
    description:
      "Émet le document proposé, seulement si la personne vient de confirmer l'émission proposée.",
  },
  send_latest_pdf: {
    args: noArgs,
    description: 'Renvoie le PDF du dernier document émis.',
  },
  convert_latest: {
    args: convertArgs,
    description: 'Transforme le dernier document émis en proforma ou en facture, sans ressaisie.',
  },
  find_documents: {
    args: findArgs,
    description: 'Cherche parmi ses documents (client, objet ou numéro).',
  },
  open_space: {
    args: openSpaceArgs,
    description:
      'Envoie un lien à usage unique vers son espace Firmo : accueil, documents, ou présentation (nom, logo, couleur, conditions, numérotation).',
  },
} as const;

export type ToolName = keyof typeof TOOLS;

/** The strict JSON schema of a tool's arguments, as the model receives it. */
export function jsonSchemaOf(schema: z.ZodType): Record<string, unknown> {
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
    if (out.type === 'object' && !out.properties) {
      out.properties = {};
      out.required = [];
      out.additionalProperties = false;
    }
    return out;
  };
  return strict(json) as Record<string, unknown>;
}

// --- Pure operations on the draft --------------------------------------------------------------

const nextId = (draft: WorkingDraft, prefix: 'S' | 'L' | 'A') => {
  const id = `${prefix}${draft.next_id}`;
  draft.next_id += 1;
  return id;
};

/**
 * What the person just priced joins the draft. A number without its own words in the message is
 * refused — the whole call is refused, so the model asks rather than half-writes.
 */
export function addToDraft(
  current: WorkingDraft | null,
  args: AddToDraftArgs,
  message: string,
): WorkingDraft {
  const draft: WorkingDraft = structuredClone(args.start_new || !current ? EMPTY_DRAFT : current);
  if (args.document_type) draft.document_type = args.document_type;
  const fill = (
    field:
      | 'client_name'
      | 'client_phone'
      | 'client_address'
      | 'subject'
      | 'site'
      | 'delivery_text'
      | 'warranty_text',
    value: string | null,
  ) => {
    if (value?.trim()) draft[field] = value.trim();
  };
  fill('client_name', args.client_name);
  fill('client_phone', args.client_phone);
  fill('client_address', args.client_address);
  // The subject, delivery and warranty are shaped wording (presentation is ours), never numbers.
  fill('subject', args.subject);
  fill('site', args.site);
  fill('delivery_text', args.delivery_text);
  fill('warranty_text', args.warranty_text);
  draft.conditions.push(...args.conditions.map((c) => c.trim()).filter(Boolean));
  for (const field of ['validity_days', 'tax_rate', 'deposit_percent'] as const) {
    const value = provenNumber(args[field]?.value, args[field]?.evidence, message);
    if (value !== null) draft[field] = value;
  }
  for (const section of args.sections) {
    const lines: DraftLine[] = section.lines.map((line) => {
      const flat = provenNumber(line.flat_amount?.value, line.flat_amount?.evidence, message);
      const quantity = provenNumber(line.quantity?.value, line.quantity?.evidence, message);
      const unitPrice = provenNumber(line.unit_price?.value, line.unit_price?.evidence, message);
      if (flat !== null && (quantity !== null || unitPrice !== null)) {
        throw new EvidenceError(`${line.label}: a flat amount or a quantity and a price, not both`);
      }
      if (line.descriptive && (flat ?? quantity ?? unitPrice) !== null) {
        throw new EvidenceError(`${line.label}: a descriptive line has no amount`);
      }
      if (quantity !== null && Number(quantity) === 0)
        throw new EvidenceError('a quantity is not zero');
      return {
        id: nextId(draft, 'L'),
        label: line.label.trim(),
        description: line.description?.trim() || null,
        unit: line.unit?.trim() || null,
        quantity,
        unit_price: unitPrice,
        flat_amount: flat,
        calculated: !line.descriptive,
      };
    });
    if (lines.length === 0) continue;
    const newSection: DraftSection = {
      id: nextId(draft, 'S'),
      title: section.title?.trim() || null,
      show_subtotal: section.show_subtotal,
      lines,
    };
    draft.sections.push(newSection);
  }
  for (const adjustment of args.adjustments) {
    const value = provenNumber(adjustment.value?.value, adjustment.value?.evidence, message);
    const evidence = adjustment.value?.evidence ?? '';
    // A percentage is one only when the person says so; an amount in F stays an amount.
    const mode = /%|pour\s*cent|percent/i.test(evidence)
      ? 'percent'
      : value === null
        ? adjustment.mode
        : 'fixed';
    const added: DraftAdjustment = {
      id: nextId(draft, 'A'),
      label: adjustment.label.trim(),
      mode,
      value,
      sign: adjustment.sign,
      base: adjustment.base,
    };
    draft.adjustments.push(added);
  }
  return draft;
}

const DOCUMENT_TEXT = new Set([
  'client_name',
  'client_phone',
  'client_address',
  'subject',
  'site',
  'delivery_text',
  'warranty_text',
]);
const DOCUMENT_NUMBERS = new Set(['validity_days', 'tax_rate', 'deposit_percent']);

function changeDocument(
  draft: WorkingDraft,
  change: ChangeDraftArgs['changes'][number],
  message: string,
): void {
  const { field } = change;
  if (field === 'add_condition') {
    const condition = change.value?.trim();
    if (!condition) throw new EvidenceError('a condition needs its wording');
    draft.conditions.push(condition);
  } else if (field === 'remove_condition') {
    const target = change.value?.trim().toLowerCase();
    draft.conditions = draft.conditions.filter((condition) => condition.toLowerCase() !== target);
  } else if (field === 'document_type') {
    if (change.value !== 'quote' && change.value !== 'proforma' && change.value !== 'invoice') {
      throw new EvidenceError('unknown document type');
    }
    draft.document_type = change.value;
  } else if (DOCUMENT_NUMBERS.has(field)) {
    const value = provenNumber(change.value, change.evidence, message);
    if (field === 'validity_days' && value !== null && !/^\d+$/.test(value)) {
      throw new EvidenceError('a validity is a whole number of days');
    }
    draft[field as 'validity_days' | 'tax_rate' | 'deposit_percent'] = value;
  } else if (DOCUMENT_TEXT.has(field)) {
    // The client's name and phone are the person's words; the rest is shaped wording.
    const value =
      field === 'client_name' || field === 'client_phone'
        ? saidText(change.value, message)
        : change.value?.trim() || null;
    draft[field as 'client_name'] = value;
  } else {
    throw new EvidenceError(`${field} is not a document field`);
  }
}

function changeLine(
  line: DraftLine,
  change: ChangeDraftArgs['changes'][number],
  message: string,
): void {
  const { field } = change;
  if (field === 'quantity' || field === 'unit_price' || field === 'flat_amount') {
    const value = provenNumber(change.value, change.evidence, message);
    line[field] = value;
    if (field === 'flat_amount' && value !== null) {
      line.quantity = null;
      line.unit_price = null;
    } else if (value !== null) line.flat_amount = null;
    line.calculated = true;
  } else if (field === 'label' && change.value?.trim()) line.label = change.value.trim();
  else if (field === 'description') line.description = change.value?.trim() || null;
  else if (field === 'unit') line.unit = change.value?.trim() || null;
  else throw new EvidenceError(`${field} is not a line field`);
}

function changeAdjustment(
  adjustment: DraftAdjustment,
  change: ChangeDraftArgs['changes'][number],
  message: string,
): void {
  if (change.field === 'value') {
    adjustment.value = provenNumber(change.value, change.evidence, message);
    if (/%|pour\s*cent|percent/i.test(change.evidence ?? '')) adjustment.mode = 'percent';
  } else if (change.field === 'label' && change.value?.trim())
    adjustment.label = change.value.trim();
  else if (change.field === 'mode' && (change.value === 'percent' || change.value === 'fixed')) {
    adjustment.mode = change.value;
  } else throw new EvidenceError(`${change.field} is not an adjustment field`);
}

/** Corrections by id; one refused change refuses the whole call. */
export function changeDraft(
  current: WorkingDraft,
  args: ChangeDraftArgs,
  message: string,
): WorkingDraft {
  const draft = structuredClone(current);
  for (const change of args.changes) {
    if (change.id === 'document') {
      changeDocument(draft, change, message);
      continue;
    }
    const section = draft.sections.find((s) => s.id === change.id);
    if (section) {
      if (change.field === 'title') section.title = change.value?.trim() || null;
      else if (change.field === 'show_subtotal') section.show_subtotal = change.value === 'true';
      else throw new EvidenceError(`${change.field} is not a section field`);
      continue;
    }
    const line = draft.sections.flatMap((s) => s.lines).find((l) => l.id === change.id);
    if (line) {
      changeLine(line, change, message);
      continue;
    }
    const adjustment = draft.adjustments.find((a) => a.id === change.id);
    if (adjustment) {
      changeAdjustment(adjustment, change, message);
      continue;
    }
    throw new EvidenceError(`no element ${change.id} in the draft`);
  }
  return draft;
}

export function removeFromDraft(current: WorkingDraft, ids: string[]): WorkingDraft {
  const draft = structuredClone(current);
  const known = new Set([
    ...draft.sections.map((s) => s.id),
    ...draft.sections.flatMap((s) => s.lines.map((l) => l.id)),
    ...draft.adjustments.map((a) => a.id),
  ]);
  for (const id of ids)
    if (!known.has(id)) throw new EvidenceError(`no element ${id} in the draft`);
  const gone = new Set(ids);
  draft.sections = draft.sections
    .filter((section) => !gone.has(section.id))
    .map((section) => ({ ...section, lines: section.lines.filter((line) => !gone.has(line.id)) }))
    .filter((section) => section.lines.length > 0);
  draft.adjustments = draft.adjustments.filter((adjustment) => !gone.has(adjustment.id));
  return draft;
}
