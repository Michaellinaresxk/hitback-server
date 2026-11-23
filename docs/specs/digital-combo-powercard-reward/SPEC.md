# 🔥 Recompensa de combo (Power Card) en modo Streaming digital

- **Estado:** Implementada — verificación local completada el 2026-11-23; pendiente de prueba en dispositivo
  - Confirmado: opción **(i)** — `label_fee` aplica su `-1` al otorgar; `replay`/`festival`/`double_platinum` van al inventario y se activan con `/api/cards/use` (el modal lo explica).
  - Confirmado: `festival` da +1 a **todos** los jugadores cuando sale sorteado.
- **Responsables:** Expo (`hitback`) + backend (`hitback-server`)
- **Creado:** 2026-11-23 · **Actualizado:** 2026-11-23
- **Relacionado:** `specs/backstage/SPEC.md` (misma distinción Vinilo/Streaming), `server/AGENTS.md`, `hitback/AGENTS.md`
- **Rama sugerida:** `feature/digital-combo-powercard-reward` (a crear solo tras aprobación final)

> Decisiones de producto recibidas el 2026-11-23:
>
> 1. **Solo las Power Cards existentes** por ahora (`replay`, `festival`, `double_platinum`, `label_fee`). Las demás cartas declaradas en el tipo de Expo se agregarán en un proceso futuro.
> 2. **Flujo acordado en digital:** se detecta HOT_STREAK → aparece el modal de combo actual → se pulsa su botón → aparece un **modal nuevo con la Power Card obtenida** (hay que crearlo y traducirlo a **en / es / pl**) → se aplica el efecto → se continúa a la siguiente ronda. **No hay modal de escáner ni cámara.**
> 3. Vinilo conserva el flujo actual de escáner QR.
>
> Queda una confirmación (ver "Decisión pendiente"): cómo "aplicar el efecto" en las cartas cuyo efecto hoy es de uso diferido.

## Problema

Hoy, al encadenar 3 respuestas correctas, el backend detecta `HOT_STREAK` y la app abre un modal para escanear el QR de una **Power Card** física (`HITBACK_PC_...`). En modo **Streaming digital** (`playMode === 'digital'`) no hay mazo impreso ni nada que acercar a la cámara, así que la recompensa del combo es inalcanzable o resulta artificial.

La recompensa existe para premiar al jugador que acierta (igual que las Reaction Cards), y el efecto depende de la carta: puede quitar un punto, dar un token, dar un fan, activar un multiplicador, etc. En digital queremos conservar esa recompensa con un entrega directa.

## Usuarios y contexto

- Game Master controla la partida desde un único dispositivo (Expo) para 2–8 jugadores.
- `playMode` se elige en setup (`hitback/app/(tabs)/setup-game.tsx`) y se guarda en la sesión backend (`session.config.playMode`).
- El combo se resuelve dentro del reveal: el ganador suma su tercer acierto consecutivo y `results.comboStatus` vuelve en la respuesta.

## Comportamiento actual (verificado en código)

**Backend**

