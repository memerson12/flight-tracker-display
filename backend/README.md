Backend README

Setup

1. Install dependencies (pnpm recommended):

   cd backend
   pnpm install

2. Ensure native build tools are available for your platform (sharp / better-sqlite3):

   sudo apt-get update
   sudo apt-get install -y build-essential python3 pkg-config libvips-dev

Config

- Admin password: set via environment variable ADMIN_PASSWORD or add `adminPassword` in `backend/config.json`.

Data locations

- Photos: `backend/photos/`
- Thumbnails: `backend/photos/thumbs/`
- Metadata DB: `backend/photos/photos.db` (SQLite, created automatically)

Run

- Start server: `pnpm start` (or `node server.js`)
- Run tests: `pnpm test`

API (high-level)

- `GET /api/flights/overhead`
- `GET /api/flights/:flightId/details`
- `GET /api/airports/:icao/arrivals`
- `GET /api/airports/:icao/departures`
- `GET /api/photos`
- `POST /api/photos` (admin)
- `PUT /api/photos/:id` (admin)
- `DELETE /api/photos/:id` (admin)
- `GET /api/settings`
- `PUT /api/settings` (admin)
- `GET /api/config` (admin)
- `PUT /api/config` (admin)

Notes

- Upload size limit defaults to 8MB and can be changed with `MAX_PHOTO_SIZE` env var.
- Rate limiting applies to uploads (10 uploads per minute per IP).
