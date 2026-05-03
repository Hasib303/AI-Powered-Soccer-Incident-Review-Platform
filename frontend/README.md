# Atlético Intelligence — Frontend

Next.js 16 (App Router) + TypeScript + Tailwind v4 + Supabase Auth/SSR
+ Realtime. Deploys to Vercel; calls the Python AI service for verdicts
and Supabase REST/Realtime for everything else.

## Prerequisites

- Node 20+
- `pnpm` (`npm install -g pnpm`)
- Backend AI service reachable at `AI_SERVICE_URL` (default `http://127.0.0.1:8000`)
- A Supabase project with the migrations from `backend/migrations/` applied

## Setup

```bash
cd frontend
pnpm install
cp .env.example .env.local
# Fill in NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
# SUPABASE_SERVICE_ROLE_KEY (same values as backend/.env, with the
# NEXT_PUBLIC_ prefix on the URL + anon key) and AI_SERVICE_URL.
pnpm dev
```

Then open <http://localhost:3000>. Unauthenticated users land on
`/login`. Sign in with the demo official or viewer credentials you
created in Supabase.

## Routes

| Path | Role | Purpose |
| --- | --- | --- |
| `/` | public | Redirects to `/login` |
| `/login` | public | Email + password sign-in |
| `/official/assignments` | official, admin | List of assigned matches |
| `/official/matches/[id]/console` | official, admin | Live review console (Offside / Goal Check, frame scrubber, AI verdicts) |
| `/official/matches/[id]/incidents` | official, admin | All incidents on a match |
| `/official/incidents/[id]` | official, admin | Full incident detail (verdict, pitch diagram, referee note, delete clip) |
| `/viewer` | viewer | Match history dashboard |
| `/viewer/matches/[id]/incidents` | viewer | Read-only list, filtered by RLS to `status='ready'` |
| `/viewer/incidents/[id]` | viewer | Read-only detail (no actions) |

The proxy (`src/proxy.ts`) refreshes the Supabase session on every
request and bounces unauthenticated users to `/login`.

## Architecture

```
src/
├── app/
│   ├── login/                # Sign-in page + server actions
│   ├── official/             # Match Official surface
│   └── viewer/               # Read-only Team Viewer surface
├── components/
│   ├── app-shell.tsx         # Role-aware sidebar + sign-out
│   ├── clip-player.tsx       # HTML5 video + scrubber + locked-frame marker
│   ├── pitch-diagram.tsx     # 105×68m SVG pitch with attacker/defender/ball/offside line
│   ├── verdict-card.tsx      # Verdict + confidence + AI rationale
│   ├── referee-note.tsx      # 300-char note input
│   └── ui/                   # Hand-built shadcn-style primitives
├── lib/
│   ├── auth.ts               # requireUser / requireRole (server)
│   ├── ai-service.ts         # Python /analyze fetch wrapper
│   ├── actions/incidents.ts  # createIncident, lockFrame, analyzeIncident, saveNote, deleteClip
│   ├── database.types.ts     # TS types mirroring backend/migrations
│   ├── supabase/             # server / browser / proxy clients
│   └── utils.ts              # cn(), formatClock(), formatPercent(), relativeKickoff()
└── proxy.ts                  # Next.js 16 Middleware → Proxy convention
```

## End-to-end demo flow

1. Sign in as the official.
2. `/official/assignments` shows the live match — open the console.
3. Click **Offside Check**. Incident row created with status `capturing`.
4. Scrub the timeline to the moment the ball is played, click **Review this frame**.
5. The console calls the Python service, writes the AI payload + verdict back to Supabase. Status transitions to `ready` (or `human_review_required` when confidence < 0.6).
6. Open the incident detail — verdict card, pitch diagram, referee note, delete-clip action.
7. Sign out, sign back in as the viewer to see the same incident in read-only form.

## Run via Docker

A `Dockerfile` ships in this directory and is wired into the root
`docker-compose.yml`. From the repo root:

```bash
docker compose up --build              # frontend + backend on the same network
```

The image is a three-stage Next.js standalone build (~150 MB final).
`NEXT_PUBLIC_*` env vars are injected as build args from the root `.env`
file because Next.js inlines them into the client bundle at build time.
Server-side secrets (`SUPABASE_SERVICE_ROLE_KEY`, `AI_SERVICE_URL`) are
read at runtime from the container environment.

Inside compose, the frontend reaches the backend via the service name:
`AI_SERVICE_URL=http://backend:8000`. Outside compose (e.g., local `pnpm
dev` against a docker-compose'd backend), use `http://127.0.0.1:8000`.

## Deploy to Vercel

- Connect the repo, set the project's "Root Directory" to `frontend`.
- Add the same env vars as `.env.local` to the Vercel project.
- Push to `main`; Vercel builds with Turbopack.

## Verify

```bash
pnpm exec tsc --noEmit    # type-check
pnpm build                 # full production build (uses placeholder env vars OK)
```

A successful `pnpm build` should print 10 routes plus the Proxy entry.
