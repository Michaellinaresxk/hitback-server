# 🎟️ Modos Vinilo / Streaming y Backstage

- **Estado:** Propuesta, sin implementar
- **Responsables:** Expo (`hitback`) + backend (`hitback-server`)
- **Creado:** 2026-11-22 · **Actualizado:** 2026-11-22
- **Rama sugerida:** `feature/backstage-reaction-cards`
- **Diseño:** [`BACKSTAGE.md`](./BACKSTAGE.md)

## Problema

HITBACK se diseñó con un tablero físico fijo, donde las casillas del tablero indicaban cuándo tomar una Reaction Card. En una partida sin tablero no hay regla de **cuándo** un jugador gana una carta ni **cuál** le toca.

## Principio: no hay inventario

Una Reaction Card **se usa en el momento en que se obtiene**. Nadie guarda cartas para después.

- Las cartas con duración (MUTE, ALLIANCE, ARTIST_HOLD…) siguen activas las rondas que les toque y, al terminar, se retiran de ese jugador. Esto **ya funciona** en el backend: `activeEffects` con `roundsLeft` y `status: 'expired'` (`GameSessionService.js`, líneas ~283–294).
- No se añade `reactionHand` ni nada parecido.

## Comportamiento actual (verificado en el código)

- Expo genera las rutas (`utils/worldtourUtils.ts › generateRoute`): 22 casillas, posiciones 0–21. El backend las valida y es la autoridad.
- `revealAnswer` del backend avanza al ganador una casilla (`boardPosition + 1`, tope 21) dentro de la misma mutación persistida.
- El GM abre `ReactionCardPickerModal`, elige la carta y `applyReactionCard` la aplica en el acto. **Este es justo el flujo de Vinilo.**
- `TILE_MECHANICS.festival = 'reaction_card'`, pero el caso `reaction_card` en `game.tsx` solo llama a `advanceToNextTurn()`.
- `gameMode` **ya existe** con otro significado (`'normal' | 'battle' | 'speed' | 'viral'`). No se puede reutilizar.
- `_sanitizeSession` ya elimina datos secretos antes de responder; el mazo seguirá el mismo patrón.

## Modos de juego

Se elige **en el setup, antes de crear la sesión**, y no cambia durante la partida.

| `playMode` | Nombre           | Cuándo hay carta                                     | Cuál toca                               | Cuándo se usa                       |
| ---------- | ---------------- | ---------------------------------------------------- | --------------------------------------- | ----------------------------------- |
| `physical` | 💿 **Vinilo**    | Lo dice el tablero físico                            | La que el jugador saca del mazo físico  | En cuanto el GM la registra         |
| `digital`  | 📡 **Streaming** | Lo dice la ruta: backstage cada `BACKSTAGE_INTERVAL` | La que saca el mazo virtual del backend | En cuanto se revela en el backstage |

- Nombres traducidos con i18n (`setup.playMode.physical.*`, `setup.playMode.digital.*`); el valor interno no cambia.
- Selector obligatorio: sin valor por defecto en la UI; el botón de empezar se desactiva hasta elegir. Las sesiones antiguas sin `playMode` se recuperan como `physical`.

## Comportamiento deseado

### 💿 Vinilo: el flujo de hoy

1. El tablero físico indica que el jugador toma carta. Saca una del mazo y se la enseña al GM.
2. El GM abre el picker en ese jugador, toca la carta y elige el objetivo si hace falta.
3. `applyReactionCard` la aplica en el acto. No se guarda nada más.
4. La app no calcula backstages ni muestra 🎟️ ni el aviso "A 1 acierto".

### 📡 Streaming: la ruta decide

5. Las posiciones múltiplo de `BACKSTAGE_INTERVAL` (3, 6, 9, 12, 15, 18) son backstage. Se calcula a partir de la posición, **no se guarda en la ruta**.
6. Cuando un reveal deja al ganador en una casilla de backstage, el backend saca una carta del mazo y la deja como **carta en juego** (`session.backstageCard`), y la devuelve en `results.backstage`.
7. Expo muestra la escena (_"🎟️ BACKSTAGE · Londres — Un crítico se te acercó… Obtienes BAD REVIEW"_) y, al continuar, **abre directamente el flujo de esa carta** (elegir objetivo, o el modal de FEATURING / ALLIANCE / DUEL).
8. Al confirmar, `applyReactionCard` la aplica y borra `session.backstageCard`.
9. Si la carta no se puede aplicar (por ejemplo, STOP_BLAST ya está activo) o el GM pulsa "Descartar", se pierde. `nextRound` borra cualquier `backstageCard` sin usar.
10. En Streaming el picker manual no se muestra: las cartas solo salen del backstage.
11. El scoreboard muestra **"🎟️ A 1 acierto del Backstage"** cuando la siguiente casilla del jugador es backstage, y la ruta marca las casillas de backstage con 🎟️.

