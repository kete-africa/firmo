import { useState, type FormEvent } from 'react';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { Button, TextField } from '@kete/design';
import {
  archiveClause,
  fetchPresentation,
  saveClause,
  saveNumbering,
  savePresentation,
  type Presentation,
} from '@/features/space';
import { Notice, SectionTitle, typeLabel } from '@/lib/ui';
import * as m from '@/paraglide/messages.js';

// His presentation: what his next documents carry — seen on the real rendering of a sample page.
export const Route = createFileRoute('/espace/presentation')({
  loader: () => fetchPresentation(),
  component: PresentationScreen,
});

const COLORS = ['#A8391F', '#2B5C88', '#2F6B45', '#7A4E9C', '#B8860B', '#181A1B'];

type Profile = NonNullable<Presentation['profile']>;

function emptyProfile(): Profile {
  return {
    name: '',
    legalName: null,
    trade: null,
    phone: null,
    email: null,
    address: null,
    legalMentions: null,
    rccm: null,
    taxId: null,
    brandColor: null,
    hasLogo: false,
    defaultWarranty: null,
    defaultDelivery: null,
    defaultDepositPercent: null,
    defaultValidityDays: 30,
  };
}

function PresentationScreen() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile>(data.profile ?? emptyProfile());
  const [notice, setNotice] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [version, setVersion] = useState(0);
  const set = (key: keyof Profile, value: string | null) =>
    setProfile({ ...profile, [key]: value });

  async function submit(event: FormEvent) {
    event.preventDefault();
    const result = await savePresentation({
      data: {
        name: profile.name,
        legalName: profile.legalName,
        trade: profile.trade,
        phone: profile.phone,
        email: profile.email,
        address: profile.address,
        legalMentions: profile.legalMentions,
        rccm: profile.rccm,
        taxId: profile.taxId,
        brandColor: profile.brandColor,
        defaultWarranty: profile.defaultWarranty,
        defaultDelivery: profile.defaultDelivery,
        defaultDepositPercent: profile.defaultDepositPercent,
        defaultValidityDays: Number(profile.defaultValidityDays) || 30,
      },
    });
    if (!result.ok) return setNotice({ tone: 'error', text: m.presentation_refused() });
    setNotice({ tone: 'success', text: m.presentation_saved() });
    setVersion(version + 1);
    await router.invalidate();
  }

  async function uploadLogo(file: File) {
    const form = new FormData();
    form.append('logo', file);
    const response = await fetch('/api/presentation/logo', { method: 'POST', body: form });
    if (!response.ok) return setNotice({ tone: 'error', text: m.logo_refused() });
    setProfile({ ...profile, hasLogo: true });
    setNotice({ tone: 'success', text: m.logo_saved() });
    setVersion(version + 1);
  }

  const text = (key: keyof Profile, label: string, inputMode?: 'tel' | 'email' | 'decimal') => (
    <TextField
      label={label}
      name={key}
      value={(profile[key] as string | null) ?? ''}
      inputMode={inputMode}
      onChange={(event) => set(key, event.target.value)}
    />
  );

  return (
    <div className="flex flex-col gap-6 py-6">
      <div className="flex flex-col gap-2 px-4">
        <h1 className="font-display text-headline font-bold">{m.presentation_title()}</h1>
        <p className="text-body text-bark">{m.presentation_intro()}</p>
      </div>

      <section className="flex flex-col gap-3 bg-clay px-4 py-4">
        <SectionTitle>{m.presentation_preview()}</SectionTitle>
        {data.profile ? (
          <img
            key={version}
            src={`/api/presentation/preview?v=${version}`}
            alt={m.presentation_preview_alt()}
            className="w-full border border-rule bg-paper"
          />
        ) : (
          <p className="text-body-sm text-bark">{m.presentation_preview_after_name()}</p>
        )}
      </section>

      {notice ? (
        <div className="px-4">
          <Notice tone={notice.tone}>{notice.text}</Notice>
        </div>
      ) : null}

      <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-6 px-4">
        <section className="flex flex-col gap-4">
          <SectionTitle>{m.presentation_identity()}</SectionTitle>
          <div className="flex items-center justify-between gap-3 border border-dashed border-rule-strong p-3">
            <div>
              <p className="font-semibold">{m.logo_title()}</p>
              <p className="text-body-sm text-bark">
                {profile.hasLogo ? m.logo_present() : m.logo_hint()}
              </p>
            </div>
            <label className="cursor-pointer text-body-sm font-semibold underline">
              {profile.hasLogo ? m.logo_replace() : m.logo_add()}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                disabled={!data.profile}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadLogo(file);
                }}
              />
            </label>
          </div>
          {text('name', m.profile_name())}
          {text('trade', m.profile_trade())}
          {text('legalName', m.profile_legal_name())}
          {text('phone', m.profile_phone(), 'tel')}
          {text('email', m.profile_email(), 'email')}
          {text('address', m.profile_address())}
          <fieldset className="flex flex-col gap-2">
            <legend className="text-body-sm font-semibold">{m.profile_color()}</legend>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-pressed={profile.brandColor === color}
                  aria-label={color}
                  onClick={() => set('brandColor', color)}
                  className={`h-10 w-10 border-2 ${profile.brandColor === color ? 'border-ink' : 'border-transparent'}`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
            <p className="text-body-sm text-bark">{m.profile_color_hint()}</p>
          </fieldset>
        </section>

        <section className="flex flex-col gap-4">
          <SectionTitle>{m.presentation_legal()}</SectionTitle>
          {text('rccm', m.profile_rccm())}
          {text('taxId', m.profile_tax_id())}
          {text('legalMentions', m.profile_mentions())}
        </section>

        <section className="flex flex-col gap-4">
          <SectionTitle>{m.presentation_defaults()}</SectionTitle>
          {text('defaultWarranty', m.profile_default_warranty())}
          {text('defaultDelivery', m.profile_default_delivery())}
          {text('defaultDepositPercent', m.profile_default_deposit(), 'decimal')}
          <TextField
            label={m.profile_default_validity()}
            name="defaultValidityDays"
            inputMode="decimal"
            value={String(profile.defaultValidityDays)}
            onChange={(event) =>
              setProfile({ ...profile, defaultValidityDays: Number(event.target.value) || 0 })
            }
          />
        </section>

        <Button type="submit">{m.presentation_save()}</Button>
      </form>

      {data.profile ? <Clauses clauses={data.clauses} onNotice={setNotice} /> : null}
      {data.profile ? <Numbering rows={data.numbering} onNotice={setNotice} /> : null}
    </div>
  );
}

