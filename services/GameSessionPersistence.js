const { Pool } = require('pg');
const crypto = require('crypto');

class GameSessionPersistence {
  constructor({ pool } = {}) {
    this.pool =
      pool ||
      new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME || 'Hitback',
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      });
  }

  async initialize() {
    await this.pool.query(
      'SELECT 1 FROM game_session_snapshots LIMIT 1',
    );
  }

  async get(sessionId) {
    const { rows } = await this.pool.query(
      `SELECT session_data, capability_token_hash
       FROM game_session_snapshots WHERE id = $1`,
      [sessionId],
    );
    if (!rows[0]) return null;
    return {
      ...rows[0].session_data,
      capabilityTokenHash: rows[0].capability_token_hash,
    };
  }

  async findByCapabilityToken(token) {
    const { rows } = await this.pool.query(
      `SELECT session_data, capability_token_hash
       FROM game_session_snapshots WHERE capability_token_hash = $1`,
      [GameSessionPersistence.hashCapabilityToken(token)],
    );
    if (!rows[0]) return null;
    return {
      ...rows[0].session_data,
      capabilityTokenHash: rows[0].capability_token_hash,
    };
  }

  async count() {
    const { rows } = await this.pool.query(
      'SELECT COUNT(*)::INTEGER AS count FROM game_session_snapshots',
    );
    return rows[0].count;
  }

  async save(session) {
    const snapshot = { ...session };
    delete snapshot.capabilityToken;

    await this.pool.query(
      `INSERT INTO game_session_snapshots (id, session_data, capability_token_hash)
       VALUES ($1, $2::jsonb, $3)
       ON CONFLICT (id) DO UPDATE SET
         session_data = EXCLUDED.session_data,
         capability_token_hash = EXCLUDED.capability_token_hash,
         updated_at = NOW()`,
      [
        session.id,
        JSON.stringify(snapshot),
        session.capabilityTokenHash,
      ],
    );
  }

  async delete(sessionId) {
    await this.pool.query(
      'DELETE FROM game_session_snapshots WHERE id = $1',
      [sessionId],
    );
  }

  static hashCapabilityToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}

module.exports = GameSessionPersistence;
