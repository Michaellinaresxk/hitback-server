

/**
 * Base Error Class para todos los errores personalizados
 */
class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.timestamp = new Date().toISOString();
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      success: false,
      error: {
        name: this.name,
        message: this.message,
        code: this.code,
        statusCode: this.statusCode,
        timestamp: this.timestamp
      }
    };
  }
}

/**
 * Error para problemas con códigos QR
 */
class QRError extends AppError {
  constructor(message) {
    super(message, 400, 'QR_ERROR');
  }
}

/**
 * Error para problemas de validación
 */
class ValidationError extends AppError {
  constructor(message, field = null) {
    super(message, 400, 'VALIDATION_ERROR');
    this.field = field;
  }
}

/**
 * Error para archivos no encontrados
 */
class FileNotFoundError extends AppError {
  constructor(message) {
    super(message, 404, 'FILE_NOT_FOUND');
  }
}

/**
 * Error para problemas de audio
 */
class AudioError extends AppError {
  constructor(message) {
    super(message, 500, 'AUDIO_ERROR');
  }
}

/**
 * Error para problemas con tracks
 */
class TrackError extends AppError {
  constructor(message) {
    super(message, 500, 'TRACK_ERROR');
  }
}

/**
 * Error para problemas del juego
 */
class GameError extends AppError {
  constructor(message) {
    super(message, 400, 'GAME_ERROR');
  }
}

/**
 * Middleware para manejar errores
 */
const errorHandler = (err, req, res, next) => {
  let error = err;

  // Si no es un error operacional, convertirlo
  if (!error.isOperational) {
    if (error.name === 'ValidationError') {
      error = new ValidationError(error.message);
    } else if (error.name === 'CastError') {
      error = new ValidationError('Invalid data format');
    } else if (error.code === 'ENOENT') {
      error = new FileNotFoundError('File not found');
    } else {
      error = new AppError('Something went wrong', 500, 'INTERNAL_ERROR');
    }
  }

  // Log del error
  console.error(`[ERROR] ${error.name}: ${error.message}`, {
    code: error.code,
    statusCode: error.statusCode,
    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    request: {
      method: req.method,
      url: req.url,
      ip: req.ip
    }
  });

  // Respuesta al cliente
  const response = {
    success: false,
    error: {
      message: error.message,
      code: error.code,
      timestamp: error.timestamp
    }
  };

  // En desarrollo, incluir más detalles
  if (process.env.NODE_ENV === 'development') {
    response.error.stack = error.stack;
  }

  res.status(error.statusCode).json(response);
};

/**
 * Wrapper para manejar errores async
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

module.exports = {
  AppError,
  QRError,
  ValidationError,
  FileNotFoundError,
  AudioError,
  TrackError,
  GameError,
  errorHandler,
  asyncHandler
};