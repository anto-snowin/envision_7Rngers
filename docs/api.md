# API reference

Base URL: `http://localhost:5000/api` in development.

Every response uses one envelope.

**Success**

```json
{ "success": true, "data": { }, "meta": { } }
```

`meta` appears only on paginated endpoints.

**Failure**

```json
{
  "success": false,
  "error": {
    "message": "Validation failed",
    "status": 400,
    "details": { "segment": "body", "fields": { "email": "Enter a valid email address" } }
  }
}
```

`details.fields` maps a field path to a message and is what the web client
renders inline on forms.

---

## Authentication

Send the JWT as a bearer token:

```
Authorization: Bearer <token>
```

Tokens carry a `role` claim (`patient` or `caretaker`) and a `sid` claim naming a
server-side session. Signing out revokes that session, so the token stops working
immediately rather than at its natural expiry.

| Status | Meaning |
|---|---|
| 401 | No token, invalid token, expired token, or a revoked session |
| 403 | Valid token, wrong role for this endpoint, or a deactivated account |
| 404 | Resource does not exist **or** belongs to another caretaker |

404-for-not-yours is deliberate: a 403 would confirm the id exists.

---

## Rate limits

| Scope | Limit | Keyed by |
|---|---|---|
| General API | 2000 / 15 min | IP |
| `/auth/*` credential routes | 20 / 15 min, failures only | IP |
| `/location/update`, `/location/ping` | 30 / min | authenticated patient id |

Responses carry `RateLimit` / `RateLimit-Policy` headers (draft-8). Over the
limit returns 429 in the standard error envelope.

---

# Endpoints

## `GET /api/health`

No auth. Used by Render to decide whether the instance is live, so it reports
database connectivity rather than merely that the process is running.

```json
{
  "success": true,
  "data": { "status": "ok", "database": "connected", "uptimeSeconds": 412, "timestamp": "2026-11-16T05:33:07.000Z" }
}
```

Returns 503 with `"status": "degraded"` when MongoDB is not connected.

---

## Auth

### `POST /api/auth/caretaker/register`

Creates a caretaker account and signs them in.

```json
{ "name": "Susan Whitfield", "email": "susan@example.com", "password": "Secret123", "phone": "+44 7700 900000" }
```

`phone` is optional and is shown to the patient on their device so they have
someone to call. Password must be 8–128 characters and contain a number.

**201**

```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOi…",
    "role": "caretaker",
    "caretaker": { "id": "6afa…", "name": "Susan Whitfield", "email": "susan@example.com", "phone": "+44 7700 900000", "createdAt": "2026-11-16T05:33:06.695Z" }
  }
}
```

**409** if the email is already registered.

### `POST /api/auth/caretaker/login`

```json
{ "email": "caretaker@demo.com", "password": "Demo1234" }
```

**200** — same shape as register.

**401** `"Those sign-in details are not correct"` for both an unknown account and
a wrong password. The message is identical on purpose: distinguishing them turns
the login form into an account-enumeration oracle.

Note that login does **not** apply the password policy to the submitted value.
The stored password predates any policy change, and rejecting it here would lock
an account out of its own sign-in form.

### `POST /api/auth/patient/login`

The patient device's sign-in. `identifier` accepts the patient code, the email,
or the phone number — one field, because asking someone with dementia which
*kind* of identifier they are about to type is one decision too many.

```json
{ "identifier": "PT-HRLD-2K7M", "password": "Device1234" }
```

**200**

```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOi…",
    "role": "patient",
    "patient": {
      "id": "6afa…",
      "name": "Harold Whitfield",
      "patientCode": "PT-HRLD-2K7M",
      "caretakerName": "Demo Caretaker",
      "caretakerPhone": "+44 7700 900000"
    },
    "session": { "id": "6afb…", "patientId": "6afa…", "startedAt": "…", "endedAt": null, "fixCount": 0, "queuedFixCount": 0, "lastFixAt": null, "userAgent": "Mozilla/5.0 (iPhone…" }
  }
}
```

