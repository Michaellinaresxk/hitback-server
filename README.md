# 🎵 HITBACK Backend v2.0

**Arquitectura moderna y escalable para el juego de música HITBACK**

[![Node.js](https://img.shields.io/badge/node-%3E%3D14.0.0-brightgreen.svg)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/express-4.21.2-blue.svg)](https://expressjs.com/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

## 🚀 Quick Start

```bash
# 1. Clonar e instalar
git clone <your-repo>
cd hitback-backend
npm install

# 2. Configuración automática
npm run setup

# 3. Iniciar servidor
npm start

# 4. Probar API
curl http://localhost:3000/api/health
```

## 📋 Características

- 🎯 **Escaneo QR** - Códigos QR para cartas físicas del juego
- 🎵 **Audio Local** - Reproducción de previews desde archivos locales
- 🎮 **Gestión de Juego** - API completa para sesiones de juego
- 📊 **Monitoreo** - Health checks y diagnósticos detallados
- 🔒 **Seguridad** - Rate limiting y validación robusta
- 📝 **Logging** - Sistema de logs estructurado
- 🧪 **Testing** - Endpoints de testing y validación

## 🏗️ Arquitectura

### Estructura de Directorios

```
server/
├── src/
│   ├── controllers/     # Lógica de controladores
│   ├── services/        # Lógica de negocio
│   ├── routes/          # Definición de rutas
│   ├── middleware/      # Middlewares personalizados
│   ├── utils/           # Utilidades y helpers
│   └── __tests__/       # Tests unitarios e integración
├── data/                # Datos del juego (tracks.json)
├── public/audio/        # Archivos de audio
├── logs/                # Logs del sistema
├── backups/             # Backups automáticos
└── server.js            # Punto de entrada
```

### Servicios Principales

- **QRService** - Validación, parsing y generación de códigos QR
- **AudioService** - Gestión de archivos de audio local
- **TrackService** - Manejo de datos de tracks y canciones
- **GameController** - Orquestación del flujo del juego

## 🎯 API Endpoints

### 🔍 QR Codes
```http
POST /api/qr/scan/:qrCode          # Escanear código QR
GET  /api/qr/generate              # Generar todos los QR codes
GET  /api/qr/validate/:qrCode      # Validar formato QR
GET  /api/qr/search                # Buscar QR codes
```

### 🎵 Tracks
```http
GET  /api/tracks                   # Listar todos los tracks
GET  /api/tracks/:id               # Obtener track específico
GET  /api/tracks/random            # Track aleatorio
GET  /api/tracks/search            # Buscar tracks
```

### 🔊 Audio
```http
GET  /api/audio/list               # Listar archivos de audio
GET  /api/audio/stream/:filename   # Stream de audio
GET  /api/audio/diagnostics        # Diagnóstico de audio
```

### 🎮 Game
```http
POST /api/game/create              # Crear sesión de juego
POST /api/game/scan/:qrCode        # Escanear en juego
GET  /api/game/:gameId             # Estado del juego
```

### 🏥 Health & Monitoring
```http
GET  /api/health                   # Health check general
GET  /api/health/services          # Estado de servicios
GET  /api/health/detailed          # Health check detallado
```

## 🎯 Formato de Códigos QR

```
HITBACK_{TRACK_ID}_{CARD_TYPE}_{DIFFICULTY}
```

**Ejemplos:**
- `HITBACK_001_SONG_EASY` → Pregunta de canción (1-2 puntos)
- `HITBACK_002_ARTIST_MEDIUM` → Pregunta de artista (2-4 puntos)
- `HITBACK_003_DECADE_HARD` → Pregunta de década (4-6 puntos)
- `HITBACK_004_CHALLENGE_EXPERT` → Challenge card (8-15 puntos)

**Card Types:**
- `SONG` - ¿Cuál es la canción?
- `ARTIST` - ¿Quién la canta?
- `DECADE` - ¿De qué década es?
- `LYRICS` - Completar letra
- `CHALLENGE` - Desafío (cantar, bailar, imitar)

## 🎵 Configuración de Audio

### 1. Directorio de Audio
```bash
public/audio/tracks/
├── 001_despacito.mp3
├── 002_bohemian_rhapsody.mp3
├── 003_shape_of_you.mp3
└── ...
```

### 2. Formatos Soportados
- **MP3** (recomendado)
- **WAV**
- **M4A**

### 3. Especificaciones
- **Duración**: ~30 segundos
- **Calidad**: 128kbps mínimo
- **Tamaño**: < 5MB por archivo

## ⚙️ Configuración

### Variables de Entorno

```bash
# Servidor
PORT=3000
NODE_ENV=development

# Audio
AUDIO_DIRECTORY=./public/audio/tracks
MAX_AUDIO_SIZE=10485760

# Rate Limiting
RATE_LIMIT_MAX_REQUESTS=100
QR_SCAN_RATE_LIMIT=30

# Logging
LOG_LEVEL=info
LOG_FILE=./logs/hitback.log
```

Ver `.env.example` para configuración completa.

## 🧪 Testing y Validación

### Comandos de Testing
```bash
npm test                    # Ejecutar todos los tests
npm run test:watch          # Tests en modo watch
npm run test:unit           # Solo tests unitarios
npm run health              # Health check rápido
npm run validate            # Validar configuración
```

### Test de QR Codes
```bash
# Test individual
curl -X POST http://localhost:3000/api/qr/scan/HITBACK_001_SONG_EASY

# Batch test
curl -X POST http://localhost:3000/api/qr/test/batch \
  -H "Content-Type: application/json" \
  -d '{"qrCodes": ["HITBACK_001_SONG_EASY", "HITBACK_002_ARTIST_MEDIUM"]}'
```

### Test de Audio
```bash
# Listar archivos
curl http://localhost:3000/api/audio/list

# Test específico
curl http://localhost:3000/api/audio/test/001_despacito.mp3

# Diagnóstico completo
curl http://localhost:3000/api/audio/diagnostics
```

## 📱 Integración con Mobile App

### React Native / Expo

```typescript
// audioService.ts
const SERVER_URL = 'http://YOUR_IP:3000';

export const scanQRCode = async (qrCode: string) => {
  const response = await fetch(`${SERVER_URL}/api/qr/scan/${qrCode}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  
  const data = await response.json();
  
  if (data.success) {
    // Reproducir audio
    const audioUrl = data.data.audio.url;
    if (audioUrl) {
      // Usar tu reproductor de audio preferido
      playAudio(audioUrl);
    }
    
    // Mostrar pregunta
    const question = data.data.question.text;
    const points = data.data.scan.points;
    
    return { question, points, audioUrl };
  }
  
  throw new Error(data.error?.message || 'Scan failed');
};
```

### URLs de la API
```typescript
const API_ENDPOINTS = {
  scanQR: `${SERVER_URL}/api/qr/scan`,
  tracks: `${SERVER_URL}/api/tracks`,
  health: `${SERVER_URL}/api/health`,
  audio: `${SERVER_URL}/audio/tracks`,
};
```

## 🔧 Scripts Útiles

```bash
# Desarrollo
npm run dev                 # Servidor con nodemon
npm run logs               # Ver logs en tiempo real

# Configuración  
npm run setup              # Setup automático
npm run setup:audio       # Solo configuración de audio
npm run validate           # Validar configuración

# Mantenimiento
npm run clean              # Limpiar logs y backups
npm run backup             # Crear backup manual

# Calidad de código
npm run lint               # Verificar código
npm run lint:fix           # Corregir automáticamente
npm run format             # Formatear código
```

## 📊 Monitoreo y Logs

### Health Checks
- **General**: `/api/health` - Estado general del sistema
- **Servicios**: `/api/health/services` - Estado individual de servicios
- **Detallado**: `/api/health/detailed` - Métricas completas

### Logs
- **Archivo**: `logs/hitback.log`
- **Rotación**: Automática cada 10MB
- **Niveles**: error, warn, info, debug

### Métricas
- **Performance**: Tiempo de respuesta de endpoints
- **Uso**: Estadísticas de QR codes y audio
- **Errores**: Tracking de errores y fallos

## 🚀 Deployment

### Desarrollo Local
```bash
npm run dev
# Servidor en http://localhost:3000
```

### Producción
```bash
# Configurar variables de entorno
NODE_ENV=production
PORT=3000

# Iniciar servidor
npm start
```

### Docker (Opcional)
```dockerfile
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

## 🎮 Flujo del Juego

1. **Setup**: Game Master crea partida en la app
2. **Players**: Se agregan jugadores manualmente
3. **Scan**: Jugador escanea carta QR física
4. **Audio**: Se reproduce preview (30 seg) en dispositivo GM
5. **Question**: Aparece pregunta en pantalla del GM
6. **Answer**: Todos compiten gritando la respuesta
7. **Score**: GM selecciona ganador, puntos se suman automáticamente
8. **Repeat**: El ganador se convierte en siguiente DJ

## 🛠️ Troubleshooting

### Problemas Comunes

**Error de audio**
```bash
# Verificar archivos
npm run validate
curl http://localhost:3000/api/audio/diagnostics
```

**QR codes no funcionan**
```bash
# Test individual
curl -X POST http://localhost:3000/api/qr/scan/HITBACK_001_SONG_EASY

# Validar formato
curl http://localhost:3000/api/qr/validate/HITBACK_001_SONG_EASY
```

**Problemas de permisos**
```bash
# Verificar permisos de directorios
ls -la public/audio/tracks/
ls -la data/
ls -la logs/
```

### Debug Modo

```bash
# Logs detallados
LOG_LEVEL=debug npm run dev

# Ver logs en tiempo real
npm run logs
```

## 📚 Documentación Adicional

- **API Docs**: http://localhost:3000/api/docs
- **Quick Start**: Ver `QUICKSTART.md` generado tras setup
- **Tests**: Documentación en `src/__tests__/`

## 🤝 Contribuir

1. Fork del repositorio
2. Crear rama feature (`git checkout -b feature/amazing-feature`)
3. Commit cambios (`git commit -m 'Add amazing feature'`)
4. Push a la rama (`git push origin feature/amazing-feature`)
5. Abrir Pull Request

## 📄 Licencia

MIT License - ver archivo `LICENSE` para detalles.

## 🆘 Soporte

- **Issues**: GitHub Issues
- **Docs**: http://localhost:3000/api/docs
- **Health**: http://localhost:3000/api/health

---

**¡Listo para jugar! 🎵🎮**