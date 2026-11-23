# HITBACK — Reliability, scoring and API security remediation

- **Status:** Implemented (validation limitations recorded below)
- **Owner:** HITBACK
- **Created:** 2026-11-06
- **Related issue/PR:** none

## Problem

The reported audit identifies unresolved Expo type/import failures, a runtime
failure in score-award handling, edge cases in end-of-game and combo flows,
case-sensitive backend imports, score state that can diverge between Expo and
the server, missing API access control, and game-rule/UI inconsistencies.
Expo dependencies are present in this workspace; TypeScript validation was run
after implementation.

## Users and context

The Game Master runs a local, single-device game for 2–8 players. Expo calls
the Express backend for sessions, rounds, score, bets and Power Cards. API
contracts and score ownership affect both projects.

## Current behavior

- Expo's existing store types are in `hitback/store/types/gameStoreTypes.ts`
  and game types are in `hitback/types/game.types.ts`. Several slices import a
  nonexistent `store/types/gameTypes`; other imports use the nonexistent
  `types/game_types`. `gameStore.ts` exports the Zustand hook, not `Player`.
  `RewardsService.ts` and reward UI also import `Combo`/`ComboReward` types that
  do not exist in `game.types.ts`.
- `usePointsActions.ts` calls `gameSessionService` for Alliance, Featuring and
  B-SIDE without importing it. `handleAwardPoints` has `try/finally` without a
  catch or visible error reporting.
- `useGameFlow.nextRound()` does not handle a successful `gameOver` response
  without a `round` before it enters the betting/round setup path.
- `useComboFlow` resets and advances after 30 seconds for any active combo;
  that timer is not suspended during notification/scanning or while a card is
  being processed.
- The client `applyScoreDelta()` catches request errors and returns
  `{ success: false }`; callers do not verify that result. The backend applies
  score changes in `GameSessionService.applyScoreDelta(sessionId, playerId,
  delta, reason)`. Scores may diverge if the request fails.
- Game-session and Power Card routes have no authentication middleware. The
  server has a global rate limit, but skips requests with any `x-expo-token`
  value or an Expo-looking origin; neither is authentication. Power Card
  routes expose scan, inventory, test-add and clear operations.
- Backend imports use `../controllers/PowerCardController` and
  `../utils/Qrutils`, while the actual filenames are
  `powerCardController.js` and `qrutils.js`. No CI workflow was found under
  `.github/`.
- Rule indications conflict: the Reaction Card UI says ARTIST HOLD freezes
  the leader for 2 rounds while Expo's constant is 1; COPYRIGHTS is described
  in code comments as 50% of the last award; FEATURING describes both players
  receiving 100%; `RewardsService.getBettingMultiplier()` returns x2/x3/x4,
  while the session backend adds the selected token value to base points.

## Desired behavior

Restore trustworthy TypeScript checking, fix verified module resolution and
runtime errors, make end-of-game and combo flows safe, ensure score state
cannot silently diverge, protect state-changing/read-sensitive API operations,
and align displayed rules with approved game rules.

Product decisions approved by the requester on 2026-11-06:

- Use a cryptographically random, per-session bearer capability returned once
  by session creation. The capability is not an embedded/static app secret.
- Keep score canonical on the backend. Apply round score modifiers in the
  reveal transaction and return the final canonical player scores.
- Defer conflicting COPYRIGHTS, ARTIST HOLD, FEATURING, and betting rules;
  do not alter their rule values or copy based on conflicting sources.
- Remove the combo's automatic timeout/round advance. The Game Master must
  explicitly scan, continue, or skip.
- Keep health checks and static resources public. Do not treat CORS, Origin, or
  a header's mere presence as authentication.

## Scope

### In scope

- Repair imports and types using the existing canonical Expo types; make
  `tsc --noEmit` pass without hiding type failures behind `any`.
- Import `gameSessionService` and surface score-award failures to the Game
  Master.
- Handle `gameOver` responses without a next round.
- Remove the combo automatic timeout; explicit scan/continue/skip controls
  deterministic progression.
