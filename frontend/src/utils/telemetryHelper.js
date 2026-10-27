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

/**
 * ClinoX | Reference-Zero Method and Degree-to-Millimetre Conversion
 * Formula: D = L * tan(Δθ * π / 180)
 *
 * @param {Object} params
 * @param {number} params.roll - Current X tilt angle in degrees (θX,current)
 * @param {number} params.pitch - Current Y tilt angle in degrees (θY,current)
 * @param {number} [params.refThetaX=0] - Saved baseline reference zero angle for X (θX,reference)
 * @param {number} [params.refThetaY=0] - Saved baseline reference zero angle for Y (θY,reference)
 * @param {number} [params.gaugeLength_mm=1000] - Effective vertical distance / rod length L in mm (default: 1000 mm)
 * @returns {Object} Calculated displacement metrics and delta angles
 */
export function calculateTiltToDisplacement({
  roll = 0,
  pitch = 0,
  refThetaX = 0,
  refThetaY = 0,
  gaugeLength_mm = 1000.0,
}) {
  const L = parseFloat(gaugeLength_mm) || 1000.0;
  const currentX = parseFloat(roll) || 0;
  const currentY = parseFloat(pitch) || 0;
  const refX = parseFloat(refThetaX) || 0;
  const refY = parseFloat(refThetaY) || 0;

  // ΔθX = θX,current − θX,reference
  const deltaThetaX = currentX - refX;
  // ΔθY = θY,current − θY,reference
  const deltaThetaY = currentY - refY;

  // Convert degrees into radians before tangent calculation (θ * π / 180)
  const radX = (deltaThetaX * Math.PI) / 180.0;
  const radY = (deltaThetaY * Math.PI) / 180.0;

  // Primary conversion formula: D = L * tan(Δθ * π / 180)
  const xDisp = L * Math.tan(radX);
  const yDisp = L * Math.tan(radY);

  // Resultant / Total lateral displacement: D_total = sqrt(Dx^2 + Dy^2)
  const totalDisp = Math.sqrt(xDisp * xDisp + yDisp * yDisp);

  return {
    L,
    deltaThetaX: Number(deltaThetaX.toFixed(1)),
    deltaThetaY: Number(deltaThetaY.toFixed(1)),
    xDisp: Number(xDisp.toFixed(1)),
    yDisp: Number(yDisp.toFixed(1)),
    totalDisp: Number(totalDisp.toFixed(1)),
    formattedDeltaX: `${deltaThetaX >= 0 ? '+' : ''}${deltaThetaX.toFixed(1)}°`,
    formattedDeltaY: `${deltaThetaY >= 0 ? '+' : ''}${deltaThetaY.toFixed(1)}°`,
    formattedDispX: `${xDisp >= 0 ? '+' : ''}${xDisp.toFixed(1)} mm`,
    formattedDispY: `${yDisp >= 0 ? '+' : ''}${yDisp.toFixed(1)} mm`,
    formattedTotalDisp: `${totalDisp.toFixed(1)} mm`,
  };
}

/**
 * Formats any numeric value to 1 decimal place (e.g. 1.01215 -> 1.0).
 */
export function format1Dec(val, fallback = '0.0') {
  if (val === null || val === undefined || val === '') return fallback;
  const num = parseFloat(val);
  return isNaN(num) ? fallback : num.toFixed(1);
}

/**
 * Converts battery voltage in 0 to 13 range (0V = 0%, 13V = 100%) to a clean 0% to 100% string.
 */
export function formatBatteryPercentage(val) {
  if (val === null || val === undefined || val === '') return '--';
  if (typeof val === 'string' && val.includes('%')) {
    const p = parseFloat(val);
    return !isNaN(p) ? `${Math.min(100, Math.max(0, Math.round(p)))}%` : val;
  }
  const isVoltageStr = typeof val === 'string' && /v/i.test(val);
  const num = parseFloat(val);
  if (isNaN(num)) return '--';
  let pct = 0;
  // If explicitly designated with 'V' or value is in voltage operating range (<= 20V):
  // Scale 0 to 13V -> 0% to 100% (e.g. 13V+ or 13.98V float/charging is clamped to 100%)
  if (isVoltageStr || num <= 20) {
    pct = Math.min(100, Math.max(0, Math.round((num / 13.0) * 100)));
  } else {
    // Already in 0 to 100 percentage scale
    pct = Math.min(100, Math.max(0, Math.round(num)));
  }
  return `${pct}%`;
}

