# World Tour progress recovery and winner resolution

- **Status:** Implemented
- **Owner:** HITBACK
- **Created:** 2026-11-07
- **Related issue/PR:** none

## Problem

World Tour routes and `boardPosition` were initially split between Expo-local state and backend score. Expo now submits each randomized route at session creation; the backend owns route, fans/score, position, round resolution, and tour completion, with PostgreSQL snapshots for recovery.

## Users and context

The Game Master runs a 2–8 player game from one Expo device. Every player has an independently randomized route; there are no fixed country sequences or shared route order.

## Current behavior

- Expo creates a separate 22-tile route per player and sends it at session creation.
- Backend `GameSessionService` validates/owns routes, positions, scores, reveal resolution, and completion; `GameSessionPersistence` stores snapshots in PostgreSQL.
- Backend `revealAnswer()` settles Alliance, Featuring, and B-SIDE modifiers and advances the winner atomically; Expo mirrors returned state and does not apply the modifiers again.
- Reaching position 21 ends the tour; ranking is fans first, then board position.
- Expo stores the session ID/capability in SecureStore and recovers authenticated session state after app restart.

## Desired behavior

- Backend owns each session's route, `boardPosition`, fans (`score`), and end-of-tour state.
- The route remains independently randomized for each player and is created once for the session.
- A correct reveal advances only the chosen winner by one tile as part of the same backend state transition that settles the round and its existing score modifiers.
- When any player reaches position 21, the tour ends. The winner is the player with the most fans; ties are broken by the greatest `boardPosition`.
- Expo restores the same players, routes, positions, scores, current round, and finished state from authenticated session status after an Expo or backend restart.
- The follow-up board UI can derive visited stops and unique countries from the restored routes; this phase does not redesign B-SIDE or add a new route visualization.

## Scope

### In scope

- Synchronize per-player route and position in the session contract.
- Make reveal progression atomic with backend score settlement.
- Resolve game completion and ranking by finish position, fans, then progress as the tie-break.
- Restore a session after an Expo app or backend process restart using secure device credentials and PostgreSQL snapshots.
- Update backend API/service tests, Expo synchronization, and World Tour documentation.

### Out of scope

- The visual player-board/ranking redesign and country/stop summary UI.
- Changing how Alliance, Featuring, or B-SIDE bonuses are calculated.
- Redesigning B-SIDE or granting Reaction Cards as part of a losing streak.
- A fixed or shared route across players.

## Data ownership and lifecycle

| Data | Owner | Session scope | Persistence/lifecycle |
| ---- | ----- | ------------- | ---------------------- |
| Random route per player | Backend canonical after creation; Expo presentation copy | Session/player | PostgreSQL snapshot for the session lifetime |
| `boardPosition` | Backend | Session/player | Updated with reveal; restored from PostgreSQL/session status |
| Fans (`score`) and round result | Backend | Session/player | PostgreSQL snapshot; Expo mirrors returned state |
| Capability token and session ID | Backend-issued; Expo holds recovery credential | Session | Token hash in PostgreSQL; credential in secure device storage |
| Displayed visited stops/countries | Derived from route and position | Session/player | No separate persistence |

## API and contracts

PostgreSQL is the approved durable store. Game API operations that create or mutate session state must fail explicitly if the snapshot cannot be committed; the server must not claim the session is recoverable when it was not saved.

| Method | Path | Request | Success response | Error behavior |
| ------ | ---- | ------- | ---------------- | -------------- |
| POST | `/api/v2/game/session` | Existing session config plus one validated 22-tile route per backend player ID | Created session includes routes and `boardPosition: 0`; capability token returned once | `400` for invalid route/player mapping; no partial session |
| POST | `/api/v2/game/session/:id/reveal` | Existing `{ winnerId, scoreModifiers }` | Canonical players include score and board position; session includes routes; result includes `gameOver` and ranked winner when a player reaches tile 21 | Existing capability-authenticated errors; no partial score/progress mutation |
| GET | `/api/v2/game/session/:id` | Capability-authenticated status request | Canonical routes, positions, scores, round, and status | `401/403` for missing/invalid capability; `404` for missing session |

Backend player IDs remain `player_1`…`player_N`; Expo local IDs must be mapped through the existing game helper. Route validation must enforce exactly one route per session player, 22 ordered tiles (0–21), and valid start/finish markers. Client-provided scores or positions are never accepted as authoritative updates.

## Acceptance criteria

- [x] Each player's route is generated once and is included in the persisted session snapshot.
- [x] A successful reveal advances only its winner by exactly one position; a no-winner reveal advances nobody.
- [x] Score modifiers already handled by backend reveal are applied exactly once.
- [x] Reaching position 21 ends the tour regardless of score.
- [x] The ranked winner is the player with most fans; ties use the greatest board position.
- [x] An active round is returned again after recovery rather than consuming another track.
- [x] Invalid or incomplete routes are rejected; a failed durable write returns an error and rolls back the in-memory session mutation.
- [x] Different players retain independent routes; duplicate cities between players remain allowed.
- [ ] Real PostgreSQL restart recovery and device-level Expo recovery.

## Test plan

### Automated

- Backend service tests for route validation, atomic reveal progression, finish detection, fan ranking, and progress tie-break.
- Backend HTTP tests for route creation/status response shapes, capability authorization, and invalid route rejection.
- Expo checks for mapping backend player IDs to local IDs and restoring the canonical route, score, position, and game-over state.
- Run backend Jest, Expo TypeScript, focused lint, and existing World Tour locale tests.

### Manual/device

- Required: start a game, close/relaunch Expo while the backend remains available, recover it, and verify routes/positions/fans on a device.
- If durable backend recovery is selected: also restart the backend process and verify the same recovery path.

## Implementation plan

- [x] Approve PostgreSQL persistence and recovery across Expo/backend restarts.
- [x] Implement server-owned routes and persisted position advancement.
- [x] Implement Expo credential/session restoration and canonical state hydration.
- [x] Update tests and World Tour/API documentation.
- [ ] Validate a configured PostgreSQL database and test restart recovery on a physical device.

## Risks and unresolved decisions

- PostgreSQL must be configured and `npm run migrate:sessions` run before the first game request. Database unavailability is surfaced as `503`; there is no memory-only success fallback.
- Session mutations are serialized within one server process, not across replicas. Deploy one backend instance until mutations use database-level locking/transactions.
- Expo player names are currently used to reconcile session players; duplicate names and later renames need stable ID mapping for safe recovery.
- Power Card inventories/combo streaks remain in their existing in-memory subsystem and are not restored by the session snapshot.
- Snapshot retention is not yet defined; finished/abandoned sessions will remain in PostgreSQL until explicitly deleted.

## Verification results

| Command/check | Result | Notes |
| ------------- | ------ | ----- |
| `cd server && npm test -- --runInBand` | Passed | 6 suites, 76 tests; persistence adapter tested with a fake PostgreSQL pool |
| `cd server && npm run lint` | Failed | 5 errors and 12 warnings across backend; focused lint on changed backend files has 0 errors and 1 warning |
| `cd hitback && ./node_modules/.bin/tsc --noEmit` | Passed | Expo typecheck |
| `cd hitback && npm run test:tour-locales` | Passed | 3 tests |
| `cd hitback && npx expo lint` | Failed | 21 errors and 18 warnings across the project; focused recovery-flow files have 0 errors and 5 warnings |
| PostgreSQL migration/restart | Not run | No real PostgreSQL service was validated in this environment |
| Expo device recovery | Not run | Requires manual iOS/Android relaunch testing |
