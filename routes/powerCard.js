/**
 * ⚡ POWER CARD ROUTES
 *
 * Mapeo de rutas para operaciones con power cards
 *
 * ✅ CLEAN CODE: Rutas organizadas, middleware aplicado correctamente
 */

const express = require('express');
const router = express.Router();
const powerCardController = require('../controllers/powerCardController');
const powerCardMiddleware = require('../middleware/PowercardMiddleware');

// ═══════════════════════════════════════════════════════════════
// 📤 GET - OBTENER POWER CARDS
// ═══════════════════════════════════════════════════════════════

/**
 * GET /api/power-cards
 * Obtener todas las power cards, combos y configuración
 */
router.get('/', powerCardController.getAllPowerCards);

/**
 * GET /api/power-cards/:cardId
 * Obtener una power card específica
 */
router.get(
  '/:cardId',
  powerCardMiddleware.validatePowerCardExists,
  powerCardController.getPowerCardById
);

/**
 * GET /api/power-cards/type/:type
 * Obtener power card por tipo (replay, stop, hit_steal, etc.)
 */
router.get('/type/:type', powerCardController.getPowerCardByType);

/**
 * GET /api/power-cards/random
 * Obtener una power card aleatoria
 */
router.get('/random', powerCardController.getRandomPowerCard);

// ═══════════════════════════════════════════════════════════════
// 🎮 COMBOS Y RESPUESTAS
// ═══════════════════════════════════════════════════════════════

/**
 * POST /api/combos/answer
 * Procesar respuesta del jugador y detectar combos
 * 
 * Body: { playerId, isCorrect, sessionId? }
 * Response: { comboDetected, comboType, cardAwarded, playerInventory, progressToNextCombo }
 */
router.post(
  '/combos/answer',
  powerCardMiddleware.validateAnswerPayload,
  powerCardMiddleware.enrichSessionContext,
  powerCardController.processAnswer
);

/**
 * GET /api/combos/:playerId
 * Obtener estado del combo de un jugador
 * 
 * Response: { currentStreak, isHitMaster, nextComboIn, message, canDrawCard }
 */
router.get(
  '/combos/:playerId',
  powerCardController.getComboStatus
);

// ═══════════════════════════════════════════════════════════════
// 🎒 INVENTARIO
// ═══════════════════════════════════════════════════════════════

/**
 * GET /api/inventories/:playerId
 * Obtener inventario de cartas del jugador
 */
router.get(
  '/inventories/:playerId',
  powerCardController.getPlayerInventory
);

/**
 * GET /api/inventories/all
 * Obtener inventarios de todos los jugadores (admin)
 */
router.get(
  '/inventories/all',
  powerCardController.getAllInventories
);

/**
 * POST /api/inventories/add
 * Añadir carta al inventario (testing/admin)
 * 
 * Body: { playerId, cardId, count? }
 */
router.post(
  '/inventories/add',
  powerCardMiddleware.validateActivateCardPayload,
  powerCardController.addCardToInventory
);

// ═══════════════════════════════════════════════════════════════
// ⚡ ACTIVAR Y USAR CARTAS
// ═══════════════════════════════════════════════════════════════

/**
 * POST /api/cards/activate
 * Activar una power card antes de responder
 * El Game Master escanea el QR y confirma que el jugador la activará
 * 
 * Body: { playerId, cardId, sessionId }
 * Response: { activated, cardId, type, name, effect, message }
 */
router.post(
  '/cards/activate',
  powerCardMiddleware.validateActivateCardPayload,
  powerCardMiddleware.validatePlayerHasCard,
  powerCardController.activatePowerCard
);

/**
 * POST /api/cards/apply-effect
 * Aplicar efecto de carta activa a los puntos ganados
 * Usado cuando el jugador acertó la respuesta con carta activa
 * 
 * Body: { playerId, basePoints }
 * Response: { finalPoints, multiplier, cardUsed }
 */
router.post(
  '/cards/apply-effect',
  powerCardController.applyCardEffect
);

/**
 * POST /api/cards/scan-qr
 * Procesar escaneo del QR de power card física
 * El Game Master escanea la carta del mazo y confirma que la toma el jugador
 * 
 * Body: { qrCode, playerId, sessionId }
 * Response: { playerId, cardId, cardName, emoji, scannedAt }
 */
router.post(
  '/cards/scan-qr',
  powerCardMiddleware.validatePowerCardQR,
  powerCardController.scanPowerCardQR
);

// ═══════════════════════════════════════════════════════════════
// 🧹 MANTENIMIENTO
// ═══════════════════════════════════════════════════════════════

/**
 * DELETE /api/power-cards/player/:playerId
 * Limpiar datos de un jugador (fin de sesión)
 */
router.delete(
  '/player/:playerId',
  powerCardController.clearPlayerData
);

/**
 * DELETE /api/power-cards/all
 * Limpiar todos los datos del sistema (admin only)
 */
router.delete(
  '/all',
  powerCardController.clearAllData
);

// ═══════════════════════════════════════════════════════════════
// ❌ ERROR HANDLER
// ═══════════════════════════════════════════════════════════════

// Aplicar error handler al final
router.use(powerCardMiddleware.powerCardErrorHandler);

module.exports = router;