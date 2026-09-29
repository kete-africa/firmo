import { useState, type ReactNode } from 'react';
import { createFileRoute, Link, notFound, useRouter } from '@tanstack/react-router';
import { Button, TextField } from '@kete/design';
import {
  answerDocument,
  convertDocument,
  fetchDocument,
  issueDocument,
  prepareIssue,
  recordPayment,
  reviseDocument,
  revokeShare,
  saveDocument,
  shareDocument,
  type DocumentDetail,
} from '@/features/space';
import {
  canConvert,
  canRevise,
  formatMoney,
  nextAnswers,
  type Answer,
} from '@/features/documents/client';
import { Money, Notice, stateLabel, typeLabel, useIsoDate } from '@/lib/ui';
import * as m from '@/paraglide/messages.js';

// One document: its lines and groups, its conditions, its totals — editable while a draft, then
// issued, shared, converted or revised. The totals are always the server's.
export const Route = createFileRoute('/espace/documents/$id')({
  loader: async ({ params }) => {
    const id = Number(params.id);
    const detail = Number.isInteger(id) && id > 0 ? await fetchDocument({ data: { id } }) : null;
    if (!detail) throw notFound();
    return detail;
  },
  component: DocumentScreen,
  notFoundComponent: () => (
    <div className="flex flex-col gap-3 px-4 py-10">
      <h1 className="font-display text-headline font-bold">{m.document_not_found()}</h1>
      <Link to="/espace" className="font-semibold underline">
        {m.back()}
      </Link>
    </div>
  ),
});

type Tab = 'detail' | 'conditions' | 'totals';

interface Facts {
  subject: string;
  clientName: string;
  clientPhone: string;
  clientAddress: string;
  site: string;
  delivery: string;
  warranty: string;
  assumptions: string;
  validityDays: string;
  depositPercent: string;
  taxRate: string;
}

interface EditLine {
  label: string;
  unit: string;
  pricing: 'unit' | 'flat' | 'text';
  quantity: string;
  unitPrice: string;
  flatAmount: string;
}

interface EditSection {
  title: string;
  showSubtotal: boolean;
  lines: EditLine[];
}

/** "20 000", "12,5" → "20000", "12.5"; empty stays empty. */
function decimal(value: string): string | null {
  const cleaned = value.replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
  return cleaned === '' ? null : cleaned;
}

function editableOf(detail: DocumentDetail): EditSection[] {
  return detail.sections.map((section) => ({
    title: section.title ?? '',
    showSubtotal: section.showSubtotal,
    lines: section.lines.map((line) => ({
      label: line.label,
      unit: line.unit ?? '',
      pricing: !line.calculated ? 'text' : line.flatAmount !== null ? 'flat' : 'unit',
      quantity: line.quantity ?? '',
      unitPrice: line.unitPrice ?? '',
      flatAmount: line.flatAmount ?? '',
    })),
  }));
}

