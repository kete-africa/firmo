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
  it('runs the tool loop: calls, executes, feeds the results back, then replies', async () => {
    const requests: Record<string, unknown>[] = [];
    const responses = [
      {
        output: [{ type: 'function_call', name: 'show_preview', arguments: '{}', call_id: 'c1' }],
        output_text: '',
        usage: { input_tokens: 10, output_tokens: 2 },
      },
      {
        output: [],
        output_text: 'Voici ton aperçu.',
        usage: { input_tokens: 12, output_tokens: 4 },
      },
    ];
    const client = {
      responses: {
        create: async (request: Record<string, unknown>) => {
          requests.push(structuredClone(request));
          return responses.shift();
        },
      },
      audio: {},
    } as never;
    const executed: string[] = [];
    const result = await openaiModel({ client, model: 'test-model' }).runTurn(
      {
        instructions: 'i',
        input: 'montre',
        tools: [
          {
            name: 'show_preview',
            description: 'd',
            parameters: {
              type: 'object',
              properties: {},
              required: [],
              additionalProperties: false,
            },
          },
        ],
        safetyId: 'org',
      },
      async (call) => {
        executed.push(call.name);
        return '{"ok":true}';
      },
    );
    expect(executed).toEqual(['show_preview']);
    expect(result).toEqual({
      reply: 'Voici ton aperçu.',
      usage: { inputTokens: 22, outputTokens: 6, modelCalls: 2 },
    });
    const second = requests[1]?.input as { type?: string; call_id?: string; output?: string }[];
    expect(second.at(-1)).toEqual({
      type: 'function_call_output',
      call_id: 'c1',
      output: '{"ok":true}',
    });
    expect(requests[0]).toMatchObject({ store: false, safety_identifier: 'org' });
  });
});
