# Shaun Sevilla — Personal Website

A static personal portfolio hosted with GitHub Pages. The site presents Shaun's
software-development work, financial-advisory practice, fitness interests,
education, leadership experience, and contact information.

## Pages

- `index.html` — homepage and overview
- `Pages/software-development.html` — capabilities, Telegram bot, and live GitHub preview
- `Pages/financial-advisory.html` — advisory approach and consultation booking
- `Pages/sg-money-guide.html` — Singapore money fundamentals and official resources
- `Pages/fitness-sports.html` — training and sports background
- `Pages/contact.html` — email and social links
- `Pages/booking.html` — live Supabase consultation booking

## Shared files

- `css/style.css` — site-wide theme, layout, components, and responsive styles
- `js/layout.js` — shared navigation and footer
- `js/main.js` — mobile navigation behavior
- `js/software-github.js` — GitHub profile and repository preview
- `js/booking.js` — availability, booking form, prefilled notes and calendar links
- `js/calculator-ux.js` — calculator deep links (`#hdb`, `#cpf`, `#vehicle`, `#compound`), remembered inputs, and the "Discuss this with Shaun" handoff to booking
- `supabase/migrations/001_create_consultation_bookings.sql` — clean booking database installation
- `supabase/migrations/002_notify_telegram_on_booking.sql` — Telegram admin notification on new booking
- `supabase/migrations/003_restore_notion_sync_trigger.sql` — Notion booking sync trigger
- `supabase/functions/notify-telegram-booking/index.ts` — sends a Telegram message on new booking
- `supabase/functions/sync-booking-to-notion/index.ts` — one-way Notion booking synchronization

## Running locally

Serve the repository through a local HTTP server so browser requests behave like
they do on GitHub Pages:

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## External services

The site loads fonts and icons from external CDNs and retrieves live profile data
from GitHub. The GitHub section shows an error message if the service is
unavailable.