function DocumentScreen() {
  const detail = Route.useLoaderData();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('detail');
  const [sections, setSections] = useState<EditSection[]>(() => editableOf(detail));
  const [facts, setFacts] = useState<Facts>(() => ({
    subject: detail.subject,
    clientName: detail.client.name,
    clientPhone: detail.client.phone ?? '',
    clientAddress: detail.client.address ?? '',
    site: detail.site ?? '',
    delivery: detail.delivery ?? '',
    warranty: detail.warranty ?? '',
    assumptions: detail.assumptions ?? '',
    validityDays: String(detail.validityDays),
    depositPercent: detail.depositPercent ?? '',
    taxRate: detail.taxRate ?? '',
  }));
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState<{
    tone: 'error' | 'success' | 'info';
    text: string;
    /** Beyond what was bought: the way to his subscription. */
    subscribe?: boolean;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const editable = detail.state === 'draft';

  const change = (next: EditSection[]) => {
    setSections(next);
    setDirty(true);
  };
  const setFact = (key: keyof Facts, value: string) => {
    setFacts({ ...facts, [key]: value });
    setDirty(true);
  };

  async function save(): Promise<boolean> {
    setBusy(true);
    const draft = {
      type: detail.type,
      subject: facts.subject,
      client: {
        name: facts.clientName,
        phone: facts.clientPhone || null,
        address: facts.clientAddress || null,
      },
      validityDays: Number(facts.validityDays) || null,
      site: facts.site || null,
      delivery: facts.delivery || null,
      warranty: facts.warranty || null,
      assumptions: facts.assumptions || null,
      depositPercent: decimal(facts.depositPercent),
      taxRate: decimal(facts.taxRate),
      sections: sections
        .filter((section) => section.lines.length > 0)
        .map((section) => ({
          title: section.title || null,
          showSubtotal: section.showSubtotal,
          lines: section.lines.map((line) => {
            const quantity = line.pricing === 'unit' ? decimal(line.quantity) : null;
            const unitPrice = line.pricing === 'unit' ? decimal(line.unitPrice) : null;
            const flatAmount = line.pricing === 'flat' ? decimal(line.flatAmount) : null;
            const calculated = line.pricing !== 'text';
            return {
              label: line.label,
              unit: line.unit || null,
              quantity,
              unitPrice,
              flatAmount,
              calculated,
              confirmationRequired:
                calculated && flatAmount === null && (quantity === null || unitPrice === null),
            };
          }),
        })),
      adjustments: detail.adjustments.map((a) => ({ ...a, sign: a.sign })),
      clauseIds: null,
    };
    const result = await saveDocument({ data: { id: detail.id, draft } });
    setBusy(false);
    if (!result.ok) {
      setNotice({ tone: 'error', text: m.document_save_refused() });
      return false;
    }
    setDirty(false);
    setNotice({ tone: 'success', text: m.document_saved() });
    await router.invalidate();
    return true;
  }

  async function issue() {
    if (dirty && !(await save())) return;
    setBusy(true);
    const prepared = await prepareIssue({ data: { id: detail.id } });
    if (!prepared.ok) {
      setBusy(false);
      setNotice({ tone: 'error', text: m.document_not_issuable() });
      return;
    }
    if (!window.confirm(m.document_issue_confirm())) {
      setBusy(false);
      return;
    }
    const issued = await issueDocument({ data: { id: detail.id, sha256: prepared.sha256 } });
    setBusy(false);
    if (!issued.ok) {
      if (issued.reason === 'plan_required' || issued.reason === 'quota_reached') {
        const text =
          issued.reason === 'plan_required'
            ? m.document_plan_required()
            : m.document_quota_reached();
        setNotice({ tone: 'error', text, subscribe: true });
      } else {
        setNotice({ tone: 'error', text: m.document_issue_refused() });
      }
      return;
    }
    setNotice({ tone: 'success', text: m.document_issued({ number: issued.number }) });
    await router.invalidate();
  }

  const title = detail.number ?? typeLabel(detail.type);

  return (
    <div className="flex flex-col pb-40">
      <div className="flex items-center gap-3 border-b border-rule bg-paper px-4 py-3">
        <Link to="/espace" aria-label={m.back()} className="text-title">
          ←
        </Link>
        <div className="min-w-0 flex-1 text-center">
          <h1 className="truncate font-number text-title font-bold">{title}</h1>
          <p className="text-body-sm text-bark">
            {stateLabel(detail.state, {
              type: detail.type,
              expired: detail.expired,
              paid: detail.paid,
            })}
            {detail.validUntil && detail.state !== 'draft'
              ? ` · ${m.valid_until({ date: useIsoDate(detail.validUntil) })}`
              : ''}
          </p>
        </div>
        <span className="w-6" />
      </div>

      <div className="flex items-start justify-between gap-3 bg-paper px-4 py-4">
        <div className="min-w-0">
          <p className="font-label-caps text-label-caps uppercase tracking-label-caps text-bark">
            {m.document_subject()}
          </p>
          <p className="font-headline text-title font-bold">{facts.subject}</p>
          <p className="text-body-sm text-bark">{facts.clientName}</p>
        </div>
        <Money value={detail.totals?.grandTotal ?? null} strong />
      </div>

      {notice ? (
        <div className="px-4 py-2">
          <Notice tone={notice.tone}>{notice.text}</Notice>
          {notice.subscribe ? (
            <Link
              to="/espace/abonnement"
              className="mt-2 inline-block text-body-sm font-semibold underline"
            >
              {m.plan_link()}
            </Link>
          ) : null}
        </div>
      ) : null}

      <div role="tablist" className="flex border-b border-rule bg-paper">
        {(['detail', 'conditions', 'totals'] as const).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`flex-1 border-b-2 py-3 text-body-sm font-semibold ${tab === key ? 'border-ink text-ink' : 'border-transparent text-bark'}`}
          >
            {
              { detail: m.tab_detail(), conditions: m.tab_conditions(), totals: m.tab_totals() }[
                key
              ]
            }
          </button>
        ))}
      </div>

      {tab === 'detail' ? (
        <Lines
          sections={sections}
          editable={editable}
          onChange={change}
          subtotals={detail.sections.map((s) => s.subtotal)}
        />
      ) : null}
      {tab === 'conditions' ? (
        <Conditions facts={facts} editable={editable} onChange={setFact} clauses={detail.clauses} />
      ) : null}
      {tab === 'totals' ? <Totals detail={detail} onNotice={setNotice} /> : null}

      <div className="fixed inset-x-0 bottom-16 border-t border-rule bg-sand">
        <div className="mx-auto flex max-w-xl gap-2 px-4 py-3">
          {editable ? (
            <>
              {dirty ? (
                <Button className="flex-1" disabled={busy} onClick={() => void save()}>
                  {m.document_save()}
                </Button>
              ) : (
                <a
                  href={`/api/documents/${detail.id}/pdf`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-12 flex-1 items-center justify-center rounded-control border border-ink bg-paper font-semibold"
                >
                  {m.document_view_pdf()}
                </a>
              )}
              <Button
                className="flex-1"
                variant="secondary"
                disabled={busy}
                onClick={() => void issue()}
              >
                {m.document_issue()}
              </Button>
            </>
          ) : (
            <IssuedActions detail={detail} onNotice={setNotice} />
          )}
        </div>
      </div>
    </div>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  inputMode?: 'decimal' | 'text' | 'tel' | undefined;
  disabled?: boolean | undefined;
}) {
  return (
    <TextField
      label={props.label}
      name={props.label}
      value={props.value}
      inputMode={props.inputMode ?? 'text'}
      disabled={props.disabled}
      onChange={(event) => props.onChange(event.target.value)}
    />
  );
}

