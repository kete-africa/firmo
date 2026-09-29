import { createFileRoute } from '@tanstack/react-router';
import { checkOperator, OperationError } from '@/features/operations';
import { DocumentError } from '@/features/documents';
import { env } from '@/platform/env';
import { services } from '@/platform/services';
import { currentMember } from '@/platform/signin';

// Spec 008: an operator reads one issued document of an organization, for a reason, journaled.
export const Route = createFileRoute('/api/operations/read')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const signedIn = await currentMember(request);
        if (
          !signedIn ||
          checkOperator(signedIn, env.operatorsOrganizationId).status !== 'operator'
        ) {
          return new Response(null, { status: 403 });
        }
        const form = await request.formData();
        try {
          const { number, pdf } = await services().operations.readDocument(
            { userId: signedIn.userId },
            {
              organizationId: form.get('organizationId'),
              number: form.get('number'),
              reason: form.get('reason'),
            },
          );
          return new Response(new Uint8Array(pdf), {
            headers: {
              'content-type': 'application/pdf',
              'content-disposition': `inline; filename="${number.replace(/[^\w.-]/g, '-')}.pdf"`,
              'cache-control': 'no-store',
            },
          });
        } catch (error) {
          if (error instanceof OperationError) {
            return new Response(null, { status: error.code === 'not_found' ? 404 : 422 });
          }
          if (error instanceof DocumentError) return new Response(null, { status: 404 });
          throw error;
        }
      },
    },
  },
});
