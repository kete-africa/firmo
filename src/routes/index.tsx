import { createFileRoute } from '@tanstack/react-router';
import { fetchLanding, LandingPage } from '@/features/landing/client';
import * as m from '@/paraglide/messages.js';

// Firmo's public page (spec 013): the offer, and the way into the conversation.
export const Route = createFileRoute('/')({
  loader: () => fetchLanding(),
  head: ({ loaderData }) => {
    const origin = loaderData?.origin;
    return {
      meta: [
        { property: 'og:type', content: 'website' },
        { property: 'og:title', content: m.meta_title() },
        { property: 'og:description', content: m.meta_description() },
        // The card shows a quote, never the logo (docs/product/identite.md).
        ...(origin
          ? [
              { property: 'og:url', content: origin },
              { property: 'og:image', content: `${origin}/landing/devis-exemple.png` },
            ]
          : []),
      ],
    };
  },
  component: Home,
});

function Home() {
  return <LandingPage data={Route.useLoaderData()} />;
}
