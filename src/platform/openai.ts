import OpenAI, { toFile } from 'openai';
import type { ConversationModel, TurnUsage } from '@/features/conversation';

/**
 * The OpenAI adapter of the conversation's model port: speech-to-text for voice notes, a
 * word-for-word reading of photographed sheets, and one agent turn with strict function tools
 * (Responses API). Nothing is stored at OpenAI (`store: false`); reasoning travels encrypted
 * between the calls of one turn.
 */
const MAX_TOOL_ROUNDS = 5;

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

    async runTurn(request, execute) {
      const usage = zero();
      const tools = request.tools.map((tool) => ({
        type: 'function' as const,
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
        strict: true,
      }));
      let input: OpenAI.Responses.ResponseInput = [{ role: 'user', content: request.input }];
      for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
        const response = await client.responses.create({
          model,
          instructions: request.instructions,
          input,
          tools,
          reasoning: { effort },
          store: false,
          include: ['reasoning.encrypted_content'],
          safety_identifier: request.safetyId,
        });
        add(usage, response);
        const calls = response.output.filter(
          (item): item is OpenAI.Responses.ResponseFunctionToolCall =>
            item.type === 'function_call',
        );
        if (calls.length === 0) return { reply: response.output_text, usage };
        input = [...input, ...(response.output as OpenAI.Responses.ResponseInput)];
        for (const call of calls) {
          const output = await execute({ name: call.name, arguments: call.arguments });
          input.push({ type: 'function_call_output', call_id: call.call_id, output });
        }
      }
      // Too many rounds: the code's guard answers with a neutral reply.
      return { reply: '', usage };
    },
  };
}