- Fix case-sensitive backend module paths and add a Linux CI test job if the
  repository's CI provider is approved/available.
- Resolve session/API access control and score synchronization across Expo
  and Express, including tests for authorization, session/player scope, and
  failed score updates.
- Preserve unambiguous current-contract behavior; defer conflicting
  COPYRIGHTS, ARTIST HOLD, FEATURING, and betting rules without changing them.
- Update current system documentation and this spec with verified outcomes.

### Out of scope

- User accounts, online matchmaking, durable session storage, and migration of
  the session service to a database unless explicitly approved.
- Changes to World Tour routes/positions, music selection, or unrelated
  legacy lint issues.
- Claims of production security or external-service availability without
  deployment-level verification.

## Data ownership and lifecycle

| Data | Owner | Session scope | Persistence/lifecycle |
| ---- | ----- | ------------- | --------------------- |
| Round result, score, bets, tokens and combos | Backend | Game session and player | In-memory session |
| Presentation, local player IDs and World Tour position | Expo | Local game/player | Local app state |
| API authorization credential | Backend-generated capability; held in Expo service memory | Exactly one game session | Returned only by create-session response; lost when app process resets |

## API and contracts

| Method | Path | Request | Success response | Error behavior |
| ------ | ---- | ------- | ---------------- | -------------- |
| `POST` | `/api/v2/game/session` | Existing session config | `{ success, session, capabilityToken }`; token issued once | Public create; token is a cryptographically random bearer capability |
| Existing session and Power Card routes | `/api/v2/game/session/:id/*`, private `/api/cards/*` | Existing payloads; Power Card calls include session ID | Existing payloads | `Authorization: Bearer <session capability>`; token must match path/body/query session ID; 401 for missing/invalid capability |
| `POST` | `/api/v2/game/session/:id/reveal` | `{ winnerId, scoreModifiers?: { alliancePartnerId?, featuringPartnerId?, bSidePlayerId? } }` | `{ results, players }` after all round awards/modifiers and game-over check | Validate modifier player scope first; backend derives deltas; session capability required |
| `POST` | `/api/v2/game/session/:id/score-settlement` | `{ adjustments: [{ playerId, delta, reason }] }` | Canonical `{ adjustments, players }` | Validate complete batch before applying any delta; session capability required |
| `PATCH` | `/api/v2/game/session/:id/players/:playerId/score` | Existing `{ delta, reason }` | Updated canonical score state | Explicit authorization and validation; callers must act on failures |

Player IDs must continue to be validated against the specified session.
Protected state includes session reads/mutations and private Power Card reads
and mutations (including scan, inventory, test-add, use, clear, and diagnostics).
Printable QR definitions, health checks, and static assets remain public.
There is no static embedded secret. Expo stores the active token in the service
instance and cannot recover it after process loss; creating a new session is
the current recovery path. Legacy unauthenticated callers of protected routes
must migrate to create a session and retain its token.

## Acceptance criteria

- [x] Expo imports resolve to declared types; `npx tsc --noEmit` completes
  without errors.
- [x] Awarding points cannot fail due to an unresolved service import, and
  failures are visible and logged without presenting a success-shaped result.
- [x] A `gameOver` response without `round` presents the game-end UI and does
  not enter betting or a malformed-round state.
- [x] Combo has no automatic timeout/round advance; scan completion, continue,
  and skip control deterministic progression.
- [~] Linux CI is configured to run the backend Jest suite and catch incorrectly-cased
  imports.
- [x] Unauthorized callers cannot read or mutate protected session/Power Card
  state; credentials cannot cross session boundaries.
- [~] Backend and Expo display the same canonical scores after reveal and all
  approved score modifiers, including recoverable request failures.
- [x] Unambiguous current-contract behavior remains consistent; conflicting
  COPYRIGHTS, ARTIST HOLD, FEATURING, and betting rules are unchanged and
  explicitly documented as unresolved.
- [~] API changes have backend API tests; Expo contract behavior has no
  runnable client test harness in the current package.

## Test plan

### Automated

- Expo: `npx tsc --noEmit`, `npm run lint`, plus focused tests for award
  failures, `gameOver`, and combo processing if the available test setup
  supports them.
