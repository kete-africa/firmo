import { createFileRoute } from '@tanstack/react-router';
import { DocumentError } from '@/features/documents';
import { services } from '@/platform/services';
import { currentMember } from '@/platform/signin';

// A document's PDF for its owner: the preview of a draft (marked as such), the issued PDF otherwise.
export const Route = createFileRoute('/api/documents/$id/pdf')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const member = await currentMember(request);
        if (!member) return new Response(null, { status: 401 });
        const actor = { organizationId: member.organizationId };
        const id = Number(params.id);
        if (!Number.isInteger(id) || id <= 0) return new Response(null, { status: 404 });
        const { documents } = services();
        try {
          const document = await documents.get(actor, id);
          const pdf =
            document.state === 'draft'
              ? (await documents.preview(actor, id)).pdf
              : (await documents.pdf(actor, id)).pdf;
          const name = (document.number ?? 'apercu').replace(/[^\w.-]+/g, '-');
          return new Response(new Uint8Array(pdf), {
            headers: {
              'content-type': 'application/pdf',
              'content-disposition': `inline; filename="${name}.pdf"`,
              'cache-control': 'private, no-store',
            },
          });
        } catch (error) {
          if (error instanceof DocumentError) {
            return new Response(null, { status: error.status === 404 ? 404 : 409 });
          }
          throw error;
        }
      },
    },
  },
});
