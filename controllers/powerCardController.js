/**
 * ⚡ POWER CARD CONTROLLER
 * 
 * Responsabilidad: Manejar requests HTTP para operaciones con power cards
 * - Obtener cartas disponibles
 * - Gestionar inventarios
 * - Procesar respuestas y detectar combos
 * - Activar cartas con QR
 * - Aplicar efectos de cartas
 * 
 * ✅ CLEAN CODE: Métodos enfocados, manejo de errores, logs informativos
 */

const PowerCardService = require('../services/PowerCardService');
const ComboTracker = require('../services/ComboTracker');
const { asyncHandler } = require('../utils/errors');
const logger = require('../utils/logger');

class PowerCardController {

  // ═══════════════════════════════════════════════════════════════
  // 📤 OBTENER POWER CARDS
  // ═══════════════════════════════════════════════════════════════

  /**
   * GET /api/power-cards
   * Obtener todas las power cards disponibles en el juego
   */
  getAllPowerCards = asyncHandler(async (req, res) => {
    const timer = logger.startTimer('GET_ALL_POWER_CARDS');

    logger.info('Fetching all power cards');

    try {
      const powerCards = PowerCardService.getAllPowerCards();
      const combos = PowerCardService.getAllCombos();
      const thresholds = PowerCardService.getRewardThresholds();

      const duration = timer();

      res.sendSuccess({
        powerCards,
        combos,
        rewardThresholds: thresholds,
        metadata: {
          totalCards: powerCards.length,
          totalCombos: combos.length,
          timestamp: new Date().toISOString()
        }
      }, 'Power cards retrieved successfully', {
        count: powerCards.length,
        performance: `${duration}ms`
      });

    } catch (error) {
      timer();
      logger.error('Failed to get power cards:', error);
      res.sendError(
        'Failed to retrieve power cards',
        'POWER_CARDS_ERROR',
        500,
        error.message
      );
    }
  });

  /**
   * GET /api/power-cards/:cardId
   * Obtener una power card específica
   */
  getPowerCardById = asyncHandler(async (req, res) => {
    const { cardId } = req.params;
    const timer = logger.startTimer(`GET_CARD_${cardId}`);

    logger.info(`Fetching power card: ${cardId}`);

    try {
      const card = PowerCardService.getPowerCardById(cardId);
      const duration = timer();

      res.sendSuccess(card, `Power card '${card.name}' retrieved`, {
        cardType: card.type,
        performance: `${duration}ms`
      });

    } catch (error) {
      timer();
      logger.error(`Failed to get power card ${cardId}:`, error);
      res.sendNotFound('PowerCard', cardId);
    }
  });

  /**
   * GET /api/power-cards/type/:type
   * Obtener power card por tipo
   */
  getPowerCardByType = asyncHandler(async (req, res) => {
    const { type } = req.params;
    const timer = logger.startTimer(`GET_CARD_TYPE_${type}`);

    logger.info(`Fetching power card by type: ${type}`);

    try {
      const card = PowerCardService.getPowerCardByType(type);
      const duration = timer();

      res.sendSuccess(card, `Power card type '${type}' retrieved`, {
        performance: `${duration}ms`
      });

    } catch (error) {
      timer();
      logger.error(`Failed to get power card type ${type}:`, error);
      res.sendError(
        `Power card type not found: ${type}`,
        'CARD_TYPE_NOT_FOUND',
        404,
        error.message
      );
    }
  });

