import { sql } from 'drizzle-orm';
import type { Transaction } from '@/platform/db';
import type { WorkingDraft } from '../draft';
import type { Channel, TurnUsage } from '../ports';

/** One conversation per sender and channel, in its organization (RLS). */
export interface ConversationState {
  id: number;
  draft: WorkingDraft | null;
  documentId: number | null;
  pendingIssue: { documentId: number; sha256: string } | null;
  history: { person: string; firmo: string }[];
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
    select id, draft, document_id, pending_issue, history from conversations
    where channel = ${channel} and sender = ${sender} for update`);
  const row = result.rows[0] as Record<string, unknown>;
  return {
    id: Number(row.id),
    draft: (row.draft as WorkingDraft | null) ?? null,
    documentId: row.document_id === null ? null : Number(row.document_id),
    pendingIssue: (row.pending_issue as ConversationState['pendingIssue']) ?? null,
    history: (row.history as ConversationState['history']) ?? [],
  };
}

export async function saveConversation(tx: Transaction, state: ConversationState): Promise<void> {
  await tx.execute(sql`
    update conversations set
      draft = ${state.draft === null ? null : JSON.stringify(state.draft)}::jsonb,
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
): Promise<void> {
  if (input.usage.length === 0) return;
  const sum = (key: keyof TurnUsage) => input.usage.reduce((total, u) => total + u[key], 0);
  await tx.execute(sql`
    insert into ai_usage
      (organization_id, channel, document_id, model_calls, input_tokens, output_tokens)
    values (${input.organizationId}, ${input.channel}, ${input.documentId},
            ${sum('modelCalls')}, ${sum('inputTokens')}, ${sum('outputTokens')})`);
}
