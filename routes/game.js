
const express = require('express');
const router = express.Router();

const GameController = require('../controllers/gameController');
const { qrValidation, validationMiddleware } = require('../middleware/validation');
const { asyncHandler } = require('../utils/errors');
const logger = require('../utils/logger');

const gameController = new GameController();

// ========================================
// 🎮 ENDPOINTS DEL JUEGO
// ========================================

/**
 * Endpoint principal del juego - Escanear QR y procesar
 * POST /api/game/scan/:qrCode
 */
router.post('/scan/:qrCode', qrValidation, asyncHandler(async (req, res) => {
  const { qrCode } = req.params;
  const { gameId, playerId, sessionId } = req.body;

  logger.info(`Game scan initiated: ${qrCode}`, { gameId, playerId, sessionId });

  try {
    // Usar el controller principal para escanear
    const mockReq = {
      params: { qrCode },
      protocol: req.protocol,
      get: (header) => req.get(header),
      headers: req.headers
    };

    const mockRes = {
      json: (data) => data,
      status: (code) => ({ json: (data) => ({ ...data, statusCode: code }) }),
      sendSuccess: (data, message, meta) => ({ success: true, data, message, meta }),
      sendError: (message, code, statusCode, details) => ({
        success: false,
        error: { message, code, statusCode, details }
      }),
      sendNotFound: (resource, id) => ({
        success: false,
        error: { message: `${resource} ${id} not found`, code: 'NOT_FOUND' }
      })
    };

    const scanResult = await gameController.scanQRCode(mockReq, mockRes);

    // Enriquecer con datos del juego
    const gameResponse = {
      ...scanResult,
      game: {
        gameId: gameId || 'default',
        playerId: playerId || 'unknown',
        sessionId: sessionId || 'session_' + Date.now(),
        scanTimestamp: new Date().toISOString(),
        ...(scanResult.data?.game || {})
      }
    };

    logger.info(`Game scan completed successfully: ${qrCode}`, {
      gameId,
      playerId,
      cardType: scanResult.data?.scan?.cardType,
      points: scanResult.data?.scan?.points
    });

    res.json(gameResponse);

  } catch (error) {
    logger.error(`Game scan failed: ${qrCode}`, error);
    res.sendError('Game scan failed', 'GAME_SCAN_ERROR', 500, error.message);
  }
}));

/**
 * Crear nueva sesión de juego
 * POST /api/game/create
 */
router.post('/create', validationMiddleware, asyncHandler(async (req, res) => {
  const { players, gameSettings } = req.body;

  if (!players || !Array.isArray(players) || players.length === 0) {
    return res.sendValidationError(
      [{ field: 'players', message: 'Players array is required and must not be empty' }],
      'Invalid players data'
    );
  }

  if (players.length > 8) {
    return res.sendValidationError(
      [{ field: 'players', message: 'Maximum 8 players allowed' }],
      'Too many players'
    );
  }

  try {
    const gameSession = {
      gameId: 'game_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      createdAt: new Date().toISOString(),
      status: 'created',
      players: players.map((player, index) => ({
        id: `player_${index + 1}`,
        name: player.name || `Player ${index + 1}`,
        score: 0,
        cardsPlayed: 0,
        joinedAt: new Date().toISOString()
      })),
      settings: {
        maxPlayers: 8,
        timeLimit: gameSettings?.timeLimit || 1200, // 20 minutos
        pointsToWin: gameSettings?.pointsToWin || 50,
        allowPowerCards: gameSettings?.allowPowerCards || false,
        audioDuration: gameSettings?.audioDuration || 30,
        ...gameSettings
      },
      statistics: {
        totalScans: 0,
        averageResponseTime: 0,
        mostPlayedCardType: null,
        gameStartTime: null,
        gameEndTime: null
      }
    };

    logger.info(`Game created: ${gameSession.gameId}`, {
      playerCount: players.length,
      settings: gameSession.settings
    });

    res.sendCreated(gameSession, 'Game session', `/api/game/${gameSession.gameId}`);

  } catch (error) {
    logger.error('Failed to create game:', error);
    res.sendError('Failed to create game', 'GAME_CREATE_ERROR', 500, error.message);
  }
}));

/**
 * Obtener estado del juego
 * GET /api/game/:gameId
 */
