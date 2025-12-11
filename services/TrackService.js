/**
 * 🎵 Track Service - Sistema de Filtros Escalable (ACTUALIZADO)
 * Compatible con el nuevo sistema de 60 cartas + 300 canciones
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
      path.join(__dirname, '../../data/tracks.json'),
      path.join(process.cwd(), 'tracks.json'),
      path.join(__dirname, '../tracks.json'),
    ];

    for (const filePath of possiblePaths) {
      if (fs.existsSync(filePath)) {
        console.log(`✅ tracks.json encontrado en: ${filePath}`);
        return filePath;
      }
    }

    throw new Error('❌ tracks.json no encontrado en ninguna ubicación esperada');
  }

  /**
   * 📂 Cargar tracks desde JSON
   */
  loadTracks() {
    try {
      const data = fs.readFileSync(this.tracksPath, 'utf8');
      const parsed = JSON.parse(data);

      // Extraer array de tracks
      if (Array.isArray(parsed)) {
        this.tracks = parsed;
      } else if (parsed.tracks && Array.isArray(parsed.tracks)) {
        this.tracks = parsed.tracks;
      } else {
        throw new Error('Formato inválido de tracks.json');
      }

      console.log(`✅ ${this.tracks.length} tracks cargados`);

      // Mostrar distribución
      this.logDistribution();

    } catch (error) {
      console.error('❌ Error cargando tracks:', error.message);
      this.tracks = [];
    }
  }

  /**
   * 📊 Mostrar distribución de canciones
   */
  logDistribution() {
    const byGenre = this.groupBy(this.tracks, 'genre');
    const byDifficulty = this.groupBy(this.tracks, 'difficulty');
    const byDecade = this.groupBy(this.tracks, 'decade');

    console.log('\n📊 Distribución de canciones:');
    console.log('Por género:', byGenre);
    console.log('Por dificultad:', byDifficulty);
    console.log('Por década:', byDecade);
    console.log('');
  }

  /**
   * 🎲 Obtener track aleatorio con filtros (MÉTODO PRINCIPAL)
   * @param {Object} filters - Filtros de búsqueda
   * @returns {Object} Track seleccionado
   */
  getRandomTrack(filters = {}) {
    console.log(`\n🔍 Buscando track con filtros:`, filters);

    let pool = [...this.tracks];

    // Filtro 1: Dificultad
    if (filters.difficulty && filters.difficulty !== 'ANY') {
      pool = pool.filter(t => t.difficulty === filters.difficulty);
      console.log(`   ├─ Filtrado por dificultad ${filters.difficulty}: ${pool.length} tracks`);
    }

    // Filtro 2: Género
    if (filters.genre && filters.genre !== 'ANY') {
      pool = pool.filter(t => t.genre === filters.genre);
      console.log(`   ├─ Filtrado por género ${filters.genre}: ${pool.length} tracks`);
    }

    // Filtro 3: Década
    if (filters.decade && filters.decade !== 'ANY') {
      pool = pool.filter(t => t.decade === filters.decade);
      console.log(`   └─ Filtrado por década ${filters.decade}: ${pool.length} tracks`);
    }

    // Validar que haya resultados
    if (pool.length === 0) {
      console.warn('⚠️ No hay tracks con esos filtros, usando fallback');
      return this.getFallbackTrack(filters);
    }

    // Selección aleatoria
    const randomIndex = Math.floor(Math.random() * pool.length);
    const selectedTrack = pool[randomIndex];

    console.log(`✅ Track seleccionado: "${selectedTrack.title}" - ${selectedTrack.artist}`);
    console.log(`   (ID: ${selectedTrack.id}, ${selectedTrack.genre}, ${selectedTrack.decade}, ${selectedTrack.difficulty})\n`);

    return selectedTrack;
  }

  /**
   * 🔄 Fallback si no hay resultados
   */
  getFallbackTrack(filters) {
    console.log('🔄 Aplicando estrategia de fallback...');

    // Intento 1: Solo dificultad + género
    let pool = this.tracks.filter(t =>
      t.difficulty === filters.difficulty &&
      (filters.genre === 'ANY' || t.genre === filters.genre)
    );

    if (pool.length > 0) {
      console.log(`   ✅ Fallback 1: ${pool.length} tracks (dificultad + género)`);
      return pool[Math.floor(Math.random() * pool.length)];
    }

    // Intento 2: Solo dificultad
    pool = this.tracks.filter(t => t.difficulty === filters.difficulty);

    if (pool.length > 0) {
      console.log(`   ✅ Fallback 2: ${pool.length} tracks (solo dificultad)`);
      return pool[Math.floor(Math.random() * pool.length)];
    }

    // Intento 3: Cualquier track
    console.log(`   ⚠️ Fallback 3: Track completamente aleatorio`);
    return this.tracks[Math.floor(Math.random() * this.tracks.length)];
  }

  /**
   * 🔍 Buscar track por ID (para formato antiguo - COMPATIBILIDAD)
   */
  getTrackById(id) {
    // Normalizar el ID (remover ceros a la izquierda si es necesario)
    const normalizedId = String(id).padStart(3, '0');

    let track = this.tracks.find(t => t.id === id);

    // Si no se encuentra, intentar con ID normalizado
    if (!track) {
      track = this.tracks.find(t => t.id === normalizedId);
    }

    if (!track) {
      throw new Error(`Track con ID ${id} no encontrado`);
    }

    return track;
  }

  /**
   * 📋 Obtener todos los tracks
   */
  getAllTracks() {
    return this.tracks;
  }

  /**
   * 📊 Obtener estadísticas del pool según filtros
   */
  getPoolStats(filters = {}) {
    const pool = this.getFilteredPool(filters);

    return {
      total: pool.length,
      byGenre: this.groupBy(pool, 'genre'),
      byDecade: this.groupBy(pool, 'decade'),
      byDifficulty: this.groupBy(pool, 'difficulty')
    };
  }

  /**
   * 🔧 Helper: Obtener pool filtrado
   */
  getFilteredPool(filters) {
    let pool = [...this.tracks];

    if (filters.difficulty && filters.difficulty !== 'ANY') {
      pool = pool.filter(t => t.difficulty === filters.difficulty);
    }

    if (filters.genre && filters.genre !== 'ANY') {
      pool = pool.filter(t => t.genre === filters.genre);
    }

    if (filters.decade && filters.decade !== 'ANY') {
      pool = pool.filter(t => t.decade === filters.decade);
    }

    return pool;
  }

  /**
   * 🔧 Helper: Agrupar por campo
   */
  groupBy(array, key) {
    return array.reduce((result, item) => {
      const value = item[key] || 'UNDEFINED';
      result[value] = (result[value] || 0) + 1;
      return result;
    }, {});
  }

  /**
   * 🔄 Recargar tracks (útil para hot-reload en desarrollo)
   */
  reload() {
    console.log('🔄 Recargando tracks...');
    this.loadTracks();
  }

  /**
   * 🏥 Health check (COMPATIBILIDAD con código existente)
   */
  async healthCheck() {
    try {
      return {
        status: this.tracks.length > 0 ? 'healthy' : 'error',
        totalTracks: this.tracks.length,
        hasData: this.tracks.length > 0,
        distribution: {
          byGenre: this.groupBy(this.tracks, 'genre'),
          byDifficulty: this.groupBy(this.tracks, 'difficulty')
        }
      };
    } catch (error) {
      return {
        status: 'error',
        error: error.message
      };
    }
  }

  /**
   * 📁 Load tracks data (COMPATIBILIDAD)
   */
  loadTracksData() {
    try {
      const data = fs.readFileSync(this.tracksPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      return { tracks: [], metadata: {} };
    }
  }
}

// Singleton instance
const trackServiceInstance = new TrackService();

module.exports = trackServiceInstance;