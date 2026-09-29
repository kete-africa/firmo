import { createFileRoute } from '@tanstack/react-router';
import { startFreshSignIn } from '@/platform/signin';

// Sends the person to the Compte Kete, then back to `returnTo`. A previous Firmo session in this
// browser is dropped first: the link's person is the one who enters.
export const Route = createFileRoute('/auth/connexion')({
  server: { handlers: { GET: ({ request }) => startFreshSignIn(request) } },
});