1. `server/services/GameSessionService.js › revealAnswer` → `PowerCardService.processPlayerAnswer(winnerId, true, { gameSessionId, roundNumber })`.
2. `server/services/ComboTracker.js › recordAnswer` detecta `HOT_STREAK` en `streak === 3`, registra el combo y **resetea la racha a 0** justo después.
3. `server/services/PowerCardService.js › processPlayerAnswer` ya construye `cardAwarded`, pero `_awardCardForCombo` **siempre devuelve `replay`** para los tres umbrales y **no muta el inventario**: el comentario indica que el inventario solo cambia cuando `PowerCardController` valida un QR (`POST /api/cards/scan-qr`).
4. `GameSessionService.js` copia eso a `results.comboStatus = { type, message, cardAwarded }`; `getRandomPowerCard()` ya existe en `PowerCardService` pero no se usa en este flujo.
5. `GET /api/cards/inventories/:playerId` devuelve el inventario **session-scoped**, que vive en memoria (`PowerCardService.playerInventory`) y está **fuera del snapshot** de PostgreSQL (`server/AGENTS.md`).
6. **Mazo real** (`server/data/powerCards.json`): solo 4 cartas — `replay`, `festival`, `double_platinum` (sin `effectOnDraw`) y `label_fee` (`effectOnDraw: { scoreChange: -1 }`). El tipo de Expo (`types/game.types.ts`) declara 10 (`robo`, `escudo`, `boost`, `refresh`, `peek`, `precision`…) que **no existen en el JSON**: son huérfanos y no pueden salir en el sorteo hasta definirse.
7. Efectos hoy implementados en Expo (`store/slices/playerSlice.ts › usePowerCard`): `festival` suma +1 a todos; `double_platinum` activa el modificador de la próxima ronda; `replay` y otros no tienen handler explícito; `label_fee` se aplica al recibir (`effectOnDraw`), por eso el escáner actual no lo mete al inventario (`useComboFlow.ts`).

**Expo**

8. `hitback/hooks/usePointsActions.ts` (bloque "7️⃣ Combo flow") usa `result.comboStatus` pero **ignora `cardAwarded`** y llama a `activateCombo`.
9. `hitback/hooks/useComboFlow.ts` fija la secuencia: notificación → `PowerCardScanModal` → `scanPowerCard(qrCode, backendPlayerId)` → `addPowerCard` local → `advanceToNextTurn`. No hay timeout: depende del GM.
10. `hitback/app/(tabs)/game.tsx` monta ambos modales **sin condicionar por `playMode`**.
11. `hitback/services/GameSessionService.ts` declara `comboStatus.cardAwarded?: { id, name, emoji }`: falta `type`, `description`, `usageLimit` y `effectOnDraw`.

**Hecho clave:** backend ya sabe otorgar y ya tiene `getRandomPowerCard()`; el cambio es conectar el sorteo al reveal digital, publicar la carta completa y sustituir el modal de cámara por un modal de lectura.

## Comportamiento deseado

### 💿 Vinilo (sin cambios)

Combo → `ComboNotification` → escáner QR → `POST /api/cards/scan-qr` → inventario → avanzar turno.

### 📡 Streaming digital (nuevo)

1. Se detecta `HOT_STREAK` igual que hoy (misma regla y reseteo de racha).
2. **Dentro de la misma mutación del reveal**, el backend elige una carta **aleatoria** del mazo existente (`getRandomPowerCard()` o equivalente session-aware) y la otorga al jugador que acertó.
3. El backend devuelve en `results.comboStatus.cardAwarded` la carta completa: `id`, `type`, `name`, `description`, `emoji`, `usageLimit` y `effectOnDraw` (si aplica). La carta otorgada es la fuente de verdad; no se genera ni se escanea ningún QR para digital.
4. **Paso 1 — modal de combo (ya existe):** Expo muestra `ComboNotification` con el nombre del jugador y el mensaje del combo. El botón existente (`rewards.awesome`) pasa a abrir el modal de carta en digital, en lugar del escáner.
5. **Paso 2 — modal nuevo de Power Card obtenida (crear):** sin cámara, muestra emoji, nombre, descripción y efecto de la carta sorteada, además del jugador premiado. Botón de confirmar ("Entendido / Got it / Rozumiem" según idioma). Debe traducirse a los **3 idiomas disponibles**: `i18n/locales/en.json`, `es.json` y `pl.json`, bajo un namespace nuevo (p. ej. `powerCardReward.*`), sin dejar claves sin traducir.
6. **Paso 3 — aplicar efecto y continuar:** al confirmar el modal nuevo se aplica el efecto de la carta y se llama a `advanceToNextTurn()`. No hay timeout automático: el avance depende de que el GM confirme (misma filosofía del flujo actual).
7. El otorgamiento es **idempotente por evento de combo**: reintentar el reveal o recargar la app no puede dar dos cartas. Clave sugerida: `${sessionId}:${roundNumber}:${winnerId}:HOT_STREAK`.
8. El inventario resultante respeta `sessionId`: dos sesiones no comparten cartas.
9. Si el backend falla al otorgar, se muestra error visible y **no se avanza el turno** ni se registra una carta local huérfana.

