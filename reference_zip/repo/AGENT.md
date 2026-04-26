# AGENT Handoff (Verbatim Apply Guide)

This repository was updated to improve recorder stability, media streaming UX, and GoFile integration behavior.

## Files changed
1. `server.ts`
2. `src/App.tsx`

## Exact implementation notes
- Added manual-stop cooldown logic so stopping does not instantly trigger a new auto-recording loop.
- Added new API endpoint: `POST /api/streamers/:id/stop`.
- Added stream endpoint with HTTP Range support: `GET /api/recordings/:id/stream`.
- Added upload dedupe guard (`409` if an upload is already in progress).
- Persisted `direct_url` and `stop_reason` in recording records.
- Frontend now includes:
  - Stop button next to Force Check/Start in streamer table.
  - Embedded video preview player in Media tab (`<video preload="metadata">`).
  - Skeleton loader during upload refresh window.
  - Minor rerender optimization via `useMemo` and state update guards.

## Apply instructions for another AI
Copy/paste the exact content of `server.ts` and `src/App.tsx` from this branch into the target website codebase. Do not redesign, rename, or reinterpret logic. Preserve endpoint names and field names exactly:
- `manual_start_required`
- `stop_reason`
- `direct_url`
- `/api/streamers/:id/stop`
- `/api/recordings/:id/stream`

## Verification checklist
- Start/stop a streamer from dashboard and confirm it does not auto-restart immediately.
- Upload a completed recording and verify status transitions to `Uploaded`.
- Open Media tab and confirm video preview plays with seek support.
- Trigger duplicate upload request and verify `409 Upload already in progress`.
