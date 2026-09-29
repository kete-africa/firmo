import { Link } from '@tanstack/react-router';
import type { DocumentRow } from '@/features/space';
import { stateLabel, TypeBadge } from './ui';

/** One document in a list: its type, subject, number, client and state. */
export function DocumentItem({ row }: { row: DocumentRow }) {
  return (
    <li>
      <Link
        to="/espace/documents/$id"
        params={{ id: String(row.id) }}
        className="flex items-center gap-3 border-b border-rule px-4 py-3 hover:bg-clay"
      >
        <TypeBadge type={row.type} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{row.subject}</span>
          <span className="block truncate text-body-sm text-bark">
            {/* A draft has no number yet: its state says so. */}
            {[row.number, row.clientName, stateLabel(row.state)].filter(Boolean).join(' · ')}
          </span>
        </span>
        <span aria-hidden="true" className="text-bark">
          ›
        </span>
      </Link>
    </li>
  );
}
