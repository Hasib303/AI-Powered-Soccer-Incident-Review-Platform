# Atlético Intelligence — End-to-End Test Runbook

A step-by-step verification of every feature in the platform. Run sections
top-to-bottom on a fresh boot. Each row tells you exactly **what to do**,
**what to look for**, and **what counts as passed**.

> **Public test stream** for items 4 + 5: `https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8`

---

## 1. Prerequisites — confirm once before any test (~5 min)

| # | Check | How to verify | Expected |
| - | - | - | - |
| P1 | Postgres migrations applied | Supabase Dashboard → SQL Editor → run `select count(*) from pg_tables where schemaname='public'` | Returns 8 |
| P2 | Migration 0004 applied | `select column_name from information_schema.columns where table_name='matches' and column_name in ('video_source_kind','calibration','stream_state')` | 3 rows |
| P3 | Storage buckets exist | Dashboard → Storage | `clips` and `snapshots` both **private** |
| P4 | Demo auth users exist | Dashboard → Authentication → Users | Both `official@…` and `viewer@…`, **Email Confirmed** = ON |
| P5 | Seed users mapped | SQL Editor: `select role, display_name from users_profile` | Two rows: `official` + `viewer` |
| P6 | `backend/.env` filled | `grep -c '^SUPABASE_URL=' backend/.env` | 1 |
| P7 | `frontend/.env.local` filled | `grep -c '^NEXT_PUBLIC_SUPABASE_URL=' frontend/.env.local` | 1, with the **real** project URL (not `placeholder.supabase.co`) |
| P8 | `ffmpeg` on PATH | `which ffmpeg` | `/opt/homebrew/bin/ffmpeg` (or similar) |
| P9 | Sample clips present | `ls backend/samples/clip_*.mp4` | Both `clip_offside_01.mp4` and `clip_goal_01.mp4` |

If any check fails, stop and fix before going further — every other test depends on these.

---

## 2. Automated checks (~30 s)

```bash
# 1. Python pipeline tests (14 unit + 4 endpoint smoke)
cd backend && uv run pytest -q

# 2. Frontend type check
cd ../frontend && pnpm exec tsc --noEmit

# 3. Frontend production build
pnpm build
```

**Pass criteria:** `18 passed`, no TSC errors, `pnpm build` prints **12 routes** + a `Proxy (Middleware)` line.

---

## 3. Boot the services

### Native (faster iteration)

```bash
# Tab 1
cd backend && uv run uvicorn main:app --reload --port 8000

# Tab 2
cd frontend && pnpm dev
```

### Docker compose (matches the deploy environment)

```bash
# At the repo root, with .env populated from .env.example:
docker compose up --build
```

The frontend is at `http://localhost:3000`, the backend at
`http://localhost:8000`. First build takes ~5–10 minutes (PyTorch + YOLO
weights). Subsequent `up` calls reuse cached layers and start in seconds.

Health probe:

```bash
curl -s http://127.0.0.1:8000/health | python3 -m json.tool
# Expect: {"status":"ok","model_loaded":true,"samples_dir":".../samples"}
```

Open `http://localhost:3000` — should redirect to `/login`.

---

## 4. Whole-system smoke — 10-minute happy path

Stop on the first failure and drop into the per-feature deep test for that area.

| Step | Action | Pass criteria |
| - | - | - |
| S1 | Sign in as `official@…` | Lands on `/official/assignments` with at least one row |
| S2 | Click **Console** on the live seeded match | Console renders, video preview loads, REC pulse visible, match log on the right |
| S3 | Click **Offside Check** | "Active review" card appears, status pill = `Capturing` |
| S4 | Scrub to ~8.0 s and click **Review This Frame** | Status moves through `Processing` → `Ready` (or `Human Review`) within ~2 s |
| S5 | Click **Open detail** on the verdict card | Verdict card with confidence bar, rationale list, SVG pitch diagram with attacker/defender/ball/offside line |
| S6 | Type a referee note (≤300 chars), click **Save note** | "Note saved." in green |
| S7 | Click **Download clip** | Browser downloads `incident-<id>-offside-…mp4` |
| S8 | Click **Delete clip** → confirm | "This clip has been deleted" placeholder appears; verdict + note still visible |
| S9 | Sign out → sign in as `viewer@…` | Lands on `/viewer` with the seeded match visible |
| S10 | Click into the match → click into the `goal_line` incident | VerdictCard + PitchDiagram render, **no** action buttons, note is read-only |
| S11 | Trigger a Goal Check on the goal sample match (back as official) | Trajectory drawn on the diagram, crossing-frame timestamp shown |
| S12 | Open `/official/matches/[id]/stream` → paste the Mux test URL → **Connect** | Within 5–10 s status pill turns `connected`, segment count climbs |

