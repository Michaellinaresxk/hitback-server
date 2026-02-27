/**
 * =====================================================
 * TRACK SERVICE V2 - Híbrido Deezer + PostgreSQL
 * =====================================================
 *
 * Gestión inteligente de tracks:
 * 1. Busca primero en PostgreSQL (cache)
 * 2. Si no hay suficientes, busca en Deezer
 * 3. Guarda nuevos tracks en BD
 * 4. Evita duplicados por sesión
 * 5. Fallback automático
 */

const { Pool } = require('pg');
const DeezerServiceV2 = require('./DeezerServiceV2');
const logger = require('../utils/logger');

class TrackServiceV2 {
  constructor() {
    // PostgreSQL connection pool
    this.pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME || 'Hitback',
      max: 20, // Máximo de conexiones
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    this.deezerService = DeezerServiceV2;

    // Configuración
    this.minCachedTracks = 10; // Mínimo de tracks en cache antes de buscar en Deezer
    this.maxTracksPerQuery = 50;

    // 🔄 FALLBACK: Sistema de memoria cuando PostgreSQL no está disponible
    this.dbAvailable = false;
    this.memoryCache = new Map(); // sessionId -> Set de trackIds usados
    this.memoryTracks = new Map(); // trackId -> track data

    this.initializeDatabase();
  }

  /**
   * Inicializar conexión a base de datos
   */
  async initializeDatabase() {
    try {
      await this.pool.query('SELECT NOW()');
      this.dbAvailable = true;
      logger.info('✅ PostgreSQL conectado correctamente');
    } catch (error) {
      this.dbAvailable = false;
      logger.error('❌ Error conectando a PostgreSQL:', error.message);
      logger.warn('⚠️ TrackService funcionará con cache en memoria (sin persistencia)');
    }
  }

  /**
   * Obtener track aleatorio con filtros
   *
   * @param {Object} options - Opciones de búsqueda
   * @param {string} options.sessionId - ID de la sesión (para evitar duplicados)
   * @param {string} options.genre - Género deseado
   * @param {string} options.decade - Década deseada
   * @param {string} options.difficulty - Dificultad
   * @returns {Promise<Object>} - Track seleccionado
   */
  async getRandomTrack({ sessionId, genre = null, decade = null, difficulty = null }) {
    try {
      let track = null;

      // 1. Si PostgreSQL está disponible, usar base de datos
      if (this.dbAvailable) {
        track = await this.getRandomTrackFromDB({
          sessionId,
          genre,
          decade,
          difficulty
        });

        // Si no hay en BD, buscar en Deezer
        if (!track) {
          logger.info('📡 No hay tracks en BD, buscando en Deezer...');
          track = await this.fetchAndCacheFromDeezer({ genre, decade });
        }

        // Marcar como usado en BD
        if (track && sessionId) {
          await this.markTrackAsUsed(sessionId, track.id);
        }
      }
      // 2. 🔄 FALLBACK: Si PostgreSQL no está disponible, usar memoria
      else {
        track = await this.getRandomTrackFromMemory({ sessionId, genre, decade });
      }

      return track;

    } catch (error) {
      logger.error('❌ Error obteniendo track aleatorio:', error.message);
      throw error;
    }
  }

