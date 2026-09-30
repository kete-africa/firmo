import { sql } from 'drizzle-orm';
import type { Transaction } from '@/platform/db';
import type { WorkingDraft } from '../draft';
import type { Channel, TurnUsage } from '../ports';

/** One conversation per sender and channel, in its organization (RLS). */
export interface ConversationState {
  id: number;
  draft: WorkingDraft | null;
  /** The draft before its last change: what « annule » brings back. */
  previousDraft: WorkingDraft | null;
  documentId: number | null;
  pendingIssue: { documentId: number; sha256: string } | null;
  history: { person: string; firmo: string }[];
  /** When she last wrote, before this message (ISO); what a pause is measured from. */
  lastActivityAt: string;
}

export async function loadConversation(
  tx: Transaction,
  organizationId: string,
  channel: Channel,
  sender: string,
): Promise<ConversationState> {
  await tx.execute(sql`
    insert into conversations (organization_id, channel, sender)
    values (${organizationId}, ${channel}, ${sender}) on conflict do nothing`);
  const result = await tx.execute(sql`
    select id, draft, previous_draft, document_id, pending_issue, history, updated_at
    from conversations
    where channel = ${channel} and sender = ${sender} for update`);
  const row = result.rows[0] as Record<string, unknown>;
  return {
    id: Number(row.id),
    draft: (row.draft as WorkingDraft | null) ?? null,
    previousDraft: (row.previous_draft as WorkingDraft | null) ?? null,
    documentId: row.document_id === null ? null : Number(row.document_id),
    pendingIssue: (row.pending_issue as ConversationState['pendingIssue']) ?? null,
    history: (row.history as ConversationState['history']) ?? [],
    lastActivityAt: new Date(row.updated_at as string | Date).toISOString(),
  };
}

export async function saveConversation(tx: Transaction, state: ConversationState): Promise<void> {
  await tx.execute(sql`
    update conversations set
      draft = ${state.draft === null ? null : JSON.stringify(state.draft)}::jsonb,
      previous_draft = ${
        state.previousDraft === null ? null : JSON.stringify(state.previousDraft)
      }::jsonb,
      document_id = ${state.documentId},
      pending_issue = ${state.pendingIssue === null ? null : JSON.stringify(state.pendingIssue)}::jsonb,
      history = ${JSON.stringify(state.history.slice(-12))}::jsonb,
      updated_at = now()
    where id = ${state.id}`);
}

/** What the model cost for one turn, and the document it worked on — counts only (spec 007). */
export async function recordUsage(
  tx: Transaction,
  input: {
    organizationId: string;
    channel: Channel;
    documentId: number | null;
    usage: readonly TurnUsage[];
  },
): Promise<TurnUsage | null> {
  if (input.usage.length === 0) return null;
  const sum = (key: keyof TurnUsage) => input.usage.reduce((total, u) => total + u[key], 0);
  const total = {
    modelCalls: sum('modelCalls'),
    inputTokens: sum('inputTokens'),
    outputTokens: sum('outputTokens'),
  };
  await tx.execute(sql`
    insert into ai_usage
      (organization_id, channel, document_id, model_calls, input_tokens, output_tokens)
    values (${input.organizationId}, ${input.channel}, ${input.documentId},
            ${total.modelCalls}, ${total.inputTokens}, ${total.outputTokens})`);
  return total;
}
