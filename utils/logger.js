
const fs = require('fs');
const path = require('path');

class Logger {
  constructor() {
    this.logLevel = process.env.LOG_LEVEL || 'info';
    this.logDirectory = path.join(__dirname, '../../logs');
    this.logFile = path.join(this.logDirectory, 'hitback.log');

    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3
    };

    this.colors = {
      error: '\x1b[31m',   // Red
      warn: '\x1b[33m',    // Yellow
      info: '\x1b[36m',    // Cyan
      debug: '\x1b[35m',   // Magenta
      reset: '\x1b[0m'     // Reset
    };

    this.initializeLogDirectory();
  }

  /**
   * Inicializa el directorio de logs
   */
  initializeLogDirectory() {
    try {
      if (!fs.existsSync(this.logDirectory)) {
        fs.mkdirSync(this.logDirectory, { recursive: true });
      }
    } catch (error) {
      console.error('Failed to create log directory:', error.message);
    }
  }

  /**
   * Verifica si el nivel debe ser loggeado
   */
  shouldLog(level) {
    const currentLevelValue = this.levels[this.logLevel] || 2;
    const messageLevelValue = this.levels[level] || 0;
    return messageLevelValue <= currentLevelValue;
  }

  /**
   * Formatea un mensaje de log
   */
  formatMessage(level, message, meta = null) {
    const timestamp = new Date().toISOString();
    const upperLevel = level.toUpperCase().padEnd(5);

    let logMessage = `[${timestamp}] [${upperLevel}] ${message}`;

    if (meta) {
      if (typeof meta === 'object') {
        logMessage += ` ${JSON.stringify(meta)}`;
      } else {
        logMessage += ` ${meta}`;
      }
    }

    return logMessage;
  }

  /**
   * Formatea mensaje para consola con colores
   */
  formatConsoleMessage(level, message, meta = null) {
    const timestamp = new Date().toLocaleTimeString();
    const color = this.colors[level] || this.colors.reset;
    const upperLevel = level.toUpperCase().padEnd(5);

    let consoleMessage = `${color}[${timestamp}] [${upperLevel}] ${message}${this.colors.reset}`;

    if (meta) {
      if (typeof meta === 'object') {
        consoleMessage += `\n${JSON.stringify(meta, null, 2)}`;
      } else {
        consoleMessage += ` ${meta}`;
      }
    }

    return consoleMessage;
  }

  /**
   * Escribe al archivo de log
   */
  writeToFile(message) {
    try {
      fs.appendFileSync(this.logFile, message + '\n', 'utf8');
    } catch (error) {
      console.error('Failed to write to log file:', error.message);
    }
  }

  /**
   * Log de error
   */
  error(message, meta = null) {
    if (!this.shouldLog('error')) return;

    const logMessage = this.formatMessage('error', message, meta);
    const consoleMessage = this.formatConsoleMessage('error', message, meta);

    console.error(consoleMessage);
    this.writeToFile(logMessage);
  }

  /**
   * Log de warning
   */
  warn(message, meta = null) {
    if (!this.shouldLog('warn')) return;

    const logMessage = this.formatMessage('warn', message, meta);
    const consoleMessage = this.formatConsoleMessage('warn', message, meta);

    console.warn(consoleMessage);
    this.writeToFile(logMessage);
  }

  /**
   * Log de información
   */
  info(message, meta = null) {
    if (!this.shouldLog('info')) return;

    const logMessage = this.formatMessage('info', message, meta);
    const consoleMessage = this.formatConsoleMessage('info', message, meta);

    console.log(consoleMessage);
    this.writeToFile(logMessage);
  }

  /**
   * Log de debug
   */
  debug(message, meta = null) {
    if (!this.shouldLog('debug')) return;

    const logMessage = this.formatMessage('debug', message, meta);
    const consoleMessage = this.formatConsoleMessage('debug', message, meta);

    console.log(consoleMessage);
    this.writeToFile(logMessage);
  }

  /**
   * Log de request HTTP
   */
  logRequest(req, res, duration) {
    const message = `${req.method} ${req.url} - ${res.statusCode} - ${duration}ms`;
    const meta = {
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent')
    };

    if (res.statusCode >= 400) {
      this.error(message, meta);
    } else {
      this.info(message, meta);
    }
  }

  /**
   * Crea un timer para medir performance
   */
  startTimer(label) {
    const start = Date.now();

    return (meta = null) => {
      const duration = Date.now() - start;
      this.debug(`Performance: ${label} took ${duration}ms`, meta);
      return duration;
    };
  }

  /**
   * Obtiene estadísticas de logs
   */
  getStats() {
    try {
      const stats = {
        logFile: this.logFile,
        logLevel: this.logLevel,
        exists: fs.existsSync(this.logFile),
        size: 0,
        lastModified: null
      };

      if (stats.exists) {
        const fileStats = fs.statSync(this.logFile);
        stats.size = fileStats.size;
        stats.lastModified = fileStats.mtime;
      }

      return stats;
    } catch (error) {
      return { error: error.message };
    }
  }
}

// Crear instancia singleton
const logger = new Logger();

module.exports = logger;