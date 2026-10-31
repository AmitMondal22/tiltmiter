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
 * If value is missing or null, returns empty placeholder '--' instead of fake '0.0'.
 */
export function format1Dec(val, fallback = '--') {
  if (val === null || val === undefined || val === '' || val === '--') return fallback;
  const num = parseFloat(val);
  return isNaN(num) ? fallback : num.toFixed(1);
}

/**
 * Formats signed delta value (e.g. +1.4° or -0.8° or +0.0°).
 * Retains full precision until formatting to 1 decimal place for display only.
 * Returns '--' if missing/null.
 */
export function formatSigned(val, decimals = 1, unit = '°', fallback = '--') {
  if (val === null || val === undefined || val === '' || val === '--') return fallback;
  const num = typeof val === 'number' ? val : parseFloat(val);
  if (isNaN(num)) return fallback;
  const absFormatted = Math.abs(num).toFixed(decimals);
  if (absFormatted === (0).toFixed(decimals)) {
    return `+${absFormatted}${unit}`;
  }
  return `${num >= 0 ? '+' : '-'}${absFormatted}${unit}`;
}

/**
 * Formats present actual value without subtracting reference angle.
 * Displays actual angle rounded to 1 decimal place for display only (e.g. 1.4° or -1.4°).
 * Returns '--' if missing/null.
 */
export function formatPresent(val, decimals = 1, unit = '°', fallback = '--') {
  if (val === null || val === undefined || val === '' || val === '--') return fallback;
  const num = typeof val === 'number' ? val : parseFloat(val);
  if (isNaN(num)) return fallback;
  const absFormatted = Math.abs(num).toFixed(decimals);
  if (absFormatted === (0).toFixed(decimals)) {
    return `${absFormatted}${unit}`;
  }
  return `${num < 0 ? '-' : ''}${absFormatted}${unit}`;
}

/**
 * Converts battery voltage in 0 to 13 range (0V = 0%, 13V = 100%) to a clean 0% to 100% string.
 * Returns '--' if no value was reported by the sensor.
 */
export function formatBatteryPercentage(val, fallback = '--') {
  if (val === null || val === undefined || val === '' || val === '--') return fallback;
  if (typeof val === 'string' && val.includes('%')) {
    const p = parseFloat(val);
    return !isNaN(p) ? `${Math.min(100, Math.max(0, Math.round(p)))}%` : fallback;
  }
  const isVoltageStr = typeof val === 'string' && /v/i.test(val);
  const num = parseFloat(val);
  if (isNaN(num)) return fallback;
  let pct = 0;
  if (isVoltageStr || num <= 20) {
    pct = Math.min(100, Math.max(0, Math.round((num / 13.0) * 100)));
  } else {
    pct = Math.min(100, Math.max(0, Math.round(num)));
  }
  return `${pct}%`;
}

/**
 * Converts cellular CSQ (0 to 31) into clean 0% to 100% percentage string.
 * Returns '--' if missing/empty.
 */
export function formatCSQPercentage(val, fallback = '--') {
  if (val === null || val === undefined || val === '' || val === '--') return fallback;

  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed.includes('%')) {
      const p = parseFloat(trimmed);
      return !isNaN(p) ? `${Math.min(100, Math.max(0, Math.round(p)))}%` : fallback;
    }
    if (/dbm/i.test(trimmed)) {
      const dbm = parseFloat(trimmed);
      if (!isNaN(dbm)) {
        const pct = Math.min(100, Math.max(0, Math.round(((dbm - (-113)) / ((-51) - (-113))) * 100)));
        return `${pct}%`;
      }
    }
  }

  const num = parseFloat(val);
  if (isNaN(num)) return fallback;
  if (num < 0) {
    const pct = Math.min(100, Math.max(0, Math.round(((num - (-113)) / ((-51) - (-113))) * 100)));
    return `${pct}%`;
  }
  if (num === 99) {
    return fallback;
  }
  let pct = 0;
  if (num <= 31) {
    pct = Math.min(100, Math.max(0, Math.round((num / 31.0) * 100)));
  } else {
    pct = Math.min(100, Math.max(0, Math.round(num)));
  }
  return `${pct}%`;
}

