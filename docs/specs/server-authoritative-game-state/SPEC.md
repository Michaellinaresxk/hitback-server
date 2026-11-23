# Feature: Server-Authoritative Game State

- **Status:** Implemented (initial pass, Tasks 1-6)
- **Owner:** HITBACK
- **Created:** 2026-11-21
- **Approved:** 2026-11-21 (user approval; unresolved product decisions below must be confirmed before implementing affected tasks)
- **Related issue/PR:** none

## Problem

HITBACK already treats the backend as canonical for session creation, round generation, bets, reveal score/board settlement, and score settlements. However, several gameplay rules and mutable states are still decided or stored only in Expo/Zustand. If the Expo app crashes, is force-closed, loses local memory, or restores incompletely, the game can lose or desynchronize active effects, alliances, freezes, B-SIDE streaks, round eligibility rules, and in-progress round UI state. Power Card inventories/combo streaks also remain in-memory on the server and are not part of the session snapshot.

The target architecture is: **the server orchestrates and owns all gameplay state; Expo is a graphical interface that renders canonical server state and sends user intents/commands**.

## Users and context

- **Game Master (GM):** runs the game from one Expo device, scans physical cards, selects winners, and applies Reaction/Power Card actions.
- **Players:** participate around the GM device; they do not have their own authoritative client.
- **System:** Node/Express backend in `server/`, Expo/React Native app in `hitback/`.

This spec covers normal gameplay sessions, crash recovery, and the migration path from front-driven rules to server-driven rules.

## Current behavior

Verified in code on 2026-11-21.

### Already backend-canonical / persisted

- Session lifecycle and round flow: `POST /api/v2/game/session`, `/start`, `/round`, `/bet`, `/reveal`, `GET /session/:id` in `server/routes/gameSession.js`; logic in `server/services/GameSessionService.js`.
- Session snapshot persistence: `server/services/GameSessionPersistence.js` saves full `session_data` JSONB to `game_session_snapshots` (`server/migrations/002_game_session_snapshots.sql`).
- Reveal settles base points, token bonus, active Power Card effect, Double Platinum, combo processing, `ALLIANCE/FEATURING/B_SIDE` score modifiers, winner `boardPosition` advance, and game-over check in `GameSessionService.revealAnswer()`.
- Canonical score adjustments outside reveal exist: `POST /session/:id/score-settlement` and `PATCH /session/:id/players/:playerId/score`, both persisted through `persistMutation`.
- Client recovery entry points exist: `hitback/services/GameSessionService.ts` `restoreCurrentSession()` and `hitback/store/slices/gameSlice.ts` `restoreGame()`.

### Front-only or insufficiently server-owned (must change)

