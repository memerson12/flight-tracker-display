# Flight Tracker Display Plan

## Purpose
Build a Raspberry Pi powered, OLED-friendly flight display that shows nearby flights and automatically switches to a family photo slideshow when no flights are visible. The system should run locally, be resilient to intermittent internet, and offer a local admin portal for photos and location settings.

## Goals
- Show live flight cards with airline, route, aircraft, and telemetry data.
- Switch to a slideshow of local photos when no flights are present.
- Provide an admin portal in the React app for uploads and configuration.
- Run fully on-device (flight data via backend adapters, photos stored locally).
- Stay OLED-safe (true black backgrounds, subtle motion, burn-in avoidance).

## Architecture overview

### Frontend (this repo)
- Vite + React + Tailwind + shadcn/ui.
- Polls `/api/flights/overhead` and renders `FlightDisplay`.
- Switches to `PhotoSlideshow` when flights are absent.
- Admin portal at `/admin` for photo management and location settings.

### Backend (moved from prototype)
- Node/Express service under `backend/`.
- Flight adapters for FlightRadar24 (default) and OpenSky.
- Photo API with local storage, thumbnails, and SQLite metadata.
- Static photo serving at `/photos`.

## Decisions already made
- Photos are stored locally on the Pi.
- Admin portal is built into the React app at `/admin`.
- Default flight provider is FlightRadar24.
- Admin auth uses a single password (`ADMIN_PASSWORD` env or `backend/config.json`).

## Phase 1: Backend integration (from prototype)

### Tasks
- Copy `/Users/Michael/projects/flights-frame/backend` into `flight-tracker-display/backend`.
- Keep existing endpoints:
  - `GET /api/flights/overhead`
  - `GET /api/flights/:flightId/details`
  - `GET /api/airports/:icao/arrivals`
  - `GET /api/airports/:icao/departures`
  - `GET/POST/PUT/DELETE /api/photos`
  - `GET /api/health`
- Serve `/photos` statically from `backend/photos/`.
- Add `backend/.env.example` with `ADMIN_PASSWORD`, `OPENSKY_CLIENT_ID`, `OPENSKY_CLIENT_SECRET`.
- Add a `backend/config.json` template with location/area and provider config.

### Expected output
- Backend can run locally with `pnpm install` + `pnpm start` in `backend/`.
- `/api/photos` supports upload and listing, storing files locally.

## Phase 2: Data contract and normalization

### Tasks
- Define the normalized flight payload expected by the frontend (`src/types/flight.ts`).
- Add a transform layer that maps adapter output into the UI data shape.
- Convert units to UI conventions:
  - Altitude: feet
  - Speed: knots
  - Vertical speed: feet per minute
  - Heading: degrees
- Fill missing values gracefully (unknown airline, aircraft, airports).

### Implementation option (recommended)
- Normalize in the backend so the frontend stays clean and stable.

## Phase 3: Frontend live polling and mode switching

### Tasks
- Replace `sampleFlights` usage with React Query data from `/api/flights/overhead`.
- Add adaptive polling:
  - Faster interval when flights are present (e.g., 10-15s).
  - Slower interval when no flights are present (e.g., 30-60s).
- Track consecutive empty polls and switch to slideshow after threshold.
- Fade between flight display and slideshow to keep OLED-friendly motion.

### Acceptance criteria
- Flights render reliably with live data.
- Slideshow appears when no flights are detected.
- Switching is smooth and avoids flicker.

## Phase 4: Photo slideshow integration

### Tasks
- Fetch `/api/photos` (enabled photos only).
- Preload next image; handle load errors gracefully.
- Support fallback to black screen if there are no photos.
- Respect slideshow settings (interval, shuffle, fit mode).

### Notes
- Use `/photos/thumbs/*` for admin lists and `/photos/*` for display.
- Keep aspect ratio and avoid upscaling smaller images too aggressively.

## Phase 5: Admin portal in React app

### Features
- `/admin` route with password login.
- Upload photos (drag/drop + file picker).
- Edit caption, enable/disable, delete photos.
- Reorder photos (drag/drop or move up/down).
- Slideshow settings:
  - Interval (seconds)
  - Shuffle toggle
  - Fit mode (cover/contain)
- Location editor:
  - Latitude/longitude + radius (km) or rectangle bounds.
  - Provider selection (FlightRadar24/OpenSky).

### API needs
- `/api/photos` (already exists in prototype).
- Add settings endpoints if needed:
  - `GET /api/settings`
  - `PUT /api/settings` (admin)
- Add config update endpoint for location/provider (admin).

## Phase 6: Deployment on Raspberry Pi

### Tasks
- Build frontend and serve via backend (static build from Express).
- Configure systemd service for backend.
- Configure Chromium kiosk to open `http://localhost:8000/`.
- Ensure storage path is on reliable media (prefer SSD for photos).

### Kiosk checklist
- Fullscreen mode enabled.
- Disable screen sleep (unless managed explicitly for burn-in).
- Startup script for Chromium on boot.

## Risks and mitigations

### Flight provider stability
- FlightRadar24 is unofficial; may change or rate limit.
- Mitigation: support OpenSky with credentials as a fallback.

### Local storage constraints
- Limited space on SD cards.
- Mitigation: resize images on upload and cap file sizes.

### Burn-in risk
- Static UI elements can burn in.
- Mitigation: glow animations, subtle shifts, and slideshow rotation.

## Validation plan

### Backend
- `GET /api/health` returns provider and config status.
- Upload photos and verify `/photos` URLs render.

### Frontend
- Simulate empty flights and confirm slideshow appears.
- Simulate flights and confirm slideshow exits.
- Admin portal can upload, edit, reorder, and delete.

## Next steps
1. Copy backend into this repo and confirm it runs.
2. Implement normalization so frontend can consume real data.
3. Replace mock flights with live polling + mode switching.
4. Build `/admin` portal and connect to photo APIs.
5. Add deployment notes and kiosk startup scripts.
