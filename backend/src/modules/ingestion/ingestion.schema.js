import Joi from 'joi';

export const telemetryIngestSchema = Joi.object({
  deviceId: Joi.string().optional().default('TM-001'),

  acceleration: Joi.object({
    ax: Joi.number().optional(),
    ay: Joi.number().optional(),
    az: Joi.number().optional(),
    accMag: Joi.number().optional(),
  }).optional(),

  gyroscope: Joi.object({
    gx: Joi.number().optional(),
    gy: Joi.number().optional(),
    gz: Joi.number().optional(),
    gyroMag: Joi.number().optional(),
  }).optional(),

  tilt: Joi.object({
    roll: Joi.number().optional(),
    pitch: Joi.number().optional(),
    tilt: Joi.number().optional(),
    tiltStatus: Joi.string().optional().default('NORMAL'),
  }).optional(),

  vibration: Joi.object({
    vibration: Joi.number().optional(),
    xVibrationRMS: Joi.number().optional(),
    yVibrationRMS: Joi.number().optional(),
    zVibrationRMS: Joi.number().optional(),
    vibrationRMS: Joi.number().optional(),
    vibrationPeak: Joi.number().optional(),
    vibrationStatus: Joi.string().optional().default('NORMAL'),
  }).optional(),

  displacement: Joi.object({
    xDisplacement_mm: Joi.number().optional(),
    yDisplacement_mm: Joi.number().optional(),
    zDisplacement_mm: Joi.number().optional(),
    totalDisplacement_mm: Joi.number().optional(),
  }).optional(),

  environment: Joi.object({
    temperature: Joi.number().optional(),
  }).optional(),

  calibration: Joi.object({
    calibrated: Joi.boolean().optional().default(true),
  }).optional(),

  timestamp: Joi.string().optional(),
}).unknown(true);