### Decisión pendiente — aplicación del efecto

El enunciado "se aplica el efecto" tiene dos lecturas con las 4 cartas actuales:

- **(i) Respetar la semántica actual (supuesto por defecto):** `label_fee` aplica su `-1 punto` al otorgar (es su `effectOnDraw`); `replay`, `festival` y `double_platinum` se registran en el inventario del jugador y se activan después con `POST /api/cards/use` (el modal lo explica: "se guarda para usarla más tarde"). El efecto "se aplica" dentro de este flujo en el sentido de que la carta queda lista para usarse y NO se avanza de ronda hasta que el GM confirma el modal. No cambia el balance.
- **(ii) Aplicar los 3 efectos restantes al instante:** habría que definir nuevas reglas para `replay`/`festival`/`double_platinum` (y eventualmente cartas de fan/token que hoy no existen). Cambia el scoring y el contrato; requiere aprobación explícita.

Hasta confirmar lo contrario, la spec asume **(i)**. Es el único punto abierto antes de implementar.

## Alcance

### Incluido

- Sorteo aleatorio session-aware **entre las 4 cartas existentes** y otorgamiento atómico en el reveal digital.
- Carta completa en `comboStatus.cardAwarded` y tipado alineado en Expo.
- **Nuevo modal de Power Card obtenida**, sin cámara, condicionado por `playMode`, con botón de confirmación que aparta el efecto y avanza de ronda.
- **Traducción del nuevo modal a `en`, `es` y `pl`** (todas las claves del namespace nuevo en los 3 archivos).
- Idempotencia y aislamiento por `sessionId`.
- Aplicación del efecto según la opción (i) o (ii) confirmada.

### Excluido

- Modificar la detección del combo (3 aciertos, reset a 0).
- Habilitar `DOUBLE_HIT` (5) / `TRIPLE_HIT` (7): hoy inalcanzables por el reset en 3 (problema separado).
- Cambiar Vinilo ni `POST /api/cards/scan-qr`.
- Crear las cartas adicionales declaradas en el tipo de Expo: se dejan para un **proceso futuro**, no entran en esta feature. Las cartas de fan/token tampoco se crean aquí.
- Persistir inventarios en PostgreSQL; siguen en memoria y fuera del snapshot.

## Propiedad de datos y ciclo de vida

| Dato | Dueño | Alcance | Persistencia |
| --- | --- | --- | --- |
| Racha / detección `HOT_STREAK` | Backend (`ComboTracker`) | jugador en sesión | memoria (prefijo `sessionId::`) |
| Carta sorteada y otorgada | Backend (`PowerCardService`) | sesión + jugador | respuesta del reveal; registro de idempotencia en memoria |
| Inventario de Power Cards | Backend | sesión + jugador | memoria, fuera del snapshot |
| Copia local en Expo | Expo (Zustand) | presentación / hidratación | local, sincronizada desde backend |
| `session.config.playMode` | Backend | sesión | snapshot PostgreSQL |

## Contratos HTTP

| Método | Path | Request | Éxito | Error |
| --- | --- | --- | --- | --- |
| `POST` | `/api/v2/game/session/:id/reveal` | `{ winnerId, ... }` | `results.comboStatus` + `cardAwarded` completo e inventario actualizado | códigos actuales del reveal; si falla el otorgamiento, no avanzar turno |
| `GET` | `/api/cards/inventories/:playerId` | `playerId` mapeado, `sessionId` | inventario session-scoped | 400/404 según validación existente |
| `POST` | `/api/cards/scan-qr` | `{ qrCode, playerId, sessionId? }` | **sin cambios**, solo Vinilo | sin cambios |
| `POST` | `/api/cards/use` | `{ playerId, cardId, sessionId? }` | **sin cambios**; se usa para activar cartas guardadas (opción i) | sin cambios |

