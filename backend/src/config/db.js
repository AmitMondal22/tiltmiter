import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const { Pool } = pg;

// PostgreSQL Connection Pool
export const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'tiltmeter_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.warn('PostgreSQL Pool warning/error:', err.message);
});

export async function testDbConnection() {
  try {
    const res = await pool.query('SELECT NOW()');
    console.log('✅ PostgreSQL connected successfully at:', res.rows[0].now);
    return true;
  } catch (err) {
    console.warn('⚠️ PostgreSQL connection fallback (DB running in fallback mode):', err.message);
    return false;
  }
}