| Area | Current behavior | Evidence | Crash/loss risk |
|---|---|---|---|
| Reaction Card rule execution | Most Reaction Cards are handled in `hitback/app/(tabs)/game.tsx` `handleReactionCard`; local store mutation happens first, then some cards send score deltas via `settleScoreAdjustments`. | `game.tsx:508-639`, `playerSlice.ts:327-475`, `GameSessionService.ts:560+` | Event/effect lost; rule can diverge; client can compute wrong delta. |
| Freezes / ARTIST_HOLD / MUTE | Freeze state is local Zustand (`isFrozen`, `artistHoldRoundsLeft`, `frozenForRound`); `nextTurn()` decrements locally; `restoreGame()` resets them. | `playerSlice.ts:56-73,367-383`, `gameSlice.ts:246-285,158-164` | Frozen players/elegibility lost after crash/restore. |
| STOP_BLAST / DUEL eligibility | Active restriction stored in `gameSlice`; UI blocks selection, but backend `revealAnswer()` only validates winner belongs to session and modifier shape. | `gameSlice.ts:352-377`, `game.tsx:515-520`, `PointsAwardModal` UI flow, `GameSessionService.revealAnswer()` | Restriction lost after crash; invalid winner can be accepted by API. |
| FEATURING pending state | Featuring activator/target stored locally; reveal receives `featuringPartnerId` modifier. | `gameSlice.ts:340-350`, `usePointsActions.ts:184-197` | Pending effect lost before reveal; no canonical audit/expiry. |
| ALLIANCE state/duration | Alliances live in `allianceSlice` only; rounds decremented in local `nextTurn`; restore does not rebuild alliances. Reveal accepts `alliancePartnerId` but does not validate active alliance state. | `allianceSlice.ts`, `gameSlice.ts:280`, `restoreGame()` | Active alliances/rounds left lost; invalid partner could be settled if sent. |
| B-SIDE streak/activation | `lossStreak` and `bSideActive` are client-only; activation at threshold happens in client; server only applies +1 when `bSidePlayerId` is passed on reveal. | `playerSlice.ts:477-531`, `usePointsActions.ts:120-126,198-200,256-268` | Streak/eligibility/comeback pending lost on crash. |
| Tie handling | `ARTIST_HOLD` and `ROYALTIES` pick one leader with `reduce`, keeping first on ties. `CHARITY_SHOW` randomly picks among tied lowest recipients in client. | `playerSlice.ts:330-333,367-374,430-475` | Incorrect/undocumented tie behavior; non-auditable randomness. |
| Power Card inventory/combo durability | `PowerCardService` keeps session-scoped in-memory state; session snapshot does not include it. Server AGENTS documents this limitation. | `server/services/PowerCardService.js` (`clearSessionData`), `server/AGENTS.md` | Server restart loses inventories, active cards, streaks. |
| Round/UI recovery | Server can persist `currentRound` including bets; Expo restore rebuilds players/routes/round/time but not flow phase/current round/bets/currentBet/doublePlatinum UI flags. | `GameSessionService.nextRound/placeBet`, `gameSlice.restoreGame()` | After crash, backend may have active round but Expo cannot resume it accurately. |
| Client authority leakage | Client computes game rules and sends score deltas/reveal modifiers. Backend accepts some deltas/modifiers without validating game-rule preconditions. | `game.tsx`, `usePointsActions.ts`, `routes/gameSession.js`, `GameSessionService.applyScoreAdjustments/revealAnswer` | UI/client bugs or malicious/invalid requests can mutate state outside intended rules. |

## Desired behavior

After implementation, the backend is the single source of truth for gameplay state. Expo renders server state and emits intents (commands). It must not decide authoritative game rules.

- All rule-affecting actions are validated, applied, persisted, and audited by the server.
- `GET /session/:id` (or equivalent canonical status endpoint) returns enough state for Expo to fully restore the game after crash/restart.
- Reaction Cards, alliances, freezes, B-SIDE, eligibility restrictions, power card inventory/combo state, and active round state are recoverable.
- Expo may keep ephemeral presentation state (animations, open modal visuals, local audio playback position where acceptable), but not authoritative gameplay state.
- Invalid commands are rejected with clear errors and no partial mutation.
- Mutations are idempotent where retries/double taps are possible.

## Scope

### In scope

- Define canonical session game-state model for effects, alliances, B-SIDE, eligibility, power-card/combo durable state, round/turn/timer recovery.
- Add server command endpoints for Reaction Cards and effect lifecycle transitions.
- Enforce eligibility/validation in `reveal`, `nextRound`, `bet`, and command endpoints.
- Persist all authoritative state in session snapshots (or durable tables, if chosen by implementation) with recovery on restart.
- Update Expo to hydrate/render from canonical state and remove/disable local authoritative rule logic.
- Add automated tests for backend rules, HTTP contracts, recovery, and Expo state hydration.
- Update system/spec docs and migration notes.

### Out of scope

- Redesigning game UX/layout unrelated to authoritative state.
- Adding new Reaction Cards beyond those needed to validate the engine, unless explicitly approved in a follow-up spec.
- Multiplayer/multi-device authoritative sync beyond the existing single-GM device model.
- Replacing PostgreSQL or the existing Express architecture.
- Physical QR hardware/camera behavior changes except where required by command flow.

## Data ownership and lifecycle

