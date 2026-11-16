# Troubleshooting

Problems seen while building and running this system, with the actual cause.
Ordered roughly by how often they come up.

---

## Nothing loads: every request fails in the browser but `curl` works

**CORS.** `CORS_ORIGINS` on the backend does not include the frontend's origin.

- It is a comma-separated list of **exact origins**, with scheme, no trailing
  slash, no path: `https://app.vercel.app,http://localhost:3000`.
- `http://localhost:3000` and `http://127.0.0.1:3000` are different origins.
  Include both in development.
- The backend logs `Blocked CORS request from origin: …` at warn level. Look
  there before anything else.

Any `https://<name>.vercel.app` is allowed automatically so branch previews
work, but your production domain still has to be listed explicitly.

---

## The patient screen says "Location is switched off"

Permission was refused, or the page is not in a secure context.

- The Geolocation API requires HTTPS, or `localhost`. It silently fails on
  `http://192.168.x.x`, which is the usual way people try to test on a phone.
  Use a tunnel (`npx localtunnel --port 3000`) or deploy.
- Once refused, Chrome remembers. The user must clear it: padlock → Site
  settings → Location → Allow, then reload. There is no API to re-prompt.
- iOS Safari additionally needs Settings → Privacy → Location Services → Safari
  Websites set to "While Using the App".

---

## The patient screen says "Looking for a GPS signal" and never finds one

The fix is timing out (45 s, high accuracy, no cached fix accepted).

- Indoors, and especially in a basement or a steel-framed building, a cold
  high-accuracy fix can genuinely fail. Stand near a window.
- In a headless browser or a VM there is no GPS at all. Use Chrome DevTools →
  **Sensors** → custom location, or Puppeteer's `page.setGeolocation()`.
- Desktop Chrome resolves location from wifi networks via Google's service; with
  wifi off and no GPS it will fail outright.

The device keeps reporting presence (`POST /api/location/ping`) while GPS is
failing, so the caretaker sees "online, GPS unavailable" rather than "offline" —
those are genuinely different situations.

---

## The dashboard shows a patient as offline but their phone is open

Work through, in order:

1. **Is the page actually still open and awake?** Tracking only runs while the
   page is open. The app takes a screen wake lock, but that is Chromium-only and
   is revoked whenever the tab is backgrounded.
2. **Is it within the threshold?** A patient is offline after
   `OFFLINE_THRESHOLD_MS` (7 min) with no fix. With a 3-minute cadence, one
   missed cycle is normal and does not flip the indicator.
3. **Is the backend awake?** On Render's free tier the service idles after ~15
   minutes. Uploads fail, get queued on the phone, and are retried — no data is
   lost, but the dashboard goes stale. Check `/api/health`.
4. **Is the socket connected?** The top bar shows "Reconnecting" when it is not.
   Presence also depends on the 45-second heartbeat.

A dropped socket alone does **not** mark a patient offline. Phones switch
between wifi and mobile data constantly, so the server only trusts the absence
of *fixes*, not the absence of a socket.

---

## Location updates arrive but the map does not move

- The map re-fits its view only when its `fitKey` changes, not on every fix.
  That is deliberate: re-fitting on each update would yank the view away from a
  caretaker who had panned somewhere to look at it. The marker still moves.
- Check the right patient is selected. The switcher in the top bar drives the
  map, zones and history pages, and it defaults to the most recently added
  patient, not the one you were last looking at in another browser.

---

## No alerts are being raised

- **Is there a safe zone?** With no safe zone there is nothing to exit, so no
  `SAFE_ZONE_EXIT` can fire. The zones page says as much when the list is empty.
- **Has the patient actually crossed?** Alerts fire on *transitions*, not on
  state. A patient who was already outside when their first fix arrived produces
  no exit alert, because no crossing was observed.
- **Hysteresis.** Leaving requires the radius *plus* a buffer derived from the
  reported GPS accuracy (10–60 m). A fix 5 m outside a zone with ±30 m accuracy
  is not treated as an exit.
- **Cooldown.** An identical alert for the same patient within
  `ALERT_COOLDOWN_MS` (2 min) is suppressed. The backend logs
  `Alert X for patient Y suppressed by cooldown` at debug level. SOS is exempt.
- **Zone ownership.** A zone belongs to one patient. A danger zone created for
  Harold is never evaluated against Margaret.

---

## Duplicate or flapping alerts

If you are seeing a stream of alternating exit/return alerts, hysteresis is not
working — check that `liveStatus.zoneState` is being persisted. The engine reads
the *previous* state from the patient document, so if the save in
`location.service.js` fails silently, every fix looks like a fresh transition.

---

## `E11000 duplicate key error … index: email_1 dup key: { email: null }`

Creating a second patient with no email address.

The index must be **partial**, not sparse. Sparse skips documents where the field
is *absent*, but `email` defaults to `null`, so the field is present and two
nulls collide. The model declares:

```js
patientSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { email: { $type: 'string' } } }
);
```

If you are hitting this on an existing database, the old non-partial index is
still there — Mongoose creates new indexes but never drops old ones. Drop it by
hand:

```js
await mongoose.connection.db.collection('patients').dropIndex('email_1');
```

then restart so the correct index is built.

---

## A `PUT` with no body returns 400 "Validation failed … expected object, received undefined"

Express 5 leaves `req.body` as `undefined` when the request carries no body,
where Express 4 left `{}`. An object schema rejects `undefined`.

