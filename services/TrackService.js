/**
 * 🎵 Track Service - Sistema Escalable ACTUALIZADO
 * ✅ Soporta filtros del formato nuevo: genre, decade, difficulty
 * ✅ Selección aleatoria inteligente con fallbacks
 * ✅ NUEVO: Sistema anti-duplicados por partida
 */

const fs = require('fs');
const path = require('path');
const DeezerServiceV2 = require('./DeezerServiceV2');

class TrackService {
  constructor() {
    this.tracks = [];
    this.tracksPath = this.findTracksPath();
    this.loadTracks();

    // ✅ NUEVO: Set para tracks usados en la partida actual
    this.usedTrackIds = new Set();

    // 🔄 NUEVO: Sistema híbrido con Deezer
    this.deezerService = DeezerServiceV2;
    this.deezerTracksAdded = 0; // Contador de tracks agregados desde Deezer
  }

  // ═══════════════════════════════════════════════════════════
  // ✅ NUEVOS MÉTODOS PARA EVITAR DUPLICADOS
  // ═══════════════════════════════════════════════════════════

  /**
   * 📌 Marcar track como usado
   */
  markTrackAsUsed(trackId) {
    this.usedTrackIds.add(trackId);
    console.log(`📌 Track marcado como usado: ${trackId}`);
    console.log(`   Usados: ${this.usedTrackIds.size}/${this.tracks.length}`);
  }

  /**
   * ❓ Verificar si un track ya fue usado
   */
  isTrackUsed(trackId) {
    return this.usedTrackIds.has(trackId);
  }

  /**
   * 🔄 Reiniciar tracks usados (llamar al iniciar nueva partida)
   */
  resetUsedTracks() {
    const previousCount = this.usedTrackIds.size;
    this.usedTrackIds.clear();
    console.log(`🔄 Tracks usados reseteados (${previousCount} → 0)`);
  }

  /**
   * 🔄 NUEVO: Buscar más tracks en Deezer y agregarlos al pool
   */
  async fetchMoreTracksFromDeezer(genre = null, decade = null) {
    try {
      console.log(`📡 Buscando tracks en Deezer (género: ${genre}, década: ${decade})...`);

      const deezerTracks = await this.deezerService.searchTracks({
        genre: genre || null,
        decade: decade || null,
        limit: 25
      });

      if (deezerTracks.length === 0) {
        console.log(`⚠️ Deezer no retornó tracks`);
        return;
      }

      // Convertir tracks de Deezer al formato interno
      const newTracks = deezerTracks.map(dt => ({
        id: dt.id,
        title: dt.title,
        artist: dt.artist,
        album: dt.album,
        year: dt.year,
        genre: dt.genre || genre || 'POP',
        decade: dt.decade || decade || this.calculateDecade(dt.year),
        difficulty: dt.difficulty || 'MEDIUM',
        audioSource: 'deezer',
        hasAudio: true,
        hasQuestions: true,
        availableCardTypes: ['song', 'artist', 'decade', 'year'],
        // 🔥 IMPORTANTE: Guardar el previewUrl para usarlo directamente
        previewUrl: dt.previewUrl,
        cover: dt.cover
      }));

      // Agregar al pool de tracks
      this.tracks.push(...newTracks);
      this.deezerTracksAdded += newTracks.length;

      console.log(`✅ ${newTracks.length} tracks agregados desde Deezer`);
      console.log(`📊 Total tracks en pool: ${this.tracks.length} (${this.deezerTracksAdded} desde Deezer)`);

    } catch (error) {
      console.error(`❌ Error buscando en Deezer:`, error.message);
    }
  }

  /**
   * 📅 Calcular década a partir del año
   */
  calculateDecade(year) {
    if (!year) return null;
    const decadeStart = Math.floor(year / 10) * 10;
    return `${decadeStart}s`;
  }

  /**
   * 📊 Obtener estado de tracks usados
   */
  getUsedTracksStatus() {
    return {
      total: this.tracks.length,
      used: this.usedTrackIds.size,
      available: this.tracks.length - this.usedTrackIds.size,
      usedIds: Array.from(this.usedTrackIds)
    };
  }

