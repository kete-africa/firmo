import { createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';

type Search = Record<string, string | string[]>;

// Plain query strings, never JSON: a Kete app's signed authorization request (spec 007) repeats
// parameters and must reach the server exactly as it was signed.
function parseSearch(query: string): Search {
  const params = new URLSearchParams(query);
  const search: Search = {};
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key);
    search[key] = values.length > 1 ? values : (values[0] ?? '');
  }
  return search;
}

function stringifySearch(search: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (value === undefined || value === null) continue;
    for (const item of Array.isArray(value) ? value : [value]) params.append(key, String(item));
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function getRouter() {
  return createRouter({
    routeTree,
    defaultPreload: 'intent',
    scrollRestoration: true,
    parseSearch,
    stringifySearch,
  });
}