The device learns almost nothing: its own name and code, and the caretaker's
contact details. No zones, no history, no other patients.

A successful login also opens a `TrackingSession`. Any run still open from a
previous sign-in is closed first (reason `tab_closed`) — an unclosed session
usually means the tab was killed without a logout, and leaving two open would
double-count in the history.

### `POST /api/auth/logout`

Either role. Revokes the session behind the presented token. For a patient it
also ends the open tracking run, which is the event the caretaker's history needs.

**200** `{ "success": true, "data": null }`

### `GET /api/auth/me`

Either role. Used by the client to verify a stored token on load — the token
alone is not enough, because it may have been revoked elsewhere.

Caretaker:

```json
{ "success": true, "data": { "role": "caretaker", "caretaker": { … } } }
```

Patient:

```json
{ "success": true, "data": { "role": "patient", "patient": { … }, "session": { … } } }
```

### `GET /api/auth/sessions`

Caretaker only. Their active sign-ins, newest activity first.

```json
{
  "success": true,
  "data": [
    { "id": "6b01…", "sessionId": "9f2c…", "userAgent": "Mozilla/5.0…", "createdAt": "…", "lastActivityAt": "…", "isCurrent": true }
  ]
}
```

### `DELETE /api/auth/sessions/:sessionId`

Caretaker only. Revokes one sign-in. Scoped to the caller's own sessions, so one
account cannot sign another out by guessing a handle.

### `PUT /api/auth/password`

Caretaker only.

```json
{ "currentPassword": "Demo1234", "newPassword": "Stronger99" }
```

Revokes **every** other session and returns a fresh token — a password change is
how someone responds to a suspected compromise, so stale tokens must stop
working.

**400** if the current password is wrong.

---

## Patients

All caretaker-only. Creating a patient also mints their device login.

### `GET /api/patients`

Query: `search` (optional) matches name or patient code, case-insensitive. The
input is escaped before becoming a regex, so a search for `a(` does not 500 and
`.*` does not scan everything.

```json
{
  "success": true,
  "data": [
    {
      "id": "6afa…",
      "name": "Harold Whitfield",
      "patientCode": "PT-HRLD-2K7M",
      "email": null,
      "phone": null,
      "age": 78,
      "gender": "male",
      "emergencyContactName": "Susan Whitfield",
      "emergencyContactPhone": "+44 7700 900111",
      "emergencyContactRelationship": "Daughter",
      "medicalNotes": "Moderate Alzheimer's…",
      "isActive": true,
      "liveStatus": {
        "isOnline": true,
        "latitude": 28.6139,
        "longitude": 77.209,
        "accuracy": 11,
        "batteryLevel": 77,
        "isCharging": false,
        "zoneState": "inside_safe",
        "insideSafeZone": true,
        "dangerZone": null,
        "distanceFromSafeZone": 14,
        "lastSeenAt": "2026-11-16T05:40:02.411Z",
        "recordedAt": "2026-11-16T05:40:01.980Z"
      },
      "createdAt": "…",
      "updatedAt": "…"
    }
  ]
}
```

`liveStatus.insideSafeZone` is `null` until the first fix, or when the patient
has no safe zone configured — it means "unknown", not "no".

`liveStatus.batteryLevel` and `isCharging` are **last known**, not last
reported. The Battery Status API is Chromium-only, and queued fixes may predate a
reading, so a fix without a battery level must not erase the level already held.

### `POST /api/patients`

```json
{
  "name": "Harold Whitfield",
  "password": "Optional123",
  "email": "harold@example.com",
  "phone": "+44 7700 900999",
  "age": 78,
  "gender": "male",
  "emergencyContactName": "Susan Whitfield",
  "emergencyContactPhone": "+44 7700 900111",
  "emergencyContactRelationship": "Daughter",
  "medicalNotes": "…"
}
```

Only `name` is required. Omit `password` and the server generates a readable one.
`email` and `phone` are optional and unique **when present** — any number of
patients may have none.

**201** — the patient, plus one extra field:

