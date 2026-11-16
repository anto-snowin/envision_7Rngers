# Architecture

How Sentinel is put together, and why. Read this before changing anything in
`backend/src/services` or the tracking loop — most of the non-obvious decisions
live there and each one is there for a reason.

---

## 1. The shape of the system

```
┌──────────────────────┐          ┌──────────────────────┐
│  Patient phone       │          │  Caretaker browser   │
│  (mobile browser)    │          │  (phone or desktop)  │
│                      │          │                      │
│  Next.js app         │          │  Next.js app         │
│  /patient/dashboard  │          │  /caretaker/*        │
└──────────┬───────────┘          └──────────┬───────────┘
           │                                 │
           │  REST: POST /api/location/update│  REST: reads
           │  Socket: heartbeat              │  Socket: live events
           │                                 │
           └───────────────┬─────────────────┘
                           ▼
              ┌────────────────────────────┐
              │  Express API + Socket.IO   │
              │                            │
              │  routes → controllers →    │
              │  services → models         │
              └─────────────┬──────────────┘
                            ▼
              ┌────────────────────────────┐
              │  MongoDB Atlas             │
              │  8 collections             │
              └────────────────────────────┘
```

Two deployables: a Next.js app on Vercel and an Express process on Render.

### Why not Next.js API routes?

The brief allowed either. Socket.IO needs a long-lived process holding open
connections, and Vercel's serverless functions do not provide one — each
invocation is independent and may be frozen between requests. Running the API as
a separate Express process on Render keeps the socket server, the presence sweep
timer, and the geofence engine in one place that is actually always running.

The cost is CORS configuration and two deploy targets. The alternative — a
third-party realtime service, or polling every few seconds from every dashboard
— is worse on both complexity and cost.

---

## 2. Two roles, two credentials

The system has exactly two kinds of account, and they are kept rigorously apart.

| | Patient | Caretaker |
|---|---|---|
| Signs in with | patient code, email or phone + password | email + password |
| Model | `Patient` | `Caretaker` |
| Can write | its own location, its own SOS, its own device events | nothing in the location path |
| Can read | its own status (`GET /api/location/me`) | everything belonging to its own patients |

`backend/src/middleware/auth.middleware.js` exposes `requireCaretaker`,
`requirePatient` and `requireAnyRole`. Every route names the guard it needs.
There is deliberately **no** middleware that means "any valid token" on a route
that touches patient data — that is precisely how a patient token ends up
granting dashboard access.

Two consequences worth internalising:

- **No write endpoint accepts a patient id.** `POST /api/location/update` acts
  on `req.patient`, which came from the token. A device physically cannot post a
  fix attributed to someone else.
- **Ownership failures answer 404, not 403.** `requirePatientOwnership` reports
  "Patient not found" both when the patient does not exist and when it belongs to
  another caretaker. Returning different statuses would let anyone enumerate
  patient ids by comparing responses.

### Session revocation

Every issued JWT carries a `sid` claim naming an `AuthSession` document. The auth
middleware checks that session on each request, so signing out invalidates the
token immediately rather than leaving it valid until it expires. The socket
handshake checks it too — a socket outlives the request that opened it, so
without that check a token revoked elsewhere would keep streaming a patient's
live position for as long as the tab stayed open.

---

## 3. Data model

Eight collections. Names match the brief exactly; the Mongoose models set them
explicitly rather than relying on pluralisation.

| Collection | Model | Purpose |
|---|---|---|
| `caretakers` | `Caretaker` | Caretaker accounts |
| `patients` | `Patient` | Patient accounts **and** the tracked subject, including a `liveStatus` cache |
| `locations` | `Location` | Every GPS fix |
| `alerts` | `Alert` | Append-only record of events |
| `safeZones` | `SafeZone` | Circular safe areas, per patient |
| `dangerZones` | `DangerZone` | Circular hazards, per patient |
| `authSessions` | `AuthSession` | Token validity, both roles, TTL-expired |
| `trackingSessions` | `TrackingSession` | One run of tracking on a device |

### Why `liveStatus` is denormalised onto `Patient`

