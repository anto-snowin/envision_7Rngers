# Dementia Care Monitoring and Intelligent Geofencing System

A full-stack, entirely web-based system that helps caregivers keep elderly people with
dementia safe. The patient carries nothing but their own smartphone — they open a
link in the browser and their location is tracked. The caregiver watches a live
dashboard that raises an alert the moment the patient leaves a safe zone, walks into
a hazard, loses GPS, goes offline, runs low on battery, or presses SOS.

There is **no mobile app to install**. Both halves are websites: the patient portal is
a mobile web page, and the caretaker dashboard is a desktop-first admin interface.

---

## Table of contents

- [Why this design](#why-this-design)
- [Features](#features)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Seeding demo data](#seeding-demo-data)
- [How the two websites work](#how-the-two-websites-work)
- [The geofencing engine](#the-geofencing-engine)
- [Alert catalogue](#alert-catalogue)
- [API reference](#api-reference)
- [Real-time events](#real-time-events)
- [Data model](#data-model)
- [Security](#security)
- [Testing](#testing)
- [Deployment](#deployment)
- [Project status](#project-status)

---

## Why this design

A few decisions shape everything else, and they are worth stating up front.

**The patient never logs in.** Asking someone with moderate dementia to remember a
password defeats the purpose. Instead every patient gets an unguessable 12-character
tracking code (about 60 bits of entropy from a CSPRNG) which forms their personal
URL, `/track/ABCD2345EFGH`. The caregiver opens that link once on the patient's phone
and bookmarks it. The code is a bearer credential scoped to exactly one capability:
*write location data for this one patient*. It cannot read another patient's data and
it cannot touch anything belonging to a caregiver. If a link is shared with the wrong
person, the caregiver rotates the code and the old link dies instantly.

**Alerts fire on state transitions, not on conditions.** A patient standing 5 m
outside their safe zone would otherwise generate an alert every 5 seconds — 720 an
hour — and the caregiver would learn to ignore the dashboard. "Left the safe zone"
fires once, on the crossing. The previous zone state is cached on the patient record
so the engine knows the difference between *entering* a state and *being* in it.

**The boundary has hysteresis.** GPS noise moves a stationary phone several metres at
random. Without damping, a patient sitting on their doorstep on the zone edge would
flip between inside and outside forever. Leaving the zone therefore requires crossing
the radius *plus a buffer sized from that fix's own reported accuracy*; returning only
requires crossing back inside the radius. A sloppy fix needs more margin before the
system believes it.

**Offline is the normal case, not an error.** Dementia patients wander into places
with no signal — that is precisely when you most need the trail. The phone buffers
fixes in IndexedDB and uploads the backlog when connectivity returns. The backlog is
replayed oldest-first so zone transitions are detected in the order they really
happened, and backfilled points are flagged so the map can distinguish them from live
ones.

---

## Features

### Patient portal (mobile web)

- Asks for GPS permission on open, with a plain-language explanation
- Captures a fix every 5 seconds using `watchPosition` (reuses a warm GPS fix instead
  of cold-starting the receiver, which roughly halves battery drain)
- Live readout: latitude, longitude, accuracy, internet status, last updated time
- Large, unmissable **SOS button** that works even without a current fix (falls back
  to the last known position)
- Offline queue in IndexedDB with automatic upload on reconnect, and a visible
  "N fixes waiting to upload" counter
- Battery percentage and charging state where the browser exposes it
- Screen Wake Lock so the phone does not sleep and silently stop tracking
- Reports GPS failures and connectivity loss to the server, so the caregiver learns
  *why* the fixes stopped rather than just seeing silence

### Caretaker dashboard

- **Overview** — total patients, online, offline, alerts today, battery status, last
  updated, plus how many are currently outside a safe zone or inside a hazard
- **Live map** — patient markers, safe zone, danger zones, movement trail and last
  known position, updating in real time over Socket.IO
- **History** — route history with a date filter, timeline, route playback, distance
  travelled and time spent outside the safe zone
- **Alerts** — instant feed with severity, filtering by type/severity/patient/status,
  pagination, acknowledge and resolve with a note
- **Patients** — full CRUD, search, profile with age, gender, emergency contact,
  medical notes and home location
- **Geofencing** — set the home location and radius, edit or delete the safe zone
- **Danger zones** — multiple hazard zones (railway, forest, river, construction,
  highway, industrial) each with name, coordinates, radius and description
- **Analytics** — daily and weekly movement, alert counts, safe-zone violations,
  average distance travelled, time spent outside home
- Light and dark mode, glassmorphism over the map, responsive down to phone width,
  toast notifications, skeleton loading, protected routes

---

## Architecture

```
┌────────────────────────┐         ┌────────────────────────┐
│   Patient's phone      │         │  Caretaker's browser   │
│   (mobile browser)     │         │  (desktop dashboard)   │
│                        │         │                        │
│  Geolocation API       │         │  Leaflet map           │
│  IndexedDB queue       │         │  Recharts analytics    │
│  tracking code auth    │         │  JWT auth              │
└───────┬────────────────┘         └──────┬─────────────────┘
        │                                 │
        │ POST /api/location              │ REST (JWT)
        │ every 5 s                       │ + Socket.IO
        │                                 │
        ▼                                 ▼
┌──────────────────────────────────────────────────────────┐
│                  Express API  (Render)                   │
│                                                          │
│  routes → middleware → controllers → services → models   │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Geofencing engine                                 │  │
│  │  • haversine distance                              │  │
│  │  • accuracy-scaled hysteresis                      │  │
│  │  • transition detection (cached previous state)     │  │
│  │  • danger-zone containment                          │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  Presence sweep (every 15 s) → offline alerts            │
│  Socket.IO rooms: caretaker:<id> / patient:<id>          │
└────────────────────────┬─────────────────────────────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │   MongoDB Atlas     │
              │  7 collections      │
              └─────────────────────┘
```

Each incoming fix flows through one pipeline:

```
validate → evaluate zones → raise transition alerts → persist fix
         → refresh cached live status → broadcast over Socket.IO
```

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 8, Tailwind CSS 4, React Router 7 |
| Maps | Leaflet 1.9 + react-leaflet 5, OpenStreetMap tiles |
| Charts | Recharts 3 |
| Backend | Node.js, Express 5 |
| Database | MongoDB Atlas (Mongoose 9) |
| Auth | JWT (`jsonwebtoken`) + bcrypt password hashing |
| Real-time | Socket.IO 4 |
| Validation | Zod 4 |
| Security | Helmet, CORS allowlist, express-rate-limit 8 |
| Tooling | ESLint, Prettier |
| Hosting | Vercel (frontend), Render (backend), MongoDB Atlas (database) |

> **Note on versions.** This project runs on the current majors — Express 5,
> Mongoose 9, Zod 4, Tailwind 4, React 19 — which differ from most tutorials in ways
> that matter. Express 5 rejects a bare `'*'` route pattern and exposes `req.query`
> through a getter; Mongoose 9 no longer passes `next` to async middleware; Zod 4
> reports issues on `error.issues` rather than `error.errors`; Tailwind 4 configures
> the theme in CSS via `@theme` instead of `tailwind.config.js`. The code is written
> for these versions deliberately.

---

## Project structure

```
envision_7Rngers/
├── backend/
│   ├── src/
│   │   ├── config/            # env validation, MongoDB connection
│   │   ├── models/            # 7 Mongoose schemas
│   │   ├── controllers/       # HTTP request/response handling
│   │   ├── routes/            # endpoint definitions + middleware wiring
│   │   ├── middleware/        # auth, validation, rate limiting, errors
│   │   ├── services/          # business logic (geofencing, alerts, analytics)
│   │   ├── sockets/           # Socket.IO server and emitter registry
│   │   ├── validators/        # Zod request schemas
│   │   ├── utils/             # geo maths, JWT, tokens, logger, constants
│   │   ├── jobs/              # database seeder
│   │   ├── app.js             # Express app assembly
│   │   └── server.js          # process entry point
│   ├── .env.example
│   ├── eslint.config.js
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── api/               # one wrapper per endpoint group
│   │   ├── components/
│   │   │   ├── shared/        # Button, Card, Form, Modal, Badge, Icons…
│   │   │   ├── layout/        # sidebar, topbar, dashboard shell
│   │   │   ├── map/           # Leaflet map and overlays
│   │   │   ├── charts/        # Recharts analytics
│   │   │   └── patient/       # patient-portal pieces
│   │   ├── context/           # Auth, Socket, Theme, Toast providers
│   │   ├── hooks/             # geolocation, battery, connectivity, fetching
│   │   ├── lib/               # axios client, IndexedDB queue, formatters
│   │   ├── pages/
│   │   │   ├── auth/          # login, register
│   │   │   ├── caretaker/     # dashboard, map, history, alerts, patients…
│   │   │   └── patient/       # the patient tracking portal
│   │   ├── routes/            # route table and route guards
│   │   ├── index.css          # Tailwind theme + design tokens
│   │   └── main.jsx
│   ├── .env.example
│   ├── vite.config.js
│   └── package.json
│
├── .gitignore
└── README.md
```

**Why this layout.** The backend follows a strict one-direction dependency rule:
`routes → controllers → services → models`. Controllers only translate HTTP to
function calls; all domain logic lives in services, so the geofencing engine is
testable without an HTTP request. Services never import the socket layer directly —
that would create a cycle — so `sockets/emitter.js` acts as a registry the server
populates at boot and services broadcast through.

---

## Getting started

### Prerequisites

- **Node.js 18+** (`node --version`)
- **MongoDB** — either a free [Atlas](https://www.mongodb.com/cloud/atlas) cluster or
  a local `mongod` install
- A phone, or Chrome DevTools device emulation, to try the patient portal

### 1. Clone and install

```bash
git clone https://github.com/anto-snowin/envision_7Rngers.git
cd envision_7Rngers

cd backend  && npm install
cd ../frontend && npm install
```

### 2. Configure the backend

```bash
cd backend
cp .env.example .env
```

Edit `.env` and set at minimum:

```ini
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/dementia-care
JWT_SECRET=<a long random string>
```

Generate a strong secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 3. Configure the frontend

```bash
cd frontend
cp .env.example .env     # defaults to http://localhost:5000 — fine locally
```

### 4. Run both halves

Two terminals:

```bash
# terminal 1
cd backend && npm run dev     # http://localhost:5000

# terminal 2
cd frontend && npm run dev    # http://localhost:5173
```

Check the API is healthy:

```bash
curl http://localhost:5000/api/health
# {"success":true,"data":{"status":"ok","database":"connected",...}}
```

### 5. Testing the patient portal on a real phone

The Geolocation API needs a real device to produce meaningful fixes. The dev server
is already bound to `0.0.0.0`, so from a phone on the same Wi-Fi open
`http://<your-computer-ip>:5173/track/<code>`.

One caveat: **browsers only grant geolocation on `https://` or `localhost`.** Over
plain HTTP to a LAN IP, Chrome and Safari will refuse the permission. For a quick
tunnel with a trusted certificate:

```bash
npx localtunnel --port 5173      # or: ngrok http 5173
```

---

## Environment variables

### Backend (`backend/.env`)

| Variable | Default | Purpose |
|---|---|---|
| `NODE_ENV` | `development` | Runtime mode |
| `PORT` | `5000` | HTTP port |
| `MONGODB_URI` | — | **Required.** Atlas connection string |
| `JWT_SECRET` | — | **Required in production.** Token signing key |
| `JWT_EXPIRES_IN` | `7d` | Token lifetime |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated browser origin allowlist |
| `LOCATION_INTERVAL_MS` | `5000` | Tracking cadence sent to the phone |
| `OFFLINE_THRESHOLD_MS` | `30000` | Silence after which a patient is "offline" |
| `PRESENCE_SWEEP_MS` | `15000` | How often the offline sweep runs |
| `LOW_BATTERY_THRESHOLD` | `20` | Percentage that triggers a low-battery alert |
| `POOR_ACCURACY_THRESHOLD_M` | `150` | Accuracy beyond which a fix is unreliable |
| `ALERT_COOLDOWN_MS` | `120000` | Minimum gap between identical alerts |
| `RATE_LIMIT_WINDOW_MS` | `900000` | Rate-limit window |
| `RATE_LIMIT_MAX` | `1000` | General requests per window |
| `AUTH_RATE_LIMIT_MAX` | `20` | Failed login attempts per window |
| `TRUST_PROXY` | `1` in prod | Proxy hops to trust for client IPs |
| `LOG_LEVEL` | `debug` | `error` \| `warn` \| `info` \| `debug` |

### Frontend (`frontend/.env`)

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_URL` | `http://localhost:5000` | Backend origin (no `/api` suffix) |

---

## Seeding demo data

```bash
cd backend
npm run seed            # add demo data, keep anything already there
npm run seed -- --reset # wipe all collections first
```

This creates a caregiver, three patients with safe zones, six realistic danger zones,
and five days of plausible movement history (so the analytics charts have something
to show), then prints the login and the patient tracking links:

```
Caretaker login:  caretaker@demo.com  /  Demo1234

Patient tracking links (open on a phone):
  Harold Smith       /track/UJWM9UV2FRCM
  Margaret Doyle     /track/ZL43WF9FNC5R
  Arthur Bello       /track/J6PKD7H3LXQE
```

---

## How the two websites work

### Patient portal — `/track/:trackingCode`

1. The page opens and asks for GPS permission.
2. `POST /api/location/session/:trackingCode` validates the code and returns the
   patient's first name, the tracking cadence and their zones (deliberately **not**
   medical notes or emergency contacts — the link may sit open on an unattended
   phone).
3. `watchPosition` starts; the newest fix is posted every 5 seconds.
4. If a post fails or the browser reports itself offline, the fix goes into IndexedDB
   instead. On reconnect the backlog uploads via `POST /api/location/batch`.
5. SOS posts to `POST /api/location/sos`, bypassing the alert cooldown.

### Caretaker dashboard

1. Register or sign in; the JWT goes into `localStorage` and a session row is written
   server-side so signing out can revoke the token before it expires.
2. On load the dashboard opens one Socket.IO connection authenticated by the same JWT
   and joins a private `caretaker:<id>` room.
3. REST calls provide the initial state; socket events keep it fresh. The dashboard
   never polls.

---

## The geofencing engine

Lives in `backend/src/services/geofence.service.js`. For every fix:

**1. Distance.** Great-circle distance via the haversine formula against a mean Earth
radius of 6,371,008.8 m — accurate to well under a metre at neighbourhood scale.

**2. Safe zone with hysteresis.**

```js
const buffer   = clamp(fix.accuracy, 10, 60);   // metres
const isOutside = wasOutside
  ? distance > radius                  // already out: plain radius to come back
  : distance > radius + buffer;        // going out: must clear radius + buffer
```

**3. Transition detection.** The previous state is read from
`patient.liveStatus.zoneState`. An alert is raised only when the state actually
changes, so `SAFE_ZONE_EXIT` fires once per departure.

**4. Danger zones.** Every active zone for the caregiver is tested for containment.
Zones with an empty `patients` array apply to all of that caregiver's patients;
otherwise they are scoped to the listed ones. The set of zones the patient is
currently inside is cached, so `DANGER_ZONE_ENTRY` fires on entry rather than
continuously.

**5. Low battery.** Raised when the level crosses the threshold downward and the
device is not charging.

Distances in analytics use a jitter floor: consecutive fixes closer than 8 m apart are
treated as GPS noise rather than movement, which stops a phone sitting on a table from
accumulating kilometres of phantom travel overnight.

---

## Alert catalogue

| Type | Severity | Trigger |
|---|---|---|
| `SOS` | critical | Patient pressed the SOS button |
| `DANGER_ZONE_ENTRY` | critical | Patient entered a hazard zone |
| `SAFE_ZONE_EXIT` | high | Patient crossed out of their safe zone |
| `PATIENT_OFFLINE` | high | No fix for longer than the offline threshold |
| `GPS_UNAVAILABLE` | medium | Phone reported a geolocation failure |
| `INTERNET_DISCONNECTED` | medium | Phone reported losing connectivity |
| `LOW_BATTERY` | medium | Battery fell to the threshold while not charging |
| `SAFE_ZONE_RETURN` | info | Patient came back inside the safe zone |

Every alert except `SOS` is subject to a cooldown (default two minutes) so one
situation cannot flood the feed. SOS is exempt by design: a second press is a second
cry for help, not a duplicate.

---

## API reference

Base URL: `/api`. All responses share one envelope:

```json
{ "success": true, "data": { }, "meta": { } }
```

```json
{ "success": false, "error": { "message": "…", "status": 400, "details": { } } }
```

### Authentication — `/api/auth`

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/register` | — | Create a caregiver account, returns a JWT |
| `POST` | `/login` | — | Sign in, returns a JWT |
| `GET` | `/me` | JWT | Current user (used to restore a session) |
| `PUT` | `/me` | JWT | Update profile and preferences |
| `PUT` | `/password` | JWT | Change password; revokes other sessions |
| `POST` | `/logout` | JWT | Revoke the current session |
| `GET` | `/sessions` | JWT | List active sign-ins |
| `DELETE` | `/sessions/:sessionId` | JWT | Revoke one session |

### Patients — `/api/patients`

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | Paginated list; `?search= &status= &zone= &page= &limit=` |
| `GET` | `/live` | Lightweight payload for the live map |
| `GET` | `/:id` | Full profile with safe zone, latest fix, recent alerts |
| `POST` | `/` | Create (pass `safeZoneRadius` to create the geofence too) |
| `PUT` | `/:id` | Update |
| `DELETE` | `/:id` | Delete the patient and all their records |
| `GET` | `/:id/zones` | Safe zone + applicable danger zones |
| `POST` | `/:id/regenerate-code` | Rotate the tracking code |

### Location — `/api/location`

Write endpoints authenticate with a **tracking code**; read endpoints need a **JWT**.

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/session/:trackingCode` | code | Open a tracking session |
| `POST` | `/` | code | Submit one live fix |
| `POST` | `/batch` | code | Upload up to 500 queued fixes |
| `POST` | `/sos` | code | Trigger an SOS alert |
| `POST` | `/device-event` | code | Report a GPS or connectivity problem |
| `GET` | `/:patientId` | JWT | Latest known fix |
| `GET` | `/trail/:patientId` | JWT | Recent trail for the map |
| `GET` | `/history/:patientId` | JWT | Route history; `?from= &to= &limit=` |

### Alerts — `/api/alerts`

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | Feed; `?type= &severity= &patient= &status= &from= &to=` |
| `GET` | `/summary` | Counts for badges and header tiles |
| `GET` | `/:id` | One alert with patient and zone populated |
| `POST` | `/` | Log a manual alert |
| `PATCH` | `/:id/read` | Mark read |
| `PATCH` | `/read-all` | Mark all read |
| `PATCH` | `/:id/resolve` | Resolve with an optional note |
| `DELETE` | `/:id` | Delete |

### Geofences — `/api/geofence`

`GET /` · `GET /:id` · `POST /` · `PUT /:id` · `DELETE /:id`

One active safe zone per patient: creating a new one retires the previous.

### Danger zones — `/api/danger-zone`

`GET /` · `GET /categories` · `GET /:id` · `POST /` · `PUT /:id` · `DELETE /:id`

### Analytics — `/api/analytics`

| Method | Path | Description |
|---|---|---|
| `GET` | `/dashboard` | Headline counters |
| `GET` | `/overview` | Every chart in one request; `?days= &patient=` |
| `GET` | `/movement` | Distance per day |
| `GET` | `/alerts` | Alert counts per day and per type |

### Health — `/api/health`

Reports database connectivity, not just process liveness, so Render can tell a
half-broken instance from a healthy one.

---

## Real-time events

Clients authenticate in the Socket.IO handshake:

```js
// caretaker dashboard
io(API_URL, { auth: { token: jwt } });

// patient phone
io(API_URL, { auth: { trackingCode: 'ABCD2345EFGH' } });
```

Authentication happens once in `io.use`, so no event handler has to re-check identity
and a socket can never subscribe to a patient it does not own.

**Server → client**

| Event | Payload |
|---|---|
| `location:update` | New fix with coordinates, zone verdict, battery |
| `alert:new` | Freshly raised alert, patient name included |
| `alert:updated` | Alert was read or resolved |
| `presence:update` | A patient came online or went offline |
| `stats:update` | Refreshed dashboard counters |
| `patient:changed` | Patient created, updated or deleted |
| `geofence:changed` / `dangerZone:changed` | Zone edited |

**Client → server**

| Event | Sent by | Purpose |
|---|---|---|
| `patient:subscribe` / `patient:unsubscribe` | caretaker | Watch one patient (ownership verified) |
| `patient:heartbeat` | patient | Keep-alive when GPS is struggling and there are no fixes to send |
| `stats:request` | caretaker | Pull fresh counters |

---

## Data model

Seven collections, all timestamped.

**`users`** — caregiver accounts. Passwords are bcrypt hashed at 12 rounds and the
field is `select: false`, so a hash cannot leak through a stray `find()`.

**`patients`** — the monitored person, owned by one caregiver. Carries a denormalised
`liveStatus` snapshot (position, battery, zone state, danger zones currently inside,
last seen) so the dashboard renders every patient from a single query instead of
fanning out into the locations collection once per patient.

**`locations`** — one document per GPS fix, so by far the largest collection. Kept
flat and indexed for exactly the two access patterns that exist:
`{ patient: 1, recordedAt: -1 }` and `{ caretaker: 1, recordedAt: -1 }`. Stores both
`recordedAt` (when the phone captured it) and `receivedAt` (when the server got it) —
they differ for queued fixes.

**`alerts`** — append-only events. Indexed on `{ patient, type, createdAt }` to make
the cooldown check cheap.

**`geofences`** — circular safe zones; minimum radius 20 m, which is inside normal GPS
error.

**`dangerzones`** — hazards owned by a caregiver, optionally scoped to specific
patients.

**`sessions`** — caregiver sign-ins (revocable, which is what makes logout effective
immediately) and patient tracking runs. Expired rows are reaped automatically by a TTL
index.

---

## Security

- **Password hashing** — bcrypt, 12 rounds, hashed in a Mongoose pre-save hook so it
  cannot be bypassed.
- **JWT with server-side revocation** — each token embeds a session id; the auth
  middleware rejects a revoked session even while the token is inside its validity
  window.
- **Tenant isolation** — every query is scoped by `caretaker`. Cross-tenant access
  returns `404`, not `403`, so patient ids cannot be enumerated.
- **Input validation** — Zod schemas on body, query and params; validated values
  replace the raw request, so controllers never see unchecked input.
- **Rate limiting** — three tiers: strict on auth (failed attempts only), generous on
  location ingest (keyed per tracking code, so patients behind one carrier NAT do not
  starve each other), general elsewhere.
- **CORS allowlist** — explicit origins plus Vercel preview deployments; a wildcard
  would forbid credentialed requests anyway.
- **Helmet** — security headers with a restrictive CSP, since the API serves only JSON.
- **Timing-safe code comparison** — tracking-code lookups use
  `crypto.timingSafeEqual`.
- **Error masking** — only `ApiError`s reach the client; anything unexpected is logged
  in full and replaced with a generic 500.
- **No secrets in the repo** — `.env` is gitignored; `.env.example` documents the
  variables.

---

## Testing

The backend ships with an end-to-end suite that runs against a real server and a real
MongoDB, covering 104 REST assertions and 23 Socket.IO assertions:

| Area | Verified |
|---|---|
| Auth | Registration, password policy, duplicate email, login, token rejection after logout |
| Geofencing | Inside/outside verdicts, exit alert fires exactly once, staying out does not re-alert, return alert |
| Danger zones | Entry raises a critical alert; remaining inside does not re-alert |
| SOS | Accepted, and *not* suppressed by the cooldown |
| Offline queue | Batch upload accepted, chronological replay, empty batch rejected |
| Low battery | Alert on downward crossing |
| History & analytics | Distance, time outside, 7-day series, chronological ordering |
| Alerts | Filtering, pagination, read/resolve |
| Tenant isolation | A second caregiver cannot read, delete or list another's patient or alerts |
| Tracking codes | Rotation invalidates the old link immediately |
| Real-time | Live location, live alerts, presence, heartbeat, and that events never leak across caregivers |

Running them needs a MongoDB instance; point `MONGODB_URI` at a scratch database and
start the server, then execute the scripts under `backend/` (see
[Project status](#project-status) — these are being moved into the repo as a
`npm test` target).

Linting:

```bash
cd backend && npm run lint      # 0 errors, 0 warnings
cd frontend && npm run lint
```

---

## Deployment

### Database — MongoDB Atlas

1. Create a free M0 cluster.
2. **Database Access** → add a user with *Read and write to any database*.
3. **Network Access** → add `0.0.0.0/0` (Render's egress IPs are not fixed on the
   free tier).
4. Copy the connection string from **Connect → Drivers**. URL-encode any special
   characters in the password.

### Backend — Render

Create a **Web Service** from the repository:

| Setting | Value |
|---|---|
| Root directory | `backend` |
| Build command | `npm install` |
| Start command | `npm start` |
| Health check path | `/api/health` |

Environment variables: `MONGODB_URI`, `JWT_SECRET`, `NODE_ENV=production`,
`TRUST_PROXY=1`, and `CORS_ORIGINS` set to your Vercel domain.

> Two things to know about the free tier. It **sleeps after 15 minutes of
> inactivity**, so the first request can take ~50 s — the frontend treats a network
> timeout as "the server may be waking up" rather than destroying the session. And a
> sleeping backend cannot run the presence sweep, so offline alerts pause while it is
> asleep. For real use, a paid instance or an external pinger is required.

### Frontend — Vercel

Import the repository:

| Setting | Value |
|---|---|
| Root directory | `frontend` |
| Framework preset | Vite |
| Build command | `npm run build` |
| Output directory | `dist` |

Environment variable: `VITE_API_URL=https://your-service.onrender.com`

Add a rewrite so client-side routes survive a refresh — create `frontend/vercel.json`:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

Finally, add the Vercel domain to `CORS_ORIGINS` on Render and redeploy.

---

## Project status

The backend is **complete and verified** — every endpoint, the geofencing engine, the
alert pipeline, the presence sweep, Socket.IO and the seeder, all covered by the suite
described above (104 REST + 23 socket assertions passing, lint clean).

The frontend is **in progress**. Landed so far:

- [x] Vite + Tailwind 4 build, design tokens, light/dark theme
- [x] Axios client with envelope unwrapping and 401 handling
- [x] IndexedDB offline queue
- [x] Auth, Socket, Theme and Toast providers
- [x] Geolocation, battery, connectivity and wake-lock hooks
- [x] Shared UI kit — buttons, cards, forms, modals, badges, toasts, pagination,
      skeletons, icons
- [ ] App entry point and route table
- [ ] Dashboard layout (sidebar, topbar)
- [ ] Leaflet map components
- [ ] Recharts analytics components
- [ ] Pages: login, register, dashboard, live map, history, alerts, patients,
      patient profile, danger zones, analytics, settings
- [ ] Patient tracking portal

---

## Licence

MIT
