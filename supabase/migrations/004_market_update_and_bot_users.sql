-- Market Update publishing (approve-in-Telegram flow) and bot lead tracking.
-- Additive only: creates new tables and functions, touches nothing existing.
--
-- Flow: the bot reads Shaun's Notion Market Update page, stores a 'pending'
-- snapshot here and asks him on Telegram. Only when he taps Publish does the
-- snapshot become 'published', which is the only thing the website and the
-- bot's /indicators screens ever show.

create table if not exists public.market_snapshots (
  id bigint generated always as identity primary key,
  status text not null default 'pending'
    check (status in ('pending', 'published', 'rejected', 'superseded')),
  content_hash text not null,
  as_of text,
  data jsonb not null,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create index if not exists market_snapshots_status_idx
on public.market_snapshots (status, id desc);

alter table public.market_snapshots enable row level security;
revoke all on public.market_snapshots from anon, authenticated;
grant all on public.market_snapshots to service_role;

-- What the website reads: the latest published snapshot, nothing else.
create or replace function public.get_published_market_update()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'as_of', as_of,
    'published_at', decided_at,
    'data', data
  )
  from public.market_snapshots
  where status = 'published'
  order by id desc
  limit 1;
$$;

revoke all on function public.get_published_market_update() from public;
grant execute on function public.get_published_market_update() to anon, authenticated, service_role;

-- Atomic publish, callable by the bot's service-role key only.
create or replace function public.publish_market_snapshot(snapshot_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.market_snapshots
  set status = 'published', decided_at = now()
  where id = snapshot_id and status = 'pending';

  if not found then
    raise exception 'Snapshot % is not pending', snapshot_id;
  end if;

  update public.market_snapshots
  set status = 'superseded'
  where status = 'published' and id <> snapshot_id;
end;
$$;

revoke all on function public.publish_market_snapshot(bigint) from public, anon, authenticated;
grant execute on function public.publish_market_snapshot(bigint) to service_role;

-- One row per Telegram user of the bot: where they came from, what they care
-- about, their last calculation (for the one-time follow-up) and opt-outs.
create table if not exists public.bot_users (
  telegram_id bigint primary key,
  username text,
  first_name text,
  ref_code text,
  topics text[] not null default '{}',
  last_calc_type text,
  last_calc_headline text,
  last_calc_at timestamptz,
  nudge_sent_at timestamptz,
  booked_at timestamptz,
  opted_out boolean not null default false,
  alerts_on boolean not null default false,
  blocked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bot_users_ref_idx on public.bot_users (ref_code);
create index if not exists bot_users_calc_idx on public.bot_users (last_calc_at);

alter table public.bot_users enable row level security;
revoke all on public.bot_users from anon, authenticated;
grant all on public.bot_users to service_role;
