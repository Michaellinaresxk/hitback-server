/**
 * Script para resetear BD y ejecutar migración limpia
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const readline = require('readline');
require('dotenv').config();

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  bold: '\x1b[1m'
};

async function resetAndMigrate() {
  console.log(`${colors.blue}╔═══════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.blue}║    RESET Y MIGRACIÓN DE BASE DE DATOS            ║${colors.reset}`);
  console.log(`${colors.blue}╚═══════════════════════════════════════════════════╝${colors.reset}\n`);

  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'Hitback'
  });

  try {
    // Conectar
    console.log(`${colors.yellow}🔌 Conectando a PostgreSQL...${colors.reset}`);
    await client.connect();
    console.log(`${colors.green}✅ Conexión exitosa${colors.reset}\n`);

    // Verificar tablas existentes
    const tablesResult = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);

    if (tablesResult.rows.length > 0) {
      console.log(`${colors.yellow}⚠️  Se encontraron tablas existentes:${colors.reset}`);
      tablesResult.rows.forEach(row => {
        console.log(`   - ${row.table_name}`);
      });
      console.log('');

      console.log(`${colors.red}${colors.bold}⚠️  IMPORTANTE: Esto eliminará TODAS las tablas y datos existentes.${colors.reset}`);
      console.log(`${colors.yellow}Continuando en 3 segundos...${colors.reset}\n`);

      await new Promise(resolve => setTimeout(resolve, 3000));

      // Drop todas las tablas
      console.log(`${colors.yellow}🗑️  Eliminando tablas existentes...${colors.reset}`);

      await client.query('DROP TABLE IF EXISTS round_history CASCADE');
      await client.query('DROP TABLE IF EXISTS session_players CASCADE');
      await client.query('DROP TABLE IF EXISTS session_tracks CASCADE');
      await client.query('DROP TABLE IF EXISTS player_power_cards CASCADE');
      await client.query('DROP TABLE IF EXISTS game_sessions CASCADE');
      await client.query('DROP TABLE IF EXISTS custom_questions CASCADE');
      await client.query('DROP TABLE IF EXISTS tracks CASCADE');
      await client.query('DROP TABLE IF EXISTS hints CASCADE');
      await client.query('DROP TABLE IF EXISTS questions CASCADE');

      console.log(`${colors.green}✅ Tablas eliminadas${colors.reset}\n`);
    } else {
      console.log(`${colors.blue}ℹ️  No hay tablas existentes${colors.reset}\n`);
    }

    // Leer archivo SQL de migración
    const sqlPath = path.join(__dirname, '../migrations/001_create_tables.sql');
    console.log(`${colors.yellow}📂 Leyendo migración: ${sqlPath}${colors.reset}`);
    const sql = fs.readFileSync(sqlPath, 'utf8');

    // Ejecutar migración
    console.log(`${colors.yellow}⚙️  Ejecutando migración...${colors.reset}\n`);
    await client.query(sql);

    console.log(`${colors.green}╔═══════════════════════════════════════════════════╗${colors.reset}`);
    console.log(`${colors.green}║          ✅ MIGRACIÓN COMPLETADA                  ║${colors.reset}`);
    console.log(`${colors.green}╚═══════════════════════════════════════════════════╝${colors.reset}\n`);

    // Verificar tablas creadas
    const newTablesResult = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);

    console.log(`${colors.blue}📊 Tablas creadas (${newTablesResult.rows.length}):${colors.reset}`);
    newTablesResult.rows.forEach(row => {
      console.log(`   ✓ ${row.table_name}`);
    });

    console.log('');

    // Mostrar estructura de tabla tracks
    console.log(`${colors.blue}🔍 Estructura de tabla "tracks":${colors.reset}`);
    const columnsResult = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'tracks'
      ORDER BY ordinal_position;
    `);

    columnsResult.rows.forEach(col => {
      console.log(`   - ${col.column_name} (${col.data_type})`);
    });

    console.log('');
    console.log(`${colors.green}✅ Base de datos lista para usar${colors.reset}\n`);

  } catch (error) {
    console.error(`${colors.red}❌ Error:${colors.reset}`, error.message);
    console.error(`\n${colors.yellow}Stack trace:${colors.reset}`);
    console.error(error.stack);
    process.exit(1);

  } finally {
    await client.end();
    console.log(`${colors.blue}🔌 Conexión cerrada${colors.reset}\n`);
  }
}

resetAndMigrate();