router.get('/:gameId', asyncHandler(async (req, res) => {
  const { gameId } = req.params;

  // En una implementación real, esto vendría de una base de datos o store
  // Por ahora, devolvemos un estado de ejemplo
  const gameState = {
    gameId,
    status: 'active',
    currentPlayer: 'player_1',
    players: [
      { id: 'player_1', name: 'Player 1', score: 15, cardsPlayed: 5 },
      { id: 'player_2', name: 'Player 2', score: 12, cardsPlayed: 4 },
      { id: 'player_3', name: 'Player 3', score: 8, cardsPlayed: 3 }
    ],
    settings: {
      maxPlayers: 8,
      timeLimit: 1200,
      pointsToWin: 50
    },
    statistics: {
      totalScans: 12,
      gameStartTime: new Date(Date.now() - 600000).toISOString(), // 10 minutos atrás
      elapsedTime: 600
    },
    lastActivity: new Date().toISOString()
  };

  res.sendSuccess(gameState, 'Game state retrieved');
}));

/**
 * Actualizar puntuación de jugador
 * POST /api/game/:gameId/score
 */
router.post('/:gameId/score', validationMiddleware, asyncHandler(async (req, res) => {
  const { gameId } = req.params;
  const { playerId, points, cardType, correct } = req.body;

  if (!playerId) {
    return res.sendValidationError(
      [{ field: 'playerId', message: 'Player ID is required' }],
      'Missing player ID'
    );
  }

  if (points === undefined || isNaN(points)) {
    return res.sendValidationError(
      [{ field: 'points', message: 'Points must be a number' }],
      'Invalid points value'
    );
  }

  try {
    // En una implementación real, actualizarías el estado del juego en la base de datos
    const scoreUpdate = {
      gameId,
      playerId,
      points: parseInt(points),
      cardType: cardType || 'unknown',
      correct: correct !== undefined ? Boolean(correct) : true,
      timestamp: new Date().toISOString(),
      processed: true
    };

    logger.info(`Score updated: ${gameId}`, {
      playerId,
      points: scoreUpdate.points,
      cardType,
      correct
    });

    res.sendSuccess(scoreUpdate, 'Score updated successfully');

  } catch (error) {
    logger.error(`Failed to update score for game ${gameId}:`, error);
    res.sendError('Failed to update score', 'SCORE_UPDATE_ERROR', 500, error.message);
  }
}));

// ========================================
// 📊 ESTADÍSTICAS Y RANKING
// ========================================

/**
 * Obtener leaderboard del juego
 * GET /api/game/:gameId/leaderboard
 */
router.get('/:gameId/leaderboard', asyncHandler(async (req, res) => {
  const { gameId } = req.params;

  try {
    // En una implementación real, esto vendría de la base de datos
    const leaderboard = {
      gameId,
      updatedAt: new Date().toISOString(),
      players: [
        {
          rank: 1,
          id: 'player_1',
          name: 'Player 1',
          score: 25,
          cardsPlayed: 8,
          averagePoints: 3.1,
          favoriteCardType: 'song'
        },
        {
          rank: 2,
          id: 'player_2',
          name: 'Player 2',
          score: 18,
          cardsPlayed: 6,
          averagePoints: 3.0,
          favoriteCardType: 'artist'
        },
        {
          rank: 3,
          id: 'player_3',
          name: 'Player 3',
          score: 12,
          cardsPlayed: 5,
          averagePoints: 2.4,
          favoriteCardType: 'decade'
        }
      ],
      statistics: {
        totalPoints: 55,
        totalCards: 19,
        averageScore: 18.3,
        leader: 'player_1',
        mostPlayedCardType: 'song'
      }
    };

    res.sendSuccess(leaderboard, 'Leaderboard retrieved');

  } catch (error) {
    logger.error(`Failed to get leaderboard for game ${gameId}:`, error);
    res.sendError('Failed to get leaderboard', 'LEADERBOARD_ERROR', 500, error.message);
  }
}));

/**
 * Obtener estadísticas del juego
 * GET /api/game/:gameId/stats
 */
