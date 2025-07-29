const logger = require('../utils/logger');

/**
 * Configurar rutas básicas para arrancar el servidor
 */
function setupRoutes(app) {

  // ========================================
  // RUTAS BÁSICAS
  // ========================================

  // Health check básico
  app.get('/api/health', (req, res) => {
    logger.info('Health check request');
    res.sendSuccess({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      structure: 'root-level (no src/ folder)',
      version: '2.0.0'
    }, 'Server is healthy');
  });

  // QR scan temporal
  app.post('/api/qr/scan/:qrCode', (req, res) => {
    const { qrCode } = req.params;
    logger.info(`QR scan request: ${qrCode}`);

    // Validación básica del formato QR
    const qrPattern = /^HITBACK_[A-Za-z0-9]+_[A-Za-z]+_[A-Za-z]+$/;
    const isValidFormat = qrPattern.test(qrCode);

    if (!isValidFormat) {
      return res.sendError(
        'Invalid QR code format. Expected: HITBACK_ID_TYPE_DIFFICULTY',
        'INVALID_QR_FORMAT',
        400
      );
    }

    // Parsear QR code
    const parts = qrCode.split('_');
    const [prefix, trackId, cardType, difficulty] = parts;

    res.sendSuccess({
      qrCode,
      parsed: {
        trackId,
        cardType: cardType.toLowerCase(),
        difficulty: difficulty.toLowerCase()
      },
      message: 'QR scan endpoint working',
      timestamp: new Date().toISOString(),
      note: 'This is a temporary implementation - full functionality coming soon'
    }, 'QR scan successful');
  });

  // GET alternativo para QR scan (para testing en browser)
  app.get('/api/qr/scan/:qrCode', (req, res) => {
    const { qrCode } = req.params;
    logger.info(`QR scan request (GET): ${qrCode}`);

    res.sendSuccess({
      qrCode,
      method: 'GET',
      message: 'QR scan endpoint working (GET method)',
      note: 'Use POST method for actual game scanning',
      timestamp: new Date().toISOString()
    }, 'QR scan test successful');
  });

  // Tracks básico
  app.get('/api/tracks', (req, res) => {
    logger.info('Tracks list request');
    res.sendSuccess([
      {
        id: '001',
        title: 'Despacito',
        artist: 'Luis Fonsi ft. Daddy Yankee',
        status: 'sample track',
        audioFile: '001_despacito.mp3',
        questions: {
          song: { question: '¿Cuál es la canción?', answer: 'Despacito', points: 1 },
          artist: { question: '¿Quién la canta?', answer: 'Luis Fonsi ft. Daddy Yankee', points: 2 }
        }
      },
      {
        id: '002',
        title: 'Bohemian Rhapsody',
        artist: 'Queen',
        status: 'sample track',
        audioFile: '002_bohemian_rhapsody.mp3',
        questions: {
          song: { question: '¿Cuál es la canción?', answer: 'Bohemian Rhapsody', points: 1 },
          artist: { question: '¿Quién la canta?', answer: 'Queen', points: 2 }
        }
      }
    ], 'Tracks list retrieved (sample data)');
  });

  // Track específico
  app.get('/api/tracks/:id', (req, res) => {
    const { id } = req.params;
    logger.info(`Track request: ${id}`);

    // Track de ejemplo
    const sampleTrack = {
      id: id,
      title: `Sample Track ${id}`,
      artist: 'Sample Artist',
      year: 2024,
      genre: 'Sample',
      audioFile: `${id}_sample.mp3`,
      audioUrl: `${req.protocol}://${req.get('host')}/audio/tracks/${id}_sample.mp3`,
      questions: {
        song: { question: '¿Cuál es la canción?', answer: `Sample Track ${id}`, points: 1 },
        artist: { question: '¿Quién la canta?', answer: 'Sample Artist', points: 2 }
      },
      status: 'temporary sample data'
    };

    res.sendSuccess(sampleTrack, 'Track retrieved');
  });

  // Audio list
  app.get('/api/audio/list', (req, res) => {
    const fs = require('fs');
    const path = require('path');

    logger.info('Audio list request');

    const audioDir = path.join(__dirname, '../public/audio/tracks');

    if (!fs.existsSync(audioDir)) {
      return res.sendSuccess([], 'No audio directory found', {
        audioDirectory: audioDir,
        note: 'Create public/audio/tracks/ directory and add MP3 files'
      });
    }

    try {
      const audioFiles = fs.readdirSync(audioDir)
        .filter(file => file.toLowerCase().endsWith('.mp3'))
        .map(file => {
          const filePath = path.join(audioDir, file);
          const stats = fs.statSync(filePath);
          const baseUrl = `${req.protocol}://${req.get('host')}`;

          return {
            filename: file,
            url: `${baseUrl}/audio/tracks/${file}`,
            size: stats.size,
            sizeFormatted: `${Math.round(stats.size / 1024)}KB`,
            lastModified: stats.mtime
          };
        });

      res.sendSuccess(audioFiles, `Found ${audioFiles.length} audio files`, {
        audioDirectory: audioDir,
        totalFiles: audioFiles.length
      });
    } catch (error) {
      res.sendError('Failed to list audio files', 'AUDIO_LIST_ERROR', 500, error.message);
    }
  });

  // Documentación básica
  app.get('/api/docs', (req, res) => {
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    res.sendSuccess({
      title: 'HITBACK API - Basic Setup',
      version: '2.0.0',
      baseUrl,
      status: 'Server is running with basic routes',
      structure: 'Root-level architecture (no src/ folder)',
      endpoints: {
        health: `${baseUrl}/api/health`,
        qrScan: `${baseUrl}/api/qr/scan/:qrCode`,
        tracks: `${baseUrl}/api/tracks`,
        trackById: `${baseUrl}/api/tracks/:id`,
        audioList: `${baseUrl}/api/audio/list`,
        docs: `${baseUrl}/api/docs`
      },
      qrCodeFormat: {
        pattern: 'HITBACK_{TRACK_ID}_{CARD_TYPE}_{DIFFICULTY}',
        examples: [
          'HITBACK_001_SONG_EASY',
          'HITBACK_002_ARTIST_MEDIUM',
          'HITBACK_003_DECADE_HARD'
        ]
      },
      testCommands: {
        health: `curl ${baseUrl}/api/health`,
        qrScan: `curl -X POST ${baseUrl}/api/qr/scan/HITBACK_001_SONG_EASY`,
        tracks: `curl ${baseUrl}/api/tracks`,
        audioList: `curl ${baseUrl}/api/audio/list`
      }
    }, 'Basic API documentation');
  });

  // QR validation
  app.get('/api/qr/validate/:qrCode', (req, res) => {
    const { qrCode } = req.params;
    logger.info(`QR validation request: ${qrCode}`);

    const qrPattern = /^HITBACK_[A-Za-z0-9]+_[A-Za-z]+_[A-Za-z]+$/;
    const isValid = qrPattern.test(qrCode);

    const result = {
      qrCode,
      isValid,
      timestamp: new Date().toISOString()
    };

    if (isValid) {
      const parts = qrCode.split('_');
      result.parsed = {
        trackId: parts[1],
        cardType: parts[2].toLowerCase(),
        difficulty: parts[3].toLowerCase()
      };
    } else {
      result.error = 'Invalid format';
      result.expectedFormat = 'HITBACK_{TRACK_ID}_{CARD_TYPE}_{DIFFICULTY}';
    }

    res.sendSuccess(result, isValid ? 'QR code is valid' : 'QR code is invalid');
  });

  logger.info('Basic routes configured successfully (root structure)');
}

module.exports = setupRoutes;