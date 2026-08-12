# Weather Explorer

Fetches historical daily weather from Open-Meteo, stores the raw API response in
object storage, and reads it back for visualisation. Built for the InRisk Labs
full-stack case study.

**Live demo:** _<vercel URL>_
**API:** _<render URL>_ · [interactive docs](_<render URL>_/docs)

_Last verified live: 12 August 2026._ The API runs on Render's free tier, which
sleeps after 15 minutes of inactivity — the first request after idle takes
around 30 seconds to wake the container. Everything after that is immediate.

---

## What it does

1. You pick a location and a date range of up to 31 days.
2. The backend calls Open-Meteo's historical archive and writes the **unmodified**
   JSON response to an object store.
3. The dashboard lists what has been stored, opens any file, and charts and
   tabulates the daily values from it.

The read path never touches Open-Meteo. Once a range is stored, everything after
that is served from the bucket.

---

## Stack

**Backend** — Python 3.9, FastAPI, boto3, httpx, pytest
**Frontend** — Next.js (App Router), Tailwind CSS, Recharts
**Storage** — S3-compatible object storage via boto3
**Deployment** — Render (API, Docker) and Vercel (dashboard)

---

## API

Interactive docs are generated from the code at `/docs`.

### `POST /store-weather-data`

```json
{
  "latitude": 23.0225,
  "longitude": 72.5714,
  "start_date": "2024-07-01",
  "end_date": "2024-07-15"
}
```

Validates the input, fetches `temperature_2m_max`, `temperature_2m_min`,
`apparent_temperature_max`, `apparent_temperature_min` and `precipitation_sum`,
and writes the response to the bucket.

```json
{ "status": "ok", "file": "weather_23p0225_72p5714_2024-07-01_2024-07-15_20260812T055755Z.json" }
```

### `GET /list-weather-files`

```json
{ "files": [{ "name": "...", "size": 1210, "created_at": "2026-08-12T05:57:55+00:00" }] }
```

Newest first.

### `GET /weather-file-content/{file}`

Returns the stored JSON. Missing keys return `404` with
`{"status": "error", "message": "not found"}`.

### `GET /geocode?q=`

Resolves a place name to coordinates. Not in the brief — see Design decisions.

### `GET /health`

Liveness probe for the hosting platform.

---

## Design decisions

**Storage is an interface, not a vendor.** `storage.py` defines a
`StorageClient` with two implementations: `S3Storage` (boto3) and
`LocalStorage` (filesystem). Which one runs is decided by whether a bucket and
credentials are configured — routes never know the difference. This meant I
could build and test the whole API before I had any cloud credentials, and it
keeps the test suite offline.

**Deployed against Supabase Storage rather than AWS S3.** My AWS account sat in
activation limbo for four days despite a verified payment method, and the brief
requires a live URL at review time. Supabase Storage speaks the S3 protocol, so
`S3Storage` is written for AWS and runs unchanged against it — the only
difference is `S3_ENDPOINT_URL` in the environment. Removing that variable and
supplying AWS credentials points the same code at S3; the same applies to GCS
via its interoperability endpoint. I would rather ship a working system with a
documented substitution than a broken one with the right logo.

**Validation lives in Pydantic, not in the handlers.** `schemas.py` enforces
latitude and longitude bounds, `start_date <= end_date`, and the 31-day cap.
FastAPI rejects bad input before any business logic runs and publishes the
constraints in the OpenAPI schema, so `/docs` documents them for free.

**`end_date` cannot be in the future.** Not in the brief. Open-Meteo's archive is
ERA5 reanalysis with roughly a five-day lag, so a future date returns `200` with
empty arrays — a silent failure that looks like a bug in my code. An explicit
`422` with a readable message is more honest.

**Upstream failures return 502, not 500.** If Open-Meteo is down that is not my
server erroring, and the distinction matters to whoever is reading the logs.

**Listing uses `list_objects_v2` with `MaxKeys`.** The service returns only what
is asked for rather than paginating the whole bucket and trimming client-side.

**Filenames encode the query.** The brief specifies
`weather_<lat>_<lon>_<start>_<end>_<timestamp>.json`. I substitute `p` for the
decimal point and `m` for a minus sign, so `23.0225` becomes `23p0225`. Raw
coordinates would put three or four dots in a filename, and some tooling reads
the last one as the extension.

