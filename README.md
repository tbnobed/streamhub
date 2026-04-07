# Social Playout Manager

A production-ready broadcast streaming control platform for managing live video channels, playlists, live RTMP/SRT ingest, and multi-destination restreaming.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Control Plane                        │
│                                                          │
│   React Frontend ──► Nginx ──► Express API ──► PostgreSQL│
│                                    │                     │
│                                    └──► Redis (optional) │
└───────────────────────────┬─────────────────────────────┘
                            │ REST API
┌───────────────────────────▼─────────────────────────────┐
│                      Media Plane                         │
│                                                          │
│   Worker Node ──► FFmpeg ──► RTMP/SRT Destinations       │
│       │                                                  │
│       └──► SRS / RTMP Ingest Server                      │
└─────────────────────────────────────────────────────────┘
```

## Quick Start (Docker Compose)

1. **Clone and configure:**

```bash
git clone https://github.com/yourorg/social-playout-manager.git
cd social-playout-manager
cp .env.example .env
# Edit .env and set PGPASSWORD, SESSION_SECRET, and other required values
```

2. **Start all services:**

```bash
docker-compose up -d
```

3. **Run database migrations:**

```bash
docker-compose exec api pnpm --filter @workspace/db run push
```

4. **Access the app:**
   - Web UI: http://localhost (or https://yourdomain.com)
   - API: http://localhost/api/healthz

5. **Default credentials:**
   - Username: `admin` / Password: `admin123`
   - Username: `operator` / Password: `operator123`
   
   **Change these immediately after first login.**

## Self-Hosted Ubuntu Deployment

### Prerequisites

- Ubuntu 22.04 or 24.04
- Docker and Docker Compose v2
- FFmpeg installed on worker nodes
- PostgreSQL 15+ (or use the provided docker-compose)
- Nginx (or use the provided docker-compose)

### Manual Setup

**1. Install system dependencies:**

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Install FFmpeg on worker nodes
sudo apt install -y ffmpeg

# Install Node.js 22 (for direct runs without Docker)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
npm install -g pnpm
```

**2. Configure environment:**

```bash
cp .env.example .env
nano .env
# Set all required variables
```

**3. Start with Docker Compose:**

```bash
docker-compose up -d postgres redis
sleep 10  # Wait for DB to be ready
docker-compose up -d api web nginx worker
```

**4. Run migrations:**

```bash
docker-compose exec api node -e "require('./dist/lib/seed.js').seedIfEmpty()"
```

### Running Workers on Separate Nodes

Each worker node runs independently and reports back to the API:

```bash
cd worker
npm install
npm run build

# Configure environment
export API_URL=https://api.yourdomain.com/api
export WORKER_ID=worker-$(hostname)
export HOSTNAME=$(hostname)

npm start
# or: node dist/index.js
```

Or with systemd:

```ini
# /etc/systemd/system/playout-worker.service
[Unit]
Description=Social Playout Worker
After=network.target

[Service]
Type=simple
User=playout
WorkingDirectory=/opt/playout/worker
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=5
EnvironmentFile=/opt/playout/.env

[Install]
WantedBy=multi-user.target
```

## RTMP / SRT Ingest Setup

### SRS (Simple RTMP Server)

Install SRS for RTMP ingest on your ingest server:

```bash
docker run -d --name srs \
  -p 1935:1935 \
  -p 1985:1985 \
  ossrs/srs:5 \
  ./objs/srs -c conf/docker.conf
```

Workers will pull from `rtmp://srs-host/live/{stream_key}` when a live input is active.

### SRT Ingest

SRT ingest is handled directly by FFmpeg in listener mode:

```
srt://0.0.0.0:9000?mode=listener&streamid={stream_key}
```

Make sure port 9000 (UDP) is open on your firewall.

## FFmpeg Command Examples

### 1. Loop a file to YouTube Live

```bash
ffmpeg -re -stream_loop -1 -i /media/slate.mp4 \
  -c:v copy -c:a copy \
  -f flv rtmp://a.rtmp.youtube.com/live2/YOUR_STREAM_KEY
```

