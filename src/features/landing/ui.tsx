import type { ReactNode } from 'react';
import { formatMoney } from '@/features/documents/client';
import { LanguageSwitch, Wordmark } from '@/lib/ui';
import * as m from '@/paraglide/messages.js';
import type { Landing } from './functions';

// Firmo's public page (spec 013). One offer, built on the value equation: what he gets (a document
// taken seriously), why he can believe it (he sees what was read before anything leaves, and the
// document shown is a real rendering), how soon (on the spot), at what effort (a voice note), at
// what risk (three documents offered, and what Firmo will never do). No proof is claimed that
// does not exist yet (docs/product/strategie.md): the demonstration is labeled as one.

const ICONS = {
  chat: 'M4 5h16v11H9l-5 4z',
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM6 11a6 6 0 0 0 12 0M12 17v4',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  file: 'M7 3h7l4 4v14H7zM14 3v4h4',
  play: 'M8 5v14l11-7z',
};

function Icon({ path, size = 18 }: { path: string; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={path} />
    </svg>
  );
}

const cta =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-control px-5 font-semibold transition-colors';
const primary = `${cta} bg-ink text-sand hover:bg-action`;
const ghost = `${cta} border border-rule-strong text-ink hover:bg-clay`;
const onDark = `${cta} bg-sand text-ink hover:bg-paper`;

const money = (value: number) => formatMoney(String(value));
/** An amount as he reads it: `2 000 F CFA` (docs/product/voix.md). */
const cfa = (value: number) => m.landing_fcfa({ amount: money(value) });

/** The lines Firmo reads back in the demonstration — the sample document's own. */
const READ_BACK = [
  { label: m.landing_row_camera, quantity: '4', price: 85000 },
  { label: m.landing_row_recorder, quantity: '1', price: 250000 },
  { label: m.landing_row_fitting, quantity: null, price: 180000 },
];

function Band({
  tone = 'sand',
  id,
  children,
}: {
  tone?: 'sand' | 'clay' | 'ink';
  id?: string;
  children: ReactNode;
}) {
  const tones = {
    sand: 'bg-sand text-ink',
    clay: 'bg-clay text-ink',
    ink: 'bg-ink text-sand',
  };
  return (
    <section id={id} className={`${tones[tone]} border-t border-rule`}>
      <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 lg:py-24">{children}</div>
    </section>
  );
}

const h2 =
  'font-display text-[clamp(1.75rem,4.2vw,2.75rem)] leading-[1.08] font-bold tracking-[-0.02em] text-balance';
const lead = 'mt-4 max-w-[60ch] text-body-lg text-pretty';

