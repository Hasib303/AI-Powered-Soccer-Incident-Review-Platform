# Atlético Intelligence

**AI-powered single-camera soccer incident review platform** for grassroots and semi-professional leagues. Match officials trigger an instant video review on a single fixed camera; the system runs computer vision on the locked frame, returns a verdict (offside / goal / human-review-required), and renders a top-down pitch diagram with the offside line drawn at the second-last defender or the ball trajectory across the goal-line window.

Built against the BRD at `BRD for Atlético Intelligence — AI-Powered Soccer Incident Review Platform.pdf`. MVP scope = Offside review (primary) + Goal review (simpler / partially automated). Foul / handball / penalty / red-card flows are intentionally out of scope per BRD §2.2.

---

## 🚀 Live demo


| Surface                     | URL                                                                                                                                              | Notes                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| **Frontend**                | [https://ai-powered-soccer-incident-review-p.vercel.app](https://ai-powered-soccer-incident-review-p.vercel.app)                                 | Vercel free tier, auto-deploys from `main`                    |
| **Backend (AI/CV service)** | [https://hasib303-atletico-backend.hf.space](https://hasib303-atletico-backend.hf.space)                                                         | Hugging Face Space, free CPU tier; FastAPI Swagger at `/docs` |
| **Source code**             | [https://github.com/Hasib303/AI-Powered-Soccer-Incident-Review-Platform](https://github.com/Hasib303/AI-Powered-Soccer-Incident-Review-Platform) | Mono-repo                                                     |


### Demo credentials


| Role           | Email                        | Password                |
| -------------- | ---------------------------- | ----------------------- |
| Match Official | `official@demo.atletico.app` | `AtleticoOfficial!2026` |
| Team Viewer    | `viewer@demo.atletico.app`   | `AtleticoViewer!2026`   |


> The HF Space sleeps after ~15 minutes of inactivity. The first request
> after sleep takes 30+ seconds while the container wakes up; subsequent
> requests are snappy. If `Offside Check` seems to hang on the first try,
> just wait — the Python service is warming up.

---

## 🧱 Architecture

```
┌────────────────────────────┐   ┌────────────────────────────┐
│  Next.js 16 (Vercel)       │   │  Supabase (managed cloud)  │
│  - App Router + RSC        │   │  - Postgres (RLS-first)    │
│  - Tailwind v4             │   │  - Auth (JWT)              │
│  - shadcn-style primitives │ ◄─┼─ Realtime channels         │
│  - Server actions          │   │  - Storage (private clips) │
│  - hls.js HLS playback     │   │                            │
└──────────┬─────────────────┘   └────────────────────────────┘
           │ HTTPS
           ▼
┌──────────────────────────────────┐
│  FastAPI (Hugging Face Space)    │
│  - YOLOv8n CV inference          │
│  - 4-point homography per match  │
│  - Offside / goal-line geometry  │
│  - FFmpeg clip extraction        │
│  - RTMP/HLS stream worker        │
└──────────────────────────────────┘
```

**Three layers, three free tiers, no credit card needed.** Every layer
runs on its respective vendor's free plan.

---

## ⚡ Quick start (Docker)

If you have Docker installed, the entire stack runs with one command:

```bash
git clone git@github.com:Hasib303/AI-Powered-Soccer-Incident-Review-Platform.git
cd AI-Powered-Soccer-Incident-Review-Platform
cp .env.example .env
# Edit .env and paste your Supabase project values
docker compose up --build
```

After ~5–10 minutes (first build downloads PyTorch + ultralytics + YOLO weights), the stack is up:

- Frontend: [http://localhost:3000](http://localhost:3000)
- Backend: [http://localhost:8000](http://localhost:8000)
- Backend Swagger: [http://localhost:8000/docs](http://localhost:8000/docs)

Subsequent boots take seconds (cached layers).

---

## 🔧 Manual setup (without Docker)

### Prerequisites

- Node 20+
- Python 3.12 (managed by `[uv](https://docs.astral.sh/uv/)`)
- `pnpm` (`npm install -g pnpm`)
- `ffmpeg` (`brew install ffmpeg` on macOS)
- A Supabase project ([free signup, no card](https://supabase.com))

### 1. Apply the SQL migrations

Run the files in `backend/migrations/` against your Supabase project, in
order:

1. `0001_init.sql` — schema (8 tables + enums + Realtime publication)
2. `0002_rls.sql` — RLS policies + helper functions
3. `0003_storage.sql` — Storage bucket policies
4. `0004_video_source.sql` — upload + stream support
5. `0005_audit_publish.sql` — audit-events Realtime
6. `seed.sql` — demo data (one team, three teams, two matches)

Apply via the Supabase Dashboard → SQL Editor. Detailed instructions:
`backend/migrations/README.md`.

### 2. Create the demo auth users

Supabase Dashboard → Authentication → Users → **Add user** for the two
demo emails listed above. Then re-run `seed.sql` with their UUIDs:

```sql
SET app.demo_official_user_id = '<official-uuid>';
SET app.demo_viewer_user_id   = '<viewer-uuid>';
-- (paste the contents of backend/migrations/seed.sql below)
```

### 3. Configure environment variables

```bash
# Backend
cd backend
cp .env.example .env
# Fill in SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
# SUPABASE_JWT_SECRET. Leave AUTH_REQUIRED=false for local dev.

# Frontend
cd ../frontend
cp .env.example .env.local
# Fill in NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
# SUPABASE_SERVICE_ROLE_KEY. Leave AI_SERVICE_URL=http://127.0.0.1:8000.
```

### 4. Run both services

```bash
# Tab 1
cd backend
uv sync
uv run uvicorn main:app --reload --port 8000

# Tab 2
cd frontend
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000), sign in with the demo official account,
and walk through the 12-step demo path documented in `TESTING.md`.

---

## ✨ Features

### Match Official surface

- **My Assignments** — table of matches assigned to the official
- **New Match** — upload an MP4 (≤500 MB) **or** connect a live RTMP/HLS
stream (e.g., `https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8`)
for real-time analysis
- **Live Console** — video preview with custom timeline scrubber,
Offside / Goal Check action buttons, real-time match log fed by
Supabase Realtime, color-coded stream-status banner
- **Offside Review** — click Offside Check, scrub to the moment the ball
is played, click Review This Frame; YOLO identifies attacker /
second-last defender / ball, projects to pitch metres via 4-point
homography, computes verdict + confidence + rationale
- **Goal-Line Review** — click Goal Check, scrub to ~1 s before the ball
reaches the line; system samples 13 frames across a 4.5-second window,
tracks the ball, checks ball-radius crossing
- **Incident Detail** — verdict card + confidence bar + AI rationale +
top-down SVG pitch diagram + 300-char referee note (profanity-filtered)
  - download / delete clip (incident metadata persists per BRD §3.3)
- **Live Stream Connect** — separate page to attach an RTMP/HLS source
to an existing match; FFmpeg-based ingest worker maintains a 30-second
rolling buffer, with `connecting → connected → buffering → reconnecting`
state machine and exponential-backoff reconnect

### Team Viewer surface

- **Match History** — list of recent matches the viewer's team is on
- **Read-only incident detail** — same VerdictCard + PitchDiagram as the official's view, but action buttons hidden, note input read-only
- **RLS-enforced isolation** — viewers can only see incidents with `status='ready'` and `deleted_clip_at IS NULL`. Even guessing an incident URL returns 404 if the row isn't in their visible set.

---

## 📁 Repository layout

```
.
├── backend/                  # Python FastAPI + YOLOv8 + FFmpeg
│   ├── main.py
│   ├── pipeline/             # Detection, calibration, offside/goal-line, stream worker
│   ├── routes/               # /analyze/*, /streams/*, /extract-clip, /samples
│   ├── schemas/              # Pydantic = ai_payload contract
│   ├── migrations/           # 0001–0005 + seed.sql (SQL + RLS + Storage policies)
│   ├── tests/                # pytest (18 passing)
│   ├── Dockerfile
│   └── README.md             # Backend-specific docs (also serves as the HF Space card)
├── frontend/                 # Next.js 16 + TypeScript + Tailwind v4 + Supabase SSR
│   ├── src/app/              # App Router routes (login, official/, viewer/)
│   ├── src/components/       # UI primitives + clip-player + pitch-diagram + verdict-card + ...
│   ├── src/lib/              # Auth, ai-service, video-source, profanity, server actions
│   ├── src/proxy.ts          # Next.js 16 proxy (renamed from middleware)
│   ├── Dockerfile
│   └── README.md
├── docker-compose.yml        # Wires backend + frontend on a shared network
├── .env.example              # Template for the variables docker-compose reads
├── TESTING.md                # End-to-end verification runbook (15 deep-test sections)
└── README.md                 # ← you are here
```

---

## 🧪 Testing

Full step-by-step verification runbook in `[TESTING.md](./TESTING.md)`.
Quick version:

```bash
# Backend
cd backend && uv run pytest -q              # 18 passed

# Frontend
cd frontend && pnpm exec tsc --noEmit       # clean
cd frontend && pnpm build                   # 12 routes registered

# End-to-end on the live URL
# Open https://ai-powered-soccer-incident-review-p.vercel.app
# Sign in as the official → walk the 12-step smoke from TESTING.md
```

---

## 📚 Reference docs

- `[backend/README.md](./backend/README.md)` — service layout, run instructions, deployment notes (also doubles as the HF Space's metadata card)
- `[frontend/README.md](./frontend/README.md)` — routes, lib/ utilities, Vercel deploy notes
- `[backend/migrations/README.md](./backend/migrations/README.md)` — how to apply the migrations to a Supabase Cloud or local-Docker project
- `[TESTING.md](./TESTING.md)` — every feature with concrete pass criteria + failure-mode → fix mapping
- BRD PDF (locally only) — `BRD for Atlético Intelligence — AI-Powered Soccer Incident Review Platform.pdf`