`validate.middleware.js` coerces a missing body to `{}`, so this is fixed — but
if you add a new validator that parses the body outside that middleware, you
will meet it again. Either go through `validate()` or default the value.

---

## `TypeError: next is not a function` on registration

A Mongoose 9 `pre('save')` hook declared `async` **and** taking `next`. Mongoose 9
resolves the returned promise and no longer passes a callback to async
middleware, so `next` is `undefined`.

```js
// wrong
schema.pre('save', async function (next) { … next(); });

// right
schema.pre('save', async function hashPassword() {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
});
```

---

## Everything returns 429 from an idle dashboard

This was a real bug, and the fix is worth understanding before you reintroduce
it.

The dashboard originally refetched its data on every `location:update` socket
event. With a handful of patients reporting, a dashboard nobody was touching
generated enough requests to exhaust its own rate-limit budget.

Two things prevent it now:

- `PatientsProvider` merges socket payloads into its cached list instead of
  refetching. The payload already contains everything a row displays.
- The aggregate refetches that do remain go through `useThrottledCallback`.

If you add a new socket-driven refetch, throttle it.

---

## Styles are missing for a class that clearly exists

Tailwind 4 resolves `@apply` against **generated utilities only**. Applying one
`@layer components` class inside another silently produces nothing:

```css
/* does not work */
.btn-acid { @apply btn bg-acid-500; }
```

Variants compose in markup instead: `className="btn btn-acid"`. The same applies
to `.badge badge-alarm`, `.panel panel-lit` and `.pill pill-active`.

---

## `ReferenceError: window is not defined` from the map

Leaflet touches `window` while its module is being evaluated, so it cannot be
part of a server render at all. Import it through `next/dynamic` with
`ssr: false` — deferring the work to an effect is not enough, because the import
itself is the problem. `components/map/LiveMap.tsx` is the only place that
should import `MapCanvas`.

---

## Map tiles are missing or the marker is a broken image

- **Blank tiles**: the OSM tile server is reachable from the browser, not the
  server. Check for an ad blocker or a corporate proxy blocking
  `*.tile.openstreetmap.org`.
- **Broken marker image**: the app does not use Leaflet's default icon precisely
  because it resolves its PNGs relative to the stylesheet and breaks under
  bundlers. If you see one, something is creating a plain `L.marker()` without
  the `divIcon`.

---

## The patient's battery always shows "Not available"

The Battery Status API is Chromium-only. Firefox and Safari do not implement it,
and the UI says so explicitly rather than showing a blank tile — a blank reads as
a fault, which it is not.

On the dashboard, battery is **last known** rather than last reported: a fix
without a battery level does not erase the level already held. So a patient on
Safari whose level was never reported shows `—`, while one who switched from
Chrome to Safari keeps the last Chrome reading.

---

## Queued fixes never upload

- The queue flushes on the next successful upload cycle and on the browser's
  `online` event. It is not a background sync — **the page must be open**. A
  phone that went offline and had the tab closed keeps its queue in IndexedDB
  and drains it next time the patient signs in.
- In private browsing, or with site data blocked, IndexedDB is unavailable and
  the queue falls back to memory. Fixes are then lost on reload. The fallback is
  deliberate: losing them on reload beats dropping them immediately.
- Only a **transport** failure queues a fix. A 4xx means the server looked at it
  and refused it; retrying forever would be wrong. Check the backend logs for
  `Rejected fix for patient …`.

---

## SOS does nothing

- It is press-and-hold, 1.5 seconds. A tap is ignored on purpose — the button is
  large and lives on a phone in a pocket.
- With a keyboard, Enter or Space fires immediately. Holding a key is not a
  gesture assistive technology performs reliably, and the accidental press the
  hold guards against is a touch problem.
- An SOS succeeds **without a GPS fix**: the server falls back to the last known
  position. If it fails, it is the network, not the GPS.

---

## Logout does not seem to take effect

It should be immediate. Every token carries a `sid` claim naming an
`AuthSession`, which the auth middleware checks on each request and the socket
handshake checks on connect.

If a revoked token still works, the token was issued without a `sid` — check
that `signToken` is being called with `{ sessionId }`.

---

## Time outside the safe zone looks too low

It is an estimate: the number of fixes that fell outside, times the upload
cadence. A device that was switched off for an hour contributes no fixes and
therefore no time.

That is the honest answer rather than a guess, but it means the figure is a
lower bound. Cross-check against `trackingSessions` to see whether tracking was
running during the gap.

---

## The seeder wiped my data

`npm run seed` deletes and recreates the demo caretaker's patients and
everything belonging to them. It is scoped to `caretaker@demo.com` and never
touches other accounts, but do not run it against a database that has real data
under that address.

---

## Useful commands

```bash
# API health, including database connectivity
curl -s http://localhost:5000/api/health | jq

# Which collections and indexes actually exist
mongosh "$MONGODB_URI" --eval 'db.getCollectionNames()'
mongosh "$MONGODB_URI" --eval 'db.patients.getIndexes()'

# Watch alerts as they are raised
mongosh "$MONGODB_URI" --eval 'db.alerts.find().sort({createdAt:-1}).limit(5).pretty()'

# Verbose backend logging
LOG_LEVEL=debug npm run dev
```

`LOG_LEVEL=debug` is what shows cooldown suppressions, socket joins and presence
sweeps — the three things most often misdiagnosed as "alerts are broken".
