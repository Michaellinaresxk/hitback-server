const express = require('express');
const router = express.Router();

const GameController = require('../controllers/gameController');
const { audioValidation } = require('../middleware/validation');
const { asyncHandler } = require('../utils/errors');
const logger = require('../utils/logger');

const gameController = new GameController();

// ========================================
// 📁 LISTADO Y GESTIÓN DE ARCHIVOS
// ========================================

/**
 * Listar todos los archivos de audio disponibles
 * GET /api/audio/list
 */
router.get('/list', asyncHandler(async (req, res) => {
  try {
    const audioService = gameController.audioService;
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    const audioFiles = audioService.listAudioFiles();

    // Enriquecer con URLs completas
    const enrichedFiles = audioFiles.map(file => ({
      ...file,
      url: `${baseUrl}/audio/tracks/${file.filename}`,
      streamUrl: `${baseUrl}/api/audio/stream/${file.filename}`
    }));

    logger.info(`Listed ${enrichedFiles.length} audio files`);

    res.sendSuccess(enrichedFiles, `Found ${enrichedFiles.length} audio files`, {
      totalFiles: enrichedFiles.length,
      totalSize: enrichedFiles.reduce((sum, file) => sum + file.size, 0),
      averageSize: enrichedFiles.length > 0
        ? Math.round(enrichedFiles.reduce((sum, file) => sum + file.size, 0) / enrichedFiles.length)
        : 0,
      supportedFormats: ['.mp3', '.wav', '.m4a'],
      baseUrl: `${baseUrl}/audio/tracks/`
    });

  } catch (error) {
    logger.error('Failed to list audio files:', error);
    res.sendError('Failed to list audio files', 'AUDIO_LIST_ERROR', 500, error.message);
  }
}));

/**
 * Verificar si un archivo de audio específico existe
 * GET /api/audio/check/:filename
 */
router.get('/check/:filename', audioValidation, asyncHandler(async (req, res) => {
  const { filename } = req.params;

  try {
    const audioService = gameController.audioService;
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    const exists = audioService.audioFileExists(filename);

    const result = {
      filename,
      exists,
      timestamp: new Date().toISOString()
    };

    if (exists) {
      try {
        const metadata = audioService.getAudioMetadata(filename);
        result.metadata = metadata;
        result.url = `${baseUrl}/audio/tracks/${filename}`;
        result.streamUrl = `${baseUrl}/api/audio/stream/${filename}`;
        result.isValid = audioService.isValidAudioFile(filename) &&
          audioService.isValidAudioSize(filename);
      } catch (error) {
        result.error = error.message;
        result.isValid = false;
      }
    }

    const message = exists ? 'Audio file found' : 'Audio file not found';
    const statusCode = exists ? 200 : 404;

    if (exists) {
      res.sendSuccess(result, message);
    } else {
      res.status(statusCode).json({
        success: false,
        error: {
          message,
          code: 'AUDIO_FILE_NOT_FOUND',
          data: result
        }
      });
    }

  } catch (error) {
    logger.error(`Audio check failed for ${filename}:`, error);
    res.sendError('Audio check failed', 'AUDIO_CHECK_ERROR', 500, error.message);
  }
}));

// ========================================
// 🎵 STREAMING Y REPRODUCCIÓN
// ========================================

/**
 * Stream de audio con soporte para range requests
 * GET /api/audio/stream/:filename
 */
router.get('/stream/:filename', audioValidation, asyncHandler(async (req, res) => {
  const { filename } = req.params;

  try {
    const audioService = gameController.audioService;

    const options = {
      range: req.headers.range
    };

    const { stream, headers, statusCode } = audioService.createAudioStream(filename, options);

    // Establecer headers
    Object.keys(headers).forEach(key => {
      res.set(key, headers[key]);
    });

    // Log del streaming
    logger.info(`Audio streaming: ${filename}`, {
      range: req.headers.range,
      statusCode,
      userAgent: req.get('User-Agent')
    });

    res.status(statusCode);
    stream.pipe(res);

  } catch (error) {
    logger.error(`Audio streaming failed for ${filename}:`, error);

    if (error.name === 'FileNotFoundError') {
      res.sendNotFound('Audio file', filename);
    } else {
      res.sendError('Audio streaming failed', 'AUDIO_STREAM_ERROR', 500, error.message);
    }
  }
}));

/**
 * Obtener metadata de archivo de audio
 * GET /api/audio/metadata/:filename
 */
