-- CLEAN INSTALL
-- Running this file deletes all existing consultation booking data and settings.
drop table if exists public.consultation_bookings cascade;
drop table if exists public.booking_settings cascade;

create extension if not exists pgcrypto;

create table if not exists public.booking_settings (
  id boolean primary key default true check (id),
  available_weekdays smallint[] not null default array[1, 2, 3, 4, 5],
  minimum_notice_days integer not null default 1 check (minimum_notice_days >= 0),
  booking_window_days integer not null default 30 check (booking_window_days between 1 and 180),
  timezone text not null default 'Asia/Singapore'
);

insert into public.booking_settings (id)
values (true)
on conflict (id) do nothing;

create table if not exists public.consultation_bookings (
  id uuid primary key default gen_random_uuid(),
  booking_date date not null,
  slot_key text not null check (slot_key in ('08-10', '12-14', '14-16', '20-22')),
  start_time time not null,
  end_time time not null,
  client_name text not null check (char_length(client_name) between 2 and 100),
  contact text not null check (char_length(contact) between 3 and 100),
  notes text check (notes is null or char_length(notes) <= 1000),
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled', 'completed', 'no-show')),
  notion_page_id text,
  notion_sync_status text not null default 'pending' check (notion_sync_status in ('pending', 'synced', 'failed')),
  notion_sync_error text,
  created_at timestamptz not null default now()
);

create unique index if not exists consultation_bookings_active_slot_idx
on public.consultation_bookings (booking_date, slot_key)
where status = 'confirmed';

alter table public.booking_settings enable row level security;
alter table public.consultation_bookings enable row level security;

revoke all on public.booking_settings from anon, authenticated;
revoke all on public.consultation_bookings from anon, authenticated;

create or replace function public.get_booking_availability(
  requested_start date,
  requested_end date
)
returns table (
  booking_date date,
  slot_key text,
  start_time time,
  end_time time,
  is_available boolean
)
language sql
security definer
set search_path = public
as $$
  with settings as (
    select *, (now() at time zone timezone)::date as today
    from public.booking_settings where id = true
  ),
  dates as (
    select day::date as booking_date
    from settings,
      generate_series(
        greatest(requested_start, today + minimum_notice_days),
        least(requested_end, today + booking_window_days),
        interval '1 day'
      ) day
    where extract(isodow from day)::smallint = any(available_weekdays)
  ),
  slots(slot_key, start_time, end_time) as (
    values
      ('08-10'::text, '08:00'::time, '10:00'::time),
      ('12-14'::text, '12:00'::time, '14:00'::time),
      ('14-16'::text, '14:00'::time, '16:00'::time),
      ('20-22'::text, '20:00'::time, '22:00'::time)
  )
  select
    dates.booking_date,
    slots.slot_key,
    slots.start_time,
    slots.end_time,
    bookings.id is null as is_available
  from dates
  cross join slots
  left join public.consultation_bookings bookings
    on bookings.booking_date = dates.booking_date
    and bookings.slot_key = slots.slot_key
    and bookings.status = 'confirmed'
  order by dates.booking_date, slots.start_time;
$$;

create or replace function public.create_consultation_booking(
  requested_date date,
  requested_slot text,
  requested_name text,
  requested_contact text,
  requested_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  settings public.booking_settings%rowtype;
  selected_start time;
  selected_end time;
  booking_id uuid;
  local_today date;
begin
  select * into settings from public.booking_settings where id = true;
  local_today := (now() at time zone settings.timezone)::date;

  if requested_date < local_today + settings.minimum_notice_days
    or requested_date > local_today + settings.booking_window_days then
    raise exception 'Date is outside the booking window';
  end if;

  if not (extract(isodow from requested_date)::smallint = any(settings.available_weekdays)) then
    raise exception 'Date is not available';
  end if;

  select slot_start, slot_end into selected_start, selected_end
  from (values
    ('08-10'::text, '08:00'::time, '10:00'::time),
    ('12-14'::text, '12:00'::time, '14:00'::time),
    ('14-16'::text, '14:00'::time, '16:00'::time),
    ('20-22'::text, '20:00'::time, '22:00'::time)
  ) as slots(slot_key, slot_start, slot_end)
  where slot_key = requested_slot;

  if selected_start is null then
    raise exception 'Invalid time slot';
  end if;

  if char_length(trim(requested_name)) < 2
    or char_length(trim(requested_contact)) < 3 then
    raise exception 'Invalid booking details';
  end if;

  insert into public.consultation_bookings (
    booking_date, slot_key, start_time, end_time, client_name,
    contact, notes
  ) values (
    requested_date, requested_slot, selected_start, selected_end,
    trim(requested_name), trim(requested_contact), nullif(trim(requested_notes), '')
  )
  returning id into booking_id;

  return booking_id;
exception
  when unique_violation then
    raise exception 'This time slot has just been booked';
end;
$$;

revoke all on function public.get_booking_availability(date, date) from public;
revoke all on function public.create_consultation_booking(date, text, text, text, text) from public;

grant execute on function public.get_booking_availability(date, date) to anon, authenticated;
grant execute on function public.create_consultation_booking(date, text, text, text, text) to anon, authenticated;