  // ═══════════════════════════════════════════════════════════
  // MÉTODOS EXISTENTES (SIN CAMBIOS)
  // ═══════════════════════════════════════════════════════════

  /**
   * 📂 Encontrar la ruta correcta de tracks.json
   */
  findTracksPath() {
    const possiblePaths = [
      path.join(process.cwd(), 'data/tracks.json'),
      path.join(__dirname, '../data/tracks.json'),
      path.join(__dirname, './data/tracks.json'),
      path.join(process.cwd(), 'tracks.json'),
      path.join(__dirname, 'tracks.json'),
    ];

    for (const filePath of possiblePaths) {
      if (fs.existsSync(filePath)) {
        console.log(`✅ tracks.json encontrado: ${filePath}`);
        return filePath;
      }
    }

    console.error('❌ tracks.json no encontrado en ninguna ubicación');
    return null;
  }

  /**
   * 📂 Cargar tracks desde JSON
   */
  loadTracks() {
    if (!this.tracksPath) {
      this.tracks = [];
      return;
    }

    try {
      const data = fs.readFileSync(this.tracksPath, 'utf8');
      const parsed = JSON.parse(data);

      if (Array.isArray(parsed)) {
        this.tracks = parsed;
      } else if (parsed.tracks && Array.isArray(parsed.tracks)) {
        this.tracks = parsed.tracks;
      } else {
        throw new Error('Formato inválido de tracks.json');
      }

      console.log(`✅ ${this.tracks.length} tracks cargados`);
      this.logDistribution();

    } catch (error) {
      console.error('❌ Error cargando tracks:', error.message);
      this.tracks = [];
    }
  }

  /**
   * 📊 Mostrar distribución
   */
  logDistribution() {
    const byGenre = this.groupBy(this.tracks, 'genre');
    const byDifficulty = this.groupBy(this.tracks, 'difficulty');
    const byDecade = this.groupBy(this.tracks, 'decade');

    console.log('\n📊 Distribución de tracks:');
    console.log('   Géneros:', Object.keys(byGenre).length);
    console.log('   Décadas:', Object.keys(byDecade).length);
    console.log('   Dificultades:', Object.keys(byDifficulty).length);
  }

  // ═══════════════════════════════════════════════════════════
  // 🎲 MÉTODO PRINCIPAL MODIFICADO - AHORA EXCLUYE DUPLICADOS
  // ═══════════════════════════════════════════════════════════

