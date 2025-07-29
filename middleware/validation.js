
const logger = require('../utils/logger');

/**
 * Sanitiza una cadena de texto para prevenir ataques
 * @param {string} input - Texto a sanitizar
 * @returns {string} - Texto sanitizado
 */
function sanitizeString(input) {
  if (typeof input !== 'string') return input;

  return input
    .replace(/[<>]/g, '') // Remove < and >
    .replace(/['"]/g, '') // Remove quotes
    .replace(/[\\]/g, '') // Remove backslashes
    .trim();
}

/**
 * Valida parámetros de QR code
 */
const qrValidation = (req, res, next) => {
  try {
    const { qrCode } = req.params;

    // Validaciones básicas
    if (!qrCode) {
      return res.sendValidationError(
        [{ field: 'qrCode', message: 'QR code is required' }],
        'Missing QR code parameter'
      );
    }

    if (typeof qrCode !== 'string') {
      return res.sendValidationError(
        [{ field: 'qrCode', message: 'QR code must be a string' }],
        'Invalid QR code type'
      );
    }

    // Sanitizar QR code
    const sanitized = sanitizeString(qrCode);

    if (sanitized !== qrCode) {
      return res.sendValidationError(
        [{ field: 'qrCode', message: 'QR code contains invalid characters' }],
        'Invalid QR code format'
      );
    }

    // Validar longitud
    if (qrCode.length < 10 || qrCode.length > 50) {
      return res.sendValidationError(
        [{ field: 'qrCode', message: 'QR code length must be between 10 and 50 characters' }],
        'Invalid QR code length'
      );
    }

    // Validar formato básico
    const qrPattern = /^HITBACK_[A-Za-z0-9]+_[A-Za-z]+_[A-Za-z]+$/;
    if (!qrPattern.test(qrCode)) {
      return res.sendValidationError(
        [{ field: 'qrCode', message: 'QR code must follow format: HITBACK_ID_TYPE_DIFFICULTY' }],
        'Invalid QR code format'
      );
    }

    // Validar componentes específicos
    const parts = qrCode.split('_');
    if (parts.length !== 4) {
      return res.sendValidationError(
        [{ field: 'qrCode', message: 'QR code must have exactly 4 parts separated by underscores' }],
        'Invalid QR code structure'
      );
    }

    const [prefix, trackId, cardType, difficulty] = parts;

    // Validar prefijo
    if (prefix !== 'HITBACK') {
      return res.sendValidationError(
        [{ field: 'qrCode', message: 'QR code must start with HITBACK' }],
        'Invalid QR code prefix'
      );
    }

    // Validar track ID
    if (!/^[A-Za-z0-9]{1,10}$/.test(trackId)) {
      return res.sendValidationError(
        [{ field: 'trackId', message: 'Track ID must be alphanumeric and max 10 characters' }],
        'Invalid track ID format'
      );
    }

    // Validar card type
    const validCardTypes = ['SONG', 'ARTIST', 'DECADE', 'LYRICS', 'CHALLENGE'];
    if (!validCardTypes.includes(cardType.toUpperCase())) {
      return res.sendValidationError(
        [{
          field: 'cardType',
          message: `Card type must be one of: ${validCardTypes.join(', ')}`,
          allowedValues: validCardTypes
        }],
        'Invalid card type'
      );
    }

    // Validar difficulty
    const validDifficulties = ['EASY', 'MEDIUM', 'HARD', 'EXPERT'];
    if (!validDifficulties.includes(difficulty.toUpperCase())) {
      return res.sendValidationError(
        [{
          field: 'difficulty',
          message: `Difficulty must be one of: ${validDifficulties.join(', ')}`,
          allowedValues: validDifficulties
        }],
        'Invalid difficulty level'
      );
    }

    logger.debug(`QR validation passed: ${qrCode}`);
    next();

  } catch (error) {
    logger.error('QR validation error:', error);
    res.sendError('QR validation failed', 'QR_VALIDATION_ERROR', 400, error.message);
  }
};

/**
 * Valida parámetros de track
 */
const trackValidation = (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.sendValidationError(
        [{ field: 'id', message: 'Track ID is required' }],
        'Missing track ID parameter'
      );
    }

    if (typeof id !== 'string') {
      return res.sendValidationError(
        [{ field: 'id', message: 'Track ID must be a string' }],
        'Invalid track ID type'
      );
    }

    // Sanitizar ID
    const sanitized = sanitizeString(id);

    if (sanitized !== id) {
      return res.sendValidationError(
        [{ field: 'id', message: 'Track ID contains invalid characters' }],
        'Invalid track ID format'
      );
    }

    // Validar formato de ID
    if (!/^[A-Za-z0-9]{1,10}$/.test(id)) {
      return res.sendValidationError(
        [{ field: 'id', message: 'Track ID must be alphanumeric and max 10 characters' }],
        'Invalid track ID format'
      );
    }

    logger.debug(`Track validation passed: ${id}`);
    next();

  } catch (error) {
    logger.error('Track validation error:', error);
    res.sendError('Track validation failed', 'TRACK_VALIDATION_ERROR', 400, error.message);
  }
};