function Clauses({
  clauses,
  onNotice,
}: {
  clauses: Presentation['clauses'];
  onNotice: (n: { tone: 'error' | 'success'; text: string }) => void;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState({ title: '', body: '', enabledByDefault: true });
  return (
    <section className="flex flex-col gap-4 px-4">
      <SectionTitle>{m.clauses_title()}</SectionTitle>
      <p className="text-body-sm text-bark">{m.clauses_intro()}</p>
      <ul className="flex flex-col gap-2">
        {clauses.map((clause) => (
          <li
            key={clause.id}
            className="flex items-start justify-between gap-3 border border-rule bg-paper p-3"
          >
            <div className="min-w-0">
              <p className="font-semibold">{clause.title}</p>
              <p className="text-body-sm text-bark">{clause.body}</p>
              {clause.enabledByDefault ? (
                <p className="text-body-sm">{m.clause_default()}</p>
              ) : null}
            </div>
            <button
              type="button"
              className="text-body-sm font-semibold underline"
              onClick={() =>
                void archiveClause({ data: { id: clause.id } }).then(() => router.invalidate())
              }
            >
              {m.clause_remove()}
            </button>
          </li>
        ))}
      </ul>
      <form
        className="flex flex-col gap-3 border border-rule bg-paper p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void saveClause({ data: { id: null, ...draft } }).then(async (result) => {
            if (!result.ok) return onNotice({ tone: 'error', text: m.clause_refused() });
            setDraft({ title: '', body: '', enabledByDefault: true });
            await router.invalidate();
          });
        }}
      >
        <TextField
          label={m.clause_title()}
          name="clauseTitle"
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        />
        <label className="flex flex-col gap-1.5">
          <span className="text-body-sm font-semibold">{m.clause_body()}</span>
          <textarea
            rows={3}
            value={draft.body}
            onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            className="rounded-control border border-rule-strong bg-paper px-3 py-2"
          />
        </label>
        <label className="flex items-center gap-2 text-body-sm">
          <input
            type="checkbox"
            checked={draft.enabledByDefault}
            onChange={(e) => setDraft({ ...draft, enabledByDefault: e.target.checked })}
          />
          {m.clause_default()}
        </label>
        <Button type="submit" variant="secondary">
          {m.clause_add()}
        </Button>
      </form>
    </section>
  );
}

function Numbering({
  rows,
  onNotice,
}: {
  rows: Presentation['numbering'];
  onNotice: (n: { tone: 'error' | 'success'; text: string }) => void;
}) {
  const router = useRouter();
  const [values, setValues] = useState(rows);
  return (
    <section className="flex flex-col gap-4 px-4 pb-8">
      <SectionTitle>{m.numbering_title()}</SectionTitle>
      <p className="text-body-sm text-bark">{m.numbering_intro()}</p>
      {values.map((row, index) => {
        const update = (patch: Partial<typeof row>) =>
          setValues(values.map((value, i) => (i === index ? { ...value, ...patch } : value)));
        return (
          <form
            key={row.type}
            className="flex flex-col gap-3 border border-rule bg-paper p-3"
            onSubmit={(event) => {
              event.preventDefault();
              void saveNumbering({
                data: {
                  type: row.type,
                  prefix: row.prefix,
                  separator: row.separator,
                  cadence: row.cadence,
                  width: row.width,
                },
              }).then(async (result) => {
                if (!result.ok) return onNotice({ tone: 'error', text: m.numbering_refused() });
                onNotice({ tone: 'success', text: m.numbering_saved() });
                await router.invalidate();
              });
            }}
          >
            <p className="font-semibold">
              {typeLabel(row.type)} · <span className="font-number">{row.example}</span>
            </p>
            <div className="grid grid-cols-2 gap-2">
              <TextField
                label={m.numbering_prefix()}
                name={`prefix-${row.type}`}
                value={row.prefix}
                onChange={(e) => update({ prefix: e.target.value })}
              />
              <TextField
                label={m.numbering_width()}
                name={`width-${row.type}`}
                inputMode="decimal"
                value={String(row.width)}
                onChange={(e) => update({ width: Number(e.target.value) || 1 })}
              />
            </div>
            <label className="flex items-center gap-2 text-body-sm">
              <input
                type="checkbox"
                checked={row.cadence === 'annual'}
                onChange={(e) => update({ cadence: e.target.checked ? 'annual' : 'continuous' })}
              />
              {m.numbering_annual()}
            </label>
            <Button type="submit" variant="secondary">
              {m.numbering_save()}
            </Button>
          </form>
        );
      })}
    </section>
  );
}