router.get('/metadata/:filename', audioValidation, asyncHandler(async (req, res) => {
  const { filename } = req.params;

  try {
    const audioService = gameController.audioService;
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    const metadata = audioService.getAudioMetadata(filename);

    // Enriquecer con información adicional
    const enrichedMetadata = {
      ...metadata,
      url: `${baseUrl}/audio/tracks/${filename}`,
      streamUrl: `${baseUrl}/api/audio/stream/${filename}`,
      isValid: audioService.isValidAudioFile(filename),
      isValidSize: audioService.isValidAudioSize(filename),
      mimeType: audioService.getMimeType(filename),
      canStream: true
    };

    res.sendSuccess(enrichedMetadata, 'Audio metadata retrieved');

  } catch (error) {
    logger.error(`Failed to get audio metadata for ${filename}:`, error);

    if (error.name === 'FileNotFoundError') {
      res.sendNotFound('Audio file', filename);
    } else {
      res.sendError('Failed to get audio metadata', 'AUDIO_METADATA_ERROR', 500, error.message);
    }
  }
}));

// ========================================
// 🔍 DIAGNÓSTICOS Y ANÁLISIS
// ========================================

/**
 * Diagnóstico completo de archivos de audio
 * GET /api/audio/diagnostics
 */
router.get('/diagnostics', gameController.audioDiagnostics);

/**
 * Verificar integridad de archivos de audio
 * GET /api/audio/integrity
 */
router.get('/integrity', asyncHandler(async (req, res) => {
  try {
    const audioService = gameController.audioService;
    const trackService = gameController.trackService;

    const tracks = trackService.getAllTracks();
    const audioFiles = audioService.listAudioFiles();

    const integrity = {
      timestamp: new Date().toISOString(),
      summary: {
        totalTracks: tracks.length,
        tracksWithAudio: 0,
        audioFilesFound: audioFiles.length,
        matchingFiles: 0,
        corruptFiles: 0,
        orphanedFiles: 0
      },
      details: {
        validFiles: [],
        corruptFiles: [],
        missingFiles: [],
        orphanedFiles: []
      }
    };

    // Verificar archivos referenciados por tracks
    const referencedFiles = new Set();

    for (const track of tracks) {
      if (track.audioFile) {
        integrity.summary.tracksWithAudio++;
        referencedFiles.add(track.audioFile);

        try {
          if (audioService.audioFileExists(track.audioFile)) {
            const metadata = audioService.getAudioMetadata(track.audioFile);
            const isValid = audioService.isValidAudioFile(track.audioFile) &&
              audioService.isValidAudioSize(track.audioFile);

            if (isValid) {
              integrity.summary.matchingFiles++;
              integrity.details.validFiles.push({
                trackId: track.id,
                filename: track.audioFile,
                size: metadata.size,
                duration: metadata.duration
              });
            } else {
              integrity.summary.corruptFiles++;
              integrity.details.corruptFiles.push({
                trackId: track.id,
                filename: track.audioFile,
                reason: 'Invalid format or size'
              });
            }
          } else {
            integrity.details.missingFiles.push({
              trackId: track.id,
              filename: track.audioFile
            });
          }
        } catch (error) {
          integrity.summary.corruptFiles++;
          integrity.details.corruptFiles.push({
            trackId: track.id,
            filename: track.audioFile,
            reason: error.message
          });
        }
      }
    }

    // Verificar archivos huérfanos
    audioFiles.forEach(file => {
      if (!referencedFiles.has(file.filename)) {
        integrity.summary.orphanedFiles++;
        integrity.details.orphanedFiles.push({
          filename: file.filename,
          size: file.size,
          lastModified: file.lastModified
        });
      }
    });

    // Calcular porcentajes
    integrity.summary.integrityPercentage = tracks.length > 0
      ? Math.round((integrity.summary.matchingFiles / integrity.summary.tracksWithAudio) * 100)
      : 100;

    const status = integrity.summary.corruptFiles === 0 &&
      integrity.details.missingFiles.length === 0
      ? 'healthy' : 'degraded';

    res.sendSuccess(integrity, `Audio integrity check completed: ${status}`, {
      status,
      recommendations: integrity.summary.corruptFiles > 0 || integrity.details.missingFiles.length > 0
        ? ['Check and replace corrupt/missing audio files', 'Verify file permissions']
        : ['Audio files are in good condition']
    });

  } catch (error) {
    logger.error('Audio integrity check failed:', error);
    res.sendError('Audio integrity check failed', 'AUDIO_INTEGRITY_ERROR', 500, error.message);
  }
}));

// ========================================
// 📊 ESTADÍSTICAS DE AUDIO
// ========================================

/**
 * Estadísticas de uso y rendimiento de audio
 * GET /api/audio/stats
 */
