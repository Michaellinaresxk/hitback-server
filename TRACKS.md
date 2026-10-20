# Tracks y audio

> Cotejado con servicios y rutas el 2026-10-20. Deezer, PostgreSQL y disponibilidad de audio no se probaron durante esta revisión. Para comandos y suites, consulta [`README.md`](README.md).

## Fuente de rondas de juego

El `GameSessionService` de backend requiere `TrackService` (`services/TrackService.js`) para elegir canciones en `nextRound()`. Ese servicio carga `data/tracks.json` cuando existe, excluye canciones ya usadas mediante un set en memoria por `sessionId` y puede buscar en Deezer mediante `DeezerServiceV2` si necesita más pistas. No hay persistencia durable del pool ni de tracks usados; el comportamiento de agotamiento/filtros usa fallback y puede volver a seleccionar tracks.

El audio local puede servirse desde `public/audio/tracks/` en `/audio/tracks/*`; la API de audio se define por separado en `routes/audio.js`. Deezer devuelve previews, no canciones completas; el cliente documenta previews de hasta 30 segundos.

## Servicio v2 de catálogo

`TrackServiceV2` está conectado a `/api/v2/tracks/*` y usa PostgreSQL cuando está disponible, Deezer para poblar/cubrir el catálogo y un cache en memoria como fallback. Este servicio está separado de la selección de rondas de `/api/v2/game/session/:id/round`; no asumir que el endpoint de sesión lee PostgreSQL. Si falla la consulta a DB, el servicio usa fallback en memoria; la capacidad y calidad de ese fallback dependen de Deezer/cache y no constituyen persistencia.

## Verificación práctica

```bash
curl http://localhost:3000/api/tracks
curl http://localhost:3000/api/v2/tracks/health
curl http://localhost:3000/api/v2/tracks/random
curl http://localhost:3000/api/audio/list
```

Los endpoints pueden responder errores o devolver resultados sin audio si Deezer, PostgreSQL, el JSON local o los archivos de audio requeridos no están disponibles. `npm test` no ejecuta las pruebas live Deezer/PostgreSQL; el script `node tests/test-deezer-integration.js` sí depende de esos servicios. La presencia de las rutas no demuestra que todos los datos o previews estén accesibles.
