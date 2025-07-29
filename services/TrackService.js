const fs = require('fs');
const path = require('path');
const { TrackError, FileNotFoundError, ValidationError } = require('../utils/errors');
const logger = require('../utils/logger');

class TrackService {
  constructor() {
    this.tracksFilePath = path.join(__dirname, '../../data/tracks.json');
    this.backupDirectory = path.join(__dirname, '../../backups');
  }

  /**
   * Carga los datos de tracks desde el archivo JSON
   * @returns {Object} - Datos de tracks cargados
   * @throws {FileNotFoundError} - Si el archivo no existe
   */
  loadTracksData() {
    try {
      if (!fs.existsSync(this.tracksFilePath)) {
        logger.warn('tracks.json not found, returning empty structure');
        return { tracks: [], version: '1.0.0', totalTracks: 0 };
      }

      const data = fs.readFileSync(this.tracksFilePath, 'utf8');
      const parsed = JSON.parse(data);

      // Validar estructura básica
      if (!parsed.tracks || !Array.isArray(parsed.tracks)) {
        throw new ValidationError('Invalid tracks.json structure');
      }

      logger.debug(`Loaded ${parsed.tracks.length} tracks from database`);
      return parsed;
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new TrackError(`Failed to load tracks data: ${error.message}`);
    }
  }

  /**
   * Guarda los datos de tracks al archivo JSON
   * @param {Object} tracksData - Datos a guardar
   * @throws {TrackError} - Si falla al guardar
   */
  saveTracksData(tracksData) {
    try {
      // Crear backup antes de guardar
      this.createBackup();

      // Actualizar metadata
      tracksData.lastUpdated = new Date().toISOString();
      tracksData.totalTracks = tracksData.tracks.length;

      // Guardar archivo
      const jsonData = JSON.stringify(tracksData, null, 2);
      fs.writeFileSync(this.tracksFilePath, jsonData, 'utf8');

      logger.info(`Saved ${tracksData.tracks.length} tracks to database`);
    } catch (error) {
      throw new TrackError(`Failed to save tracks data: ${error.message}`);
    }
  }

  /**
   * Obtiene un track por su ID
   * @param {string} trackId - ID del track
   * @returns {Object} - Datos del track
   * @throws {FileNotFoundError} - Si el track no existe
   */
  getTrackById(trackId) {
    if (!trackId) {
      throw new ValidationError('Track ID is required');
    }

    const tracksData = this.loadTracksData();
    const track = tracksData.tracks.find(t => t.id === trackId);

    if (!track) {
      throw new FileNotFoundError(`Track not found: ${trackId}`);
    }

    logger.debug(`Retrieved track: ${track.title} (${trackId})`);
    return this.normalizeTrackData(track);
  }

  /**
   * Obtiene todos los tracks
   * @returns {Array} - Array de todos los tracks
   */
  getAllTracks() {
    const tracksData = this.loadTracksData();
    const normalizedTracks = tracksData.tracks.map(track =>
      this.normalizeTrackData(track)
    );

    logger.debug(`Retrieved ${normalizedTracks.length} tracks`);
    return normalizedTracks;
  }

  /**
   * Busca tracks usando filtros
   * @param {Object} filters - Filtros de búsqueda
   * @returns {Array} - Tracks filtrados
   */
  searchTracks(filters = {}) {
    const allTracks = this.getAllTracks();

    let filteredTracks = allTracks;

    // Aplicar filtros
    if (filters.genre) {
      filteredTracks = filteredTracks.filter(track =>
        track.genre?.toLowerCase().includes(filters.genre.toLowerCase())
      );
    }

    if (filters.decade) {
      filteredTracks = filteredTracks.filter(track =>
        track.decade === filters.decade
      );
    }

    if (filters.difficulty) {
      filteredTracks = filteredTracks.filter(track =>
        track.difficulty === filters.difficulty
      );
    }

    if (filters.artist) {
      filteredTracks = filteredTracks.filter(track =>
        track.artist?.toLowerCase().includes(filters.artist.toLowerCase())
      );
    }

    if (filters.year) {
      filteredTracks = filteredTracks.filter(track =>
        track.year === parseInt(filters.year)
      );
    }

    if (filters.hasQuestions) {
      filteredTracks = filteredTracks.filter(track =>
        track.questions && Object.keys(track.questions).length > 0
      );
    }

    if (filters.cardType) {
      filteredTracks = filteredTracks.filter(track =>
        track.questions && track.questions[filters.cardType]
      );
    }

    logger.debug(`Search returned ${filteredTracks.length} tracks with filters:`, filters);
    return filteredTracks;
  }