**A place-name search sits on top of the coordinate fields.** The brief specifies
latitude and longitude inputs and those remain the fields the request is built
from — the search only fills them in, and they stay editable. Typing coordinates
by hand is not how anyone uses a weather tool. The lookup is proxied through the
backend rather than called from the browser, which keeps every upstream call on
one side where it can be cached or rate-limited later, and it is debounced by
350 ms so a city name costs one request rather than one per keystroke.

**Storing a range opens it immediately.** The obvious flow was fetch, then find
your own file in a list, then click it. The file list is for returning to earlier
fetches, not for reaching the thing you created a second ago.

**Chart shows the range, not two independent lines.** Daily temperature is a
band, so min and max are drawn as a filled area with the two bounds on top and
apparent temperature dashed inside it. The table repeats this as a small bar per
row, drawn on the scale shared by the whole file, so you can scan for volatile
days without reading numbers. Warm ochre means maximum and cool blue means
minimum everywhere in the interface — chart, table, and tooltip.

---

## Assumptions

- Buckets are private. Files are served through the API rather than by public
  URL, so access stays under application control.
- The 31-day cap comes from the brief. Longer ranges are a paging problem, not a
  single-request one.
- Files are immutable once written. The timestamp in the name means an identical
  query stores a second file rather than overwriting the first, which keeps a
  history of what was fetched when.
- The stored JSON is Open-Meteo's response verbatim, including its `daily_units`
  block. The frontend reads units from the file rather than assuming Celsius.

---

## Running locally

**Prerequisites:** Python 3.9+, Node 18+

### Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env              # then fill it in, see below
uvicorn main:app --reload
```

API on `http://127.0.0.1:8000`, docs at `/docs`.

**`.env`**

```bash
# Leave the S3 block empty to use the local filesystem instead.
LOCAL_STORAGE_DIR=./data

S3_BUCKET=your-bucket
S3_ENDPOINT_URL=          # omit for AWS S3; set for any S3-compatible provider
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
```

With no bucket configured the app writes to `./data` and every endpoint behaves
identically, which is how the tests run.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Dashboard on `http://localhost:3000`. Set `NEXT_PUBLIC_API_URL` to point at a
deployed API; it defaults to `http://127.0.0.1:8000`.

### Tests

```bash
cd backend
pytest -q
```

Seven tests covering coordinate bounds, date ordering, the 31-day cap, future
dates, the 404 body, and the list response shape. They run against
`LocalStorage`, so they need neither credentials nor a network.

---

## Layout

```
backend/
  main.py          FastAPI app, CORS, router mount
  routes.py        the five endpoints
  schemas.py       request and response models, all validation
  weather.py       Open-Meteo archive and geocoding clients
  storage.py       StorageClient interface, S3 and local implementations
  config.py        environment configuration
  test_api.py      pytest suite
  Dockerfile

frontend/
  app/page.tsx     dashboard
  app/globals.css  design tokens and base styles
```

---

## Deployment

**API** — Docker on Render, root directory `backend`. The Dockerfile binds
`0.0.0.0` and reads `$PORT`, so it deploys unchanged to Cloud Run or App Runner.
Storage credentials are set as environment variables in the dashboard, never in
the image.

**Dashboard** — Vercel, root directory `frontend`, with `NEXT_PUBLIC_API_URL`
set to the API URL.

**To redeploy:** push to `main`. Both platforms build automatically. If the API
has been idle it needs one warm-up request before the dashboard will load data.

---

## What I would do next

- **Cache by coordinate and range.** A repeated query re-fetches from Open-Meteo
  and writes a duplicate file. Checking the bucket for an existing key first
  would make repeats free.
- **Paginate the file list.** `MaxKeys` caps the response, but a bucket with
  thousands of objects needs a continuation token rather than a ceiling.
- **Presigned URLs for large files.** Streaming multi-megabyte JSON through the
  API is wasteful; a short-lived signed URL would let the browser read the object
  directly.
- **Ranges longer than 31 days.** Split into chunks server-side and stitch them,
  rather than pushing the limit onto the user.

---

## Note on AI assistance

I used an AI assistant for parts of this, which the brief permits. Every design
decision above is mine and I can defend each line, including the ones I rejected
— the storage abstraction exists because I needed to keep working without cloud
credentials, and the `end_date` guard exists because I hit the silent-empty-array
failure myself and decided it deserved an error rather than a shrug.