  /**
   * GET /api/power-cards/random
   * Obtener una power card aleatoria
   */
  getRandomPowerCard = asyncHandler(async (req, res) => {
    const timer = logger.startTimer('GET_RANDOM_CARD');

    logger.info('Fetching random power card');

    try {
      const card = PowerCardService.getRandomPowerCard();
      const duration = timer();

      res.sendSuccess(card, `Random power card generated: ${card.name}`, {
        cardType: card.type,
        performance: `${duration}ms`
      });

    } catch (error) {
      timer();
      logger.error('Failed to get random power card:', error);
      res.sendError(
        'Failed to get random power card',
        'RANDOM_CARD_ERROR',
        500,
        error.message
      );
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // 🎮 PROCESAR RESPUESTAS Y COMBOS
  // ═══════════════════════════════════════════════════════════════

  /**
   * POST /api/power-cards/answer
   * Procesar respuesta del jugador y detectar combos
   * 
   * Body: { playerId, isCorrect, sessionId? }
   */
  processAnswer = asyncHandler(async (req, res) => {
    const { playerId, isCorrect, sessionId } = req.body;
    const timer = logger.startTimer(`PROCESS_ANSWER_${playerId}`);

    logger.info(`Processing answer for ${playerId}: ${isCorrect ? 'CORRECT' : 'WRONG'}`);

    try {
      const result = PowerCardService.processPlayerAnswer(
        playerId,
        isCorrect,
        { sessionId }
      );

      const duration = timer();

      logger.info(`Answer processed - Combo detected: ${result.comboDetected}`);

      res.sendSuccess(result, 'Answer processed successfully', {
        comboDetected: result.comboDetected,
        comboType: result.comboType,
        streak: result.currentStreak,
        performance: `${duration}ms`
      });

    } catch (error) {
      timer();
      logger.error(`Failed to process answer for ${playerId}:`, error);
      res.sendError(
        'Failed to process answer',
        'ANSWER_PROCESSING_ERROR',
        500,
        error.message
      );
    }
  });

  /**
   * GET /api/power-cards/combo/:playerId
   * Obtener estado actual del combo de un jugador
   */
  getComboStatus = asyncHandler(async (req, res) => {
    const { playerId } = req.params;
    const timer = logger.startTimer(`GET_COMBO_STATUS_${playerId}`);

    logger.info(`Getting combo status for ${playerId}`);

    try {
      const status = PowerCardService.getComboStatus(playerId);
      const duration = timer();

      res.sendSuccess(status, `Combo status for ${playerId}`, {
        currentStreak: status.currentStreak,
        isHitMaster: status.isHitMaster,
        performance: `${duration}ms`
      });

    } catch (error) {
      timer();
      logger.error(`Failed to get combo status for ${playerId}:`, error);
      res.sendError(
        'Failed to get combo status',
        'COMBO_STATUS_ERROR',
        500,
        error.message
      );
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // 🎒 INVENTARIO
  // ═══════════════════════════════════════════════════════════════

  /**
   * GET /api/power-cards/inventory/:playerId
   * Obtener inventario de cartas del jugador
   */
  getPlayerInventory = asyncHandler(async (req, res) => {
    const { playerId } = req.params;
    const timer = logger.startTimer(`GET_INVENTORY_${playerId}`);

    logger.info(`Fetching inventory for ${playerId}`);

    try {
      const inventory = PowerCardService.getPlayerInventory(playerId);

      // Enriquecer con información de las cartas
      const enrichedInventory = {};
      for (const [cardId, count] of Object.entries(inventory)) {
        try {
          const card = PowerCardService.getPowerCardById(cardId);
          enrichedInventory[cardId] = {
            count,
            name: card.name,
            type: card.type,
            emoji: card.emoji,
            description: card.description
          };
        } catch (error) {
          // Si la carta no existe, registrar pero continuar
          logger.warn(`Card ${cardId} in inventory no longer exists`);
        }
      }

      const duration = timer();

      res.sendSuccess({
        playerId,
        inventory: enrichedInventory,
        totalCards: Object.values(inventory).reduce((a, b) => a + b, 0)
      }, `Inventory for ${playerId}`, {
        cardTypes: Object.keys(enrichedInventory).length,
        performance: `${duration}ms`
      });

    } catch (error) {
      timer();
      logger.error(`Failed to get inventory for ${playerId}:`, error);
      res.sendError(
        'Failed to get inventory',
        'INVENTORY_ERROR',
        500,
        error.message
      );
    }
  });

  /**
   * GET /api/power-cards/inventories/all
   * Obtener inventarios de todos los jugadores (admin)
   */
  getAllInventories = asyncHandler(async (req, res) => {
    const timer = logger.startTimer('GET_ALL_INVENTORIES');

    logger.info('Fetching all inventories');

    try {
      const allInventories = PowerCardService.getAllInventories();
      const duration = timer();

      res.sendSuccess(allInventories, 'All inventories retrieved', {
        players: Object.keys(allInventories).length,
        performance: `${duration}ms`
      });

    } catch (error) {
      timer();
      logger.error('Failed to get all inventories:', error);
      res.sendError(
        'Failed to get all inventories',
        'INVENTORIES_ERROR',
        500,
        error.message
      );
    }
  });

  /**
   * POST /api/power-cards/inventory/add
   * Añadir carta al inventario (admin/testing)
   * 
   * Body: { playerId, cardId, count? }
   */
  addCardToInventory = asyncHandler(async (req, res) => {
    const { playerId, cardId, count = 1 } = req.body;
    const timer = logger.startTimer(`ADD_CARD_${playerId}`);

    logger.info(`Adding ${count}x ${cardId} to ${playerId} inventory`);

    try {
      // Validar carta
      PowerCardService.getPowerCardById(cardId);

      PowerCardService.addCardToInventory(playerId, cardId, count);
      const updatedInventory = PowerCardService.getPlayerInventory(playerId);

      const duration = timer();

      res.sendSuccess({
        playerId,
        cardId,
        addedCount: count,
        updatedInventory
      }, `Card added to ${playerId} inventory`, {
        performance: `${duration}ms`
      });

    } catch (error) {
      timer();
      logger.error(`Failed to add card to inventory:`, error);
      res.sendError(
        'Failed to add card to inventory',
        'ADD_CARD_ERROR',
        500,
        error.message
      );
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // ⚡ ACTIVAR Y USAR CARTAS
  // ═══════════════════════════════════════════════════════════════

  /**
   * POST /api/power-cards/activate
   * Activar una power card antes de responder
   * 
   * Body: { playerId, cardId, sessionId }
   */
  activatePowerCard = asyncHandler(async (req, res) => {
    const { playerId, cardId, sessionId } = req.body;
    const timer = logger.startTimer(`ACTIVATE_CARD_${playerId}_${cardId}`);

    logger.info(`Activating card ${cardId} for ${playerId}`);

    try {
      const result = PowerCardService.activatePowerCard(playerId, cardId, sessionId);

      if (!result.success) {
        const duration = timer();
        return res.sendError(
          result.error,
          'ACTIVATION_FAILED',
          400,
          { playerId, cardId }
        );
      }

      const duration = timer();

      res.sendSuccess(result, `Power card activated for ${playerId}`, {
        cardType: result.type,
        performance: `${duration}ms`
      });

    } catch (error) {
      timer();
      logger.error(`Failed to activate card:`, error);
      res.sendError(
        'Failed to activate power card',
        'ACTIVATION_ERROR',
        500,
        error.message
      );
    }
  });

  /**
   * POST /api/power-cards/apply-effect
   * Aplicar efecto de carta activa a puntos
   * 
   * Body: { playerId, basePoints }
   */
  applyCardEffect = asyncHandler(async (req, res) => {
    const { playerId, basePoints } = req.body;
    const timer = logger.startTimer(`APPLY_EFFECT_${playerId}`);

    logger.info(`Applying card effect for ${playerId}`);

    try {
      if (typeof basePoints !== 'number' || basePoints < 0) {
        return res.sendValidationError(
          [{ field: 'basePoints', message: 'basePoints must be a positive number' }],
          'Invalid basePoints'
        );
      }

      const result = PowerCardService.applyActiveCardEffect(playerId, basePoints);
      PowerCardService.clearActiveCards(playerId);

      const duration = timer();

      res.sendSuccess(result, 'Card effect applied', {
        multiplier: result.multiplier,
        basePoints,
        finalPoints: result.finalPoints,
        cardUsed: result.cardUsed?.name || 'none',
        performance: `${duration}ms`
      });

    } catch (error) {
      timer();
      logger.error(`Failed to apply card effect:`, error);
      res.sendError(
        'Failed to apply card effect',
        'EFFECT_ERROR',
        500,
        error.message
      );
    }
  });

  /**
   * POST /api/power-cards/scan-qr
   * Procesar escaneo de QR de power card
   * Usado por el Game Master para confirmar la carta tomada
   * 
   * Body: { qrCode, playerId, sessionId }
   */
  scanPowerCardQR = asyncHandler(async (req, res) => {
    const { qrCode, playerId, sessionId } = req.body;
    const timer = logger.startTimer(`SCAN_QR_${playerId}`);

    logger.info(`Scanning power card QR: ${qrCode}`);

    try {
      // Parsear QR
      const parts = qrCode.split('_');
      if (parts.length < 4 || parts[0] !== 'HITBACK' || parts[1] !== 'POWERCARD') {
        return res.sendValidationError(
          [{ field: 'qrCode', message: 'Invalid QR code format' }],
          'Invalid QR format'
        );
      }

      const [, , cardId] = parts;

      // Validar que la carta existe
      const card = PowerCardService.getPowerCardById(cardId);

      // Registrar que el jugador obtuvo la carta
      PowerCardService.addCardToInventory(playerId, cardId, 1);

      const duration = timer();

      logger.info(`Power card ${cardId} assigned to ${playerId}`);

      res.sendSuccess({
        playerId,
        cardId,
        cardName: card.name,
        cardType: card.type,
        emoji: card.emoji,
        description: card.description,
        qrCode,
        scannedAt: new Date().toISOString(),
        sessionId
      }, `Power card scanned and assigned`, {
        performance: `${duration}ms`
      });

    } catch (error) {
      timer();
      logger.error(`Failed to scan power card QR:`, error);
      res.sendError(
        'Failed to scan power card',
        'QR_SCAN_ERROR',
        500,
        error.message
      );
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // 🧹 MANTENIMIENTO
  // ═══════════════════════════════════════════════════════════════

  /**
   * DELETE /api/power-cards/player/:playerId
   * Limpiar datos de un jugador
   */
  clearPlayerData = asyncHandler(async (req, res) => {
    const { playerId } = req.params;
    const timer = logger.startTimer(`CLEAR_PLAYER_${playerId}`);

    logger.info(`Clearing data for ${playerId}`);

    try {
      PowerCardService.clearPlayerData(playerId);
      const duration = timer();

      res.sendSuccess({
        playerId,
        cleared: true,
        timestamp: new Date().toISOString()
      }, `Data cleared for ${playerId}`, {
        performance: `${duration}ms`
      });

    } catch (error) {
      timer();
      logger.error(`Failed to clear player data:`, error);
      res.sendError(
        'Failed to clear player data',
        'CLEAR_ERROR',
        500,
        error.message
      );
    }
  });

  /**
   * DELETE /api/power-cards/all
   * Limpiar todos los datos (admin only)
   */
  clearAllData = asyncHandler(async (req, res) => {
    const timer = logger.startTimer('CLEAR_ALL_DATA');

    logger.warn('Clearing ALL power card data');

    try {
      PowerCardService.clearAll();
      const duration = timer();

      res.sendSuccess({
        cleared: true,
        timestamp: new Date().toISOString()
      }, 'All power card data cleared', {
        performance: `${duration}ms`
      });

    } catch (error) {
      timer();
      logger.error(`Failed to clear all data:`, error);
      res.sendError(
        'Failed to clear all data',
        'CLEAR_ALL_ERROR',
        500,
        error.message
      );
    }
  });
}

module.exports = new PowerCardController();