Notas: los IDs de Expo no son los del backend; usar `buildPlayerIdMap()` / `getBackendPlayerId()`. Toda mutación valida `sessionId` + `playerId` y es idempotente por evento de combo.

## Criterios de aceptación

- [ ] Dado un combo en Vinilo, cuando se revela, entonces sigue apareciendo el escáner y `scan-qr` sigue siendo obligatorio.
- [ ] Dado un combo en Streaming, cuando se revela, entonces aparece **solo el modal de combo** y, al pulsar su botón, aparece el **modal nuevo de la Power Card**; en ningún momento se abre cámara ni modal de escaneo.
- [ ] Dado el modal nuevo, cuando se muestra, entonces indica jugador premiado, emoji, nombre, descripción y efecto de la carta, con texto traducido en `en`, `es` y `pl` (sin claves faltantes).
- [ ] Dado el modal nuevo, cuando se pulsa confirmar, entonces se aplica el efecto y se avanza a la siguiente ronda; si no se confirma, la ronda no avanza.
- [ ] Dado un combo en Streaming, cuando se confirma el modal de carta, entonces la carta aleatoria aparece en el inventario del jugador correcto y en ningún otro.
- [ ] Dado un `label_fee` sorteado, cuando se otorga, entonces su `-1 punto` se aplica una sola vez (opción i).
- [ ] Dado un reintento del mismo reveal, entonces no se otorga una segunda carta.
- [ ] Dado un fallo del backend, entonces hay error visible, sin avance de turno y sin carta local huérfana.
- [ ] Dado dos sesiones simultáneas, entonces sus inventarios no se comparten.
- [ ] Dado el sorteo, entonces la carta proviene del mazo real configurado en `powerCards.json` (4 cartas hoy), nunca de los tipos huérfanos del tipo de Expo.

## Plan de pruebas

### Automatizadas

- `server/__tests__/services/PowerCardService.test.js`: sorteo desde el mazo, otorgamiento session-scoped, idempotencia, efecto de `label_fee`.
- `server/__tests__/services/GameSessionService.test.js`: reveal con combo en `digital` vs `physical`, `cardAwarded` completo, sin avance de turno si falla el otorgamiento.
- `server/__tests__/integration/expoApi.test.js`: Supertest del reveal digital con combo; verificar `comboStatus.cardAwarded` y `GET /api/cards/inventories/:playerId`.
- Expo: `npx tsc --noEmit` y `npm run lint`; el tipo de `comboStatus.cardAwarded` debe coincidir con el backend. No afirmar tests unitarios de Expo: el proyecto no declara script de tests.
- i18n: comprobar que el namespace nuevo del modal existe con las mismas claves en `i18n/locales/en.json`, `es.json` y `pl.json` (y que no haya interpolaciones sin resolver).

### Manuales / dispositivo

- Partida real Streaming: 3 aciertos → modal de combo → pulsar botón → modal nuevo con la carta aleatoria (sin cámara) → pulsar confirmar → efecto visible → avance de turno.
- Cambiar el idioma de la app a EN/ES/PL y repetir el flujo: todos los textos del modal nuevo deben estar traducidos.
- Partida real Vinilo: el escáner sigue apareciendo y `scan-qr` sigue siendo necesario.
- Repetir reveal / recargar app: una sola carta.
- Dos dispositivos/sesiones: inventarios aislados.

## Plan de implementación (solo tras aprobación final)

