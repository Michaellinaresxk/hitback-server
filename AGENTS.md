# AGENTS.md — HITBACK Express Backend

> Instrucciones locales para agentes que modifican `server/`. Reconciliado con rutas, servicios y suites el 2026-10-20. Para contratos compartidos, usa [`../documentation/HITBACK_SYSTEM_DOCS.md`](../documentation/HITBACK_SYSTEM_DOCS.md); para el flujo de trabajo de features, sigue [`../specs/README.md`](../specs/README.md) y [`../.github/skills/spec-driven-feature/SKILL.md`](../.github/skills/spec-driven-feature/SKILL.md).

## Proyecto y ownership

- Backend CommonJS con Node.js/Express; `server.js` monta las rutas de `routes/`, controladores y servicios en la raíz. No crear una estructura `src/` sin una decisión de arquitectura aprobada.
- El backend es autoridad para sesiones, score de ronda, tokens, resolución de reveal, `comboStatus` y validación/consumo de Power Cards.
- Expo es propietario de presentación, fases de UI y rutas/posiciones locales de World Tour. Los cambios de contrato deben coordinar ambos lados.
- Los IDs de jugador del backend (`player_1`, etc.) no son los IDs locales Expo. Mantener el mapeo cliente y validar jugador y sesión en operaciones con estado.
- Sesiones y estado de cartas se mantienen en memoria del proceso. `TrackServiceV2`/PostgreSQL sirve `/api/v2/tracks/*`; las rondas de sesión usan `TrackService`, no `TrackServiceV2`.
- Target de victoria actual: Expo envía `SCORE_TO_WIN = 22` como `targetScore`; backend usa 22 de default y conserva overrides explícitos.

## Antes de implementar

- Localiza una spec aprobada en `../specs/<feature>/SPEC.md`. Si no existe, crea un borrador desde `../specs/templates/FEATURE_SPEC.template.md`; pide confirmación antes de fijar reglas de producto, scoring, persistencia, sesión o seguridad.
- Lee `../.github/copilot-instructions.md`, esta guía y la spec completa. Traza la ruta activa en `server.js` → router → controller/service; no uses documentación histórica o rutas no montadas como evidencia de comportamiento.
- Para un cambio HTTP, registra método, path, body, response/error, validación, ownership, player/session scope e IDs en la spec y actualiza la documentación canónica. Confirma el consumidor Expo en `../hitback/services/` y el comportamiento UI cuando corresponda.
- Preserva cambios no relacionados del usuario. No reviertas ni reformatees archivos ajenos al alcance.

## Pruebas y comandos

Desde `server/`:

```bash
npm test
npm test -- --runInBand __tests__/integration/expoApi.test.js
npm test -- --runInBand __tests__/services/GameSessionService.test.js
npm run lint
```

- Añade test de servicio para reglas/estado y test HTTP con Supertest para contratos consumidos por Expo. Mantén tests deterministas inyectando/fakeando proveedores externos.
- La suite HTTP actual está en `__tests__/integration/expoApi.test.js`; tests unitarios están en `__tests__/services/`. `npm run test:unit` filtra por `unit` y no coincide con esa ubicación; no lo uses como prueba completa de servicios.
- `node tests/test-deezer-integration.js` requiere Deezer y PostgreSQL disponibles; es una prueba live separada de Jest. Registra claramente servicios simulados/no disponibles y no afirmes E2E si solo pasó Supertest.
- `npm run validate` conserva comprobaciones legacy de QR de canciones y recursos locales; un fallo suyo no demuestra por sí solo que la API actual de Expo falle.
- Actualiza la spec con comandos ejecutados, resultados, fallos preexistentes y verificaciones externas o de dispositivo pendientes.

## Reglas de implementación

- Valida input y estado de sesión en el límite HTTP; devuelve status/error consistentes con los routers vecinos. No confíes en score, ownership o session scope enviado por el cliente sin validarlo.
- Mantén score de ronda y tokens en `GameSessionService`; los deltas de efectos locales se aplican a la sesión backend mediante `applyScoreDelta`.
- Inventarios y streaks de Power Card/combos deben respetar `sessionId`; añade regresiones que prueben aislamiento entre sesiones al tocar ese estado.
- No cambies reglas de juego implícitas al ampliar enums/tipos. `ComboTracker` declara thresholds 3/5/7 y resetea al alcanzar 3; los umbrales posteriores parecen inalcanzables. Resolverlo en spec y tests antes de alterar ese comportamiento.
- No describas `/api/qr/scan/:qrCode` como flujo normal: es legacy; el juego usa `/api/v2/game/*` y los QR físicos usan `/api/cards/scan-qr`.
- No afirmes disponibilidad de Deezer/PostgreSQL, durabilidad, ni soporte de producción sin verificación real.

## Referencias vigentes

- Sistema y contratos compartidos: [`../documentation/HITBACK_SYSTEM_DOCS.md`](../documentation/HITBACK_SYSTEM_DOCS.md).
- API, scripts y límites: [`README.md`](README.md).
- Tracks, fuentes y fallback: [`TRACKS.md`](TRACKS.md).
- Specs y aprobación: [`../specs/README.md`](../specs/README.md).
- `SYNC_REPORT.md` y `MIGRATION_GUIDE.md` son snapshots históricos; no seguir sus cifras, migraciones ni comandos como estado actual.