  /**
   * Obtiene un track aleatorio basado en filtros
   * @param {Object} filters - Filtros para la búsqueda aleatoria
   * @returns {Object} - Track aleatorio
   * @throws {FileNotFoundError} - Si no se encuentran tracks
   */
  getRandomTrack(filters = {}) {
    const filteredTracks = this.searchTracks(filters);

    if (filteredTracks.length === 0) {
      throw new FileNotFoundError('No tracks found matching the specified filters');
    }

    const randomIndex = Math.floor(Math.random() * filteredTracks.length);
    const randomTrack = filteredTracks[randomIndex];

    logger.debug(`Random track selected: ${randomTrack.title} (${randomTrack.id})`);
    return randomTrack;
  }

  /**
   * Valida los datos de un track
   * @param {Object} trackData - Datos del track a validar
   * @returns {Object} - Resultado de la validación
   */
  validateTrackData(trackData) {
    const validation = {
      isValid: true,
      errors: [],
      warnings: []
    };

    // Campos requeridos
    const requiredFields = ['id', 'title', 'artist', 'year'];
    requiredFields.forEach(field => {
      if (!trackData[field]) {
        validation.errors.push(`Missing required field: ${field}`);
      }
    });

    // Validar ID
    if (trackData.id && !/^[a-zA-Z0-9]{3,10}$/.test(trackData.id)) {
      validation.errors.push('Invalid track ID format');
    }

    // Validar año
    if (trackData.year && (trackData.year < 1900 || trackData.year > new Date().getFullYear())) {
      validation.errors.push('Invalid year');
    }

    // Validar questions
    if (trackData.questions) {
      if (typeof trackData.questions !== 'object') {
        validation.errors.push('Questions must be an object');
      } else {
        const validCardTypes = ['song', 'artist', 'decade', 'lyrics', 'challenge'];
        Object.keys(trackData.questions).forEach(cardType => {
          if (!validCardTypes.includes(cardType)) {
            validation.warnings.push(`Unknown card type: ${cardType}`);
          }

          const question = trackData.questions[cardType];
          if (!question.question || !question.answer) {
            validation.errors.push(`Incomplete question data for ${cardType}`);
          }
        });
      }
    } else {
      validation.warnings.push('No questions defined for this track');
    }

    // Validar audioFile
    if (!trackData.audioFile) {
      validation.warnings.push('No audio file specified');
    }

    validation.isValid = validation.errors.length === 0;
    return validation;
  }

  /**
   * Normaliza y enriquece los datos de un track
   * @param {Object} track - Datos del track
   * @returns {Object} - Track normalizado
   */
  normalizeTrackData(track) {
    return {
      // Datos básicos
      id: track.id,
      qrCode: track.qrCode || `HITBACK_${track.id}`,
      title: track.title,
      artist: track.artist,
      album: track.album || 'Unknown Album',
      year: track.year,
      genre: track.genre || 'Unknown',
      decade: track.decade || this.calculateDecade(track.year),

      // Datos del juego
      difficulty: track.difficulty || 'medium',
      popularity: track.popularity || 50,
      questions: track.questions || {},

      // Audio
      audioFile: track.audioFile || null,
      duration: track.duration || 30000,

      // Metadatos calculados
      availableCardTypes: Object.keys(track.questions || {}),
      hasQuestions: !!(track.questions && Object.keys(track.questions).length > 0),
      questionCount: Object.keys(track.questions || {}).length,

      // Timestamps
      lastUpdated: track.lastUpdated || new Date().toISOString(),
      created: track.created || new Date().toISOString()
    };
  }