/**
 * Checks whether a given telemetry object has genuine, valid sensor data.
 * Devices that have never sent telemetry or empty records return false.
 */
export function hasTelemetryData(data) {
  if (!data || typeof data !== 'object') return false;
  const hasTs = Boolean(data.timestamp || data.time || data.deviceId || data.id);
  const hasSensor = (
    (typeof data.xTilt === 'number' && !isNaN(data.xTilt)) ||
    (typeof data.roll === 'number' && !isNaN(data.roll)) ||
    (typeof data.presentX === 'number' && !isNaN(data.presentX)) ||
    (typeof data.deltaX === 'number' && !isNaN(data.deltaX)) ||
    (typeof data.yTilt === 'number' && !isNaN(data.yTilt)) ||
    (typeof data.pitch === 'number' && !isNaN(data.pitch)) ||
    (typeof data.presentY === 'number' && !isNaN(data.presentY)) ||
    (typeof data.deltaY === 'number' && !isNaN(data.deltaY)) ||
    (typeof data.zTilt === 'number' && !isNaN(data.zTilt)) ||
    (typeof data.yaw === 'number' && !isNaN(data.yaw)) ||
    (typeof data.presentZ === 'number' && !isNaN(data.presentZ)) ||
    (typeof data.deltaZ === 'number' && !isNaN(data.deltaZ)) ||
    (typeof data.tilt?.roll === 'number' && !isNaN(data.tilt.roll)) ||
    (typeof data.tilt?.pitch === 'number' && !isNaN(data.tilt.pitch)) ||
    (typeof data.tilt?.yaw === 'number' && !isNaN(data.tilt.yaw)) ||
    (typeof data.acceleration?.ax === 'number' && !isNaN(data.acceleration.ax)) ||
    (typeof data.displacement?.xDisplacement_mm === 'number' && !isNaN(data.displacement.xDisplacement_mm)) ||
    (typeof data.displacement?.totalDisplacement_mm === 'number' && !isNaN(data.displacement.totalDisplacement_mm)) ||
    (typeof data.vibration?.vibrationRMS === 'number' && !isNaN(data.vibration.vibrationRMS)) ||
    (data.rawPayload && (data.rawPayload.tilt || data.rawPayload.acceleration || data.rawPayload.displacement))
  );
  return hasTs && hasSensor;
}

