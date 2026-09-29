import { createFileRoute } from '@tanstack/react-router';
import * as m from '@/paraglide/messages.js';

// A link that was used, expired, or answered by someone else.
export const Route = createFileRoute('/lien-expire')({
  component: LinkExpired,
});

function LinkExpired() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-4 px-4">
      <h1 className="font-display text-3xl">{m.link_expired_title()}</h1>
      <p className="font-body text-body-lg">{m.link_expired_body()}</p>
    </main>
  );
}
