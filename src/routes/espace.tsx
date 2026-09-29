import { createFileRoute, redirect } from '@tanstack/react-router';
import { fetchMember } from '@/features/space';
import * as m from '@/paraglide/messages.js';

// Firmo's web space: the signed-in person only. Its screens come with phase 4.
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
  component: Space,
});

function Space() {
  const { member } = Route.useRouteContext();
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-4 px-4 py-10">
      <h1 className="font-display text-3xl">
        {member.organizationName ?? m.space_title_without_name()}
      </h1>
      <p className="font-body text-body-lg" data-testid="signed-in-as">
        {m.space_signed_in_as({ name: member.name })}
      </p>
      <a href="/auth/sortie" className="text-body-sm font-semibold underline">
        {m.space_sign_out()}
      </a>
    </main>
  );
}
