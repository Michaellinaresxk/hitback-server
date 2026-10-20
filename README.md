# HITBACK Backend

> Guía operativa cotejada con rutas, servicios y tests del servidor el 2026-10-20. La suite HTTP usa dependencias deterministas; Deezer, PostgreSQL, cámara y dispositivos no se verificaron con esta revisión.

## Requisitos y arranque

- El `package.json` del servidor declara Node.js `>=14`; usar una versión de Node actualmente soportada por Expo y por las dependencias del workspace. El mínimo declarado no equivale a soporte operativo comprobado.
- Desde esta carpeta:

```bash
npm install
npm run dev
```

`npm start` inicia `node server.js`; `npm run dev` inicia nodemon. El servidor escucha en `0.0.0.0:3000` por defecto. Expo lee primero `EXPO_PUBLIC_HITBACK_API_URL`; en desarrollo intenta detectar el host de Expo y usa `192.168.1.10` como fallback. Confirma conectividad desde el dispositivo; el endpoint `/api/expo/health` informa IPs detectadas, pero no verifica los flujos de juego.

## Arquitectura actual

`server.js` monta rutas desde `routes/` y servicios/controladores desde sus carpetas en la raíz. No existe un directorio `src/` como el que describían versiones anteriores de este README.

| Área                                             | Código activo                                                                               |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Sesiones, rondas, apuestas, reveal y score delta | `routes/gameSession.js`, `services/GameSessionService.js`                                   |
| Tracks estáticos / recurso legacy                | `routes/tracks.js`, `services/TrackService.js`, `data/tracks.json` si está presente         |
| Búsqueda dinámica de tracks v2                   | `routes/tracksV2.js`, `services/TrackServiceV2.js`, `services/DeezerServiceV2.js`           |
| Audio y streaming                                | `routes/audio.js`, `services/AudioService.js`, `public/audio/tracks/`                       |
| Health                                           | `routes/health.js` y endpoint Expo `/api/expo/health`                                       |
| Power Cards físicas e inventario                 | `routes/powerCard.js`, `controllers/PowerCardController.js`, `services/PowerCardService.js` |
| Combos                                           | `services/ComboTracker.js`, llamado durante reveal                                          |

Las rondas del juego de Expo usan `/api/v2/game/*`; `GameSessionService.nextRound()` usa `TrackService` y puede consultar Deezer, con tracks usados guardados en memoria por sessionId. `TrackServiceV2` con PostgreSQL está montado como recurso separado `/api/v2/tracks/*`; no es el servicio que crea las rondas de sesión. Si PostgreSQL no está disponible, TrackServiceV2 intenta fallback en memoria, sin persistencia. No prometas disponibilidad “ilimitada” ni recuperación durable.

## API que consume la app

### Sesiones `/api/v2/game`

| Método   | Ruta                                   | Uso                                                                             |
| -------- | -------------------------------------- | ------------------------------------------------------------------------------- |
| `POST`   | `/session`                             | Crear sesión con nombres/configuración                                          |
| `POST`   | `/session/:id/start`                   | Iniciar sesión                                                                  |
| `POST`   | `/session/:id/round`                   | Obtener pista y pregunta                                                        |
| `POST`   | `/session/:id/bet`                     | Registrar apuesta `{ playerId, tokens }`                                        |
| `POST`   | `/session/:id/reveal`                  | Revelar con `{ winnerId }` o `null`                                             |
| `GET`    | `/session/:id`                         | Consultar estado                                                                |
| `GET`    | `/sessions`                            | Listar sesiones del proceso                                                     |
| `DELETE` | `/session/:id`                         | Eliminar sesión                                                                 |
| `POST`   | `/session/:id/power`                   | Activar carta por `playerId` + `cardId`; valida inventario asociado a la sesión |
| `POST`   | `/session/:id/double-platinum`         | Activar el modificador de tile hasta el siguiente reveal                        |
| `PATCH`  | `/session/:id/players/:playerId/score` | Aplicar delta de score                                                          |
| `GET`    | `/health`                              | Health de sesiones                                                              |

Las sesiones y el inventario del servicio se mantienen en memoria del proceso; reiniciar el backend no es un mecanismo de recuperación.

### Power Cards `/api/cards`

- `POST /scan-qr`: escanea QR `HITBACK_PC_{cardId}` (también admite sufijo timestamp); body `{ qrCode, playerId, sessionId? }`. El controlador agrega al inventario backend salvo cartas con `effectOnDraw`.
- `GET /inventory/:playerId`: inventario; pasar `?sessionId=...` para recuperar inventario de una sesión. Sin el parámetro consulta el scope global legacy.
- `GET /inventories/all`: diagnóstico de todos los inventarios.
- `GET /printable-qrs`: QRs imprimibles.
- `POST /use`: endpoint PowerCard independiente; el cliente Expo del flujo de partida activa cartas mediante `POST /api/v2/game/session/:id/power`.
- `POST /test-add`: ruta de diagnóstico; no usar como flujo de juego.
- `DELETE /player/:playerId`: limpiar datos de jugador.

