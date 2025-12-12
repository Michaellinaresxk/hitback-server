/**
 * 🎵 Track Service - Sistema Escalable ACTUALIZADO
 * ✅ Soporta filtros del formato nuevo: genre, decade, difficulty
 * ✅ Selección aleatoria inteligente con fallbacks
 */

const fs = require('fs');
const path = require('path');

class TrackService {
  constructor() {
    this.tracks = [];
    this.tracksPath = this.findTracksPath();
    this.loadTracks();
  }

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

      // Soportar diferentes estructuras
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

  /**
   * 🎲 OBTENER TRACK ALEATORIO CON FILTROS (MÉTODO PRINCIPAL)
   * @param {Object} filters - { difficulty, genre, decade }
   */
  getRandomTrack(filters = {}) {
    console.log(`\n🎲 Buscando track con filtros:`, filters);

    let pool = [...this.tracks];
    const originalSize = pool.length;

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

    // Si no hay resultados, usar fallback
    if (pool.length === 0) {
      console.log(`⚠️ Sin coincidencias exactas (0/${originalSize}), usando fallback...`);
      return this.getFallbackTrack(filters);
    }

    // Selección aleatoria
    const randomIndex = Math.floor(Math.random() * pool.length);
    const selected = pool[randomIndex];

    console.log(`✅ Seleccionado: "${selected.title}" - ${selected.artist}`);
    console.log(`   Pool: ${pool.length}/${originalSize} tracks\n`);

    return selected;
  }

  /**
   * 🔄 Fallback cuando no hay coincidencias exactas
   */
  getFallbackTrack(filters) {
    // Intento 1: Solo dificultad
    if (filters.difficulty && filters.difficulty !== 'ANY') {
      const pool = this.tracks.filter(t =>
        t.difficulty && t.difficulty.toLowerCase() === filters.difficulty.toLowerCase()
      );
      if (pool.length > 0) {
        console.log(`   Fallback 1 (solo dificultad): ${pool.length} tracks`);
        return pool[Math.floor(Math.random() * pool.length)];
      }
    }

    // Intento 2: Solo género
    if (filters.genre && filters.genre !== 'ANY') {
      const pool = this.tracks.filter(t =>
        t.genre && t.genre.toUpperCase() === filters.genre.toUpperCase()
      );
      if (pool.length > 0) {
        console.log(`   Fallback 2 (solo género): ${pool.length} tracks`);
        return pool[Math.floor(Math.random() * pool.length)];
      }
    }

    // Intento 3: Cualquier track
    console.log(`   Fallback 3: Track completamente aleatorio`);
    return this.tracks[Math.floor(Math.random() * this.tracks.length)];
  }

  /**
   * 🔍 Buscar track por ID (compatibilidad con formato antiguo)
   */
  getTrackById(id) {
    if (!id) {
      throw new Error('ID de track requerido');
    }

    // Normalizar ID (agregar ceros si es necesario)
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
      withAudio: this.tracks.filter(t => t.hasAudio).length
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
      }
    };
  }
}

// Exportar como singleton
module.exports = new TrackService();