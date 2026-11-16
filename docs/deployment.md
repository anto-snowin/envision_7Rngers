# Deployment

Two deployables and a database:

| Piece | Host | Why |
|---|---|---|
| `frontend/` | Vercel | Next.js, zero-config |
| `backend/` | Render (web service) | Needs a long-lived process for Socket.IO and the presence timer |
| MongoDB | Atlas | Managed, free tier is enough for a prototype |

The API cannot be deployed as Next.js API routes: Socket.IO needs a persistent
process holding open connections, and serverless functions do not provide one.

---

## 1. Environment variables

### `backend/.env`

| Variable | Required | Default | Notes |
|---|---|---|---|
| `NODE_ENV` | — | `development` | Set to `production` on Render |
| `PORT` | — | `5000` | Render injects this; do not hard-code it |
| `MONGODB_URI` | **in production** | local mongod | Atlas SRV string |
| `JWT_SECRET` | **in production** | insecure dev value | See below |
| `JWT_EXPIRES_IN` | — | `7d` | |
| `CORS_ORIGINS` | — | `http://localhost:5173,http://127.0.0.1:5173` | Comma-separated, **no trailing slash** |
| `LOCATION_INTERVAL_MS` | — | `180000` | 3 minutes; must match the client |
| `OFFLINE_THRESHOLD_MS` | — | `420000` | 7 minutes, a bit over two cycles |
| `PRESENCE_SWEEP_MS` | — | `60000` | How often staleness is checked |
| `LOW_BATTERY_THRESHOLD` | — | `20` | Percent |
| `ALERT_COOLDOWN_MS` | — | `120000` | Per patient per type; SOS exempt |
| `RATE_LIMIT_WINDOW_MS` | — | `900000` | |
| `RATE_LIMIT_MAX` | — | `2000` | Per IP per window |
| `AUTH_RATE_LIMIT_MAX` | — | `20` | Failed sign-ins per IP per window |
| `TRUST_PROXY` | — | `1` in production | Must be right or rate limiting keys on the proxy's IP |

`MONGODB_URI` and `JWT_SECRET` throw on boot if missing in production. That is
deliberate — a missing secret silently falling back to a dev default is a far
worse failure than refusing to start.

Generate a secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Rotating `JWT_SECRET` invalidates every existing token, so everyone — patients
included — must sign in again. For a patient that means someone has to physically
pick up their phone, so rotate deliberately.

### `frontend/.env.local`

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | yes | Base URL of the API, **no trailing slash** |

Only `NEXT_PUBLIC_`-prefixed variables reach the browser, which is exactly right
here: the client holds no secrets of its own.

**`NEXT_PUBLIC_*` values are inlined at build time, not read at runtime.**
Changing this on Vercel requires a redeploy, not a restart.

---

## 2. Local development

Prerequisites: Node 18+, and either a local MongoDB or an Atlas connection
string.

```bash
git clone https://github.com/anto-snowin/envision_7Rngers.git
cd envision_7Rngers
```

### Backend

```bash
cd backend
npm install
cp .env.example .env          # edit MONGODB_URI and JWT_SECRET
npm run seed                  # demo caretaker, 3 patients, 3 days of history
npm run dev                   # nodemon on :5000
```

The seeder prints the logins it created:

```
Caretaker dashboard login
  caretaker@demo.com / Demo1234

Patient device logins (password for all three)
  password: Device1234
  Harold Whitfield     PT-HRLD-2K7M
  Margaret Osei        PT-MRGT-4N9P
  Arun Mehta           PT-ARUN-6Q3T
```

`npm run seed` **deletes and recreates** the demo caretaker's patients and all
their data. It never touches other accounts.

### Frontend

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev                   # :3000
```

Set `CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000` in
`backend/.env`, or the browser will block every response.

### Checks

```bash
cd backend  && npm run lint
cd frontend && npm run lint && npm run typecheck && npm run build
```

### Testing the patient device from a laptop

Chrome DevTools → three-dot menu → **Sensors** → set a custom location. Device
mode alone does not fake GPS; you need the Sensors panel.

The Geolocation API requires a secure context, so `localhost` works but
`http://192.168.x.x` does not. To test on a real phone on your LAN, tunnel it:

```bash
npx localtunnel --port 3000
```

and point `NEXT_PUBLIC_API_URL` at a tunnel for the API too, then rebuild.

---

## 3. MongoDB Atlas

1. Create a free M0 cluster.
2. **Database Access** → add a user with *Read and write to any database*.
3. **Network Access** → add `0.0.0.0/0`. Render does not publish stable egress
   IPs on its lower tiers, so an allow-list of specific addresses will break.
   This makes the password the only thing protecting the database — use a long
   generated one.
