/**
 * Script para ejecutar migración SQL desde Node.js
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config();

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m'
};

async function runMigration() {
  console.log(`${colors.blue}╔═══════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.blue}║         EJECUTANDO MIGRACIÓN SQL                  ║${colors.reset}`);
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

    // Leer archivo SQL
    const sqlPath = path.join(__dirname, '../migrations/001_create_tables.sql');
    console.log(`${colors.yellow}📂 Leyendo: ${sqlPath}${colors.reset}`);
    const sql = fs.readFileSync(sqlPath, 'utf8');

    // Ejecutar SQL
    console.log(`${colors.yellow}⚙️  Ejecutando migración...${colors.reset}\n`);
    await client.query(sql);

    console.log(`${colors.green}╔═══════════════════════════════════════════════════╗${colors.reset}`);
    console.log(`${colors.green}║          ✅ MIGRACIÓN EXITOSA                     ║${colors.reset}`);
    console.log(`${colors.green}╚═══════════════════════════════════════════════════╝${colors.reset}\n`);

    // Verificar tablas creadas
    const tablesResult = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);

    console.log(`${colors.blue}📊 Tablas creadas:${colors.reset}`);
    tablesResult.rows.forEach(row => {
      console.log(`   ✓ ${row.table_name}`);
    });

    console.log('');

  } catch (error) {
    console.error(`${colors.red}❌ Error en migración:${colors.reset}`, error.message);
    console.error(`\n${colors.yellow}Detalles:${colors.reset}`);
    console.error(`  Host: ${process.env.DB_HOST || 'localhost'}`);
    console.error(`  Puerto: ${process.env.DB_PORT || 5432}`);
    console.error(`  Usuario: ${process.env.DB_USER || 'postgres'}`);
    console.error(`  Base de datos: ${process.env.DB_NAME || 'Hitback'}`);
    process.exit(1);

  } finally {
    await client.end();
    console.log(`${colors.blue}🔌 Conexión cerrada${colors.reset}\n`);
  }
}

runMigration();