```json
{ "success": true, "data": { "…": "…", "patientCode": "PT-7KQ3-M9XB", "temporaryPassword": "H4KQ7MN2PX" } }
```

`temporaryPassword` is returned **exactly once** and is never retrievable again;
only its bcrypt hash is stored. Show it to the caretaker immediately.

### `GET /api/patients/:id`

### `PUT /api/patients/:id`

Any subset of the create fields except `password`. Returns the updated patient.

### `DELETE /api/patients/:id`

A hard delete: every fix, alert, zone and tracking session belonging to the
patient goes too, and their device sessions are revoked. This is deliberate for
health data — a caretaker who removes a patient expects the location history to
be gone, not archived.

### `PUT /api/patients/:id/password`

```json
{ "password": "Optional123" }
```

Body may be empty to have one generated. Revokes every device session and closes
the open tracking run, because this is the action a caretaker takes when a phone
is lost. Returns the patient with a fresh `temporaryPassword`.

### `GET /api/patients/:id/zones`

Both kinds in one response. Same payload as `GET /api/zones/patient/:patientId`.

### `GET /api/patients/:id/sessions`

The 30 most recent tracking runs, newest first.

```json
{
  "success": true,
  "data": [
    { "id": "6afb…", "patientId": "6afa…", "startedAt": "…", "endedAt": null, "endReason": null, "fixCount": 783, "queuedFixCount": 0, "lastFixAt": "…", "userAgent": "…" }
  ]
}
```

`endReason` is one of `logout`, `stopped`, `tab_closed`, `timeout`, `revoked`.

---

## Location — patient device

These take a **patient** token. None of them accepts a patient id: the patient is
the credential, so a device physically cannot write a fix attributed to anyone
else.

### `POST /api/location/update`

Always an array, so one live fix and a drained offline queue are the same code
path.

```json
{
  "connection": "online",
  "fixes": [
    {
      "latitude": 28.6139,
      "longitude": 77.209,
      "accuracy": 11.4,
      "altitude": null,
      "speed": 0.8,
      "heading": null,
      "batteryLevel": 77,
      "isCharging": false,
      "recordedAt": "2026-11-16T05:40:01.980Z",
      "queued": false
    }
  ]
}
```

- 1–200 fixes per request. The cap bounds both body size and the work one
  request can trigger — each fix runs the full geofence evaluation.
- `connection` is `online` or `queued`, advisory only.
- `queued: true` marks a fix that was buffered offline; it is stored so the UI
  can distinguish backfilled points from live ones.
- `recordedAt` may be an ISO string or epoch milliseconds. A missing, unparseable
  or future-dated value is replaced with the server's clock — a phone with a
  skewed clock would otherwise sort ahead of every real fix and corrupt
  transition ordering permanently.

The server sorts the batch oldest-first before evaluating, so transitions replay
in the order they actually happened.

**200**

```json
{
  "success": true,
  "data": {
    "accepted": 1,
    "rejected": 0,
    "connection": "online",
    "insideSafeZone": true,
    "dangerZone": null,
    "distanceFromSafeZone": 14,
    "alerts": []
  }
}
```

The zone verdict is echoed back so the patient screen can say "you are at home"
without evaluating geofences itself — the device's own opinion is never trusted.

**400** when no fix in the batch was usable (bad coordinates, empty array).

### `POST /api/location/ping`

Keep-alive for a device with no fix to send.

```json
{ "online": true, "batteryLevel": 64, "isCharging": false }
```

This matters because the two failure modes are otherwise indistinguishable from
the server: a phone whose GPS cannot get a lock is still present, and that is
very different from a phone that has been switched off.

### `POST /api/location/sos`

```json
{ "latitude": 28.6139, "longitude": 77.209, "accuracy": 9 }
```

Every field is optional. An SOS must go through with no GPS fix at all, so the
handler falls back to the last known position rather than refusing — a caretaker
who knows "SOS pressed, last seen at the park ten minutes ago" is far better off
than one who gets nothing.

SOS bypasses the alert cooldown: if the patient presses it twice, the caretaker
sees it twice.