The dashboard needs every patient's current position, battery, and zone state in
one query. Deriving that from `locations` would mean one sorted lookup per
patient on by far the largest collection. Instead the ingest pipeline writes a
snapshot onto the patient document, and the dashboard reads only `patients`.

`liveStatus.zoneState` and `liveStatus.activeDangerZones` are not merely a cache:
they are the **previous state** the geofence engine compares against to detect a
transition. That is why ingest saves the patient document even when nothing else
changed.

### Why `AuthSession` and `TrackingSession` are separate

They answer different questions:

- `AuthSession`: *may this token still act on behalf of this subject?*
- `TrackingSession`: *was the phone reporting between 14:00 and 16:00?*

One sign-in creates one of each. Merging them would leave a caretaker unable to
tell a revoked session from a flat battery when reading a gap in the history —
and that distinction is the whole point of recording the gap.

### Indexes

```js
locations:  { patient: 1, recordedAt: -1 }     // a patient's track over time
locations:  { caretaker: 1, recordedAt: -1 }   // roll-ups
alerts:     { caretaker: 1, createdAt: -1 }    // the alert feed
alerts:     { patient: 1, type: 1, createdAt: -1 }  // cooldown lookup
patients:   { caretaker: 1, createdAt: -1 }
patients:   { email: 1 } partial, unique on $type: 'string'
patients:   { phone: 1 } partial, unique on $type: 'string'
authSessions: { expiresAt: 1 } TTL
```

The partial indexes on `patients.email` / `patients.phone` are worth
understanding, because the obvious alternatives are both wrong. A plain unique
index rejects the second patient with no email. A **sparse** unique index does
not help either: sparse skips documents where the field is *absent*, and these
fields default to `null`, so the field is present and two nulls still collide. A
partial index filtered on `$type: 'string'` excludes null and missing alike.

---

## 4. The tracking loop

`frontend/src/hooks/useTracking.ts`.

```
┌─ every 3 minutes ───────────────────────────────────────────┐
│                                                             │
│  getCurrentPosition(highAccuracy)                           │
│          │                                                  │
│    ┌─────┴─────┐                                            │
│   fix       no fix                                          │
│    │             └─► POST /device-event GPS_UNAVAILABLE      │
│    │                 POST /ping  (still present!)           │
│    ▼                                                        │
│  POST /location/update  [ ...queued fixes, this fix ]       │
│    │                                                        │
│    ├─ 2xx ──► clear queue, show server's zone verdict       │
│    └─ network failure ──► IndexedDB queue, mark offline     │
└─────────────────────────────────────────────────────────────┘
```

### Polling, not `watchPosition`

A continuous `watchPosition` keeps the GPS chipset awake. Uploads are three
minutes apart and **only the server evaluates geofences**, so a persistent watch
would hold the radio on for ~180 seconds of every 180 to produce readings
nothing consumes. On the phone of someone who may not notice a flat battery,
that trade is not worth making. The hook therefore does a one-shot
`getCurrentPosition` per cycle, with `maximumAge: 0` — a stale cached fix is
worse than no fix when the entire question is where someone is *now*.

### A failed upload is what means "offline"

Not `navigator.onLine`. That flag only reports whether the OS has a network
interface, so a phone on captive-portal wifi reports itself online while every
request fails. The hook branches on `ApiError.status === 0` (transport failure)
and queues only then. A 4xx means the server looked at the fix and refused it;
storing that would mean retrying a rejection forever.

### The device never reports its own disconnection

It reports `INTERNET_RESTORED` when it comes back, never
`INTERNET_DISCONNECTED` — a device with no connection cannot tell anyone it has
no connection. The server's presence sweep is what notices the silence. Each
half of that story comes from the side that can actually observe it.

### Offline queue

`frontend/src/lib/queue.ts`, IndexedDB with an in-memory fallback.

IndexedDB rather than `localStorage` because a long stretch offline can
accumulate hundreds of fixes and `localStorage` is synchronous — writing on every
cycle would stutter the UI. The in-memory fallback keeps the device working in
private browsing or with site data blocked; fixes are then lost on reload, which
is strictly better than dropping them immediately.