/**
 * Valida parámetros de audio
 */
const audioValidation = (req, res, next) => {
  try {
    const { filename } = req.params;

    if (!filename) {
      return res.sendValidationError(
        [{ field: 'filename', message: 'Audio filename is required' }],
        'Missing filename parameter'
      );
    }

    if (typeof filename !== 'string') {
      return res.sendValidationError(
        [{ field: 'filename', message: 'Filename must be a string' }],
        'Invalid filename type'
      );
    }

    // Sanitizar filename (más estricto para archivos)
    const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, '');

    if (sanitized !== filename) {
      return res.sendValidationError(
        [{ field: 'filename', message: 'Filename contains invalid characters' }],
        'Invalid filename format'
      );
    }

    // Validar extensión
    const validExtensions = ['.mp3', '.wav', '.m4a'];
    const hasValidExtension = validExtensions.some(ext =>
      filename.toLowerCase().endsWith(ext)
    );

    if (!hasValidExtension) {
      return res.sendValidationError(
        [{
          field: 'filename',
          message: `File must have one of these extensions: ${validExtensions.join(', ')}`,
          allowedExtensions: validExtensions
        }],
        'Invalid file extension'
      );
    }

    // Validar longitud
    if (filename.length > 100) {
      return res.sendValidationError(
        [{ field: 'filename', message: 'Filename must be less than 100 characters' }],
        'Filename too long'
      );
    }

    // Prevenir path traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.sendValidationError(
        [{ field: 'filename', message: 'Filename cannot contain path separators' }],
        'Invalid filename: path traversal detected'
      );
    }

    logger.debug(`Audio validation passed: ${filename}`);
    next();

  } catch (error) {
    logger.error('Audio validation error:', error);
    res.sendError('Audio validation failed', 'AUDIO_VALIDATION_ERROR', 400, error.message);
  }
};

/**
 * Valida parámetros de paginación
 */
const paginationValidation = (req, res, next) => {
  try {
    const { page, limit, offset } = req.query;

    // Validar page
    if (page !== undefined) {
      const pageNum = parseInt(page);
      if (isNaN(pageNum) || pageNum < 1) {
        return res.sendValidationError(
          [{ field: 'page', message: 'Page must be a positive integer' }],
          'Invalid page parameter'
        );
      }
      if (pageNum > 1000) {
        return res.sendValidationError(
          [{ field: 'page', message: 'Page cannot exceed 1000' }],
          'Page limit exceeded'
        );
      }
      req.query.page = pageNum;
    }

    // Validar limit
    if (limit !== undefined) {
      const limitNum = parseInt(limit);
      if (isNaN(limitNum) || limitNum < 1) {
        return res.sendValidationError(
          [{ field: 'limit', message: 'Limit must be a positive integer' }],
          'Invalid limit parameter'
        );
      }
      if (limitNum > 100) {
        return res.sendValidationError(
          [{ field: 'limit', message: 'Limit cannot exceed 100' }],
          'Limit too high'
        );
      }
      req.query.limit = limitNum;
    }

    // Validar offset
    if (offset !== undefined) {
      const offsetNum = parseInt(offset);
      if (isNaN(offsetNum) || offsetNum < 0) {
        return res.sendValidationError(
          [{ field: 'offset', message: 'Offset must be a non-negative integer' }],
          'Invalid offset parameter'
        );
      }
      req.query.offset = offsetNum;
    }

    logger.debug('Pagination validation passed');
    next();

  } catch (error) {
    logger.error('Pagination validation error:', error);
    res.sendError('Pagination validation failed', 'PAGINATION_VALIDATION_ERROR', 400, error.message);
  }
};

