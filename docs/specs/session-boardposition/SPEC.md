# World Tour session and board-position recovery

- **Status:** Implemented; automated checks passed
- **Owner:** Expo + HITBACK backend
- **Created:** 2026-11-07
- **Related issue/PR:** `feature/session-boardposition`

## Problem and users

The Game Master runs a 2–8 player music tour from one Expo device. Every player has an independently randomized 22-tile route. Without durable session state, an app or server restart can lose routes, positions, fans, and an open round.

## Current and desired behavior

- Expo generates independent routes and sends them when creating a session.
- The backend validates and owns those routes, fans (`score`), positions, round state, and game completion.
- A correct reveal advances only the chosen winner by one tile in the same persisted mutation that settles the round and its existing modifiers.
- Reaching tile 21 ends the tour. Most fans win; `boardPosition` breaks a score tie.
- Expo stores the backend-issued capability in SecureStore and reconstructs its presentation state from the authenticated session response after relaunch.
- If an open round is recovered, the backend returns that same round instead of consuming another track.

## Scope and ownership

| Data | Authority | Lifecycle |
| ---- | --------- | --------- |
| Per-player randomized route | Backend after session creation; Expo display copy | PostgreSQL session snapshot |
| `boardPosition`, score/fans, round, game-over state | Backend | Persisted with each successful mutation |
| Session ID and capability | Backend issues; Expo stores capability in SecureStore | Capability hash in PostgreSQL; raw token is not stored there |
| Visited stops/countries | Derived from route and position | Presentation only; not separately persisted |

This feature does not add the visual player board, a country/stop summary, fixed routes, or changes to B-SIDE/Reaction Card rules. Alliance, Featuring, and B-SIDE modifiers already settled by reveal must not be applied a second time in Expo.

## HTTP contract

Routes are mounted at `/api/v2/game`; backend player IDs are `player_1`…`player_N`, mapped to local Expo IDs by the existing game helper.

| Method and path | Request | Success | Validation/errors |
| --------------- | ------- | ------- | ----------------- |
| `POST /session` | Existing session config plus one route per backend player | `201` session with routes and initial `boardPosition: 0`; capability returned once | `400` for invalid/missing route mapping; no partial session |
| `POST /session/:id/reveal` | `{ winnerId, scoreModifiers? }` | Canonical players, route, result, and game-over/ranking data | Capability required; `400` invalid player/modifier; `503` if durable persistence fails; mutation rolled back |
| `GET /session/:id` | Capability authorization | Canonical route, positions, scores, round, and status | `401/403` invalid/missing capability; `404` unknown session |
| `POST /session/:id/round` | No body | Current open round, or game-over response without a round | Capability required; returns same round after recovery |

Routes must contain exactly 22 ordered tiles (positions 0–21), including valid start and finish markers, with one route per session player. Client scores and positions are never accepted as authoritative writes.

## Acceptance criteria

- [x] Each player retains an independent validated route across session recovery.
- [x] Reveal advances only the selected winner once; no-winner reveal advances nobody.
- [x] Score modifiers handled by reveal are applied exactly once.
- [x] Tile 21 ends the tour, ranked by fans then position.
- [x] A failed snapshot write returns an error and restores the previous in-memory state.
- [x] Expo can retrieve canonical session state with the saved capability.
- [ ] Recovery against a configured PostgreSQL service and after a physical device relaunch.

## Migration and operational constraints

Run `cd server && npm run migrate:sessions` before the first session request. If PostgreSQL is unavailable, session routes return `503`; there is no memory-only success fallback. Mutations are serialized within one server process only, so deploy one backend instance until cross-replica database locking/transactions are added. Session snapshots currently have no retention policy. Power Card inventories and combo streaks are not included in the snapshot.

## Verification

| Check | Result | Limits |
| ----- | ------ | ------ |
| Backend Jest | Passed: 6 suites, 76 tests | PostgreSQL behavior uses a fake pool; no real service tested |
| Expo `./node_modules/.bin/tsc --noEmit` | Passed | Type-check only |
| Expo `npm run test:tour-locales` | Passed: 3 tests | Translation resource integrity |
| Focused backend lint | Passed: 0 errors, 1 warning | Existing unused-variable warning |
| Focused Expo lint | Passed: 0 errors, 5 warnings | Warnings remain |
| Full backend / Expo lint | Existing failures | Backend 5 errors/12 warnings; Expo 21 errors/18 warnings |
| PostgreSQL migration and device recovery | Not run | Requires configured PostgreSQL and manual iOS/Android check |