`session.backstageCard` **no es un inventario**: como mucho hay una carta, de un jugador, y solo hasta la siguiente ronda. Sirve para que el backend sepa qué carta toca aplicar y para recuperarla si la app se cierra justo después del reveal.

## Modelo de datos (backend, persistido en el snapshot)

```js
session.config.playMode; // 'physical' | 'digital' — obligatorio al crear
session.config.backstageInterval; // solo digital; por defecto BACKSTAGE_INTERVAL (3)
session.backstageDeck; // solo digital; SECRETO: se borra en _sanitizeSession
session.lastBackstageCard; // solo digital; SECRETO, para no repetir al rebarajar
session.backstageCard; // solo digital; { playerId, cardType, position, cityId } | null
```

### Constantes (`constants/backstage.js`)

```js
BACKSTAGE_INTERVAL = 3;
BACKSTAGE_LAST_POSITION = 18; // nunca en 0 ni en 21
BACKSTAGE_DECK = [
  'FEATURING',
  'ALLIANCE',
  'DUEL',
  'SOLD_OUT',
  'ROYALTIES',
  'COPYRIGHTS',
  'BAD_REVIEW',
  'MANAGEMENT_FEE',
  'MUTE',
  'ARTIST_HOLD',
  'STOP_BLAST',
  'CHARITY_SHOW',
];
```

### Expo

```ts
type PlayMode = 'physical' | 'digital'; // distinto de gameMode
interface BackstageCard {
  playerId: string;
  cardType: ReactionCardType;
  position: number;
  cityId: string;
}
```

Expo lee el intervalo de `session.config.backstageInterval`; no tiene copia propia.

## Reglas del mazo (Streaming)

- Se crea al iniciar la sesión: `BACKSTAGE_DECK` barajado (Fisher–Yates).
- Robar = sacar la primera carta, sin reemplazo hasta vaciar el mazo.
- Al vaciarse se vuelve a barajar; si la primera carta nueva es igual a `lastBackstageCard`, se cambia por otra.
- Solo existe en el backend; nunca aparece en una respuesta HTTP.

## Contrato HTTP (`/api/v2/game`)

| Método y ruta              | Cambio                                                                                                                       | Respuesta                                                             | Errores                                                       |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------- |
| `POST /session`            | **Requiere** `config.playMode`                                                                                               | Sesión con `config.playMode` (y `backstageInterval` en digital)       | `400` si falta o no es válido                                 |
| `POST /session/:id/reveal` | Digital: si el ganador llega a un backstage, roba y guarda `backstageCard`                                                   | `results.backstage: BackstageCard \| null` (siempre `null` en físico) | Sin cambios; si falla el snapshot se revierte también el robo |
| `applyReactionCard`        | Físico: sin cambios. Digital: exige que `sourcePlayerId` y `cardType` coincidan con `backstageCard`, y lo borra al aplicarse | Igual que hoy                                                         | `400 "No hay carta de backstage para ese jugador"`            |
| `POST /session/:id/round`  | Digital: borra `backstageCard` sin usar                                                                                      | Sin cambios                                                           | —                                                             |
| `GET /session/:id`         | —                                                                                                                            | Incluye `config` y `backstageCard`; **no** incluye el mazo            | —                                                             |

Las cartas de selección previa (FEATURING, ALLIANCE, DUEL) borran `backstageCard` cuando el backend confirma el comando, no al abrir su modal.

## Cambios por capa

### Backend (`hitback-server`)

- `constants/backstage.js` (nuevo).
- `services/BackstageDeck.js` (nuevo, funciones puras): `createDeck`, `drawCard`, `isBackstagePosition`, `crossedBackstages(from, to, interval)`.
- `createSession`: guarda `playMode`; en digital crea el mazo.
- `revealAnswer`: en digital, después de `boardPosition + 1`, roba si hay backstage.
- `applyReactionCard`: en digital valida y borra `backstageCard`.
- `nextRound`: borra `backstageCard` sin usar.
- `_sanitizeSession`: borra `backstageDeck` y `lastBackstageCard`.
- `restoreSession`: sesiones antiguas → `playMode: 'physical'`.

### Expo (`hitback`)

- Tipos: `PlayMode`, `BackstageCard`.
- `utils/worldtourUtils.ts`: `isBackstagePosition`, `hitsToNextBackstage` (puras).
- `setup-game.tsx`: selector obligatorio 💿 Vinilo / 📡 Streaming.
- `components/modal/BackstageModal.tsx` (nuevo): escena + botones "Usar carta" / "Descartar".
- `game.tsx` / `useGameFlow.ts`: tras el landing de la ciudad, si `results.backstage` existe muestra el modal y lanza el flujo de la carta con el jugador como origen (reutiliza `handleReactionCard`).
- `ReactionCardPickerModal` / scoreboard: el botón del picker manual solo aparece en Vinilo; el aviso "A 1 acierto" solo en Streaming.
- `TourLandingModal.tsx` / vista de ruta: 🎟️ en las casillas de backstage (solo Streaming).
- `i18n/locales/{es,en,pl}`: nombres de los modos, 12 escenas, textos de UI.
- `constants/worldTour.ts`: `TILE_MECHANICS.festival` pasa a `null`.

