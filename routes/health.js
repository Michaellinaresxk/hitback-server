
const express = require('express');
const router = express.Router();

const GameController = require('../controllers/gameController');
const { asyncHandler } = require('../utils/errors');
const logger = require('../utils/logger');

const gameController = new GameController();

// ========================================
// 🏥 HEALTH CHECKS PRINCIPALES
// ========================================

/**
 * Health check general del sistema
 * GET /api/health
 */
router.get('/', gameController.healthCheck);

/**
 * Health check de servicios individuales
 * GET /api/health/services
 */
router.get('/services', asyncHandler(async (req, res) => {
  try {
    const services = {
      trackService: await gameController.trackService.healthCheck(),
      audioService: await gameController.audioService.healthCheck(),
      qrService: {
        service: 'QRService',
        status: 'healthy',
        timestamp: new Date().toISOString(),
        features: {
          validation: true,
          generation: true,
          parsing: true
        }
      }
    };

    // Determinar estado general
    const statuses = Object.values(services).map(s => s.status);
    let overallStatus = 'healthy';

    if (statuses.includes('error')) {
      overallStatus = 'error';
    } else if (statuses.includes('warning') || statuses.includes('degraded')) {
      overallStatus = 'degraded';
    }

    res.sendHealthCheck(services, overallStatus);

  } catch (error) {
    logger.error('Services health check failed:', error);
    res.sendError('Services health check failed', 'HEALTH_CHECK_ERROR', 500, error.message);
  }
}));

/**
 * Health check detallado con métricas
 * GET /api/health/detailed
 */
router.get('/detailed', asyncHandler(async (req, res) => {
  try {
    const startTime = Date.now();

    // Obtener información del sistema
    const systemInfo = {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      platform: process.platform,
      nodeVersion: process.version,
      environment: process.env.NODE_ENV || 'development'
    };

    // Health checks de servicios
    const services = await Promise.allSettled([
      gameController.trackService.healthCheck(),
      gameController.audioService.healthCheck()
    ]);

    const serviceResults = {
      trackService: services[0].status === 'fulfilled' ? services[0].value : {
        status: 'error',
        error: services[0].reason?.message
      },
      audioService: services[1].status === 'fulfilled' ? services[1].value : {
        status: 'error',
        error: services[1].reason?.message
      },
      qrService: {
        service: 'QRService',
        status: 'healthy',
        timestamp: new Date().toISOString()
      }
    };

    // Métricas de rendimiento
    const tracks = gameController.trackService.getAllTracks();
    const audioFiles = gameController.audioService.listAudioFiles();

    const performance = {
      tracksLoaded: tracks.length,
      audioFilesAvailable: audioFiles.length,
      healthCheckDuration: Date.now() - startTime,
      memoryUsageMB: Math.round(systemInfo.memory.heapUsed / 1024 / 1024),
      uptimeHours: Math.round(systemInfo.uptime / 3600 * 100) / 100
    };

    // Verificaciones adicionales
    const checks = {
      dataDirectory: gameController.trackService.tracksFilePath ?
        require('fs').existsSync(gameController.trackService.tracksFilePath) : false,
      audioDirectory: gameController.audioService.audioDirectory ?
        require('fs').existsSync(gameController.audioService.audioDirectory) : false,
      logDirectory: logger.logDirectory ?
        require('fs').existsSync(logger.logDirectory) : false
    };

    // Estado general
    const hasErrors = Object.values(serviceResults).some(s => s.status === 'error');
    const hasWarnings = Object.values(serviceResults).some(s => s.status === 'warning' || s.status === 'degraded');

    let overallStatus = 'healthy';
    if (hasErrors) {
      overallStatus = 'error';
    } else if (hasWarnings || !Object.values(checks).every(Boolean)) {
      overallStatus = 'degraded';
    }

    res.sendSuccess({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      system: systemInfo,
      services: serviceResults,
      performance,
      checks,
      recommendations: overallStatus !== 'healthy' ? [
        'Check service logs for detailed error information',
        'Verify all required directories exist',
        'Ensure audio files are accessible'
      ] : []
    }, `Detailed health check completed: ${overallStatus}`);

  } catch (error) {
    logger.error('Detailed health check failed:', error);
    res.sendError('Detailed health check failed', 'DETAILED_HEALTH_ERROR', 500, error.message);
  }
}));

// ========================================
// 📊 MÉTRICAS DE RENDIMIENTO
// ========================================

/**
 * Métricas de rendimiento del servidor
 * GET /api/health/metrics
 */