  /**
   * Calcula la década basada en el año
   * @param {number} year - Año
   * @returns {string} - Década (ej: "2010s")
   */
  calculateDecade(year) {
    if (!year || isNaN(year)) return 'Unknown';

    const decade = Math.floor(year / 10) * 10;
    return `${decade}s`;
  }

  /**
   * Genera estadísticas de los tracks
   * @returns {Object} - Estadísticas
   */
  getStats() {
    try {
      const tracks = this.getAllTracks();

      const stats = {
        total: tracks.length,
        withAudio: tracks.filter(t => t.audioFile).length,
        withQuestions: tracks.filter(t => t.hasQuestions).length,
        byGenre: {},
        byDecade: {},
        byDifficulty: {},
        avgQuestionsPerTrack: 0
      };

      let totalQuestions = 0;

      tracks.forEach(track => {
        // Por género
        const genre = track.genre || 'Unknown';
        stats.byGenre[genre] = (stats.byGenre[genre] || 0) + 1;

        // Por década
        const decade = track.decade || 'Unknown';
        stats.byDecade[decade] = (stats.byDecade[decade] || 0) + 1;

        // Por dificultad
        const difficulty = track.difficulty || 'medium';
        stats.byDifficulty[difficulty] = (stats.byDifficulty[difficulty] || 0) + 1;

        // Contar preguntas
        totalQuestions += track.questionCount || 0;
      });

      stats.avgQuestionsPerTrack = tracks.length > 0
        ? Math.round((totalQuestions / tracks.length) * 100) / 100
        : 0;

      return stats;
    } catch (error) {
      logger.error('Failed to generate stats:', error);
      return {};
    }
  }

  /**
   * Crea un backup de los datos actuales
   * @returns {string} - Ruta del archivo de backup
   */
  createBackup() {
    try {
      if (!fs.existsSync(this.backupDirectory)) {
        fs.mkdirSync(this.backupDirectory, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-');
      const backupFileName = `tracks_backup_${timestamp}.json`;
      const backupPath = path.join(this.backupDirectory, backupFileName);

      if (fs.existsSync(this.tracksFilePath)) {
        fs.copyFileSync(this.tracksFilePath, backupPath);
        logger.info(`Backup created: ${backupPath}`);
      }

      return backupPath;
    } catch (error) {
      logger.warn(`Failed to create backup: ${error.message}`);
      return null;
    }
  }

  /**
   * Health check del servicio
   * @returns {Object} - Estado del servicio
   */
  async healthCheck() {
    try {
      const health = {
        service: 'TrackService',
        status: 'healthy',
        timestamp: new Date().toISOString(),
        tracksFile: {
          exists: fs.existsSync(this.tracksFilePath),
          path: this.tracksFilePath,
          readable: false
        },
        stats: {}
      };

      // Verificar permisos de lectura
      try {
        fs.accessSync(this.tracksFilePath, fs.constants.R_OK);
        health.tracksFile.readable = true;
      } catch (error) {
        health.tracksFile.readable = false;
      }

      // Obtener estadísticas si es posible
      if (health.tracksFile.exists && health.tracksFile.readable) {
        health.stats = this.getStats();
      }

      // Determinar estado general
      if (!health.tracksFile.exists) {
        health.status = 'warning';
        health.message = 'Tracks file does not exist';
      } else if (!health.tracksFile.readable) {
        health.status = 'error';
        health.message = 'Tracks file is not readable';
      } else if (health.stats.total === 0) {
        health.status = 'warning';
        health.message = 'No tracks available';
      }

      return health;
    } catch (error) {
      return {
        service: 'TrackService',
        status: 'error',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

module.exports = TrackService;