**200** — the created alert.

### `POST /api/location/device-event`

Conditions only the device can observe.

```json
{ "type": "GPS_UNAVAILABLE", "message": "The patient device refused location permission." }
```

`type` must be one of:

```
GPS_UNAVAILABLE   INTERNET_DISCONNECTED   INTERNET_RESTORED
TRACKING_STARTED  TRACKING_STOPPED
```

The allow-list is the security boundary. Without it a device could post a
fabricated zone breach for its own patient. Everything else is derived
server-side from the fixes themselves.

`TRACKING_STOPPED` also closes the open tracking run.

**400** for any type outside the list.

**200** — the alert, or `null` if suppressed by cooldown.

### `GET /api/location/me`

What the device is allowed to read back about itself.

```json
{ "success": true, "data": { "insideSafeZone": true, "dangerZone": null, "lastFixAt": "…", "fixCount": 12 } }
```

---

## Location — caretaker

### `GET /api/location/latest/:patientId`

```json
{
  "success": true,
  "data": {
    "id": "6b02…",
    "patientId": "6afa…",
    "latitude": 28.6139,
    "longitude": 77.209,
    "accuracy": 11.4,
    "altitude": null,
    "speed": 0.8,
    "heading": null,
    "batteryLevel": 77,
    "isCharging": false,
    "connection": "online",
    "zoneState": "inside_safe",
    "insideSafeZone": true,
    "distanceFromSafeZone": 14,
    "recordedAt": "…",
    "createdAt": "…"
  }
}
```

`data` is `null` if the patient has never reported.

### `GET /api/location/history/:patientId`

| Query | Default | Notes |
|---|---|---|
| `from` | — | ISO date-time |
| `to` | — | ISO date-time |
| `limit` | 2000 | max 5000 |

Returned oldest-first, which is the order the map draws a trail in.

```json
{
  "success": true,
  "data": {
    "fixes": [ { "…": "…" } ],
    "summary": {
      "points": 261,
      "distanceMeters": 3840,
      "minutesOutsideSafeZone": 63,
      "outsideFixes": 21,
      "firstFixAt": "2026-11-16T07:00:00.000Z",
      "lastFixAt": "2026-11-16T20:00:00.000Z"
    }
  },
  "meta": { "points": 261, "limit": 2000 }
}
```

`distanceMeters` walks consecutive fixes with an 8 m noise floor, so a
stationary phone does not accumulate kilometres of phantom travel.

`minutesOutsideSafeZone` is **an estimate**: the number of fixes that fell
outside, times the upload cadence. A device that was off for an hour contributes
no fixes and therefore no time, which is the honest answer rather than a guess.

### `GET /api/location/alerts/:patientId`

The 50 most recent alerts for one patient, newest first. A convenience read for
the history view; the paginated feed below is the general case.

---

## Zones

Caretaker only. `/zones/safe` and `/zones/danger` are symmetric. Both kinds are
scoped to one patient.

Radius bounds differ by kind:

- **Safe**: 20 m – 20 km. Nothing smaller than 20 m, because consumer GPS drifts
  by 10–20 m and a tighter zone would raise exit alerts while the patient sits
  indoors.
- **Danger**: 10 m – 20 km. A level crossing genuinely is that small, and here a
  false positive costs far less than a miss.

### `GET /api/zones/safe` · `GET /api/zones/danger`

Query: `patientId` (optional) narrows to one patient; without it you get every
zone of that kind the caretaker owns.

```json
{
  "success": true,
  "data": [
    {
      "id": "6afc…",
      "patientId": "6afa…",
      "kind": "safe",
      "name": "Home",
      "category": null,
      "description": "Everyday safe area around the house.",
      "latitude": 28.6139,
      "longitude": 77.209,
      "radius": 250,
      "severity": null,
      "isActive": true,
      "createdAt": "…",
      "updatedAt": "…"
    }
  ]
}
```

### `POST /api/zones/safe`

