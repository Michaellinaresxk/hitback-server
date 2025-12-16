const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'postgres',
  port: process.env.DB_PORT || 5432,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

client.connect();

client.query('SELECT title, artist FROM tracks;', (err, res) => {
  if (err) {
    console.error('Error al obtener tracks:', err);
  } else {
    console.log('Tracks encontrados:', res.rows);
    console.log('Tracks encontrados:', 'Total:', res.rowCount);
    // res.rows es un array de objetos JavaScript:
    // [ { title: 'Paint It Black', artist: 'The Rolling Stones' }, ... ]
  }
  client.end();
});


module.exports = client;