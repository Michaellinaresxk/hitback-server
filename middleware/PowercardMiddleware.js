/**
 * ⚡ POWER CARD MIDDLEWARE
 * 
 * Responsabilidad: Validar y preparar datos de power cards para controladores
 * - Validar IDs de cartas
 * - Verificar permisos del jugador
 * - Preparar contexto de sesión
 * - Manejo de errores específicos
 * 
 * ✅ CLEAN CODE: Separation of concerns, manejo centralizado de validación
 */

const PowerCardService = require('../services/PowerCardService');
const logger = require('../utils/logger');

/**
 * Middleware: Validar que existe una power card
 */
const validatePowerCardExists = (req, res, next) => {
  try {
    const { cardId } = req.params || req.body;

    if (!cardId) {
      return res.sendValidationError(
        [{ field: 'cardId', message: 'Card ID is required' }],
        'Missing card ID'
      );
    }

    // Verificar que la carta existe
    try {
      const card = PowerCardService.getPowerCardById(cardId);
      req.card = card;
      next();
    } catch (error) {
      return res.sendNotFound('PowerCard', cardId);
    }

  } catch (error) {
    logger.error('Error in validatePowerCardExists:', error);
    res.sendError(
      'Validation error',
      'VALIDATION_ERROR',
      500,
      error.message
    );
  }
};

/**
 * Middleware: Validar que el jugador tiene la carta en su inventario
 */
const validatePlayerHasCard = (req, res, next) => {
  try {
    const { playerId, cardId } = req.params || req.body;

    if (!playerId || !cardId) {
      return res.sendValidationError(
        [
          { field: 'playerId', message: 'Player ID is required' },
          { field: 'cardId', message: 'Card ID is required' }
        ],
        'Missing required fields'
      );
    }

    // Obtener inventario del jugador
    const inventory = PowerCardService.getPlayerInventory(playerId);

    if (!inventory || !inventory[cardId] || inventory[cardId] <= 0) {
      return res.sendError(
        'Player does not have this card',
        'CARD_NOT_OWNED',
        403,
        { playerId, cardId, inventory }
      );
    }

    req.playerInventory = inventory;
    next();

  } catch (error) {
    logger.error('Error in validatePlayerHasCard:', error);
    res.sendError(
      'Validation error',
      'VALIDATION_ERROR',
      500,
      error.message
    );
  }
};

/**
 * Middleware: Validar estructura de payload para activar carta
 */
const validateActivateCardPayload = (req, res, next) => {
  try {
    const { playerId, cardId, sessionId } = req.body;

    const errors = [];

    if (!playerId) errors.push({ field: 'playerId', message: 'Player ID is required' });
    if (!cardId) errors.push({ field: 'cardId', message: 'Card ID is required' });
    if (!sessionId) errors.push({ field: 'sessionId', message: 'Session ID is required' });

    if (errors.length > 0) {
      return res.sendValidationError(errors, 'Invalid payload');
    }

    // Validar formato de IDs
    if (typeof playerId !== 'string' || playerId.trim().length === 0) {
      return res.sendValidationError(
        [{ field: 'playerId', message: 'Invalid player ID format' }],
        'Invalid player ID'
      );
    }

    req.validatedData = { playerId, cardId, sessionId };
    next();

  } catch (error) {
    logger.error('Error in validateActivateCardPayload:', error);
    res.sendError(
      'Validation error',
      'VALIDATION_ERROR',
      500,
      error.message
    );
  }
};

/**
 * Middleware: Validar respuesta del jugador (para combo tracking)
 */
const validateAnswerPayload = (req, res, next) => {
  try {
    const { playerId, isCorrect } = req.body;

    const errors = [];

    if (!playerId) errors.push({ field: 'playerId', message: 'Player ID is required' });
    if (isCorrect === undefined || isCorrect === null) {
      errors.push({ field: 'isCorrect', message: 'isCorrect flag is required' });
    }

    if (errors.length > 0) {
      return res.sendValidationError(errors, 'Invalid answer payload');
    }

    // Validar que isCorrect es booleano
    if (typeof isCorrect !== 'boolean') {
      return res.sendValidationError(
        [{ field: 'isCorrect', message: 'isCorrect must be a boolean' }],
        'Invalid isCorrect value'
      );
    }

    req.validatedAnswer = { playerId, isCorrect };
    next();

  } catch (error) {
    logger.error('Error in validateAnswerPayload:', error);
    res.sendError(
      'Validation error',
      'VALIDATION_ERROR',
      500,
      error.message
    );
  }
};

/**
 * Middleware: Enriquecer contexto con datos de sesión
 */
const enrichSessionContext = (req, res, next) => {
  try {
    const { sessionId } = req.params || req.query || req.body;

    if (sessionId) {
      req.context = {
        sessionId,
        timestamp: new Date().toISOString(),
        endpoint: req.originalUrl,
        method: req.method
      };
    }

    next();

  } catch (error) {
    logger.error('Error in enrichSessionContext:', error);
    next(); // No fallar, es middleware de enriquecimiento
  }
};

/**
 * Error handler especializado para Power Cards
 */
const powerCardErrorHandler = (err, req, res, next) => {
  logger.error('Power Card Error:', err);

  // Errores específicos de cartas
  if (err.message.includes('not found')) {
    return res.sendNotFound('PowerCard', err.message);
  }

  if (err.message.includes('inventory') || err.message.includes('doesn\'t have')) {
    return res.sendError(
      'Inventory error',
      'INVENTORY_ERROR',
      403,
      err.message
    );
  }

  if (err.message.includes('activation')) {
    return res.sendError(
      'Card activation failed',
      'ACTIVATION_ERROR',
      400,
      err.message
    );
  }

  // Error genérico
  res.sendError(
    'Power Card operation failed',
    'POWER_CARD_ERROR',
    500,
    err.message
  );
};

/**
 * Middleware: Validar QR de Power Card
 * Formato esperado: HITBACK_POWERCARD_{cardId}_{playerId}_{timestamp}
 */
const validatePowerCardQR = (req, res, next) => {
  try {
    const { qrCode } = req.params || req.body;

    if (!qrCode) {
      return res.sendValidationError(
        [{ field: 'qrCode', message: 'QR code is required' }],
        'Missing QR code'
      );
    }

    // Parsear QR
    const parts = qrCode.split('_');

    if (parts.length < 4 || parts[0] !== 'HITBACK' || parts[1] !== 'POWERCARD') {
      return res.sendValidationError(
        [{ field: 'qrCode', message: 'Invalid QR code format. Expected: HITBACK_POWERCARD_cardId_playerId_timestamp' }],
        'Invalid QR format'
      );
    }

    const [, , cardId, playerId] = parts;

    // Validar que la carta existe
    try {
      PowerCardService.getPowerCardById(cardId);
    } catch (error) {
      return res.sendNotFound('PowerCard', cardId);
    }

    req.scannedCard = {
      cardId,
      playerId,
      qrCode,
      scannedAt: new Date().toISOString()
    };

    next();

  } catch (error) {
    logger.error('Error validating power card QR:', error);
    res.sendError(
      'QR validation failed',
      'QR_VALIDATION_ERROR',
      400,
      error.message
    );
  }
};

// ═══════════════════════════════════════════════════════════════
// EXPORTAR
// ═══════════════════════════════════════════════════════════════

module.exports = {
  validatePowerCardExists,
  validatePlayerHasCard,
  validateActivateCardPayload,
  validateAnswerPayload,
  enrichSessionContext,
  validatePowerCardQR,
  powerCardErrorHandler
};