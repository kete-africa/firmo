import { createHmac, timingSafeEqual } from 'node:crypto';
import type { InboundMessage, MessagingChannel } from '@/features/conversation';

/**
 * The WhatsApp adapter (Meta Cloud API). The webhook is authenticated by Meta's signature over the
 * raw body (X-Hub-Signature-256, the app secret); the sender is Meta's `from`, the person's number.
 */
export interface WhatsAppOptions {
  accessToken: string;
  phoneNumberId: string;
  appSecret: string;
  verifyToken: string;
  graphVersion?: string;
  fetch?: typeof fetch;
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Meta's subscription check: echoes the challenge only for our verify token. */
export function verifySubscription(url: URL, verifyToken: string): Response {
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token') ?? '';
  const challenge = url.searchParams.get('hub.challenge') ?? '';
  if (mode === 'subscribe' && safeEqual(token, verifyToken)) return new Response(challenge);
  return new Response(null, { status: 403 });
}

export function signatureIsValid(
  rawBody: string,
  header: string | null,
  appSecret: string,
): boolean {
  if (!header?.startsWith('sha256=')) return false;
  const expected = `sha256=${createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex')}`;
  return safeEqual(expected, header);
}

type Json = Record<string, unknown>;
const record = (value: unknown): Json =>
  value && typeof value === 'object' ? (value as Json) : {};
const list = (value: unknown): Json[] => (Array.isArray(value) ? (value as Json[]) : []);

/** The messages of a verified notification; statuses and unknown events are ignored. */
export function parseNotification(body: unknown): InboundMessage[] {
  const messages: InboundMessage[] = [];
  for (const entry of list(record(body).entry)) {
    for (const change of list(entry.changes)) {
      const value = record(change.value);
      const names = new Map(
        list(value.contacts).map((contact) => [
          String(contact.wa_id),
          String(record(contact.profile).name ?? ''),
        ]),
      );
      for (const message of list(value.messages)) {
        const sender = String(message.from ?? '');
        const id = String(message.id ?? '');
        if (!sender || !id) continue;
        const base = {
          channel: 'whatsapp' as const,
          providerMessageId: id,
          sender,
          displayName: names.get(sender) || null,
        };
        const type = String(message.type);
        if (type === 'text') {
          messages.push({ ...base, kind: 'text', text: String(record(message.text).body ?? '') });
        } else if (type === 'audio') {
          const audio = record(message.audio);
          messages.push({
            ...base,
            kind: 'voice',
            media: {
              id: String(audio.id),
              mediaType: (audio.mime_type as string) ?? null,
              filename: null,
            },
          });
        } else if (type === 'image') {
          const image = record(message.image);
          messages.push({
            ...base,
            kind: 'photo',
            text: (image.caption as string) ?? null,
            media: {
              id: String(image.id),
              mediaType: (image.mime_type as string) ?? null,
              filename: null,
            },
          });
        } else if (type === 'interactive') {
          const interactive = record(message.interactive);
          // A reply button, or a row chosen in a list.
          const reply = record(interactive.button_reply ?? interactive.list_reply);
          messages.push({ ...base, kind: 'action', action: String(reply.id ?? '') });
        } else if (type === 'button') {
          messages.push({
            ...base,
            kind: 'action',
            action: String(record(message.button).payload ?? ''),
          });
        } else {
          messages.push({ ...base, kind: 'unsupported' });
        }
      }
    }
  }
  return messages;
}

export function whatsappChannel(options: WhatsAppOptions): MessagingChannel {
  const http = options.fetch ?? fetch;
  const graph = `https://graph.facebook.com/${options.graphVersion ?? 'v25.0'}`;
  const auth = { authorization: `Bearer ${options.accessToken}` };

  async function send(payload: Json): Promise<void> {
    const response = await http(`${graph}/${options.phoneNumberId}/messages`, {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        ...payload,
      }),
    });
    if (!response.ok) throw new Error(`whatsapp send failed: ${response.status}`);
  }

  return {
    channel: 'whatsapp',
    async sendText(to, text, actions) {
      if (!actions?.length) {
        await send({ to, type: 'text', text: { body: text, preview_url: true } });
        return;
      }
      // An interactive message's text is 1 024 characters at most: a longer one goes first.
      let body = text;
      if (text.length > 1024) {
        await send({ to, type: 'text', text: { body: text, preview_url: true } });
        body = '…';
      }
      await send({
        to,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: body },
          action: {
            // WhatsApp: three buttons at most, titles of twenty characters at most.
            buttons: actions
              .slice(0, 3)
              .map((a) => ({ type: 'reply', reply: { id: a.id, title: a.label.slice(0, 20) } })),
          },
        },
      });
    },
    async sendDocument(to, pdf, filename, caption) {
      const form = new FormData();
      form.append('messaging_product', 'whatsapp');
      form.append('type', 'application/pdf');
      form.append('file', new Blob([new Uint8Array(pdf)], { type: 'application/pdf' }), filename);
      const uploaded = await http(`${graph}/${options.phoneNumberId}/media`, {
        method: 'POST',
        headers: auth,
        body: form,
      });
      if (!uploaded.ok) throw new Error(`whatsapp upload failed: ${uploaded.status}`);
      const { id } = (await uploaded.json()) as { id: string };
      await send({ to, type: 'document', document: { id, filename, caption } });
    },
    typing(message) {
      // Marks her message read and shows « en train d'écrire » until Firmo answers (25 s at
      // most, so it is renewed).
      const show = () =>
        void http(`${graph}/${options.phoneNumberId}/messages`, {
          method: 'POST',
          headers: { ...auth, 'content-type': 'application/json' },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            status: 'read',
            message_id: message.providerMessageId,
            typing_indicator: { type: 'text' },
          }),
        }).catch(() => undefined);
      show();
      const timer = setInterval(show, 20_000);
      return () => clearInterval(timer);
    },
    async sendList(to, text, buttonLabel, rows) {
      // WhatsApp: ten rows at most; a title of 24 characters, a description of 72.
      await send({
        to,
        type: 'interactive',
        interactive: {
          type: 'list',
          body: { text: text.slice(0, 1024) },
          action: {
            button: buttonLabel.slice(0, 20),
            sections: [
              {
                title: buttonLabel.slice(0, 24),
                rows: rows.slice(0, 10).map((row) => ({
                  id: row.id,
                  title: row.title.slice(0, 24),
                  description: row.description.slice(0, 72),
                })),
              },
            ],
          },
        },
      });
    },
    async askForContact(to, text) {
      // WhatsApp's sender is already the number: nothing to ask.
      await send({ to, type: 'text', text: { body: text } });
    },
    async download(media) {
      const meta = await http(`${graph}/${media.id}`, { headers: auth });
      if (!meta.ok) throw new Error(`whatsapp media lookup failed: ${meta.status}`);
      const { url, mime_type: mimeType } = (await meta.json()) as {
        url: string;
        mime_type: string;
      };
      const file = await http(url, { headers: auth });
      if (!file.ok) throw new Error(`whatsapp media download failed: ${file.status}`);
      return { bytes: new Uint8Array(await file.arrayBuffer()), mediaType: mimeType };
    },
  };
}