La app Expo no usa `POST /api/qr/scan/:qrCode` para iniciar una canción. No documentes ese endpoint heredado como paso de juego.

### Recursos

- Tracks: `/api/tracks` y `/api/v2/tracks` (incluye `/health`, `/random`, `/search`, `/stats`).
- Audio: `/api/audio/list`, `/api/audio/check/:filename`, `/api/audio/stream/:filename`, `/api/audio/metadata/:filename`, `/api/audio/diagnostics`, `/api/audio/integrity`, `/api/audio/stats`, `/api/audio/test/:filename`.
- Health general: `/api/health`, `/api/health/expo`, `/api/health/diagnostic`.
- Audio estático: `/audio/tracks/*`.
- `/api/expo/health` es un endpoint adicional definido directamente en `server.js`.

## Configuración

`PORT` y `HOST` tienen defaults `3000` y `0.0.0.0`. `TrackServiceV2` lee `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` y `DB_NAME` (`Hitback` por defecto); estas variables son para `/api/v2/tracks/*`, no para elegir rondas de sesión. La integración actual de Deezer no declara una API key.

No hay `.env.example` comprometido/verificado; `server/.env` es local y está ignorado. No compartas secretos ni copies credenciales a documentación. Revisa `server/.gitIgnore` antes de crear archivos de entorno.

## Verificación

```bash
npm test
npm run test:coverage
npm run lint
npm run health
npm run validate
```

Las pruebas Jest están bajo `__tests__/`. `npm test` ejecuta Jest serialmente; `npm run test:coverage` genera coverage sobre directorios del backend (no implica cobertura completa del comportamiento). `npm run test:integration` ejecuta los tests Jest de `__tests__/integration`; `npm run test:unit` busca una carpeta `unit`, pero las suites unitarias actuales están en `__tests__/services`, así que no usar ese script como prueba de unidad sin corregir/verificar su patrón.

`__tests__/integration/expoApi.test.js` usa Supertest y sustituye TrackService/QuestionService para no depender de Deezer o PostgreSQL. Cubre creación/inicio, scan QR, ronda, apuesta, activación REPLAY, reveal/score y el endpoint Double Platinum. No cubre una sesión E2E real con proveedor de tracks, los casos de `comboStatus` dentro de reveal, la sincronización Expo UI/World Tour, el delta de Reaction Card por HTTP ni dispositivos/cámara. En la revisión del 2026-10-20, las suites focalizadas pasaron (9 tests) y la suite Jest completa pasó (5 suites, 66 tests). Estos resultados no validan Deezer, PostgreSQL, cámara ni dispositivos.

Hallazgo para una futura spec/issue: `ComboTracker` declara umbrales HOT_STREAK=3, DOUBLE_HIT=5 y TRIPLE_HIT=7, pero resetea el streak al detectar el combo de 3. En la ruta normal, los umbrales de 5 y 7 parecen inalcanzables. Hoy solo debe documentarse HOT_STREAK como comportamiento esperado hasta que se resuelva y se pruebe esa regla.

El target de victoria está alineado actualmente: Expo envía `SCORE_TO_WIN` (22) al crear la sesión; el backend usa 22 como default y conserva un `targetScore` explícito si otro cliente envía un override. El comentario de request y el script de flujo manual usan también 22. La regla de fin de partida del backend consulta el valor guardado en esa sesión.

`node tests/test-deezer-integration.js` es un script manual separado de Jest: requiere Deezer y PostgreSQL accesibles. Sus fallos individuales se capturan y reportan en el resumen; por eso valida el resultado impreso y no solo el exit code del proceso.

El script `npm run validate`/`scripts/validate-setup.js` conserva supuestos antiguos: busca rutas QR de canciones, exige datos/audio locales y tiene comprobaciones de CORS que no reflejan el wiring actual; puede fallar aunque las rutas consumidas por Expo funcionen. No es un check de integración válido por sí solo.

Comprobaciones puntuales cuando el servidor corre:

```bash
curl http://localhost:3000/api/expo/health
curl http://localhost:3000/api/v2/game/health
curl http://localhost:3000/api/v2/tracks/health
curl http://localhost:3000/api/audio/list
```

## Documentación relacionada

- Integración completa Expo/backend: [`../documentation/HITBACK_SYSTEM_DOCS.md`](../documentation/HITBACK_SYSTEM_DOCS.md).
- [`README_DEEZER.md`](README_DEEZER.md): notas técnicas del subsistema TrackServiceV2; no representa el proveedor de rondas de sesión actual.
- [`MIGRATION_GUIDE.md`](MIGRATION_GUIDE.md) y [`SYNC_REPORT.md`](SYNC_REPORT.md): documentos históricos, no instrucciones operativas actuales.
- [`TRACKS.md`](TRACKS.md): comportamiento actual del catálogo y fuentes de audio.
