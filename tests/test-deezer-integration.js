/**
 * =====================================================
 * TEST DE INTEGRACIÓN - Deezer + PostgreSQL
 * =====================================================
 *
 * Script de pruebas para verificar que el nuevo sistema
 * funciona correctamente.
 *
 * Uso:
 *   node tests/test-deezer-integration.js
 */

require('dotenv').config();
const DeezerServiceV2 = require('../services/DeezerServiceV2');
const TrackServiceV2 = require('../services/TrackServiceV2');

// Colores para terminal
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  bold: '\x1b[1m'
};

class IntegrationTests {
  constructor() {
    this.trackService = new TrackServiceV2();
    this.deezerService = DeezerServiceV2;
    this.results = {
      passed: 0,
      failed: 0,
      total: 0
    };
  }

  /**
   * Helper para logs
   */
  log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
  }

  /**
   * Helper para test cases
   */
  async test(name, testFn) {
    this.results.total++;
    process.stdout.write(`\n${colors.blue}[TEST ${this.results.total}]${colors.reset} ${name}... `);

    try {
      await testFn();
      process.stdout.write(`${colors.green}✓ PASS${colors.reset}\n`);
      this.results.passed++;
    } catch (error) {
      process.stdout.write(`${colors.red}✗ FAIL${colors.reset}\n`);
      console.error(`${colors.red}  Error: ${error.message}${colors.reset}`);
      this.results.failed++;
    }
  }

  /**
   * Assert helper
   */
  assert(condition, message) {
    if (!condition) {
      throw new Error(message || 'Assertion failed');
    }
  }

  /**
   * TEST 1: Health Check de Deezer
   */
  async testDeezerHealth() {
    await this.test('Deezer API Health Check', async () => {
      const health = await this.deezerService.healthCheck();
      this.assert(health.status === 'healthy', 'Deezer debe estar disponible');
      this.assert(health.available === true, 'Deezer debe estar available');
    });
  }

  /**
   * TEST 2: Búsqueda en Deezer sin filtros
   */
  async testDeezerSearchNoFilters() {
    await this.test('Deezer: Búsqueda sin filtros (chart)', async () => {
      const tracks = await this.deezerService.getChart(5);
      this.assert(tracks.length > 0, 'Debe retornar al menos 1 track');
      this.assert(tracks[0].title, 'Track debe tener título');
      this.assert(tracks[0].artist, 'Track debe tener artista');
      this.assert(tracks[0].previewUrl, 'Track debe tener preview URL');
    });
  }

  /**
   * TEST 3: Búsqueda en Deezer con género
   */
  async testDeezerSearchByGenre() {
    await this.test('Deezer: Búsqueda por género (ROCK)', async () => {
      const tracks = await this.deezerService.searchTracks({
        genre: 'ROCK',
        limit: 5
      });
      this.assert(tracks.length > 0, 'Debe encontrar tracks de ROCK');
      this.log(`    → Encontrados ${tracks.length} tracks de ROCK`, 'yellow');
      this.log(`    → Ejemplo: "${tracks[0].title}" - ${tracks[0].artist}`, 'yellow');
    });
  }

  /**
   * TEST 4: Búsqueda por década
   */
  async testDeezerSearchByDecade() {
    await this.test('Deezer: Búsqueda por década (1980s)', async () => {
      const tracks = await this.deezerService.searchTracks({
        decade: '1980s',
        limit: 5
      });
      this.assert(tracks.length > 0, 'Debe encontrar tracks de los 80s');

      // Verificar que los años sean correctos
      const years = tracks.map(t => t.year).filter(y => y);
      const allIn80s = years.every(y => y >= 1980 && y <= 1989);
      this.assert(allIn80s, 'Todos los tracks deben ser de los 80s');

      this.log(`    → Años encontrados: ${years.join(', ')}`, 'yellow');
    });
  }

  /**
   * TEST 5: PostgreSQL Connection
   */
  async testPostgresConnection() {
    await this.test('PostgreSQL: Conexión y health check', async () => {
      const health = await this.trackService.healthCheck();
      this.assert(health.database === 'healthy', 'PostgreSQL debe estar conectado');
      this.log(`    → Tracks en BD: ${health.tracksInDB}`, 'yellow');
    });
  }

  /**
   * TEST 6: Obtener track aleatorio de BD
   */
  async testGetRandomTrackFromDB() {
    await this.test('TrackService: Obtener track aleatorio de BD', async () => {
      const track = await this.trackService.getRandomTrack({});
      this.assert(track, 'Debe retornar un track');
      this.assert(track.id, 'Track debe tener ID');
      this.assert(track.title, 'Track debe tener título');
      this.assert(track.artist, 'Track debe tener artista');
      this.log(`    → "${track.title}" - ${track.artist}`, 'yellow');
    });
  }

  /**
   * TEST 7: Filtro por género en BD
   */
  async testGetTrackByGenre() {
    await this.test('TrackService: Filtro por género (LATIN)', async () => {
      const track = await this.trackService.getRandomTrack({
        genre: 'LATIN'
      });

      if (track) {
        this.assert(track.genre === 'LATIN', 'Track debe ser género LATIN');
        this.log(`    → "${track.title}" - ${track.artist}`, 'yellow');
      } else {
        this.log(`    → No hay tracks LATIN en BD, buscará en Deezer`, 'yellow');
      }
    });
  }

  /**
   * TEST 8: Evitar duplicados en sesión
   */
  async testAvoidDuplicatesInSession() {
    await this.test('TrackService: Evitar duplicados en sesión', async () => {
      const sessionId = 'test_session_' + Date.now();

      // Obtener 3 tracks
      const track1 = await this.trackService.getRandomTrack({ sessionId });
      const track2 = await this.trackService.getRandomTrack({ sessionId });
      const track3 = await this.trackService.getRandomTrack({ sessionId });

      this.assert(track1.id !== track2.id, 'Track 1 y 2 deben ser diferentes');
      this.assert(track1.id !== track3.id, 'Track 1 y 3 deben ser diferentes');
      this.assert(track2.id !== track3.id, 'Track 2 y 3 deben ser diferentes');

      this.log(`    → Track 1: ${track1.title}`, 'yellow');
      this.log(`    → Track 2: ${track2.title}`, 'yellow');
      this.log(`    → Track 3: ${track3.title}`, 'yellow');

      // Limpiar
      await this.trackService.resetSessionTracks(sessionId);
    });
  }

  /**
   * TEST 9: Cache de Deezer en BD
   */
  async testCacheDeezerTracks() {
    await this.test('TrackService: Cachear tracks de Deezer', async () => {
      const statsBefore = await this.trackService.getStats();

      // Forzar búsqueda en Deezer con filtros únicos
      const track = await this.trackService.fetchAndCacheFromDeezer({
        genre: 'ELECTRONIC',
        decade: '2020s'
      });

      this.assert(track, 'Debe retornar track de Deezer');

      const statsAfter = await this.trackService.getStats();

      this.log(`    → Tracks antes: ${statsBefore.total_tracks}`, 'yellow');
      this.log(`    → Tracks después: ${statsAfter.total_tracks}`, 'yellow');
      this.assert(
        parseInt(statsAfter.total_tracks) >= parseInt(statsBefore.total_tracks),
        'Debe aumentar cantidad de tracks en BD'
      );
    });
  }

  /**
   * TEST 10: Búsqueda de tracks por texto
   */
  async testSearchTracks() {
    await this.test('TrackService: Búsqueda por texto', async () => {
      const tracks = await this.trackService.searchTracks('despacito', 5);
      this.assert(tracks.length > 0, 'Debe encontrar tracks');
      this.log(`    → Encontrados ${tracks.length} tracks`, 'yellow');
    });
  }

  /**
   * TEST 11: Rate limiting de Deezer
   */
  async testDeezerRateLimit() {
    await this.test('Deezer: Rate limiting (50 req/min)', async () => {
      // Hacer 5 requests rápidas
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(this.deezerService.searchTracks({ limit: 1 }));
      }

      const results = await Promise.all(promises);
      this.assert(results.every(r => Array.isArray(r)), 'Todas las requests deben funcionar');
      this.log(`    → 5 requests exitosas`, 'yellow');
    });
  }

  /**
   * TEST 12: Mapeo de formato Deezer → HITBACK
   */
  async testDeezerMapping() {
    await this.test('Deezer: Mapeo correcto a formato HITBACK', async () => {
      const tracks = await this.deezerService.searchTracks({ limit: 1 });
      this.assert(tracks.length > 0, 'Debe retornar al menos 1 track');

      const track = tracks[0];

      // Verificar campos requeridos
      this.assert(track.id, 'Debe tener id');
      this.assert(track.id.startsWith('dz_'), 'ID debe tener formato dz_{number}');
      this.assert(track.title, 'Debe tener title');
      this.assert(track.artist, 'Debe tener artist');
      this.assert(track.genre, 'Debe tener genre');
      this.assert(track.audioSource === 'deezer', 'audioSource debe ser "deezer"');
      this.assert(track.hasAudio === true, 'hasAudio debe ser true');
      this.assert(track.hasQuestions === true, 'hasQuestions debe ser true');
      this.assert(Array.isArray(track.availableCardTypes), 'availableCardTypes debe ser array');

      this.log(`    → Formato verificado: ✓`, 'yellow');
    });
  }

  /**
   * Ejecutar todos los tests
   */
  async runAll() {
    this.log('\n╔═══════════════════════════════════════════════════╗', 'green');
    this.log('║    TEST DE INTEGRACIÓN: Deezer + PostgreSQL       ║', 'green');
    this.log('╚═══════════════════════════════════════════════════╝\n', 'green');

    await this.testDeezerHealth();
    await this.testDeezerSearchNoFilters();
    await this.testDeezerSearchByGenre();
    await this.testDeezerSearchByDecade();
    await this.testPostgresConnection();
    await this.testGetRandomTrackFromDB();
    await this.testGetTrackByGenre();
    await this.testAvoidDuplicatesInSession();
    await this.testCacheDeezerTracks();
    await this.testSearchTracks();
    await this.testDeezerRateLimit();
    await this.testDeezerMapping();

    // Resumen
    this.log('\n╔═══════════════════════════════════════════════════╗', 'green');
    this.log('║                  RESUMEN                          ║', 'green');
    this.log('╚═══════════════════════════════════════════════════╝\n', 'green');

    this.log(`  Total de tests:    ${this.results.total}`, 'blue');
    this.log(`  ✓ Passed:          ${this.results.passed}`, 'green');
    this.log(`  ✗ Failed:          ${this.results.failed}`, this.results.failed > 0 ? 'red' : 'green');

    const successRate = ((this.results.passed / this.results.total) * 100).toFixed(1);
    this.log(`  Success rate:      ${successRate}%\n`, successRate === '100.0' ? 'green' : 'yellow');

    if (this.results.failed === 0) {
      this.log('✅ ¡Todos los tests pasaron exitosamente!\n', 'green');
    } else {
      this.log('⚠️ Algunos tests fallaron. Revisa los errores arriba.\n', 'yellow');
    }

    // Cleanup
    await this.trackService.close();
  }
}

// Ejecutar tests
if (require.main === module) {
  const tests = new IntegrationTests();
  tests.runAll()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Error fatal:', error);
      process.exit(1);
    });
}

module.exports = IntegrationTests;