### 2. Play a playlist continuously

```bash
# Create concat playlist
cat > /tmp/playlist.txt <<EOF
file '/media/clip1.mp4'
file '/media/clip2.mp4'
file '/media/bumper.mp4'
EOF

ffmpeg -re -f concat -safe 0 -stream_loop -1 -i /tmp/playlist.txt \
  -c:v copy -c:a copy \
  -f flv rtmp://a.rtmp.youtube.com/live2/YOUR_STREAM_KEY
```

### 3. Receive RTMP and restream to multiple destinations

```bash
ffmpeg -re -i rtmp://localhost/live/STREAM_KEY \
  -c:v copy -c:a copy -f flv rtmp://a.rtmp.youtube.com/live2/YT_KEY \
  -c:v copy -c:a copy -f flv rtmps://live-api-s.facebook.com:443/rtmp/FB_KEY
```

### 4. Receive SRT and restream

```bash
ffmpeg -re \
  -i "srt://0.0.0.0:9000?mode=listener&streamid=STREAM_KEY" \
  -c:v copy -c:a copy -f flv rtmp://a.rtmp.youtube.com/live2/YT_KEY
```

### 5. Fallback slate on source failure

```bash
# Static image slate
ffmpeg -loop 1 -re -i /media/slate.jpg \
  -f lavfi -i aevalsrc=0 \
  -c:v libx264 -preset ultrafast -tune stillimage -b:v 500k \
  -c:a aac -ar 44100 \
  -f flv rtmp://a.rtmp.youtube.com/live2/YOUR_STREAM_KEY
```

## Feature Overview

### Channel Modes

| Mode | Source | Description |
|------|--------|-------------|
| `playlist` | File-based | Loops through uploaded assets in sequence |
| `live_input` | RTMP/SRT | Receives live feed from external contributor |
| `fallback` | File-based | Uses a static slate asset when other sources fail |

### Live Input Protocols

| Protocol | Ingest URL Format |
|----------|-------------------|
| RTMP | `rtmp://ingest.yourdomain.com/live/{stream_key}` |
| SRT | `srt://ingest.yourdomain.com:9000?streamid={stream_key}` |

### Destinations

Supports simultaneous restreaming to:
- YouTube Live (RTMP)
- Facebook Live (RTMPS)
- Generic RTMP
- Custom platform

## Worker API

Workers communicate with the control plane via REST:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/workers/heartbeat` | POST | Worker sends alive signal |
| `/api/workers/jobs` | GET | Worker fetches assigned jobs |
| `/api/workers/jobs/{id}/status` | POST | Worker reports job status/metrics |
| `/api/workers/events` | POST | Worker submits event log |

## Security Notes

- Change default passwords immediately
- Set `SESSION_SECRET` to a random 64-char string
- Use HTTPS in production (enable the HTTPS block in nginx.conf)
- Restrict worker API endpoints to internal network
- Use firewall rules to expose only ports 80/443 publicly

## Database Schema

Key tables:
- `users` — Auth and roles (admin/operator/viewer)
- `channels` — Broadcast channel config and status
- `assets` — Uploaded media files
- `playlists` / `playlist_items` — Ordered asset sequences
- `live_inputs` — RTMP/SRT ingest endpoints with stream keys
- `destinations` — Output destinations (YouTube, RTMP, etc.)
- `youtube_accounts` / `youtube_broadcasts` — YouTube OAuth state
- `worker_nodes` / `playout_jobs` — Worker state and job queue
- `stream_sessions` — Historical session records
- `audit_logs` / `worker_events` — Event and audit trail

## Development

```bash
# Install dependencies
pnpm install

# Start database
docker-compose up -d postgres

# Push schema
pnpm --filter @workspace/db run push

# Start API server
pnpm --filter @workspace/api-server run dev

# Start frontend
pnpm --filter @workspace/social-playout run dev
```