export function parseTelemetry(data) {
  if (!data) return {};

  const parseNum = (v) => {
    if (v === null || v === undefined || v === '' || v === '--') return null;
    const n = typeof v === 'number' ? v : parseFloat(v);
    return !isNaN(n) ? n : null;
  };

  // Acceleration
  const ax = parseNum(data.acceleration?.ax ?? data.ax ?? data.axG);
  const ay = parseNum(data.acceleration?.ay ?? data.ay ?? data.ayG);
  const az = parseNum(data.acceleration?.az ?? data.az ?? data.azG);
  const accMag = parseNum(data.acceleration?.accMag) ?? (ax !== null && ay !== null && az !== null ? Math.sqrt(ax * ax + ay * ay + az * az) : null);

  // 1. Axis Mapping:
  // X-Axis: tilt.roll
  // Y-Axis: tilt.pitch
  // Z-Axis: tilt.yaw
  const currentRoll = data.tilt?.roll ?? data.roll ?? data.xTilt ?? data.presentX ?? data.angleDelta?.x;
  const currentPitch = data.tilt?.pitch ?? data.pitch ?? data.yTilt ?? data.presentY ?? data.angleDelta?.y;
  const currentYaw = data.tilt?.yaw ?? data.yaw ?? data.zTilt ?? data.presentZ ?? data.angleDelta?.z;

  // 2. Present Values: actual device angle values without subtracting reference
  const roll = parseNum(currentRoll);
  const pitch = parseNum(currentPitch);
  const yaw = parseNum(currentYaw);

  // Combined tilt value: Math.sqrt(roll^2 + pitch^2)
  const rawTiltCombined = data.tilt?.tilt ?? data.presentTilt ?? data.resultantTilt ?? data.tilt;
  const tiltVal = parseNum(rawTiltCombined) ?? (roll !== null && pitch !== null ? Math.sqrt(roll * roll + pitch * pitch) : null);
  const zTilt = yaw;
  const tiltStatus = data.tilt?.tiltStatus || data.tiltStatus || 'NORMAL';

  // 2. Present Values: actual device angle values (Never subtract reference angle)
  const presentX = roll;
  const presentY = pitch;
  const presentZ = yaw;
  const presentTilt = tiltVal;

  // 3. Stored Reference Angles: Initially 0.0°, or calibrated reference if configured
  const gaugeLength_mm = parseFloat(data.gaugeLength_mm || data.gaugeLength || data.L || 1000.0) || 1000.0;
  const hasReferenceZero = Boolean(data.hasReferenceZero === true || data.calibrate === true);
  const refThetaX = hasReferenceZero ? (parseNum(data.device?.refThetaX ?? data.activeDevice?.refThetaX ?? data.refThetaX) || 0.0) : 0.0;
  const refThetaY = hasReferenceZero ? (parseNum(data.device?.refThetaY ?? data.activeDevice?.refThetaY ?? data.refThetaY) || 0.0) : 0.0;
  const refThetaZ = hasReferenceZero ? (parseNum(data.device?.refThetaZ ?? data.activeDevice?.refThetaZ ?? data.refThetaZ) || 0.0) : 0.0;

  // 4. Device angle values directly without logic modifications
  const deltaX = presentX;
  const deltaY = presentY;
  const deltaZ = presentZ;
  const deltaThetaX = deltaX;
  const deltaThetaY = deltaY;
  const deltaThetaZ = deltaZ;
  const deltaResultantTilt = (deltaX !== null && deltaY !== null) ? Math.sqrt(deltaX * deltaX + deltaY * deltaY) : null;

  // Slope in mm/m (1000 * sin(angle * π / 180)) based on delta angle
  const xSlope = deltaX !== null ? Math.sin((deltaX * Math.PI) / 180) * 1000 : null;
  const ySlope = deltaY !== null ? Math.sin((deltaY * Math.PI) / 180) * 1000 : null;
  const zSlope = deltaZ !== null ? Math.sin((deltaZ * Math.PI) / 180) * 1000 : null;
  const resultantSlope = deltaResultantTilt !== null ? Math.sin((deltaResultantTilt * Math.PI) / 180) * 1000 : null;

  // ClinoX D = L * tan(Δθ * π / 180) using full precision delta angles
  const radX = deltaX !== null ? (deltaX * Math.PI) / 180.0 : null;
  const radY = deltaY !== null ? (deltaY * Math.PI) / 180.0 : null;
  const clinoXDisp = radX !== null ? gaugeLength_mm * Math.tan(radX) : null;
  const clinoYDisp = radY !== null ? gaugeLength_mm * Math.tan(radY) : null;
  const clinoTotalDisp = (clinoXDisp !== null && clinoYDisp !== null) ? Math.sqrt(clinoXDisp * clinoXDisp + clinoYDisp * clinoYDisp) : null;

  const clinoX = {
    L: gaugeLength_mm,
    deltaThetaX,
    deltaThetaY,
    xDisp: clinoXDisp,
    yDisp: clinoYDisp,
    totalDisp: clinoTotalDisp,
    formattedDeltaX: formatSigned(deltaX),
    formattedDeltaY: formatSigned(deltaY),
    formattedDispX: clinoXDisp !== null ? formatSigned(clinoXDisp, 2, ' mm') : '--',
    formattedDispY: clinoYDisp !== null ? formatSigned(clinoYDisp, 2, ' mm') : '--',
    formattedTotalDisp: clinoTotalDisp !== null ? `${clinoTotalDisp.toFixed(2)} mm` : '--',
  };

  // Gyroscope
  const gx = parseNum(data.gyroscope?.gx ?? data.gx);
  const gy = parseNum(data.gyroscope?.gy ?? data.gy);
  const gz = parseNum(data.gyroscope?.gz ?? data.gz);
  const gyroMag = parseNum(data.gyroscope?.gyroMag) ?? (gx !== null && gy !== null && gz !== null ? Math.sqrt(gx * gx + gy * gy + gz * gz) : null);

  // Vibration
  const vibRMS = parseNum(data.vibration?.vibrationRMS ?? data.vibration?.vibration ?? data.vibrationRMS ?? data.vibRMS);
  const vibPeak = parseNum(data.vibration?.vibrationPeak ?? data.touchVibrationPeak ?? data.vibrationPeak ?? data.vibPeak);
  const xVib = parseNum(data.vibration?.xVibrationRMS ?? data.xVib);
  const yVib = parseNum(data.vibration?.yVibrationRMS ?? data.yVib);
  const zVib = parseNum(data.vibration?.zVibrationRMS ?? data.zVib);
  const vibRaw = parseNum(data.vibration?.vibration ?? data.vibRaw);
  const vibStatus = data.vibration?.vibrationStatus || 'NORMAL';

  // Displacement: use device telemetry data directly (displacement.xDisplacement_mm, etc.)
  const rawXDisp = data.displacement?.xDisplacement_mm ?? data.xDisplacement_mm ?? data.xDisplacement ?? data.xDisp;
  const rawYDisp = data.displacement?.yDisplacement_mm ?? data.yDisplacement_mm ?? data.yDisplacement ?? data.yDisp;
  const rawZDisp = data.displacement?.zDisplacement_mm ?? data.zDisplacement_mm ?? data.zDisplacement ?? data.zDisp;
  const rawTotalDisp = data.displacement?.totalDisplacement_mm ?? data.totalDisplacement_mm ?? data.totalDisplacement ?? data.totalDisp;

  const xDisp = parseNum(rawXDisp);
  const yDisp = parseNum(rawYDisp);
  const zDisp = parseNum(rawZDisp);
  const totalDisp = parseNum(rawTotalDisp) ?? (xDisp !== null && yDisp !== null ? Math.sqrt(xDisp * xDisp + yDisp * yDisp + (zDisp || 0) * (zDisp || 0)) : null);

  // Environment & Calibration - no dummy values
  const rawTemp = data.environment?.temperature ?? data.temperature ?? data.temp;
  const temp = parseNum(rawTemp);
  const calibrated = Boolean(data.calibration?.calibrated ?? data.calibrate ?? data.hasReferenceZero ?? false);

  // Power & Battery Percentage calculation: 0 to 13 is 0 to 100%
  const rawBat = data.power?.batteryVoltage ?? data.batteryVoltage ?? data.battery;
  const hasBat = rawBat !== undefined && rawBat !== null && rawBat !== '' && rawBat !== '--';
  const batteryVoltage = hasBat ? parseNum(rawBat) : null;
  const batteryStr = hasBat ? formatBatteryPercentage(rawBat, null) : null;
  const batteryPercent = (batteryStr && batteryStr !== '--') ? parseInt(batteryStr, 10) : null;

  // Network & CSQ Percentage calculation: 0 to 31 CSQ is 0% to 100%
  const rawCsq = data.network?.csq ?? data.csq ?? data.signalStrength ?? data.signal;
  const hasCsq = rawCsq !== undefined && rawCsq !== null && rawCsq !== '' && rawCsq !== '--';
  const csqStr = hasCsq ? formatCSQPercentage(rawCsq, null) : null;
  const csqPercent = (csqStr && csqStr !== '--') ? parseInt(csqStr, 10) : null;
  const csq = parseNum(rawCsq);
  const signalStr = csqStr;

  // Calculate cardinal tilt direction angle
  let angleDeg = null;
  let cardinalStr = '--';
  if (pitch !== null && roll !== null) {
    const angleRad = Math.atan2(pitch, roll);
    angleDeg = (angleRad * 180) / Math.PI;
    if (angleDeg < 0) angleDeg += 360;

    const cardinals = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const cardinalIdx = Math.round(angleDeg / 45) % 8;
    cardinalStr = cardinals[cardinalIdx];
  }

  return {
    ...data,
    deviceId: data.deviceId || data.id || null,
    // Mapped flat fields
    roll,
    pitch,
    yaw,
    tilt: tiltVal,
    xTilt: roll,
    yTilt: pitch,
    zTilt,
    tiltZ: yaw,
    resultantTilt: tiltVal,
    tiltStatus,
    tilt: {
      roll,
      pitch,
      yaw,
      tilt: tiltVal,
      tiltStatus,
      ...(typeof data.tilt === 'object' ? data.tilt : {}),
    },
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
    axG: ax,
    ayG: ay,
    azG: az,
    accMag,
    acceleration: {
      ax,
      ay,
      az,
      axG: ax,
      ayG: ay,
      azG: az,
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

    // Displacement: real 3-axis displacement from device telemetry
    xDisp,
    yDisp,
    zDisp,
    totalDisp,
    xDisplacement: xDisp,
    yDisplacement: yDisp,
    zDisplacement: zDisp,
    totalDisplacement: totalDisp,
    displacement: {
      xDisplacement_mm: xDisp,
      yDisplacement_mm: yDisp,
      zDisplacement_mm: zDisp,
      totalDisplacement_mm: totalDisp,
      ...(typeof data.displacement === 'object' ? data.displacement : {}),
    },

    // Schema v2 Specific Objects & Vectors
    schemaVersion: data.schemaVersion ?? 2,
    sampleUptimeMs: data.sampleUptimeMs ?? null,
    accelerationCurrent: data.accelerationCurrent || null,
    accelerationReference: data.accelerationReference || null,
    accelerationDelta: data.accelerationDelta || null,
    angleReference: data.angleReference || null,
    angleCurrent: data.angleCurrent || null,
    angleDelta: data.angleDelta || null,
    rockfallAlarm: data.rockfallAlarm || null,
    motionEvent: data.motionEvent || null,
    monitoringSettings: data.monitoringSettings || null,
    units: data.units || null,
    rawPayload: data.rawPayload || data,

    rockfallDeltaPeak: data.rockfallDeltaPeak ?? data.accelerationDelta?.peak ?? null,
    touchVibrationPeak: data.touchVibrationPeak ?? data.vibration?.vibrationPeak ?? vibPeak,
    motionClassification: data.motionClassification ?? data.motionEvent?.classification ?? 'STABLE',
    alarmActive: Boolean(data.alarmActive ?? data.rockfallAlarm?.active ?? false),
    eventPending: Boolean(data.eventPending ?? data.motionEvent?.pending ?? false),

    // Environment & Power & Network & Calibration
    temp,
    temperature: temp !== null && temp !== undefined ? `${temp} °C` : '--',

    // Power
    battery: batteryStr,
    batteryPercent,
    batteryVoltage,
    batteryVoltageFormatted: batteryVoltage !== null ? `${batteryVoltage.toFixed(1)} V` : '--',
    power: { batteryVoltage, batteryPercent, ...(typeof data.power === 'object' ? data.power : {}) },

    // Network
    signal: csqStr,
    signalStrength: signalStr,
    csq,
    csqPercent,
    network: { csq, csqPercent, ...(typeof data.network === 'object' ? data.network : {}) },

    calibrated,
    environment: { temperature: temp, ...(typeof data.environment === 'object' ? data.environment : {}) },
    calibration: { calibrated, ...(typeof data.calibration === 'object' ? data.calibration : {}) },
    timestamp: data.timestamp || new Date().toISOString(),

    // Reference Zero and Delta Angles
    gaugeLength_mm,
    refThetaX,
    refThetaY,
    refThetaZ,
    hasReferenceZero,

    // Core Properties:
    presentX,
    presentY,
    presentZ,
    presentRoll: presentX,
    presentPitch: presentY,
    presentYaw: presentZ,
    presentTilt,

    deltaX,
    deltaY,
    deltaZ,
    deltaThetaX,
    deltaThetaY,
    deltaThetaZ,

    formattedPresentX: formatPresent(presentX),
    formattedPresentY: formatPresent(presentY),
    formattedPresentZ: formatPresent(presentZ),
    formattedDeltaX: formatSigned(deltaX),
    formattedDeltaY: formatSigned(deltaY),
    formattedDeltaZ: formatSigned(deltaZ),

    clinoX,
  };
}
