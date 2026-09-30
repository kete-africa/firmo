import OpenAI, { toFile } from 'openai';
import type { ConversationModel, TurnUsage } from '@/features/conversation';

/**
 * The OpenAI adapter of the conversation's model port: speech-to-text for voice notes, a
 * word-for-word reading of photographed sheets, and one conversation turn as a strict structured
 * output (Responses API, spec 010). Nothing is stored at OpenAI (`store: false`): the
 * conversation lives in Firmo's database, one per sender.
 */

export interface OpenAIOptions {
  apiKey?: string;
  model?: string;
  transcriptionModel?: string;
  reasoningEffort?: 'low' | 'medium' | 'high';
  /** Tests: a client standing in for the API. */
  client?: Pick<OpenAI, 'responses' | 'audio'>;
}

const zero = (): TurnUsage => ({ inputTokens: 0, outputTokens: 0, modelCalls: 0 });

function add(
  usage: TurnUsage,
  response: { usage?: { input_tokens?: number; output_tokens?: number } | null },
) {
  usage.inputTokens += response.usage?.input_tokens ?? 0;
  usage.outputTokens += response.usage?.output_tokens ?? 0;
  usage.modelCalls += 1;
}

export function openaiModel(options: OpenAIOptions = {}): ConversationModel {
  const client =
    options.client ??
    new OpenAI({ apiKey: options.apiKey ?? process.env.OPENAI_API_KEY, timeout: 60_000 });
  const model = options.model ?? process.env.OPENAI_MODEL ?? 'gpt-5.6-luna';
  const transcriptionModel =
    options.transcriptionModel ?? process.env.OPENAI_TRANSCRIPTION_MODEL ?? 'gpt-4o-transcribe';
  const effort =
    options.reasoningEffort ??
    (process.env.OPENAI_REASONING_EFFORT as 'medium' | undefined) ??
    'medium';

  return {
    async transcribeAudio(audio) {
      const extension = audio.mediaType.split('/')[1]?.split(';')[0] ?? 'ogg';
      const result = await client.audio.transcriptions.create({
        file: await toFile(audio.bytes, `voice.${extension}`, { type: audio.mediaType }),
        model: transcriptionModel,
        language: 'fr',
        prompt:
          "Chiffrage professionnel en français d'Afrique de l'Ouest. Transcrire les mots entendus sans " +
          'résumer ni compléter. Conserver exactement nombres, dimensions, unités, prix et noms propres. ' +
          'Écrire les nombres en chiffres. Si un passage est inaudible, écrire [inaudible].',
      });
      const text = typeof result === 'string' ? result : result.text;
      if (!text.trim()) throw new Error('empty transcription');
      return { text: text.trim(), usage: { inputTokens: 0, outputTokens: 0, modelCalls: 1 } };
    },

    async transcribeImage(image) {
      const usage = zero();
      const response = await client.responses.create({
        model,
        instructions:
          'Transcris cette feuille mot pour mot. Conserve nombres, espaces, groupes, dimensions et ratures. ' +
          "Écris [illisible] à la place de tout élément incertain. N'interprète et ne complète rien.",
        input: [
          {
            role: 'user',
            content: [
              { type: 'input_text', text: 'Lis cette feuille de chiffrage.' },
              {
                type: 'input_image',
                image_url: `data:${image.mediaType};base64,${Buffer.from(image.bytes).toString('base64')}`,
                detail: 'high',
              },
            ],
          },
        ],
        reasoning: { effort },
        store: false,
      });
      add(usage, response);
      const text = response.output_text.trim();
      if (!text) throw new Error('empty image reading');
      return { text, usage };
    },

    async decide(request) {
      const response = await client.responses.create({
        model,
        instructions: request.instructions,
        input: request.messages.map((message) =>
          message.role === 'person'
            ? { role: 'user' as const, content: message.text }
            : { role: 'assistant' as const, content: message.text },
        ),
        text: {
          format: {
            type: 'json_schema',
            name: request.schemaName,
            schema: request.schema,
            strict: true,
          },
        },
        reasoning: { effort },
        store: false,
        // The instructions and the schema are the same for every turn: cached by the API.
        prompt_cache_key: request.schemaName,
        safety_identifier: request.safetyId,
      });
      const usage = zero();
      add(usage, response);
      let output: unknown = null;
      try {
        output = JSON.parse(response.output_text);
      } catch {
        output = null;
      }
      return { output, usage };
    },
  };
}
