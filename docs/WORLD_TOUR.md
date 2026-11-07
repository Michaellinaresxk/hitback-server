# World Tour session persistence

The backend owns the canonical route, `boardPosition`, score/fans, current round, and completion state for each World Tour session. Expo sends one independently randomized 22-tile route per player when creating the session; backend IDs are `player_1`…`player_N`.

## Setup

Set `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME`, then run the idempotent session migration before starting session traffic:

```bash
npm run migrate:sessions
npm run dev
```

The migration creates `game_session_snapshots` with JSONB session data and a unique capability-token hash. Raw capabilities are not persisted. Session handlers return `503` if PostgreSQL cannot initialize or a snapshot write fails; they do not acknowledge an unpersisted session mutation.

## Gameplay contract

- `POST /api/v2/game/session` requires one valid route per player: ordered tiles 0–21, with start/finish markers.
- `POST /api/v2/game/session/:id/reveal` settles score modifiers and advances the winner by one tile in the same mutation.
- The tour ends when a player reaches tile 21. Ranking uses fans/score, then board position.
- `GET /api/v2/game/session/:id` restores the authenticated session, including route, score, position, state, and an open round.
- Re-requesting an open round after recovery returns the same round rather than consuming another track.
- Mutations are queued within one server process only. Use one backend instance until database-level concurrency control is implemented.

Power Card inventories and combo streaks are not part of this snapshot. No retention policy currently deletes abandoned or finished sessions.

For the complete cross-project request/response contract and verification status, see [`specs/session-boardposition/SPEC.md`](specs/session-boardposition/SPEC.md).