/** The conversation as it happens: he speaks, Firmo reads back, he confirms, the PDF arrives. */
function Stage() {
  return (
    <div
      className="landing-stage mx-auto grid w-full max-w-md gap-3"
      role="group"
      aria-label={m.landing_stage_label()}
    >
      <div className="landing-step landing-out flex items-center gap-3 self-end rounded-box bg-ink px-4 py-3 text-sand">
        <span className="grid size-8 place-items-center rounded-full bg-sand text-ink">
          <Icon path={ICONS.play} size={14} />
        </span>
        <span className="landing-wave" aria-hidden="true">
          {Array.from({ length: 22 }, (_, index) => (
            <i key={index} />
          ))}
        </span>
        <span className="font-number text-body-sm tabular-nums">0:31</span>
      </div>
      <p className="landing-step max-w-[40ch] justify-self-end px-1 text-right text-body-sm text-bark italic">
        {m.landing_transcript()}
      </p>

      <div className="landing-step rounded-box border border-rule bg-paper p-4 shadow-[0_10px_30px_-18px_rgb(42_22_16/0.45)]">
        <p className="font-semibold">{m.landing_read_label()}</p>
        <table className="mt-2 w-full text-body-sm">
          <tbody>
            {READ_BACK.map((row) => (
              <tr key={row.price} className="border-b border-rule last:border-b-0">
                <td className="py-2 pr-2">{row.label()}</td>
                <td className="py-2 pr-2 text-right text-bark tabular-nums">
                  {row.quantity ?? m.landing_row_flat()}
                </td>
                <td className="py-2 text-right font-number tabular-nums">{money(row.price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 font-semibold">{m.landing_read_question()}</p>
      </div>

      <div className="landing-step landing-out justify-self-end rounded-box bg-ink px-4 py-2 font-semibold text-sand">
        {m.landing_reply_yes()}
      </div>

      <div className="landing-step rounded-box border border-rule bg-paper p-4 shadow-[0_10px_30px_-18px_rgb(42_22_16/0.45)]">
        <p className="font-semibold">{m.landing_ready()}</p>
        <a
          href="/landing/devis-exemple.pdf"
          target="_blank"
          rel="noreferrer"
          className="mt-3 flex items-center gap-3 rounded-control border border-rule p-3 hover:bg-sand"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-control bg-action text-on-action">
            <Icon path={ICONS.file} />
          </span>
          <span className="grid min-w-0">
            <span className="truncate font-semibold">{m.landing_file_name()}</span>
            <span className="text-body-sm text-bark">{m.landing_file_meta()}</span>
          </span>
        </a>
      </div>
      <p className="px-1 text-body-sm text-bark">{m.landing_demo_note()}</p>
    </div>
  );
}

function Ledger() {
  const column = (title: string, lines: string[]) => (
    <div>
      <h3 className="border-b-2 border-ink pb-2 font-display text-title font-bold">{title}</h3>
      <ul>
        {lines.map((line) => (
          <li key={line} className="border-b border-rule py-3 text-body-lg text-pretty">
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
  return (
    <div className="mt-10 grid gap-10 md:grid-cols-2 md:gap-14">
      {column(m.landing_give_title(), [m.landing_give_1(), m.landing_give_2(), m.landing_give_3()])}
      {column(m.landing_get_title(), [m.landing_get_1(), m.landing_get_2(), m.landing_get_3()])}
    </div>
  );
}

/** The offer, written as the document Firmo makes: lines, quantities, amounts, a total. */
function OfferQuote({ data, chat }: { data: Landing; chat: string | null }) {
  const { offer } = data;
  const head =
    'pb-2 text-left font-number text-label-caps font-medium tracking-wide text-bark uppercase';
  const cell = 'border-b border-rule py-3 align-top';
  // An amount is set in the figures' face; a word (« inclus ») in the text's.
  const lines: { label: string; quantity: string; amount: string; figure: boolean }[] = [
    {
      label: m.landing_offer_l1({ count: String(offer.free) }),
      quantity: String(offer.free),
      amount: cfa(0),
      figure: true,
    },
    {
      label: m.landing_offer_l2(),
      quantity: m.landing_offer_each(),
      amount: m.landing_included(),
      figure: false,
    },
    { label: m.landing_offer_l3(), quantity: '', amount: m.landing_included(), figure: false },
    {
      label: m.landing_offer_l4(),
      quantity: m.landing_offer_asneeded(),
      amount: cfa(0),
      figure: true,
    },
  ];
  return (
    <div className="mt-10 border border-rule bg-paper p-5 shadow-[0_24px_60px_-40px_rgb(42_22_16/0.55)] sm:p-9">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-ink pb-5">
        <div>
          <Wordmark />
          <p className="mt-3 text-body-sm text-bark">{m.landing_offer_for()}</p>
        </div>
        <div className="sm:text-right">
          <p className="font-number text-label-caps tracking-wide text-bark uppercase">
            {m.landing_offer_kind()}
          </p>
          <p className="mt-1 font-display text-title font-bold">{m.landing_offer_object()}</p>
        </div>
      </div>

      <table className="mt-6 w-full">
        <thead>
          <tr className="border-b border-ink">
            <th scope="col" className={head}>
              {m.landing_col_label()}
            </th>
            <th scope="col" className={`${head} hidden text-right sm:table-cell`}>
              {m.landing_col_quantity()}
            </th>
            <th scope="col" className={`${head} text-right`}>
              {m.landing_col_amount()}
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.label}>
              <td className={`${cell} pr-4 text-pretty`}>{line.label}</td>
              <td className={`${cell} hidden pr-4 text-right text-bark sm:table-cell`}>
                {line.quantity}
              </td>
              <td
                className={`${cell} text-right whitespace-nowrap ${line.figure ? 'font-number tabular-nums' : 'text-bark'}`}
              >
                {line.amount}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 bg-ink px-5 py-4 text-sand">
        <span className="font-semibold">{m.landing_offer_total()}</span>
        <span className="font-number text-title font-bold tabular-nums">{cfa(0)}</span>
      </div>
      <p className="mt-2 text-right text-body-sm text-bark">{m.landing_offer_no_card()}</p>

      <div className="mt-8 grid gap-2 border-t border-rule pt-6 sm:grid-cols-[1fr_auto] sm:items-baseline sm:gap-6">
        <div>
          <p className="font-semibold">{m.landing_offer_then()}</p>
          <p className="mt-1 text-pretty">
            {m.landing_offer_plan({
              documents: String(offer.documents),
              days: String(offer.days),
            })}
          </p>
        </div>
        <p className="font-number text-title font-bold whitespace-nowrap tabular-nums">
          {cfa(offer.price)}
        </p>
      </div>
      <p className="mt-4 max-w-[70ch] text-body-sm text-bark text-pretty">
        {m.landing_offer_footnote()}
      </p>

      <div className="mt-8 flex flex-wrap items-end justify-between gap-5 border-t border-rule pt-6">
        <div>
          <p className="font-number text-label-caps tracking-wide text-bark uppercase">
            {m.landing_offer_agree()}
          </p>
          <p className="mt-1 max-w-[44ch] text-body-sm text-bark text-pretty">
            {m.landing_offer_subscribe()}
          </p>
        </div>
        {chat && (
          <a className={primary} href={chat}>
            <Icon path={ICONS.mic} />
            {m.landing_cta_voice()}
          </a>
        )}
      </div>
    </div>
  );
}

export function LandingPage({ data }: { data: Landing }) {
  const text = (message: string) => `?text=${encodeURIComponent(message)}`;
  const voice = data.whatsapp ? data.whatsapp + text(m.landing_wa_voice()) : data.telegram;
  const photo = data.whatsapp ? data.whatsapp + text(m.landing_wa_photo()) : data.telegram;
  const never = [
    [m.landing_never_1(), m.landing_never_1_why()],
    [m.landing_never_2(), m.landing_never_2_why()],
    [m.landing_never_3(), m.landing_never_3_why()],
    [m.landing_never_4(), m.landing_never_4_why()],
    [m.landing_never_5(), m.landing_never_5_why()],
  ];
  const reasons = [
    [m.landing_reason_1(), m.landing_reason_1_body()],
    [m.landing_reason_2(), m.landing_reason_2_body()],
    [m.landing_reason_3(), m.landing_reason_3_body()],
  ];
  const questions = [
    [m.landing_q1(), m.landing_a1()],
    [m.landing_q2(), m.landing_a2({ price: cfa(data.offer.price), days: String(data.offer.days) })],
    [m.landing_q3(), m.landing_a3()],
    [m.landing_q4(), m.landing_a4()],
    [m.landing_q5(), m.landing_a5()],
  ];

  return (
    <div className="landing min-h-dvh bg-sand font-body text-ink">
      <header className="sticky top-0 z-10 border-b border-rule bg-sand">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-3 sm:px-8">
          <a href="#top" aria-label={m.landing_top()}>
            <Wordmark />
          </a>
          <div className="flex items-center gap-3">
            <LanguageSwitch />
            {voice && (
              <a
                className="hidden min-h-10 items-center rounded-control border border-ink px-4 font-semibold hover:bg-ink hover:text-sand sm:inline-flex"
                href={voice}
              >
                {data.whatsapp ? m.landing_nav_whatsapp() : m.landing_nav_telegram()}
              </a>
            )}
          </div>
        </div>
      </header>

      <main id="top">
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pt-12 pb-16 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:pt-20 lg:pb-24">
          <div>
            <h1 className="font-display text-[clamp(2.25rem,6.4vw,4rem)] leading-[1] font-bold tracking-[-0.03em]">
              <span className="block">{m.landing_h1_a()}</span>
              <span className="block text-balance text-action">{m.landing_h1_b()}</span>
            </h1>
            <p className="mt-6 max-w-[54ch] text-body-lg text-pretty">{m.landing_lead()}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              {voice ? (
                <a className={primary} href={voice}>
                  <Icon path={ICONS.mic} />
                  {m.landing_cta_voice()}
                </a>
              ) : (
                <p className="text-bark">{m.landing_no_channel()}</p>
              )}
              {data.whatsapp && data.telegram && (
                <a className={ghost} href={data.telegram}>
                  {m.landing_cta_telegram()}
                </a>
              )}
            </div>
            <p className="mt-5 max-w-[54ch] text-pretty">
              <strong>{m.landing_note_free({ count: String(data.offer.free) })}</strong>{' '}
              {m.landing_note_nothing()}
            </p>
            {photo && (
              <p className="mt-2 max-w-[54ch] text-bark text-pretty">
                {m.landing_photo_before()}{' '}
                <a
                  className="inline-block py-1 font-semibold text-ink underline underline-offset-4"
                  href={photo}
                >
                  {m.landing_photo_link()}
                </a>{' '}
                {m.landing_photo_after()}
              </p>
            )}
          </div>
          <Stage />
        </section>

        <Band tone="clay" id="document">
          <div className="grid items-center gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
            <div>
              <h2 className={h2}>{m.landing_doc_title()}</h2>
              <p className={lead}>{m.landing_doc_lead()}</p>
              <p className="mt-4 max-w-[60ch] text-pretty">
                {m.landing_doc_note()} <strong>{m.landing_doc_note_strong()}</strong>
              </p>
            </div>
            <figure className="mx-auto w-full max-w-xl">
              <a
                href="/landing/devis-exemple.pdf"
                target="_blank"
                rel="noreferrer"
                className="block border border-rule bg-paper shadow-[0_30px_70px_-40px_rgb(42_22_16/0.6)] transition-transform duration-300 ease-out hover:-translate-y-1"
              >
                <img
                  src="/landing/devis-exemple.png"
                  width={909}
                  height={1286}
                  loading="lazy"
                  decoding="async"
                  alt={m.landing_doc_alt()}
                  className="block h-auto w-full"
                />
              </a>
              <figcaption className="mt-3 flex flex-wrap items-baseline justify-between gap-2 text-body-sm text-bark">
                <span className="max-w-[46ch] text-pretty">{m.landing_doc_caption()}</span>
                <a
                  className="inline-flex items-center gap-1 py-1 font-semibold text-ink underline underline-offset-4"
                  href="/landing/devis-exemple.pdf"
                  target="_blank"
                  rel="noreferrer"
                >
                  {m.landing_doc_open()}
                  <Icon path={ICONS.arrow} size={14} />
                </a>
              </figcaption>
            </figure>
          </div>
        </Band>

        <Band>
          <h2 className={h2}>
            <span className="block">{m.landing_eq_title_a()}</span>
            <span className="block">{m.landing_eq_title_b()}</span>
          </h2>
          <Ledger />
          <div className="mt-14 grid gap-10 lg:grid-cols-3 lg:gap-12">
            {reasons.map(([title, body]) => (
              <div key={title}>
                <h3 className="font-display text-title leading-snug font-bold text-balance">
                  {title}
                </h3>
                <p className="mt-2 max-w-[48ch] text-pretty text-bark">{body}</p>
              </div>
            ))}
          </div>
        </Band>

        <Band tone="ink">
          <div className="mx-auto max-w-3xl">
            <h2 className={h2}>{m.landing_never_title()}</h2>
            <p className={`${lead} text-clay`}>{m.landing_never_lead()}</p>
            <ul className="mt-8">
              {never.map(([promise, why]) => (
                <li
                  key={promise}
                  className="grid gap-1 border-t border-sand/20 py-5 sm:grid-cols-[1fr_auto] sm:items-baseline sm:gap-8"
                >
                  <span className="text-body-lg font-semibold text-pretty">{promise}</span>
                  <span className="text-clay">{why}</span>
                </li>
              ))}
            </ul>
          </div>
        </Band>

        <Band id="offre">
          <div className="mx-auto max-w-4xl">
            <h2 className={h2}>{m.landing_offer_title()}</h2>
            <p className={lead}>{m.landing_offer_lead({ days: String(data.offer.days) })}</p>
            <OfferQuote data={data} chat={voice} />
          </div>
        </Band>

        <Band tone="clay">
          <div className="mx-auto max-w-3xl">
            <h2 className={h2}>{m.landing_faq_title()}</h2>
            <div className="mt-8 border-b border-rule-strong">
              {questions.map(([question, answer], index) => (
                <details
                  key={question}
                  className="landing-faq border-t border-rule-strong"
                  open={index === 0}
                >
                  <summary className="flex cursor-pointer items-center justify-between gap-4 py-4 text-body-lg font-semibold">
                    {question}
                  </summary>
                  <p className="max-w-[65ch] pb-5 text-pretty">{answer}</p>
                </details>
              ))}
            </div>
          </div>
        </Band>

        <Band tone="ink" id="essayer">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className={h2}>{m.landing_final_title()}</h2>
            <p className={`${lead} mx-auto text-clay`}>{m.landing_final_lead()}</p>
            {voice && (
              <a className={`${onDark} mt-8`} href={voice}>
                <Icon path={ICONS.chat} />
                {m.landing_final_cta()}
              </a>
            )}
            <p className="mt-5 text-body-sm text-clay">{m.landing_final_note()}</p>
          </div>
        </Band>
      </main>

      <footer className="border-t border-rule bg-sand">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-8 text-body-sm text-bark sm:px-8">
          <div className="flex items-center gap-3">
            <Wordmark />
            <span className="italic">{m.landing_tagline()}</span>
          </div>
          <nav aria-label={m.landing_footer_label()} className="flex flex-wrap gap-5">
            <a
              className="inline-block py-1 font-semibold text-ink underline underline-offset-4"
              href="/espace"
            >
              {m.landing_footer_space()}
            </a>
            <span>{m.landing_footer_kete()}</span>
          </nav>
        </div>
      </footer>
    </div>
  );
}
