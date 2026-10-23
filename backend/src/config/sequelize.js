import pkg from 'sequelize';
const { Sequelize, DataTypes, Op } = pkg;
import dotenv from 'dotenv';

dotenv.config();

export { Sequelize, DataTypes, Op };

export const sequelize = new Sequelize(
  process.env.DB_NAME || 'tiltmeter_db',
  process.env.DB_USER || 'postgres',
  process.env.DB_PASSWORD || 'postgres',
  {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    dialect: 'postgres',
    logging: false,
    pool: {
      max: parseInt(process.env.DB_POOL_MAX || '10', 10),
      min: 0,
      acquire: 20000,
      idle: 5000,
      evict: 2000,
    },
    dialectOptions: {
      statement_timeout: 15000,
      idle_in_transaction_session_timeout: 10000,
    },
  }
);

export async function initSequelize() {
  try {
    await sequelize.authenticate();
    console.log('✅ Sequelize PostgreSQL connection established successfully.');
    // Safe sync without alter locks: preserves all existing data and tables
    await sequelize.sync();
    console.log('✅ Database Models verified successfully.');
    return true;
  } catch (err) {
    console.warn('⚠️ Sequelize DB connection notice (running with fallback store):', err.message);
    return false;
  }
}