  /**
   * Obtener track aleatorio desde PostgreSQL
   *
   * @param {Object} options - Filtros
   * @returns {Promise<Object|null>} - Track o null si no hay
   */
  async getRandomTrackFromDB({ sessionId, genre, decade, difficulty }) {
    try {
      // Construir query con filtros dinámicos
      let query = `
        SELECT t.*
        FROM tracks t
        WHERE t.preview_url IS NOT NULL
      `;

      const params = [];
      let paramCount = 1;

      // Excluir tracks ya usados en esta sesión
      if (sessionId) {
        query += ` AND t.id NOT IN (
          SELECT track_id FROM session_tracks
          WHERE session_id = $${paramCount}
        )`;
        params.push(sessionId);
        paramCount++;
      }

      // Filtro por género
      if (genre) {
        query += ` AND t.genre = $${paramCount}`;
        params.push(genre);
        paramCount++;
      }

      // Filtro por década
      if (decade) {
        query += ` AND t.decade = $${paramCount}`;
        params.push(decade);
        paramCount++;
      }

      // Filtro por dificultad
      if (difficulty) {
        query += ` AND t.difficulty = $${paramCount}`;
        params.push(difficulty);
        paramCount++;
      }

      // Ordenar aleatoriamente y limitar a 1
      query += ` ORDER BY RANDOM() LIMIT 1`;

      const result = await this.pool.query(query, params);

      if (result.rows.length === 0) {
        logger.warn(`⚠️ No hay tracks en BD con filtros: genre=${genre}, decade=${decade}, difficulty=${difficulty}`);
        return null;
      }

      const track = this.mapDBTrackToHitback(result.rows[0]);
      logger.info(`✅ Track obtenido de BD: "${track.title}" - ${track.artist}`);

      return track;

    } catch (error) {
      logger.error('❌ Error obteniendo track de BD:', error.message);
      return null;
    }
  }

  /**
   * Buscar tracks en Deezer y cachearlos en BD
   *
   * @param {Object} options - Filtros
   * @returns {Promise<Object>} - Primer track encontrado
   */
  async fetchAndCacheFromDeezer({ genre, decade }) {
    try {
      // Buscar en Deezer
      const tracks = await this.deezerService.searchTracks({
        genre,
        decade,
        limit: 25 // Obtener varios para cachear
      });

      if (tracks.length === 0) {
        throw new Error('No se encontraron tracks en Deezer con los filtros especificados');
      }

      logger.info(`📦 Cacheando ${tracks.length} tracks de Deezer en BD...`);

      // Guardar todos en BD
      for (const track of tracks) {
        await this.saveTrackToDB(track);
      }

      // Retornar el primero
      return tracks[0];

    } catch (error) {
      logger.error('❌ Error obteniendo tracks de Deezer:', error.message);

      // Fallback: retornar track genérico si falla todo
      return this.getFallbackTrack();
    }
  }

  /**
   * Guardar track en PostgreSQL
   *
   * @param {Object} track - Track en formato HITBACK
   * @returns {Promise<void>}
   */
  async saveTrackToDB(track) {
    try {
      const query = `
        INSERT INTO tracks (
          id, deezer_id, title, artist, album, year,
          genre, decade, difficulty, preview_url,
          cover_small, cover_medium, cover_large, explicit,
          duration, rank
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        ON CONFLICT (deezer_id) DO UPDATE SET
          preview_url = EXCLUDED.preview_url,
          updated_at = NOW()
      `;

      const values = [
        track.id,
        track.deezer_id,
        track.title,
        track.artist,
        track.album,
        track.year,
        track.genre,
        track.decade,
        track.difficulty,
        track.previewUrl,
        track.cover?.small,
        track.cover?.medium,
        track.cover?.large,
        track.explicit,
        track.duration,
        track.rank
      ];

      await this.pool.query(query, values);
      logger.debug(`💾 Track guardado: ${track.title}`);

    } catch (error) {
      logger.error(`❌ Error guardando track en BD:`, error.message);
    }
  }

  /**
   * Marcar track como usado en una sesión
   *
   * @param {string} sessionId - ID de la sesión
   * @param {string} trackId - ID del track
   * @returns {Promise<void>}
   */
  async markTrackAsUsed(sessionId, trackId) {
    try {
      const query = `
        INSERT INTO session_tracks (session_id, track_id, round_number)
        VALUES ($1, $2, (
          SELECT COALESCE(MAX(round_number), 0) + 1
          FROM session_tracks
          WHERE session_id = $1
        ))
        ON CONFLICT (session_id, track_id) DO NOTHING
      `;

      await this.pool.query(query, [sessionId, trackId]);
      logger.debug(`🔒 Track ${trackId} marcado como usado en sesión ${sessionId}`);

    } catch (error) {
      logger.error('❌ Error marcando track como usado:', error.message);
    }
  }

