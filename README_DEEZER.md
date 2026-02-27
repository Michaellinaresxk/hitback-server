# 🎵 Sistema Híbrido: Deezer API + PostgreSQL

## Resumen Ejecutivo

Has migrado exitosamente de un sistema estático (`tracks.json` con 217 canciones) a un **sistema híbrido escalable** que combina:

1. **Deezer API** - Tracks ilimitados con previews de 30 segundos
2. **PostgreSQL** - Cache inteligente y persistencia de datos
3. **Sistema de fallback** - Funciona incluso si Deezer falla

---

## 🎯 ¿Qué cambió?

### ANTES (tracks.json):
```javascript
{
  "tracks": [
    {
      "id": "001",
      "title": "Despacito",
      "artist": "Luis Fonsi",
      "genre": "LATIN",
      "questions": {
        "song": { "question": "...", "answer": "..." },
        "lyrics": { "question": "...", "answer": "..." }
      }
    }
    // ... solo 217 canciones
  ]
}
```

### AHORA (Deezer + PostgreSQL):
```javascript
// Backend busca dinámicamente:
const track = await trackService.getRandomTrack({
  genre: 'LATIN',      // Filtrar por género
  decade: '2010s',     // Filtrar por década
  sessionId: 'abc123'  // Evitar duplicados
});

// Retorna tracks de:
// 1. PostgreSQL cache (si existe)
// 2. Deezer API (si no existe en cache)
// 3. Cachea automáticamente para futuro uso
```

---

## 📁 Archivos Nuevos Creados

```
Server/
├── migrations/
│   └── 001_create_tables.sql          # Schema de PostgreSQL
├── services/
│   ├── DeezerServiceV2.js             # Integración con Deezer API
│   └── TrackServiceV2.js              # Servicio híbrido BD + Deezer
├── routes/
│   └── tracksV2.js                    # Nuevos endpoints API
├── scripts/
│   └── migrate-tracks-to-db.js        # Script de migración
├── tests/
│   └── test-deezer-integration.js     # Tests automatizados
├── MIGRATION_GUIDE.md                 # Guía paso a paso
└── README_DEEZER.md                   # Este archivo
```

---

## 🚀 Cómo Empezar

### 1. Ejecutar Migración SQL

```bash
cd Server
psql -U postgres -d Hitback -f migrations/001_create_tables.sql
```

### 2. Migrar tracks.json a PostgreSQL

```bash
node scripts/migrate-tracks-to-db.js
```

Verás:
```
╔═══════════════════════════════════════════════════╗
║     MIGRACIÓN tracks.json → PostgreSQL            ║
╚═══════════════════════════════════════════════════╝

  Total de tracks:           217
  ✓ Tracks insertados:       217
  ? Preguntas insertadas:    434
  ✗ Errores:                 0

✅ ¡Migración completada exitosamente!
```

### 3. Ejecutar Tests

```bash
node tests/test-deezer-integration.js
```

Verás:
```
╔═══════════════════════════════════════════════════╗
║    TEST DE INTEGRACIÓN: Deezer + PostgreSQL       ║
╚═══════════════════════════════════════════════════╝

[TEST 1] Deezer API Health Check... ✓ PASS
[TEST 2] Deezer: Búsqueda sin filtros... ✓ PASS
...
[TEST 12] Deezer: Mapeo correcto... ✓ PASS

  Total de tests:    12
  ✓ Passed:          12
  ✗ Failed:          0

✅ ¡Todos los tests pasaron exitosamente!
```

### 4. Actualizar Backend

En `server.js` o donde inicialices tus servicios:

```javascript
// OPCIÓN 1: Reemplazo directo
const TrackServiceV2 = require('./services/TrackServiceV2');
const trackService = new TrackServiceV2();

// OPCIÓN 2: Gradual con feature flag
const USE_V2 = process.env.USE_TRACK_SERVICE_V2 === 'true';
const trackService = USE_V2
  ? new (require('./services/TrackServiceV2'))()
  : new (require('./services/TrackService'))();
```

En `routes/index.js`:

```javascript
const tracksV2Routes = require('./routes/tracksV2');
app.use('/api/v2/tracks', tracksV2Routes);
```

### 5. Probar Endpoints

```bash
# Health check
curl http://localhost:3000/api/v2/tracks/health

# Track aleatorio
curl http://localhost:3000/api/v2/tracks/random

# Con filtros
curl "http://localhost:3000/api/v2/tracks/random?genre=ROCK&decade=1980s"

# Buscar por texto
curl "http://localhost:3000/api/v2/tracks/search?q=despacito"

# Estadísticas
curl http://localhost:3000/api/v2/tracks/stats
```

