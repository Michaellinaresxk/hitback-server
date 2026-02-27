# 🎵 HITBACK - Guía de Migración a Deezer API

Esta guía te ayudará a migrar de `tracks.json` estático a un sistema híbrido **Deezer API + PostgreSQL**.

---

## 📋 Tabla de Contenidos

1. [¿Por qué migrar?](#por-qué-migrar)
2. [Arquitectura nueva](#arquitectura-nueva)
3. [Pasos de migración](#pasos-de-migración)
4. [Configuración](#configuración)
5. [Testing](#testing)
6. [Rollback](#rollback)
7. [FAQ](#faq)

---

## 🎯 ¿Por qué migrar?

### Limitaciones actuales (tracks.json):
- ❌ Solo 217 canciones disponibles
- ❌ Preguntas precargadas manualmente
- ❌ Sin filtrado dinámico por región
- ❌ No se pueden agregar canciones fácilmente
- ❌ Sin variedad de épocas/estilos

### Ventajas del nuevo sistema:
- ✅ **Tracks ilimitados** desde Deezer API
- ✅ **Filtrado dinámico** por género, década, región
- ✅ **Preguntas auto-generadas** (song, artist, decade, year)
- ✅ **Cache inteligente** en PostgreSQL
- ✅ **Fallback automático** si Deezer falla
- ✅ **Escalable** y mantenible

---

## 🏗️ Arquitectura Nueva

```
┌─────────────────────────────────────────────────┐
│              Frontend (Expo)                     │
│   POST /api/v2/game/session/{id}/round          │
└──────────────────┬──────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────┐
│         TrackServiceV2 (Backend)                │
│                                                  │
│  1. Verificar PostgreSQL cache                  │
│     ├─ Tracks con filtros (género, década)      │
│     └─ Excluir tracks ya usados en sesión       │
│                                                  │
│  2. Si no hay suficientes tracks:               │
│     ├─ DeezerServiceV2.searchTracks()           │
│     ├─ Obtener 25 tracks de Deezer              │
│     └─ Cachear en PostgreSQL                    │
│                                                  │
│  3. Marcar track como usado                     │
│                                                  │
│  4. QuestionService genera pregunta             │
│     ├─ Auto-generadas: song, artist, decade     │
│     └─ Custom: lyrics, challenge (solo si BD)   │
└─────────────────────────────────────────────────┘
```

### Base de Datos PostgreSQL

#### Tablas principales:

1. **tracks** - Cache de tracks de Deezer
2. **custom_questions** - Preguntas de lyrics/challenges
3. **game_sessions** - Sesiones persistentes
4. **session_tracks** - Tracks usados por sesión (evita duplicados)
5. **round_history** - Historial de rondas (analytics)

---

## 📝 Pasos de Migración

### Paso 1: Verificar Prerequisitos

```bash
# Verificar que PostgreSQL esté instalado
psql --version

# Verificar que la BD esté corriendo
psql -h localhost -U postgres -d Hitback -c "SELECT NOW();"
```

Si no tienes PostgreSQL instalado:

**macOS:**
```bash
brew install postgresql@13
brew services start postgresql@13
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
```

**Windows:**
Descargar desde [postgresql.org](https://www.postgresql.org/download/windows/)

---

### Paso 2: Crear la Base de Datos

```bash
# Conectar a PostgreSQL
psql -U postgres

# Crear base de datos (si no existe)
CREATE DATABASE Hitback;

# Salir
\q
```

---

### Paso 3: Ejecutar Migración SQL

```bash
cd /Users/mikemac/Mike-docs/DEV-EDUCATION/app/Server

# Ejecutar script de creación de tablas
psql -U postgres -d Hitback -f migrations/001_create_tables.sql
```

Deberías ver:
```
CREATE TABLE
CREATE INDEX
CREATE TABLE
...
✅ Migración SQL completada
```

---

### Paso 4: Migrar tracks.json a PostgreSQL

```bash
# Instalar dependencias si no están
npm install pg dotenv

# Ejecutar script de migración
node scripts/migrate-tracks-to-db.js
```

Verás algo como:
```
╔═══════════════════════════════════════════════════╗
║     MIGRACIÓN tracks.json → PostgreSQL            ║
╚═══════════════════════════════════════════════════╝

🔌 Conectando a PostgreSQL...
✅ Conexión exitosa

📦 Tracks encontrados: 217

⏳ Migrando tracks...

[1/217] (0.5%) Despacito - Luis Fonsi... ✓
[2/217] (0.9%) Shape of You - Ed Sheeran... ✓
...
[217/217] (100.0%) Bohemian Rhapsody - Queen... ✓

╔═══════════════════════════════════════════════════╗
║              RESUMEN DE MIGRACIÓN                 ║
╚═══════════════════════════════════════════════════╝

  Total de tracks:           217
  ✓ Tracks insertados:       217
  ↻ Tracks actualizados:     0
  ? Preguntas insertadas:    434
  ✗ Errores:                 0

✅ ¡Migración completada exitosamente!
```

---

### Paso 5: Actualizar Variables de Entorno

Verifica que tu archivo `.env` tenga:

```bash
# PostgreSQL Configuration
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=tu_password_aqui
DB_NAME=Hitback

# Deezer API (no requiere autenticación)
# No necesitas API key para Deezer
```

---

### Paso 6: Actualizar el Código del Backend

#### Opción A: Reemplazo gradual (recomendado)

Mantén ambos servicios y prueba el nuevo:

```javascript
// server.js o donde inicialices tus servicios

// Importar ambos servicios
const TrackService = require('./services/TrackService'); // Viejo
const TrackServiceV2 = require('./services/TrackServiceV2'); // Nuevo

// Usar V2 opcionalmente
const USE_V2 = process.env.USE_TRACK_SERVICE_V2 === 'true';

const trackService = USE_V2
  ? new TrackServiceV2()
  : new TrackService();

module.exports = { trackService };
```

En `.env`:
```bash
USE_TRACK_SERVICE_V2=true  # Cambiar a true para probar
```

#### Opción B: Reemplazo directo

En `services/GameSessionService.js`:

**ANTES:**
```javascript
const TrackService = require('./TrackService');
this.trackService = new TrackService();
```

**DESPUÉS:**
```javascript
const TrackServiceV2 = require('./TrackServiceV2');
this.trackService = new TrackServiceV2();
```

---

### Paso 7: Actualizar GameSessionService

Modificar el método `nextRound()` para usar el nuevo servicio:

```javascript
// services/GameSessionService.js

async nextRound(sessionId, forceQuestionType) {
  const session = this.sessions.get(sessionId);

  if (!session) {
    throw new Error('Session not found');
  }

  // NUEVO: Obtener track con TrackServiceV2
  const track = await this.trackService.getRandomTrack({
    sessionId: sessionId,  // ← Importante para evitar duplicados
    genre: session.config.genres?.[0] || null,
    decade: session.config.decades?.[0] || null,
    difficulty: session.config.difficulty || null
  });

  if (!track) {
    throw new Error('No tracks available with current filters');
  }

  // Generar pregunta (sin cambios)
  const question = this.questionService.generateQuestion(
    track,
    forceQuestionType
  );

  // Obtener audio URL
  const audioUrl = track.previewUrl || null;

  // Crear ronda
  const round = {
    number: session.rounds.length + 1,
    track: {
      id: track.id,
      title: track.title,
      artist: track.artist,
      genre: track.genre,
      decade: track.decade,
      audioUrl: audioUrl,
      audioSource: track.audioSource
    },
    question,
    gameMasterAnswer: {
      correct: question.answer,
      trackTitle: track.title,
      trackArtist: track.artist,
      acceptableAnswers: question.acceptableAnswers
    }
  };

  session.currentRound = round;
  session.rounds.push(round);

  return {
    success: true,
    round
  };
}
```

---

### Paso 8: Testing

#### Test 1: Verificar conexión a BD

```bash
node -e "
const TrackServiceV2 = require('./services/TrackServiceV2');
const service = new TrackServiceV2();
service.healthCheck().then(health => {
  console.log('Health Check:', health);
  service.close();
});
"
```

Debe retornar:
```json
{
  "database": "healthy",
  "deezer": "healthy",
  "tracksInDB": 217
}
```

#### Test 2: Obtener track aleatorio

```bash
node -e "
const TrackServiceV2 = require('./services/TrackServiceV2');
const service = new TrackServiceV2();
service.getRandomTrack({ genre: 'ROCK', decade: '1980s' })
  .then(track => {
    console.log('Track obtenido:', track.title, '-', track.artist);
    service.close();
  });
"
```

#### Test 3: Buscar en Deezer

```bash
node -e "
const DeezerServiceV2 = require('./services/DeezerServiceV2');
DeezerServiceV2.searchTracks({ genre: 'LATIN', decade: '2010s', limit: 5 })
  .then(tracks => {
    console.log('Tracks de Deezer:', tracks.length);
    tracks.forEach(t => console.log('  -', t.title, '-', t.artist));
  });
"
```

#### Test 4: Endpoint completo

```bash
# Iniciar servidor
npm start

# En otra terminal, crear sesión
curl -X POST http://localhost:3000/api/v2/game/session \
  -H "Content-Type: application/json" \
  -d '{
    "players": [{"id":"p1","name":"Test"}],
    "config": {
      "genres": ["ROCK"],
      "decades": ["2000s"],
      "difficulty": "MEDIUM"
    }
  }'

# Guardar el sessionId retornado

# Obtener siguiente ronda
curl -X POST http://localhost:3000/api/v2/game/session/{sessionId}/round
```

Deberías recibir un track con pregunta.

---

### Paso 9: Monitoreo y Logs

Verificar logs del servidor:

```bash
tail -f logs/app.log
```

Deberías ver:
```
✅ PostgreSQL conectado correctamente
✅ Track obtenido de BD: "Bohemian Rhapsody" - Queen
📡 No hay tracks en BD, buscando en Deezer...
📦 Cacheando 25 tracks de Deezer en BD...
```

---

## ⚙️ Configuración Avanzada

### Rate Limiting de Deezer

Por defecto, Deezer permite ~50 requests/minuto. El servicio maneja esto automáticamente.

Si necesitas ajustar:

```javascript
// services/DeezerServiceV2.js

this.maxRequestsPerWindow = 50; // Reducir si tienes problemas
this.requestWindow = 60000; // 1 minuto
```

### Cache de Tracks

Los tracks se cachean automáticamente en PostgreSQL. Para ajustar:

```javascript
// services/TrackServiceV2.js

this.minCachedTracks = 10; // Mínimo antes de buscar en Deezer
```

### Filtros por Región

Para filtrar tracks por país (opcional):

```javascript
const track = await trackService.getRandomTrack({
  sessionId: 'session_123',
  genre: 'LATIN',
  decade: '2010s',
  region: 'AR' // Argentina, 'MX' = México, 'US' = USA
});
```

---

## 🔄 Rollback (Volver al Sistema Anterior)

Si algo sale mal, puedes volver al sistema anterior:

### Opción 1: Variables de entorno

```bash
# En .env
USE_TRACK_SERVICE_V2=false
```

Reinicia el servidor.

### Opción 2: Código

Revierte los cambios en `GameSessionService.js`:

```javascript
const TrackService = require('./TrackService'); // Viejo
this.trackService = new TrackService();
```

### Opción 3: Git

```bash
git checkout -- services/GameSessionService.js
```

---

## ❓ FAQ

### ¿Necesito API key de Deezer?
No, la API pública de Deezer no requiere autenticación para búsquedas y previews.

### ¿Qué pasa si Deezer está caído?
El sistema usa tracks cacheados en PostgreSQL. Si no hay en cache, retorna un track de fallback.

### ¿Puedo seguir usando tracks.json?
Sí, puedes mantener ambos sistemas. Usa `USE_TRACK_SERVICE_V2=false`.

### ¿Se pierden las preguntas de lyrics/challenges?
No, se migran a la tabla `custom_questions` en PostgreSQL.

### ¿Cómo agrego más tracks manualmente?
Puedes insertar tracks directamente en PostgreSQL:

```sql
INSERT INTO tracks (id, title, artist, genre, decade, difficulty)
VALUES ('custom_001', 'Mi Canción', 'Mi Artista', 'ROCK', '2020s', 'EASY');
```

### ¿Cómo limpio el cache?
```sql
DELETE FROM tracks WHERE deezer_id IS NOT NULL;
```

### ¿Cuántos tracks puede cachear?
Ilimitados. PostgreSQL puede manejar millones de registros.

### ¿Qué pasa con los tracks usados en una sesión?
Se registran en `session_tracks` y no se repetirán en esa sesión.

### ¿Puedo ver estadísticas de tracks?
Sí:
```bash
curl http://localhost:3000/api/tracks/stats/overview
```

---

## 🚀 Próximos Pasos

1. ✅ Migrar tracks.json a PostgreSQL
2. ✅ Integrar Deezer API
3. ⏳ Implementar filtros por región
4. ⏳ Dashboard de analytics
5. ⏳ Sistema de votos para tracks populares
6. ⏳ Generación de preguntas con IA (lyrics automáticas)

---

## 📞 Soporte

Si tienes problemas:

1. Verifica logs: `tail -f logs/app.log`
2. Verifica conexión a BD: `psql -U postgres -d Hitback`
3. Health check: `curl http://localhost:3000/api/health`
4. Revisa variables de entorno en `.env`

---

## 📄 Licencia

Este proyecto es parte de HITBACK y es de uso privado.

---

**¡Buena suerte con la migración! 🎉**
