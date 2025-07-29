
const express = require('express');
const router = express.Router();

const GameController = require('../controllers/gameController');
const { trackValidation, paginationValidation } = require('../middleware/validation');
const { asyncHandler } = require('../utils/errors');
const logger = require('../utils/logger');

const gameController = new GameController();

// ========================================
// 📋 GESTIÓN DE TRACKS
// ========================================

/**
 * Obtener todos los tracks
 * GET /api/tracks
 */
router.get('/', paginationValidation, gameController.getAllTracks);

/**
 * Obtener track aleatorio con filtros opcionales
 * GET /api/tracks/random?difficulty=easy&genre=pop
 */
router.get('/random', gameController.getRandomTrack);

/**
 * Buscar tracks por criterios
 * GET /api/tracks/search?q=despacito&genre=reggaeton
 */
router.get('/search', asyncHandler(async (req, res) => {
  const { q, genre, decade, difficulty, cardType, hasAudio, artist, year } = req.query;

  if (!q && !genre && !decade && !difficulty && !cardType && !hasAudio && !artist && !year) {
    return res.sendValidationError(
      [{ field: 'query', message: 'At least one search parameter is required' }],
      'No search criteria provided'
    );
  }

  try {
    const trackService = gameController.trackService;

    // Construir filtros
    const filters = {};
    if (genre) filters.genre = genre;
    if (decade) filters.decade = decade;
    if (difficulty) filters.difficulty = difficulty;
    if (cardType) filters.cardType = cardType;
    if (hasAudio === 'true') filters.hasQuestions = true;
    if (artist) filters.artist = artist;
    if (year) filters.year = year;

    // Buscar tracks
    let tracks = trackService.searchTracks(filters);

    // Si hay búsqueda por texto, filtrar adicionalmente
    if (q) {
      const searchTerm = q.toLowerCase();
      tracks = tracks.filter(track =>
        track.title.toLowerCase().includes(searchTerm) ||
        track.artist.toLowerCase().includes(searchTerm) ||
        track.album?.toLowerCase().includes(searchTerm)
      );
    }

    logger.info(`Track search returned ${tracks.length} results`, {
      query: q,
      filters
    });

    res.sendSuccess(tracks, `Found ${tracks.length} tracks`, {
      searchQuery: q,
      appliedFilters: filters,
      totalResults: tracks.length,
      availableFilters: {
        genre: 'string',
        decade: 'string (e.g., 2010s)',
        difficulty: 'easy|medium|hard|expert',
        cardType: 'song|artist|decade|lyrics|challenge',
        hasAudio: 'boolean',
        artist: 'string',
        year: 'number'
      }
    });

  } catch (error) {
    logger.error('Track search failed:', error);
    res.sendError('Track search failed', 'TRACK_SEARCH_ERROR', 500, error.message);
  }
}));

/**
 * Obtener track específico por ID
 * GET /api/tracks/:id
 */
router.get('/:id', trackValidation, gameController.getTrackById);

// ========================================
// 📊 ESTADÍSTICAS Y ANÁLISIS
// ========================================

/**
 * Obtener estadísticas generales de tracks
 * GET /api/tracks/stats/overview
 */
router.get('/stats/overview', asyncHandler(async (req, res) => {
  try {
    const trackService = gameController.trackService;
    const audioService = gameController.audioService;

    const tracks = trackService.getAllTracks();
    const stats = trackService.getStats();
    const audioFiles = audioService.listAudioFiles();

    // Estadísticas adicionales
    const additionalStats = {
      completion: {
        withAudio: Math.round((stats.withAudio / stats.total) * 100) || 0,
        withQuestions: Math.round((stats.withQuestions / stats.total) * 100) || 0,
        fullyComplete: tracks.filter(t => t.audioFile && t.hasQuestions).length
      },
      audio: {
        totalFiles: audioFiles.length,
        totalSize: audioFiles.reduce((sum, file) => sum + file.size, 0),
        averageSize: audioFiles.length > 0
          ? Math.round(audioFiles.reduce((sum, file) => sum + file.size, 0) / audioFiles.length)
          : 0
      },
      questions: {
        byCardType: {},
        totalQuestions: 0
      },
      yearRange: {
        earliest: Math.min(...tracks.map(t => t.year).filter(Boolean)) || null,
        latest: Math.max(...tracks.map(t => t.year).filter(Boolean)) || null
      }
    };

    // Contar preguntas por tipo
    tracks.forEach(track => {
      if (track.questions) {
        Object.keys(track.questions).forEach(cardType => {
          additionalStats.questions.byCardType[cardType] =
            (additionalStats.questions.byCardType[cardType] || 0) + 1;
          additionalStats.questions.totalQuestions++;
        });
      }
    });

    res.sendSuccess({
      ...stats,
      ...additionalStats
    }, 'Track statistics retrieved');

  } catch (error) {
    logger.error('Failed to get track stats:', error);
    res.sendError('Failed to retrieve statistics', 'TRACK_STATS_ERROR', 500, error.message);
  }
}));

