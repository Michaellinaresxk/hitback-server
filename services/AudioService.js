
const fs = require('fs');
const path = require('path');
const { AudioError, FileNotFoundError } = require('../utils/errors');
const logger = require('../utils/logger');

class AudioService {
  constructor() {
    this.audioDirectory = path.join(__dirname, '../../public/audio/tracks');
    this.allowedFormats = ['.mp3', '.wav', '.m4a'];
    this.maxFileSize = 10 * 1024 * 1024; // 10MB
    this.defaultDuration = 30; // 30 seconds
  }

  /**
   * Valida si un archivo de audio existe
   * @param {string} filename - Nombre del archivo
   * @returns {boolean} - True si existe
   */
  audioFileExists(filename) {
    if (!filename) return false;

    const audioPath = this.getAudioPath(filename);
    return fs.existsSync(audioPath);
  }

  /**
   * Obtiene la URL completa del archivo de audio
   * @param {string} filename - Nombre del archivo
   * @param {string} baseUrl - URL base del servidor
   * @returns {string|null} - URL completa o null si no existe
   */
  getAudioUrl(filename, baseUrl = 'http://localhost:3000') {
    if (!this.audioFileExists(filename)) {
      logger.warn(`Audio file not found: ${filename}`);
      return null;
    }

    return `${baseUrl}/audio/tracks/${filename}`;
  }

  /**
   * Obtiene la ruta completa del archivo de audio
   * @param {string} filename - Nombre del archivo
   * @returns {string} - Ruta completa
   */
  getAudioPath(filename) {
    // Sanitizar el nombre del archivo para prevenir path traversal
    const sanitizedFilename = path.basename(filename);
    return path.join(this.audioDirectory, sanitizedFilename);
  }

  /**
   * Obtiene metadata del archivo de audio
   * @param {string} filename - Nombre del archivo
   * @returns {Object} - Metadata del archivo
   * @throws {FileNotFoundError} - Si el archivo no existe
   */
  getAudioMetadata(filename) {
    const audioPath = this.getAudioPath(filename);

    if (!fs.existsSync(audioPath)) {
      throw new FileNotFoundError(`Audio file not found: ${filename}`);
    }

    try {
      const stats = fs.statSync(audioPath);

      return {
        filename,
        path: audioPath,
        size: stats.size,
        sizeFormatted: this.formatFileSize(stats.size),
        lastModified: stats.mtime,
        created: stats.birthtime,
        extension: path.extname(filename).toLowerCase(),
        isValid: this.isValidAudioFile(filename),
        duration: this.defaultDuration // En una implementación real, extraerías esto del archivo
      };
    } catch (error) {
      throw new AudioError(`Failed to get audio metadata: ${error.message}`);
    }
  }

  /**
   * Lista todos los archivos de audio disponibles
   * @returns {Array} - Array de archivos de audio con metadata
   */
  listAudioFiles() {
    try {
      if (!fs.existsSync(this.audioDirectory)) {
        logger.warn(`Audio directory does not exist: ${this.audioDirectory}`);
        return [];
      }

      const files = fs.readdirSync(this.audioDirectory)
        .filter(file => this.isValidAudioFile(file))
        .map(file => {
          try {
            return this.getAudioMetadata(file);
          } catch (error) {
            logger.warn(`Failed to get metadata for ${file}:`, error.message);
            return null;
          }
        })
        .filter(Boolean); // Remove null entries

      logger.info(`Found ${files.length} audio files`);
      return files;
    } catch (error) {
      logger.error('Failed to list audio files:', error);
      return [];
    }
  }

  /**
   * Valida si un archivo es un formato de audio válido
   * @param {string} filename - Nombre del archivo
   * @returns {boolean} - True si es válido
   */
  isValidAudioFile(filename) {
    if (!filename) return false;

    const extension = path.extname(filename).toLowerCase();
    return this.allowedFormats.includes(extension);
  }

  /**
   * Valida el tamaño del archivo de audio
   * @param {string} filename - Nombre del archivo
   * @returns {boolean} - True si el tamaño es válido
   */
  isValidAudioSize(filename) {
    try {
      const audioPath = this.getAudioPath(filename);
      if (!fs.existsSync(audioPath)) return false;

      const stats = fs.statSync(audioPath);
      return stats.size <= this.maxFileSize;
    } catch (error) {
      return false;
    }
  }

