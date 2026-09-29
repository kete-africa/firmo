import {
  createConversation,
  type Conversation,
  type MessagingChannel,
} from '@/features/conversation';
import { createDocuments, type Documents } from '@/features/documents';
import { createIdentity, type Identity } from '@/features/identity';
import { accountDirectory } from './account';
import { env } from './env';
import { getStorage } from './files';
import { openaiModel } from './openai';
import { telegramChannel } from './telegram';
import { typstRenderer } from './typst';
import { whatsappChannel } from './whatsapp';

/** The channels whose credentials are configured; the others stay closed. */
export function configuredChannels(): Partial<Record<'whatsapp' | 'telegram', MessagingChannel>> {
  const channels: Partial<Record<'whatsapp' | 'telegram', MessagingChannel>> = {};
  const wa = process.env;
  if (
    wa.WHATSAPP_ACCESS_TOKEN &&
    wa.WHATSAPP_PHONE_NUMBER_ID &&
    wa.WHATSAPP_APP_SECRET &&
    wa.WHATSAPP_VERIFY_TOKEN
  ) {
    channels.whatsapp = whatsappChannel({
      accessToken: wa.WHATSAPP_ACCESS_TOKEN,
      phoneNumberId: wa.WHATSAPP_PHONE_NUMBER_ID,
      appSecret: wa.WHATSAPP_APP_SECRET,
      verifyToken: wa.WHATSAPP_VERIFY_TOKEN,
      ...(wa.WHATSAPP_GRAPH_VERSION ? { graphVersion: wa.WHATSAPP_GRAPH_VERSION } : {}),
    });
  }
  if (wa.TELEGRAM_BOT_TOKEN && wa.TELEGRAM_WEBHOOK_SECRET) {
    channels.telegram = telegramChannel({
      botToken: wa.TELEGRAM_BOT_TOKEN,
      webhookSecret: wa.TELEGRAM_WEBHOOK_SECRET,
    });
  }
  return channels;
}

/** Firmo's use cases wired to their adapters, created on first use. */
let wired:
  { documents: Documents; identity: Identity; conversation: Conversation | null } | undefined;

export function services() {
  if (!wired) {
    const documents = createDocuments({ renderer: typstRenderer(), files: getStorage() });
    const identity = createIdentity({
      directory: accountDirectory({
        accountUrl: env.accountUrl,
        clientId: env.clientId,
        clientSecret: env.clientSecret,
      }),
      publicUrl: env.publicUrl,
    });
    const channels = configuredChannels();
    const conversation =
      process.env.OPENAI_API_KEY && Object.keys(channels).length > 0
        ? createConversation({ model: openaiModel(), channels, identity, documents })
        : null;
    wired = { documents, identity, conversation };
  }
  return wired;
}