  /**
   * 🎲 OBTENER TRACK ALEATORIO CON FILTROS (MÉTODO PRINCIPAL)
   * ✅ MODIFICADO: Ahora excluye tracks ya usados
   * 🔄 NUEVO: Busca en Deezer cuando se queda sin tracks
   * @param {Object} filters - { difficulty, genre, decade }
   */
  async getRandomTrack(filters = {}) {
    console.log(`\n🎲 Buscando track con filtros:`, filters);

    let pool = [...this.tracks];
    const originalSize = pool.length;

    // ✅ NUEVO: Filtro 0 - Excluir tracks ya usados
    pool = pool.filter(t => !this.usedTrackIds.has(t.id));
    console.log(`   ├─ Excluyendo usados: ${pool.length}/${originalSize} disponibles`);

    // 🔄 NUEVO: Si ya usamos todos los tracks, buscar más en Deezer
    if (pool.length === 0) {
      console.log(`⚠️ Todos los tracks usados. Buscando más en Deezer...`);
      await this.fetchMoreTracksFromDeezer(filters.genre, filters.decade);
      // Después de agregar de Deezer, volver a construir pool
      pool = [...this.tracks];
      pool = pool.filter(t => !this.usedTrackIds.has(t.id));
      console.log(`   ✅ Tracks nuevos disponibles: ${pool.length}`);

      // Si aún así no hay tracks, resetear
      if (pool.length === 0) {
        console.log(`⚠️ Sin tracks disponibles incluso desde Deezer. Reseteando...`);
        this.resetUsedTracks();
        pool = [...this.tracks];
      }
    }

    // Filtro 1: Dificultad
    if (filters.difficulty && filters.difficulty !== 'ANY') {
      const diffLower = filters.difficulty.toLowerCase();
      pool = pool.filter(t =>
        t.difficulty && t.difficulty.toLowerCase() === diffLower
      );
      console.log(`   ├─ Dificultad "${filters.difficulty}": ${pool.length} tracks`);
    }

    // Filtro 2: Género
    if (filters.genre && filters.genre !== 'ANY') {
      const genreUpper = filters.genre.toUpperCase();
      pool = pool.filter(t =>
        t.genre && t.genre.toUpperCase() === genreUpper
      );
      console.log(`   ├─ Género "${filters.genre}": ${pool.length} tracks`);
    }

    // Filtro 3: Década
    if (filters.decade && filters.decade !== 'ANY') {
      pool = pool.filter(t => t.decade === filters.decade);
      console.log(`   └─ Década "${filters.decade}": ${pool.length} tracks`);
    }

    // Si no hay resultados después de filtros, usar fallback
    if (pool.length === 0) {
      console.log(`⚠️ Sin coincidencias exactas (0/${originalSize}), usando fallback...`);
      return this.getFallbackTrack(filters);
    }

    // Selección aleatoria
    const randomIndex = Math.floor(Math.random() * pool.length);
    const selected = pool[randomIndex];

    // ✅ NUEVO: Marcar como usado ANTES de retornar
    this.markTrackAsUsed(selected.id);

    console.log(`✅ Seleccionado: "${selected.title}" - ${selected.artist}`);
    console.log(`   Pool: ${pool.length}/${originalSize} tracks\n`);

    return selected;
  }

  // ═══════════════════════════════════════════════════════════
  // 🔄 FALLBACK MODIFICADO - TAMBIÉN EXCLUYE DUPLICADOS
  // ═══════════════════════════════════════════════════════════

  /**
   * 🔄 Fallback cuando no hay coincidencias exactas
   * ✅ MODIFICADO: También excluye tracks usados
   */
  getFallbackTrack(filters) {
    // Intento 1: Solo dificultad (excluyendo usados)
    if (filters.difficulty && filters.difficulty !== 'ANY') {
      const pool = this.tracks.filter(t =>
        t.difficulty &&
        t.difficulty.toLowerCase() === filters.difficulty.toLowerCase() &&
        !this.usedTrackIds.has(t.id)
      );
      if (pool.length > 0) {
        console.log(`   Fallback 1 (solo dificultad): ${pool.length} tracks`);
        const selected = pool[Math.floor(Math.random() * pool.length)];
        this.markTrackAsUsed(selected.id);
        return selected;
      }
    }

    // Intento 2: Solo género (excluyendo usados)
    if (filters.genre && filters.genre !== 'ANY') {
      const pool = this.tracks.filter(t =>
        t.genre &&
        t.genre.toUpperCase() === filters.genre.toUpperCase() &&
        !this.usedTrackIds.has(t.id)
      );
      if (pool.length > 0) {
        console.log(`   Fallback 2 (solo género): ${pool.length} tracks`);
        const selected = pool[Math.floor(Math.random() * pool.length)];
        this.markTrackAsUsed(selected.id);
        return selected;
      }
    }

    // Intento 3: Cualquier track NO usado
    const availableTracks = this.tracks.filter(t => !this.usedTrackIds.has(t.id));

    if (availableTracks.length > 0) {
      console.log(`   Fallback 3: Track aleatorio de ${availableTracks.length} disponibles`);
      const selected = availableTracks[Math.floor(Math.random() * availableTracks.length)];
      this.markTrackAsUsed(selected.id);
      return selected;
    }

    // Último recurso: Resetear y usar cualquiera
    console.log(`⚠️ No quedan tracks disponibles. Reseteando...`);
    this.resetUsedTracks();
    const selected = this.tracks[Math.floor(Math.random() * this.tracks.length)];
    this.markTrackAsUsed(selected.id);
    return selected;
  }

