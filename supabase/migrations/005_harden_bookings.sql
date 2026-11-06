-- Harden public booking (Nov 2026, before live streams).
-- 1. The old 7-argument booking function (email/phone/type) is no longer used
--    by the website: nobody outside can call it any more.
-- 2. The live function keeps its exact signature and behaviour, plus:
--    field length caps matching the form, at most 2 upcoming bookings per
--    contact, and at most 12 new bookings an hour site-wide, so nobody can
--    fill every slot with fake names.

revoke execute on function public.create_consultation_booking(date, text, text, text, text, text, text)
  from public, anon, authenticated;

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
set search_path to 'public'
as $$
declare
  settings public.booking_settings%rowtype;
  selected_start time;
  selected_end time;
  booking_id uuid;
  local_today date;
  clean_name text := trim(coalesce(requested_name, ''));
  clean_contact text := trim(coalesce(requested_contact, ''));
  clean_notes text := nullif(trim(coalesce(requested_notes, '')), '');
begin
  select * into settings from public.booking_settings where id = true;
  if not found then
    raise exception 'Booking is closed right now';
  end if;
  local_today := (now() at time zone settings.timezone)::date;

  if requested_date is null
    or requested_date < local_today + settings.minimum_notice_days
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

  if char_length(clean_name) not between 2 and 100
    or char_length(clean_contact) not between 3 and 100
    or char_length(coalesce(clean_notes, '')) > 1000 then
    raise exception 'Invalid booking details';
  end if;

  if (select count(*) from public.consultation_bookings
      where lower(contact) = lower(clean_contact)
        and status = 'confirmed'
        and booking_date >= local_today) >= 2 then
    raise exception 'You already have 2 upcoming bookings.';
  end if;

  if (select count(*) from public.consultation_bookings
      where created_at > now() - interval '1 hour') >= 12 then
    raise exception 'Lots of bookings came in this hour.';
  end if;

  insert into public.consultation_bookings (
    booking_date, slot_key, start_time, end_time, client_name, contact, notes
  ) values (
    requested_date, requested_slot, selected_start, selected_end,
    clean_name, clean_contact, clean_notes
  )
  returning id into booking_id;

  return booking_id;
exception
  when unique_violation then
    raise exception 'This time slot has just been booked';
end;
$$;
