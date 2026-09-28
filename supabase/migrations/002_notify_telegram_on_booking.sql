-- Replaces the old Notion sync webhook (function removed) with a Telegram
-- notification straight to the admin's Telegram, fired on every new
-- consultation booking made through the website.
drop trigger if exists "sync-booking-to-notion" on public.consultation_bookings;

create trigger "notify-telegram-booking"
after insert on public.consultation_bookings
for each row execute function supabase_functions.http_request(
  'https://rubfkxwhieqwqjeaoszi.supabase.co/functions/v1/notify-telegram-booking',
  'POST',
  '{"Content-type":"application/json"}',
  '{}',
  '5000'
);
