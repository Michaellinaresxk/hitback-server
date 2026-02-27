/**
 * =====================================================
 * SCRIPT DE MIGRACIÓN: tracks.json → PostgreSQL
 * =====================================================
 *
 * Este script migra los 217 tracks existentes de tracks.json
 * a la base de datos PostgreSQL, manteniendo todas las
 * preguntas custom (lyrics, challenges).
 *
 * Uso:
 *   node scripts/migrate-tracks-to-db.js
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

// Colores para terminal
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m'
};

class TrackMigration {
  constructor() {
    this.pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME || 'Hitback'
    });

    this.stats = {
      total: 0,
      tracksInserted: 0,
      tracksUpdated: 0,
      questionsInserted: 0,
      errors: 0
    };
  }

  /**
   * Cargar tracks.json
   */
  loadTracksJSON() {
    const possiblePaths = [
      path.join(__dirname, '../data/tracks.json'),
      path.join(__dirname, '../../server/data/tracks.json'),
      path.join(process.cwd(), 'data/tracks.json'),
      path.join(process.cwd(), 'server/data/tracks.json')
    ];

    for (const filePath of possiblePaths) {
      if (fs.existsSync(filePath)) {
        console.log(`${colors.blue}📂 Cargando tracks desde: ${filePath}${colors.reset}`);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

        // Soportar ambos formatos: { tracks: [...] } o [...]
        return Array.isArray(data) ? data : data.tracks;
      }
    }

    throw new Error('No se encontró el archivo tracks.json');
  }

  /**
   * Migrar un solo track
   */
  async migrateTrack(track) {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Insertar/actualizar track principal
      const trackQuery = `
        INSERT INTO tracks (
          id, deezer_id, title, artist, album, year,
          genre, decade, difficulty, preview_url,
          created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET
          title = EXCLUDED.title,
          artist = EXCLUDED.artist,
          album = EXCLUDED.album,
          year = EXCLUDED.year,
          genre = EXCLUDED.genre,
          decade = EXCLUDED.decade,
          difficulty = EXCLUDED.difficulty,
          updated_at = NOW()
        RETURNING (xmax = 0) AS inserted
      `;

      const trackValues = [
        track.id,
        track.deezer_id || null,
        track.title,
        track.artist,
        track.album || null,
        track.year || null,
        track.genre || 'POP',
        track.decade || null,
        track.difficulty || 'MEDIUM',
        track.preview_url || null
      ];

      const trackResult = await client.query(trackQuery, trackValues);
      const wasInserted = trackResult.rows[0].inserted;

      if (wasInserted) {
        this.stats.tracksInserted++;
      } else {
        this.stats.tracksUpdated++;
      }

      // 2. Insertar preguntas custom (lyrics y challenges)
      if (track.questions) {
        // Lyrics
        if (track.questions.lyrics) {
          await this.insertCustomQuestion(
            client,
            track.id,
            'lyrics',
            track.questions.lyrics
          );
        }

        // Challenge
        if (track.questions.challenge) {
          await this.insertCustomQuestion(
            client,
            track.id,
            'challenge',
            track.questions.challenge
          );
        }
      }

      await client.query('COMMIT');

      return true;

    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`${colors.red}❌ Error migrando track ${track.id}:${colors.reset}`, error.message);
      this.stats.errors++;
      return false;

    } finally {
      client.release();
    }
  }

  /**
   * Insertar pregunta custom en BD
   */
  async insertCustomQuestion(client, trackId, questionType, questionData) {
    try {
      const query = `
        INSERT INTO custom_questions (
          track_id, question_type, question_text, answer,
          points, hints, challenge_type
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT DO NOTHING
      `;

      const values = [
        trackId,
        questionType,
        questionData.question,
        questionData.answer,
        questionData.points || 1,
        JSON.stringify(questionData.hints || []),
        questionData.challengeType || null
      ];

      await client.query(query, values);
      this.stats.questionsInserted++;

    } catch (error) {
      console.error(`${colors.red}❌ Error insertando pregunta:${colors.reset}`, error.message);
    }
  }

  /**
   * Ejecutar migración completa
   */
  async run() {
    console.log(`\n${colors.green}╔═══════════════════════════════════════════════════╗${colors.reset}`);
    console.log(`${colors.green}║     MIGRACIÓN tracks.json → PostgreSQL            ║${colors.reset}`);
    console.log(`${colors.green}╚═══════════════════════════════════════════════════╝${colors.reset}\n`);

    try {
      // 1. Verificar conexión a BD
      console.log(`${colors.blue}🔌 Conectando a PostgreSQL...${colors.reset}`);
      await this.pool.query('SELECT NOW()');
      console.log(`${colors.green}✅ Conexión exitosa${colors.reset}\n`);

      // 2. Cargar tracks.json
      const tracks = this.loadTracksJSON();
      this.stats.total = tracks.length;
      console.log(`${colors.blue}📦 Tracks encontrados: ${this.stats.total}${colors.reset}\n`);

      // 3. Migrar cada track
      console.log(`${colors.yellow}⏳ Migrando tracks...${colors.reset}\n`);

      for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i];
        const progress = ((i + 1) / tracks.length * 100).toFixed(1);

        process.stdout.write(
          `${colors.blue}[${i + 1}/${tracks.length}] (${progress}%) ${colors.reset}` +
          `${track.title} - ${track.artist}...`
        );

        const success = await this.migrateTrack(track);

        if (success) {
          process.stdout.write(` ${colors.green}✓${colors.reset}\n`);
        } else {
          process.stdout.write(` ${colors.red}✗${colors.reset}\n`);
        }
      }

      // 4. Mostrar resumen
      console.log(`\n${colors.green}╔═══════════════════════════════════════════════════╗${colors.reset}`);
      console.log(`${colors.green}║              RESUMEN DE MIGRACIÓN                 ║${colors.reset}`);
      console.log(`${colors.green}╚═══════════════════════════════════════════════════╝${colors.reset}\n`);

      console.log(`  Total de tracks:           ${this.stats.total}`);
      console.log(`  ${colors.green}✓ Tracks insertados:       ${this.stats.tracksInserted}${colors.reset}`);
      console.log(`  ${colors.yellow}↻ Tracks actualizados:     ${this.stats.tracksUpdated}${colors.reset}`);
      console.log(`  ${colors.blue}? Preguntas insertadas:    ${this.stats.questionsInserted}${colors.reset}`);
      console.log(`  ${colors.red}✗ Errores:                 ${this.stats.errors}${colors.reset}\n`);

      // 5. Verificar datos migrados
      const verification = await this.pool.query(`
        SELECT
          COUNT(*) as total_tracks,
          COUNT(CASE WHEN preview_url IS NOT NULL THEN 1 END) as with_preview
        FROM tracks
      `);

      const customQuestionsCount = await this.pool.query(
        'SELECT COUNT(*) FROM custom_questions'
      );

      console.log(`${colors.green}╔═══════════════════════════════════════════════════╗${colors.reset}`);
      console.log(`${colors.green}║            VERIFICACIÓN DE DATOS                  ║${colors.reset}`);
      console.log(`${colors.green}╚═══════════════════════════════════════════════════╝${colors.reset}\n`);

      console.log(`  Tracks en BD:              ${verification.rows[0].total_tracks}`);
      console.log(`  Tracks con preview:        ${verification.rows[0].with_preview}`);
      console.log(`  Preguntas custom en BD:    ${customQuestionsCount.rows[0].count}\n`);

      if (this.stats.errors === 0) {
        console.log(`${colors.green}✅ ¡Migración completada exitosamente!${colors.reset}\n`);
      } else {
        console.log(`${colors.yellow}⚠️ Migración completada con algunos errores${colors.reset}\n`);
      }

    } catch (error) {
      console.error(`\n${colors.red}❌ Error fatal en migración:${colors.reset}`, error.message);
      process.exit(1);

    } finally {
      await this.pool.end();
      console.log(`${colors.blue}🔌 Conexión a BD cerrada${colors.reset}\n`);
    }
  }
}

// Ejecutar migración
if (require.main === module) {
  const migration = new TrackMigration();
  migration.run().catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
}

module.exports = TrackMigration;
