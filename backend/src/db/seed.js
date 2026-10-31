import bcrypt from 'bcryptjs';
import { sequelize } from '../config/sequelize.js';
import { User } from '../models/index.js';

export async function seedDatabase() {
  console.log('🔄 Checking database initial state...');

  try {
    // Column safety migrations (runs once if not present)
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
      'ALTER TABLE organizations ADD COLUMN IF NOT EXISTS "logoUrl" TEXT;',
      'ALTER TABLE devices ADD COLUMN IF NOT EXISTS "sleep_count" INTEGER DEFAULT 10;',
      'ALTER TABLE devices ADD COLUMN IF NOT EXISTS "wake_count" INTEGER DEFAULT 30;',
      'ALTER TABLE devices ADD COLUMN IF NOT EXISTS "calibrate" BOOLEAN DEFAULT false;',
      'ALTER TABLE devices ADD COLUMN IF NOT EXISTS "gaugeLength_mm" FLOAT DEFAULT 1000.0;',
      'ALTER TABLE devices ADD COLUMN IF NOT EXISTS "refThetaX" FLOAT DEFAULT 0.0;',
      'ALTER TABLE devices ADD COLUMN IF NOT EXISTS "refThetaY" FLOAT DEFAULT 0.0;',
      'ALTER TABLE devices ADD COLUMN IF NOT EXISTS "refThetaZ" FLOAT DEFAULT 0.0;',
      'ALTER TABLE devices ADD COLUMN IF NOT EXISTS "refTimestamp" TIMESTAMP WITH TIME ZONE;',
      'ALTER TABLE devices ADD COLUMN IF NOT EXISTS "refOperator" VARCHAR(255) DEFAULT \'System\';',
      'ALTER TABLE devices ADD COLUMN IF NOT EXISTS "hasReferenceZero" BOOLEAN DEFAULT false;',
      'ALTER TABLE devices ADD COLUMN IF NOT EXISTS "zTilt" FLOAT DEFAULT 0.0;',
      'ALTER TABLE devices ADD COLUMN IF NOT EXISTS "yaw" FLOAT DEFAULT 0.0;',
      'ALTER TABLE telemetry_records ADD COLUMN IF NOT EXISTS "zTilt" FLOAT DEFAULT 0.0;',
      'ALTER TABLE telemetry_records ADD COLUMN IF NOT EXISTS "yaw" FLOAT DEFAULT 0.0;',
      'ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS "projectId" VARCHAR(255);',
      'ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS "projectName" VARCHAR(255);',
      'ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS "siteId" VARCHAR(255);',
      'ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS "siteName" VARCHAR(255);',
      'ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS "assetId" VARCHAR(255);',
      'ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS "assetName" VARCHAR(255);',
      'ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS "deviceIds" JSON DEFAULT \'[]\';',
      'ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS "emails" JSON DEFAULT \'[]\';',
      'ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS "parameter" VARCHAR(255) DEFAULT \'tilt\';',
      'ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS "condition" VARCHAR(255) DEFAULT \'GREATER_THAN\';',
      'ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS "operator" VARCHAR(255) DEFAULT \'>\';',
      'ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS "thresholdValue" FLOAT DEFAULT 2.0;',
      'ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS "critical_threshold" FLOAT DEFAULT 2.0;',
      'ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS "warning_threshold" FLOAT DEFAULT 1.0;',
      'ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS "info_threshold" FLOAT DEFAULT 0.5;',
      'ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS "severity" VARCHAR(255) DEFAULT \'CRITICAL\';',
      'ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS "message" TEXT;',
      'ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS "enabled" BOOLEAN DEFAULT true;',
      'ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS "organizationId" INTEGER;',

      // Schema v2 columns for telemetry_records
      'ALTER TABLE telemetry_records ADD COLUMN IF NOT EXISTS "schemaVersion" INTEGER DEFAULT 2;',
      'ALTER TABLE telemetry_records ADD COLUMN IF NOT EXISTS "sampleUptimeMs" BIGINT;',
      'ALTER TABLE telemetry_records ADD COLUMN IF NOT EXISTS "batteryVoltage" FLOAT;',
      'ALTER TABLE telemetry_records ADD COLUMN IF NOT EXISTS "csq" INTEGER;',
      'ALTER TABLE telemetry_records ADD COLUMN IF NOT EXISTS "rockfallDeltaPeak" FLOAT;',
      'ALTER TABLE telemetry_records ADD COLUMN IF NOT EXISTS "touchVibrationPeak" FLOAT;',
      'ALTER TABLE telemetry_records ADD COLUMN IF NOT EXISTS "vibrationRMS" FLOAT;',
      'ALTER TABLE telemetry_records ADD COLUMN IF NOT EXISTS "motionClassification" VARCHAR(255);',
      'ALTER TABLE telemetry_records ADD COLUMN IF NOT EXISTS "alarmActive" BOOLEAN DEFAULT false;',
      'ALTER TABLE telemetry_records ADD COLUMN IF NOT EXISTS "eventPending" BOOLEAN DEFAULT false;',
      'ALTER TABLE telemetry_records ADD COLUMN IF NOT EXISTS "accelerationCurrent" JSONB;',
      'ALTER TABLE telemetry_records ADD COLUMN IF NOT EXISTS "accelerationReference" JSONB;',
      'ALTER TABLE telemetry_records ADD COLUMN IF NOT EXISTS "accelerationDelta" JSONB;',
      'ALTER TABLE telemetry_records ADD COLUMN IF NOT EXISTS "tilt" JSONB;',
      'ALTER TABLE telemetry_records ADD COLUMN IF NOT EXISTS "angleReference" JSONB;',
      'ALTER TABLE telemetry_records ADD COLUMN IF NOT EXISTS "angleCurrent" JSONB;',
      'ALTER TABLE telemetry_records ADD COLUMN IF NOT EXISTS "angleDelta" JSONB;',
      'ALTER TABLE telemetry_records ADD COLUMN IF NOT EXISTS "displacement" JSONB;',
      'ALTER TABLE telemetry_records ADD COLUMN IF NOT EXISTS "environment" JSONB;',
      'ALTER TABLE telemetry_records ADD COLUMN IF NOT EXISTS "power" JSONB;',
      'ALTER TABLE telemetry_records ADD COLUMN IF NOT EXISTS "network" JSONB;',
      'ALTER TABLE telemetry_records ADD COLUMN IF NOT EXISTS "calibration" JSONB;',
      'ALTER TABLE telemetry_records ADD COLUMN IF NOT EXISTS "rockfallAlarm" JSONB;',
      'ALTER TABLE telemetry_records ADD COLUMN IF NOT EXISTS "motionEvent" JSONB;',
      'ALTER TABLE telemetry_records ADD COLUMN IF NOT EXISTS "monitoringSettings" JSONB;',
      'ALTER TABLE telemetry_records ADD COLUMN IF NOT EXISTS "units" JSONB;',

      // Schema v2 columns for devices
      'ALTER TABLE devices ADD COLUMN IF NOT EXISTS "schemaVersion" INTEGER DEFAULT 2;',
      'ALTER TABLE devices ADD COLUMN IF NOT EXISTS "motionClassification" VARCHAR(255) DEFAULT \'STABLE\';',
      'ALTER TABLE devices ADD COLUMN IF NOT EXISTS "alarmActive" BOOLEAN DEFAULT false;',
      'ALTER TABLE devices ADD COLUMN IF NOT EXISTS "rockfallDeltaPeak" FLOAT;',
      'ALTER TABLE devices ADD COLUMN IF NOT EXISTS "vibrationPeak" FLOAT;',
      'ALTER TABLE devices ADD COLUMN IF NOT EXISTS "monitoringSettings" JSONB;',
    ];

    for (const q of addColumnQueries) {
      try {
        await sequelize.query(q);
      } catch (migErr) {
        // Ignored if column already exists
      }
    }

    // Clean up any legacy emails from database
    try {
      await sequelize.query(`UPDATE users SET email = 'superadmin@techavo.in' WHERE email = 'superadmin@tiltmeter.io';`);
    } catch (_) {}

    // Ensure root Super Administrator exists only if no users are registered
    const userCount = await User.count();
    if (userCount === 0) {
      const salt = await bcrypt.genSalt(10);
      const superadminHash = await bcrypt.hash('superadmin123', salt);

      await User.create({
        username: 'superadmin',
        passwordHash: superadminHash,
        email: 'superadmin@techavo.in',
        role: 'SUPER_ADMIN',
        fullName: 'Super Administrator',
        scopeType: 'ALL',
        status: 'ACTIVE',
      });
      console.log('🔑 Created initial Super Administrator account: superadmin / superadmin123');
    }

    console.log('✅ PostgreSQL Schema initialized cleanly without seed/simulator data.');
  } catch (err) {
    console.error('❌ Error during schema initialization:', err.message);
  }
}
