import { createFileRoute } from '@tanstack/react-router';
import { services } from '@/platform/services';

// A share link: ONE issued document, read-only, for the tradesman's client — never a list, never
// a hint that other documents exist. A revoked or unknown link is simply not found.
export const Route = createFileRoute('/d/$token')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const opened = await services().documents.openShare(params.token);
        if (!opened) return new Response(null, { status: 404 });
        const name = opened.number.replace(/[^\w.-]+/g, '-');
        return new Response(new Uint8Array(opened.pdf), {
          headers: {
            'content-type': 'application/pdf',
            'content-disposition': `inline; filename="${name}.pdf"`,
            'cache-control': 'private, no-store',
            'x-robots-tag': 'noindex',
            'referrer-policy': 'no-referrer',
          },
        });
      },
    },
  },
});