## Criterios de aceptación

### Setup

- [ ] No se puede empezar sin elegir Vinilo o Streaming; nombres traducidos en es/en/pl.
- [ ] `POST /session` sin `playMode` responde `400`; el modo no cambia durante la partida.

### Vinilo

- [ ] El GM registra una carta desde el picker y se aplica al instante, igual que hoy.
- [ ] El reveal nunca devuelve backstage; no hay 🎟️ ni aviso "A 1 acierto".

### Streaming

- [ ] `isBackstagePosition` es verdadero solo en 3, 6, 9, 12, 15 y 18 con intervalo 3.
- [ ] Un reveal que deja al ganador en backstage devuelve `results.backstage` con una carta y la guarda en `backstageCard`.
- [ ] Un reveal sin ganador, o que no llega a backstage, devuelve `null`.
- [ ] Tras la escena se abre el flujo de esa carta; al aplicarla, `backstageCard` queda en `null`.
- [ ] `applyReactionCard` con otra carta u otro jugador responde `400` y no crea ningún efecto.
- [ ] "Descartar" o pasar a la siguiente ronda elimina la carta sin aplicarla.
- [ ] El mazo nunca aparece en ninguna respuesta.
- [ ] Doce robos seguidos dan las doce cartas sin repetir; al rebarajar, la primera no repite la última.
- [ ] Si la app se cierra tras el reveal, al recuperar la sesión vuelve a ofrecer la carta en juego.
- [ ] El picker manual no aparece.

### Común

- [ ] Las cartas con duración se retiran del jugador al terminar (comportamiento actual, cubierto por un test de regresión).
- [ ] Sesiones guardadas antes de este cambio se recuperan como `physical`.
- [ ] Tests: lógica pura (mazo, posiciones), servicio del backend, componentes (BackstageModal, selector de modo) y dos flujos end-to-end: Streaming (reveal → backstage → aplicar) y Vinilo (registrar → aplicar).

## Fuera de alcance (v1)

- Cartas según la posición en la tabla (remontada), con `BACKSTAGE_COMEBACK_ENABLED`.
- Movimientos de más de +1 (`crossedBackstages` ya lo cubre, pero hoy solo se avanza de uno en uno).
- Limpiar `'BLOCK'` del tipo `ReactionCardType` en Expo: es un resto sin carta ni lógica, se puede quitar en un commit aparte.

## Decisiones tomadas (2026-11-22)

- Nombres de los modos: **💿 Vinilo** (físico) y **📡 Streaming** (digital). Se eligen antes de empezar.
- Vinilo: el tablero físico dice cuándo; el jugador saca la carta, el GM la registra y se usa en el acto.
- Streaming: la ruta decide; la carta se revela en el backstage y se usa en el acto.
- **No hay inventario** en ningún modo. Las cartas con duración se retiran del jugador al terminar.
- `BLOCK` no existe como carta del juego; queda fuera del mazo.

## Verificación real (2026-11-22)

| Comprobación | Resultado |
| --- | --- |
| `cd server && npm test -- --runInBand __tests__/services/BackstageDeck.test.js __tests__/services/GameSessionService.test.js __tests__/integration/expoApi.test.js` | ✅ 3 suites, 34 tests passed |
| `cd server && npm test -- --runInBand` | ✅ 7 suites, 92 tests passed |
| `cd server && npm run lint` | ❌ Bloqueado por entorno: falta `eslint.config.*` (ESLint 10.15.0) |
| `cd hitback && npx tsc --noEmit` | ✅ Sin errores de tipos |
| `cd hitback && npm run lint` | ❌ Bloqueado por entorno: `eslint-plugin-react` incompatible con ESLint 10 (`contextOrFilename.getFilename is not a function`) |
| `cd hitback && npm run test:tour-locales` | ✅ 3 tests passed |
| Prueba manual iOS/Android (Vinilo y Streaming) | ⏳ Pendiente en dispositivo/simulador |

## Verificación prevista

| Comprobación                       | Dónde                                                        |
| ---------------------------------- | ------------------------------------------------------------ |
| Jest backend                       | `hitback-server › npm test`                                  |
| Type-check Expo                    | `npx tsc --noEmit`                                           |
| Tests de lógica y componentes Expo | Requiere añadir runner (hoy solo existe `test:tour-locales`) |
| Traducciones                       | `npm run test:tour-locales` (ampliado con las escenas)       |
| Prueba manual, Vinilo y Streaming  | iOS/Android                                                  |