| Data | Owner | Session scope | Persistence/lifecycle | Notes |
|---|---|---|---|---|
| Session config, players, score, boardPosition, tokens, round, history | Backend | Session/player | PostgreSQL snapshot | Already mostly canonical; keep authoritative. |
| Current round, bets, question/GM answer, audio metadata | Backend | Session/round | PostgreSQL snapshot | Must be fully recoverable; Expo renders only. |
| Reaction Card events/effects | Backend | Session/player/round | PostgreSQL snapshot + audit log/event history | Includes source, targets, roundsLeft, status, resolution. |
| Alliances | Backend | Session/player pair | PostgreSQL snapshot | Active roundsLeft, createdRound, expiry; validated on reveal. |
| Freeze/eligibility effects (`MUTE`, `ARTIST_HOLD`, `STOP_BLAST`, `DUEL`, future) | Backend | Session/player/round | PostgreSQL snapshot | Server validates winner eligibility. |
| B-SIDE streak and pending/active comeback | Backend | Session/player | PostgreSQL snapshot | Threshold, activation, consumption, notification metadata. |
| Power Card inventory, active cards, combo streak/completion | Backend | Session/player | Durable backend state (snapshot or dedicated tables) | Must survive server restart; no memory-only authority. |
| Timer | Backend | Session | PostgreSQL snapshot | Server owns start/pause/elapsed/remaining; client displays. |
| World Tour routes and visited/landing derived state | Backend canonical routes/position; Expo derived presentation | Session/player | Routes/position durable; visited derived | Derived views must be computable from canonical state. |
| UI-only presentation | Expo | Local device | Memory only | Modal animation, transient toasts, audio playback object; must not affect rules. |

## API and contracts

> All endpoints below are proposals until approved. They must follow existing capability-auth patterns and session/player ID mapping rules. Backend player IDs remain canonical; Expo maps local IDs through `buildPlayerIdMap()/getBackendPlayerId()`.

### A. Canonical session status (recovery contract)

| Method | Path | Request | Success response | Error behavior |
|---|---|---|---|---|
| GET | `/api/v2/game/session/:id` | Capability auth | `session` includes canonical players, routes, round, currentRound, bets, alliances, activeEffects, bSideState, powerCardState, comboState, timer, doublePlatinumActive, pending UI-neutral events if needed | `401/403/404` existing behavior |

**Required session fields (target):**

```json
{
  "id": "game_x",
  "status": "playing",
  "round": 3,
  "players": [
    {
      "id": "player_1",
      "name": "Ana",
      "score": 4,
      "boardPosition": 2,
      "availableTokens": [2,3],
      "stats": { "correctAnswers": 2 },
      "effects": {
        "isFrozen": true,
        "frozenRoundsLeft": 2,
        "lossStreak": 1,
        "bSideActive": false
      }
    }
  ],
  "alliances": [],
  "activeEffects": [],
  "currentRound": { "roundNumber": 3, "question": {}, "track": {}, "bets": {} },
  "powerCards": { "inventories": {}, "active": [] },
  "timer": { "durationMs": 1200000, "remainingMs": 900000, "startedAt": "...", "isPaused": false }
}
```

Shape is illustrative; final names must be documented in implementation spec/update.

### B. Reaction Card command

| Method | Path | Request | Success response | Error behavior |
|---|---|---|---|---|
| POST | `/api/v2/game/session/:id/reaction-cards/apply` | `{ sourcePlayerId, cardType, targetPlayerId?, payload?, idempotencyKey }` | `{ success, event, session, players, activeEffects, alliances }` | `400` invalid card/target/state; `409` duplicate idempotency key with different payload; no partial mutation |

Rules:
- Server selects leader/last/tied targets according to documented tie policy.
- Server computes score deltas and effect creation/consumption.
- Server persists event and returns canonical state.
- Client does not send computed deltas for normal Reaction Cards.

### C. Reveal eligibility validation

| Method | Path | Request | Success response | Error behavior |
|---|---|---|---|---|
| POST | `/api/v2/game/session/:id/reveal` | `{ winnerId, idempotencyKey? }` (scoreModifiers deprecated/migrated) | Canonical reveal result including settled modifiers/events/effects | `400/409` if winner ineligible due to freeze/STOP_BLAST/DUEL/effect rules |

Migration note: existing `scoreModifiers` may be supported temporarily for backward compatibility during phased rollout, but server must validate them against canonical active effects/alliances and reject mismatches.

### D. Round/turn progression

| Method | Path | Request | Success response | Error behavior |
|---|---|---|---|---|
| POST | `/api/v2/game/session/:id/next-round` or `/advance` | `{ idempotencyKey? }` | Canonical round state and decremented/expired effects | `400` if round cannot advance; no partial mutation |

Server owns effect expiration/decrement on round transitions. Client `nextTurn()` becomes a UI refresh from canonical state.

### E. Power Card durability

