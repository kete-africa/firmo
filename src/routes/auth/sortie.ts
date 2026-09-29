import { createFileRoute } from '@tanstack/react-router';
import { getSignIn } from '@/platform/signin';

// Closes Firmo's session (the Compte Kete session stays).
export const Route = createFileRoute('/auth/sortie')({
  server: { handlers: { GET: () => getSignIn().signOut('/') } },
});