router.get('/metrics', asyncHandler(async (req, res) => {
  try {
    const metrics = {
      timestamp: new Date().toISOString(),
      server: {
        uptime: process.uptime(),
        memory: {
          ...process.memoryUsage(),
          formatted: {
            heapUsed: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
            heapTotal: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB`,
            external: `${Math.round(process.memoryUsage().external / 1024 / 1024)}MB`
          }
        },
        cpu: process.cpuUsage()
      },
      application: {
        environment: process.env.NODE_ENV || 'development',
        nodeVersion: process.version,
        platform: process.platform,
        pid: process.pid
      },
      logs: logger.getStats()
    };

    // Métricas específicas de la aplicación
    try {
      const tracks = gameController.trackService.getAllTracks();
      const audioFiles = gameController.audioService.listAudioFiles();

      metrics.application.tracks = {
        total: tracks.length,
        withAudio: tracks.filter(t => t.audioFile).length,
        withQuestions: tracks.filter(t => t.hasQuestions).length
      };

      metrics.application.audio = {
        totalFiles: audioFiles.length,
        totalSize: audioFiles.reduce((sum, file) => sum + file.size, 0),
        totalSizeFormatted: formatBytes(audioFiles.reduce((sum, file) => sum + file.size, 0))
      };
    } catch (error) {
      metrics.application.error = 'Failed to load application metrics';
    }

    res.sendSuccess(metrics, 'Performance metrics retrieved');

  } catch (error) {
    logger.error('Failed to get metrics:', error);
    res.sendError('Failed to retrieve metrics', 'METRICS_ERROR', 500, error.message);
  }
}));

// ========================================
// 🔧 DIAGNÓSTICOS ESPECÍFICOS
// ========================================

/**
 * Diagnóstico de conectividad
 * GET /api/health/connectivity
 */
router.get('/connectivity', asyncHandler(async (req, res) => {
  try {
    const connectivity = {
      timestamp: new Date().toISOString(),
      tests: {}
    };

    // Test de acceso a archivos
    connectivity.tests.fileSystem = {
      status: 'unknown',
      canReadTracks: false,
      canReadAudio: false,
      canWriteLogs: false
    };

    try {
      const fs = require('fs');

      // Test lectura de tracks
      connectivity.tests.fileSystem.canReadTracks =
        fs.existsSync(gameController.trackService.tracksFilePath);

      // Test lectura de audio
      connectivity.tests.fileSystem.canReadAudio =
        fs.existsSync(gameController.audioService.audioDirectory);

      // Test escritura de logs
      try {
        const testLogPath = require('path').join(logger.logDirectory, 'test.log');
        fs.writeFileSync(testLogPath, 'test');
        fs.unlinkSync(testLogPath);
        connectivity.tests.fileSystem.canWriteLogs = true;
      } catch (error) {
        connectivity.tests.fileSystem.canWriteLogs = false;
      }

      const allPass = Object.values(connectivity.tests.fileSystem)
        .filter(v => typeof v === 'boolean')
        .every(Boolean);

      connectivity.tests.fileSystem.status = allPass ? 'pass' : 'fail';
    } catch (error) {
      connectivity.tests.fileSystem.status = 'error';
      connectivity.tests.fileSystem.error = error.message;
    }

    // Test de servicios internos
    connectivity.tests.services = {
      status: 'unknown',
      trackService: false,
      audioService: false,
      qrService: false
    };

    try {
      // Test básico de cada servicio
      gameController.trackService.getAllTracks();
      connectivity.tests.services.trackService = true;

      gameController.audioService.listAudioFiles();
      connectivity.tests.services.audioService = true;

      gameController.qrService.validateQRFormat('HITBACK_001_SONG_EASY');
      connectivity.tests.services.qrService = true;

      const allServicesPass = [
        connectivity.tests.services.trackService,
        connectivity.tests.services.audioService,
        connectivity.tests.services.qrService
      ].every(Boolean);

      connectivity.tests.services.status = allServicesPass ? 'pass' : 'fail';
    } catch (error) {
      connectivity.tests.services.status = 'error';
      connectivity.tests.services.error = error.message;
    }

    // Estado general
    const allTestsPass = Object.values(connectivity.tests)
      .every(test => test.status === 'pass');

    connectivity.overallStatus = allTestsPass ? 'healthy' : 'degraded';

    res.sendSuccess(connectivity, `Connectivity test completed: ${connectivity.overallStatus}`);

  } catch (error) {
    logger.error('Connectivity test failed:', error);
    res.sendError('Connectivity test failed', 'CONNECTIVITY_ERROR', 500, error.message);
  }
}));

/**
 * Test de carga rápida
 * GET /api/health/load-test
 */
router.get('/load-test', asyncHandler(async (req, res) => {
  try {
    const iterations = Math.min(parseInt(req.query.iterations) || 10, 50); // Máximo 50
    const results = [];

    for (let i = 0; i < iterations; i++) {
      const start = Date.now();

      try {
        // Operaciones típicas
        const tracks = gameController.trackService.getAllTracks();
        const randomTrack = gameController.trackService.getRandomTrack();
        const qrCodes = gameController.qrService.generateQRCodesForTrack(randomTrack.id);

        const duration = Date.now() - start;

        results.push({
          iteration: i + 1,
          duration,
          success: true,
          operations: {
            tracksLoaded: tracks.length,
            qrCodesGenerated: qrCodes.length
          }
        });
      } catch (error) {
        results.push({
          iteration: i + 1,
          duration: Date.now() - start,
          success: false,
          error: error.message
        });
      }
    }

    const successful = results.filter(r => r.success).length;
    const averageDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
    const maxDuration = Math.max(...results.map(r => r.duration));
    const minDuration = Math.min(...results.map(r => r.duration));

    const loadTestResult = {
      timestamp: new Date().toISOString(),
      iterations,
      successful,
      failed: iterations - successful,
      successRate: Math.round((successful / iterations) * 100),
      performance: {
        averageDuration: Math.round(averageDuration),
        maxDuration,
        minDuration,
        totalDuration: results.reduce((sum, r) => sum + r.duration, 0)
      },
      results: req.query.detailed === 'true' ? results : undefined
    };

    res.sendSuccess(loadTestResult, `Load test completed: ${successful}/${iterations} successful`);

  } catch (error) {
    logger.error('Load test failed:', error);
    res.sendError('Load test failed', 'LOAD_TEST_ERROR', 500, error.message);
  }
}));

// ========================================
// UTILIDADES
// ========================================

/**
 * Formatea bytes en formato legible
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

module.exports = router;