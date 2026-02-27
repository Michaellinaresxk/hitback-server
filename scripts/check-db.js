/**
 * Verificar estado actual de la base de datos
 */

const { Client } = require('pg');
require('dotenv').config();

async function checkDatabase() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'Hitback'
  });

  try {
    await client.connect();
    console.log('✅ Conectado a PostgreSQL\n');

    // Listar tablas
    const tablesResult = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);

    console.log('📊 Tablas existentes:');
    if (tablesResult.rows.length === 0) {
      console.log('   (ninguna tabla encontrada)');
    } else {
      tablesResult.rows.forEach(row => {
        console.log(`   - ${row.table_name}`);
      });
    }

    console.log('');

    // Verificar si existe tabla tracks
    const tracksExists = tablesResult.rows.some(row => row.table_name === 'tracks');

    if (tracksExists) {
      console.log('🔍 Estructura de tabla "tracks" existente:\n');

      const columnsResult = await client.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'tracks'
        ORDER BY ordinal_position;
      `);

      columnsResult.rows.forEach(col => {
        console.log(`   - ${col.column_name} (${col.data_type}) ${col.is_nullable === 'NO' ? 'NOT NULL' : ''}`);
      });

      console.log('');

      // Contar registros
      const countResult = await client.query('SELECT COUNT(*) FROM tracks');
      console.log(`📈 Registros en tracks: ${countResult.rows[0].count}\n`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.end();
  }
}

checkDatabase();
