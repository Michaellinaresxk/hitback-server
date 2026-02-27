require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const path = require('path');
const os = require('os');

// Importar middleware y utilidades
const { responseMiddleware } = require('./utils/responses');
const { errorHandler } = require('./utils/errors');
const logger = require('./utils/logger');

// ✅ IMPORTAR RUTAS (Sistema nuevo sin QR físicos)
const tracksRoutes = require('./routes/tracks');
const tracksV2Routes = require('./routes/tracksV2'); // 🔄 NUEVO: Sistema híbrido Deezer + PostgreSQL
const audioRoutes = require('./routes/audio');
const healthRoutes = require('./routes/health');

// 🎮 NUEVAS RUTAS - GAME SESSION (SIN QR)
// ✅ CORREGIDO: Importar desde routes/
const gameSessionRoutes = require('./routes/gameSession');

// ⚡ POWER CARDS ROUTES
const powerCardRoutes = require('./routes/powerCard');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// ========================================
// FUNCIÓN PARA OBTENER IP LOCAL
// ========================================
function getLocalNetworkIPs() {
  const interfaces = os.networkInterfaces();
  const ips = [];

  Object.keys(interfaces).forEach(ifname => {
    interfaces[ifname].forEach(iface => {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address);
      }
    });
  });

  return ips;
}

// ========================================
// MIDDLEWARE BÁSICO
// ========================================
app.use(helmet({
  crossOriginEmbedderPolicy: false,
}));

app.use(cors({
  origin: [
    'http://localhost:*',
    'https://localhost:*',
    'exp://*',
    /.*\.exp\.direct.*/,
    /.*\.expo\.dev.*/,
    'http://192.168.1.10:*',
    'file://',
    null
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-expo-token']
}));


app.use(morgan('combined', {
  stream: { write: message => logger.info(message.trim()) }
}));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  skip: (req) => {
    return req.headers['x-expo-token'] || req.headers.origin?.includes('expo');
  }
});
app.use(limiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Middleware de respuestas estándar
app.use(responseMiddleware);

// ========================================
// MIDDLEWARE PARA DEBUGGING
// ========================================
app.use((req, res, next) => {
  logger.info(`📱 Request from: ${req.ip} | ${req.method} ${req.path} | User-Agent: ${req.get('User-Agent')?.substring(0, 50)}...`);
  next();
});

// ========================================
// ARCHIVOS ESTÁTICOS - CRITICAL FOR AUDIO
// ========================================
app.use('/audio/tracks', express.static(path.join(__dirname, 'public/audio/tracks'), {
  setHeaders: (res, path) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Content-Type', 'audio/mpeg');
  }
}));

// ========================================
// HEALTH CHECK ESPECÍFICO PARA EXPO
// ========================================
app.get('/api/expo/health', (req, res) => {
  const networkIPs = getLocalNetworkIPs();

  res.sendSuccess({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    server: {
      host: HOST,
      port: PORT,
      networkIPs,
      accessUrls: networkIPs.map(ip => `http://${ip}:${PORT}`)
    },
    expo: {
      compatible: true,
      corsEnabled: true,
      staticFiles: true
    }
  }, 'Server is running and Expo-compatible');
});

// ========================================
// 🎮 API ROUTES (Sistema nuevo sin QR físicos)
// ========================================

// Recursos base
app.use('/api/tracks', tracksRoutes);
app.use('/api/v2/tracks', tracksV2Routes); // 🔄 NUEVO: Endpoints V2 con Deezer + PostgreSQL
app.use('/api/audio', audioRoutes);
app.use('/api/health', healthRoutes);

// Game Session API v2 (sin QR)
app.use('/api/v2/game', gameSessionRoutes);

// Power Cards & Combos
app.use('/api/cards', powerCardRoutes);

// ========================================
// RUTA DE BIENVENIDA
// ========================================
app.get('/', (req, res) => {
  const networkIPs = getLocalNetworkIPs();

  res.sendSuccess({
    message: 'HITBACK Backend API v2.0 - Sistema sin QR físicos',
    status: 'operational',
    server: {
      host: HOST,
      port: PORT,
      networkIPs,
      accessUrls: networkIPs.map(ip => `http://${ip}:${PORT}`)
    },
    endpoints: {
      // 🎮 Game Session API v2 (sin QR)
      game: {
        createSession: 'POST /api/v2/game/session',
        startGame: 'POST /api/v2/game/session/:id/start',
        nextRound: 'POST /api/v2/game/session/:id/round',
        placeBet: 'POST /api/v2/game/session/:id/bet',
        revealAnswer: 'POST /api/v2/game/session/:id/reveal',
        getStatus: 'GET /api/v2/game/session/:id',
        health: 'GET /api/v2/game/health'
      },
      // ⚡ Power Cards & Combos
      powerCards: {
        scanQR: 'POST /api/cards/scan-qr',
        getAllCards: 'GET /api/cards/',
        getComboStatus: 'GET /api/cards/combos/:playerId',
        getInventory: 'GET /api/cards/inventories/:playerId'
      },
      // 📦 Recursos
      resources: {
        tracks: 'GET /api/tracks',
        audio: 'GET /api/audio/list',
        health: 'GET /api/health'
      }
    },
    expo: {
      testConnection: networkIPs.map(ip => `http://${ip}:${PORT}/api/expo/health`),
      audioTest: networkIPs.map(ip => `http://${ip}:${PORT}/audio/tracks/`)
    }
  }, 'HITBACK API is running - Sistema nuevo sin QR de canciones');
});