If S1 → S12 all pass, the platform is demo-ready.

---

## 5. Per-feature deep tests

### F1 — Authentication & roles (BRD §1.3, §3.1)

| Test | Steps | Expected |
| - | - | - |
| F1.1 Official login | Sign in as `official@…` | Redirected to `/official/assignments` |
| F1.2 Viewer login | Sign in as `viewer@…` | Redirected to `/viewer` |
| F1.3 Wrong password | Enter a bad password | Inline red error: "Invalid login credentials" |
| F1.4 Role gating | While signed in as viewer, navigate to `/official/assignments` | Proxy bounces to `/viewer` |
| F1.5 Anonymous gating | Sign out, navigate to `/official/incidents/abc` | Bounced to `/login?next=/official/incidents/abc` |
| F1.6 Sign-out | Click Sign Out in the sidebar | Lands on `/login`, no `sb-…` cookies in `document.cookie` |

### F2 — Match management (BRD §2.1.1, §2.1.2)

| Test | Steps | Expected |
| - | - | - |
| F2.1 Assignments list | `/official/assignments` | Seeded matches show with kickoff time, teams, league, venue, status |
| F2.2 Empty league guard | Temporarily empty `leagues` → `/official/matches/new` | "No leagues or teams yet" card; no upload form |
| F2.3 Upload happy path | `/official/matches/new` → fill form → pick MP4 ≤500 MB → **Create match** | Redirects to console; new match in `/official/assignments` |
| F2.4 Same-team guard | Pick the same team for home + away | Inline error: "Home and away teams must be different" |
| F2.5 Oversized file | Pick an MP4 > 500 MB | Inline error: "File is over 500 MB" |
| F2.6 Storage path tenancy | After F2.3, Dashboard → Storage → `clips` | Object lives under `team_<your-account-id>/match_<uuid>/source.mp4` |
| F2.7 Auto-assignment | After F2.3 | New match shows in your assignments list immediately |

### F3 — Live console (BRD §2.4.1)

| Test | Steps | Expected |
| - | - | - |
| F3.1 REC indicator | Open a `live` match's console | Red REC pulse next to the score line |
| F3.2 Custom controls | Press play/pause, -10s, +1 frame | Video responds within 50 ms |
| F3.3 Timeline scrub | Drag the progress slider | Video seeks; current-time updates |
| F3.4 Locked-frame marker | Trigger Offside Check, scrub, click **Review this frame** | Yellow vertical marker appears at the chosen position |
| F3.5 One review at a time | Click Offside Check, then immediately try Goal Check | Goal Check button is disabled while a review is active |
| F3.6 Disabled future buttons | Hover Foul / Handball / Red Card | Tooltip: "Future scope per BRD §2.2" |

### F4 — Offside review (BRD §2.2.1)

| Test | Steps | Expected |
| - | - | - |
| F4.1 Sample clip verdict | Seeded offside match, lock frame ~8.0 s | Verdict = `offside`, confidence ≈ 0.55–0.60, 8 detections |
| F4.2 Onside scenario | Lock frame where attacker is behind the line | Verdict = `onside` |
| F4.3 Low confidence | Lock a frame with poor visibility | Verdict = `human_review_required`, confidence < 0.4 |
| F4.4 Match-clock format | Inspect saved incident | `match_clock` column = `MM:SS` |
| F4.5 Audit row | `select * from audit_events order by created_at desc limit 1` | Row with `action='incident.analyzed'`, your `actor_id` |

### F5 — Goal-line review (BRD §2.2.2)

| Test | Steps | Expected |
| - | - | - |
| F5.1 Sample crossing | Goal sample match, lock around 5 s, Goal Check | Crossing detected at ≈ 5.00 s; `human_review_required` is correct BRD §2.3 behavior |
| F5.2 Trajectory points | Open incident detail | Yellow dashed polyline + dots on the SVG, ≥ 3 points |
| F5.3 No-goal | Lock around 1 s on the freekick clip | Verdict = `no_goal` |

### F6 — AI verdict + visual evidence (BRD §2.3)

