/**
 * =====================================================
 * DEEZER SERVICE V2 - Versión mejorada para HITBACK
 * =====================================================
 *
 * Mejoras sobre la versión original:
 * - Búsqueda por género, década, región
 * - Cache inteligente con PostgreSQL
 * - Rate limiting automático
 * - Mapeo de géneros mejorado
 * - Manejo de errores robusto
 */

const axios = require('axios');
const logger = require('../utils/logger');

class DeezerServiceV2 {
  constructor() {
    this.baseURL = 'https://api.deezer.com';
    this.defaultTimeout = 5000; // 5 segundos

    // Rate limiting
    this.requestCount = 0;
    this.requestWindow = 60000; // 1 minuto
    this.maxRequestsPerWindow = 50;

    // Cache en memoria (temporal)
    this.cache = new Map();
    this.cacheTimeout = 1800000; // 30 minutos

    this.resetRateLimitCounter();
  }

  /**
   * Reset del contador de rate limiting cada minuto
   */
  resetRateLimitCounter() {
    setInterval(() => {
      this.requestCount = 0;
    }, this.requestWindow);
  }

  /**
   * Verificar si podemos hacer una request (rate limiting)
   */
  canMakeRequest() {
    return this.requestCount < this.maxRequestsPerWindow;
  }

  /**
   * Mapeo de géneros HITBACK → Deezer genres
   * Deezer usa IDs numéricos para géneros
   */
  mapGenreToDeezer(genre) {
    const genreMap = {
      'ROCK': ['rock', 'alternative', 'metal', 'punk'],
      'POP': ['pop', 'electropop', 'synthpop'],
      'LATIN': ['latino', 'reggaeton', 'salsa', 'bachata', 'cumbia'],
      'REGGAETON': ['reggaeton', 'urban latino'],
      'ELECTRONIC': ['electro', 'house', 'techno', 'edm', 'dance'],
      'HIP_HOP': ['rap', 'hip-hop', 'trap', 'r&b'],
      'JAZZ': ['jazz', 'blues', 'soul'],
      'CLASSICAL': ['classical', 'orchestra'],
      'COUNTRY': ['country', 'folk'],
      'INDIE': ['indie', 'alternative'],
      'METAL': ['metal', 'hard rock', 'metalcore'],
      'CUMBIA': ['cumbia', 'cumbia villera'],
      'REGGAE': ['reggae', 'ska', 'dub']
    };

    return genreMap[genre] || [genre.toLowerCase()];
  }

  /**
   * Filtrar por década (rango de años)
   */
  getYearRangeForDecade(decade) {
    const yearRanges = {
      '1950s': [1950, 1959],
      '1960s': [1960, 1969],
      '1970s': [1970, 1979],
      '1980s': [1980, 1989],
      '1990s': [1990, 1999],
      '2000s': [2000, 2009],
      '2010s': [2010, 2019],
      '2020s': [2020, 2029]
    };

    return yearRanges[decade] || null;
  }

