import { createFileRoute } from '@tanstack/react-router';
import * as m from '@/paraglide/messages.js';

// Phase 0: the address answers. The landing page comes with the client space (phase 4).
export const Route = createFileRoute('/')({
  component: Home,
});

function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-4 px-4">
      <h1 className="font-display text-4xl">{m.home_title()}</h1>
      <p className="font-body text-lg">{m.home_promise()}</p>
    </main>
  );
}