  /**
   * Crea un stream de audio para reproducción
   * @param {string} filename - Nombre del archivo
   * @param {Object} options - Opciones de streaming (range, etc.)
   * @returns {Object} - Stream y headers para la respuesta
   * @throws {FileNotFoundError} - Si el archivo no existe
   */
  createAudioStream(filename, options = {}) {
    const audioPath = this.getAudioPath(filename);

    if (!fs.existsSync(audioPath)) {
      throw new FileNotFoundError(`Audio file not found: ${filename}`);
    }

    try {
      const stats = fs.statSync(audioPath);
      const fileSize = stats.size;

      let stream;
      let headers = {
        'Content-Type': this.getMimeType(filename),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=3600'
      };

      // Handle range requests for streaming
      if (options.range) {
        const parts = options.range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = (end - start) + 1;

        stream = fs.createReadStream(audioPath, { start, end });

        headers = {
          ...headers,
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Content-Length': chunksize
        };

        return { stream, headers, statusCode: 206 };
      } else {
        stream = fs.createReadStream(audioPath);
        headers['Content-Length'] = fileSize;

        return { stream, headers, statusCode: 200 };
      }
    } catch (error) {
      throw new AudioError(`Failed to create audio stream: ${error.message}`);
    }
  }

  /**
   * Obtiene el MIME type basado en la extensión del archivo
   * @param {string} filename - Nombre del archivo
   * @returns {string} - MIME type
   */
  getMimeType(filename) {
    const extension = path.extname(filename).toLowerCase();

    const mimeTypes = {
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.m4a': 'audio/mp4'
    };

    return mimeTypes[extension] || 'audio/mpeg';
  }

  /**
   * Formatea el tamaño del archivo en formato legible
   * @param {number} bytes - Tamaño en bytes
   * @returns {string} - Tamaño formateado
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Verifica la salud del servicio de audio
   * @returns {Object} - Estado del servicio
   */
  async healthCheck() {
    try {
      const stats = {
        service: 'AudioService',
        status: 'healthy',
        timestamp: new Date().toISOString(),
        audioDirectory: {
          exists: fs.existsSync(this.audioDirectory),
          path: this.audioDirectory,
          readable: false,
          writable: false
        },
        files: {
          total: 0,
          valid: 0,
          invalid: 0
        }
      };

      // Check directory permissions
      try {
        fs.accessSync(this.audioDirectory, fs.constants.R_OK);
        stats.audioDirectory.readable = true;
      } catch (error) {
        stats.audioDirectory.readable = false;
      }

      // Count files
      if (stats.audioDirectory.exists) {
        const allFiles = fs.readdirSync(this.audioDirectory);
        stats.files.total = allFiles.length;
        stats.files.valid = allFiles.filter(file => this.isValidAudioFile(file)).length;
        stats.files.invalid = stats.files.total - stats.files.valid;
      }

      // Determine overall status
      if (!stats.audioDirectory.exists || !stats.audioDirectory.readable) {
        stats.status = 'error';
        stats.error = 'Audio directory not accessible';
      } else if (stats.files.valid === 0) {
        stats.status = 'warning';
        stats.warning = 'No valid audio files found';
      }

      return stats;
    } catch (error) {
      return {
        service: 'AudioService',
        status: 'error',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Diagnostica problemas con archivos de audio
   * @param {Array} expectedFiles - Array de nombres de archivos esperados
   * @returns {Object} - Reporte de diagnóstico
   */
  diagnoseAudioFiles(expectedFiles = []) {
    const diagnosis = {
      timestamp: new Date().toISOString(),
      audioDirectory: this.audioDirectory,
      expectedFiles: expectedFiles.length,
      foundFiles: 0,
      missingFiles: [],
      orphanedFiles: [],
      invalidFiles: [],
      validFiles: []
    };

    try {
      const existingFiles = fs.existsSync(this.audioDirectory)
        ? fs.readdirSync(this.audioDirectory)
        : [];

      diagnosis.foundFiles = existingFiles.length;

      // Check expected files
      expectedFiles.forEach(filename => {
        if (!existingFiles.includes(filename)) {
          diagnosis.missingFiles.push(filename);
        } else if (this.isValidAudioFile(filename)) {
          diagnosis.validFiles.push(filename);
        } else {
          diagnosis.invalidFiles.push(filename);
        }
      });

      // Check for orphaned files
      existingFiles.forEach(filename => {
        if (!expectedFiles.includes(filename)) {
          diagnosis.orphanedFiles.push(filename);
        }
      });

      logger.info(`Audio diagnosis completed: ${diagnosis.validFiles.length}/${expectedFiles.length} files OK`);

    } catch (error) {
      diagnosis.error = error.message;
      logger.error('Audio diagnosis failed:', error);
    }

    return diagnosis;
  }

  /**
   * Inicializa el directorio de audio si no existe
   * @returns {boolean} - True si se inicializó correctamente
   */
  initializeAudioDirectory() {
    try {
      if (!fs.existsSync(this.audioDirectory)) {
        fs.mkdirSync(this.audioDirectory, { recursive: true });
        logger.info(`Created audio directory: ${this.audioDirectory}`);
        return true;
      }
      return true;
    } catch (error) {
      logger.error(`Failed to initialize audio directory: ${error.message}`);
      return false;
    }
  }
}

module.exports = AudioService;