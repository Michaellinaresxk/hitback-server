/**
 * 🎮 Game Session Routes - API sin QR
 *
 * Endpoints:
 * POST   /api/v2/game/session          - Crear nueva sesión
 * POST   /api/v2/game/session/:id/start - Iniciar juego
 * POST   /api/v2/game/session/:id/round - Siguiente ronda
 * POST   /api/v2/game/session/:id/bet   - Registrar apuesta
 * POST   /api/v2/game/session/:id/reveal - Revelar respuesta
 * GET    /api/v2/game/session/:id       - Estado de la sesión
 * GET    /api/v2/game/sessions          - Listar sesiones
 * DELETE /api/v2/game/session/:id       - Eliminar sesión
 * GET    /api/v2/game/health            - Health check
 *
 * ⚠️ NOTA: Este archivo va en /routes/gameSession.js
 * ⚠️ Los servicios están en /services/
 */

const express = require('express');
const router = express.Router();

// ✅ CORREGIDO: Ruta relativa a services/
// Si este archivo está en routes/, entonces services/ está en ../services/
const GameSessionService = require('../services/GameSessionService');
const { createSessionCapabilityMiddleware } = require('../middleware/sessionCapability');

// Instancia del servicio
const gameService = new GameSessionService();
const authenticateSession = createSessionCapabilityMiddleware(gameService);
const authenticateSessionFromToken = createSessionCapabilityMiddleware(gameService, {
  tokenSelectSession: true,
});
const sessionMutationQueues = new Map();

const ensureSessionPersistence = async (req, res, next) => {
  try {
    await gameService.initialize();
    next();
  } catch (error) {
    console.error('❌ Game session persistence unavailable:', error);
    res.status(503).json({
      success: false,
      error: 'El almacenamiento de sesiones no está disponible',
    });
  }
};

router.use('/session', ensureSessionPersistence);
router.use('/sessions', ensureSessionPersistence);

async function serializeSessionMutation(sessionId, mutation) {
  const previousQueue =
    sessionMutationQueues.get(sessionId) || Promise.resolve();
  const operation = previousQueue.catch(() => undefined).then(mutation);

  sessionMutationQueues.set(sessionId, operation);
  try {
    return await operation;
  } finally {
    if (sessionMutationQueues.get(sessionId) === operation) {
      sessionMutationQueues.delete(sessionId);
    }
  }
}

async function persistMutation(sessionId, mutation) {
  return serializeSessionMutation(sessionId, async () => {
    const previous = gameService.captureSession(sessionId);
    const result = await mutation();
    if (!result?.success) return result;

    try {
      await gameService.persistSession(sessionId);
      return result;
    } catch (error) {
      gameService.restoreSession(sessionId, previous);
      error.code = 'SESSION_PERSISTENCE_FAILED';
      throw error;
    }
  });
}

function sendRouteError(res, message, error) {
  console.error(message, error);
  res.status(error.code === 'SESSION_PERSISTENCE_FAILED' ? 503 : 500).json({
    success: false,
    error:
      error.code === 'SESSION_PERSISTENCE_FAILED'
        ? 'No se pudo guardar el estado de la sesión'
        : error.message,
  });
}

// ═══════════════════════════════════════════════════════════
// 📋 CREAR SESIÓN
// ═══════════════════════════════════════════════════════════

/**
 * POST /api/v2/game/session
 * Crear nueva sesión de juego
 *
 * Body:
 * {
 *   players: ["Ana", "Bob", "Cat"],
 *   genres: ["ROCK", "POP"],
 *   decades: ["1980s", "1990s"],
 *   difficulty: "MEDIUM",
 *   targetScore: 22,
 *   timeLimit: 1200
 * }
 */