  /**
   * Obtener todos los tracks usados en una sesión
   *
   * @param {string} sessionId - ID de la sesión
   * @returns {Promise<Array>} - Array de track IDs
   */
  async getUsedTrackIds(sessionId) {
    try {
      const query = `
        SELECT track_id
        FROM session_tracks
        WHERE session_id = $1
        ORDER BY round_number ASC
      `;

      const result = await this.pool.query(query, [sessionId]);
      return result.rows.map(row => row.track_id);

    } catch (error) {
      logger.error('❌ Error obteniendo tracks usados:', error.message);
      return [];
    }
  }

  /**
   * Resetear tracks usados en una sesión (para replay)
   *
   * @param {string} sessionId - ID de la sesión
   * @returns {Promise<void>}
   */
  async resetSessionTracks(sessionId) {
    try {
      const query = 'DELETE FROM session_tracks WHERE session_id = $1';
      await this.pool.query(query, [sessionId]);
      logger.info(`🔄 Tracks reseteados para sesión ${sessionId}`);

    } catch (error) {
      logger.error('❌ Error reseteando tracks:', error.message);
    }
  }

  /**
   * Obtener estadísticas de tracks en BD
   *
   * @returns {Promise<Object>} - Estadísticas
   */
  async getStats() {
    try {
      const query = `
        SELECT
          COUNT(*) as total_tracks,
          COUNT(CASE WHEN preview_url IS NOT NULL THEN 1 END) as with_preview,
          COUNT(DISTINCT genre) as unique_genres,
          COUNT(DISTINCT decade) as unique_decades,
          AVG(duration) as avg_duration
        FROM tracks
      `;

      const result = await this.pool.query(query);
      return result.rows[0];

    } catch (error) {
      logger.error('❌ Error obteniendo estadísticas:', error.message);
      return null;
    }
  }

  /**
   * Obtener track por ID (BD o Deezer)
   *
   * @param {string} trackId - ID del track
   * @returns {Promise<Object>} - Track
   */
  async getTrackById(trackId) {
    try {
      // Verificar si es ID de Deezer (formato: dz_123456)
      if (trackId.startsWith('dz_')) {
        // Buscar primero en BD
        const query = 'SELECT * FROM tracks WHERE id = $1';
        const result = await this.pool.query(query, [trackId]);

        if (result.rows.length > 0) {
          return this.mapDBTrackToHitback(result.rows[0]);
        }

        // Si no está en BD, buscar en Deezer
        const deezerId = parseInt(trackId.replace('dz_', ''));
        const track = await this.deezerService.getTrackById(deezerId);

        // Guardar en BD
        await this.saveTrackToDB(track);

        return track;
      }

      // ID normal, buscar en BD
      const query = 'SELECT * FROM tracks WHERE id = $1';
      const result = await this.pool.query(query, [trackId]);

      if (result.rows.length === 0) {
        throw new Error(`Track ${trackId} no encontrado`);
      }

      return this.mapDBTrackToHitback(result.rows[0]);

    } catch (error) {
      logger.error(`❌ Error obteniendo track ${trackId}:`, error.message);
      throw error;
    }
  }

  /**
   * Buscar tracks por texto (título o artista)
   *
   * @param {string} searchText - Texto a buscar
   * @param {number} limit - Límite de resultados
   * @returns {Promise<Array>} - Array de tracks
   */
  async searchTracks(searchText, limit = 10) {
    try {
      const query = `
        SELECT *
        FROM tracks
        WHERE
          LOWER(title) LIKE LOWER($1)
          OR LOWER(artist) LIKE LOWER($1)
        ORDER BY rank DESC
        LIMIT $2
      `;

      const result = await this.pool.query(query, [`%${searchText}%`, limit]);

      return result.rows.map(row => this.mapDBTrackToHitback(row));

    } catch (error) {
      logger.error('❌ Error buscando tracks:', error.message);
      return [];
    }
  }

