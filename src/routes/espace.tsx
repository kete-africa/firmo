import { createFileRoute, Link, Outlet, redirect } from '@tanstack/react-router';
import { fetchMember } from '@/features/space';
import { BottomNav, LanguageSwitch, Wordmark } from '@/lib/ui';
import * as m from '@/paraglide/messages.js';

// Firmo's web space: the signed-in person only, reached from the conversation's one-time link.
export const Route = createFileRoute('/espace')({
  beforeLoad: async ({ location }) => {
    const member = await fetchMember();
    if (member.status === 'signed_out') {
      throw redirect({
        href: `/auth/connexion?returnTo=${encodeURIComponent(location.href)}`,
        reloadDocument: true,
      });
    }
    return { member };
  },
  component: Layout,
});

function Layout() {
  const { member } = Route.useRouteContext();
  const chatUrl = member.channels.whatsapp ?? member.channels.telegram;
  return (
    <div className="min-h-dvh bg-sand pb-24">
      <header className="border-b border-rule bg-paper">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/espace" aria-label={m.nav_documents()}>
            <Wordmark />
          </Link>
          <div className="flex items-center gap-2">
            <LanguageSwitch />
            <a
              href="/auth/sortie"
              className="text-body-sm font-semibold text-bark underline hover:text-ink"
            >
              {m.space_sign_out()}
            </a>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-xl">
        <Outlet />
      </main>
      <BottomNav chatUrl={chatUrl} />
    </div>
  );
}
