/**
 * 🎯 QR Service - FORMATO NUEVO ESCALABLE
 * ✅ Formato: HITBACK_TYPE:SONG_DIFF:EASY_GENRE:ROCK_DECADE:1980s
 * ✅ Compatible con formato antiguo: HITBACK_001_SONG_EASY
 */

const logger = require('../utils/logger');

// Crear error personalizado si no existe
class QRError extends Error {
  constructor(message) {
    super(message);
    this.name = 'QRError';
  }
}

class QRService {
  constructor() {
    this.QR_PREFIX = 'HITBACK';
    this.VALID_CARD_TYPES = ['song', 'artist', 'decade', 'lyrics', 'challenge'];
    this.VALID_DIFFICULTIES = ['easy', 'medium', 'hard', 'expert', 'any'];
    this.VALID_GENRES = ['rock', 'pop', 'reggaeton', 'hip_hop', 'electronic', 'r&b', 'country', 'jazz', 'any'];
    this.VALID_DECADES = ['1960s', '1970s', '1980s', '1990s', '2000s', '2010s', '2020s', 'any'];
  }

  /**
   * 🎯 PARSEAR QR CODE - SOPORTA AMBOS FORMATOS
   * @param {string} qrCode - Código QR a parsear
   * @returns {Object} - Datos parseados
   */
  parseQRCode(qrCode) {
    if (!qrCode || typeof qrCode !== 'string') {
      throw new QRError('QR code inválido o vacío');
    }

    console.log(`📱 Parseando QR: ${qrCode}`);

    // ✅ FORMATO NUEVO: HITBACK_TYPE:SONG_DIFF:EASY_GENRE:ROCK_DECADE:1980s
    const newFormatRegex = /^HITBACK_TYPE:(\w+)_DIFF:(\w+)_GENRE:(\w+)_DECADE:([\w]+)$/;
    const newMatch = qrCode.match(newFormatRegex);

    if (newMatch) {
      const [, cardType, difficulty, genre, decade] = newMatch;

      // Validar valores
      if (!this.VALID_CARD_TYPES.includes(cardType.toLowerCase())) {
        throw new QRError(`Tipo de carta inválido: ${cardType}. Válidos: ${this.VALID_CARD_TYPES.join(', ')}`);
      }
      if (!this.VALID_DIFFICULTIES.includes(difficulty.toLowerCase())) {
        throw new QRError(`Dificultad inválida: ${difficulty}. Válidas: ${this.VALID_DIFFICULTIES.join(', ')}`);
      }

      console.log(`✅ Formato NUEVO detectado: type=${cardType}, diff=${difficulty}, genre=${genre}, decade=${decade}`);

      return {
        format: 'NEW',
        qrCode,
        cardType: cardType.toLowerCase(),
        difficulty: difficulty.toLowerCase(),
        genre: genre.toUpperCase(),
        decade: decade,
        isScalable: true,
        points: this.calculateBasePoints(cardType.toLowerCase(), difficulty.toLowerCase())
      };
    }

    // ⚠️ FORMATO ANTIGUO: HITBACK_001_SONG_EASY
    const legacyRegex = /^HITBACK_(\d{3})_([A-Z]+)_([A-Z]+)$/;
    const legacyMatch = qrCode.match(legacyRegex);

    if (legacyMatch) {
      const [, trackId, cardType, difficulty] = legacyMatch;

      console.log(`⚠️ Formato ANTIGUO detectado: trackId=${trackId}, type=${cardType}, diff=${difficulty}`);

      return {
        format: 'LEGACY',
        qrCode,
        trackId,
        cardType: cardType.toLowerCase(),
        difficulty: difficulty.toLowerCase(),
        genre: 'ANY',
        decade: 'ANY',
        isScalable: false,
        points: this.calculateBasePoints(cardType.toLowerCase(), difficulty.toLowerCase())
      };
    }

    // ❌ Formato no reconocido
    throw new QRError(
      `Formato de QR no reconocido: ${qrCode}. ` +
      `Formato válido: HITBACK_TYPE:SONG_DIFF:EASY_GENRE:ROCK_DECADE:1980s`
    );
  }

  /**
   * ✅ VALIDAR FORMATO DE QR
   */
  validateQRFormat(qrCode) {
    try {
      this.parseQRCode(qrCode);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 🔢 CALCULAR PUNTOS BASE
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
      expert: 3,
      any: 1
    };

    const base = basePoints[cardType] || 1;
    const multiplier = multipliers[difficulty] || 1;

    return Math.round(base * multiplier);
  }

  /**
   * 🏗️ GENERAR QR CODE (formato nuevo)
   */
  generateQRCode(options = {}) {
    const {
      cardType = 'SONG',
      difficulty = 'EASY',
      genre = 'ANY',
      decade = 'ANY'
    } = options;

    return `HITBACK_TYPE:${cardType.toUpperCase()}_DIFF:${difficulty.toUpperCase()}_GENRE:${genre.toUpperCase()}_DECADE:${decade}`;
  }

  /**
   * 📋 GENERAR TODOS LOS QR CODES PARA UN TRACK (formato antiguo - compatibilidad)
   */
  generateQRCodesForTrack(trackId) {
    const qrCodes = [];

    this.VALID_CARD_TYPES.forEach(cardType => {
      ['easy', 'medium', 'hard', 'expert'].forEach(difficulty => {
        qrCodes.push({
          qrCode: `HITBACK_${trackId}_${cardType.toUpperCase()}_${difficulty.toUpperCase()}`,
          trackId,
          cardType,
          difficulty,
          points: this.calculateBasePoints(cardType, difficulty)
        });
      });
    });

    return qrCodes;
  }

  /**
   * 📊 OBTENER ESTADÍSTICAS
   */
  getQRStats(qrCodes) {
    if (!Array.isArray(qrCodes)) return {};

    const stats = {
      total: qrCodes.length,
      byCardType: {},
      byDifficulty: {},
      totalPoints: 0
    };

    qrCodes.forEach(qr => {
      stats.byCardType[qr.cardType] = (stats.byCardType[qr.cardType] || 0) + 1;
      stats.byDifficulty[qr.difficulty] = (stats.byDifficulty[qr.difficulty] || 0) + 1;
      stats.totalPoints += qr.points || 0;
    });

    return stats;
  }

  /**
   * 📋 INFO DE AYUDA PARA ERRORES
   */
  getHelpInfo() {
    return {
      newFormat: 'HITBACK_TYPE:SONG_DIFF:EASY_GENRE:ROCK_DECADE:1980s',
      legacyFormat: 'HITBACK_001_SONG_EASY',
      validTypes: this.VALID_CARD_TYPES.map(t => t.toUpperCase()),
      validDifficulties: this.VALID_DIFFICULTIES.map(d => d.toUpperCase()),
      validGenres: this.VALID_GENRES.map(g => g.toUpperCase()),
      validDecades: this.VALID_DECADES
    };
  }
}

module.exports = QRService;