  // ═══════════════════════════════════════════════════════════
  // RESTO DE MÉTODOS (SIN CAMBIOS)
  // ═══════════════════════════════════════════════════════════

  /**
   * 🔍 Buscar track por ID (compatibilidad con formato antiguo)
   */
  getTrackById(id) {
    if (!id) {
      throw new Error('ID de track requerido');
    }

    const normalizedId = String(id).padStart(3, '0');

    let track = this.tracks.find(t => t.id === id);

    if (!track) {
      track = this.tracks.find(t => t.id === normalizedId);
    }

    if (!track) {
      throw new Error(`Track con ID "${id}" no encontrado`);
    }

    return track;
  }

  /**
   * 📋 Obtener todos los tracks
   */
  getAllTracks() {
    return [...this.tracks];
  }

  /**
   * 🔍 Buscar tracks por criterios
   */
  searchTracks(filters = {}) {
    let results = [...this.tracks];

    if (filters.query) {
      const q = filters.query.toLowerCase();
      results = results.filter(t =>
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q)
      );
    }

    if (filters.genre && filters.genre !== 'ANY') {
      results = results.filter(t => t.genre === filters.genre);
    }

    if (filters.decade && filters.decade !== 'ANY') {
      results = results.filter(t => t.decade === filters.decade);
    }

    if (filters.difficulty && filters.difficulty !== 'ANY') {
      results = results.filter(t =>
        t.difficulty && t.difficulty.toLowerCase() === filters.difficulty.toLowerCase()
      );
    }

    return results;
  }

  /**
   * 📊 Obtener estadísticas
   */
  getStats() {
    return {
      total: this.tracks.length,
      byGenre: this.groupBy(this.tracks, 'genre'),
      byDecade: this.groupBy(this.tracks, 'decade'),
      byDifficulty: this.groupBy(this.tracks, 'difficulty'),
      withQuestions: this.tracks.filter(t => t.questions).length,
      withAudio: this.tracks.filter(t => t.hasAudio).length,
      // ✅ NUEVO: Incluir estado de tracks usados
      usedTracks: this.getUsedTracksStatus()
    };
  }

  /**
   * 📊 Estadísticas de un pool filtrado
   */
  getPoolStats(filters = {}) {
    const pool = this.searchTracks(filters);

    return {
      total: pool.length,
      byGenre: this.groupBy(pool, 'genre'),
      byDecade: this.groupBy(pool, 'decade'),
      byDifficulty: this.groupBy(pool, 'difficulty')
    };
  }

  /**
   * 🔧 Helper: Agrupar por campo
   */
  groupBy(array, key) {
    return array.reduce((result, item) => {
      const value = item[key] || 'Unknown';
      result[value] = (result[value] || 0) + 1;
      return result;
    }, {});
  }

  /**
   * 🔄 Recargar tracks
   */
  reload() {
    console.log('🔄 Recargando tracks...');
    this.loadTracks();
    // También resetear usados al recargar
    this.resetUsedTracks();
  }

  /**
   * ✅ Validar datos de un track
   */
  validateTrackData(track) {
    const errors = [];
    const warnings = [];

    if (!track.id) errors.push('Falta ID');
    if (!track.title) errors.push('Falta título');
    if (!track.artist) errors.push('Falta artista');
    if (!track.genre) warnings.push('Falta género');
    if (!track.decade) warnings.push('Falta década');
    if (!track.difficulty) warnings.push('Falta dificultad');
    if (!track.questions) warnings.push('Faltan preguntas');

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * 🏥 Health check
   */
  async healthCheck() {
    return {
      status: this.tracks.length > 0 ? 'healthy' : 'error',
      totalTracks: this.tracks.length,
      hasData: this.tracks.length > 0,
      distribution: {
        genres: Object.keys(this.groupBy(this.tracks, 'genre')).length,
        decades: Object.keys(this.groupBy(this.tracks, 'decade')).length,
        difficulties: Object.keys(this.groupBy(this.tracks, 'difficulty')).length
      },
      // ✅ NUEVO
      usedTracks: this.getUsedTracksStatus()
    };
  }
}

// Exportar como singleton
module.exports = new TrackService();