```json
{
  "patientId": "6afa…",
  "name": "Home",
  "description": "Everyday safe area.",
  "latitude": 28.6139,
  "longitude": 77.209,
  "radius": 250,
  "address": "12 Meadow Lane",
  "isPrimary": true
}
```

### `POST /api/zones/danger`

```json
{
  "patientId": "6afa…",
  "name": "Railway level crossing",
  "category": "railway",
  "description": "Unmanned crossing on the lane behind the park.",
  "latitude": 28.6181,
  "longitude": 77.2121,
  "radius": 90,
  "severity": "critical"
}
```

`category` ∈ `railway | water | forest | highway | construction | industrial |
other` (default `other`). `severity` ∈ `critical | high | medium` (default
`critical`).

**201** — the created zone.

**404** if `patientId` is not one of the caller's patients — which is what stops
a caretaker attaching a zone to someone else's patient and thereby receiving
that patient's breach alerts.

### `PUT /api/zones/safe/:id` · `PUT /api/zones/danger/:id`

Any subset of the editable fields. `patientId` is **not** editable — a zone
cannot be moved to a different patient.

### `DELETE /api/zones/safe/:id` · `DELETE /api/zones/danger/:id`

**200** `{ "success": true, "data": null }`. Past alerts that referenced the zone
are kept and still read correctly, because the zone name is copied onto each
alert at creation time.

### `GET /api/zones/patient/:patientId`

Both kinds together, which is what the map needs — two round trips would make
the markers and circles appear out of step.

```json
{ "success": true, "data": { "safe": [ … ], "danger": [ … ] } }
```

---

## Alerts

Caretaker only.

### `GET /api/alerts`

| Query | Default | Notes |
|---|---|---|
| `page` | 1 | |
| `limit` | 20 | max 100 |
| `patientId` | — | must be one of yours |
| `type` | — | any alert type |
| `severity` | — | `critical \| high \| medium \| low \| info` |
| `unreadOnly` | — | `true` / `false` |
| `unresolvedOnly` | — | `true` / `false` |
| `from`, `to` | — | ISO date-time |

```json
{
  "success": true,
  "data": [
    {
      "id": "6b05…",
      "patientId": "6afa…",
      "patientName": "Harold Whitfield",
      "type": "SAFE_ZONE_EXIT",
      "severity": "high",
      "title": "Patient left the safe zone",
      "message": "Harold Whitfield is 700 m beyond the \"Home\" safe zone.",
      "zoneName": "Home",
      "latitude": 28.6202,
      "longitude": 77.209,
      "distance": 700,
      "metadata": { "zoneName": "Home", "radius": 250, "distanceFromCentre": 950, "distanceBeyondEdge": 700 },
      "isRead": false,
      "isResolved": false,
      "resolvedAt": null,
      "createdAt": "2026-11-16T05:41:11.207Z"
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 7, "totalPages": 1, "hasNextPage": false, "hasPrevPage": false }
}
```

`zoneName` is denormalised onto the alert on purpose: the alert must still read
correctly after the zone is renamed or deleted, because it is a record of what
happened rather than a live view of configuration.

### `GET /api/alerts/:patientId`

One patient's alerts, same shape, `page` and `limit` only.

### `PUT /api/alerts/:id/read`

### `PUT /api/alerts/:id/resolved`

```json
{ "resolutionNote": "Called her, she was at the shop." }
```

Body optional. Resolving also marks read. Returns the updated alert.

### `PUT /api/alerts/read-all`

```json
{ "patientId": "6afa…" }
```

Omit `patientId` to mark every alert read.

```json
{ "success": true, "data": { "updated": 6 } }
```

---

## Dashboard

### `GET /api/dashboard/summary`

Caretaker only.

```json
{
  "success": true,
  "data": {
    "totalPatients": 3,
    "online": 1,
    "offline": 2,
    "alertsToday": 7,
    "criticalAlertsToday": 1,
    "unreadAlerts": 4,
    "unresolvedAlerts": 4,
    "outsideSafeZone": 1,
    "inDangerZone": 0,
    "lowBattery": 0,
    "averageBattery": 74,
    "batteryReportingCount": 3,
    "lastUpdatedAt": "2026-11-16T05:41:11.207Z"
  }
}
```