Queued fixes are uploaded **oldest first, in one request**. Chronological order
is not cosmetic: the server replays them through the geofence engine in sequence,
so out-of-order delivery would produce nonsense zone transitions (an "entered
danger zone" after the "left danger zone" that followed it).

---

## 5. The geofence engine

`backend/src/services/geofence.service.js`. Runs on every ingested fix, server
side and only server side — the device's opinion about whether it is inside a
zone is never trusted, because the device is the thing an attacker or a confused
browser controls.

### Nearest zone by *edge*, not centre

A patient may have several safe zones (home, a day centre). They are safe if
inside **any** of them, so the engine evaluates against the nearest one —
measured by distance from the edge, not from the centre. A large zone 400 m away
can contain the patient while a small zone 50 m away does not.

### Hysteresis

```js
const isOutside = wasOutside
  ? beyondEdge > 0                 // returning needs only the radius
  : beyondEdge > buffer;           // leaving needs radius + buffer
```

`buffer` is derived from the fix's own reported accuracy, clamped to 10–60 m. A
patient standing on the boundary would otherwise flip between inside and outside
as GPS noise moves them a few metres, producing a stream of contradictory
alerts. Leaving is made harder than returning, so the system errs towards
believing someone is safe only when it is confident they are.

### Transition-only alerting

The previous `zoneState` is cached on the patient. "Left the safe zone" fires
once on the crossing, not once per fix for as long as they stay out. Entering
*and* leaving a danger zone both raise alerts — a caretaker who saw the entry
alert needs the matching all-clear, or they keep worrying about it.

### Cooldown

`alert.service.js` suppresses an identical alert for the same patient within
`ALERT_COOLDOWN_MS` (default 2 minutes). Transition detection is the primary
defence against repeats; this is the backstop for everything else, such as a
device reporting GPS trouble on every attempt. **SOS is exempt** — if the patient
presses it twice, the caretaker should see it twice.

### Danger zones outrank everything

If the patient is inside any danger zone, `zoneState` becomes `in_danger`
regardless of safe-zone membership. It is the most urgent fact about their
position and the UI should lead with it.

---

## 6. Presence

`backend/src/services/presence.service.js`.

A periodic sweep (every `PRESENCE_SWEEP_MS`, default 60 s) finds patients marked
online whose last fix is older than `OFFLINE_THRESHOLD_MS` (default 7 minutes),
flips them offline, and raises one `PATIENT_OFFLINE` alert each. A sweep rather
than a per-patient timer keeps this O(1) in timers no matter how many patients
exist.

Seven minutes is a little over two upload cycles. One missed upload is routine —
a tunnel, a lift, a slow fix — and alerting on it would train the caretaker to
ignore the alert.

The socket heartbeat (every 45 s from the device) exists so that a phone whose
GPS cannot get a lock still counts as present. A device with bad GPS is very
different from a device that has been switched off, and the caretaker needs to
be able to tell them apart.

---

## 7. Real-time

`backend/src/sockets/`.

Rooms: `caretaker:<id>` and `patient:<id>`. A caretaker socket joins its own
caretaker room on connect, and joins a patient room only after the server has
verified ownership — the subscription request carries an id, and the server
checks it rather than trusting it.

Services must not import the socket layer directly; that would create a cycle
(`server → sockets → services → sockets`). `sockets/emitter.js` is a tiny
registry: `server.js` registers the live `io` instance at boot and services emit
through the helpers. Before registration every call is a safe no-op, which also
keeps the services testable without a socket server.

| Event | Direction | Carries |
|---|---|---|
| `location:update` | server → client | full fix + zone verdict |
| `alert:new` | server → client | the serialised alert |
| `alert:updated` | server → client | the alert, or `{refetch:true}` after a bulk change |
| `presence:update` | server → client | online state and why |
| `zones:changed` | server → client | which patient, which kind, what happened |
| `patient:changed` | server → client | create/update/delete |
| `patient:heartbeat` | client → server | battery, charging, GPS permission |
| `patient:subscribe` / `unsubscribe` | client → server | a patient id, ownership-checked |

### The dashboard merges payloads instead of refetching

`frontend/src/providers/PatientsProvider.tsx` applies `location:update` and
`presence:update` straight into its cached patient list. This is not a
micro-optimisation. The first version of this app refetched on every
`location:update`, and with several patients reporting it generated enough
traffic from a completely idle dashboard to trip the API's own rate limiter. The
payload already carries everything a list row displays.

Only aggregates — the summary counters, the alert feed — genuinely need the
server to recount, and those refetches go through `useThrottledCallback`.

---

## 8. Request lifecycle

```
request
  │
  ├─ helmet, CORS (explicit origins + *.vercel.app previews)
  ├─ express.json({ limit: '256kb' })
  ├─ apiLimiter            (per IP, 2000 / 15 min)
  │
  ├─ route
  │    ├─ requireCaretaker | requirePatient | requireAnyRole
  │    ├─ ingestLimiter    (per authenticated patient, 30 / min)
  │    ├─ validate({ params, query, body })   ← Zod
  │    ├─ requirePatientOwnership
  │    └─ controller → service → model
  │
  └─ errorHandler
```

Guards run **before** `ingestLimiter` on the ingest routes, so the limiter can
key on the authenticated patient id rather than a spoofable body field. Several
patients behind one mobile-carrier NAT therefore do not starve each other.

Responses use one envelope:

```json
{ "success": true, "data": … , "meta": { … } }
{ "success": false, "error": { "message": "…", "status": 400, "details": { "fields": { … } } } }
```

`details.fields` is `{ fieldPath: message }` and is what the web client renders
as inline form errors.

---

## 9. Framework-version landmines

Each of these cost real debugging time. They are documented so nobody pays twice.

| Thing | Behaviour |
|---|---|
| **Express 5** | `req.body` is `undefined` when no body is sent, where Express 4 gave `{}`. The validator coerces it, or every optional-body `PUT` would answer 400. |
| **Express 5** | `req.query` is a getter — reassigning it silently fails. The validator writes through `Object.defineProperty`. |
| **Express 5** | A bare `'*'` is no longer a valid path (path-to-regexp v8). The 404 handler is a path-less `app.use`. |
| **Mongoose 9** | `async` pre-save hooks receive **no** `next` callback. Declaring one makes the hook hang. |
| **Zod 4** | Problems are on `error.issues`; the v3 `error.errors` alias is gone. |
| **Tailwind 4** | `@apply` resolves against generated utilities only. `@apply`-ing another `@layer components` class silently produces nothing — variants compose in markup instead (`class="btn btn-acid"`). |
| **TypeScript** | An `interface` gets no implicit index signature, so it is not assignable to `Record<string, unknown>`. Query-parameter shapes are `type` aliases. |
| **Leaflet** | Touches `window` at module scope, so the map must be `next/dynamic` with `ssr: false`. The patient marker is a `divIcon`, which also avoids the default icon's broken-PNG-path problem in bundlers. |

---

## 10. Directory map

```
backend/src/
  config/        env (validated once, fail fast), db connection
  models/        8 Mongoose models + zoneSchema factory
  services/      the actual logic: geofence, location, alert, presence,
                 session, dashboard
  controllers/   HTTP shape only; no domain logic
  routes/        URL → guard → validator → controller
  middleware/    auth, validate, rateLimit, error
  validators/    Zod schemas
  sockets/       io setup + emitter registry
  utils/         geo, jwt, tokens, response envelope, ApiError, logger
  jobs/seed.js   demo data

frontend/src/
  app/
    page.tsx                  landing
    patient/login             patient sign-in
    patient/dashboard         the entire patient app
    caretaker/login|register  caretaker auth
    caretaker/(dash)/         route group with the shell
      dashboard map zones history alerts patients
  components/
    ui/        Button, Field, Modal, Feedback, Icons
    map/       MapCanvas (Leaflet) + LiveMap (dynamic wrapper)
    patient/   StatusTile, SosButton
    caretaker/ StatTile, AlertRow, PresenceDot, PatientSwitcher
    auth/      AuthShell
  hooks/       useApi, useGeolocation, useDeviceStatus, useTracking
  providers/   Auth, Socket, Toast, Patients
  lib/         api, endpoints, types, constants, geo, format, queue, socket
```

The two `constants` files — `backend/src/utils/constants.js` and
`frontend/src/lib/constants.ts` — are mirrors. Alert types and socket event
names must match exactly; changing one means changing the other.
