import { createFileRoute, redirect } from '@tanstack/react-router';
import { Button, TextField } from '@kete/design';
import { fetchOperations, fetchOperator } from '@/features/operations/client';
import { LanguageSwitch, Notice, SectionTitle, Wordmark } from '@/lib/ui';
import * as m from '@/paraglide/messages.js';

// Spec 008: Kete operators run Firmo — what failed, and an exceptional reading, journaled.
export const Route = createFileRoute('/operations')({
  beforeLoad: async ({ location }) => {
    const operator = await fetchOperator();
    if (operator.status === 'signed_out') {
      throw redirect({
        href: `/auth/connexion?returnTo=${encodeURIComponent(location.href)}`,
        reloadDocument: true,
      });
    }
    return { operator };
  },
  loader: ({ context }) =>
    context.operator.status === 'operator' ? fetchOperations() : Promise.resolve(null),
  component: OperationsScreen,
});

/** A moment as its server writes it, in UTC: the same on every screen. */
const moment = (iso: string) => `${iso.slice(0, 16).replace('T', ' ')} UTC`;

function OperationsScreen() {
  const { operator } = Route.useRouteContext();
  const data = Route.useLoaderData();
  return (
    <div className="min-h-dvh bg-sand">
      <header className="border-b border-rule bg-paper">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3 px-4 py-3">
          <Wordmark />
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
      <main className="mx-auto flex max-w-xl flex-col gap-8 px-4 py-6">
        <h1 className="font-display text-headline font-bold">{m.ops_title()}</h1>
        {operator.status === 'refused' || !data ? (
          <Notice tone="error">
            {operator.status === 'refused' && operator.reason === 'no_two_factor'
              ? m.ops_refused_two_factor()
              : m.ops_refused()}
          </Notice>
        ) : (
          <>
            <section className="flex flex-col gap-3">
              <SectionTitle>{m.ops_incidents()}</SectionTitle>
              {data.incidents.length === 0 ? (
                <p className="text-body text-bark">{m.ops_no_incident()}</p>
              ) : (
                <ul className="flex flex-col bg-paper">
                  {data.incidents.map((incident) => (
                    <li key={incident.id} className="flex flex-col gap-1 border-b border-rule p-3">
                      <span className="font-semibold">
                        {incident.channel} · {incident.senderHint} ·{' '}
                        {m.ops_attempts({ count: String(incident.attempts) })}
                      </span>
                      <span className="text-body-sm text-bark">
                        {moment(incident.settledAt ?? incident.receivedAt)} ·{' '}
                        {incident.organizationId ?? m.ops_unknown_organization()}
                      </span>
                      <code className="break-all text-body-sm">{incident.error || '—'}</code>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="flex flex-col gap-3">
              <SectionTitle>{m.ops_reading()}</SectionTitle>
              <p className="text-body text-bark">{m.ops_reading_intro()}</p>
              <form
                method="post"
                action="/api/operations/read"
                target="_blank"
                className="flex flex-col gap-3"
              >
                <TextField label={m.ops_organization()} name="organizationId" required />
                <TextField label={m.ops_number()} name="number" required />
                <TextField label={m.ops_reason()} name="reason" required minLength={5} />
                <Button type="submit">{m.ops_read()}</Button>
              </form>
            </section>

            <section className="flex flex-col gap-3">
              <SectionTitle>{m.ops_journal()}</SectionTitle>
              {data.journal.length === 0 ? (
                <p className="text-body text-bark">{m.ops_journal_empty()}</p>
              ) : (
                <ul className="flex flex-col bg-paper">
                  {data.journal.map((entry) => (
                    <li key={entry.id} className="flex flex-col gap-1 border-b border-rule p-3">
                      <span className="font-semibold">
                        {entry.subject} · {entry.organizationId}
                      </span>
                      <span className="text-body-sm text-bark">
                        {moment(entry.createdAt)} · {entry.operatorId}
                      </span>
                      <span className="text-body-sm">{entry.reason}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