router.get('/stats', asyncHandler(async (req, res) => {
  try {
    const audioService = gameController.audioService;
    const trackService = gameController.trackService;

    const tracks = trackService.getAllTracks();
    const audioFiles = audioService.listAudioFiles();

    const stats = {
      files: {
        total: audioFiles.length,
        totalSize: audioFiles.reduce((sum, file) => sum + file.size, 0),
        averageSize: audioFiles.length > 0
          ? Math.round(audioFiles.reduce((sum, file) => sum + file.size, 0) / audioFiles.length)
          : 0,
        largestFile: audioFiles.length > 0
          ? audioFiles.reduce((max, file) => file.size > max.size ? file : max)
          : null,
        smallestFile: audioFiles.length > 0
          ? audioFiles.reduce((min, file) => file.size < min.size ? file : min)
          : null
      },
      tracks: {
        total: tracks.length,
        withAudio: tracks.filter(t => t.audioFile).length,
        withoutAudio: tracks.filter(t => !t.audioFile).length,
        audioPercentage: tracks.length > 0
          ? Math.round((tracks.filter(t => t.audioFile).length / tracks.length) * 100)
          : 0
      },
      formats: {},
      health: await audioService.healthCheck()
    };

    // Estadísticas por formato
    audioFiles.forEach(file => {
      const ext = file.extension || 'unknown';
      if (!stats.formats[ext]) {
        stats.formats[ext] = {
          count: 0,
          totalSize: 0
        };
      }
      stats.formats[ext].count++;
      stats.formats[ext].totalSize += file.size;
    });

    res.sendSuccess(stats, 'Audio statistics retrieved');

  } catch (error) {
    logger.error('Failed to get audio stats:', error);
    res.sendError('Failed to retrieve audio statistics', 'AUDIO_STATS_ERROR', 500, error.message);
  }
}));

// ========================================
// 🧪 TESTING Y VALIDACIÓN
// ========================================

/**
 * Test de reproducción de audio
 * GET /api/audio/test/:filename
 */
router.get('/test/:filename', audioValidation, asyncHandler(async (req, res) => {
  const { filename } = req.params;

  try {
    const audioService = gameController.audioService;
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    const testResult = {
      filename,
      timestamp: new Date().toISOString(),
      tests: {
        fileExists: {
          status: 'unknown',
          result: false
        },
        formatValid: {
          status: 'unknown',
          result: false
        },
        sizeValid: {
          status: 'unknown',
          result: false
        },
        canStream: {
          status: 'unknown',
          result: false
        }
      },
      metadata: null,
      urls: {
        direct: `${baseUrl}/audio/tracks/${filename}`,
        stream: `${baseUrl}/api/audio/stream/${filename}`
      }
    };

    // Test 1: Archivo existe
    testResult.tests.fileExists.result = audioService.audioFileExists(filename);
    testResult.tests.fileExists.status = testResult.tests.fileExists.result ? 'pass' : 'fail';

    if (testResult.tests.fileExists.result) {
      // Test 2: Formato válido
      testResult.tests.formatValid.result = audioService.isValidAudioFile(filename);
      testResult.tests.formatValid.status = testResult.tests.formatValid.result ? 'pass' : 'fail';

      // Test 3: Tamaño válido
      testResult.tests.sizeValid.result = audioService.isValidAudioSize(filename);
      testResult.tests.sizeValid.status = testResult.tests.sizeValid.result ? 'pass' : 'fail';

      // Test 4: Puede hacer streaming
      try {
        testResult.metadata = audioService.getAudioMetadata(filename);
        testResult.tests.canStream.result = true;
        testResult.tests.canStream.status = 'pass';
      } catch (error) {
        testResult.tests.canStream.result = false;
        testResult.tests.canStream.status = 'fail';
        testResult.tests.canStream.error = error.message;
      }
    } else {
      // Si el archivo no existe, marcar otros tests como fail
      testResult.tests.formatValid.status = 'fail';
      testResult.tests.sizeValid.status = 'fail';
      testResult.tests.canStream.status = 'fail';
    }

    // Resumen
    const passedTests = Object.values(testResult.tests).filter(t => t.status === 'pass').length;
    const totalTests = Object.keys(testResult.tests).length;

    const overallStatus = passedTests === totalTests ? 'pass' :
      passedTests > 0 ? 'partial' : 'fail';

    res.sendSuccess(testResult, `Audio test completed: ${overallStatus}`, {
      overallStatus,
      passedTests,
      totalTests,
      successRate: Math.round((passedTests / totalTests) * 100)
    });

  } catch (error) {
    logger.error(`Audio test failed for ${filename}:`, error);
    res.sendError('Audio test failed', 'AUDIO_TEST_ERROR', 500, error.message);
  }
}));

module.exports = router;