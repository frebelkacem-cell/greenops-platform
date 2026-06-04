const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const pool = new Pool({
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  host:     process.env.DB_HOST,
  port:     parseInt(process.env.DB_PORT, 10),
});

async function initDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id         SERIAL PRIMARY KEY,
        username   VARCHAR(100) UNIQUE NOT NULL,
        password   VARCHAR(255) NOT NULL,
        role       VARCHAR(50) NOT NULL DEFAULT 'operator',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS metrics_history (
        id              SERIAL PRIMARY KEY,
        device          VARCHAR(100) NOT NULL,
        temperature     NUMERIC(5,2),
        network_traffic NUMERIC(8,3),
        cpu_load        NUMERIC(5,2),
        fan_speed       INTEGER,
        global_pue      NUMERIC(6,4),
        recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const existing = await client.query(
      'SELECT id FROM users WHERE username = $1', ['admin']
    );
    if (existing.rowCount === 0) {
      const hashed = await bcrypt.hash('admin', 12);
      await client.query(
        'INSERT INTO users (username, password, role) VALUES ($1, $2, $3)',
        ['admin', hashed, 'admin']
      );
      console.log('[DB] Utilisateur admin créé.');
    }
    console.log('[DB] Tables prêtes.');
  } finally {
    client.release();
  }
}

module.exports = { pool, initDatabase };