---

## 🎮 Flujo del Juego

### Ejemplo completo de una sesión:

```javascript
// 1. Crear sesión
POST /api/v2/game/session
{
  "players": [
    {"id": "p1", "name": "Juan"},
    {"id": "p2", "name": "María"}
  ],
  "config": {
    "genres": ["ROCK", "POP"],
    "decades": ["1990s", "2000s"],
    "difficulty": "MEDIUM"
  }
}
// → Retorna sessionId

// 2. Iniciar juego
POST /api/v2/game/session/{sessionId}/start

// 3. Siguiente ronda
POST /api/v2/game/session/{sessionId}/round
// → TrackServiceV2 busca:
//    1. En PostgreSQL con filtros: genre=ROCK/POP, decade=1990s/2000s
//    2. Excluyendo tracks ya usados en esta sesión
//    3. Si no hay, busca en Deezer y cachea
//    4. Retorna track con pregunta auto-generada

// 4. Revelar respuesta
POST /api/v2/game/session/{sessionId}/reveal
{
  "winnerId": "p1"
}

// 5. Repetir paso 3 para siguiente ronda
// → NUNCA se repite un track en la misma sesión
```

---

## 🔍 Cómo Funciona Internamente

### TrackServiceV2.getRandomTrack()

```
┌─────────────────────────────────────────────┐
│  1. Verificar PostgreSQL                    │
│     SELECT * FROM tracks                    │
│     WHERE genre = 'ROCK'                    │
│     AND decade = '1980s'                    │
│     AND id NOT IN (                         │
│       SELECT track_id FROM session_tracks   │
│       WHERE session_id = 'abc123'           │
│     )                                       │
│     ORDER BY RANDOM()                       │
│     LIMIT 1                                 │
└────────┬────────────────────────────────────┘
         │
         ├─ Si encuentra → Retornar track
         │
         └─ Si NO encuentra ↓

┌─────────────────────────────────────────────┐
│  2. Buscar en Deezer                        │
│     DeezerServiceV2.searchTracks({          │
│       genre: 'ROCK',                        │
│       decade: '1980s',                      │
│       limit: 25                             │
│     })                                      │
└────────┬────────────────────────────────────┘
         │
         ├─ Obtiene 25 tracks de Deezer
         │
┌────────▼────────────────────────────────────┐
│  3. Cachear en PostgreSQL                   │
│     INSERT INTO tracks (...)                │
│     VALUES (...)                            │
│     ON CONFLICT DO UPDATE                   │
└────────┬────────────────────────────────────┘
         │
         └─ Retornar primer track

┌─────────────────────────────────────────────┐
│  4. Marcar como usado                       │
│     INSERT INTO session_tracks              │
│     (session_id, track_id)                  │
│     VALUES ('abc123', 'dz_12345')           │
└─────────────────────────────────────────────┘
```

---

## 🎨 Tipos de Preguntas

### Auto-generadas (siempre disponibles):

```javascript
// QuestionService genera automáticamente:
{
  type: 'song',
  question: '¿Cuál es el nombre de esta canción?',
  answer: track.title,
  points: 1
}

{
  type: 'artist',
  question: '¿Quién canta esta canción?',
  answer: track.artist,
  points: 2
}

{
  type: 'decade',
  question: '¿De qué década es esta canción?',
  answer: track.decade,
  points: 2
}

{
  type: 'year',
  question: '¿En qué año salió esta canción?',
  answer: track.year,
  points: 3
}
```

### Custom (requieren datos en BD):

```javascript
// Estas solo están disponibles si existen en custom_questions
{
  type: 'lyrics',
  question: 'Completa la letra: "...',
  answer: 'mirándote',
  points: 3
}

{
  type: 'challenge',
  question: 'Baila 10 segundos',
  answer: 'Completar baile',
  points: 1,
  challengeType: 'dance'
}
```

---

## 📊 Estadísticas y Monitoreo

### Health Check

```bash
curl http://localhost:3000/api/v2/tracks/health
```

```json
{
  "success": true,
  "data": {
    "database": "healthy",
    "deezer": "healthy",
    "tracksInDB": 217
  }
}
```

### Estadísticas

```bash
curl http://localhost:3000/api/v2/tracks/stats
```

```json
{
  "success": true,
  "data": {
    "total_tracks": "217",
    "with_preview": "217",
    "unique_genres": "15",
    "unique_decades": "8",
    "avg_duration": "30.0"
  }
}
```

---

## 🛡️ Manejo de Errores y Fallbacks

### Escenario 1: Deezer está caído

