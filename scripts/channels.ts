/**
 * Where Firmo's messaging channels deliver: the Telegram bot's webhook and the WhatsApp app's
 * webhook subscription (Meta). Reads the channels' credentials from the local `.env`; prints no
 * secret.
 *
 *   pnpm channels:show
 *   pnpm channels:point https://firmo-staging.13.140.178.49.sslip.io
 *
 * Pointing a channel at an instance takes it from the one it served: check the instance first —
 * `/webhooks/whatsapp` must answer Meta's verification, and the instance must hold the same
 * channel variables (docs/OPERATIONS.md).
 */
import { existsSync } from 'node:fs';

if (existsSync('.env')) process.loadEnvFile('.env');

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set.`);
  return value;
}

const graph = `https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION ?? 'v25.0'}`;
const telegram = (method: string) =>
  `https://api.telegram.org/bot${required('TELEGRAM_BOT_TOKEN')}/${method}`;

// The notifications Firmo's WhatsApp app subscribes to.
const WHATSAPP_FIELDS = [
  'messages',
  'message_template_status_update',
  'phone_number_quality_update',
  'account_alerts',
  'account_review_update',
  'account_update',
  'message_template_quality_update',
  'phone_number_name_update',
  'security',
];

async function whatsappApp(): Promise<{ id: string; token: string }> {
  const token = required('WHATSAPP_ACCESS_TOKEN');
  const debug = (await fetch(
    `${graph}/debug_token?input_token=${token}&access_token=${token}`,
  ).then((r) => r.json())) as { data?: { app_id?: string } };
  const id = debug.data?.app_id;
  if (!id) throw new Error('The WhatsApp token names no app.');
  return { id, token: `${id}|${required('WHATSAPP_APP_SECRET')}` };
}

async function show(): Promise<void> {
  const info = (await fetch(telegram('getWebhookInfo')).then((r) => r.json())) as {
    result?: { url?: string; last_error_message?: string };
  };
  console.log(`Telegram: ${info.result?.url || '(none)'}`);
  if (info.result?.last_error_message)
    console.log(`  last error: ${info.result.last_error_message}`);
  const app = await whatsappApp();
  const subscriptions = (await fetch(
    `${graph}/${app.id}/subscriptions?access_token=${app.token}`,
  ).then((r) => r.json())) as {
    data?: { object: string; callback_url: string; active: boolean }[];
  };
  for (const s of subscriptions.data ?? []) {
    console.log(`WhatsApp (${s.object}): ${s.callback_url}${s.active ? '' : ' (inactive)'}`);
  }
}

async function point(origin: string): Promise<void> {
  const target = new URL(origin);
  if (target.protocol !== 'https:') throw new Error('https only');
  const base = target.origin;
  const set = (await fetch(telegram('setWebhook'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      url: `${base}/webhooks/telegram`,
      secret_token: required('TELEGRAM_WEBHOOK_SECRET'),
      allowed_updates: ['message', 'callback_query'],
    }),
  }).then((r) => r.json())) as { ok: boolean; description?: string };
  if (!set.ok) throw new Error(`Telegram: ${set.description ?? 'refused'}`);
  const app = await whatsappApp();
  // Meta checks the callback at once (GET with the verify token) before accepting it.
  const subscribed = (await fetch(`${graph}/${app.id}/subscriptions`, {
    method: 'POST',
    body: new URLSearchParams({
      object: 'whatsapp_business_account',
      callback_url: `${base}/webhooks/whatsapp`,
      verify_token: required('WHATSAPP_VERIFY_TOKEN'),
      fields: WHATSAPP_FIELDS.join(','),
      include_values: 'true',
      access_token: app.token,
    }),
  }).then((r) => r.json())) as { success?: boolean; error?: { message: string } };
  if (!subscribed.success) throw new Error(`WhatsApp: ${subscribed.error?.message ?? 'refused'}`);
  await show();
}

const [command, origin] = process.argv.slice(2);
if (command === 'point' && origin) await point(origin);
else if (command === 'show') await show();
else throw new Error('Usage: channels show | channels point <https origin>');
