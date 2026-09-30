import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { openaiModel } from '@/platform/openai';
import { parseUpdate, secretIsValid } from '@/platform/telegram';
import { parseNotification, signatureIsValid, verifySubscription } from '@/platform/whatsapp';

// Phase 3: the channels only accept what they can prove, and the model's tool loop is faithful.

describe('WhatsApp', () => {
  const secret = 'app-secret';
  const body = JSON.stringify({ entry: [] });

  it("accepts only Meta's signature of the exact body", () => {
    const signature = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
    expect(signatureIsValid(body, signature, secret)).toBe(true);
    expect(signatureIsValid(`${body} `, signature, secret)).toBe(false);
    expect(signatureIsValid(body, null, secret)).toBe(false);
  });

  it('echoes the subscription challenge only for its verify token', async () => {
    const url = (token: string) =>
      new URL(
        `https://f.test/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${token}&hub.challenge=42`,
      );
    expect(await verifySubscription(url('good'), 'good').text()).toBe('42');
    expect(verifySubscription(url('bad'), 'good').status).toBe(403);
  });

  it('reads texts, voice notes, photos and buttons; ignores statuses', () => {
    const messages = parseNotification({
      entry: [
        {
          changes: [
            {
              value: {
                contacts: [{ wa_id: '22890000000', profile: { name: 'Kodjo' } }],
                messages: [
                  { from: '22890000000', id: 'w1', type: 'text', text: { body: 'bonjour' } },
                  {
                    from: '22890000000',
                    id: 'w2',
                    type: 'audio',
                    audio: { id: 'm1', mime_type: 'audio/ogg' },
                  },
                  {
                    from: '22890000000',
                    id: 'w3',
                    type: 'image',
                    image: { id: 'm2', mime_type: 'image/jpeg', caption: 'devis' },
                  },
                  {
                    from: '22890000000',
                    id: 'w4',
                    type: 'interactive',
                    interactive: { button_reply: { id: 'issue:confirm' } },
                  },
                  { from: '22890000000', id: 'w5', type: 'sticker' },
                ],
                statuses: [{ id: 's1', status: 'read' }],
              },
            },
          ],
        },
      ],
    });
    expect(messages.map((m) => m.kind)).toEqual([
      'text',
      'voice',
      'photo',
      'action',
      'unsupported',
    ]);
    expect(messages[0]).toMatchObject({
      sender: '22890000000',
      displayName: 'Kodjo',
      text: 'bonjour',
    });
    expect(messages[3]?.action).toBe('issue:confirm');
  });
});

describe('Telegram', () => {
  it('accepts only its secret token', () => {
    expect(secretIsValid('s3cret', 's3cret')).toBe(true);
    expect(secretIsValid('other', 's3cret')).toBe(false);
    expect(secretIsValid(null, 's3cret')).toBe(false);
  });

  const from = { id: 777, first_name: 'Afi' };
  const privateChat = { id: 777, type: 'private' };

  it('reads private messages only: texts, contacts, voice notes, photos, buttons', () => {
    expect(
      parseUpdate({ message: { message_id: 1, from, chat: privateChat, text: '/start' } })[0],
    ).toMatchObject({
      kind: 'text',
      text: 'Bonjour',
      sender: '777',
      displayName: 'Afi',
    });
    expect(
      parseUpdate({
        message: {
          message_id: 2,
          from,
          chat: privateChat,
          contact: { phone_number: '22890000000', user_id: 777 },
        },
      })[0],
    ).toMatchObject({ kind: 'contact', contact: { phoneNumber: '22890000000', userId: '777' } });
    expect(
      parseUpdate({
        message: { message_id: 3, from, chat: privateChat, voice: { file_id: 'f1' } },
      })[0]?.kind,
    ).toBe('voice');
    expect(
      parseUpdate({
        message: {
          message_id: 4,
          from,
          chat: privateChat,
          photo: [{ file_id: 'small' }, { file_id: 'large' }],
        },
      })[0]?.media?.id,
    ).toBe('large');
    expect(
      parseUpdate({
        callback_query: { id: 'c1', from, data: 'issue:confirm', message: { chat: privateChat } },
      })[0],
    ).toMatchObject({ kind: 'action', action: 'issue:confirm', providerMessageId: 'cb:c1' });
  });

  it('ignores groups and messages whose chat is not the sender', () => {
    expect(
      parseUpdate({
        message: { message_id: 5, from, chat: { id: -10, type: 'group' }, text: 'x' },
      }),
    ).toEqual([]);
    expect(
      parseUpdate({
        message: { message_id: 6, from, chat: { id: 999, type: 'private' }, text: 'x' },
      }),
    ).toEqual([]);
  });
});

describe('the model adapter', () => {
  it('asks one structured output of the conversation, and stores nothing at the provider', async () => {
    const requests: Record<string, unknown>[] = [];
    const client = {
      responses: {
        create: async (request: Record<string, unknown>) => {
          requests.push(structuredClone(request));
          return {
            output: [],
            output_text: '{"reply":"Voici.","action":"none"}',
            usage: { input_tokens: 30, output_tokens: 5 },
          };
        },
      },
      audio: {},
    } as never;
    const schema = { type: 'object', properties: {}, required: [], additionalProperties: false };
    const result = await openaiModel({ client, model: 'test-model' }).decide({
      instructions: 'i',
      messages: [
        { role: 'person', text: 'bonjour' },
        { role: 'firmo', text: 'Bienvenue.' },
        { role: 'person', text: 'montre' },
      ],
      schema,
      schemaName: 'firmo_turn',
      safetyId: 'org',
    });
    expect(result).toEqual({
      output: { reply: 'Voici.', action: 'none' },
      usage: { inputTokens: 30, outputTokens: 5, modelCalls: 1 },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      store: false,
      safety_identifier: 'org',
      input: [
        { role: 'user', content: 'bonjour' },
        { role: 'assistant', content: 'Bienvenue.' },
        { role: 'user', content: 'montre' },
      ],
      text: { format: { type: 'json_schema', name: 'firmo_turn', schema, strict: true } },
    });
  });
});