app.get('/api/test/tracks', (req, res) => {
  console.log('🧪 Test endpoint called');

  res.json({
    success: true,
    message: "Test tracks retrieved",
    data: [
      {
        id: "DEMO1",
        title: "Canción Demo 1",
        artist: "Artista Demo 1",
        audioFile: "demo1.mp3"
      },
      {
        id: "DEMO2",
        title: "Canción Demo 2",
        artist: "Artista Demo 2",
        audioFile: "demo2.mp3"
      }
    ]
  });
});

// TEST ENDPOINT - Deezer
app.get('/api/test/deezer', async (req, res) => {
  try {
    const deezerService = require('./services/DeezerService');
    const healthCheck = await deezerService.healthCheck();

    res.json({
      success: true,
      service: 'Deezer API',
      status: healthCheck.status,
      testTrack: healthCheck.testTrack,
      message: healthCheck.hasPreview
        ? '✅ Deezer is working with previews!'
        : '⚠️ Deezer connected but no preview available'
    });
  } catch (error) {
    res.json({
      success: false,
      error: error.message
    });
  }
});

// TEST ENDPOINT - Deezer Fallback
app.post('/api/test/deezer-fallback', async (req, res) => {
  try {
    const DeezerService = require('./services/DeezerService');

    // Simular un track sin audio local
    const testTrack = {
      id: '999',
      title: 'Blinding Lights',
      artist: 'The Weeknd',
      hasAudio: false,  // Sin audio local
      audioFile: null
    };

    console.log('🧪 Testing Deezer fallback...');
    const deezerTrack = await DeezerService.searchTrack(testTrack.title, testTrack.artist);

    if (deezerTrack && deezerTrack.previewUrl) {
      res.json({
        success: true,
        message: '✅ Deezer fallback working!',
        scenario: 'No local audio → Deezer preview used',
        result: {
          hasAudio: true,
          url: deezerTrack.previewUrl,
          source: 'deezer',
          duration: 30,
          metadata: {
            title: deezerTrack.title,
            artist: deezerTrack.artist,
            album: deezerTrack.album,
            albumArt: deezerTrack.cover.large,
            deezerLink: deezerTrack.link,
            explicit: deezerTrack.explicit
          }
        }
      });
    } else {
      res.json({
        success: false,
        message: '❌ No preview found in Deezer'
      });
    }

  } catch (error) {
    res.json({
      success: false,
      error: error.message
    });
  }
});


// ========================================
// MANEJO DE ERRORES
// ========================================
app.use('*', (req, res) => {
  console.log(`❌ 404 - Route not found: ${req.method} ${req.originalUrl}`);
  res.sendNotFound('Endpoint', req.originalUrl);
});

app.use(errorHandler);

// ========================================
// INICIO DEL SERVIDOR
// ========================================
const server = app.listen(PORT, HOST, () => {
  const networkIPs = getLocalNetworkIPs();

  logger.info(`🎵 HITBACK Backend v2.0 - Sistema sin QR físicos`);
  logger.info(`📡 Host: ${HOST}:${PORT}`);
  logger.info(`🏠 Local: http://localhost:${PORT}`);

  if (networkIPs.length > 0) {
    logger.info(`📱 Network Access URLs for Expo:`);
    networkIPs.forEach(ip => {
      logger.info(`   🔗 http://${ip}:${PORT}`);
    });
    logger.info(`🧪 Test connection: http://${networkIPs[0]}:${PORT}/api/expo/health`);

    // 🎮 Game Session API
    logger.info(`\n🎮 GAME SESSION API (sin QR de canciones)`);
    logger.info(`   POST /api/v2/game/session             - Crear sesión`);
    logger.info(`   POST /api/v2/game/session/:id/start   - Iniciar juego`);
    logger.info(`   POST /api/v2/game/session/:id/round   - Siguiente ronda`);
    logger.info(`   POST /api/v2/game/session/:id/bet     - Registrar apuesta`);
    logger.info(`   POST /api/v2/game/session/:id/reveal  - Revelar respuesta`);
    logger.info(`   GET  /api/v2/game/session/:id         - Estado sesión`);

    // ⚡ Power Cards
    logger.info(`\n⚡ POWER CARDS & COMBOS`);
    logger.info(`   POST /api/cards/scan-qr                - Escanear power card`);
    logger.info(`   GET  /api/cards/combos/:playerId       - Estado de combo`);
    logger.info(`   GET  /api/cards/inventories/:playerId  - Inventario`);
  }

  logger.info(`\n✅ Sistema nuevo activo - QR solo para power cards`);
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    logger.info('Server closed.');
    process.exit(0);
  });
});

module.exports = app;