4. Copy the SRV string and append a database name:

```
mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/sentinel?retryWrites=true&w=majority
```

URL-encode any special characters in the password (`@` → `%40`).

Indexes are created automatically by Mongoose on first connection. For a large
existing collection you would want `autoIndex: false` and a managed migration,
but at prototype scale the startup cost is negligible.

---

## 4. Backend on Render

New → **Web Service** → connect the repo.

| Setting | Value |
|---|---|
| Root Directory | `backend` |
| Build Command | `npm install` |
| Start Command | `npm start` |
| Health Check Path | `/api/health` |

Environment variables:

```
NODE_ENV=production
MONGODB_URI=mongodb+srv://…
JWT_SECRET=<generated>
CORS_ORIGINS=https://your-app.vercel.app
TRUST_PROXY=1
```

Leave `PORT` unset — Render injects it and the app reads it.

Note `/api/health` reports database connectivity, not just process liveness, so
Render will correctly refuse to route traffic to an instance that cannot reach
Atlas.

### The free-tier spin-down problem

Render's free tier idles a service after ~15 minutes of inactivity, and the cold
start takes 30–60 seconds. For this application that is not a cosmetic issue:

- Patient devices upload every 3 minutes. If the service is asleep, the upload
  fails, the fix is queued on the phone, and it is retried on the next cycle —
  so **no data is lost**, but the caretaker's view goes stale.
- The presence sweep does not run while the process is idle, so
  `PATIENT_OFFLINE` alerts can be delayed by the length of the sleep.
- Socket connections are dropped on spin-down; the client reconnects
  automatically.

For anything beyond a demo, use a paid instance. Do not "solve" this with an
external cron pinging `/api/health` — it keeps the dyno warm but counts against
your rate limit and masks the real constraint.

---

## 5. Frontend on Vercel

New Project → import the repo.

| Setting | Value |
|---|---|
| Framework Preset | Next.js |
| Root Directory | `frontend` |
| Build Command | (default) |

Environment variable, for **all** environments:

```
NEXT_PUBLIC_API_URL=https://your-service.onrender.com
```

No trailing slash. The client appends `/api/...` itself, so a trailing slash
produces `//api/...`, which some proxies reject.

### Preview deployments

The API's CORS handler already allows any `https://<something>.vercel.app`
origin, so branch previews work without reconfiguring the backend. Previews
share the production database — if that matters, point preview builds at a
second Render service and a second Atlas database.

---

## 6. Deploy order

1. Atlas cluster, user, network access.
2. Render service with `CORS_ORIGINS` set to a placeholder.
3. Vercel project with `NEXT_PUBLIC_API_URL` pointing at the Render URL.
4. **Go back and set `CORS_ORIGINS` to the real Vercel URL**, then redeploy the
   backend.

Step 4 is the one people forget. Until it is done the frontend loads and every
request fails in the browser with an opaque CORS error, while `curl` against the
API works perfectly — which sends you looking in the wrong place.

---

## 7. Post-deploy verification

```bash
# 1. API is up and can reach Atlas
curl https://your-service.onrender.com/api/health

# 2. Auth works
curl -s -X POST https://your-service.onrender.com/api/auth/caretaker/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"caretaker@demo.com","password":"Demo1234"}'

# 3. CORS is configured for the real frontend origin
curl -s -o /dev/null -w '%{http_code}\n' \
  -X OPTIONS https://your-service.onrender.com/api/auth/caretaker/login \
  -H 'Origin: https://your-app.vercel.app' \
  -H 'Access-Control-Request-Method: POST'
```

Then, in a browser:

- Caretaker sign-in reaches the dashboard.
- The live map renders tiles and a marker.
- Open `/patient/login` on a phone, sign in, allow location, and confirm the
  caretaker dashboard updates within about three minutes.
- Walk outside the safe zone (or move the zone) and confirm an alert appears
  without refreshing.

The last two are the only checks that exercise the whole system. Everything else
can pass while the thing the product exists for is broken.

---

## 8. Seeding production

Don't — the seeder deletes data. To create a first real caretaker, use the
registration form, or:

```bash
curl -X POST https://your-service.onrender.com/api/auth/caretaker/register \
  -H 'Content-Type: application/json' \
  -d '{"name":"Your Name","email":"you@example.com","password":"Choose1Strong"}'
```

Then add patients through the dashboard. Each one's code and one-time password
appear in a dialog on creation; write them down there and then, because only the
hash is stored and nobody can read the password back afterwards.
