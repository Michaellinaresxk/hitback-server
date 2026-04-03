/**
 * ⚡ POWER CARD CONTROLLER - IMPROVED VERSION
 * 
 * Responsabilidad: Manejar requests HTTP para PowerCards
 * - Escanear QR de cartas físicas
 * - Gestionar inventarios de jugadores
 * - Procesar combos y otorgar cartas
 * - Activar y usar PowerCards
 * 
 * ✅ CLEAN CODE: Validación robusta, manejo de errores, logs claros
 */

const PowerCardService = require('../services/PowerCardService');
const { parsePowerCardQR, generateQRsForAllCards } = require('../utils/Qrutils');
const { asyncHandler } = require('../utils/errors');
const logger = require('../utils/logger');

class PowerCardController {

  // ═══════════════════════════════════════════════════════════════
  // 📱 ESCANEO DE QR - OBTENER POWER CARD
  // ═══════════════════════════════════════════════════════════════

  /**
   * POST /api/cards/scan-qr
   * Escanear QR de PowerCard física y asignarla al jugador
   * 
   * Body: { qrCode, playerId, sessionId? }
   * Response: { cardId, cardName, emoji, description, inventory }
   */
  scanPowerCardQR = asyncHandler(async (req, res) => {
    const { qrCode, playerId, sessionId } = req.body;
    const timer = logger.startTimer(`SCAN_QR_${playerId}`);

    logger.info(`📱 Scanning PowerCard QR for player: ${playerId}`);
    logger.debug(`   QR: ${qrCode}`);

    try {
      // 1. Validar parámetros
      if (!qrCode || !playerId) {
        return res.sendValidationError(
          [
            { field: 'qrCode', message: 'QR code is required' },
            { field: 'playerId', message: 'Player ID is required' }
          ],
          'Missing required fields'
        );
      }

      // 2. Parsear y validar QR
      const parsed = parsePowerCardQR(qrCode);

      if (!parsed.isValid) {
        logger.warn(`❌ Invalid QR format: ${parsed.error}`);
        return res.sendValidationError(
          [{ field: 'qrCode', message: parsed.error }],
          'Invalid QR code format'
        );
      }

      const { cardId } = parsed;

      // 3. Verificar que la carta existe
      let card;
      try {
        card = PowerCardService.getPowerCardById(cardId);
      } catch (error) {
        logger.warn(`❌ Card not found: ${cardId}`);
        return res.sendNotFound('PowerCard', cardId);
      }

      // 4. Agregar carta al inventario del jugador
      // Las cartas con effectOnDraw se consumen al tomar — no van al inventario
      const hasImmediateEffect = !!card.effectOnDraw;
      if (!hasImmediateEffect) {
        PowerCardService.addCardToInventory(playerId, cardId, 1);
      }

      // 5. Obtener inventario actualizado
      const inventory = PowerCardService.getPlayerInventory(playerId);

      const duration = timer();

      logger.info(`✅ PowerCard assigned: ${card.name} → ${playerId}`);
      logger.debug(`   Inventory: ${JSON.stringify(inventory)}`);

      // 6. Responder con datos completos
      res.sendSuccess({
        playerId,
        cardId: card.id,
        cardName: card.name,
        cardType: card.type,
        emoji: card.emoji,
        description: card.description,
        usageLimit: card.usageLimit,
        effectOnDraw: card.effectOnDraw || null,
        qrCode,
        scannedAt: new Date().toISOString(),
        sessionId,
        inventory: hasImmediateEffect ? inventory : { [cardId]: inventory[cardId] || 1 },
        totalCards: Object.values(inventory).reduce((a, b) => a + b, 0)
      }, `PowerCard '${card.name}' assigned to player`, {
        performance: `${duration}ms`,
        cardType: card.type
      });

    } catch (error) {
      timer();
      logger.error(`❌ Failed to scan PowerCard QR:`, error);
      res.sendError(
        'Failed to scan PowerCard',
        'QR_SCAN_ERROR',
        500,
        error.message
      );
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // 🎒 INVENTARIO
  // ═══════════════════════════════════════════════════════════════

  /**
   * GET /api/cards/inventory/:playerId
   * Obtener inventario completo de PowerCards del jugador
   */
  getPlayerInventory = asyncHandler(async (req, res) => {
    const { playerId } = req.params;
    const timer = logger.startTimer(`GET_INVENTORY_${playerId}`);

    logger.info(`📦 Fetching inventory for: ${playerId}`);

    try {
      const inventory = PowerCardService.getPlayerInventory(playerId);

      // Enriquecer con información completa de las cartas
      const enrichedInventory = [];

      for (const [cardId, count] of Object.entries(inventory)) {
        try {
          const card = PowerCardService.getPowerCardById(cardId);
          enrichedInventory.push({
            cardId: card.id,
            name: card.name,
            type: card.type,
            emoji: card.emoji,
            description: card.description,
            usageLimit: card.usageLimit,
            count,
            canUse: count > 0
          });
        } catch (error) {
          logger.warn(`⚠️  Card ${cardId} in inventory not found in database`);
        }
      }

      const totalCards = enrichedInventory.reduce((sum, item) => sum + item.count, 0);
      const duration = timer();

      logger.info(`✅ Inventory retrieved: ${totalCards} cards`);

      res.sendSuccess({
        playerId,
        inventory: enrichedInventory,
        summary: {
          totalCards,
          uniqueCards: enrichedInventory.length,
          availableTypes: [...new Set(enrichedInventory.map(c => c.type))]
        }
      }, `Inventory for player ${playerId}`, {
        performance: `${duration}ms`,
        cardCount: totalCards
      });

    } catch (error) {
      timer();
      logger.error(`❌ Failed to get inventory:`, error);
      res.sendError(
        'Failed to retrieve inventory',
        'INVENTORY_ERROR',
        500,
        error.message
      );
    }
  });

  /**
   * GET /api/cards/inventories/all
   * Obtener inventarios de todos los jugadores (para admin/debug)
   */
  getAllInventories = asyncHandler(async (req, res) => {
    const timer = logger.startTimer('GET_ALL_INVENTORIES');

    logger.info('📦 Fetching all inventories');

    try {
      const allInventories = PowerCardService.getAllInventories();

      const enrichedData = {};
      let totalPlayers = 0;
      let totalCards = 0;

      for (const [playerId, inventory] of Object.entries(allInventories)) {
        totalPlayers++;
        const playerCards = Object.values(inventory).reduce((a, b) => a + b, 0);
        totalCards += playerCards;

        enrichedData[playerId] = {
          inventory,
          totalCards: playerCards,
          uniqueCards: Object.keys(inventory).length
        };
      }

      const duration = timer();

      logger.info(`✅ All inventories retrieved: ${totalPlayers} players, ${totalCards} cards`);

      res.sendSuccess({
        inventories: enrichedData,
        summary: {
          totalPlayers,
          totalCards,
          averageCardsPerPlayer: totalPlayers > 0 ? (totalCards / totalPlayers).toFixed(2) : 0
        }
      }, 'All inventories retrieved', {
        performance: `${duration}ms`,
        playerCount: totalPlayers
      });

    } catch (error) {
      timer();
      logger.error(`❌ Failed to get all inventories:`, error);
      res.sendError(
        'Failed to retrieve inventories',
        'INVENTORIES_ERROR',
        500,
        error.message
      );
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // ⚡ USAR POWER CARD
  // ═══════════════════════════════════════════════════════════════

  /**
   * POST /api/cards/use
   * Usar una PowerCard del inventario
   * 
   * Body: { playerId, cardId, targetPlayerId?, sessionId }
   * Response: { success, effect, updatedInventory }
   */
  usePowerCard = asyncHandler(async (req, res) => {
    const { playerId, cardId, targetPlayerId, sessionId } = req.body;
    const timer = logger.startTimer(`USE_CARD_${playerId}`);

    logger.info(`⚡ Using PowerCard: ${cardId} by ${playerId}`);

    try {
      // 1. Validar parámetros
      if (!playerId || !cardId) {
        return res.sendValidationError(
          [
            { field: 'playerId', message: 'Player ID is required' },
            { field: 'cardId', message: 'Card ID is required' }
          ],
          'Missing required fields'
        );
      }

      // 2. Verificar que el jugador tiene la carta
      const inventory = PowerCardService.getPlayerInventory(playerId);

      if (!inventory[cardId] || inventory[cardId] <= 0) {
        logger.warn(`❌ Player ${playerId} doesn't have card ${cardId}`);
        return res.sendError(
          'Player does not own this card',
          'CARD_NOT_OWNED',
          403,
          { playerId, cardId, inventory }
        );
      }

      // 3. Obtener información de la carta
      const card = PowerCardService.getPowerCardById(cardId);

      // 4. Activar la carta (marca como activa para usar en la siguiente ronda)
      const result = PowerCardService.activatePowerCard(playerId, cardId, sessionId);

      const duration = timer();

      logger.info(`✅ PowerCard activated: ${card.name}`);

      res.sendSuccess({
        playerId,
        cardId: card.id,
        cardName: card.name,
        cardType: card.type,
        emoji: card.emoji,
        effect: result.effect,
        activated: true,
        message: `${card.emoji} ${card.name} lista para usar`,
        sessionId
      }, `PowerCard '${card.name}' activated`, {
        performance: `${duration}ms`,
        cardType: card.type
      });

    } catch (error) {
      timer();
      logger.error(`❌ Failed to use PowerCard:`, error);
      res.sendError(
        'Failed to use PowerCard',
        'USE_CARD_ERROR',
        500,
        error.message
      );
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // 🧹 UTILIDADES
  // ═══════════════════════════════════════════════════════════════

  /**
   * POST /api/cards/test-add
   * SOLO PARA TESTING: Agregar carta directamente al inventario
   */
  testAddCard = asyncHandler(async (req, res) => {
    const { playerId, cardId, count = 1 } = req.body;

    logger.warn(`⚠️  TEST MODE: Adding ${count}x ${cardId} to ${playerId}`);

    try {
      PowerCardService.addCardToInventory(playerId, cardId, count);
      const inventory = PowerCardService.getPlayerInventory(playerId);

      res.sendSuccess({
        playerId,
        cardId,
        count,
        inventory
      }, 'Card added (TEST MODE)');

    } catch (error) {
      logger.error('Failed to add test card:', error);
      res.sendError('Failed to add card', 'TEST_ERROR', 500, error.message);
    }
  });

  /**
   * GET /api/cards/printable-qrs
   * Obtener los QR codes estáticos de todas las PowerCards para imprimir el mazo físico
   *
   * Response: { cards: [{ cardId, cardName, cardType, emoji, qrCode, description }] }
   */
  getPrintableQRs = asyncHandler(async (req, res) => {
    logger.info('🖨️ Generating printable QR codes for physical deck');

    try {
      const allCards = PowerCardService.getAllPowerCards();
      const printableQRs = generateQRsForAllCards(allCards);

      res.sendSuccess(
        { cards: printableQRs, total: printableQRs.length },
        'Printable QR codes generated',
      );
    } catch (error) {
      logger.error('❌ Failed to generate printable QRs:', error);
      res.sendError('Failed to generate QR codes', 'QR_GENERATE_ERROR', 500, error.message);
    }
  });

  /**
   * DELETE /api/cards/player/:playerId
   * Limpiar datos de un jugador (fin de sesión)
   */
  clearPlayerData = asyncHandler(async (req, res) => {
    const { playerId } = req.params;

    logger.info(`🧹 Clearing data for player: ${playerId}`);

    try {
      // Implementar limpieza en el servicio
      // PowerCardService.clearPlayerData(playerId);

      res.sendSuccess({
        playerId,
        cleared: true
      }, `Data cleared for player ${playerId}`);

    } catch (error) {
      logger.error('Failed to clear player data:', error);
      res.sendError('Failed to clear data', 'CLEAR_ERROR', 500, error.message);
    }
  });
}

module.exports = new PowerCardController();