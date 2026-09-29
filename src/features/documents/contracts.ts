import { z } from 'zod';
import { DOCUMENT_TYPES } from './domain/types';

/**
 * What a draft is made of, as the conversation or the editor sends it. Numbers are decimal
 * strings — never floats — and are kept exactly as given: Firmo never rounds or corrects a price.
 */
const decimal = z
  .string()
  .trim()
  .regex(/^\d+(?:\.\d+)?$/, 'a non-negative decimal written with a dot');
const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => (value ? value : null));

export const lineInput = z
  .object({
    label: text(500),
    description: optionalText(2000),
    unit: optionalText(100),
    quantity: decimal.nullish(),
    unitPrice: decimal.nullish(),
    flatAmount: decimal.nullish(),
    calculated: z.boolean().default(true),
    confirmationRequired: z.boolean().default(false),
  })
  .superRefine((line, context) => {
    const pair = line.quantity != null || line.unitPrice != null;
    if (!line.calculated && (pair || line.flatAmount != null)) {
      context.addIssue({ code: 'custom', message: 'a descriptive line carries no amount' });
    }
    if (line.flatAmount != null && pair) {
      context.addIssue({ code: 'custom', message: 'a flat amount excludes quantity and price' });
    }
    const complete = line.flatAmount != null || (line.quantity != null && line.unitPrice != null);
    if (line.calculated && !complete && !line.confirmationRequired) {
      context.addIssue({ code: 'custom', message: 'an incomplete line must ask for confirmation' });
    }
    if (line.quantity != null && Number(line.quantity) === 0) {
      context.addIssue({ code: 'custom', message: 'a quantity is greater than zero' });
    }
  });

export const sectionInput = z.object({
  title: optionalText(500),
  showSubtotal: z.boolean().default(false),
  lines: z.array(lineInput).min(1).max(200),
});

export const adjustmentInput = z
  .object({
    label: text(500),
    mode: z.enum(['fixed', 'percent']),
    value: decimal,
    sign: z.union([z.literal(1), z.literal(-1)]).default(1),
    base: z.enum(['section', 'items_total', 'taxable_base']).default('items_total'),
    /** The index of the section a `section` adjustment is based on. */
    sectionIndex: z.number().int().min(0).nullish(),
  })
  .refine((a) => (a.base === 'section') === (a.sectionIndex != null), {
    message: 'only a section adjustment names a section',
  });

export const draftInput = z.object({
  type: z.enum(DOCUMENT_TYPES),
  subject: text(300),
  client: z.object({
    name: text(200),
    phone: optionalText(40),
    address: optionalText(500),
  }),
  clientId: z.number().int().positive().nullish(),
  documentDate: z.iso.date().nullish(),
  validityDays: z.number().int().positive().max(3650).nullish(),
  site: optionalText(300),
  delivery: optionalText(300),
  warranty: optionalText(300),
  assumptions: optionalText(2000),
  depositPercent: decimal.nullish(),
  taxRate: decimal.nullish(),
  sections: z.array(sectionInput).min(1).max(50),
  adjustments: z.array(adjustmentInput).max(20).default([]),
  clauseIds: z.array(z.number().int().positive()).max(30).nullish(),
});
export type DraftInput = z.input<typeof draftInput>;
export type Draft = z.output<typeof draftInput>;

export const profileInput = z.object({
  name: text(200),
  legalName: optionalText(200),
  trade: optionalText(200),
  phone: optionalText(40),
  email: optionalText(200),
  address: optionalText(500),
  legalMentions: optionalText(1000),
  rccm: optionalText(100),
  taxId: optionalText(100),
  brandColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .nullish()
    .transform((value) => value ?? null),
  defaultWarranty: optionalText(300),
  defaultDelivery: optionalText(300),
  defaultDepositPercent: decimal.nullish(),
  defaultValidityDays: z.number().int().positive().max(3650).nullish(),
});
export type ProfileInput = z.input<typeof profileInput>;

export const paymentInput = z.object({
  amount: decimal,
  paidOn: z.iso.date(),
  method: text(100),
  reference: optionalText(200),
});
export type PaymentInput = z.input<typeof paymentInput>;
