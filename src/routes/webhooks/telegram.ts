import { createFileRoute } from '@tanstack/react-router';
import { enqueue } from '@/platform/inbox';
import { parseUpdate, secretIsValid } from '@/platform/telegram';
import { wakeWorker } from '@/platform/worker';

// Telegram's webhook: updates carrying our secret token, stored once and answered at once.
export const Route = createFileRoute('/webhooks/telegram')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
        if (
          !secret ||
          !secretIsValid(request.headers.get('x-telegram-bot-api-secret-token'), secret)
        ) {
          return new Response(null, { status: 401 });
        }
        const body: unknown = await request.json().catch(() => null);
        for (const message of parseUpdate(body)) await enqueue(message);
        wakeWorker();
        return new Response(null, { status: 200 });
      },
    },
  },
});