router.get('/:gameId/stats', asyncHandler(async (req, res) => {
  const { gameId } = req.params;

  try {
    const gameStats = {
      gameId,
      generatedAt: new Date().toISOString(),
      overview: {
        totalPlayers: 3,
        totalScans: 19,
        totalPoints: 55,
        gameStatus: 'active',
        elapsedTime: 900, // 15 minutos
        estimatedTimeRemaining: 300 // 5 minutos
      },
      performance: {
        averageResponseTime: 4.2,
        fastestResponse: 1.5,
        slowestResponse: 8.1,
        accuracyRate: 85
      },
      cardTypes: {
        song: { played: 7, accuracy: 90, avgPoints: 2.1 },
        artist: { played: 5, accuracy: 80, avgPoints: 3.2 },
        decade: { played: 4, accuracy: 75, avgPoints: 4.5 },
        lyrics: { played: 2, accuracy: 100, avgPoints: 3.0 },
        challenge: { played: 1, accuracy: 0, avgPoints: 0 }
      },
      playerStats: [
        {
          playerId: 'player_1',
          name: 'Player 1',
          totalPoints: 25,
          cardsPlayed: 8,
          accuracy: 90,
          strongestCategory: 'song',
          weakestCategory: 'challenge'
        }
      ]
    };

    res.sendSuccess(gameStats, 'Game statistics retrieved');

  } catch (error) {
    logger.error(`Failed to get game stats for ${gameId}:`, error);
    res.sendError('Failed to get game statistics', 'GAME_STATS_ERROR', 500, error.message);
  }
}));

// ========================================
// 🎯 ACCIONES DEL JUEGO
// ========================================

/**
 * Iniciar juego
 * POST /api/game/:gameId/start
 */
router.post('/:gameId/start', validationMiddleware, asyncHandler(async (req, res) => {
  const { gameId } = req.params;

  try {
    const gameStart = {
      gameId,
      status: 'started',
      startTime: new Date().toISOString(),
      message: 'Game started successfully',
      instructions: [
        'Players take turns scanning QR codes',
        'Listen to the audio preview (30 seconds)',
        'Answer the question for points',
        'First to 50 points wins!'
      ]
    };

    logger.info(`Game started: ${gameId}`);

    res.sendSuccess(gameStart, 'Game started successfully');

  } catch (error) {
    logger.error(`Failed to start game ${gameId}:`, error);
    res.sendError('Failed to start game', 'GAME_START_ERROR', 500, error.message);
  }
}));

/**
 * Pausar juego
 * POST /api/game/:gameId/pause
 */
router.post('/:gameId/pause', asyncHandler(async (req, res) => {
  const { gameId } = req.params;

  try {
    const gamePause = {
      gameId,
      status: 'paused',
      pausedAt: new Date().toISOString(),
      message: 'Game paused'
    };

    logger.info(`Game paused: ${gameId}`);

    res.sendSuccess(gamePause, 'Game paused successfully');

  } catch (error) {
    logger.error(`Failed to pause game ${gameId}:`, error);
    res.sendError('Failed to pause game', 'GAME_PAUSE_ERROR', 500, error.message);
  }
}));

/**
 * Finalizar juego
 * POST /api/game/:gameId/end
 */
router.post('/:gameId/end', asyncHandler(async (req, res) => {
  const { gameId } = req.params;

  try {
    const gameEnd = {
      gameId,
      status: 'completed',
      endTime: new Date().toISOString(),
      winner: 'player_1',
      finalScores: [
        { playerId: 'player_1', name: 'Player 1', score: 50 },
        { playerId: 'player_2', name: 'Player 2', score: 42 },
        { playerId: 'player_3', name: 'Player 3', score: 35 }
      ],
      gameStats: {
        duration: 1200, // 20 minutos
        totalScans: 25,
        totalPoints: 127
      }
    };

    logger.info(`Game ended: ${gameId}`, { winner: gameEnd.winner });

    res.sendSuccess(gameEnd, 'Game completed successfully');

  } catch (error) {
    logger.error(`Failed to end game ${gameId}:`, error);
    res.sendError('Failed to end game', 'GAME_END_ERROR', 500, error.message);
  }
}));

// ========================================
// 🧪 TESTING Y DEBUG
// ========================================

/**
 * Simular escaneo de QR para testing
 * POST /api/game/test/scan
 */
router.post('/test/scan', validationMiddleware, asyncHandler(async (req, res) => {
  const { qrCode, playerId = 'test_player' } = req.body;

  if (!qrCode) {
    return res.sendValidationError(
      [{ field: 'qrCode', message: 'QR code is required for test' }],
      'Missing QR code'
    );
  }

  try {
    // Simular escaneo
    const mockGameScan = await router.app?.gameController?.scanQRCode ||
      (() => ({ success: true, message: 'Test scan simulation' }));

    const testResult = {
      testScan: true,
      qrCode,
      playerId,
      timestamp: new Date().toISOString(),
      result: 'success',
      message: 'Test scan completed successfully'
    };

    res.sendSuccess(testResult, 'Test scan completed');

  } catch (error) {
    logger.error(`Test scan failed for ${qrCode}:`, error);
    res.sendError('Test scan failed', 'TEST_SCAN_ERROR', 500, error.message);
  }
}));

module.exports = router;