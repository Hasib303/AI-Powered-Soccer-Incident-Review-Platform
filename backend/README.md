---
title: Atletico Intelligence Backend
emoji: ⚽
colorFrom: green
colorTo: blue
sdk: docker
app_port: 8000
pinned: false
short_description: Single-camera AI/CV service for offside and goal-line review.
---

# Atletico Intelligence — Backend

Python FastAPI service for single-camera soccer incident review (offside +
goal-line) plus the SQL migrations that define the Supabase Postgres schema
and RLS policies the Next.js frontend talks to.

## Layout

```
backend/
├── pyproject.toml            # uv-managed
├── main.py                   # FastAPI entrypoint, lifespan + CORS
├── settings.py               # pydantic-settings, env-driven config
├── auth.py                   # Supabase JWT validation
├── storage.py                # Supabase Storage upload + signed URLs
├── routes/
│   ├── analyze.py            # POST /analyze/offside, /analyze/goal-line
│   └── extract.py            # POST /extract-clip
├── pipeline/
│   ├── detection.py          # YOLOv8n wrapper (singleton, CPU-only)
│   ├── calibration.py        # Per-clip 4-point homography solver
│   ├── offside.py            # Pure-function offside verdict + rationale
│   ├── goal_line.py          # Pure-function goal-line crossing verdict
│   └── extract.py            # FFmpeg cut + snapshot + frame read
├── schemas/
│   └── payload.py            # Pydantic = ai_payload contract
├── samples/                  # Sample clips + .calib.json files (git-ignored)
├── migrations/               # Supabase SQL migrations
└── tests/                    # 14 pure-geometry tests
```

## Prerequisites

- Python 3.11 or 3.12 (managed by `uv`)
- `ffmpeg` on PATH (`brew install ffmpeg`)
- `uv` package manager (`brew install uv`)

## Run locally

```bash
cd backend
uv sync                                              # one time, installs deps
cp .env.example .env                                 # then fill in SUPABASE_*
uv run uvicorn main:app --reload --port 8000
```

Then:

```bash
curl http://localhost:8000/health
# {"status":"ok","model_loaded":true,"samples_dir":".../backend/samples"}

open http://localhost:8000/docs                      # interactive Swagger UI
```

## Run the tests

```bash
uv run pytest -q
```

You should see 14 tests pass — covering offside geometry across attacking
directions, ball-position checks, low-confidence fallback, goal-line
trajectory crossing, and homography correctness.

## Environment variables

See `.env.example`. The interesting ones:

| Var | Default | Purpose |
| --- | --- | --- |
| `ALLOWED_ORIGINS` | `http://localhost:3000,http://127.0.0.1:3000` | CORS allow-list for the Next.js frontend |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | empty | Required for the `/extract-clip` endpoint to upload to Storage |
| `SUPABASE_JWT_SECRET` | empty | When set, every endpoint requires a valid Supabase user JWT |
| `YOLO_MODEL` | `yolov8n.pt` | Auto-downloaded on first run (~6 MB) |
| `YOLO_PERSON_CONFIDENCE` | `0.4` | Detection threshold for players |
| `YOLO_BALL_CONFIDENCE` | `0.25` | Detection threshold for the ball (smaller object → lower threshold) |
| `HUMAN_REVIEW_THRESHOLD` | `0.6` | Combined confidence under which the verdict becomes `human_review_required` |

## Endpoints

| Verb | Path | Body | Returns |
| --- | --- | --- | --- |
| GET | `/health` | — | `{ status, model_loaded, samples_dir }` |
| POST | `/analyze/offside` | `{ clip_id, locked_frame_ms, attacking_team }` | `OffsideAnalysis` JSON |
| POST | `/analyze/goal-line` | `{ clip_id, frame_range_ms }` | `GoalLineAnalysis` JSON |
| POST | `/extract-clip` | `{ source_path, start_ms, end_ms, out_key }` | `{ clip_url, snapshot_url, duration_ms }` |

The two `/analyze/*` endpoints return the exact `ai_payload` shape that
gets written to `incidents.ai_payload` in Postgres.

## Run via Docker (production-like, portable)

A `Dockerfile` ships in this directory. From the repo root:

```bash
docker compose up --build backend     # builds and runs just the AI service
# or
docker compose up --build              # whole stack (backend + frontend)
```

Image details:

- Base: `python:3.12-slim`
- System deps: `ffmpeg`, `libgl1`, `libglib2.0-0` (OpenCV needs the last two)
- Locked Python deps via `uv sync --frozen --no-dev`
- YOLOv8n weights pre-downloaded at build time so the first `/analyze`
  call doesn't pay the model-fetch cost
- Healthcheck on `/health`
- Listens on `$PORT` (default `8000`); also exposes `7860` for Hugging Face Spaces

## Deploying

Same image works as a Hugging Face Space (Docker SDK, free CPU tier — no
card required at signup). Create a Space, set the SDK to `Docker`, and
push this directory to the Space's git repo. The Space builds the
`Dockerfile` and exposes the `$PORT` automatically.

## Sample clips

`samples/` is intentionally git-ignored. Drop `.mp4` files here and pair
each with a `<clip_id>.calib.json` (4 image-pixel points → 4 pitch
metres). See `pipeline/calibration.py` for the exact JSON shape.

## Migrations

`migrations/` contains the SQL that defines Postgres schema, RLS, and
storage policies. See `migrations/README.md` for how to apply them
against a Supabase Cloud or local Docker project.