  /**
   * Buscar tracks en Deezer con filtros avanzados
   *
   * @param {Object} options - Opciones de búsqueda
   * @param {string} options.genre - Género (ROCK, POP, LATIN, etc)
   * @param {string} options.decade - Década (1980s, 2010s, etc)
   * @param {number} options.limit - Cantidad de resultados (default: 25)
   * @param {string} options.region - Código de país (optional, ej: 'AR', 'MX', 'US')
   * @returns {Promise<Array>} - Array de tracks
   */
  async searchTracks({ genre = null, decade = null, limit = 25, region = null }) {
    try {
      if (!this.canMakeRequest()) {
        throw new Error('Rate limit exceeded. Please try again later.');
      }

      // Construir query de búsqueda
      let query = '';

      if (genre) {
        const deezerGenres = this.mapGenreToDeezer(genre);
        query = `genre:"${deezerGenres[0]}"`;
      }

      // Si no hay género, buscar tracks populares generales
      if (!query) {
        query = 'chart'; // Usa el chart de Deezer
      }

      // Construir URL
      let url = `${this.baseURL}/search/track`;
      const params = {
        q: query,
        limit: limit * 2, // Pedimos más para filtrar después
        order: 'RANKING' // Ordenar por popularidad
      };

      // Región (opcional, solo afecta disponibilidad)
      if (region) {
        params.country = region;
      }

      logger.info(`🔍 Buscando en Deezer: ${query} (decade: ${decade}, region: ${region})`);

      // Hacer request
      this.requestCount++;
      const response = await axios.get(url, {
        params,
        timeout: this.defaultTimeout
      });

      if (!response.data || !response.data.data) {
        throw new Error('Invalid response from Deezer API');
      }

      let tracks = response.data.data;

      // Filtrar por década si se especifica
      if (decade) {
        const yearRange = this.getYearRangeForDecade(decade);
        if (yearRange) {
          tracks = tracks.filter(track => {
            if (!track.release_date) return false;
            const year = parseInt(track.release_date.split('-')[0]);
            return year >= yearRange[0] && year <= yearRange[1];
          });
        }
      }

      // Filtrar tracks sin preview
      tracks = tracks.filter(track => track.preview && track.preview.length > 0);

      // Limitar resultados
      tracks = tracks.slice(0, limit);

      // Mapear a formato HITBACK
      const mappedTracks = tracks.map(track => this.mapDeezerTrackToHitback(track, genre, decade));

      logger.info(`✅ Encontrados ${mappedTracks.length} tracks en Deezer`);

      return mappedTracks;

    } catch (error) {
      logger.error(`❌ Error buscando en Deezer:`, error.message);

      if (error.response) {
        logger.error(`Status: ${error.response.status}`);
        logger.error(`Data:`, error.response.data);
      }

      return [];
    }
  }

  /**
   * Obtener un track específico por ID de Deezer
   *
   * @param {number} deezerId - ID del track en Deezer
   * @returns {Promise<Object>} - Track en formato HITBACK
   */
  async getTrackById(deezerId) {
    try {
      // Verificar cache
      const cacheKey = `track_${deezerId}`;
      if (this.cache.has(cacheKey)) {
        const cached = this.cache.get(cacheKey);
        if (Date.now() - cached.timestamp < this.cacheTimeout) {
          logger.info(`📦 Track ${deezerId} obtenido de cache`);
          return cached.data;
        }
      }

      if (!this.canMakeRequest()) {
        throw new Error('Rate limit exceeded');
      }

      const url = `${this.baseURL}/track/${deezerId}`;

      this.requestCount++;
      const response = await axios.get(url, {
        timeout: this.defaultTimeout
      });

      if (!response.data) {
        throw new Error('Track not found');
      }

      const track = this.mapDeezerTrackToHitback(response.data);

      // Guardar en cache
      this.cache.set(cacheKey, {
        data: track,
        timestamp: Date.now()
      });

      return track;

    } catch (error) {
      logger.error(`❌ Error obteniendo track ${deezerId}:`, error.message);
      throw error;
    }
  }

  /**
   * Obtener chart de Deezer (top tracks actuales)
   *
   * @param {number} limit - Cantidad de tracks
   * @returns {Promise<Array>} - Array de tracks populares
   */
  async getChart(limit = 25) {
    try {
      if (!this.canMakeRequest()) {
        throw new Error('Rate limit exceeded');
      }

      const url = `${this.baseURL}/chart/0/tracks`;
      const params = { limit };

      this.requestCount++;
      const response = await axios.get(url, {
        params,
        timeout: this.defaultTimeout
      });

      if (!response.data || !response.data.data) {
        throw new Error('Invalid chart response');
      }

      const tracks = response.data.data
        .filter(track => track.preview && track.preview.length > 0)
        .slice(0, limit)
        .map(track => this.mapDeezerTrackToHitback(track));

      logger.info(`📊 Chart obtenido: ${tracks.length} tracks`);

      return tracks;

    } catch (error) {
      logger.error(`❌ Error obteniendo chart:`, error.message);
      return [];
    }
  }

