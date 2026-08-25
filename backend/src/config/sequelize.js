import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

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
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  }
);

export async function initSequelize() {
  try {
    await sequelize.authenticate();
    console.log('✅ Sequelize PostgreSQL connection established successfully.');
    await sequelize.sync({ alter: true });
    console.log('✅ All Database Models synchronized successfully.');
    return true;
  } catch (err) {
    console.warn('⚠️ Sequelize DB connection notice (running with fallback store):', err.message);
    return false;
  }
}