- Backend: focused API tests for access control, session/player scope,
  score-update failure/idempotency, and existing session behavior; then
  `npm test -- --runInBand` and `npm run lint`.
- CI: run the backend Jest test command on Linux so case-sensitive import
  regressions fail the job.

### Manual/device

- Exercise a completed game on an Expo device, including a combo notification,
  camera permission, scan/skip and the final-score screen.
- Verify network authorization from a second device on the intended
  deployment network.

## Implementation plan

- [x] Repair Expo type/import graph and add focused regressions.
- [x] Fix score-award error reporting, game-over handling and remove automatic
  combo timeout behavior.
- [x] Fix backend import casing and add Linux CI.
- [x] Implement the approved access-control and score-settlement contracts in
  backend and Expo together.
- [x] Preserve ambiguous game rules; document the precise unresolved decisions.
- [x] Update system documentation and record actual validation results.

## Risks and unresolved decisions

- A per-session capability is a bearer secret; anyone who obtains it can
  control that session. TLS is required on untrusted networks. It is not user
  identity or a replacement for durable account-level access control.
- Expo retains the capability in process memory only. App restart loses
  protected-session access; persistent secure storage or recovery is a later,
  separate decision.
- Existing clients calling protected routes without Authorization receive
  401 and must migrate.
- Reveal score modifiers are submitted by the authorized Game Master device;
  the backend validates and applies them atomically, but does not yet own
  local alliance/featuring/loss-streak state.
- Authoritative values for COPYRIGHTS, ARTIST HOLD duration, FEATURING and bet
  multiplier/scoring are not present together in a current approved feature
  spec.
- GitHub Actions was selected for the requested Linux CI workflow. The
  workflow has not yet been executed by a remote GitHub runner.

## Verification results

| Command/check | Result | Notes |
| ------------- | ------ | ----- |
| Inspect Expo type declarations/imports | Confirmed issues | See current behavior above. |
| Inspect Expo service score sync | Confirmed silent false result | Callers do not check `success`. |
| Inspect game-session and Power Card routes | Confirmed no auth middleware | CORS/rate-limit skip is not authorization. |
| Inspect backend import paths | Confirmed case mismatch | Target filenames differ by case. |
| `cd hitback && ./node_modules/.bin/tsc --noEmit` | Passed (exit 0) | Expo TypeScript graph typechecks. |
| `cd server && npm test -- --runInBand --silent __tests__/integration/expoApi.test.js` | Passed (exit 0) | 1 suite, 5 tests: capabilities, session scope, private Power Cards, atomic settlement, reveal modifiers and final game-over behavior. |
| `cd server && npm test -- --runInBand --silent` | Passed (exit 0) | 5 suites, 69 tests passed. |
| `cd hitback && npm run lint -- --quiet` | Failed (exit 1) | Eight errors in untouched `GameSetupScreen.tsx` and `ParticleEffect.tsx`; no lint error reported in modified Expo files. |
| `cd server && npm run lint` | Failed (exit 1) | Five errors: old ESLint parser rejects class fields in `gameController.js` and `powerCardController.js`; three `prefer-const` errors in `routes/tracks.js` and `services/DeezerServiceV2.js`. Twelve warnings also reported. |
| `sh scripts/verify.sh` | Failed (exit 1) | Backend Jest (69/69) and Expo TypeScript passed; backend and Expo ESLint failed as detailed above. Expo ESLint reported 8 errors and 27 warnings. |
| Linux GitHub Actions workflow execution | Blocked | Workflow added; remote CI cannot be invoked from this workspace. |
| Expo device/camera and second-device network checks | Blocked | No device or deployment verification performed. |

## Implementation and verification

Implementation is complete. Backend API and full Jest suites and Expo
TypeScript checking passed. The acceptance criteria marked `~` remain partially
verified because remote Linux execution and Expo client behavior tests are not
available here. Backend and Expo lint remain blocked by existing errors
described in the verification table. Manual device, camera, and network checks
were not performed. No external service or deployment is claimed as verified.