- [x] Confirmar decisión (i) para "aplicar el efecto".
- [x] Backend: `PowerCardService.processPlayerAnswer` sortea entre las 4 cartas existentes en digital, registra el otorgamiento en el inventario backend (salvo `effectOnDraw`), es idempotente por `${sessionId}:${roundNumber}:${playerId}:HOT_STREAK` y devuelve `cardAwarded` completo. `GameSessionService.revealAnswer` envía `playMode` en el contexto.
- [x] Expo: `useComboFlow` recibe `playMode`; el botón de `ComboNotification` abre el escáner solo en Vinilo y el modal nuevo en Streaming; `handlePowerCardRewardConfirm` aplica `effectOnDraw` (label_fee) o agrega la carta local y avanza el turno; `game.tsx` monta `PowerCardRewardModal`.
- [x] i18n: namespace `powerCardReward.*` con las mismas 6 claves en `en.json`, `es.json` y `pl.json`.
- [x] Tests backend (5 unitarios de servicio + 1 HTTP) y documentación canónica actualizados.

## Riesgos y decisiones sin resolver

1. **Aplicación del efecto (i vs ii):** único punto bloqueante; define scoring y contrato.
2. **Mazo de 4 cartas — aceptado:** el sorteo se limita a `replay`, `festival`, `double_platinum` y `label_fee`. El resto se agregará en un proceso futuro. El tipo de Expo declara 6 tipos más que no existen en el JSON: no aparecerán en esta feature.
3. **`festival` da +1 a todos**, no solo al jugador premiado: confirmar que eso es lo deseado como recompensa de combo (no afecta al sorteo).
4. **`DOUBLE_HIT`/`TRIPLE_HIT` inalcanzables** por el reset en 3; no ampliar recompensas hasta corregirlo en spec/tests.
5. **Inventario en memoria:** una carta otorgada se pierde si el proceso del backend reinicia; confirmar que es aceptable en desarrollo (AGENTS.md lo permite).
6. **Doble camino:** Vinilo (local vía `scan-qr`) y Streaming (backend) conviven; documentar si es transitorio.

### Fix posterior (2026-11-23): cartas de compañero con 2 jugadores

Al probar en dispositivo se detectó un bloqueo de la app en Streaming con solo 2 jugadores cuando el backstage sacaba `FEATURING` (o `DUEL`/`ALLIANCE`): el modal de selección de compañero no podía completarse y la ronda no avanzaba.

Decisión de producto confirmada: **cancelar la carta, avisar al jugador y avanzar de ronda.**

- Backend (`GameSessionService.applyReactionCard`): rechaza `FEATURING`/`DUEL`/`ALLIANCE` con `session.players.length < 3` y devuelve `code: 'INSUFFICIENT_PLAYERS'` (400) antes de mutar estado. Test HTTP añadido.
- Expo (`game.tsx › handleBackstageUse`): si la carta pendiente es de compañero y hay <3 jugadores, descarta la carta en backend, limpia el estado local, muestra el aviso traducido (`backstage.partnerRequiredTitle` / `partnerRequiredMessage` en `en`/`es`/`pl`) y llama a `advanceToNextTurn()`.
- Sin este guard, el modal de selección quedaba abierto sin opción válida y la app parecía congelada. El avance explícito rompe ese bucle.

### Fix posterior (2026-11-23): B-SIDE no compite con HOT_STREAK

Al probar con 2 jugadores, al completar HOT_STREAK en la ronda 3 también se activaba B-SIDE (el otro jugador llevaba 3 derrotas), mostrando dos eventos a la vez.

Causa: incongruencia de umbral — Expo ya tenía `BSIDE_LOSS_THRESHOLD = 4` (`hitback/constants/LossStreak.ts`) pero el backend usaba `next >= 3` en `_updateBSideStreaks`.

Decisión confirmada: **alinear backend a 4 y dar prioridad a HOT_STREAK.**

- Backend: nueva constante `server/constants/lossStreak.js` con `BSIDE_LOSS_THRESHOLD = 4`, usada por `_updateBSideStreaks`.
- Backend: `revealAnswer` marca `comboDetectedThisRound` cuando `comboResult.comboDetected` y lo pasa a `_updateBSideStreaks(session, winnerId, suppressActivation)`. Si hay combo, **no se activa ningún B-SIDE nuevo en esa ronda**; el contador `lossStreak` sigue subiendo y B-SIDE se activa en el siguiente turno si el jugador sigue sin acertar (decisión: posponer, no descartar).
- Expo: sin cambios — ya usaba umbral 4 y la notificación de B-SIDE se rige por `results.bSideActivatedPlayerIds` del backend.
- Tests HTTP añadidos: B-SIDE se activa en 4 derrotas (no 3) y se pospone cuando coincide con HOT_STREAK.

