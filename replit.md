# Social Playout Manager

## Overview
A production-ready broadcast streaming control platform. Includes a React+Vite control plane web app, an Express/PostgreSQL API backend, and a standalone FFmpeg worker service scaffold for Ubuntu/Docker deployment.

## Architecture

```
Port 80 (proxy)
├── /api  →  API Server (port 8080)
└── /     →  Frontend React App (port assigned by env)
```

### Services
1. **`artifacts/social-playout`** — React+Vite frontend (dark UI, Tailwind, shadcn/ui)
2. **`artifacts/api-server`** — Express API + PostgreSQL backend
3. **`worker/`** — FFmpeg playout worker service (standalone, Docker-ready)

## Key Features
- Channel management (start/stop/switch-source) with playout job creation
- **Channel scheduling**: Auto-start/stop streams at configured times with timezone support and day-of-week selection; scheduler runs every 30s on the API server
- **Auto-recovery**: Failed channels automatically restart after 30s cooldown; stops after 5 consecutive failures within 30 min; works for both scheduled and manually-started channels; stale worker jobs reaped after 60s heartbeat timeout; worker checks job DB status before FFmpeg restart to prevent restarting intentionally-stopped streams; scheduler respects manual stops for 2 minutes before auto-restarting scheduled channels
- Asset library (register video/image/audio files)
- Playlist builder with drag-and-drop ordering
- Live RTMP/SRT ingest endpoints with stream key generation
- Multi-destination restreaming (YouTube, Facebook, Twitch, custom RTMP) with per-destination stop/restart controls
- YouTube Live integration (OAuth + broadcast scheduling)
- Stream health monitoring (bitrate, FPS, uptime)
- SRS ingest server health monitoring (version, uptime, active streams, bitrate, clients)
- Per-input SRS stream status (live/inactive, bitrate, video codec/resolution, audio codec/sample rate)
- Worker node management (heartbeat, job polling)
- **Role-based access control**: Workers, Users, and Audit Logs pages are admin-only (both API and frontend protected)
- User timezone preference (selectable from sidebar, saved per user)
- Audit logs

## Database
- PostgreSQL via `lib/db` (Drizzle ORM)
- Key tables: users, channels, assets, playlists, playlist_items, live_inputs, destinations, youtube_accounts, youtube_broadcasts, worker_nodes, playout_jobs, worker_events, audit_logs, stream_sessions

## Auth
- Token-based (in-memory Map, Bearer token in localStorage)
- Password: SHA-256 + SESSION_SECRET env var
- Default credentials: `admin` / `admin123`, `operator` / `operator123`
- **Change these immediately on production deployment**

## Pages (Frontend)
- `/login` — Login page
- `/dashboard` — Overview stats + channel list
- `/channels` — Channel management
- `/channels/:id` — Channel detail + stream control
- `/assets` — Asset library
- `/playlists` — Playlist list
- `/playlists/:id` — Playlist editor (add/remove assets)
- `/live-inputs` — RTMP/SRT ingest endpoints
- `/destinations` — Output destinations
- `/youtube` — YouTube OAuth + broadcast scheduling
- `/workers` — Worker node status + events
- `/logs` — Audit log viewer

## API Routes
All routes under `/api`:
- `GET /api/healthz` — Health check
- `POST /api/auth/login` — Login
- `GET/POST /api/channels` — List/create channels
- `GET/PATCH/DELETE /api/channels/:id` — Channel CRUD
- `POST /api/channels/:id/start` — Start channel
- `POST /api/channels/:id/stop` — Stop channel
- `POST /api/channels/:id/destinations/:destId/stop` — Stop individual destination output
- `POST /api/channels/:id/destinations/:destId/restart` — Restart individual destination output
- `POST /api/channels/:id/switch-source` — Hot-switch source
- `GET /api/channels/:id/preview/:file` — HLS preview files (stream.m3u8 + segments)
- `GET/POST /api/assets` — Asset library
- `GET/POST /api/playlists` — Playlists
- `GET/POST/DELETE /api/playlists/:id/items` — Playlist items
- `GET/POST /api/live-inputs` — Live ingest endpoints
- `GET/POST /api/destinations` — Output destinations
- `GET /api/youtube/accounts` — YouTube accounts
- `GET/POST /api/youtube/broadcasts` — Broadcasts
- `GET /api/workers` — Worker nodes
- `POST /api/workers/heartbeat` — Worker heartbeat
- `GET /api/workers/jobs` — Worker job polling
- `POST /api/workers/jobs/:id/status` — Job status update
- `GET /api/srs/health` — SRS server health status
- `GET /api/srs/streams` — Active SRS streams
- `GET /api/srs/clients` — Connected SRS clients
- `GET /api/srs/input-status` — SRS status matched to live inputs
- `GET /api/logs/audit` — Audit logs

