
const { v4: uuidv4 } = require('uuid');

/**
 * Utilidades para crear respuestas estándar de la API
 */
class ResponseBuilder {
  constructor() {
    this.serverStartTime = new Date().toISOString();
  }

  /**
   * Crea una respuesta exitosa estándar
   */
  success(data = null, message = 'Operation successful', meta = {}) {
    return {
      success: true,
      message,
      data,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: uuidv4(),
        ...meta
      }
    };
  }

  /**
   * Crea una respuesta de error estándar
   */
  error(message, code = 'GENERIC_ERROR', statusCode = 500, details = null) {
    const response = {
      success: false,
      error: {
        message,
        code,
        statusCode,
        timestamp: new Date().toISOString(),
        requestId: uuidv4()
      }
    };

    if (details && process.env.NODE_ENV === 'development') {
      response.error.details = details;
    }

    return response;
  }

  /**
   * Respuesta para recursos no encontrados
   */
  notFound(resource = 'Resource', identifier = null) {
    const message = identifier
      ? `${resource} '${identifier}' not found`
      : `${resource} not found`;

    return this.error(message, 'NOT_FOUND', 404);
  }

  /**
   * Respuesta para errores de validación
   */
  validationError(validationErrors, message = 'Validation failed') {
    return {
      success: false,
      error: {
        message,
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        timestamp: new Date().toISOString(),
        requestId: uuidv4(),
        validationErrors
      }
    };
  }

  /**
   * Respuesta para operaciones que crean recursos
   */
  created(data, resource = 'Resource', location = null) {
    const response = this.success(data, `${resource} created successfully`);
    response.meta.statusCode = 201;

    if (location) {
      response.meta.location = location;
    }

    return response;
  }

  /**
   * Respuesta para health check
   */
  healthCheck(services = {}, status = 'healthy') {
    const uptime = Date.now() - new Date(this.serverStartTime).getTime();

    return this.success({
      status,
      uptime: Math.floor(uptime / 1000),
      services,
      serverStartTime: this.serverStartTime,
      environment: process.env.NODE_ENV || 'development',
      version: process.env.npm_package_version || '1.0.0'
    }, `Server is ${status}`);
  }

  /**
   * Respuesta para rate limiting
   */
  rateLimited(retryAfter = 60) {
    return {
      success: false,
      error: {
        message: 'Too many requests',
        code: 'RATE_LIMIT_EXCEEDED',
        statusCode: 429,
        timestamp: new Date().toISOString(),
        requestId: uuidv4(),
        retryAfter
      }
    };
  }
}

/**
 * Middleware para enviar respuestas estándar
 */
const responseMiddleware = (req, res, next) => {
  const responseBuilder = new ResponseBuilder();

  // Agregar métodos helper al objeto response
  res.sendSuccess = (data, message, meta) => {
    const response = responseBuilder.success(data, message, meta);
    res.json(response);
  };

  res.sendError = (message, code, statusCode, details) => {
    const response = responseBuilder.error(message, code, statusCode, details);
    res.status(statusCode || 500).json(response);
  };

  res.sendNotFound = (resource, identifier) => {
    const response = responseBuilder.notFound(resource, identifier);
    res.status(404).json(response);
  };

  res.sendValidationError = (validationErrors, message) => {
    const response = responseBuilder.validationError(validationErrors, message);
    res.status(400).json(response);
  };

  res.sendCreated = (data, resource, location) => {
    const response = responseBuilder.created(data, resource, location);
    res.status(201).json(response);
  };

  res.sendHealthCheck = (services, status) => {
    const response = responseBuilder.healthCheck(services, status);
    res.json(response);
  };

  res.sendRateLimited = (retryAfter) => {
    const response = responseBuilder.rateLimited(retryAfter);
    res.status(429).json(response);
  };

  next();
};

/**
 * Función helper para crear respuestas rápidas sin middleware
 */
const createResponse = () => new ResponseBuilder();

module.exports = {
  ResponseBuilder,
  responseMiddleware,
  createResponse
};