/**
 * Obtener distribución de tracks por década
 * GET /api/tracks/stats/decades
 */
router.get('/stats/decades', asyncHandler(async (req, res) => {
  try {
    const trackService = gameController.trackService;
    const tracks = trackService.getAllTracks();

    const decadeStats = {};

    tracks.forEach(track => {
      const decade = track.decade || 'Unknown';
      if (!decadeStats[decade]) {
        decadeStats[decade] = {
          count: 0,
          tracks: [],
          genres: new Set(),
          withAudio: 0
        };
      }

      decadeStats[decade].count++;
      decadeStats[decade].tracks.push({
        id: track.id,
        title: track.title,
        artist: track.artist,
        year: track.year
      });

      if (track.genre) {
        decadeStats[decade].genres.add(track.genre);
      }

      if (track.audioFile) {
        decadeStats[decade].withAudio++;
      }
    });

    // Convertir Sets a arrays y calcular porcentajes
    Object.keys(decadeStats).forEach(decade => {
      const data = decadeStats[decade];
      data.genres = Array.from(data.genres);
      data.audioPercentage = Math.round((data.withAudio / data.count) * 100);
    });

    res.sendSuccess(decadeStats, 'Decade statistics retrieved', {
      totalDecades: Object.keys(decadeStats).length,
      totalTracks: tracks.length
    });

  } catch (error) {
    logger.error('Failed to get decade stats:', error);
    res.sendError('Failed to retrieve decade statistics', 'DECADE_STATS_ERROR', 500, error.message);
  }
}));

// ========================================
// 🔧 UTILIDADES Y VALIDACIÓN
// ========================================

/**
 * Validar datos de track
 * POST /api/tracks/:id/validate
 */
router.post('/:id/validate', trackValidation, asyncHandler(async (req, res) => {
  const { id } = req.params;

  try {
    const trackService = gameController.trackService;
    const audioService = gameController.audioService;

    const track = trackService.getTrackById(id);
    const validation = trackService.validateTrackData(track);

    // Validación adicional de audio
    let audioValidation = {
      hasAudioFile: !!track.audioFile,
      audioFileExists: false,
      audioFileValid: false,
      audioMetadata: null
    };

    if (track.audioFile) {
      audioValidation.audioFileExists = audioService.audioFileExists(track.audioFile);

      if (audioValidation.audioFileExists) {
        try {
          audioValidation.audioMetadata = audioService.getAudioMetadata(track.audioFile);
          audioValidation.audioFileValid = audioService.isValidAudioFile(track.audioFile) &&
            audioService.isValidAudioSize(track.audioFile);
        } catch (error) {
          audioValidation.audioError = error.message;
        }
      }
    }

    const completeValidation = {
      ...validation,
      audio: audioValidation,
      overallValid: validation.isValid &&
        (audioValidation.audioFileValid || !track.audioFile),
      timestamp: new Date().toISOString()
    };

    res.sendSuccess(completeValidation, 'Track validation completed');

  } catch (error) {
    logger.error(`Track validation failed for ${id}:`, error);

    if (error.name === 'FileNotFoundError') {
      res.sendNotFound('Track', id);
    } else {
      res.sendError('Track validation failed', 'TRACK_VALIDATION_ERROR', 500, error.message);
    }
  }
}));

/**
 * Obtener metadata específica de un track
 * GET /api/tracks/:id/metadata
 */
