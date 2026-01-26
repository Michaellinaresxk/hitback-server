/**
 * 🔍 QR CODE UTILITIES FOR POWER CARDS
 * 
 * Formato estándar para PowerCards:
 * HITBACK_PC_{cardId}_{timestamp}
 * 
 * Ejemplo: HITBACK_PC_power_replay_001_1706234567890
 * 
 * ✅ CLEAN CODE: Funciones puras, validación robusta
 */

const logger = require('./logger');

/**
 * Generar QR code para una PowerCard
 * 
 * @param {string} cardId - ID de la carta (ej: power_replay_001)
 * @returns {string} QR code generado
 */
function generatePowerCardQR(cardId) {
  const timestamp = Date.now();
  const qrCode = `HITBACK_PC_${cardId}_${timestamp}`;

  logger.debug(`Generated QR: ${qrCode}`);
  return qrCode;
}

/**
 * Parsear QR code de PowerCard
 * 
 * @param {string} qrCode - QR code escaneado
 * @returns {object} { isValid, cardId, timestamp, error }
 */
function parsePowerCardQR(qrCode) {
  try {
    // Validar que no esté vacío
    if (!qrCode || typeof qrCode !== 'string') {
      return {
        isValid: false,
        error: 'QR code is empty or invalid type'
      };
    }

    // Limpiar whitespace
    qrCode = qrCode.trim();

    // Validar formato: HITBACK_PC_cardId_timestamp
    const parts = qrCode.split('_');

    if (parts.length < 4) {
      return {
        isValid: false,
        error: `Invalid QR format. Expected 4+ parts, got ${parts.length}. Format: HITBACK_PC_{cardId}_{timestamp}`
      };
    }

    const [prefix, type, ...rest] = parts;

    // Validar prefijo
    if (prefix !== 'HITBACK') {
      return {
        isValid: false,
        error: `Invalid prefix. Expected 'HITBACK', got '${prefix}'`
      };
    }

    // Validar tipo (debe ser PC = PowerCard)
    if (type !== 'PC') {
      return {
        isValid: false,
        error: `Invalid type. Expected 'PC', got '${type}'`
      };
    }

    // Extraer cardId y timestamp
    // cardId puede contener underscores (ej: power_replay_001)
    // timestamp es el último elemento
    const timestamp = rest[rest.length - 1];
    const cardId = rest.slice(0, -1).join('_');

    // Validar timestamp
    const timestampNum = parseInt(timestamp, 10);
    if (isNaN(timestampNum) || timestampNum <= 0) {
      return {
        isValid: false,
        error: `Invalid timestamp: ${timestamp}`
      };
    }

    // Validar cardId
    if (!cardId || cardId.length === 0) {
      return {
        isValid: false,
        error: 'Card ID is empty'
      };
    }

    logger.debug(`✅ QR parsed successfully: ${cardId}`);

    return {
      isValid: true,
      cardId,
      timestamp: timestampNum,
      qrCode
    };

  } catch (error) {
    logger.error('Error parsing QR code:', error);
    return {
      isValid: false,
      error: error.message || 'Unknown parsing error'
    };
  }
}

/**
 * Validar formato de QR rápidamente (sin parsear completamente)
 * 
 * @param {string} qrCode
 * @returns {boolean}
 */
function isValidPowerCardQR(qrCode) {
  if (!qrCode || typeof qrCode !== 'string') return false;

  const parts = qrCode.trim().split('_');
  return parts.length >= 4 &&
    parts[0] === 'HITBACK' &&
    parts[1] === 'PC';
}

/**
 * Generar QR codes para todas las PowerCards del sistema
 * Útil para generar las cartas físicas del juego
 * 
 * @param {Array} powerCards - Array de PowerCards
 * @returns {Array} Array de { cardId, qrCode, ... }
 */
function generateQRsForAllCards(powerCards) {
  return powerCards.map(card => ({
    cardId: card.id,
    cardName: card.name,
    cardType: card.type,
    emoji: card.emoji,
    qrCode: generatePowerCardQR(card.id),
    description: card.description
  }));
}

module.exports = {
  generatePowerCardQR,
  parsePowerCardQR,
  isValidPowerCardQR,
  generateQRsForAllCards
};