  /**
   * Mapear track de BD a formato HITBACK
   *
   * @param {Object} dbTrack - Track de PostgreSQL
   * @returns {Object} - Track en formato HITBACK
   */
  mapDBTrackToHitback(dbTrack) {
    return {
      id: dbTrack.id,
      deezer_id: dbTrack.deezer_id,
      title: dbTrack.title,
      artist: dbTrack.artist,
      album: dbTrack.album,
      year: dbTrack.year,
      genre: dbTrack.genre,
      decade: dbTrack.decade,
      difficulty: dbTrack.difficulty,
      audioSource: 'deezer',
      previewUrl: dbTrack.preview_url,
      hasAudio: !!dbTrack.preview_url,
      hasQuestions: true,
      availableCardTypes: ['song', 'artist', 'decade', 'year'],
      cover: {
        small: dbTrack.cover_small,
        medium: dbTrack.cover_medium,
        large: dbTrack.cover_large,
      },
      explicit: dbTrack.explicit,
      duration: dbTrack.duration,
      rank: dbTrack.rank
    };
  }

  /**
   * Track de fallback en caso de error total
   *
   * @returns {Object} - Track genérico
   */
  getFallbackTrack() {
    return {
      id: 'fallback_001',
      title: 'Track no disponible',
      artist: 'Sistema',
      genre: 'POP',
      decade: '2020s',
      difficulty: 'EASY',
      audioSource: 'local',
      previewUrl: null,
      hasAudio: false,
      hasQuestions: true,
      availableCardTypes: ['song', 'artist'],
      year: 2024
    };
  }

  /**
   * Verificar salud del servicio
   *
   * @returns {Promise<Object>} - Estado del servicio
   */
  async healthCheck() {
    const health = {
      database: 'unknown',
      deezer: 'unknown',
      tracksInDB: 0
    };

    // Check PostgreSQL
    try {
      const result = await this.pool.query('SELECT COUNT(*) FROM tracks');
      health.database = 'healthy';
      health.tracksInDB = parseInt(result.rows[0].count);
    } catch (error) {
      health.database = 'unhealthy';
    }

    // Check Deezer
    const deezerHealth = await this.deezerService.healthCheck();
    health.deezer = deezerHealth.status;

    return health;
  }

  /**
   * 🔄 FALLBACK: Obtener track aleatorio usando cache en memoria
   */
  async getRandomTrackFromMemory({ sessionId, genre, decade }) {
    try {
      // Obtener tracks usados en esta sesión
      const usedTracks = this.memoryCache.get(sessionId) || new Set();

      // Buscar en Deezer
      const deezerTracks = await this.deezerService.searchTracks({
        genre,
        decade,
        limit: 25
      });

      if (deezerTracks.length === 0) {
        throw new Error('No se encontraron tracks en Deezer');
      }

      // Filtrar tracks ya usados
      const availableTracks = deezerTracks.filter(t => !usedTracks.has(t.id));

      // Si todos fueron usados, resetear
      if (availableTracks.length === 0) {
        logger.warn(`⚠️ Todos los tracks fueron usados en sesión ${sessionId}, reseteando...`);
        usedTracks.clear();
        this.memoryCache.set(sessionId, usedTracks);
        return deezerTracks[0]; // Retornar el primero
      }

      // Seleccionar uno aleatorio
      const randomTrack = availableTracks[Math.floor(Math.random() * availableTracks.length)];

      // Marcar como usado en memoria
      usedTracks.add(randomTrack.id);
      this.memoryCache.set(sessionId, usedTracks);

      // Guardar en cache de memoria
      this.memoryTracks.set(randomTrack.id, randomTrack);

      logger.info(`✅ Track de memoria: "${randomTrack.title}" - ${randomTrack.artist}`);
      logger.info(`📊 Tracks usados en sesión: ${usedTracks.size}/${deezerTracks.length}`);

      return randomTrack;

    } catch (error) {
      logger.error('❌ Error obteniendo track de memoria:', error.message);
      return this.getFallbackTrack();
    }
  }

  /**
   * 🔄 FALLBACK: Resetear tracks usados en memoria
   */
  resetSessionTracksMemory(sessionId) {
    if (this.memoryCache.has(sessionId)) {
      this.memoryCache.delete(sessionId);
      logger.info(`🔄 Tracks en memoria reseteados para sesión ${sessionId}`);
    }
  }

  /**
   * Cerrar conexión a BD (cleanup)
   */
  async close() {
    if (this.dbAvailable) {
      await this.pool.end();
      logger.info('🔌 PostgreSQL desconectado');
    }
  }
}

module.exports = TrackServiceV2;
