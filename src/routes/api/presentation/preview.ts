import { createFileRoute } from '@tanstack/react-router';
import { DocumentError } from '@/features/documents';
import { services } from '@/platform/services';
import { currentMember } from '@/platform/signin';

// The first page of a sample document with his current presentation — the real rendering.
export const Route = createFileRoute('/api/presentation/preview')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const member = await currentMember(request);
        if (!member) return new Response(null, { status: 401 });
        try {
          const png = await services().documents.presentationPreview({
            organizationId: member.organizationId,
          });
          return new Response(new Uint8Array(png), {
            headers: { 'content-type': 'image/png', 'cache-control': 'private, no-store' },
          });
        } catch (error) {
          if (error instanceof DocumentError) return new Response(null, { status: 409 });
          throw error;
        }
      },
    },
  },
});
