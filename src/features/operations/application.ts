import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Documents } from '@/features/documents';
import { db } from '@/platform/db';
import { inOrganization } from '@/platform/tenancy';

export class OperationError extends Error {
  constructor(readonly code: 'invalid_input' | 'not_found') {
    super(code);
  }
}

export interface Incident {
  id: number;
  channel: string;
  senderHint: string;
  error: string;
  attempts: number;
  organizationId: string | null;
  receivedAt: string;
  settledAt: string | null;
}

export interface JournalEntry {
  id: number;
  organizationId: string;
  operatorId: string;
  action: string;
  subject: string;
  reason: string;
  createdAt: string;
}

/** What a person said from her space (spec 012) — never who said it. */
export interface FeedbackLine {
  id: string;
  organizationId: string;
  kind: 'problem' | 'idea' | 'praise';
  message: string;
  page: string | null;
  createdAt: string;
}

const readingInput = z.object({
  organizationId: z
    .string()
    .trim()
    .regex(/^org_[\w-]{3,80}$/),
  number: z.string().trim().min(1).max(60),
  reason: z.string().trim().min(5).max(500),
});

const iso = (value: unknown) => (value instanceof Date ? value.toISOString() : String(value));

/**
 * The operator space's use cases. The caller has checked the operator (`checkOperator`); every
 * reading of an organization's document is journaled in the transaction that finds it.
 */
export function createOperations(deps: { documents: Documents }) {
  return {
    /** Messages that failed after their attempts — never a body, the sender masked. */
    async incidents(limit = 50): Promise<Incident[]> {
      const result = await db.execute(sql`select * from public.operator_incidents(${limit})`);
      return result.rows.map((row) => ({
        id: Number(row.id),
        channel: String(row.channel),
        senderHint: String(row.sender_hint),
        error: String(row.error),
        attempts: Number(row.attempts),
        organizationId: row.organization_id === null ? null : String(row.organization_id),
        receivedAt: iso(row.received_at),
        settledAt: row.settled_at === null ? null : iso(row.settled_at),
      }));
    },

    /** The latest operator actions. */
    async journal(limit = 50): Promise<JournalEntry[]> {
      const result = await db.execute(sql`select * from public.operator_journal_recent(${limit})`);
      return result.rows.map((row) => ({
        id: Number(row.id),
        organizationId: String(row.organization_id),
        operatorId: String(row.operator_id),
        action: String(row.action),
        subject: String(row.subject),
        reason: String(row.reason),
        createdAt: iso(row.created_at),
      }));
    },

    /** What people said from their space, the latest first. */
    async feedback(limit = 50): Promise<FeedbackLine[]> {
      const result = await db.execute(sql`select * from public.operator_feedback(${limit})`);
      return result.rows.map((row) => ({
        id: String(row.feedback_id),
        organizationId: String(row.organization_id),
        kind: String(row.kind) as FeedbackLine['kind'],
        message: String(row.message),
        page: row.page === null ? null : String(row.page),
        createdAt: iso(row.created_at),
      }));
    },

    /**
     * An exceptional reading: an issued document of an organization, by its number, for a reason.
     * Found and journaled together — without the journal entry, nothing is read.
     */
    async readDocument(
      operator: { userId: string },
      input: unknown,
    ): Promise<{ number: string; pdf: Uint8Array }> {
      const parsed = readingInput.safeParse(input);
      if (!parsed.success) throw new OperationError('invalid_input');
      const { organizationId, number, reason } = parsed.data;
      const id = await inOrganization(organizationId, async (tx) => {
        const found = await tx.execute(sql`
          select id from documents where number = ${number} and state <> 'draft'
          order by issued_at desc limit 1`);
        const row = found.rows[0];
        if (!row) return null;
        await tx.execute(sql`
          insert into operator_journal (organization_id, operator_id, action, subject, reason)
          values (${organizationId}, ${operator.userId}, 'document_read', ${number}, ${reason})`);
        return Number(row.id);
      });
      if (id === null) throw new OperationError('not_found');
      return deps.documents.pdf({ organizationId }, id);
    },
  };
}

export type Operations = ReturnType<typeof createOperations>;
