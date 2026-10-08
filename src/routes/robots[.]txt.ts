import { createFileRoute } from '@tanstack/react-router';
import { env } from '@/platform/env';

// What search engines may read (spec 013): the public page in production, nothing anywhere else —
// a staging address is never indexed. A person's space, the operators', the API and the share
// links are never theirs to read.
const PRODUCTION = [
  'User-agent: *',
  'Disallow: /espace',
  'Disallow: /operations',
  'Disallow: /api/',
  'Disallow: /auth/',
  'Disallow: /d/',
  'Allow: /',
];
const ELSEWHERE = ['User-agent: *', 'Disallow: /'];

export const Route = createFileRoute('/robots.txt')({
  server: {
    handlers: {
      GET: () =>
        new Response(
          `${(env.environment === 'production' ? PRODUCTION : ELSEWHERE).join('\n')}\n`,
          {
            headers: { 'content-type': 'text/plain; charset=utf-8' },
          },
        ),
    },
  },
});