`online` is derived from each patient's last-seen timestamp rather than the
cached boolean, so the number is right even if the presence sweep has not run
since a device went quiet.

`averageBattery` is `null` when no device reports a level —
`batteryReportingCount` tells you how many did, so a `null` can be explained to
the user instead of rendered as a blank.

---

## Socket.IO

Connect to the API origin with the JWT in the handshake:

```js
import { io } from 'socket.io-client';

const socket = io('http://localhost:5000', {
  auth: { token },                       // not a query string — that lands in access logs
  transports: ['websocket', 'polling'],
});
```

The handshake verifies the token *and* re-checks session revocation, because a
socket outlives the request that opened it.

### Server → client

| Event | Sent to | Payload |
|---|---|---|
| `location:update` | caretaker + patient rooms | `{ patientId, patientName, latitude, longitude, accuracy, speed, heading, batteryLevel, isCharging, zoneState, insideSafeZone, distanceFromSafeZone, dangerZone, dangerZoneIds, isQueued, recordedAt, locationId }` |
| `alert:new` | caretaker | the serialised alert, same shape as the REST feed |
| `alert:updated` | caretaker | the alert, or `{ refetch: true }` after a bulk change |
| `presence:update` | caretaker | `{ patientId, patientName, isOnline?, socketConnected?, reason, batteryLevel?, isCharging?, lastSeenAt }` |
| `zones:changed` | caretaker | `{ patientId, kind, action }` |
| `patient:changed` | caretaker | `{ patientId, action }` |
| `stats:update` | caretaker | the dashboard summary |

`presence:update` carries `isOnline` **or** `socketConnected`, never both. A
dropped socket is not an offline patient — phones switch networks constantly —
so a `socketConnected: false` event must not flip the online indicator.
`reason` is one of `device_connected`, `heartbeat`, `reconnected`,
`no_recent_fix`, `socket_disconnected`, `timeout`.

### Client → server

| Event | From | Payload |
|---|---|---|
| `patient:heartbeat` | patient device | `{ batteryLevel, isCharging, gpsStatus }` |
| `patient:subscribe` | caretaker | `{ patientId }`, acked `{ ok, patientId }` — ownership verified server-side |
| `patient:unsubscribe` | caretaker | `{ patientId }` |
| `stats:request` | caretaker | none; replies with `stats:update` |

A caretaker receives events for their own patients via the caretaker room
without subscribing. `patient:subscribe` is for the live map, which focuses on
one patient at a time.

---

## Alert types

| Type | Default severity | Raised by |
|---|---|---|
| `SOS` | critical | patient device, cooldown-exempt |
| `DANGER_ZONE_ENTRY` | critical | geofence engine on entry |
| `DANGER_ZONE_EXIT` | info | geofence engine on exit |
| `SAFE_ZONE_EXIT` | high | geofence engine on crossing out |
| `SAFE_ZONE_RETURN` | info | geofence engine on crossing back |
| `PATIENT_OFFLINE` | high | presence sweep |
| `LOW_BATTERY` | medium | ingest, on crossing the threshold downward while not charging |
| `GPS_UNAVAILABLE` | medium | patient device |
| `INTERNET_DISCONNECTED` | medium | reserved; see note |
| `INTERNET_RESTORED` | info | patient device on reconnect |
| `TRACKING_STARTED` | info | patient device |
| `TRACKING_STOPPED` | medium | patient device on page close |

`INTERNET_DISCONNECTED` exists in the enum and the device allow-list, but the
device never raises it in practice: a device with no connection cannot report
that it has no connection. The server's presence sweep notices the silence and
raises `PATIENT_OFFLINE` instead, and the device raises `INTERNET_RESTORED` when
it comes back — each half of the story from the side that can observe it.

Alerts other than SOS are suppressed if an identical one was raised for the same
patient within `ALERT_COOLDOWN_MS` (default 2 minutes). For danger zones the
cooldown is scoped to the specific zone.
