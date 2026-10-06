# YCH Clinic Booking

An open-source, mobile-friendly booking page for showing live class vacancies,
accepting patient applications, and preventing overlapping active bookings.

[View the public demo](https://ych-back-class-booking.tony1226.chatgpt.site/)

## What it does

- reads live availability from a public Google Sheet
- refreshes available slots every 15 seconds
- hides full or manually closed slots
- collects the patient's name, phone number, and PHYA number on the website
- allows only one active booking per PHYA number until the booked one-hour lesson ends
- writes accepted bookings into the existing Google Form response sheet
- works without visitor accounts or ChatGPT sign-in
- runs as a Next.js-compatible app on vinext and Cloudflare Workers

## How the booking flow works

1. Staff maintains class rows in the `課堂資料` sheet.
2. The app reads the sheet through Google's read-only Visualization API.
3. A visitor selects an available slot and completes the website booking form.
4. A private Google Apps Script endpoint checks for another active PHYA booking, checks capacity again, and writes an accepted booking into the form response sheet.
5. The form response sheet increases `Currently Booked` with its existing formula.
6. When `Spaces Remaining` becomes zero, the app stops accepting that slot.

No service-account credential or paid database is required. Google Apps Script
writes the response and the existing Google Sheets formulas update availability.

## Google Sheet setup

Create a tab named `課堂資料` with these columns in row 1:

| Column | Heading | Example |
| --- | --- | --- |
| A | Class Name | 背部運動班 |
| B | Date and Time | 2026年8月12日 星期三 10:00–11:00 |
| C | Max Capacity | 8 |
| D | Currently Booked | formula below |
| E | Spaces Remaining | formula below |
| F | Record ID | back-2026-08-12-1000 |
| G | Form Link | prefilled form formula below |

Connect the Google Form to a response tab in the same spreadsheet. The website
continues to use that response tab so existing formulas and records remain
compatible. If the
selected time is saved in column E of a response tab named `預約紀錄1`, use:

```gs
=COUNTIF('預約紀錄1'!$E$2:$E,B2)
```

If old and new form versions store the time in columns E and F, count both:

```gs
=COUNTIF('預約紀錄1'!$E$2:$E,B2)+COUNTIF('預約紀錄1'!$F$2:$F,B2)
```

For remaining spaces:

```gs
=MAX(0,C2-D2)
```

In Google Forms, choose **More → Get pre-filled link**, fill the time question
once, and copy the generated URL. Its query string contains an ID such as
`entry.273583068`. Build column G with that ID:

```gs
="https://docs.google.com/forms/d/e/YOUR_PUBLIC_FORM_ID/viewform?usp=pp_url&entry.YOUR_ENTRY_ID="&ENCODEURL(B2)
```

Share only the `課堂資料` sheet data publicly: the spreadsheet must be readable
by **Anyone with the link** for this credential-free approach. Never place names,
phone numbers, medical information, or form responses on that public tab.

To close a slot manually, set its remaining capacity to `0` (or clear its form
link). To reopen it, restore a positive remaining capacity and the form link.

## Run locally

Requirements: Node.js 22.13 or newer.

```bash
git clone https://github.com/tony20031226/ych-clinic-booking.git
cd ych-clinic-booking
npm install
cp .env.example .env.local
npm run dev
```

Put your spreadsheet ID, tab name, and deployed Apps Script web-app URL in
`.env.local`. The spreadsheet ID is the
text between `/d/` and `/edit` in its Google Sheets URL. The included defaults
power the read-only slot list. Copy `google-apps-script/Code.gs` into an Apps
Script project owned by the spreadsheet owner, deploy it as a web app that
executes as the owner, and keep its `/exec` URL private in
`BOOKING_SCRIPT_URL`.

Before publishing a fork, replace the demo branding and fallback Sheet ID in
`app/api/slots/route.ts`.

## Publish publicly

### Option A: ChatGPT Sites

Open the cloned folder in Codex, ask it to create or connect a new Site, then ask:

> Publish this Site and make access public for anyone on the internet.

The tracked `.openai/hosting.json` contains the demo project's identifier; it is
not a credential. Remove its `project_id` before connecting a fork to your own
Site so you do not target the demo project.

### Option B: Cloudflare Workers

Sign in to Cloudflare through Wrangler, create a production environment file,
and deploy:

```bash
npx wrangler login
cp .env.example .env.production.local
# Edit .env.production.local with your public Sheet ID and tab name.
npm run deploy:cloudflare
```

Wrangler prints the public `workers.dev` URL after a successful deployment. You
can attach a custom domain from the Worker settings in Cloudflare.

### Option C: Vercel

Import the GitHub repository into Vercel with the **Next.js** framework preset.
The included `vercel.json` automatically selects the standard Next.js build,
while the existing `npm run build` command remains available for Sites and
Cloudflare Workers.

## Commands

```bash
npm run dev               # local development
npm run build             # production build
npm run build:vercel      # Vercel-compatible Next.js build
npm test                  # build and verify server-rendered output
npm run lint              # lint source code
npm run deploy:cloudflare # build and deploy with Wrangler
```

## Security and booking limits

The Apps Script transaction uses `LockService` to recheck active PHYA bookings
and capacity immediately before writing a response. The Apps Script URL is a
private server-side setting and must not be exposed as a `NEXT_PUBLIC_` value.

## License

[MIT](LICENSE) — use, modify, and redistribute the project with attribution.