| Test | Steps | Expected |
| - | - | - |
| F6.1 Verdict colors | Open `offside` incident | Verdict card icon + bar are red |
| F6.2 Onside coloring | Open `onside` incident | Green |
| F6.3 Human-review coloring | Open `human_review_required` incident | Yellow |
| F6.4 Confidence bar width | Inspect DOM | Bar `width: <conf*100>%` |
| F6.5 Rationale visible | Read the rationale list | ≥ 4 bullets, last one mentions "Confidence X.XX (geometry margin Y, detection Z, calibration W)" |
| F6.6 Pitch diagram | Look at the SVG | Pitch outline + halfway + center circle + both penalty boxes; attacker green-A, defender red-D, ball yellow, offside line red dashed |
| F6.7 Honest units | On an uploaded match without calibration | Last rationale: "Note: this match has no homography calibration, so distances above are pixel-relative" |

### F7 — Referee notes (BRD §3.1)

| Test | Steps | Expected |
| - | - | - |
| F7.1 Save happy path | Type "Looks correct, no dispute." → **Save note** | Green "Note saved." |
| F7.2 Counter | Type 305 chars | Counter shows `300/300` (input clamps); no overflow |
| F7.3 Profanity reject | Save a note containing a banned word | Red "Note contains disallowed language…"; **not** persisted |
| F7.4 Persistence | Save a clean note → refresh page | Note still shown |
| F7.5 Read-only on viewer | As viewer, open a ready incident | Note panel has no textarea or save button |

### F8 — Clip lifecycle (BRD §2.4.3, §3.3)

| Test | Steps | Expected |
| - | - | - |
| F8.1 Download (sample) | Sample-match incident → **Download clip** | File saves as `incident-<id>-offside-MM:SS.mp4` |
| F8.2 Download (upload) | Upload-match incident → **Download clip** | File matches the originally uploaded MP4 |
| F8.3 Delete preserves metadata | **Delete clip** → confirm | "This clip has been deleted. Incident metadata is retained." Verdict + diagram + note still visible |
| F8.4 Delete is idempotent | Click **Delete clip** again | Button disabled with label "Clip already deleted" |
| F8.5 Audit on delete | `select * from audit_events where action='incident.clip_deleted' order by created_at desc limit 1` | Row exists with your actor_id |

### F9 — RTMP/HLS ingestion (BRD §2.1.1, §3.2) — prototype quality

| Test | Steps | Expected |
| - | - | - |
| F9.1 Connect HLS | `/official/matches/[id]/stream` → paste Mux test URL → **Connect** | Status: `connecting` → `buffering` → `connected` within ~10 s; segment count > 0 |
| F9.2 Buffer growth | Wait ~30 s | Segment count caps near 15, buffered_seconds ≈ 30 |
| F9.3 Live playback | Return to the match's console | Video preview shows the live stream |
| F9.4 Analyze from buffer | While streaming, click Offside Check → Review | Verdict produced from the latest buffered segment |
| F9.5 Disconnect (graceful) | Click **Disconnect** | Status → `stopped`, segment count freezes |
| F9.6 Invalid URL | Paste `not-a-url` → Connect | Inline error: "Source URL must start with http(s):// or rtmp(s)://" |
| F9.7 Source persistence | After F9.1, refresh the page | Same status banner reappears |

### F10 — Stream reconnect (BRD §3.2) — prototype quality

| Test | Steps | Expected |
| - | - | - |
| F10.1 Banner appears on connect | While `connecting` | Yellow banner above console: "Connecting to source…" with spinning icon |
| F10.2 Banner hidden on connected | When status flips to `connected` | Banner disappears |
| F10.3 Disconnect simulation | While connected, run `pkill -f 'ffmpeg.*x36xhzz'` | Banner: `disconnected` → `reconnecting` (yellow); state machine logs "retry in 1s", 2s, 4s, … |
| F10.4 Auto-recovery | Don't intervene further | After backoff, FFmpeg respawns and banner returns to `connected` |
| F10.5 Realtime delivery | Open the console in two browser tabs | Both banners update simultaneously when state flips |
| F10.6 Manual stop is terminal | Click **Disconnect** | State → `stopped`; **does not** auto-restart |

### F11 — Realtime updates (BRD §2.4.1)

| Test | Steps | Expected |
| - | - | - |
| F11.1 Incident insert | Two tabs on `/official/matches/[id]/console`. Click Offside Check in tab A | Tab B's match log gains the new row within 1 s |
| F11.2 Incident status flip | Trigger analyze in tab A | Tab B's row moves through Capturing → Processing → Ready |
| F11.3 Stream state | Open stream page in tab A, console in tab B | Tab B's banner reflects state changes from tab A |

### F12 — Viewer read-only (BRD §2.4.2, §2.4.3)