```javascript
// TrackServiceV2 detecta error de Deezer
// → Usa solo tracks cacheados en PostgreSQL
// → Si no hay cache, retorna track de fallback

getFallbackTrack() {
  return {
    id: 'fallback_001',
    title: 'Track no disponible',
    artist: 'Sistema',
    genre: 'POP',
    audioSource: 'local',
    hasAudio: false
  };
}
```

### Escenario 2: PostgreSQL está caído

```javascript
// TrackServiceV2 detecta error de PostgreSQL
// → Usa solo Deezer API directamente
// → No cachea tracks
// → Log de warning
```

### Escenario 3: Rate limit de Deezer

```javascript
// DeezerServiceV2 controla automáticamente:
this.maxRequestsPerWindow = 50; // 50 req/min
this.requestWindow = 60000;     // 1 minuto

canMakeRequest() {
  return this.requestCount < this.maxRequestsPerWindow;
}
// Si excede, lanza error y usa cache
```

---

## 🎛️ Configuración Avanzada

### Variables de entorno (.env)

```bash
# PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=tu_password
DB_NAME=Hitback

# Feature flags
USE_TRACK_SERVICE_V2=true

# Deezer (opcional)
DEEZER_RATE_LIMIT=50       # Requests por minuto
DEEZER_TIMEOUT=5000        # Timeout en ms
```

### Ajustar cache mínimo

```javascript
// services/TrackServiceV2.js

this.minCachedTracks = 10; // Mínimo antes de buscar en Deezer

// Si tienes < 10 tracks en BD con los filtros,
// buscará en Deezer automáticamente
```

### Filtros por región (opcional)

```javascript
const track = await trackService.getRandomTrack({
  genre: 'LATIN',
  decade: '2010s',
  region: 'AR'  // Argentina
});

// Códigos de región:
// AR = Argentina
// MX = México
// US = USA
// ES = España
// etc.
```

---

## 🔄 Mantenimiento

### Limpiar tracks viejos de Deezer

Los preview URLs de Deezer pueden expirar. Limpiar periódicamente:

```sql
-- Eliminar tracks con preview expirado (> 30 días)
DELETE FROM tracks
WHERE deezer_id IS NOT NULL
AND updated_at < NOW() - INTERVAL '30 days';
```

### Optimizar índices

```sql
-- Reindexar periódicamente
REINDEX TABLE tracks;
REINDEX TABLE session_tracks;
```

### Vacuum

```sql
-- Limpiar espacio en BD
VACUUM ANALYZE tracks;
```

---

## 🐛 Troubleshooting

### "No tracks available with current filters"

**Causa**: No hay tracks en BD con esos filtros y Deezer tampoco encuentra.

**Solución**:
```javascript
// Relajar filtros
const track = await trackService.getRandomTrack({
  genre: null,  // Sin filtro de género
  decade: null  // Sin filtro de década
});
```

### "Rate limit exceeded"

**Causa**: Demasiadas requests a Deezer en poco tiempo.

**Solución**: Esperar 1 minuto o usar tracks cacheados.

### "PostgreSQL connection error"

**Causa**: BD no está corriendo o credenciales incorrectas.

**Solución**:
```bash
# Verificar que PostgreSQL esté corriendo
psql -h localhost -U postgres -d Hitback

# Verificar variables en .env
cat .env | grep DB_
```

### "Track has no preview"

**Causa**: Algunos tracks en Deezer no tienen preview disponible.

**Solución**: El sistema filtra automáticamente estos tracks.

---

## 📈 Roadmap Futuro

### Fase 1 (Actual): ✅
- [x] Integración con Deezer API
- [x] Cache en PostgreSQL
- [x] Migración de tracks.json
- [x] Evitar duplicados por sesión

### Fase 2:
- [ ] Generación de preguntas de lyrics con IA
- [ ] Sistema de votos para tracks populares
- [ ] Dashboard de analytics
- [ ] Playlists personalizadas

### Fase 3:
- [ ] Integración con Spotify API
- [ ] Generación de preguntas con GPT
- [ ] Modo multiplayer con sincronización real-time
- [ ] Ranking global de jugadores

---

## 🤝 Contribución

Si encuentras bugs o tienes sugerencias:

1. Revisa los logs: `tail -f logs/app.log`
2. Ejecuta tests: `node tests/test-deezer-integration.js`
3. Documenta el issue con pasos para reproducir

---

## 📚 Recursos

- [Deezer API Docs](https://developers.deezer.com/api)
- [PostgreSQL Docs](https://www.postgresql.org/docs/)
- [Express.js Best Practices](https://expressjs.com/en/advanced/best-practice-performance.html)

---

**¡Sistema híbrido funcionando! 🎉**

Ahora tienes acceso a millones de canciones con filtrado inteligente.
