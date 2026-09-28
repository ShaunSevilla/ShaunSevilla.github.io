-- Re-adds the Notion sync trigger (the function was never deleted, only its
-- trigger was, when the old Notion database was removed). Points at the
-- same edge function; only the Notion database on the other end is new, so
-- NOTION_DATA_SOURCE_ID needs updating to the new database's data source id.
-- Runs alongside notify-telegram-booking -- both fire independently on INSERT.
drop trigger if exists "sync-booking-to-notion" on public.consultation_bookings;

create trigger "sync-booking-to-notion"
after insert on public.consultation_bookings
for each row execute function supabase_functions.http_request(
  'https://rubfkxwhieqwqjeaoszi.supabase.co/functions/v1/sync-booking-to-notion',
  'POST',
  '{"Content-type":"application/json","x-webhook-secret":"85622deee0c29ddd76fda3d735864dd467023072adbd20647e1575d1c4b04b31"}',
  '{}',
  '5000'
);
