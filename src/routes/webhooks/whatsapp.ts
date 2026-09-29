import { createFileRoute } from '@tanstack/react-router';
import { enqueue } from '@/platform/inbox';
import { parseNotification, signatureIsValid, verifySubscription } from '@/platform/whatsapp';
import { wakeWorker } from '@/platform/worker';

// Meta's webhook: the subscription check, then signed notifications, stored once and answered at
// once; the worker handles them.
export const Route = createFileRoute('/webhooks/whatsapp')({
  server: {
    handlers: {
      GET: ({ request }) =>
        verifySubscription(new URL(request.url), process.env.WHATSAPP_VERIFY_TOKEN ?? ''),
      POST: async ({ request }) => {
        const secret = process.env.WHATSAPP_APP_SECRET;
        const raw = await request.text();
        if (!secret || !signatureIsValid(raw, request.headers.get('x-hub-signature-256'), secret)) {
          return new Response(null, { status: 401 });
        }
        let body: unknown;
        try {
          body = JSON.parse(raw);
        } catch {
          return new Response(null, { status: 400 });
        }
        for (const message of parseNotification(body)) await enqueue(message);
        wakeWorker();
        return new Response(null, { status: 200 });
      },
    },
  },
});