router.get('/:id/metadata', trackValidation, asyncHandler(async (req, res) => {
  const { id } = req.params;

  try {
    const trackService = gameController.trackService;
    const audioService = gameController.audioService;
    const qrService = gameController.qrService;

    const track = trackService.getTrackById(id);
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    const metadata = {
      track: {
        id: track.id,
        title: track.title,
        artist: track.artist,
        album: track.album,
        year: track.year,
        genre: track.genre,
        decade: track.decade
      },
      audio: null,
      questions: {
        total: track.questionCount,
        available: track.availableCardTypes,
        details: track.questions
      },
      qr: {
        codes: qrService.generateQRCodesForTrack(id),
        totalCodes: qrService.generateQRCodesForTrack(id).length
      },
      urls: {
        track: `${baseUrl}/api/tracks/${id}`,
        audio: null,
        testScan: `${baseUrl}/api/qr/scan/HITBACK_${id}_SONG_EASY`
      }
    };

    // Metadata de audio si existe
    if (track.audioFile) {
      try {
        if (audioService.audioFileExists(track.audioFile)) {
          metadata.audio = audioService.getAudioMetadata(track.audioFile);
          metadata.urls.audio = audioService.getAudioUrl(track.audioFile, baseUrl);
        }
      } catch (error) {
        metadata.audio = { error: error.message };
      }
    }

    res.sendSuccess(metadata, 'Track metadata retrieved');

  } catch (error) {
    logger.error(`Failed to get track metadata for ${id}:`, error);

    if (error.name === 'FileNotFoundError') {
      res.sendNotFound('Track', id);
    } else {
      res.sendError('Failed to retrieve track metadata', 'TRACK_METADATA_ERROR', 500, error.message);
    }
  }
}));

// ========================================
// 🧪 TESTING Y DEBUG
// ========================================

/**
 * Test completo de un track (datos, audio, QR)
 * GET /api/tracks/:id/test
 */
router.get('/:id/test', trackValidation, asyncHandler(async (req, res) => {
  const { id } = req.params;

  try {
    const trackService = gameController.trackService;
    const audioService = gameController.audioService;
    const qrService = gameController.qrService;

    const track = trackService.getTrackById(id);
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    const testResults = {
      trackId: id,
      timestamp: new Date().toISOString(),
      tests: {
        trackData: {
          status: 'pass',
          data: track
        },
        audio: {
          status: 'unknown',
          hasFile: !!track.audioFile,
          fileExists: false,
          url: null
        },
        questions: {
          status: track.hasQuestions ? 'pass' : 'warning',
          count: track.questionCount,
          types: track.availableCardTypes
        },
        qrCodes: {
          status: 'pass',
          generated: 0,
          samples: []
        }
      },
      summary: {
        passed: 0,
        warnings: 0,
        failed: 0,
        overall: 'unknown'
      }
    };

    // Test de audio
    if (track.audioFile) {
      testResults.tests.audio.fileExists = audioService.audioFileExists(track.audioFile);
      testResults.tests.audio.status = testResults.tests.audio.fileExists ? 'pass' : 'fail';

      if (testResults.tests.audio.fileExists) {
        testResults.tests.audio.url = audioService.getAudioUrl(track.audioFile, baseUrl);
      }
    } else {
      testResults.tests.audio.status = 'warning';
    }

    // Test de QR codes
    try {
      const qrCodes = qrService.generateQRCodesForTrack(id);
      testResults.tests.qrCodes.generated = qrCodes.length;
      testResults.tests.qrCodes.samples = qrCodes.slice(0, 3).map(qr => ({
        qrCode: qr.qrCode,
        cardType: qr.cardType,
        difficulty: qr.difficulty,
        points: qr.points
      }));
    } catch (error) {
      testResults.tests.qrCodes.status = 'fail';
      testResults.tests.qrCodes.error = error.message;
    }

    // Calcular resumen
    Object.values(testResults.tests).forEach(test => {
      switch (test.status) {
        case 'pass':
          testResults.summary.passed++;
          break;
        case 'warning':
          testResults.summary.warnings++;
          break;
        case 'fail':
          testResults.summary.failed++;
          break;
      }
    });

    if (testResults.summary.failed > 0) {
      testResults.summary.overall = 'fail';
    } else if (testResults.summary.warnings > 0) {
      testResults.summary.overall = 'warning';
    } else {
      testResults.summary.overall = 'pass';
    }

    const message = `Track test completed: ${testResults.summary.overall}`;

    res.sendSuccess(testResults, message);

  } catch (error) {
    logger.error(`Track test failed for ${id}:`, error);

    if (error.name === 'FileNotFoundError') {
      res.sendNotFound('Track', id);
    } else {
      res.sendError('Track test failed', 'TRACK_TEST_ERROR', 500, error.message);
    }
  }
}));

module.exports = router;