/**
 * Middleware general de validación de entrada
 */
const validationMiddleware = (req, res, next) => {
  try {
    // Sanitizar query parameters
    if (req.query) {
      Object.keys(req.query).forEach(key => {
        if (typeof req.query[key] === 'string') {
          req.query[key] = sanitizeString(req.query[key]);
        }
      });
    }

    // Validar headers importantes
    const userAgent = req.get('User-Agent');
    if (userAgent && userAgent.length > 500) {
      return res.sendValidationError(
        [{ field: 'User-Agent', message: 'User-Agent header too long' }],
        'Invalid User-Agent header'
      );
    }

    // Validar content-length para requests con body
    if (req.method === 'POST' || req.method === 'PUT') {
      const contentLength = req.get('Content-Length');
      if (contentLength && parseInt(contentLength) > 10 * 1024 * 1024) { // 10MB
        return res.sendValidationError(
          [{ field: 'Content-Length', message: 'Request body too large' }],
          'Request body size limit exceeded'
        );
      }
    }

    logger.debug('General validation passed');
    next();

  } catch (error) {
    logger.error('Validation middleware error:', error);
    res.sendError('Request validation failed', 'VALIDATION_ERROR', 400, error.message);
  }
};

/**
 * Valida filtros de búsqueda
 */
const searchFiltersValidation = (req, res, next) => {
  try {
    const {
      difficulty,
      cardType,
      genre,
      decade,
      year,
      hasAudio,
      minPoints,
      maxPoints
    } = req.query;

    const errors = [];

    // Validar difficulty
    if (difficulty) {
      const validDifficulties = ['easy', 'medium', 'hard', 'expert'];
      if (!validDifficulties.includes(difficulty.toLowerCase())) {
        errors.push({
          field: 'difficulty',
          message: `Difficulty must be one of: ${validDifficulties.join(', ')}`,
          allowedValues: validDifficulties
        });
      }
    }

    // Validar cardType
    if (cardType) {
      const validCardTypes = ['song', 'artist', 'decade', 'lyrics', 'challenge'];
      if (!validCardTypes.includes(cardType.toLowerCase())) {
        errors.push({
          field: 'cardType',
          message: `Card type must be one of: ${validCardTypes.join(', ')}`,
          allowedValues: validCardTypes
        });
      }
    }

    // Validar year
    if (year) {
      const yearNum = parseInt(year);
      if (isNaN(yearNum) || yearNum < 1900 || yearNum > new Date().getFullYear()) {
        errors.push({
          field: 'year',
          message: `Year must be between 1900 and ${new Date().getFullYear()}`
        });
      }
    }

    // Validar hasAudio
    if (hasAudio && !['true', 'false'].includes(hasAudio.toLowerCase())) {
      errors.push({
        field: 'hasAudio',
        message: 'hasAudio must be "true" or "false"'
      });
    }

    // Validar points
    if (minPoints) {
      const minPointsNum = parseInt(minPoints);
      if (isNaN(minPointsNum) || minPointsNum < 0) {
        errors.push({
          field: 'minPoints',
          message: 'minPoints must be a non-negative integer'
        });
      }
    }

    if (maxPoints) {
      const maxPointsNum = parseInt(maxPoints);
      if (isNaN(maxPointsNum) || maxPointsNum < 0) {
        errors.push({
          field: 'maxPoints',
          message: 'maxPoints must be a non-negative integer'
        });
      }
    }

    if (minPoints && maxPoints) {
      const minNum = parseInt(minPoints);
      const maxNum = parseInt(maxPoints);
      if (minNum > maxNum) {
        errors.push({
          field: 'points',
          message: 'minPoints cannot be greater than maxPoints'
        });
      }
    }

    if (errors.length > 0) {
      return res.sendValidationError(errors, 'Invalid search filters');
    }

    logger.debug('Search filters validation passed');
    next();

  } catch (error) {
    logger.error('Search filters validation error:', error);
    res.sendError('Search filters validation failed', 'SEARCH_VALIDATION_ERROR', 400, error.message);
  }
};

module.exports = {
  qrValidation,
  trackValidation,
  audioValidation,
  paginationValidation,
  validationMiddleware,
  searchFiltersValidation,
  sanitizeString
};