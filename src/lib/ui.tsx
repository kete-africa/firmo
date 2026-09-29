import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { formatMoney, type DocumentState, type DocumentType } from '@/features/documents/client';
import * as m from '@/paraglide/messages.js';
import { getLocale, locales, setLocale } from '@/paraglide/runtime.js';

/**
 * Firmo's screens: calm, the document's own rules and rectangles; the tradesman's colour belongs
 * to his documents only, never to the interface (reference brief).
 */
export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden="true"
        className="grid h-7 w-7 place-items-center border border-ink font-number text-body-sm font-bold"
      >
        F
      </span>
      <span className="font-display text-title font-bold text-ink">Firmo</span>
    </span>
  );
}

export function LanguageSwitch() {
  const current = getLocale();
  return (
    <div className="flex items-center gap-1" role="group" aria-label={m.language_label()}>
      {locales.map((locale) => (
        <button
          key={locale}
          type="button"
          lang={locale}
          aria-pressed={locale === current}
          onClick={() => setLocale(locale)}
          className={
            locale === current
              ? 'rounded-control bg-ink px-2 py-1 text-body-sm font-semibold text-sand'
              : 'rounded-control px-2 py-1 text-body-sm font-semibold text-bark hover:bg-clay'
          }
        >
          {locale === 'fr' ? m.locale_fr() : m.locale_en()}
        </button>
      ))}
    </div>
  );
}

/** A message after an action: a square marker, so it reads without colour. */
export function Notice({
  tone,
  children,
}: {
  tone: 'error' | 'success' | 'info';
  children: ReactNode;
}) {
  const [surface, marker] = {
    error: ['bg-error-surface text-error-ink', 'bg-error'],
    success: ['bg-success-surface text-success-ink', 'bg-success'],
    info: ['bg-info-surface text-info-ink', 'bg-info'],
  }[tone];
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={`flex items-start gap-2 px-3 py-2 text-body-sm ${surface}`}
    >
      <span aria-hidden="true" className={`mt-1.5 h-2 w-2 shrink-0 ${marker}`} />
      <span>{children}</span>
    </p>
  );
}

export function typeShort(type: DocumentType): string {
  return {
    quote: m.type_short_quote(),
    proforma: m.type_short_proforma(),
    invoice: m.type_short_invoice(),
  }[type];
}

export function typeLabel(type: DocumentType): string {
  return { quote: m.type_quote(), proforma: m.type_proforma(), invoice: m.type_invoice() }[type];
}

/**
 * What a document's state means for its type: an issued invoice is to be paid (or paid); a
 * quote or proforma past its validity is expired; an accepted proforma was ordered.
 */
export function stateLabel(
  state: DocumentState,
  context: { type?: DocumentType; expired?: boolean; paid?: boolean } = {},
): string {
  if (context.type === 'invoice' && state === 'issued') {
    return context.paid ? m.state_paid() : m.state_to_pay();
  }
  if (context.expired) return m.state_expired();
  if (context.type === 'proforma' && state === 'accepted') return m.state_ordered();
  return {
    draft: m.state_draft(),
    issued: m.state_issued(),
    accepted: m.state_accepted(),
    refused: m.state_refused(),
    unanswered: m.state_unanswered(),
    cancelled: m.state_cancelled(),
  }[state];
}

/** The document's type as the paper shows it: DEV, PRO, FAC. */
export function TypeBadge({ type }: { type: DocumentType }) {
  return (
    <span
      aria-hidden="true"
      className="grid h-11 w-11 shrink-0 place-items-center border border-rule-strong bg-paper font-number text-body-sm font-bold"
    >
      {typeShort(type)}
    </span>
  );
}

/** An amount as the tradesman reads it, with its currency in small capitals. */
export function Money({ value, strong = false }: { value: string | null; strong?: boolean }) {
  if (value === null) return <span className="text-bark">—</span>;
  return (
    <span
      className={`whitespace-nowrap font-number ${strong ? 'text-title font-bold' : 'text-body-sm'}`}
    >
      {formatMoney(value)} <span className="text-label-caps text-bark">{m.currency()}</span>
    </span>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3 border-b border-ink pb-2">
      <h2 className="font-headline text-title font-bold">{children}</h2>
      {action}
    </div>
  );
}

function Icon({ path }: { path: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

const ICONS = {
  documents: 'M8 3h7l4 4v14H8zM15 3v4h4M5 7v14h11',
  presentation: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm-4 9 3 3 5-6',
  chat: 'M4 5h16v11H9l-5 4z',
};

/** The three places of the space, at thumb's reach. */
export function BottomNav({ chatUrl }: { chatUrl: string | null }) {
  const item =
    'flex flex-1 flex-col items-center gap-1 py-2 text-label-caps font-semibold text-bark data-[status=active]:text-ink';
  return (
    <nav
      aria-label={m.nav_label()}
      className="fixed inset-x-0 bottom-0 border-t border-rule bg-paper"
    >
      <div className="mx-auto flex max-w-xl">
        <Link to="/espace" activeOptions={{ exact: false, includeSearch: false }} className={item}>
          <Icon path={ICONS.documents} />
          {m.nav_documents()}
        </Link>
        <Link to="/espace/presentation" className={item}>
          <Icon path={ICONS.presentation} />
          {m.nav_presentation()}
        </Link>
        {chatUrl ? (
          <a href={chatUrl} className={item}>
            <Icon path={ICONS.chat} />
            {m.nav_chat()}
          </a>
        ) : null}
      </div>
    </nav>
  );
}

export function useIsoDate(value: string): string {
  const [year, month, day] = value.slice(0, 10).split('-');
  return getLocale() === 'fr' ? `${day}/${month}/${year}` : `${year}-${month}-${day}`;
}
