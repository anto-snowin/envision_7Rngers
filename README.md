# Sentinel

**Real-time GPS tracking and intelligent geofencing for dementia care.**

A web platform that turns the patient's own phone into a tracker and the
caretaker's screen into a live map. The patient signs in on a mobile browser and
their location is reported automatically; the caretaker watches it on a map,
draws safe and danger zones, and is alerted the moment a boundary is crossed.

No app store, no dedicated hardware, no preset coordinates. Just two websites
and a phone's GPS.

---

## Contents

- [What it does](#what-it-does)
- [Tech stack](#tech-stack)
- [Quick start](#quick-start)
- [How it works](#how-it-works)
- [Project layout](#project-layout)
- [Design](#design)
- [Documentation](#documentation)
- [Testing](#testing)
- [Limitations](#limitations)

---

## What it does

### Two separate logins

| | Patient | Caretaker |
|---|---|---|
| Signs in with | a patient code, email or phone + password | email + password |
| Sees | one screen | a six-page dashboard |
| Can | share location, press SOS | everything about their own patients |

The roles are enforced at every route. A patient token authorises writing that
one patient's location and reading that one patient's status — nothing else. No
write endpoint accepts a patient id at all, because the patient *is* the
credential.

### Patient device — `/patient/dashboard`

One screen, deliberately. It is used on a phone, possibly outdoors, by someone
with dementia, so it answers only the questions a patient or carer would ask
aloud:

- **Am I being tracked?** A plain-language banner, not a status code.
- **Does the phone know where I am?** GPS state with coordinates and accuracy.
- **Is there internet?** And if not, how many locations are waiting to send.
- **When did it last report?** Relative time, kept honest by a ticking clock.
- **Battery**, so a flat phone is not a silent failure.
- **A large press-and-hold SOS button.**
- **Sign out.**

Nothing to configure, no navigation, nothing to switch off by accident. Location
uploads every **3 minutes** while the page is open. Lose connectivity and fixes
are stored in IndexedDB and uploaded automatically on reconnect.

### Caretaker dashboard — `/caretaker/*`

| Page | What it is for |
|---|---|
| **Overview** | Counters, every patient's live state, what needs attention |
| **Live map** | Current position, safe/danger zone overlays, accuracy halo, movement trail |
| **Zones** | Create and edit circular safe and danger zones by tapping the map |
| **History** | A chosen day's route with distance, time outside the safe zone, a timeline and playback |
| **Alerts** | Paginated feed, filterable by patient, severity and unresolved, with acknowledge and resolve |
| **Patients** | Add, edit and remove patients; mint and reset device logins |

Everything updates over Socket.IO. No refresh button, anywhere.

### Geofencing

Circular zones, scoped to one patient:

- **Safe zones** — normally home. Leaving raises a `SAFE_ZONE_EXIT` alert.
  Minimum radius 20 m.
- **Danger zones** — railway, water, forest, highway, construction, industrial.
  Entering raises a critical `DANGER_ZONE_ENTRY`. Minimum radius 10 m.

Evaluation is **server-side only**. The device's opinion about which zone it is
in is never trusted, because the device is the thing an attacker or a confused
browser controls.

Three details make it behave sensibly in the real world:

- **Hysteresis.** Leaving requires crossing the radius *plus* a buffer derived
  from the fix's own GPS accuracy (10–60 m); returning requires only the radius.
  Otherwise a patient standing on the boundary flips state with every noisy fix.
- **Transition-only alerting.** "Left the safe zone" fires once on the crossing,
  not once per fix for as long as they stay out.
- **Cooldown.** Identical alerts within two minutes are suppressed — except SOS,
  which is never suppressed.

### Alerts

`SOS` · `DANGER_ZONE_ENTRY` · `DANGER_ZONE_EXIT` · `SAFE_ZONE_EXIT` ·
`SAFE_ZONE_RETURN` · `PATIENT_OFFLINE` · `LOW_BATTERY` · `GPS_UNAVAILABLE` ·
`INTERNET_RESTORED` · `TRACKING_STOPPED`

Each carries a severity that drives colour and urgency. Critical alerts raise a
toast that stays until dismissed, wherever the caretaker happens to be.

---

## Tech stack

**Frontend** — Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS 4,
React Leaflet 5 + OpenStreetMap, Socket.IO client.

**Backend** — Node.js, Express 5, Socket.IO, Mongoose 9, Zod 4, JWT (bcrypt,
12 rounds), Helmet, CORS, express-rate-limit.

**Database** — MongoDB Atlas, eight collections.

**Deployment** — frontend on Vercel, backend on Render, database on Atlas.

The API is a separate Express process rather than Next.js API routes because
Socket.IO needs a long-lived process holding open connections, which serverless
functions do not provide.

---

## Quick start

Needs Node 18+ and MongoDB (local or Atlas).

```bash
git clone https://github.com/anto-snowin/envision_7Rngers.git
cd envision_7Rngers
```

**Backend**

```bash
cd backend
npm install
cp .env.example .env     # set MONGODB_URI and JWT_SECRET
npm run seed             # demo caretaker, 3 patients, 3 days of history
npm run dev              # :5000
```

**Frontend** (new terminal)

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev              # :3000
```

Set `CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000` in
`backend/.env`, or the browser blocks every response.

### Demo logins

The seeder prints these:

```
Caretaker  →  caretaker@demo.com / Demo1234

Patient devices (same password for all three)
  Harold Whitfield   PT-HRLD-2K7M   / Device1234
  Margaret Osei      PT-MRGT-4N9P   / Device1234
  Arun Mehta         PT-ARUN-6Q3T   / Device1234
```

Open `http://localhost:3000/caretaker/login` on a desktop and
`http://localhost:3000/patient/login` in a phone-sized window, sign in as both,
and watch one drive the other.

To fake GPS on a laptop: Chrome DevTools → three-dot menu → **Sensors** → custom
location. Device mode alone does not do it.

Full environment reference and production deployment:
[`docs/deployment.md`](docs/deployment.md).

---

## How it works

```
┌──────────────────┐                      ┌──────────────────┐
│  Patient phone   │                      │ Caretaker screen │
│  mobile browser  │                      │ phone or desktop │
└────────┬─────────┘                      └────────┬─────────┘
         │  every 3 min:                           │  live:
         │  POST /api/location/update              │  socket events
         │  (queued fixes first, oldest first)     │  REST reads
         └──────────────────┬──────────────────────┘
                            ▼
              ┌──────────────────────────────┐
              │   Express 5 + Socket.IO      │
              │                              │
              │  validate → geofence engine  │
              │  → persist → cache liveStatus│
              │  → broadcast                 │
              └──────────────┬───────────────┘
                             ▼
                   ┌──────────────────┐
                   │  MongoDB Atlas   │
                   └──────────────────┘
```

Every fix runs the same pipeline: validate, evaluate zones (raising alerts only
for genuine state transitions), persist, refresh the denormalised `liveStatus`
snapshot the dashboard reads, broadcast over Socket.IO.

A few decisions that are not obvious from the code:

- **The device polls, it does not watch.** Uploads are three minutes apart and
  only the server evaluates geofences, so a persistent `watchPosition` would
  hold the GPS radio on for ~180 seconds of every 180 to produce readings
  nothing consumes. On the phone of someone who may not notice a flat battery,
  that trade is not worth making.
- **A failed upload is what means "offline"**, not `navigator.onLine` — that
  flag only reports whether the OS has a network interface, so a phone on
  captive-portal wifi reports itself online while every request fails.
- **The device never reports its own disconnection.** It reports
  `INTERNET_RESTORED` when it returns; the server's presence sweep notices the
  silence. A device with no connection cannot tell anyone it has no connection.
- **The dashboard merges socket payloads rather than refetching.** The first
  version refetched on every `location:update` and generated enough traffic from
  a completely idle dashboard to trip the API's own rate limiter.

[`docs/architecture.md`](docs/architecture.md) has the full picture.

---

## Project layout

```
envision_7Rngers/
├── backend/
│   └── src/
│       ├── config/        validated env (fails fast), db connection
│       ├── models/        8 Mongoose models + a shared zone schema factory
│       ├── services/      the logic: geofence, location, alert, presence,
│       │                  session, dashboard
│       ├── controllers/   HTTP shape only, no domain logic
│       ├── routes/        URL → guard → validator → controller
│       ├── middleware/    auth, validate, rateLimit, error
│       ├── validators/    Zod schemas
│       ├── sockets/       io setup + emitter registry (avoids a cycle)
│       ├── utils/         geo, jwt, tokens, response envelope, errors, logger
│       └── jobs/seed.js   demo data
│
├── frontend/
│   └── src/
│       ├── app/
│       │   ├── page.tsx              landing
│       │   ├── patient/              login + the whole patient app
│       │   └── caretaker/
│       │       ├── login, register
│       │       └── (dash)/           route group with the shell
│       │           dashboard · map · zones · history · alerts · patients
│       ├── components/   ui · map · patient · caretaker · auth
│       ├── hooks/        useApi · useGeolocation · useDeviceStatus · useTracking
│       ├── providers/    Auth · Socket · Toast · Patients
│       └── lib/          api · endpoints · types · constants · geo · format · queue
│
└── docs/
    ├── architecture.md
    ├── api.md
    ├── deployment.md
    └── troubleshooting.md
```

`backend/src/utils/constants.js` and `frontend/src/lib/constants.ts` are
mirrors. Alert types and socket event names must match exactly — changing one
means changing the other.

### Database collections

`caretakers` · `patients` · `locations` · `alerts` · `safeZones` ·
`dangerZones` · `authSessions` · `trackingSessions`

`authSessions` and `trackingSessions` are deliberately separate: one answers
"may this token still act?", the other "was the phone reporting at 14:00?".
Merging them would leave a caretaker unable to tell a revoked session from a flat
battery when reading a gap in the history.

---

## Design

Dark-only, by decision rather than omission: caretakers check this at night and
patients hold it outdoors. The palette is one near-black ground, a single
high-energy lime accent, and three signal colours mapped to alert severity.

- Editorial display type (Figtree) at heavy weights and tight tracking; Inter
  for UI text; JetBrains Mono with tabular figures for all telemetry, so
  coordinates and timestamps do not jitter as they update.
- Pill navigation, hairline-lit glass panels, generous spacing.
- OpenStreetMap raster tiles are inverted and desaturated into a dark basemap,
  so the lime accent stays the brightest thing on screen.
- State is never carried by colour alone. Status tiles pair a coloured dot with
  a worded value, presence dots carry a `title` and screen-reader text, and
  alert severity appears as a labelled badge.
- Dialogs implement the accessibility basics by hand: Escape to close (bound at
  the document, so it works wherever focus sits), a focus trap, focus restored on
  close, scroll locked without the page shifting.
- `prefers-reduced-motion` disables the pulse and SOS animations.

---

## Documentation

| Document | Contents |
|---|---|
| [`docs/architecture.md`](docs/architecture.md) | System flow, roles, data model, the tracking loop, the geofence engine, real-time design, framework-version landmines |
| [`docs/api.md`](docs/api.md) | Every endpoint with request and response examples, socket events, alert types |
| [`docs/deployment.md`](docs/deployment.md) | Environment variables, local setup, Atlas, Render, Vercel, deploy order, verification |
| [`docs/troubleshooting.md`](docs/troubleshooting.md) | Problems actually encountered, with causes |
| [`CHANGELOG.md`](CHANGELOG.md) | Phase-by-phase progress |

---

## Testing

Two verification layers, both run against the real stack rather than mocks.

| Suite | Assertions | Covers |
|---|---|---|
| API | 91 | Every endpoint, both roles, role boundaries, geofence transitions and hysteresis, offline batch replay, alert cooldown, SOS without a fix, session revocation |
| Browser | 87 | Real Chrome: both sign-ins, all six caretaker pages, Leaflet and tiles, zone create/delete, route playback, 390 px layout, patient device with mocked GPS, end-to-end geofence exit, press-and-hold SOS |

Static checks:

```bash
cd backend  && npm run lint
cd frontend && npm run lint && npm run typecheck && npm run build
```

The tests found four real bugs that would otherwise have shipped: a sparse index
that rejected the second patient without an email; every optional-body `PUT`
returning 400 under Express 5; a dialog whose Escape key never fired when focus
sat on `body`; and a socket-driven refetch loop that made an idle dashboard
exhaust its own rate limit.

---

## Limitations

Worth being explicit about, because some of these matter clinically.

- **Tracking only runs while the page is open.** A browser cannot track in the
  background. The app takes a screen wake lock, but that is Chromium-only and is
  revoked when the tab is backgrounded. This is the fundamental constraint of a
  web-only approach, and it is why the system alerts on silence rather than
  assuming safety.
- **Three-minute resolution.** A patient can cover a few hundred metres between
  fixes. The interval is a battery trade-off, configurable via
  `LOCATION_INTERVAL_MS`.
- **Time outside the safe zone is an estimate** — outside-fixes times cadence. A
  phone that was off contributes nothing, so the figure is a lower bound.
- **Battery is Chromium-only.** Firefox and Safari do not implement the Battery
  Status API; the UI says so rather than showing a blank.
- **Zones are circles.** No polygons.
- **No push notifications.** Alerts require the dashboard to be open. Real
  deployment would want web push or SMS.
- **Render's free tier idles.** Queued fixes survive, but the dashboard goes
  stale and offline alerts are delayed. See `docs/deployment.md`.

**This is a prototype built for a dementia-care monitoring project. It is not a
medical device and must not be relied on as the only means of keeping someone
safe.**

---

## Licence

MIT
