import { createFileRoute } from '@tanstack/react-router';
import { DocumentError } from '@/features/documents';
import { LogoError, MAX_LOGO_UPLOAD_BYTES, prepareLogo } from '@/platform/logo';
import { services } from '@/platform/services';
import { currentMember } from '@/platform/signin';

// His logo: made safe (real format, re-encoded, no metadata) before any document uses it.
export const Route = createFileRoute('/api/presentation/logo')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const member = await currentMember(request);
        if (!member) return new Response(null, { status: 401 });
        const actor = { organizationId: member.organizationId };
        const length = Number(request.headers.get('content-length') ?? 0);
        if (length > MAX_LOGO_UPLOAD_BYTES + 64 * 1024) {
          return Response.json({ error: 'too_large' }, { status: 413 });
        }
        const form = await request.formData().catch(() => null);
        const file = form?.get('logo');
        if (!(file instanceof Blob)) return Response.json({ error: 'missing' }, { status: 400 });
        try {
          const png = await prepareLogo(new Uint8Array(await file.arrayBuffer()));
          await services().documents.setLogo(actor, png);
          return Response.json({ ok: true });
        } catch (error) {
          if (error instanceof LogoError)
            return Response.json({ error: error.code }, { status: 422 });
          if (error instanceof DocumentError)
            return Response.json({ error: error.code }, { status: 409 });
          throw error;
        }
      },
      DELETE: async ({ request }) => {
        const member = await currentMember(request);
        if (!member) return new Response(null, { status: 401 });
        await services().documents.removeLogo({ organizationId: member.organizationId });
        return Response.json({ ok: true });
      },
    },
  },
});
