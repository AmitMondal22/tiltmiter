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
 *   power: { batteryVoltage },
 *   network: { csq },
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
  const ax = data.acceleration?.ax ?? 6.11;
  const ay = data.acceleration?.ay ?? 1.35871;
  const az = data.acceleration?.az ?? 7.48188;
  const accMag = data.acceleration?.accMag ?? 9.75483;

  // Gyroscope
  const gx = data.gyroscope?.gx ?? -0.000533;
  const gy = data.gyroscope?.gy ?? 0.000000;
  const gz = data.gyroscope?.gz ?? -0.003995;
  const gyroMag = data.gyroscope?.gyroMag ?? 0.004030;

  // Vibration
  const vibRMS = data.vibration?.vibrationRMS ?? data.vibration?.vibration ?? 0.68395;
  const vibPeak = data.vibration?.vibrationPeak ?? 9.61712;
  const xVib = data.vibration?.xVibrationRMS ?? 0.42756;
  const yVib = data.vibration?.yVibrationRMS ?? 0.09366;
  const zVib = data.vibration?.zVibrationRMS ?? 0.52555;
  const vibRaw = data.vibration?.vibration ?? 0.03484;
  const vibStatus = data.vibration?.vibrationStatus || 'NORMAL';

  // Displacement
  const xDisp = data.displacement?.xDisplacement_mm ?? data.xDisplacement ?? 16.7837;
  const yDisp = data.displacement?.yDisplacement_mm ?? data.yDisplacement ?? 1.2920;
  const zDisp = data.displacement?.zDisplacement_mm ?? data.zDisplacement ?? 17.3615;
  const totalDisp = data.displacement?.totalDisplacement_mm ?? data.totalDisplacement ?? Math.sqrt(xDisp * xDisp + yDisp * yDisp + zDisp * zDisp);

  // Environment & Calibration
  const temp = data.environment?.temperature ?? (typeof data.temperature === 'number' ? data.temperature : parseFloat(data.temperature) || 28.12);
  const calibrated = data.calibration?.calibrated ?? false;

  // Power & Network Diagnostics
  const batteryVoltage = data.power?.batteryVoltage ?? (typeof data.batteryVoltage === 'number' ? data.batteryVoltage : parseFloat(data.batteryVoltage) || 13.03);
  const csq = data.network?.csq ?? (typeof data.csq === 'number' ? data.csq : parseInt(data.csq) || 19);

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
    vibRaw,
    vibStatus,
    vibration: { vibration: vibRaw, vibrationRMS: vibRMS, vibrationPeak: vibPeak, xVibrationRMS: xVib, yVibrationRMS: yVib, zVibrationRMS: zVib, vibrationStatus: vibStatus },

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

    // Environment & Power & Network & Calibration
    temp,
    temperature: typeof temp === 'number' ? `${temp} °C` : temp,
    batteryVoltage,
    csq,
    power: { batteryVoltage },
    network: { csq },
    calibrated,
    environment: { temperature: temp },
    calibration: { calibrated },
    timestamp: data.timestamp || new Date().toISOString(),
  };
}
