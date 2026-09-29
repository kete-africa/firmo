-- The @kete/sdk outbox (outboxMigrationSql): events written in the same transaction as the
-- change they announce, delivered to Kete Cockpit by the relay. Created with its RLS policy.
-- One block: the definer functions keep their bodies whole.
create table public.kete_outbox (
  event_id text primary key,
  organization_id text not null,
  envelope jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'delivered', 'refused')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  leased_until timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  settled_at timestamptz
);
create index kete_outbox_due on public.kete_outbox (next_attempt_at) where status = 'pending';

alter table public.kete_outbox enable row level security;
alter table public.kete_outbox force row level security;
create policy kete_outbox_organization on public.kete_outbox to firmo_app
  using (organization_id = current_setting('kete.organization_id', true))
  with check (organization_id = current_setting('kete.organization_id', true));
create policy kete_outbox_relay on public.kete_outbox to firmo_owner using (true) with check (true);
grant usage on schema public to firmo_app;
grant select, insert on public.kete_outbox to firmo_app;

create function public.kete_outbox_claim(batch_size integer, lease_seconds integer)
returns table (event_id text, envelope jsonb, attempts integer)
language sql security definer set search_path = public, pg_temp as $fn$
  update kete_outbox o
     set leased_until = now() + make_interval(secs => lease_seconds),
         attempts = o.attempts + 1
   where o.event_id in (
     select c.event_id from kete_outbox c
      where c.status = 'pending'
        and c.next_attempt_at <= now()
        and (c.leased_until is null or c.leased_until < now())
      order by c.next_attempt_at
      limit batch_size
      for update skip locked)
  returning o.event_id, o.envelope, o.attempts;
$fn$;

-- results: [{ "event_id", "outcome": "delivered" | "refused" | "retry", "reason", "delay_seconds" }]
create function public.kete_outbox_settle(results jsonb)
returns void
language sql security definer set search_path = public, pg_temp as $fn$
  update kete_outbox o
     set status = case r.outcome when 'retry' then 'pending' else r.outcome end,
         settled_at = case when r.outcome in ('delivered', 'refused') then now() end,
         last_error = r.reason,
         next_attempt_at = case when r.outcome = 'retry'
                                then now() + make_interval(secs => coalesce(r.delay_seconds, 5))
                                else o.next_attempt_at end,
         leased_until = null
    from jsonb_to_recordset(results) as r(event_id text, outcome text, reason text, delay_seconds integer)
   where o.event_id = r.event_id and o.status = 'pending';
$fn$;

create function public.kete_outbox_backlog()
returns table (pending bigint, oldest_pending_age_seconds integer)
language sql security definer set search_path = public, pg_temp as $fn$
  select count(*), extract(epoch from now() - min(created_at))::integer
    from kete_outbox where status = 'pending';
$fn$;

revoke all on function public.kete_outbox_claim(integer, integer) from public;
revoke all on function public.kete_outbox_settle(jsonb) from public;
revoke all on function public.kete_outbox_backlog() from public;
grant execute on function public.kete_outbox_claim(integer, integer) to firmo_app;
grant execute on function public.kete_outbox_settle(jsonb) to firmo_app;
grant execute on function public.kete_outbox_backlog() to firmo_app;
