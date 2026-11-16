# Changelog

Phase-by-phase progress. Newest first.

---

## 2.0.0 — Next.js migration and two-role rework

The project was a Vite SPA where patients had no account: each one was
identified by an unguessable code in a URL (`/track/<code>`). The brief asked
for a Next.js app with **separate patient and caretaker logins**, so this is a
reworking of the model rather than a port.

### Phase 1 — Next.js project structure · `chore: initialize nextjs project structure`

- Vite SPA replaced with Next.js 15 (App Router) + TypeScript.
- Tailwind CSS 4 via `@tailwindcss/postcss`; `eslint-config-next` flat config.
- Design system rebuilt dark-only on a single neon-lime accent, per the brief's
  visual direction: an "ink" neutral ramp, an "acid" accent, and three signal
  colours mapped to alert severity. Panels, pill navigation, fields and badges
  are component classes; variants compose in markup, because Tailwind 4 resolves
  `@apply` against generated utilities only and silently drops an `@apply` of
  another component class.
- Client foundation: typed fetch wrapper, one function per API route, IndexedDB
  offline queue with an in-memory fallback, geodesy helpers, and the Auth /
  Socket / Toast providers.
- `useGeolocation` polls `getCurrentPosition` on the upload cadence instead of
  holding a `watchPosition`. Uploads are three minutes apart and only the server
  evaluates geofences, so a persistent watch would keep the GPS chipset awake to
  produce readings nothing consumes.

### Phase 2 — Dual-role authentication · `refactor(backend): two credentialled login roles`

- `Patient` gains `patientCode` (a readable login id), optional email/phone as
  alternative identifiers, and a bcrypt password. Patients are accounts now.
- Renames, with explicit collection names so the stored names match the brief:
  `User → Caretaker` (`caretakers`), `Geofence → SafeZone` (`safeZones`),
  `Session → AuthSession` (`authSessions`), plus a new `TrackingSession`
  (`trackingSessions`).
- `AuthSession` and `TrackingSession` are kept separate: the first answers "may
  this token still act?", the second "was the phone reporting at 14:00?".
  Merging them would leave a caretaker unable to tell a revoked session from a
  flat battery when reading a gap in the history.
- Safe and danger zones share one schema factory and are both scoped to a
  patient. Danger zones used to be caretaker-scoped with an optional patient
  filter, which meant one patient's level crossing was evaluated against a
  patient living somewhere else.
- JWTs carry a `role` claim; guards are explicit per route
  (`requireCaretaker` / `requirePatient`). There is no "any valid token" guard on
  a route that touches patient data.
- Cadence moved from 5 s to the required 3 minutes. Offline threshold set to 7
  minutes — a little over two cycles, because one missed upload is routine and
  alerting on it trains the caretaker to ignore the alert.

### Phase 3 — Location, zone and alert APIs · `feat(backend): rework APIs to the new contract`

- Endpoints match the brief: `/auth/{patient,caretaker}/login`,
  `/location/{update,latest/:id,history/:id}`, `/zones/safe`, `/zones/danger`,
  `/alerts/:patientId`, `/alerts/:id/{read,resolved}`.
- No write endpoint accepts a patient id — the patient *is* the credential, so a
  device cannot post a fix attributed to someone else. Ownership failures answer
  404 rather than 403, so ids cannot be enumerated by comparing responses.
- `/location/update` takes an array, so one live fix and a drained offline queue
  share a code path. The response echoes the server's zone verdict so the patient
  screen can say "at home" without doing any geofencing itself.
- Device-reportable alerts are allow-listed. Without that, a device could post a
  fabricated zone breach for its own patient.
- Geofence engine now evaluates against the nearest safe zone by **edge**
  distance, since a large zone 400 m away can contain the patient while a small
  one 50 m away does not. Accuracy-scaled hysteresis and transition-only
  alerting retained. Added `DANGER_ZONE_EXIT`: a caretaker who saw the entry
  alert needs the matching all-clear.
- Sockets authenticate both roles by JWT and re-check session revocation in the
  handshake, because a socket outlives the request that opened it.
- Analytics layer dropped (charts are out of scope) in favour of one dashboard
  summary. Seeder rewritten; it derives its alerts by replaying the generated
  track, so the seeded feed is consistent with the seeded history.

### Phase 4 — Bug fixes from the API test suite · `fix(backend): partial indexes and bodyless PUTs`

Both were found by the 91-assertion API suite, and both broke ordinary use.

- Creating a second patient with no email failed on `email: null`. The index was
  *sparse*, but sparse skips documents where the field is **absent** and these
  default to null — the field is present, so two nulls still collide. Replaced
  with partial indexes filtered on `$type: 'string'`.
