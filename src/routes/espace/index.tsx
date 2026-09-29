import { createFileRoute, Link } from '@tanstack/react-router';
import { fetchDocuments } from '@/features/space';
import { DocumentItem } from '@/lib/document-item';
import { SectionTitle } from '@/lib/ui';
import * as m from '@/paraglide/messages.js';

// Home: find a document, pick up a draft, go back to the conversation to create.
export const Route = createFileRoute('/espace/')({
  loader: () => fetchDocuments(),
  component: Home,
});

function Home() {
  const rows = Route.useLoaderData();
  const { member } = Route.useRouteContext();
  const chatUrl = member.channels.whatsapp ?? member.channels.telegram;
  const drafts = rows.filter((row) => row.state === 'draft');
  const recent = rows.filter((row) => row.state !== 'draft').slice(0, 5);
  return (
    <div className="flex flex-col gap-8 py-6">
      <div className="flex flex-col gap-3 px-4">
        <h1 className="font-display text-headline font-bold">{m.home_title_documents()}</h1>
        <p className="text-body text-bark">{m.home_intro()}</p>
        <Link to="/espace/abonnement" className="text-body-sm font-semibold underline">
          {m.plan_link()}
        </Link>
        {chatUrl ? (
          <a
            href={chatUrl}
            className="inline-flex h-12 items-center justify-center rounded-control bg-ink px-6 font-semibold text-sand hover:bg-night"
          >
            {m.home_create_in_chat()}
          </a>
        ) : null}
      </div>

      {rows.length === 0 ? <p className="px-4 text-body text-bark">{m.home_empty()}</p> : null}

      {drafts.length > 0 ? (
        <section className="flex flex-col">
          <div className="px-4">
            <SectionTitle>{m.home_to_continue()}</SectionTitle>
          </div>
          <ul className="bg-paper">
            {drafts.slice(0, 3).map((row) => (
              <DocumentItem key={row.id} row={row} />
            ))}
          </ul>
        </section>
      ) : null}

      {recent.length > 0 ? (
        <section className="flex flex-col">
          <div className="px-4">
            <SectionTitle
              action={
                <Link to="/espace/documents" className="text-body-sm font-semibold underline">
                  {m.home_see_all()}
                </Link>
              }
            >
              {m.home_recent()}
            </SectionTitle>
          </div>
          <ul className="bg-paper">
            {recent.map((row) => (
              <DocumentItem key={row.id} row={row} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
