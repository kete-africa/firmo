import { createFileRoute } from '@tanstack/react-router';
import { fetchPlan } from '@/features/space';
import { Notice, useIsoDate } from '@/lib/ui';
import * as m from '@/paraglide/messages.js';

// His subscription: where he stands, and the way to the Compte Kete, where the payment happens.
export const Route = createFileRoute('/espace/abonnement')({
  loader: () => fetchPlan(),
  component: Subscription,
});

function Subscription() {
  const plan = Route.useLoaderData();
  const until = useIsoDate(plan.until ?? '');
  const offer = m.plan_offer({
    documents: String(plan.period.documents),
    days: String(plan.period.days),
  });
  const standing = {
    free: m.plan_free({ remaining: String(plan.remaining ?? 0), free: String(plan.free) }),
    subscribed: m.plan_subscribed({ until, remaining: String(plan.remaining ?? 0) }),
    plan_required: m.plan_required({ free: String(plan.free) }),
    unavailable: m.plan_unavailable(),
  }[plan.kind];
  return (
    <div className="flex flex-col gap-6 px-4 py-6">
      <h1 className="font-display text-headline font-bold">{m.plan_title()}</h1>
      {plan.kind === 'unavailable' ? (
        <Notice tone="error">{standing}</Notice>
      ) : (
        <div className="flex flex-col gap-2 border border-rule bg-paper p-4">
          <p className="text-body-lg font-semibold">{standing}</p>
          <p className="text-body text-bark">{offer}</p>
        </div>
      )}
      <a
        href={plan.subscribeUrl}
        className="inline-flex h-12 items-center justify-center rounded-control bg-ink px-6 font-semibold text-sand hover:bg-night"
      >
        {plan.kind === 'subscribed' ? m.plan_manage() : m.plan_subscribe()}
      </a>
      <p className="text-body-sm text-bark">{m.plan_where_paid()}</p>
    </div>
  );
}
