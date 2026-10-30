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
 * Formats signed delta value (e.g. +1.4° or -0.8° or +0.0°).
 * Retains full precision until formatting to 1 decimal place for display only.
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
 */
export function formatBatteryPercentage(val, fallback = '100%') {
  if (val === null || val === undefined || val === '' || val === '--') return fallback;
  if (typeof val === 'string' && val.includes('%')) {
    const p = parseFloat(val);
    return !isNaN(p) ? `${Math.min(100, Math.max(0, Math.round(p)))}%` : val;
  }
  const isVoltageStr = typeof val === 'string' && /v/i.test(val);
  const num = parseFloat(val);
  if (isNaN(num)) return fallback;
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

/**
 * Converts cellular CSQ (0 to 31), RSSI dBm (-113 to -51 dBm), or raw signal into a clean 0% to 100% percentage string.
 * Scale:
 * - CSQ 0 (or -113 dBm) = 0%
 * - CSQ 31 (or -51 dBm) = 100%
 * - Typical nominal CSQ 19 (~-75 dBm) = ~61%
 *
 * @param {*} val - CSQ number, string like "19 CSQ", "-60 dBm", "85%", etc.
 * @param {string} fallback - Fallback string if value is missing/invalid (default: '85%')
 * @returns {string} Formatted percentage string (e.g. "61%", "85%", "100%")
 */
export function formatCSQPercentage(val, fallback = '85%') {
  if (val === null || val === undefined || val === '' || val === '--') return fallback;

  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed.includes('%')) {
      const p = parseFloat(trimmed);
      return !isNaN(p) ? `${Math.min(100, Math.max(0, Math.round(p)))}%` : fallback;
    }
    // Handle dBm RSSI (typical cellular range: -113 dBm [0 CSQ / 0%] to -51 dBm [31 CSQ / 100%])
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

  // Negative numbers indicate dBm even if "dBm" is omitted (e.g. -60 or -80)
  if (num < 0) {
    const pct = Math.min(100, Math.max(0, Math.round(((num - (-113)) / ((-51) - (-113))) * 100)));
    return `${pct}%`;
  }

  // CSQ 99 in AT+CSQ standard means "not known or not detectable"
  if (num === 99) {
    return fallback;
  }

  let pct = 0;
  // If in standard CSQ range (0 to 31): scale 0 to 31 -> 0% to 100%
  if (num <= 31) {
    pct = Math.min(100, Math.max(0, Math.round((num / 31.0) * 100)));
  } else {
    // Already in 0 to 100 percentage scale
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

  // Acceleration
  const ax = typeof data.acceleration?.ax === 'number' ? data.acceleration.ax : (parseFloat(data.acceleration?.ax) || 0);
  const ay = typeof data.acceleration?.ay === 'number' ? data.acceleration.ay : (parseFloat(data.acceleration?.ay) || 0);
  const az = typeof data.acceleration?.az === 'number' ? data.acceleration.az : (parseFloat(data.acceleration?.az) || 9.80665);
  const accMag = typeof data.acceleration?.accMag === 'number' ? data.acceleration.accMag : (parseFloat(data.acceleration?.accMag) || Math.sqrt(ax * ax + ay * ay + az * az));

  // 1. Axis Mapping:
  // X-Axis: tilt.roll
  // Y-Axis: tilt.pitch
  // Z-Axis: tilt.yaw
  // Do not use the combined tilt.tilt value as an individual X, Y, or Z axis value.
  const currentRoll = data.tilt?.roll ?? data.roll;
  const currentPitch = data.tilt?.pitch ?? data.pitch;
  const currentYaw = data.tilt?.yaw ?? data.yaw;

  // 2. Present Values: actual device angle values without subtracting reference
  const roll = (currentRoll !== undefined && currentRoll !== null && !isNaN(parseFloat(currentRoll))) ? parseFloat(currentRoll) : 0.0;
  const pitch = (currentPitch !== undefined && currentPitch !== null && !isNaN(parseFloat(currentPitch))) ? parseFloat(currentPitch) : 0.0;
  const yaw = (currentYaw !== undefined && currentYaw !== null && !isNaN(parseFloat(currentYaw))) ? parseFloat(currentYaw) : 0.0;

  // Combined tilt value: Math.sqrt(roll^2 + pitch^2)
  const rawTiltCombined = data.tilt?.tilt ?? data.presentTilt ?? data.resultantTilt ?? data.tilt;
  const tiltVal = (typeof rawTiltCombined === 'number' && !isNaN(rawTiltCombined)) ? rawTiltCombined : Math.sqrt(roll * roll + pitch * pitch);
  const zTilt = yaw;
  const tiltStatus = data.tilt?.tiltStatus || data.tiltStatus || 'NORMAL';

  // 2. Present Values: actual device angle values (Never subtract reference angle)
  const presentX = roll;
  const presentY = pitch;
  const presentZ = yaw;
  const presentTilt = tiltVal;

  // 3. Stored Reference Angles: Initially 0.0°, or calibrated reference if configured
  const gaugeLength_mm = parseFloat(data.gaugeLength_mm || data.gaugeLength || data.L || 1000.0);
  const hasReferenceZero = Boolean(data.hasReferenceZero === true || data.calibrate === true);
  const refThetaX = hasReferenceZero ? (parseFloat(data.device?.refThetaX ?? data.activeDevice?.refThetaX ?? data.refThetaX ?? 0.0) || 0.0) : 0.0;
  const refThetaY = hasReferenceZero ? (parseFloat(data.device?.refThetaY ?? data.activeDevice?.refThetaY ?? data.refThetaY ?? 0.0) || 0.0) : 0.0;
  const refThetaZ = hasReferenceZero ? (parseFloat(data.device?.refThetaZ ?? data.activeDevice?.refThetaZ ?? data.refThetaZ ?? 0.0) || 0.0) : 0.0;

  // 4. Device angle values directly without logic modifications
  const deltaX = presentX;
  const deltaY = presentY;
  const deltaZ = presentZ;
  const deltaThetaX = deltaX;
  const deltaThetaY = deltaY;
  const deltaThetaZ = deltaZ;
  const deltaResultantTilt = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

  // Slope in mm/m (1000 * sin(angle * π / 180)) based on delta angle
  const xSlope = Math.sin((deltaX * Math.PI) / 180) * 1000;
  const ySlope = Math.sin((deltaY * Math.PI) / 180) * 1000;
  const zSlope = Math.sin((deltaZ * Math.PI) / 180) * 1000;
  const resultantSlope = Math.sin((deltaResultantTilt * Math.PI) / 180) * 1000;

  // ClinoX D = L * tan(Δθ * π / 180) using full precision delta angles
  const radX = (deltaX * Math.PI) / 180.0;
  const radY = (deltaY * Math.PI) / 180.0;
  const clinoXDisp = gaugeLength_mm * Math.tan(radX);
  const clinoYDisp = gaugeLength_mm * Math.tan(radY);
  const clinoTotalDisp = Math.sqrt(clinoXDisp * clinoXDisp + clinoYDisp * clinoYDisp);

  const clinoX = {
    L: gaugeLength_mm,
    deltaThetaX,
    deltaThetaY,
    xDisp: clinoXDisp,
    yDisp: clinoYDisp,
    totalDisp: clinoTotalDisp,
    formattedDeltaX: formatSigned(deltaX),
    formattedDeltaY: formatSigned(deltaY),
    formattedDispX: formatSigned(clinoXDisp, 2, ' mm'),
    formattedDispY: formatSigned(clinoYDisp, 2, ' mm'),
    formattedTotalDisp: `${clinoTotalDisp.toFixed(2)} mm`,
  };

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

  // Displacement: use device telemetry data directly (displacement.xDisplacement_mm, etc.)
  const rawXDisp = data.displacement?.xDisplacement_mm ?? data.xDisplacement_mm ?? data.xDisplacement ?? data.xDisp;
  const rawYDisp = data.displacement?.yDisplacement_mm ?? data.yDisplacement_mm ?? data.yDisplacement ?? data.yDisp;
  const rawZDisp = data.displacement?.zDisplacement_mm ?? data.zDisplacement_mm ?? data.zDisplacement ?? data.zDisp;
  const rawTotalDisp = data.displacement?.totalDisplacement_mm ?? data.totalDisplacement_mm ?? data.totalDisplacement ?? data.totalDisp;

  const xDisp = (rawXDisp !== undefined && rawXDisp !== null && !isNaN(parseFloat(rawXDisp))) ? parseFloat(rawXDisp) : 0.0;
  const yDisp = (rawYDisp !== undefined && rawYDisp !== null && !isNaN(parseFloat(rawYDisp))) ? parseFloat(rawYDisp) : 0.0;
  const zDisp = (rawZDisp !== undefined && rawZDisp !== null && !isNaN(parseFloat(rawZDisp))) ? parseFloat(rawZDisp) : 0.0;
  const totalDisp = (rawTotalDisp !== undefined && rawTotalDisp !== null && !isNaN(parseFloat(rawTotalDisp))) ? parseFloat(rawTotalDisp) : 0.0;

  // Environment & Calibration - no dummy values
  const rawTemp = data.environment?.temperature ?? data.temperature ?? data.temp;
  const temp = rawTemp !== undefined && rawTemp !== null && !isNaN(parseFloat(rawTemp)) ? parseFloat(rawTemp) : null;
  const calibrated = Boolean(data.calibration?.calibrated ?? data.calibrate ?? data.hasReferenceZero ?? false);

  // Power & Battery Percentage calculation: 0 to 13 is 0 to 100%
  const rawBat = data.power?.batteryVoltage ?? data.batteryVoltage ?? data.battery;
  const hasBat = rawBat !== undefined && rawBat !== null && rawBat !== '' && rawBat !== '--';
  const batteryVoltage = hasBat && !isNaN(parseFloat(rawBat)) ? parseFloat(rawBat) : null;
  const batteryStr = hasBat ? formatBatteryPercentage(rawBat, null) : null;
  const batteryPercent = (batteryStr && batteryStr !== '--') ? parseInt(batteryStr, 10) : null;

  // Network & CSQ Percentage calculation: 0 to 31 CSQ is 0% to 100%
  const rawCsq = data.network?.csq ?? data.csq ?? data.signalStrength ?? data.signal;
  const hasCsq = rawCsq !== undefined && rawCsq !== null && rawCsq !== '' && rawCsq !== '--';
  const csqStr = hasCsq ? formatCSQPercentage(rawCsq, null) : null;
  const csqPercent = (csqStr && csqStr !== '--') ? parseInt(csqStr, 10) : null;
  const csq = typeof rawCsq === 'number' ? rawCsq : (!isNaN(parseInt(rawCsq)) ? parseInt(rawCsq) : null);
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

    // Displacement: X / Y only, no Z value
    xDisp,
    yDisp,
    zDisp: 0.0,
    totalDisp,
    xDisplacement: xDisp,
    yDisplacement: yDisp,
    zDisplacement: 0.0,
    totalDisplacement: totalDisp,
    displacement: { xDisplacement_mm: xDisp, yDisplacement_mm: yDisp, totalDisplacement_mm: totalDisp },

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

    // ClinoX Reference Zero and Delta Angles (Core Logic: Present values never subtract reference zero)
    gaugeLength_mm,
    refThetaX,
    refThetaY,
    refThetaZ,
    hasReferenceZero,

    // Core Logic Properties:
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
