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

// Instancia del servicio
const gameService = new GameSessionService();

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
 *   targetScore: 15,
 *   timeLimit: 1200
 * }
 */
router.post('/session', (req, res) => {
  try {
    const config = req.body;

    console.log('📋 Creando sesión:', config);

    const result = gameService.createSession(config);

    if (result.success) {
      res.status(201).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('❌ Error creando sesión:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ═══════════════════════════════════════════════════════════
// ▶️ INICIAR JUEGO
// ═══════════════════════════════════════════════════════════

/**
 * POST /api/v2/game/session/:id/start
 * Iniciar la partida
 */
router.post('/session/:id/start', (req, res) => {
  try {
    const { id } = req.params;

    console.log(`▶️ Iniciando juego: ${id}`);

    const result = gameService.startGame(id);

    res.json(result);
  } catch (error) {
    console.error('❌ Error iniciando juego:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
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

    const result = await gameService.nextRound(id, forceQuestionType);

    res.json(result);
  } catch (error) {
    console.error('❌ Error obteniendo ronda:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
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
router.post('/session/:id/bet', (req, res) => {
  try {
    const { id } = req.params;
    const { playerId, tokens } = req.body;

    if (!playerId || tokens === undefined) {
      return res.status(400).json({
        success: false,
        error: 'playerId y tokens son requeridos'
      });
    }

    console.log(`🎰 Apuesta: sesión ${id}, jugador ${playerId}, tokens ${tokens}`);

    const result = gameService.placeBet(id, playerId, tokens);

    res.json(result);
  } catch (error) {
    console.error('❌ Error registrando apuesta:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
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
router.post('/session/:id/reveal', (req, res) => {
  try {
    const { id } = req.params;
    const { winnerId } = req.body;

    console.log(`✅ Revelando respuesta: sesión ${id}, ganador ${winnerId || 'nadie'}`);

    const result = gameService.revealAnswer(id, winnerId);

    res.json(result);
  } catch (error) {
    console.error('❌ Error revelando respuesta:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
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
      error: error.message
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
router.get('/sessions', (req, res) => {
  try {
    const sessions = gameService.getAllSessions();

    res.json({
      success: true,
      count: sessions.length,
      sessions
    });
  } catch (error) {
    console.error('❌ Error listando sesiones:', error);
    res.status(500).json({
      success: false,
      error: error.message
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
router.delete('/session/:id', (req, res) => {
  try {
    const { id } = req.params;

    console.log(`🗑️ Eliminando sesión: ${id}`);

    const result = gameService.deleteSession(id);

    res.json(result);
  } catch (error) {
    console.error('❌ Error eliminando sesión:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
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
router.post('/session/:id/power', (req, res) => {
  try {
    const { id } = req.params;
    const { playerId, cardType, targetPlayerId } = req.body;

    if (!playerId || !cardType) {
      return res.status(400).json({
        success: false,
        error: 'playerId y cardType son requeridos'
      });
    }

    console.log(`⚡ Poder: ${cardType} por ${playerId}`);

    const result = gameService.usePowerCard(id, playerId, cardType, targetPlayerId);

    res.json(result);
  } catch (error) {
    console.error('❌ Error usando poder:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ═══════════════════════════════════════════════════════════
// 🩺 HEALTH CHECK
// ═══════════════════════════════════════════════════════════

/**
 * GET /api/v2/game/health
 * Health check del servicio
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'GameSessionService',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    activeSessions: gameService.getAllSessions().length
  });
});

module.exports = router;