export function parseTelemetry(data) {
  if (!data) return {};

  // Acceleration
  const ax = typeof data.acceleration?.ax === 'number' ? data.acceleration.ax : (parseFloat(data.acceleration?.ax) || 0);
  const ay = typeof data.acceleration?.ay === 'number' ? data.acceleration.ay : (parseFloat(data.acceleration?.ay) || 0);
  const az = typeof data.acceleration?.az === 'number' ? data.acceleration.az : (parseFloat(data.acceleration?.az) || 9.80665);
  const accMag = typeof data.acceleration?.accMag === 'number' ? data.acceleration.accMag : (parseFloat(data.acceleration?.accMag) || Math.sqrt(ax * ax + ay * ay + az * az));

  const roll = typeof data.tilt?.roll === 'number' ? data.tilt.roll : (typeof data.xTilt === 'number' ? data.xTilt : (typeof data.roll === 'number' ? data.roll : (parseFloat(data.tilt?.roll ?? data.xTilt ?? data.roll) || 0)));
  const pitch = typeof data.tilt?.pitch === 'number' ? data.tilt.pitch : (typeof data.yTilt === 'number' ? data.yTilt : (typeof data.pitch === 'number' ? data.pitch : (parseFloat(data.tilt?.pitch ?? data.yTilt ?? data.pitch) || 0)));
  const tiltVal = typeof data.tilt?.tilt === 'number' ? data.tilt.tilt : (typeof data.resultantTilt === 'number' ? data.resultantTilt : (typeof data.tilt === 'number' ? data.tilt : (parseFloat(data.tilt?.tilt ?? data.resultantTilt ?? data.tilt) || Math.sqrt(roll * roll + pitch * pitch))));
  const zTilt = typeof data.tilt?.zTilt === 'number' ? data.tilt.zTilt : (typeof data.zTilt === 'number' ? data.zTilt : (!isNaN(az) && accMag > 0 ? (Math.acos(Math.max(-1, Math.min(1, Math.abs(az) / accMag))) * 180) / Math.PI : tiltVal));
  const tiltStatus = data.tilt?.tiltStatus || data.tiltStatus || 'NORMAL';

  // Slope in mm/m (1000 * sin(angle * π / 180))
  const xSlope = typeof data.xSlope === 'number' ? data.xSlope : Math.sin((roll * Math.PI) / 180) * 1000;
  const ySlope = typeof data.ySlope === 'number' ? data.ySlope : Math.sin((pitch * Math.PI) / 180) * 1000;
  const zSlope = typeof data.zSlope === 'number' ? data.zSlope : Math.sin((zTilt * Math.PI) / 180) * 1000;
  const resultantSlope = typeof data.resultantSlope === 'number' ? data.resultantSlope : Math.sin((tiltVal * Math.PI) / 180) * 1000;

  // ClinoX Reference Zero and Gauge Length (L)
  const gaugeLength_mm = parseFloat(data.gaugeLength_mm || data.gaugeLength || data.L || 1000.0);
  const refThetaX = parseFloat(data.refThetaX ?? data.baselineRoll ?? 0.0);
  const refThetaY = parseFloat(data.refThetaY ?? data.baselinePitch ?? 0.0);
  const refThetaZ = parseFloat(data.refThetaZ ?? data.baselineTilt ?? 0.0);
  const hasReferenceZero = Boolean(data.hasReferenceZero === true || (data.calibrate === true && (refThetaX !== 0 || refThetaY !== 0)));

  // ClinoX D = L * tan(Δθ * π / 180)
  const clinoX = calculateTiltToDisplacement({
    roll,
    pitch,
    refThetaX: hasReferenceZero ? refThetaX : 0,
    refThetaY: hasReferenceZero ? refThetaY : 0,
    gaugeLength_mm,
  });

  // Gyroscope
  const gx = typeof data.gyroscope?.gx === 'number' ? data.gyroscope.gx : (parseFloat(data.gyroscope?.gx) || 0);
  const gy = typeof data.gyroscope?.gy === 'number' ? data.gyroscope.gy : (parseFloat(data.gyroscope?.gy) || 0);
  const gz = typeof data.gyroscope?.gz === 'number' ? data.gyroscope.gz : (parseFloat(data.gyroscope?.gz) || 0);
  const gyroMag = typeof data.gyroscope?.gyroMag === 'number' ? data.gyroscope.gyroMag : (parseFloat(data.gyroscope?.gyroMag) || Math.sqrt(gx * gx + gy * gy + gz * gz));

  // Vibration
  const vibRMS = typeof data.vibration?.vibrationRMS === 'number' ? data.vibration.vibrationRMS : (parseFloat(data.vibration?.vibrationRMS ?? data.vibration?.vibration) || 0);
  const vibPeak = typeof data.vibration?.vibrationPeak === 'number' ? data.vibration.vibrationPeak : (parseFloat(data.vibration?.vibrationPeak) || 0);
  const xVib = typeof data.vibration?.xVibrationRMS === 'number' ? data.vibration.xVibrationRMS : (parseFloat(data.vibration?.xVibrationRMS) || 0);
  const yVib = typeof data.vibration?.yVibrationRMS === 'number' ? data.vibration.yVibrationRMS : (parseFloat(data.vibration?.yVibrationRMS) || 0);
  const zVib = typeof data.vibration?.zVibrationRMS === 'number' ? data.vibration.zVibrationRMS : (parseFloat(data.vibration?.zVibrationRMS) || 0);
  const vibRaw = typeof data.vibration?.vibration === 'number' ? data.vibration.vibration : (parseFloat(data.vibration?.vibration) || 0);
  const vibStatus = data.vibration?.vibrationStatus || 'NORMAL';

  // Displacement: prioritize hardware / database measurement if valid, otherwise compute via ClinoX D = L * tan(Δθ * π / 180)
  const rawXDisp = data.displacement?.xDisplacement_mm ?? data.xDisplacement;
  const rawYDisp = data.displacement?.yDisplacement_mm ?? data.yDisplacement;
  const rawZDisp = data.displacement?.zDisplacement_mm ?? data.zDisplacement;

  const xDisp = typeof rawXDisp === 'number' && !isNaN(rawXDisp)
    ? rawXDisp
    : (rawXDisp !== undefined && rawXDisp !== null && !isNaN(parseFloat(rawXDisp)) ? parseFloat(rawXDisp) : clinoX.xDisp);

  const yDisp = typeof rawYDisp === 'number' && !isNaN(rawYDisp)
    ? rawYDisp
    : (rawYDisp !== undefined && rawYDisp !== null && !isNaN(parseFloat(rawYDisp)) ? parseFloat(rawYDisp) : clinoX.yDisp);

  const zDisp = typeof rawZDisp === 'number' && !isNaN(rawZDisp)
    ? rawZDisp
    : (rawZDisp !== undefined && rawZDisp !== null && !isNaN(parseFloat(rawZDisp)) ? parseFloat(rawZDisp) : 0);

  const rawTotalDisp = data.displacement?.totalDisplacement_mm ?? data.totalDisplacement;
  const totalDisp = typeof rawTotalDisp === 'number' && !isNaN(rawTotalDisp)
    ? rawTotalDisp
    : (rawTotalDisp !== undefined && rawTotalDisp !== null && !isNaN(parseFloat(rawTotalDisp)) ? parseFloat(rawTotalDisp) : Math.sqrt(xDisp * xDisp + yDisp * yDisp));

  // Environment & Calibration - no dummy values
  const rawTemp = data.environment?.temperature ?? data.temperature ?? data.temp;
  const temp = rawTemp !== undefined && rawTemp !== null && !isNaN(parseFloat(rawTemp)) ? parseFloat(rawTemp) : null;
  const calibrated = Boolean(data.calibration?.calibrated ?? data.calibrate ?? data.hasReferenceZero ?? false);

  // Power & Battery Percentage calculation: 0 to 13 is 0 to 100%
  const rawBat = data.power?.batteryVoltage ?? data.batteryVoltage ?? data.battery;
  const batteryVoltage = rawBat !== undefined && rawBat !== null && !isNaN(parseFloat(rawBat)) ? parseFloat(rawBat) : null;
  const batteryStr = formatBatteryPercentage(rawBat);
  const batteryPercent = batteryStr !== '--' ? parseInt(batteryStr, 10) : null;

  // Network & CSQ Percentage calculation: 31 CSQ is 100%, 0 CSQ is 0%, min 0%, max 100%
  const rawCsq = data.network?.csq ?? data.csq ?? data.signal;
  const csq = rawCsq !== undefined && rawCsq !== null && !isNaN(parseInt(rawCsq)) ? parseInt(rawCsq) : null;
  const csqPercent = csq !== null ? Math.min(100, Math.max(0, Math.round((csq / 31) * 100))) : null;
  const csqStr = csqPercent !== null ? `${csqPercent}%` : null;
  const signalStr = csqStr;

  // Calculate cardinal tilt direction angle
  const angleRad = Math.atan2(pitch, roll);
  let angleDeg = (angleRad * 180) / Math.PI;
  if (angleDeg < 0) angleDeg += 360;

  const cardinals = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const cardinalIdx = Math.round(angleDeg / 45) % 8;
  const cardinalStr = cardinals[cardinalIdx];

  return {
    ...data,
    deviceId: data.deviceId || data.id || null,
    // Mapped flat fields
    roll,
    pitch,
    tilt: tiltVal,
    xTilt: roll,
    yTilt: pitch,
    zTilt,
    resultantTilt: tiltVal,
    tiltStatus,
    tiltDirectionAngle: angleDeg,
    tiltDirectionCardinal: cardinalStr,

    // Slopes in mm/m
    xSlope,
    ySlope,
    zSlope,
    resultantSlope,

    // Acceleration
    ax,
    ay,
    az,
    axG: Math.abs(ax) > 3.0 ? ax / 9.80665 : ax,
    ayG: Math.abs(ay) > 3.0 ? ay / 9.80665 : ay,
    azG: Math.abs(az) > 3.0 ? az / 9.80665 : az,
    accMag,
    acceleration: {
      ax,
      ay,
      az,
      axG: Math.abs(ax) > 3.0 ? ax / 9.80665 : ax,
      ayG: Math.abs(ay) > 3.0 ? ay / 9.80665 : ay,
      azG: Math.abs(az) > 3.0 ? az / 9.80665 : az,
      accMag,
    },

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
    temperature: temp !== null && temp !== undefined ? `${temp} °C` : '--',

    // Power
    battery: batteryStr,
    batteryPercent,
    batteryVoltage,
    batteryVoltageFormatted: batteryVoltage !== null ? `${batteryVoltage.toFixed(1)} V` : '--',
    power: { batteryVoltage, batteryPercent },

    // Network
    signal: csqStr,
    signalStrength: signalStr,
    csq,
    csqPercent,
    network: { csq, csqPercent },

    calibrated,
    environment: { temperature: temp },
    calibration: { calibrated },
    timestamp: data.timestamp || new Date().toISOString(),

    // ClinoX Reference Zero and Delta Angles
    gaugeLength_mm,
    refThetaX,
    refThetaY,
    refThetaZ,
    hasReferenceZero,
    deltaThetaX: clinoX.deltaThetaX,
    deltaThetaY: clinoX.deltaThetaY,
    clinoX,
  };
}
