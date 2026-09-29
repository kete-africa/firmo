import { useMemo, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { TextField } from '@kete/design';
import { fetchDocuments } from '@/features/space';
import * as m from '@/paraglide/messages.js';
import { DocumentItem } from '@/lib/document-item';

// Every document, searchable by client, subject or number.
export const Route = createFileRoute('/espace/documents/')({
  loader: () => fetchDocuments(),
  component: Documents,
});

function Documents() {
  const rows = Route.useLoaderData();
  const [query, setQuery] = useState('');
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      [row.subject, row.clientName, row.number ?? ''].some((value) =>
        value.toLowerCase().includes(q),
      ),
    );
  }, [rows, query]);
  return (
    <div className="flex flex-col gap-4 py-6">
      <div className="flex flex-col gap-3 px-4">
        <h1 className="font-display text-headline font-bold">{m.documents_title()}</h1>
        <TextField
          label={m.documents_search()}
          name="q"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {shown.length === 0 ? (
        <p className="px-4 text-body text-bark">{m.documents_none()}</p>
      ) : (
        <ul className="bg-paper">
          {shown.map((row) => (
            <DocumentItem key={row.id} row={row} />
          ))}
        </ul>
      )}
    </div>
  );
}
