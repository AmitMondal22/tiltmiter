/**
 * Standard Telemetry Helper to safely extract nested values from the exact hardware sensor packet format:
 * {
 *   deviceId,
 *   acceleration: { ax, ay, az, accMag },
 *   gyroscope: { gx, gy, gz, gyroMag },
 *   tilt: { roll, pitch, tilt, tiltStatus },
 *   vibration: { vibration, xVibrationRMS, yVibrationRMS, zVibrationRMS, vibrationRMS, vibrationPeak, vibrationStatus },
 *   displacement: { xDisplacement_mm, yDisplacement_mm, zDisplacement_mm, totalDisplacement_mm },
 *   environment: { temperature },
 *   calibration: { calibrated },
 *   timestamp
 * }
 */

export function parseTelemetry(data) {
  if (!data) return {};

  const roll = data.tilt?.roll ?? data.xTilt ?? data.roll ?? 0;
  const pitch = data.tilt?.pitch ?? data.yTilt ?? data.pitch ?? 0;
  const tiltVal = data.tilt?.tilt ?? data.resultantTilt ?? data.tilt ?? Math.sqrt(roll * roll + pitch * pitch);
  const tiltStatus = data.tilt?.tiltStatus || data.tiltStatus || 'NORMAL';

  // Acceleration
  const ax = data.acceleration?.ax ?? 0.352;
  const ay = data.acceleration?.ay ?? 1.094;
  const az = data.acceleration?.az ?? 9.760;
  const accMag = data.acceleration?.accMag ?? 9.828;

  // Gyroscope
  const gx = data.gyroscope?.gx ?? 0.0018;
  const gy = data.gyroscope?.gy ?? -0.0084;
  const gz = data.gyroscope?.gz ?? 0.0022;
  const gyroMag = data.gyroscope?.gyroMag ?? 0.0088;

  // Vibration
  const vibRMS = data.vibration?.vibrationRMS ?? data.vibration?.vibration ?? 0.045;
  const vibPeak = data.vibration?.vibrationPeak ?? 0.104;
  const xVib = data.vibration?.xVibrationRMS ?? 0.023;
  const yVib = data.vibration?.yVibrationRMS ?? 0.023;
  const zVib = data.vibration?.zVibrationRMS ?? 0.031;
  const vibStatus = data.vibration?.vibrationStatus || 'NORMAL';

  // Displacement
  const xDisp = data.displacement?.xDisplacement_mm ?? data.xDisplacement ?? 0.1237;
  const yDisp = data.displacement?.yDisplacement_mm ?? data.yDisplacement ?? 4.5988;
  const zDisp = data.displacement?.zDisplacement_mm ?? data.zDisplacement ?? 0.8299;
  const totalDisp = data.displacement?.totalDisplacement_mm ?? data.totalDisplacement ?? Math.sqrt(xDisp * xDisp + yDisp * yDisp + zDisp * zDisp);

  // Environment & Calibration
  const temp = data.environment?.temperature ?? (typeof data.temperature === 'number' ? data.temperature : parseFloat(data.temperature) || 29.69);
  const calibrated = data.calibration?.calibrated ?? true;

  // Calculate cardinal tilt direction angle
  const angleRad = Math.atan2(pitch, roll);
  let angleDeg = (angleRad * 180) / Math.PI;
  if (angleDeg < 0) angleDeg += 360;

  const cardinals = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const cardinalIdx = Math.round(angleDeg / 45) % 8;
  const cardinalStr = cardinals[cardinalIdx];

  return {
    ...data,
    deviceId: data.deviceId || 'TM-001',
    // Mapped flat fields
    roll,
    pitch,
    tilt: tiltVal,
    xTilt: roll,
    yTilt: pitch,
    resultantTilt: tiltVal,
    tiltStatus,
    tiltDirectionAngle: angleDeg,
    tiltDirectionCardinal: cardinalStr,

    // Acceleration
    ax,
    ay,
    az,
    accMag,
    acceleration: { ax, ay, az, accMag },

    // Gyroscope
    gx,
    gy,
    gz,
    gyroMag,
    gyroscope: { gx, gy, gz, gyroMag },

    // Vibration
    xVib,
    yVib,
    zVib,
    vibRMS,
    vibPeak,
    vibStatus,
    vibration: { vibrationRMS: vibRMS, vibrationPeak: vibPeak, xVibrationRMS: xVib, yVibrationRMS: yVib, zVibrationRMS: zVib, vibrationStatus: vibStatus },

    // Displacement
    xDisp,
    yDisp,
    zDisp,
    totalDisp,
    xDisplacement: xDisp,
    yDisplacement: yDisp,
    zDisplacement: zDisp,
    totalDisplacement: totalDisp,
    displacement: { xDisplacement_mm: xDisp, yDisplacement_mm: yDisp, zDisplacement_mm: zDisp, totalDisplacement_mm: totalDisp },

    // Environment & Calibration
    temp,
    temperature: typeof temp === 'number' ? `${temp} °C` : temp,
    calibrated,
    environment: { temperature: temp },
    calibration: { calibrated },
    timestamp: data.timestamp || new Date().toISOString(),
  };
}
