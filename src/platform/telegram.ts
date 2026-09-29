import { timingSafeEqual } from 'node:crypto';
import type { InboundMessage, MessagingChannel } from '@/features/conversation';

/**
 * The Telegram adapter (Bot API). The webhook is authenticated by the secret token Telegram echoes
 * in X-Telegram-Bot-Api-Secret-Token; only private chats are accepted, so the chat is the sender.
 */
export interface TelegramOptions {
  botToken: string;
  webhookSecret: string;
  fetch?: typeof fetch;
}

export function secretIsValid(header: string | null, secret: string): boolean {
  if (!header) return false;
  const left = Buffer.from(header);
  const right = Buffer.from(secret);
  return left.length === right.length && timingSafeEqual(left, right);
}

type Json = Record<string, unknown>;
const record = (value: unknown): Json =>
  value && typeof value === 'object' ? (value as Json) : {};

/** The message of a verified update; anything but a private chat is ignored. */
export function parseUpdate(body: unknown): InboundMessage[] {
  const update = record(body);
  const callback = record(update.callback_query);
  if (callback.id) {
    const from = record(callback.from);
    const chat = record(record(callback.message).chat);
    if (chat.type !== 'private' || String(chat.id) !== String(from.id)) return [];
    return [
      {
        channel: 'telegram',
        providerMessageId: `cb:${String(callback.id)}`,
        sender: String(from.id),
        displayName: displayName(from),
        kind: 'action',
        action: String(callback.data ?? ''),
      },
    ];
  }
  const message = record(update.message);
  const from = record(message.from);
  const chat = record(message.chat);
  if (!message.message_id || chat.type !== 'private' || String(chat.id) !== String(from.id))
    return [];
  const base = {
    channel: 'telegram' as const,
    providerMessageId: `${String(chat.id)}:${String(message.message_id)}`,
    sender: String(from.id),
    displayName: displayName(from),
  };
  if (message.contact) {
    const contact = record(message.contact);
    return [
      {
        ...base,
        kind: 'contact',
        contact: {
          phoneNumber: String(contact.phone_number ?? ''),
          userId: String(contact.user_id ?? ''),
        },
      },
    ];
  }
  if (typeof message.text === 'string') {
    // "/start" opens the conversation: a greeting, not a sale.
    return [{ ...base, kind: 'text', text: message.text === '/start' ? 'Bonjour' : message.text }];
  }
  const voice = record(message.voice ?? message.audio);
  if (voice.file_id) {
    return [
      {
        ...base,
        kind: 'voice',
        media: {
          id: String(voice.file_id),
          mediaType: (voice.mime_type as string) ?? 'audio/ogg',
          filename: null,
        },
      },
    ];
  }
  if (Array.isArray(message.photo) && message.photo.length > 0) {
    const largest = record(message.photo[message.photo.length - 1]);
    return [
      {
        ...base,
        kind: 'photo',
        text: (message.caption as string) ?? null,
        media: { id: String(largest.file_id), mediaType: 'image/jpeg', filename: null },
      },
    ];
  }
  return [{ ...base, kind: 'unsupported' }];
}

function displayName(from: Json): string | null {
  const name = [from.first_name, from.last_name]
    .filter((part) => typeof part === 'string')
    .join(' ');
  return name || null;
}

export function telegramChannel(options: TelegramOptions): MessagingChannel {
  const http = options.fetch ?? fetch;
  const api = `https://api.telegram.org/bot${options.botToken}`;

  async function call(method: string, payload: Json | FormData): Promise<Json> {
    const response = await http(`${api}/${method}`, {
      method: 'POST',
      ...(payload instanceof FormData
        ? { body: payload }
        : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }),
    });
    const body = (await response.json().catch(() => ({}))) as Json;
    if (!response.ok || body.ok !== true)
      throw new Error(`telegram ${method} failed: ${response.status}`);
    return record(body.result);
  }

  return {
    channel: 'telegram',
    async sendText(to, text, actions) {
      await call('sendMessage', {
        chat_id: to,
        text,
        // Any number-sharing keyboard goes away once the conversation has started.
        reply_markup: actions?.length
          ? { inline_keyboard: [actions.map((a) => ({ text: a.label, callback_data: a.id }))] }
          : { remove_keyboard: true },
      });
    },
    async sendDocument(to, pdf, filename, caption) {
      const form = new FormData();
      form.append('chat_id', to);
      form.append('caption', caption);
      form.append(
        'document',
        new Blob([new Uint8Array(pdf)], { type: 'application/pdf' }),
        filename,
      );
      await call('sendDocument', form);
    },
    async askForContact(to, text, buttonLabel) {
      await call('sendMessage', {
        chat_id: to,
        text,
        reply_markup: {
          keyboard: [[{ text: buttonLabel, request_contact: true }]],
          one_time_keyboard: true,
          resize_keyboard: true,
        },
      });
    },
    async download(media) {
      const file = await call('getFile', { file_id: media.id });
      const path = String(file.file_path ?? '');
      const response = await http(`https://api.telegram.org/file/bot${options.botToken}/${path}`);
      if (!response.ok) throw new Error(`telegram download failed: ${response.status}`);
      return {
        bytes: new Uint8Array(await response.arrayBuffer()),
        mediaType: media.mediaType ?? 'application/octet-stream',
      };
    },
    async acknowledgeAction(message) {
      const id = message.providerMessageId.startsWith('cb:')
        ? message.providerMessageId.slice(3)
        : '';
      if (id) await call('answerCallbackQuery', { callback_query_id: id });
    },
  };
}