function Lines({
  sections,
  editable,
  onChange,
  subtotals,
}: {
  sections: EditSection[];
  editable: boolean;
  onChange: (next: EditSection[]) => void;
  subtotals: (string | null)[];
}) {
  const [open, setOpen] = useState<string | null>(null);
  const update = (s: number, updater: (section: EditSection) => EditSection) =>
    onChange(sections.map((section, index) => (index === s ? updater(section) : section)));
  const updateLine = (s: number, l: number, patch: Partial<EditLine>) =>
    update(s, (section) => ({
      ...section,
      lines: section.lines.map((line, index) => (index === l ? { ...line, ...patch } : line)),
    }));
  return (
    <div className="flex flex-col">
      {sections.map((section, s) => (
        <section key={s} className="border-b border-rule">
          <div className="flex items-center gap-2 bg-clay px-4 py-3">
            {editable ? (
              <input
                aria-label={m.section_title()}
                value={section.title}
                placeholder={m.section_untitled()}
                onChange={(event) =>
                  update(s, (current) => ({ ...current, title: event.target.value }))
                }
                className="min-w-0 flex-1 bg-transparent font-headline text-title font-bold"
              />
            ) : (
              <h2 className="min-w-0 flex-1 font-headline text-title font-bold">
                {section.title || m.section_untitled()}
              </h2>
            )}
            <span className="text-body-sm text-bark">
              {m.lines_count({ count: section.lines.length })}
            </span>
          </div>
          <ul className="bg-paper">
            {section.lines.map((line, l) => {
              const key = `${s}.${l}`;
              const detailText =
                line.pricing === 'unit'
                  ? `${line.quantity || '?'}${line.unit ? ` ${line.unit}` : ''} × ${decimal(line.unitPrice) ? `${formatMoney(decimal(line.unitPrice) ?? '0')} ${m.currency()}` : '?'}`
                  : line.pricing === 'flat'
                    ? m.line_flat()
                    : m.line_text();
              return (
                <li key={key} className="border-b border-rule">
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-4 py-3 text-left"
                    aria-expanded={open === key}
                    onClick={() => setOpen(open === key ? null : key)}
                    disabled={!editable}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{line.label}</span>
                      <span className="block text-body-sm text-bark">{detailText}</span>
                    </span>
                    {line.pricing === 'flat' && line.flatAmount ? (
                      <Money value={decimal(line.flatAmount)} />
                    ) : null}
                    {editable ? <span aria-hidden="true">✎</span> : null}
                  </button>
                  {editable && open === key ? (
                    <div className="flex flex-col gap-3 px-4 pb-4">
                      <Field
                        label={m.line_label()}
                        value={line.label}
                        onChange={(value) => updateLine(s, l, { label: value })}
                      />
                      <div className="flex gap-2" role="group" aria-label={m.line_pricing()}>
                        {(['unit', 'flat', 'text'] as const).map((pricing) => (
                          <button
                            key={pricing}
                            type="button"
                            aria-pressed={line.pricing === pricing}
                            onClick={() => updateLine(s, l, { pricing })}
                            className={`flex-1 rounded-control border px-2 py-2 text-body-sm font-semibold ${line.pricing === pricing ? 'border-ink bg-ink text-sand' : 'border-rule-strong'}`}
                          >
                            {
                              {
                                unit: m.line_unit_pricing(),
                                flat: m.line_flat(),
                                text: m.line_text(),
                              }[pricing]
                            }
                          </button>
                        ))}
                      </div>
                      {line.pricing === 'unit' ? (
                        <div className="grid grid-cols-2 gap-2">
                          <Field
                            label={m.line_quantity()}
                            value={line.quantity}
                            inputMode="decimal"
                            onChange={(value) => updateLine(s, l, { quantity: value })}
                          />
                          <Field
                            label={m.line_unit()}
                            value={line.unit}
                            onChange={(value) => updateLine(s, l, { unit: value })}
                          />
                          <div className="col-span-2">
                            <Field
                              label={m.line_unit_price()}
                              value={line.unitPrice}
                              inputMode="decimal"
                              onChange={(value) => updateLine(s, l, { unitPrice: value })}
                            />
                          </div>
                        </div>
                      ) : null}
                      {line.pricing === 'flat' ? (
                        <Field
                          label={m.line_amount()}
                          value={line.flatAmount}
                          inputMode="decimal"
                          onChange={(value) => updateLine(s, l, { flatAmount: value })}
                        />
                      ) : null}
                      <button
                        type="button"
                        className="self-start text-body-sm font-semibold text-error underline"
                        onClick={() => {
                          update(s, (current) => ({
                            ...current,
                            lines: current.lines.filter((_, index) => index !== l),
                          }));
                          setOpen(null);
                        }}
                      >
                        {m.line_remove()}
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {editable ? (
            <button
              type="button"
              className="w-full bg-paper px-4 py-3 text-left text-body-sm font-semibold"
              onClick={() => {
                update(s, (current) => ({
                  ...current,
                  lines: [
                    ...current.lines,
                    {
                      label: m.line_new(),
                      unit: '',
                      pricing: 'unit',
                      quantity: '',
                      unitPrice: '',
                      flatAmount: '',
                    },
                  ],
                }));
                setOpen(`${s}.${section.lines.length}`);
              }}
            >
              + {m.line_add()}
            </button>
          ) : null}
          {section.showSubtotal && subtotals[s] ? (
            <div className="flex items-center justify-between bg-clay px-4 py-2 text-body-sm">
              <span>{m.subtotal_of({ title: section.title || m.section_untitled() })}</span>
              <Money value={subtotals[s] ?? null} />
            </div>
          ) : null}
        </section>
      ))}
      {editable ? (
        <button
          type="button"
          className="bg-paper px-4 py-4 text-left font-semibold"
          onClick={() =>
            onChange([
              ...sections,
              {
                title: '',
                showSubtotal: true,
                lines: [
                  {
                    label: m.line_new(),
                    unit: '',
                    pricing: 'unit',
                    quantity: '',
                    unitPrice: '',
                    flatAmount: '',
                  },
                ],
              },
            ])
          }
        >
          + {m.section_add()}
        </button>
      ) : null}
    </div>
  );
}

function Conditions({
  facts,
  editable,
  onChange,
  clauses,
}: {
  facts: Facts;
  editable: boolean;
  onChange: (key: keyof Facts, value: string) => void;
  clauses: { title: string; body: string }[];
}) {
  const field = (key: keyof Facts, label: string, inputMode?: 'decimal' | 'tel') => (
    <Field
      label={label}
      value={facts[key]}
      inputMode={inputMode}
      disabled={!editable}
      onChange={(value) => onChange(key, value)}
    />
  );
  return (
    <div className="flex flex-col gap-4 bg-paper px-4 py-4">
      {field('subject', m.document_subject())}
      {field('clientName', m.client_name())}
      {field('clientPhone', m.client_phone(), 'tel')}
      {field('clientAddress', m.client_address())}
      {field('site', m.document_site())}
      {field('delivery', m.document_delivery())}
      {field('warranty', m.document_warranty())}
      {field('validityDays', m.document_validity(), 'decimal')}
      {field('depositPercent', m.document_deposit(), 'decimal')}
      {field('taxRate', m.document_tax(), 'decimal')}
      <label className="flex flex-col gap-1.5">
        <span className="text-body-sm font-semibold">{m.document_assumptions()}</span>
        <textarea
          value={facts.assumptions}
          disabled={!editable}
          rows={3}
          onChange={(event) => onChange('assumptions', event.target.value)}
          className="rounded-control border border-rule-strong bg-paper px-3 py-2"
        />
      </label>
      {clauses.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="font-label-caps text-label-caps uppercase tracking-label-caps text-bark">
            {m.document_clauses()}
          </p>
          <ul className="flex flex-col gap-2">
            {clauses.map((clause) => (
              <li key={clause.title} className="border border-rule p-3">
                <p className="font-semibold">{clause.title}</p>
                <p className="text-body-sm text-bark">{clause.body}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-rule py-2">
      <span className="text-body-sm">{label}</span>
      {children}
    </div>
  );
}

function Totals({
  detail,
  onNotice,
}: {
  detail: DocumentDetail;
  onNotice: (n: { tone: 'error' | 'success'; text: string }) => void;
}) {
  const router = useRouter();
  const [payment, setPayment] = useState({
    amount: '',
    paidOn: new Date().toISOString().slice(0, 10),
    method: '',
  });
  const canPay = detail.type === 'invoice' && detail.state === 'issued';
  return (
    <div className="flex flex-col gap-4 bg-paper px-4 py-4">
      {detail.adjustments.map((a) => (
        <Row key={a.label} label={a.label}>
          <span className="font-number text-body-sm">
            {a.sign === -1 ? '−' : ''}
            {a.mode === 'percent' ? `${a.value} %` : <Money value={a.value} />}
          </span>
        </Row>
      ))}
      <Row label={m.total_grand()}>
        <Money value={detail.totals?.grandTotal ?? null} strong />
      </Row>
      {detail.payments.length > 0 ? (
        <>
          {detail.payments.map((p, index) => (
            <Row key={index} label={`${p.paidOn} · ${p.method}`}>
              <Money value={p.amount} />
            </Row>
          ))}
          <Row label={m.total_balance()}>
            <Money value={detail.totals?.balanceDue ?? null} strong />
          </Row>
        </>
      ) : null}
      {canPay ? (
        <form
          className="flex flex-col gap-3 border-t border-ink pt-4"
          onSubmit={(event) => {
            event.preventDefault();
            void recordPayment({ data: { id: detail.id, ...payment } }).then(async (result) => {
              if (!result.ok) return onNotice({ tone: 'error', text: m.payment_refused() });
              onNotice({ tone: 'success', text: m.payment_recorded() });
              setPayment({ ...payment, amount: '', method: '' });
              await router.invalidate();
            });
          }}
        >
          <p className="font-headline text-title font-bold">{m.payment_title()}</p>
          <Field
            label={m.payment_amount()}
            value={payment.amount}
            inputMode="decimal"
            onChange={(amount) => setPayment({ ...payment, amount })}
          />
          <Field
            label={m.payment_date()}
            value={payment.paidOn}
            onChange={(paidOn) => setPayment({ ...payment, paidOn })}
          />
          <Field
            label={m.payment_method()}
            value={payment.method}
            onChange={(method) => setPayment({ ...payment, method })}
          />
          <Button type="submit">{m.payment_record()}</Button>
        </form>
      ) : null}
    </div>
  );
}

function IssuedActions({
  detail,
  onNotice,
}: {
  detail: DocumentDetail;
  onNotice: (n: { tone: 'error' | 'success' | 'info'; text: string }) => void;
}) {
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const go = async (result: Promise<{ ok: boolean; id?: number }>) => {
    const outcome = await result;
    if (!outcome.ok) return onNotice({ tone: 'error', text: m.action_refused() });
    if (outcome.id) {
      await router.navigate({ to: '/espace/documents/$id', params: { id: String(outcome.id) } });
      return;
    }
    await router.invalidate();
  };
  return (
    <div className="flex w-full flex-col gap-2">
      {shareUrl ? (
        <div className="flex flex-col gap-2 border border-rule bg-paper p-3">
          <p className="text-body-sm">{m.share_ready()}</p>
          <input
            readOnly
            value={shareUrl}
            aria-label={m.share_link()}
            className="w-full border border-rule px-2 py-1 font-number text-body-sm"
            onFocus={(e) => e.currentTarget.select()}
          />
          <div className="flex gap-2">
            <button
              type="button"
              className="text-body-sm font-semibold underline"
              onClick={() => void navigator.clipboard?.writeText(shareUrl)}
            >
              {m.share_copy()}
            </button>
          </div>
        </div>
      ) : null}
      {detail.share?.active ? (
        <p className="text-body-sm text-bark">
          {m.share_views({ count: detail.share.viewCount })}{' '}
          <button
            type="button"
            className="font-semibold underline"
            onClick={() =>
              void revokeShare({ data: { id: detail.id } }).then(() => router.invalidate())
            }
          >
            {m.share_revoke()}
          </button>
        </p>
      ) : null}
      <div className="flex gap-2">
        <a
          href={`/api/documents/${detail.id}/pdf`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-12 flex-1 items-center justify-center whitespace-nowrap rounded-control bg-ink px-3 font-semibold text-sand"
        >
          {m.document_download()}
        </a>
        <Button
          variant="secondary"
          className="flex-1"
          onClick={() =>
            void shareDocument({ data: { id: detail.id } }).then(async (result) => {
              if (!result.ok) return onNotice({ tone: 'error', text: m.action_refused() });
              setShareUrl(result.url);
              await router.invalidate();
            })
          }
        >
          {m.document_share()}
        </Button>
        <Button
          variant="secondary"
          aria-expanded={menu}
          aria-label={m.document_more()}
          onClick={() => setMenu(!menu)}
        >
          ⋮
        </Button>
      </div>
      {menu ? (
        <div className="flex flex-col border border-rule bg-paper">
          {(['proforma', 'invoice'] as const)
            .filter((target) => canConvert(detail.type, detail.state, target))
            .map((target) => (
              <MenuItem
                key={target}
                onClick={() => void go(convertDocument({ data: { id: detail.id, target } }))}
              >
                {target === 'invoice' ? m.convert_invoice() : m.convert_proforma()}
              </MenuItem>
            ))}
          {canRevise(detail.type, detail.state) ? (
            <MenuItem onClick={() => void go(reviseDocument({ data: { id: detail.id } }))}>
              {m.document_revise()}
            </MenuItem>
          ) : null}
          {nextAnswers(detail.type, detail.state).map((answer) => (
            <MenuItem
              key={answer}
              onClick={() => void go(answerDocument({ data: { id: detail.id, state: answer } }))}
            >
              {answerLabel(detail.type, answer)}
            </MenuItem>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** How an answer reads for this type: a proforma is ordered, a quote accepted. */
function answerLabel(type: DocumentDetail['type'], answer: Answer): string {
  if (answer === 'accepted') return type === 'proforma' ? m.answer_ordered() : m.answer_accepted();
  if (answer === 'refused') return m.answer_refused();
  if (answer === 'unanswered') return m.answer_unanswered();
  return m.answer_cancelled();
}

function MenuItem({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="border-b border-rule px-4 py-3 text-left text-body-sm font-semibold last:border-b-0 hover:bg-clay"
    >
      {children}
    </button>
  );
}