- Every route with an entirely optional body answered 400 to a bodyless request.
  Express 5 leaves `req.body` as `undefined` where Express 4 left `{}`, making
  `PUT /patients/:id/password` and `PUT /alerts/:id/resolved` unusable without a
  dummy `{}`. The validator now coerces a missing body.

### Phase 5 — Patient device · `feat(frontend): patient auth and GPS tracking flow`

- `/patient/login` with one identifier field, larger type and larger controls:
  it is used on a phone, possibly outdoors, by someone with dementia.
- `/patient/dashboard` is the entire patient app — one screen answering only the
  questions a patient or carer would ask aloud. Tracking status, GPS, internet,
  last report, battery, SOS, sign out. Nothing to configure or accidentally
  switch off.
- `useTracking` captures and uploads every three minutes, queues to IndexedDB on
  transport failure, and drains the queue oldest-first in a single request —
  chronological order matters because the server replays fixes through the
  geofence engine in sequence.
- A **failed upload**, not `navigator.onLine`, is what marks the device offline:
  that flag only reports whether the OS has a network interface, so a phone on
  captive-portal wifi reports itself online while every request fails.
- The device reports `INTERNET_RESTORED` but never `INTERNET_DISCONNECTED` — a
  device with no connection cannot report that it has no connection. The server's
  presence sweep notices the silence instead.
- SOS is press-and-hold for 1.5 s with a rising fill. A tap would fire constantly
  from a phone in a pocket. Keyboard users get an immediate fire on Enter/Space,
  since holding a key is not a gesture assistive technology performs reliably.

### Phase 6 — Caretaker dashboard, map, zones, history, alerts · `feat(frontend): caretaker dashboard and live map`

- Shell with pill navigation in a `(dash)` route group, so the sign-in screens
  under the same path do not inherit the chrome. Mobile gets a drawer.
- `PatientsProvider` holds the patient list and the current selection, and
  merges `location:update` / `presence:update` payloads **in place** rather than
  refetching. The first version of this app refetched per event and generated
  enough traffic from an idle dashboard to trip its own rate limiter.
- Live map: Leaflet via `next/dynamic` with `ssr: false` (it touches `window` at
  module scope). Safe zones in lime, danger zones dashed in red, an accuracy
  halo, a movement trail, and a `divIcon` marker — which also avoids Leaflet's
  default icon resolving its PNGs relative to the stylesheet.
- The map re-fits only when its `fitKey` changes, never per fix, so it does not
  yank the view away from a caretaker who has panned somewhere.
- Zones page: click-to-place centre, radius slider, per-kind minimum radius.
  Safe zones cannot go below 20 m because consumer GPS drifts by 10–20 m and a
  tighter zone raises exit alerts while the patient sits indoors.
- History: date picker, distance, estimated time outside the safe zone, a sparse
  timeline of zone changes, and route playback. The timeline lists transitions
  rather than all ~260 daily fixes, which would be a wall of identical rows.
- Alerts: paginated feed with scope, severity and unresolved filters, plus
  acknowledge and resolve.
- Patients page, which is where device credentials are minted. The one-time
  password appears in its own dialog, because that is the only moment it exists
  in readable form.
- Every alert also surfaces as a toast wherever the caretaker is; critical ones
  stay until dismissed.

### Phase 7 — Documentation · `docs: add project documentation`

- `README.md` rewritten.
- `docs/architecture.md`, `docs/api.md`, `docs/deployment.md`,
  `docs/troubleshooting.md`, and this changelog.

### Verification

Three independent layers, all green:

| Suite | Assertions | Covers |
|---|---|---|
| API | 91 | Every endpoint, both roles, role boundaries, geofence transitions, offline replay, cooldown, SOS, revocation |
| Browser | 87 | Real Chrome against the running stack: both logins, all six caretaker pages, Leaflet, zone CRUD, route playback, responsive layout, mocked-GPS patient device, end-to-end geofence exit, SOS |

Four genuine bugs were found and fixed by these: the two in Phase 4, plus a
`Modal` whose Escape key never fired when focus sat on `body`, and the
rate-limiting feedback loop described in Phase 6.

---

## 1.0.0 — Vite prototype

Superseded by 2.0.0. Retained in git history.

- Express + Socket.IO + MongoDB backend with the geofence engine, alert
  pipeline and presence sweep that 2.0.0 still uses.
- React 19 SPA on Vite with React Router, a light/dark design system, and
  Recharts analytics.
- Patients had no login: each had a `trackingCode` acting as a bearer credential
  in a URL. A 5-second upload cadence.
