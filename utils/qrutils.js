/**
 * 🔍 QR CODE UTILITIES FOR POWER CARDS
 *
 * Dos formatos soportados:
 *
 * ESTÁTICO (cartas físicas impresas del mazo):
 *   HITBACK_PC_{cardId}
 *   Ej: HITBACK_PC_power_replay_001
 *
 * DINÁMICO (generado en runtime, legacy):
 *   HITBACK_PC_{cardId}_{unixTimestampMs}
 *   Ej: HITBACK_PC_power_replay_001_1706234567890
 *
 * La distinción se hace por el último segmento:
 *   - ≥ 10 dígitos numéricos → Unix timestamp ms → formato dinámico
 *   - otro valor             → parte del cardId  → formato estático
 *
 * ✅ CLEAN CODE: Funciones puras, validación robusta
 */

const logger = require('./logger');

// Un Unix timestamp en ms siempre tiene ≥ 10 dígitos (desde año 2001)
const UNIX_TIMESTAMP_MIN_DIGITS = 10;

/**
 * Generar QR estático para una PowerCard física (para imprimir en el mazo)
 *
 * @param {string} cardId - ID de la carta (ej: power_replay_001)
 * @returns {string} QR code estático
 */
function generateStaticPowerCardQR(cardId) {
  const qrCode = `HITBACK_PC_${cardId}`;
  logger.debug(`Generated static QR: ${qrCode}`);
  return qrCode;
}

/**
 * Generar QR dinámico para una PowerCard (incluye timestamp, uso interno)
 *
 * @param {string} cardId - ID de la carta (ej: power_replay_001)
 * @returns {string} QR code con timestamp
 */
function generatePowerCardQR(cardId) {
  const qrCode = `HITBACK_PC_${cardId}_${Date.now()}`;
  logger.debug(`Generated dynamic QR: ${qrCode}`);
  return qrCode;
}

/**
 * Parsear QR code de PowerCard — soporta formato estático y dinámico
 *
 * @param {string} qrCode - QR code escaneado
 * @returns {{ isValid: boolean, cardId?: string, timestamp?: number, isStatic?: boolean, error?: string }}
 */
function parsePowerCardQR(qrCode) {
  try {
    if (!qrCode || typeof qrCode !== 'string') {
      return { isValid: false, error: 'QR code is empty or invalid type' };
    }

    const trimmed = qrCode.trim();
    const parts = trimmed.split('_');

    // Mínimo: HITBACK_PC_<parte1> → 3 segmentos
    if (parts.length < 3) {
      return {
        isValid: false,
        error: `Invalid QR format. Minimum 3 segments required. Got ${parts.length}. Format: HITBACK_PC_{cardId}`,
      };
    }

    const [prefix, type, ...rest] = parts;

    if (prefix !== 'HITBACK') {
      return { isValid: false, error: `Invalid prefix. Expected 'HITBACK', got '${prefix}'` };
    }

    if (type !== 'PC') {
      return { isValid: false, error: `Invalid type. Expected 'PC', got '${type}'` };
    }

    // Detectar si el último segmento es un Unix timestamp (≥ 10 dígitos numéricos)
    const lastSegment = rest[rest.length - 1];
    const isTimestamp =
      /^\d+$/.test(lastSegment) && lastSegment.length >= UNIX_TIMESTAMP_MIN_DIGITS;

    let cardId;
    let timestamp = null;

    if (isTimestamp) {
      // Formato dinámico: cardId son todos los segmentos menos el último
      cardId = rest.slice(0, -1).join('_');
      timestamp = parseInt(lastSegment, 10);
    } else {
      // Formato estático: cardId son todos los segmentos
      cardId = rest.join('_');
    }

    if (!cardId) {
      return { isValid: false, error: 'Card ID is empty' };
    }

    logger.debug(`✅ QR parsed: cardId=${cardId}, static=${!isTimestamp}`);

    return {
      isValid: true,
      cardId,
      timestamp,
      isStatic: !isTimestamp,
      qrCode: trimmed,
    };

  } catch (error) {
    logger.error('Error parsing QR code:', error);
    return { isValid: false, error: error.message || 'Unknown parsing error' };
  }
}

/**
 * Validación rápida de formato (sin parseo completo)
 *
 * @param {string} qrCode
 * @returns {boolean}
 */
function isValidPowerCardQR(qrCode) {
  if (!qrCode || typeof qrCode !== 'string') return false;
  const parts = qrCode.trim().split('_');
  return parts.length >= 3 && parts[0] === 'HITBACK' && parts[1] === 'PC';
}

/**
 * Generar QR codes ESTÁTICOS para todas las PowerCards del sistema
 * Usar para imprimir el mazo físico
 *
 * @param {Array} powerCards - Array de PowerCards del powerCards.json
 * @returns {Array} Array de { cardId, cardName, cardType, emoji, qrCode, description }
 */
function generateQRsForAllCards(powerCards) {
  return powerCards.map((card) => ({
    cardId: card.id,
    cardName: card.name,
    cardType: card.type,
    emoji: card.emoji,
    qrCode: generateStaticPowerCardQR(card.id),
    description: card.description,
  }));
}

module.exports = {
  generateStaticPowerCardQR,
  generatePowerCardQR,
  parsePowerCardQR,
  isValidPowerCardQR,
  generateQRsForAllCards,
};