### Fix posterior (2026-11-23): bloqueo total de modales con 2 jugadores

Al probar en dispositivo:

1. **Seguía apareciendo el modal de DUEL con 2 jugadores y daba error al elegir oponente.** Faltaban guardias en dos rutas:
   - `handleTourLandingContinue` case `'duel'` (casilla `rival_band`): con <3 jugadores muestra el aviso y avanza, sin abrir `DuelModal`.
   - `handleReactionCard`: guardia global al inicio para `FEATURING`/`DUEL`/`ALLIANCE` con <3 jugadores (cubre también el picker manual de Vinilo).
   - Junto con la guardia previa en `handleBackstageUse`, los tres modales quedan bloqueados con 2 jugadores en las tres rutas posibles. El backend ya rechazaba estas cartas con `INSUFFICIENT_PLAYERS`.

### Decisión final sobre B-SIDE (2026-11-23)

Se evaluó dar el +1 al activarse, pero se **revirtió** (commit `ceb0a3c`). Decisión final: **el +1 se guarda y se cobra en el comeback** — cuando el jugador con B-SIDE gana su próxima pregunta, recibe los puntos de esa pregunta **más 1** del B-SIDE.

Razones (según producto): darlo al activarse sería injusto con los demás jugadores y sería caótico si varios jugadores llevan 4 rondas sin anotar (todos recibirían +1 a la vez).

- Backend: `_updateBSideStreaks` solo marca `bSideActive = true` al llegar a 4 derrotas (sin puntos). El bloque de `scoreModifiers.bSidePlayerId` en `revealAnswer` suma `+1` y limpia el flag cuando ese jugador gana.
- Expo: envía `scoreModifiers.bSidePlayerId` cuando `player.bSideActive` (sin cambios). El modal `LossStreakModal` es el aviso de que el B-SIDE está disponible.
- El umbral 4 y la prioridad de HOT_STREAK (sección anterior) se mantienen.

## Resultados de verificación

| Comando / check | Resultado | Notas |
| --- | --- | --- |
| `npm test` (server) | ✅ | 7 suites, 98 tests passed (antes: 92). Nuevos tests: sorteo/efecto/idempotencia/aislamiento y reveal HTTP digital con combo. |
| `npm run lint` (server) | ✅ | 0 errores; 23 warnings preexistentes (`no-unused-vars`). |
| `npx tsc --noEmit` (Expo) | ✅ | Sin errores de tipo tras alinear `cardAwarded` y `playMode`. |
| `npm run lint` (Expo) | ❌ preexistente | ESLint 10 + `eslint-config-expo`: `react/display-name` → `contextOrFilename.getFilename is not a function`. Ocurre en `_layout.tsx`, archivo no tocado; no es causado por esta feature. |
| i18n EN/ES/PL | ✅ | Mismo namespace `powerCardReward` con 6 claves en los 3 archivos; JSON válido. |
| `node --check` (archivos backend tocados) | ✅ | `PowerCardService.js`, `GameSessionService.js`, `expoApi.test.js`. |
| Prueba en dispositivo | Pendiente | Requiere app y backend corriendo; no se afirmó verificación E2E. |

## Aprobación

Aprobada el 2026-11-23 con la opción **(i)**: `label_fee` aplica su `-1` al otorgar y `replay`/`festival`/`double_platinum` quedan en el inventario para usarse con `/api/cards/use` (el modal lo explica). Confirmado además que `festival` da +1 a todos los jugadores cuando sale sorteado. Implementada en la sesión de trabajo de esa misma fecha; el detalle de comandos ejecutados está en "Resultados de verificación".
