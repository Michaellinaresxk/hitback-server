/**
 * 🎯 QR Parser - Sistema Escalable CON COMPATIBILIDAD TOTAL
 * Formato NUEVO: HITBACK_TYPE:SONG_DIFF:EASY_GENRE:ROCK_DECADE:1980s
 * Formato ANTIGUO: HITBACK_001_SONG_EASY
 */

/**
 * Parsear código QR con soporte para ambos formatos
 * @param {string} qrString - QR code string
 * @returns {Object} Filtros parseados
 */
function parseQRCode(qrString) {
  // Validación básica
  if (!qrString || typeof qrString !== 'string') {
    throw new Error('QR code inválido');
  }

  console.log(`📱 Parseando QR: ${qrString}`);

  // ✅ NUEVO FORMATO: HITBACK_TYPE:SONG_DIFF:EASY_GENRE:ROCK_DECADE:1980s
  const newFormatRegex = /HITBACK_TYPE:(\w+)_DIFF:(\w+)_GENRE:(\w+)_DECADE:([\w]+)/;
  const newMatch = qrString.match(newFormatRegex);

  if (newMatch) {
    const [, cardType, difficulty, genre, decade] = newMatch;

    console.log(`✅ Formato NUEVO detectado`);
    console.log(`   Tipo: ${cardType}, Dificultad: ${difficulty}, Género: ${genre}, Década: ${decade}`);

    // Validar valores
    const validTypes = ['SONG', 'ARTIST', 'DECADE', 'LYRICS', 'CHALLENGE'];
    const validDifficulties = ['EASY', 'MEDIUM', 'HARD', 'EXPERT', 'ANY'];
    const validGenres = ['ROCK', 'POP', 'REGGAETON', 'HIP_HOP', 'ELECTRONIC', 'R&B', 'COUNTRY', 'JAZZ', 'ANY'];
    const validDecades = ['1960s', '1970s', '1980s', '1990s', '2000s', '2010s', '2020s', 'ANY'];

    if (!validTypes.includes(cardType)) {
      throw new Error(`Tipo de carta inválido: ${cardType}`);
    }
    if (!validDifficulties.includes(difficulty)) {
      throw new Error(`Dificultad inválida: ${difficulty}`);
    }
    if (!validGenres.includes(genre)) {
      throw new Error(`Género inválido: ${genre}`);
    }
    if (!validDecades.includes(decade)) {
      throw new Error(`Década inválida: ${decade}`);
    }

    return {
      cardType,
      questionType: cardType.toLowerCase(), // Para compatibilidad: SONG → song
      difficulty,
      genre,
      decade,
      isLegacy: false,
      rawQR: qrString
    };
  }

  // ⚠️ FORMATO ANTIGUO (compatibilidad): HITBACK_001_SONG_EASY
  const legacyRegex = /HITBACK_(\d+)_(\w+)_(\w+)/;
  const legacyMatch = qrString.match(legacyRegex);

  if (legacyMatch) {
    const [, trackId, questionType, difficulty] = legacyMatch;

    console.log(`⚠️ Formato ANTIGUO detectado (compatibilidad activada)`);
    console.log(`   Track ID: ${trackId}, Tipo: ${questionType}, Dificultad: ${difficulty}`);

    return {
      trackId,
      cardType: questionType.toUpperCase(),
      questionType: questionType.toLowerCase(),
      difficulty: difficulty.toUpperCase(),
      genre: 'ANY',
      decade: 'ANY',
      isLegacy: true,
      rawQR: qrString
    };
  }

  // ❌ Formato no reconocido
  throw new Error(`Formato de QR code no reconocido: ${qrString}`);
}

/**
 * Generar código QR (para testing o generación)
 * @param {Object} options - Opciones de configuración
 * @returns {string} QR code string
 */
function generateQRCode(options = {}) {
  const {
    cardType = 'SONG',
    difficulty = 'EASY',
    genre = 'ANY',
    decade = 'ANY'
  } = options;

  return `HITBACK_TYPE:${cardType}_DIFF:${difficulty}_GENRE:${genre}_DECADE:${decade}`;
}

/**
 * Validar si un QR code es válido
 * @param {string} qrString - QR code string
 * @returns {boolean} True si es válido
 */
function isValidQRCode(qrString) {
  try {
    parseQRCode(qrString);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Extraer información legible del QR code
 * @param {string} qrString - QR code string
 * @returns {string} Descripción legible
 */
function getQRDescription(qrString) {
  try {
    const filters = parseQRCode(qrString);

    if (filters.isLegacy) {
      return `Carta antigua: Track #${filters.trackId} - ${filters.cardType} (${filters.difficulty})`;
    }

    const parts = [];
    parts.push(`Tipo: ${filters.cardType}`);
    parts.push(`Dificultad: ${filters.difficulty}`);
    if (filters.genre !== 'ANY') parts.push(`Género: ${filters.genre}`);
    if (filters.decade !== 'ANY') parts.push(`Década: ${filters.decade}`);

    return parts.join(' | ');
  } catch (error) {
    return 'QR code inválido';
  }
}

module.exports = {
  parseQRCode,
  generateQRCode,
  isValidQRCode,
  getQRDescription
};