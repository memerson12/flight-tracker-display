Backend README

Setup

1. Install dependencies (pnpm recommended):

   cd backend
   pnpm install

2. Ensure native build tools are available for your platform (sharp / better-sqlite3):

   sudo apt-get update
   sudo apt-get install -y build-essential python3 pkg-config libvips-dev

3. Create local runtime configuration (the resulting files are intentionally ignored by Git):

   cp config.example.json config.json
   cp .env.example .env

Config

- Admin password: set via environment variable `ADMIN_PASSWORD`. Do not store credentials in `config.json`.
- Admin sign-in creates an eight-hour, HttpOnly, SameSite=Strict session cookie; the raw password is not stored by the browser. Set `ADMIN_SESSION_TTL_MS` to change the duration.
- Set `ADMIN_COOKIE_SECURE=true` when the app is served over HTTPS. Server restarts intentionally invalidate existing admin sessions.
- Direct cross-origin API access is disabled by default. Set `ALLOWED_ORIGINS` only when a separate trusted origin needs it.

Data locations

- Photos: `backend/photos/`
- Thumbnails: `backend/photos/thumbs/`
- Metadata DB: `backend/data/photos.db` (SQLite, created automatically and migrated from the legacy public path)
- Aircraft registry cache: `backend/data/aircraft-registry.db` (FAA and CASA; organizational names only, no addresses)

Run

- Start server: `pnpm start` (or `node server.js`)
- Run tests: `pnpm test`
- Force-refresh the local aircraft registry: `pnpm update:aircraft-registry -- --force`

API (high-level)

- `GET /api/flights/overhead`
- `GET /api/flights/:flightId/details`
- `GET /api/airports/:icao/arrivals`
- `GET /api/airports/:icao/departures`
- `GET /api/photos`
- `GET/POST/DELETE /api/admin/session`
- `POST /api/photos` (admin)
- `PUT /api/photos/:id` (admin)
- `DELETE /api/photos/:id` (admin)
- `GET /api/settings`
- `PUT /api/settings` (admin)
- `GET /api/config` (admin)
- `PUT /api/config` (admin)

Notes

- Upload size limit defaults to 25MB per photo and can be changed with the `MAX_PHOTO_SIZE` environment variable (in bytes).
- Rate limiting applies to uploads (10 uploads per minute per IP).
- Photo uploads are auto-oriented and re-encoded without public EXIF metadata. When GPS is embedded, the backend stores the coordinates privately and uses `MAPBOX_TOKEN` or `VITE_MAPBOX_TOKEN` to create the coarse location label returned by the API.
- Unknown operators can be classified as business jets from their ICAO type or registry model. Registry imports discard individual names and all address fields; only organizational registered holders/operators can be displayed.
