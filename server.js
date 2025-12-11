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

// ✅ IMPORTAR RUTAS COMPLETAS (NO LAS BÁSICAS)
const qrRoutes = require('./routes/qr');
const tracksRoutes = require('./routes/tracks');
const audioRoutes = require('./routes/audio');
const gameRoutes = require('./routes/game');
const healthRoutes = require('./routes/health');

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
// ✅ USAR RUTAS COMPLETAS (NO LAS BÁSICAS)
// ========================================
app.use('/api/qr', qrRoutes);
app.use('/api/tracks', tracksRoutes);
app.use('/api/audio', audioRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/health', healthRoutes);

// ========================================
// RUTA DE BIENVENIDA
// ========================================
app.get('/', (req, res) => {
  const networkIPs = getLocalNetworkIPs();

  res.sendSuccess({
    message: 'HITBACK Backend API v2.0 - COMPLETE ROUTES ACTIVE',
    status: 'operational',
    server: {
      host: HOST,
      port: PORT,
      networkIPs,
      accessUrls: networkIPs.map(ip => `http://${ip}:${PORT}`)
    },
    endpoints: {
      scanQR: '/api/qr/scan/:qrCode',  // ✅ Esto es lo que usa tu app
      tracks: '/api/tracks',
      audio: '/api/audio/list',
      health: '/api/health',
      expoHealth: '/api/expo/health'
    },
    expo: {
      testConnection: networkIPs.map(ip => `http://${ip}:${PORT}/api/expo/health`),
      audioTest: networkIPs.map(ip => `http://${ip}:${PORT}/audio/tracks/`)
    }
  }, 'HITBACK API is running with COMPLETE ROUTES');
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
    const deezerService = require('../services/DeezerService');
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
    const DeezerService = require('../services/DeezerService');

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

  logger.info(`🎵 HITBACK Backend started with COMPLETE ROUTES!`);
  logger.info(`📡 Host: ${HOST}:${PORT}`);
  logger.info(`🏠 Local: http://localhost:${PORT}`);

  if (networkIPs.length > 0) {
    logger.info(`📱 Network Access URLs for Expo:`);
    networkIPs.forEach(ip => {
      logger.info(`   📍 http://${ip}:${PORT}`);
    });
    logger.info(`🧪 Test Expo connection: http://${networkIPs[0]}:${PORT}/api/expo/health`);
    logger.info(`🎯 QR Scan endpoint (COMPLETE): http://${networkIPs[0]}:${PORT}/api/qr/scan/HITBACK_001_SONG_EASY`);
  }

  logger.info(`🎵 Audio files: /audio/tracks/`);
  logger.info(`✅ USING COMPLETE ROUTES - NOT BASIC ONES`);
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    logger.info('Server closed.');
    process.exit(0);
  });
});

module.exports = app;