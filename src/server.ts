import handler from '@tanstack/react-start/server-entry';
import { paraglideMiddleware } from './paraglide/server.js';

// The inbox worker runs in this process once the database is configured (decision 0001);
// FIRMO_WORKER=off turns it off (for an instance that only serves pages).
if (process.env.FIRMO_DATABASE_URL && process.env.FIRMO_WORKER !== 'off') {
  void import('./platform/worker').then(({ startWorker }) => startWorker());
}

export default {
  fetch(request: Request): Promise<Response> {
    // Every request resolves its language first, so server-rendered text matches it.
    return paraglideMiddleware(request, () => handler.fetch(request));
  },
};