| Method | Path | Request | Success response | Error behavior |
|---|---|---|---|---|
| POST | `/api/cards/scan-qr` / use endpoints | Existing + session/player scoping | Canonical inventory/active card state | `400/404/409` as appropriate |

Power card inventory, active cards, and combo streak state must be included in durable session state or equivalent durable store and restored after restart.

## Acceptance criteria

### Global

- [ ] Given an active session, when Expo requests session status, then the response contains all authoritative state required to render gameplay without relying on previous local Zustand state.
- [ ] Given any gameplay mutation, when it succeeds, then the mutated state is persisted before success is returned.
- [ ] Given a server process restart after a successful mutation, when the session is fetched, then the same canonical state is returned.
- [ ] Given an Expo crash/relaunch, when the GM resumes the session, then players, scores, board, tokens, round, bets, effects, alliances, B-SIDE, power cards, and timer are restored consistently.
- [ ] Given invalid client input or stale state, when a command/reveal is submitted, then the server rejects it with a clear error and no partial mutation.

### Reaction/effect rules

- [ ] Given `ARTIST_HOLD` with tied leaders, when applied, then all tied highest-score players receive the freeze effect according to the approved tie policy.
- [ ] Given `B_SIDE` threshold reached by multiple players in the same resolution, when processed, then all eligible players receive B-SIDE activation according to approved policy.
- [ ] Given `STOP_BLAST` or `DUEL` active, when `reveal` is submitted with an ineligible winner, then server returns validation error and no score/board/round mutation occurs.
- [ ] Given `CHARITY_SHOW`/`ROYALTIES` tie scenarios, when applied, then target selection follows explicit documented policy and is persisted in the event record.

### Recovery/durability

- [ ] Given a current round with bets placed, when Expo restarts, then the same round, bets, question/GM data exposure rules, and phase-relevant state can be restored.
- [ ] Given active power card inventory/combo streak, when server restarts, then inventory/streak state remains consistent.
- [ ] Given a double tap/retry on a mutating command with same idempotency key, then the server applies the mutation once.

## Test plan

### Automated

- **Server unit/service tests (`server/__tests__/services/`)**:
  - effect model apply/expire/decrement;
  - alliance creation/validation/expiry;
  - B-SIDE streak activation and consumption;
  - tie policies for ARTIST_HOLD/ROYALTIES/CHARITY_SHOW;
  - reveal eligibility validation for freeze/STOP_BLAST/DUEL;
  - idempotency/double-submit behavior.
- **Server HTTP tests (`server/__tests__/integration/`)**:
  - `GET /session/:id` returns canonical recovery shape;
  - reaction-card command success/error/validation;
  - reveal rejects ineligible winner;
  - score-settlement/reaction command cannot corrupt state on invalid payload;
  - persistence failure rolls back mutation (existing `persistMutation` pattern).
- **Persistence/restart tests**:
  - save snapshot, clear in-memory service, reload from persistence, assert same canonical state.
  - include power card/combo state once moved to durable storage.
- **Expo tests/checks**:
  - `npx tsc --noEmit`;
  - lint for touched files;
  - store/hook tests for `restoreGame` hydrating canonical state;
  - UI flow tests for rendering server-provided effects/eligibility (where test harness exists).

### Manual/device

- Start game, apply freeze/alliance/B-SIDE/STOP_BLAST/DUEL/reaction cards, force-close Expo, reopen, resume session: state matches.
- With PostgreSQL configured, restart server process mid-session: resume returns same state.
- Validate GM flow on device: scan card, apply reaction, award/reject eligible winner, next round.
- Simulate network failure during command: UI shows error, retry does not duplicate mutation.

## Implementation plan (phased tasks)

> Each task should be implemented as a separate PR/commit series. Do not merge large mixed-scope changes. A task is "ready" only after relevant build/typecheck/tests pass and verification is recorded.

### Task 1 — Canonical state model & recovery contract

- **Goal:** Define and expose the full canonical state needed for recovery, without yet moving every rule.
- **Backend:** extend session model/snapshot to include `activeEffects`, `alliances`, `bSideState`, `eligibilityFlags`, `timerState`, `doublePlatinumActive`, and durable `powerCardState/comboState` placeholders or implementation.
- **Expo:** update `restoreGame()` to hydrate all canonical fields; remove hardcoded resets for authoritative fields when server provides them.
- **Docs:** update system/spec docs for recovery shape.
- **Verify:** service/integration tests for snapshot round-trip; Expo typecheck.