router.post('/session', async (req, res) => {
  try {
    const config = req.body;

    console.log('📋 Creando sesión:', config);

    const result = gameService.createSession(config);

    if (result.success) {
      try {
        await gameService.persistSession(result.session.id);
      } catch (error) {
        gameService.deleteSession(result.session.id);
        error.code = 'SESSION_PERSISTENCE_FAILED';
        throw error;
      }
      res.status(201).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    sendRouteError(res, '❌ Error creando sesión:', error);
  }
});

// Every operation below operates on one capability-owned session.
router.use('/session/:id', authenticateSession);

// ═══════════════════════════════════════════════════════════
// ▶️ INICIAR JUEGO
// ═══════════════════════════════════════════════════════════

/**
 * POST /api/v2/game/session/:id/start
 * Iniciar la partida
 */
router.post('/session/:id/start', async (req, res) => {
  try {
    const { id } = req.params;

    console.log(`▶️ Iniciando juego: ${id}`);

    const result = await persistMutation(id, () => gameService.startGame(id));

    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    sendRouteError(res, '❌ Error iniciando juego:', error);
  }
});

// ═══════════════════════════════════════════════════════════
// 🎵 SIGUIENTE RONDA
// ═══════════════════════════════════════════════════════════

/**
 * POST /api/v2/game/session/:id/round
 * Obtener siguiente ronda (track + pregunta)
 *
 * Body (opcional):
 * {
 *   forceQuestionType: "artist"  // Para carta SNIPER
 * }
 */
router.post('/session/:id/round', async (req, res) => {
  try {
    const { id } = req.params;
    const { forceQuestionType } = req.body || {};

    console.log(`🎵 Nueva ronda para sesión: ${id}`);

    const result = await persistMutation(id, () =>
      gameService.nextRound(id, forceQuestionType),
    );

    res.json(result);
  } catch (error) {
    sendRouteError(res, '❌ Error obteniendo ronda:', error);
  }
});

// ═══════════════════════════════════════════════════════════
// 🎰 REGISTRAR APUESTA
// ═══════════════════════════════════════════════════════════

/**
 * POST /api/v2/game/session/:id/bet
 * Registrar apuesta de un jugador
 *
 * Body:
 * {
 *   playerId: "player_1",
 *   tokens: 3
 * }
 */
router.post('/session/:id/bet', async (req, res) => {
  try {
    const { id } = req.params;
    const { playerId, tokens } = req.body;

    if (!playerId || tokens === undefined) {
      return res.status(400).json({
        success: false,
        error: 'playerId y tokens son requeridos',
      });
    }

    console.log(`🎰 Apuesta: sesión ${id}, jugador ${playerId}, tokens ${tokens}`);

    const result = await persistMutation(id, () =>
      gameService.placeBet(id, playerId, tokens),
    );

    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    sendRouteError(res, '❌ Error registrando apuesta:', error);
  }
});

// ═══════════════════════════════════════════════════════════
// ✅ REVELAR RESPUESTA
// ═══════════════════════════════════════════════════════════

/**
 * POST /api/v2/game/session/:id/reveal
 * Revelar respuesta y asignar puntos
 *
 * Body:
 * {
 *   winnerId: "player_2"  // null si nadie acertó
 * }
 */
router.post('/session/:id/reveal', async (req, res) => {
  try {
    const { id } = req.params;
    const { winnerId, scoreModifiers = {} } = req.body || {};

    console.log(`✅ Revelando respuesta: sesión ${id}, ganador ${winnerId || 'nadie'}`);

    const result = await persistMutation(id, () =>
      gameService.revealAnswer(id, winnerId, scoreModifiers),
    );

    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    sendRouteError(res, '❌ Error revelando respuesta:', error);
  }
});

// ═══════════════════════════════════════════════════════════
// 📊 ESTADO DE SESIÓN
// ═══════════════════════════════════════════════════════════

/**
 * GET /api/v2/game/session/:id
 * Obtener estado actual de la sesión
 */
router.get('/session/:id', (req, res) => {
  try {
    const { id } = req.params;

    const result = gameService.getStatus(id);

    if (!result.success) {
      return res.status(404).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error('❌ Error obteniendo estado:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ═══════════════════════════════════════════════════════════
// 📋 LISTAR SESIONES
// ═══════════════════════════════════════════════════════════

/**
 * GET /api/v2/game/sessions
 * Listar todas las sesiones activas
 */
router.get('/sessions', authenticateSessionFromToken, (req, res) => {
  try {
    const sessions = [req.authorizedSession].map((session) => ({
      id: session.id,
      status: session.status,
      players: session.players.length,
      round: session.round,
      createdAt: session.createdAt,
    }));

    res.json({
      success: true,
      count: sessions.length,
      sessions,
    });
  } catch (error) {
    console.error('❌ Error listando sesiones:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ═══════════════════════════════════════════════════════════
// 🗑️ ELIMINAR SESIÓN
// ═══════════════════════════════════════════════════════════

/**
 * DELETE /api/v2/game/session/:id
 * Eliminar una sesión
 */
router.delete('/session/:id', async (req, res) => {
  try {
    const { id } = req.params;

    console.log(`🗑️ Eliminando sesión: ${id}`);

    const result = await serializeSessionMutation(id, async () => {
      try {
        await gameService.deletePersistedSession(id);
      } catch (error) {
        error.code = 'SESSION_PERSISTENCE_FAILED';
        throw error;
      }
      return gameService.deleteSession(id);
    });

    res.json(result);
  } catch (error) {
    sendRouteError(res, '❌ Error eliminando sesión:', error);
  }
});

// ═══════════════════════════════════════════════════════════
// ⚡ CARTAS DE PODER
// ═══════════════════════════════════════════════════════════

/**
 * POST /api/v2/game/session/:id/power
 * Usar carta de poder
 *
 * Body:
 * {
 *   playerId: "player_1",
 *   cardType: "STEAL",
 *   targetPlayerId: "player_2"  // opcional
 * }
 */
router.post('/session/:id/power', async (req, res) => {
  try {
    const { id } = req.params;
    const { playerId, cardId, targetPlayerId } = req.body;

    if (!playerId || !cardId) {
      return res.status(400).json({
        success: false,
        error: 'playerId y cardId son requeridos',
      });
    }

    console.log(`⚡ Power Card: ${cardId} por ${playerId}`);

    const result = await persistMutation(id, () =>
      gameService.usePowerCard(id, playerId, cardId, targetPlayerId),
    );

    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    sendRouteError(res, '❌ Error usando poder:', error);
  }
});
/**
 * POST /api/v2/game/session/:id/double-platinum
 * Activar bonus de tile
 */
router.post('/session/:id/double-platinum', async (req, res) => {
  try {
    const result = await persistMutation(req.params.id, () =>
      gameService.activateDoublePlatinum(req.params.id),
    );
    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    sendRouteError(res, '❌ Error activando Double Platinum:', error);
  }
});

/**
 * POST /api/v2/game/session/:id/score-settlement
 * Atomically apply non-round score adjustments and return canonical players.
 */
router.post('/session/:id/score-settlement', async (req, res) => {
  try {
    const result = await persistMutation(req.params.id, () =>
      gameService.applyScoreAdjustments(
        req.params.id,
        req.body?.adjustments,
      ),
    );
    const status = result.success
      ? 200
      : result.error === 'Sesión no encontrada'
        ? 404
        : 400;
    res.status(status).json(result);
  } catch (error) {
    sendRouteError(res, '❌ Error aplicando score settlement:', error);
  }
});

// ═══════════════════════════════════════════════════════════
// 🎴 REACTION CARD — APLICAR DELTA DE PUNTOS
// ═══════════════════════════════════════════════════════════

/**
 * PATCH /api/v2/game/session/:id/players/:playerId/score
 * Aplica un delta de puntos a un jugador dentro de una sesión autenticada.
 *
 * Body:
 * {
 *   delta: -1,               // positivo o negativo
 *   reason: "MANAGEMENT_FEE" // para logging
 * }
 *
 * Response:
 * {
 *   success: true,
 *   player: { id, name, previousScore, newScore, delta, reason },
 *   players: [{ id, name, score, availableTokens }]
 * }
 */
router.patch('/session/:id/players/:playerId/score', authenticateSession, async (req, res) => {
  try {
    const { id, playerId } = req.params;
    const { delta, reason } = req.body;

    if (delta === undefined || typeof delta !== 'number') {
      return res.status(400).json({
        success: false,
        error: 'delta es requerido y debe ser un número',
      });
    }

    console.log(
      `🎴 Score delta: sesión ${id}, jugador ${playerId}, delta ${delta > 0 ? '+' : ''}${delta} (${reason})`
    );

    const result = await persistMutation(id, () =>
      gameService.applyScoreDelta(id, playerId, delta, reason),
    );

    if (!result.success) {
      return res.status(404).json(result);
    }

    res.json(result);
  } catch (error) {
    sendRouteError(res, '❌ Error aplicando score delta:', error);
  }
});

// ═══════════════════════════════════════════════════════════
// 🩺 HEALTH CHECK
// ═══════════════════════════════════════════════════════════

/**
 * GET /api/v2/game/health
 * Health check del servicio
 */
router.get('/health', async (req, res) => {
  try {
    await gameService.initialize();
    res.json({
      success: true,
      service: 'GameSessionService',
      status: 'healthy',
      persistence: 'available',
      timestamp: new Date().toISOString(),
      savedSessions: await gameService.getPersistedSessionCount(),
    });
  } catch (error) {
    console.error('❌ Game session health check failed:', error);
    res.status(503).json({
      success: false,
      service: 'GameSessionService',
      status: 'degraded',
      persistence: 'unavailable',
      timestamp: new Date().toISOString(),
    });
  }
});

module.exports = router;
module.exports.gameService = gameService;
