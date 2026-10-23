import dotenv from 'dotenv';
import { sequelize } from './sequelize.js';

dotenv.config();

// Verify PostgreSQL connection without opening redundant raw pool connections
export async function testDbConnection() {
  try {
    await sequelize.authenticate();
    console.log('✅ PostgreSQL connection verified successfully.');
    return true;
  } catch (err) {
    console.warn('⚠️ PostgreSQL connection fallback notice (DB running in fallback mode):', err.message);
    return false;
  }
}