## Worker Service
Located in `worker/`. Runs FFmpeg jobs assigned by the API.
- Polls API every 5s for jobs
- Sends heartbeat every 15s
- Auto-restarts failed FFmpeg processes (up to 5 times per destination)
- Supports: playlist loop, live RTMP/SRT ingest, fallback slate
- **Channel output preview**: Every running FFmpeg job produces a low-bitrate HLS sidecar (800k, 640px, 2s segments) at `/tmp/preview/channel-{id}/`. The API serves these via `GET /channels/:id/preview/:file` and the frontend plays them with HLS.js. Preview dir is cleaned up when the job stops.
- Reports stream health (bitrate/fps) from FFmpeg stderr, throttled to every 5s
- FFmpeg uses `-loglevel info -stats` for progress output
- API rejects worker status updates that try to flip terminal jobs (stopped/failed/completed) back to running
- **Multi-destination architecture**: When >1 destination, spawns separate FFmpeg processes per output to isolate RTMP/RTMPS connections (avoids librtmp TLS conflicts). Single destination uses single process for efficiency.
- **Per-destination health**: Each output reports its own status (connected/connecting/error) via `destinationHealth` JSONB field. Frontend shows per-destination status cards with green/yellow/red indicators.

## Deployment (Docker)
All deployment files live in `deploy/`:
- `deploy/deploy.sh` — One-command deployment for clean Ubuntu servers (installs Docker, builds, migrates DB, starts)
- `deploy/update.sh` — Quick rebuild and redeploy after code changes
- `deploy/docker-compose.yml` — Full stack: postgres, api, frontend (nginx), worker
- `deploy/Dockerfile` — Multi-stage build (api, frontend, worker targets)
- `deploy/nginx.conf` — Reverse proxy: serves frontend static files, proxies `/api/` to API container
- `deploy/.env.example` — Environment variable template (auto-generates secrets on first deploy)
- `.dockerignore` — Build context exclusions

Usage on clean Ubuntu:
```bash
git clone <repo-url> social-playout && cd social-playout
sudo bash deploy/deploy.sh          # first run: installs Docker, builds, starts
sudo bash deploy/deploy.sh --env-only  # just generate .env, edit before full deploy
sudo bash deploy/update.sh          # redeploy after code changes
```

## Environment Variables
- `DATABASE_URL` — PostgreSQL connection string
- `SESSION_SECRET` — Password hashing secret (required)
- `INGEST_HOST` — Hostname for RTMP/SRT ingest URL generation (default: slorg1.obtv.io)
- `SRS_API_URL` — SRS HTTP API base URL for health monitoring (default: http://{INGEST_HOST}:1985)
- `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REDIRECT_URI` — YouTube OAuth
- `PORT` — API server port (8080 in dev)
- `WORKER_ID` — Unique worker identifier
- `API_URL` — Worker → API URL

## Tech Stack
- **Frontend**: React 18, Vite, Tailwind CSS, shadcn/ui (Radix UI), TanStack Query, Wouter, Lucide
- **Backend**: Node.js, Express, Drizzle ORM, PostgreSQL, Zod, Pino
- **Worker**: Node.js, FFmpeg (subprocess), TypeScript
- **Dev**: pnpm workspaces, TypeScript, ESBuild
