
const { QRError, ValidationError } = require('../utils/errors');
const logger = require('../utils/logger');

class QRService {
  constructor() {
    this.QR_PREFIX = 'HITBACK';
    this.VALID_CARD_TYPES = ['song', 'artist', 'decade', 'lyrics', 'challenge'];
    this.VALID_DIFFICULTIES = ['easy', 'medium', 'hard', 'expert'];
  }

  /**
   * Valida el formato del código QR
   * @param {string} qrCode - Código QR a validar
   * @returns {boolean} - True si es válido
   */
  validateQRFormat(qrCode) {
    if (!qrCode || typeof qrCode !== 'string') {
      return false;
    }

    const parts = qrCode.split('_');

    // Debe tener exactamente 4 partes: HITBACK_ID_TYPE_DIFFICULTY
    if (parts.length !== 4) {
      return false;
    }

    const [prefix, trackId, cardType, difficulty] = parts;

    // Validar cada parte
    return (
      prefix === this.QR_PREFIX &&
      this.isValidTrackId(trackId) &&
      this.isValidCardType(cardType.toLowerCase()) &&
      this.isValidDifficulty(difficulty.toLowerCase())
    );
  }

  /**
   * Parsea un código QR y extrae sus componentes
   * @param {string} qrCode - Código QR a parsear
   * @returns {Object} - Datos extraídos del QR
   * @throws {QRError} - Si el formato es inválido
   */
  parseQRCode(qrCode) {
    logger.debug(`Parsing QR code: ${qrCode}`);

    if (!this.validateQRFormat(qrCode)) {
      throw new QRError(`Invalid QR code format: ${qrCode}`);
    }

    const [prefix, trackId, cardType, difficulty] = qrCode.split('_');

    const parsedData = {
      qrCode,
      trackId,
      cardType: cardType.toLowerCase(),
      difficulty: difficulty.toLowerCase(),
      points: this.calculateBasePoints(cardType.toLowerCase(), difficulty.toLowerCase())
    };

    logger.debug(`QR parsed successfully:`, parsedData);
    return parsedData;
  }

  /**
   * Genera códigos QR para un track específico
   * @param {string} trackId - ID del track
   * @returns {Array} - Array de códigos QR generados
   */
  generateQRCodesForTrack(trackId) {
    if (!this.isValidTrackId(trackId)) {
      throw new ValidationError(`Invalid track ID: ${trackId}`);
    }

    const qrCodes = [];

    this.VALID_CARD_TYPES.forEach(cardType => {
      this.VALID_DIFFICULTIES.forEach(difficulty => {
        const qrCode = this.buildQRCode(trackId, cardType, difficulty);
        qrCodes.push({
          qrCode,
          trackId,
          cardType,
          difficulty,
          points: this.calculateBasePoints(cardType, difficulty)
        });
      });
    });

    logger.info(`Generated ${qrCodes.length} QR codes for track ${trackId}`);
    return qrCodes;
  }

  /**
   * Genera todos los códigos QR posibles para múltiples tracks
   * @param {Array} trackIds - Array de IDs de tracks
   * @returns {Array} - Array de todos los códigos QR
   */
  generateAllQRCodes(trackIds) {
    if (!Array.isArray(trackIds)) {
      throw new ValidationError('trackIds must be an array');
    }

    const allQRCodes = [];

    trackIds.forEach(trackId => {
      try {
        const trackQRs = this.generateQRCodesForTrack(trackId);
        allQRCodes.push(...trackQRs);
      } catch (error) {
        logger.warn(`Failed to generate QR codes for track ${trackId}:`, error.message);
      }
    });

    logger.info(`Generated ${allQRCodes.length} total QR codes for ${trackIds.length} tracks`);
    return allQRCodes;
  }

  /**
   * Construye un código QR con los componentes dados
   * @param {string} trackId - ID del track
   * @param {string} cardType - Tipo de carta
   * @param {string} difficulty - Dificultad
   * @returns {string} - Código QR construido
   */
  buildQRCode(trackId, cardType, difficulty) {
    return `${this.QR_PREFIX}_${trackId}_${cardType.toUpperCase()}_${difficulty.toUpperCase()}`;
  }

  /**
   * Calcula puntos base según el tipo de carta y dificultad
   * @param {string} cardType - Tipo de carta
   * @param {string} difficulty - Dificultad
   * @returns {number} - Puntos calculados
   */
  calculateBasePoints(cardType, difficulty) {
    const basePoints = {
      song: 1,
      artist: 2,
      decade: 3,
      lyrics: 3,
      challenge: 5
    };

    const multipliers = {
      easy: 1,
      medium: 1.5,
      hard: 2,
      expert: 3
    };

    const base = basePoints[cardType] || 1;
    const multiplier = multipliers[difficulty] || 1;

    return Math.round(base * multiplier);
  }

  /**
   * Valida si un ID de track es válido
   * @param {string} trackId - ID a validar
   * @returns {boolean} - True si es válido
   */
  isValidTrackId(trackId) {
    return /^[a-zA-Z0-9]{3,10}$/.test(trackId);
  }

  /**
   * Valida si un tipo de carta es válido
   * @param {string} cardType - Tipo de carta a validar
   * @returns {boolean} - True si es válido
   */
  isValidCardType(cardType) {
    return this.VALID_CARD_TYPES.includes(cardType.toLowerCase());
  }

  /**
   * Valida si una dificultad es válida
   * @param {string} difficulty - Dificultad a validar
   * @returns {boolean} - True si es válida
   */
  isValidDifficulty(difficulty) {
    return this.VALID_DIFFICULTIES.includes(difficulty.toLowerCase());
  }

  /**
   * Obtiene estadísticas de códigos QR
   * @param {Array} qrCodes - Array de códigos QR
   * @returns {Object} - Estadísticas
   */
  getQRStats(qrCodes) {
    if (!Array.isArray(qrCodes)) {
      return {};
    }

    const stats = {
      total: qrCodes.length,
      byCardType: {},
      byDifficulty: {},
      totalPoints: 0
    };

    qrCodes.forEach(qr => {
      // Por tipo de carta
      stats.byCardType[qr.cardType] = (stats.byCardType[qr.cardType] || 0) + 1;

      // Por dificultad
      stats.byDifficulty[qr.difficulty] = (stats.byDifficulty[qr.difficulty] || 0) + 1;

      // Total de puntos
      stats.totalPoints += qr.points || 0;
    });

    return stats;
  }

  /**
   * Busca códigos QR por criterios
   * @param {Array} qrCodes - Array de códigos QR
   * @param {Object} filters - Filtros de búsqueda
   * @returns {Array} - Códigos QR filtrados
   */
  filterQRCodes(qrCodes, filters = {}) {
    if (!Array.isArray(qrCodes)) {
      return [];
    }

    return qrCodes.filter(qr => {
      const matchesTrackId = !filters.trackId || qr.trackId === filters.trackId;
      const matchesCardType = !filters.cardType || qr.cardType === filters.cardType;
      const matchesDifficulty = !filters.difficulty || qr.difficulty === filters.difficulty;
      const matchesMinPoints = !filters.minPoints || qr.points >= filters.minPoints;

      return matchesTrackId && matchesCardType && matchesDifficulty && matchesMinPoints;
    });
  }
}

module.exports = QRService;