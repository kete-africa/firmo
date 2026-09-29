import type { Transaction } from '@/platform/db';

/**
 * The conversation's ports. Adapters (WhatsApp, Telegram, OpenAI) live in src/platform; no vendor
 * name crosses into this feature (constitution V).
 */

// --- Channels ----------------------------------------------------------------------------------

export type Channel = 'whatsapp' | 'telegram';

/** A message as a channel proved it: its sender is the channel's, never the message's claim. */
export interface InboundMessage {
  channel: Channel;
  providerMessageId: string;
  /** The sender the channel proves: a WhatsApp number, a Telegram user id. */
  sender: string;
  displayName: string | null;
  kind: 'text' | 'voice' | 'photo' | 'contact' | 'action' | 'unsupported';
  text?: string | null;
  media?: { id: string; mediaType: string | null; filename: string | null } | null;
  contact?: { phoneNumber: string; userId: string } | null;
  /** A button the person pressed (its id). */
  action?: string | null;
}

export interface OutboundAction {
  id: string;
  label: string;
}

export interface MessagingChannel {
  readonly channel: Channel;
  sendText(to: string, text: string, actions?: OutboundAction[]): Promise<void>;
  sendDocument(to: string, pdf: Uint8Array, filename: string, caption: string): Promise<void>;
  /** Telegram only reveals a number the person shares; WhatsApp never needs it. */
  askForContact(to: string, text: string, buttonLabel: string): Promise<void>;
  download(
    media: NonNullable<InboundMessage['media']>,
  ): Promise<{ bytes: Uint8Array; mediaType: string }>;
  /** Acknowledges a pressed button, where the channel expects it. */
  acknowledgeAction?(message: InboundMessage): Promise<void>;
}

// --- Model -------------------------------------------------------------------------------------

export interface ModelTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  name: string;
  /** The model's arguments, as JSON text. */
  arguments: string;
}

export interface TurnUsage {
  inputTokens: number;
  outputTokens: number;
  modelCalls: number;
}

export interface ConversationModel {
  /** Words heard, never completed; "[inaudible]" rather than a guess. */
  transcribeAudio(audio: {
    bytes: Uint8Array;
    mediaType: string;
  }): Promise<{ text: string; usage: TurnUsage }>;
  /** A sheet read word for word; "[illisible]" rather than a guess. */
  transcribeImage(image: {
    bytes: Uint8Array;
    mediaType: string;
  }): Promise<{ text: string; usage: TurnUsage }>;
  /**
   * One turn: the model may call tools — each executed by `execute`, whose answer it reads —
   * then writes its reply to the person.
   */
  runTurn(
    request: { instructions: string; input: string; tools: ModelTool[]; safetyId: string },
    execute: (call: ToolCall) => Promise<string>,
  ): Promise<{ reply: string; usage: TurnUsage }>;
}

/** What a conversation announces to Kete Cockpit (spec 008): the model's cost — counters only. */
export interface UsageEvents {
  aiUsage(
    tx: Transaction,
    fact: { organizationId: string; modelCalls: number; inputTokens: number; outputTokens: number },
  ): Promise<void>;
}
