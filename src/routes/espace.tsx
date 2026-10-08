import { FeedbackButton } from '@kete/feedback/button';
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
        {/* What goes wrong, an idea, what works — said where it happens (spec 012). */}
        <div className="px-4 pt-6">
          <FeedbackButton
            labels={{
              open: m.feedback_open(),
              title: m.feedback_title(),
              kindsLabel: m.feedback_kinds(),
              kinds: {
                problem: m.feedback_problem(),
                idea: m.feedback_idea(),
                praise: m.feedback_praise(),
              },
              message: m.feedback_message(),
              send: m.feedback_send(),
              close: m.feedback_close(),
              thanks: m.feedback_thanks(),
              error: m.feedback_error(),
            }}
            onSubmit={async (input) => {
              const answer = await fetch('/api/feedback', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(input),
              });
              if (!answer.ok) throw new Error('feedback_refused');
            }}
          />
        </div>
      </main>
      <BottomNav chatUrl={chatUrl} />
    </div>
  );
}
