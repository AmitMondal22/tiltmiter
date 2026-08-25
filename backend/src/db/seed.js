import bcrypt from 'bcryptjs';
import { sequelize, initSequelize } from '../config/sequelize.js';
import { User } from '../models/index.js';

export async function seedDatabase() {
  console.log('🔄 Initializing PostgreSQL Database Schema...');

  try {
    const isDbConnected = await initSequelize();
    if (!isDbConnected) {
      console.log('⚠️ PostgreSQL DB not connected locally.');
      return;
    }

    // Individual DDL statement execution for column safety
    const addColumnQueries = [
      'ALTER TABLE users ADD COLUMN IF NOT EXISTS "partnerId" INTEGER;',
      'ALTER TABLE users ADD COLUMN IF NOT EXISTS "organizationId" INTEGER;',
      'ALTER TABLE users ADD COLUMN IF NOT EXISTS "projectId" INTEGER;',
      'ALTER TABLE users ADD COLUMN IF NOT EXISTS "siteId" VARCHAR(255);',
      'ALTER TABLE users ADD COLUMN IF NOT EXISTS "scopeType" VARCHAR(255) DEFAULT \'ALL\';',
      'ALTER TABLE users ADD COLUMN IF NOT EXISTS "allowedSiteIds" JSON DEFAULT \'[]\';',
      'ALTER TABLE users ADD COLUMN IF NOT EXISTS "allowedDeviceIds" JSON DEFAULT \'[]\';',
      'ALTER TABLE users ADD COLUMN IF NOT EXISTS "fullName" VARCHAR(255);',
      'ALTER TABLE users ADD COLUMN IF NOT EXISTS "status" VARCHAR(255) DEFAULT \'ACTIVE\';',
      'ALTER TABLE devices ADD COLUMN IF NOT EXISTS "sleep_count" INTEGER DEFAULT 10;',
      'ALTER TABLE devices ADD COLUMN IF NOT EXISTS "wake_count" INTEGER DEFAULT 30;',
      'ALTER TABLE devices ADD COLUMN IF NOT EXISTS "calibrate" BOOLEAN DEFAULT false;',
    ];

    for (const q of addColumnQueries) {
      try {
        await sequelize.query(q);
      } catch (migErr) {
        // Ignored if exists
      }
    }

    // Sync database schema
    await sequelize.sync({ alter: true });

    // Seed ONLY the essential Super Administrator account for initial access
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash('superadmin123', salt);

    await User.findOrCreate({
      where: { username: 'superadmin' },
      defaults: {
        username: 'superadmin',
        passwordHash,
        email: 'superadmin@tiltmeter.io',
        role: 'SUPER_ADMIN',
        fullName: 'Super Admin',
        scopeType: 'ALL',
        status: 'ACTIVE',
      },
    });

    console.log('✅ PostgreSQL Schema initialized cleanly with Root Super Administrator.');
  } catch (err) {
    console.error('❌ Error during schema initialization:', err.message);
  }
}