### Task 2 — Reaction Card command endpoint (server rules)

- **Goal:** Move Reaction Card rule execution to server commands.
- **Backend:** add `POST /reaction-cards/apply`; implement server-side rule handlers for existing cards; persist events/effects; return canonical state.
- **Expo:** `handleReactionCard` becomes command dispatcher; remove local rule calculations for migrated cards; keep optimistic UI only if reconciled.
- **Verify:** unit tests per card + HTTP contract tests + no-double-apply tests.

### Task 3 — Eligibility & reveal validation

- **Goal:** Make server reject invalid winners/actions.
- **Backend:** validate reveal winner against active effects (`MUTE/ARTIST_HOLD`, `STOP_BLAST`, `DUEL`); validate alliance/featuring/bSide modifiers against canonical active state.
- **Expo:** UI disables ineligible players from server-provided eligibility, but server remains final authority.
- **Verify:** integration tests for rejected reveals; no state mutation on rejection.

### Task 4 — Round/turn/timer authority

- **Goal:** Server owns round transitions and effect expiration.
- **Backend:** round advance endpoint or authoritative `nextRound` semantics; decrement/expire effects/alliances/freeze counters; timer state.
- **Expo:** `nextTurn` triggers/consumes server transition; no local decrement of authoritative counters.
- **Verify:** crash/recovery mid-round and across round boundaries.

### Task 5 — Power Card/combo durability

- **Goal:** Remove memory-only authoritative Power Card state.
- **Backend:** persist inventory, active card effects, combo streak/trackers in snapshot or durable store; restore on load.
- **Expo:** hydrate power card state from server; reconcile scan/use flows.
- **Verify:** restart test proves inventory/streak survives.

### Task 6 — Thin client cleanup & deprecation

- **Goal:** Expo becomes display + intent layer.
- **Backend:** deprecate client-computed score-settlement for normal card rules; keep audited emergency/admin path only if needed.
- **Expo:** remove dead local rule code paths; ensure all gameplay mutations go through server commands.
- **Docs:** mark old front-driven behavior as removed; update AGENTS/spec docs.

## Risks and unresolved decisions

- **Tie policy decisions (product):** ARTIST_HOLD/ROYALTIES/CHARITY_SHOW on ties - all tied targets, deterministic random, or stable order? Must be approved before Task 2 implementation.
- **Idempotency key strategy:** client-generated UUID per command vs server-generated nonce. Needs contract decision.
- **Snapshot size/growth:** adding events/effects/power-card state may grow `session_data`; consider pruning/audit table if needed.
- **Backward compatibility during rollout:** old clients may still send `scoreModifiers` or expect old shapes; define deprecation window.
- **PowerCardService persistence model:** extend session snapshot vs dedicated tables. Snapshot is simpler; tables may scale better. Prefer simplest durable model first.
- **Timer authority:** exact behavior on pause/background/reconnect for single-device GM flow needs product confirmation.
- **Duplicate player names:** recovery currently maps by name in places; stable backend ID mapping must be preserved.
- **Single-process mutation queue:** existing route serialization is process-local; multi-replica deployment remains out of scope until DB locking/transactions are added.

## Verification results

| Command/check | Result | Notes |
|---|---|---|
| Code inspection | Done | Verified against `estadoactual.md`, `ARQUITECTURA.md`, Expo slices/hooks/services, server routes/services/persistence/migration on 2026-11-21. |
| `cd server && npm test -- --runInBand` | Passed | 6 suites, 76 tests passed after Task 1-6 implementation. |
| `cd hitback && npx tsc --noEmit` | Passed | No TypeScript errors. |
| `cd hitback && npm run lint` | Failed (pre-existing) | 59 problems (21 errors, 38 warnings) overall; no new errors in touched files, only pre-existing warnings/parse issues elsewhere. |
| `cd server && npm run lint` | Failed (pre-existing) | 17 problems (5 errors, 12 warnings) overall; pre-existing issues, no new errors introduced by this change. |
| PostgreSQL restart recovery | Not run | Requires configured DB and manual/service validation. |
| Device crash/recovery | Not run | Requires manual iOS/Android validation. |