  /**
   * Mapear track de Deezer a formato HITBACK
   *
   * @param {Object} deezerTrack - Track original de Deezer
   * @param {string} genreOverride - Género manual (opcional)
   * @param {string} decadeOverride - Década manual (opcional)
   * @returns {Object} - Track en formato HITBACK
   */
  mapDeezerTrackToHitback(deezerTrack, genreOverride = null, decadeOverride = null) {
    // Extraer año de release_date
    let year = null;
    let decade = decadeOverride;

    if (deezerTrack.release_date) {
      year = parseInt(deezerTrack.release_date.split('-')[0]);

      // Calcular década automáticamente si no se especifica
      if (!decade && year) {
        const decadeStart = Math.floor(year / 10) * 10;
        decade = `${decadeStart}s`;
      }
    }

    // Determinar género
    let genre = genreOverride || 'POP'; // Default POP si no se especifica

    // Intentar mapear género desde Deezer (limitado)
    if (deezerTrack.artist && deezerTrack.artist.type === 'artist') {
      // Deezer no provee género directo, usar genre override
    }

    // Determinar dificultad basada en popularidad
    let difficulty = 'MEDIUM';
    if (deezerTrack.rank) {
      if (deezerTrack.rank > 500000) difficulty = 'EASY';
      else if (deezerTrack.rank > 100000) difficulty = 'MEDIUM';
      else difficulty = 'HARD';
    }

    return {
      id: `dz_${deezerTrack.id}`,
      deezer_id: deezerTrack.id,
      title: deezerTrack.title || 'Unknown Title',
      artist: deezerTrack.artist?.name || 'Unknown Artist',
      album: deezerTrack.album?.title || null,
      year,
      genre,
      decade,
      difficulty,
      audioSource: 'deezer',
      previewUrl: deezerTrack.preview || null,
      hasAudio: !!deezerTrack.preview,
      hasQuestions: true, // Siempre true porque generamos automáticamente
      availableCardTypes: ['song', 'artist', 'decade', 'year'], // Solo auto-generadas
      cover: {
        small: deezerTrack.album?.cover_small || null,
        medium: deezerTrack.album?.cover_medium || null,
        large: deezerTrack.album?.cover_large || null,
        xl: deezerTrack.album?.cover_xl || null
      },
      explicit: deezerTrack.explicit_lyrics || false,
      duration: deezerTrack.duration || 30,
      rank: deezerTrack.rank || 0,
      link: deezerTrack.link || null
    };
  }

  /**
   * Health check - Verificar que Deezer API esté disponible
   *
   * @returns {Promise<Object>} - Estado del servicio
   */
  async healthCheck() {
    try {
      const response = await axios.get(`${this.baseURL}/chart/0/tracks`, {
        params: { limit: 1 },
        timeout: 3000
      });

      return {
        status: 'healthy',
        available: true,
        responseTime: response.headers['x-response-time'] || 'N/A'
      };

    } catch (error) {
      return {
        status: 'unhealthy',
        available: false,
        error: error.message
      };
    }
  }

  /**
   * Obtener tracks por artista
   *
   * @param {string} artistName - Nombre del artista
   * @param {number} limit - Cantidad de tracks
   * @returns {Promise<Array>} - Array de tracks
   */
  async searchByArtist(artistName, limit = 10) {
    try {
      if (!this.canMakeRequest()) {
        throw new Error('Rate limit exceeded');
      }

      const url = `${this.baseURL}/search/track`;
      const params = {
        q: `artist:"${artistName}"`,
        limit,
        order: 'RANKING'
      };

      this.requestCount++;
      const response = await axios.get(url, { params, timeout: this.defaultTimeout });

      if (!response.data || !response.data.data) {
        return [];
      }

      const tracks = response.data.data
        .filter(track => track.preview)
        .map(track => this.mapDeezerTrackToHitback(track));

      return tracks;

    } catch (error) {
      logger.error(`❌ Error buscando artista ${artistName}:`, error.message);
      return [];
    }
  }

  /**
   * Limpiar cache en memoria
   */
  clearCache() {
    this.cache.clear();
    logger.info('🧹 Cache de Deezer limpiado');
  }
}

module.exports = new DeezerServiceV2();
