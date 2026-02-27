/**
 * =====================================================
 * TRACKS V2 ROUTES - Con Deezer + PostgreSQL
 * =====================================================
 *
 * Nuevos endpoints para el sistema híbrido
 */

const express = require('express');
const router = express.Router();
const TrackServiceV2 = require('../services/TrackServiceV2');
const logger = require('../utils/logger');

// Inicializar servicio
const trackService = new TrackServiceV2();

/**
 * GET /api/v2/tracks/health
 * Health check del sistema de tracks
 */
router.get('/health', async (req, res) => {
  try {
    const health = await trackService.healthCheck();
    return res.sendSuccess(health, 'Health check completado');

  } catch (error) {
    logger.error('Error en health check:', error);
    return res.sendError(error.message, 'HEALTH_CHECK_ERROR', 500);
  }
});

/**
 * GET /api/v2/tracks/random
 * Obtener track aleatorio con filtros
 *
 * Query params:
 * - genre: Género (ROCK, POP, LATIN, etc)
 * - decade: Década (1980s, 2010s, etc)
 * - difficulty: Dificultad (EASY, MEDIUM, HARD)
 * - sessionId: ID de sesión (opcional, para evitar duplicados)
 */
router.get('/random', async (req, res) => {
  try {
    const { genre, decade, difficulty, sessionId } = req.query;

    const track = await trackService.getRandomTrack({
      sessionId: sessionId || null,
      genre: genre || null,
      decade: decade || null,
      difficulty: difficulty || null
    });

    if (!track) {
      return res.sendNotFound('Tracks', 'con los filtros especificados');
    }

    return res.sendSuccess(track, 'Track obtenido exitosamente');

  } catch (error) {
    logger.error('Error obteniendo track aleatorio:', error);
    return res.sendError(error.message, 'TRACK_FETCH_ERROR', 500);
  }
});

/**
 * GET /api/v2/tracks/search
 * Buscar tracks por texto
 *
 * Query params:
 * - q: Texto a buscar (título o artista)
 * - limit: Cantidad de resultados (default: 10)
 */
router.get('/search', async (req, res) => {
  try {
    const { q, limit = 10 } = req.query;

    if (!q || q.trim().length === 0) {
      return res.sendValidationError([{ field: 'q', message: 'Query parameter is required' }]);
    }

    const tracks = await trackService.searchTracks(q, parseInt(limit));

    return res.sendSuccess({
      tracks,
      count: tracks.length,
      query: q
    }, 'Búsqueda completada');

  } catch (error) {
    logger.error('Error buscando tracks:', error);
    return res.sendError(error.message, 'SEARCH_ERROR', 500);
  }
});

/**
 * GET /api/v2/tracks/stats
 * Estadísticas del sistema de tracks
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await trackService.getStats();
    return res.sendSuccess(stats, 'Estadísticas obtenidas');

  } catch (error) {
    logger.error('Error obteniendo estadísticas:', error);
    return res.sendError(error.message, 'STATS_ERROR', 500);
  }
});

/**
 * GET /api/v2/tracks/:id
 * Obtener track específico por ID
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const track = await trackService.getTrackById(id);

    return res.sendSuccess(track, 'Track obtenido');

  } catch (error) {
    logger.error(`Error obteniendo track ${req.params.id}:`, error);
    return res.sendNotFound('Track', req.params.id);
  }
});

/**
 * POST /api/v2/tracks/deezer/search
 * Buscar directamente en Deezer (sin cache)
 *
 * Body:
 * - genre: Género
 * - decade: Década
 * - limit: Cantidad
 */
router.post('/deezer/search', async (req, res) => {
  try {
    const { genre, decade, limit = 10 } = req.body;

    const DeezerServiceV2 = require('../services/DeezerServiceV2');

    const tracks = await DeezerServiceV2.searchTracks({
      genre: genre || null,
      decade: decade || null,
      limit: parseInt(limit)
    });

    return res.sendSuccess({
      tracks,
      count: tracks.length,
      source: 'deezer'
    }, 'Tracks obtenidos de Deezer');

  } catch (error) {
    logger.error('Error buscando en Deezer:', error);
    return res.sendError(error.message, 'DEEZER_SEARCH_ERROR', 500);
  }
});

/**
 * DELETE /api/v2/tracks/session/:sessionId/used
 * Resetear tracks usados en una sesión
 */
router.delete('/session/:sessionId/used', async (req, res) => {
  try {
    const { sessionId } = req.params;

    await trackService.resetSessionTracks(sessionId);

    return res.sendSuccess({}, 'Tracks reseteados para la sesión');

  } catch (error) {
    logger.error('Error reseteando tracks:', error);
    return res.sendError(error.message, 'RESET_ERROR', 500);
  }
});

/**
 * GET /api/v2/tracks/session/:sessionId/used
 * Obtener tracks usados en una sesión
 */
router.get('/session/:sessionId/used', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const trackIds = await trackService.getUsedTrackIds(sessionId);

    return res.sendSuccess({
      trackIds,
      count: trackIds.length
    }, 'Tracks usados obtenidos');

  } catch (error) {
    logger.error('Error obteniendo tracks usados:', error);
    return res.sendError(error.message, 'USED_TRACKS_ERROR', 500);
  }
});

module.exports = router;