| Test | Steps | Expected |
| - | - | - |
| F12.1 Match history | `/viewer` after sign-in | Card list of recent matches |
| F12.2 RLS hides non-ready | Trigger an incident as official, leave it `processing`. Sign in as viewer | Incident invisible in `/viewer/matches/[id]/incidents` |
| F12.3 RLS hides deleted | Delete a clip as official → sign in as viewer | Incident no longer appears |
| F12.4 No action buttons | Open viewer incident detail | No Offside/Goal Check, no note save, no delete |
| F12.5 URL guess fails | Try `/viewer/incidents/<non-ready-id>` directly | 404 |

### F13 — RLS + tenancy (BRD §3.1)

In SQL Editor:

```sql
-- F13.1: viewer cannot see non-ready incidents
set local request.jwt.claims = '{"sub":"<viewer-uuid>","role":"authenticated"}';
select count(*) from incidents where status != 'ready';
-- Expected: 0
reset request.jwt.claims;

-- F13.2: viewer cannot insert
set local request.jwt.claims = '{"sub":"<viewer-uuid>","role":"authenticated"}';
insert into incidents (match_id, team_account_id, type)
values ('00000000-0000-0000-0000-000000000030',
        '00000000-0000-0000-0000-000000000001', 'offside');
-- Expected: ERROR — new row violates row-level security policy
reset request.jwt.claims;

-- F13.3: storage path tenancy
select storage_path_team_account('team_00000000-0000-0000-0000-000000000001/match_x/source.mp4');
-- Expected: 00000000-0000-0000-0000-000000000001
```

### F14 — HTTP API (Python service)

```bash
# F14.1 health
curl -s http://127.0.0.1:8000/health

# F14.2 offside on sample
curl -s -X POST http://127.0.0.1:8000/analyze/offside \
  -H 'Content-Type: application/json' \
  -d '{"clip_id":"clip_offside_01","locked_frame_ms":8000,"attacking_team":"A"}' \
  | python3 -m json.tool

# F14.3 goal-line on sample
curl -s -X POST http://127.0.0.1:8000/analyze/goal-line \
  -H 'Content-Type: application/json' \
  -d '{"clip_id":"clip_goal_01","frame_range_ms":[2000,6500]}' \
  | python3 -m json.tool

# F14.4 sample mp4 streams
curl -I http://127.0.0.1:8000/samples/clip_offside_01.mp4
# Expected: 200, content-type: video/mp4

# F14.5 stream lifecycle
curl -s -X POST http://127.0.0.1:8000/streams/start \
  -H 'Content-Type: application/json' \
  -d '{"match_id":"<an-existing-uuid>","source_url":"https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8"}'
sleep 8
curl -s http://127.0.0.1:8000/streams/<same-uuid>/status
curl -s -X POST http://127.0.0.1:8000/streams/<same-uuid>/stop
```

Each request returns `200`; `/streams/start` then `/status` shows segment_count > 0 within 10 s.

### F15 — Audit logging (BRD §3.1)

```sql
select action, count(*) from audit_events group by action order by 1;
```

Should accumulate rows for `incident.analyzed`, `incident.clip_deleted`, `incident.clip_downloaded`, `match.created`.

---

## 6. Common failure modes + fixes

| Symptom | Likely cause | Fix |
| - | - | - |
| Login fails with `getaddrinfo ENOTFOUND placeholder.supabase.co` | Stale `.env.local` from a build smoke test | Replace with real keys, restart `pnpm dev` |
| `users_profile` count = 0 after seed | `SET app.demo_*_user_id` didn't propagate | Re-run `seed.sql` in **the same query tab** as the two `set` statements |
| `/analyze/offside` returns "fetch failed" | Python service not running on `localhost:8000` | Start `uv run uvicorn main:app --reload` |
| Stream stuck on `buffering` | FFmpeg can't reach the source URL | Try the Mux test URL; check firewall/proxy |
| `/streams/start` returns 500 "Supabase service client not configured" | `SUPABASE_SERVICE_ROLE_KEY` missing in `backend/.env` | Paste it from Dashboard → Project Settings → API |
| Disconnect banner never hides | Realtime not enabled on `matches` | Migration 0004 includes the publication ALTER; verify with `select * from pg_publication_tables` |
| Profanity filter doesn't reject | Word not in `lib/profanity.ts` list | This is a demo-grade filter; production should use a moderation API |
| YOLO returns 0 detections on aerial clip | `YOLO_IMGSZ` too low | Backend defaults to 1920; if you overrode it, raise it |
