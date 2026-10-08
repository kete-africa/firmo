import { createFileRoute } from '@tanstack/react-router';
import { feedbackHandler } from '@/platform/feedback';

// What he tells Kete from his space (spec 012): kept in his organization, read by Kete operators.
export const Route = createFileRoute('/api/feedback')({
  server: { handlers: { POST: ({ request }) => feedbackHandler(request) } },
});
