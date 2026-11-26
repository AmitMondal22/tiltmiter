/**
 * Production-Ready Intelligent Landslide Tilt Alert Engine
 *
 * Implements:
 * - Signed baseline normalization (dx = x - baselineX, dy = y - baselineY)
 * - 5-point median + EMA (alpha = 0.25) trend smoothing
 * - Adaptive MAD spike detection (without discarding raw telemetry)
 * - Dual detection paths:
 *   1. Fast immediate escalation (Critical >= critical threshold, or Sudden Step >= suddenStepDeg)
 *   2. Trend persistence confirmation (3-of-5 for Warning, 2-of-3 for High) + Hysteresis
 * - Velocity (deg/hour) and Acceleration (deg/hour^2) using actual timestamps
 * - Dynamic per-device thresholds from AlertRule, falling back to provisional defaults
 */

export const DEFAULT_TILT_CONFIG = {
  intervalMinutes: 15,
  // Provisional software defaults used when a device has no AlertRule configured
  thresholds: {
    warning: 0.5,
    high: 1.0,
    critical: 2.0,
  },
  confirmation: {
    warning: { count: 3, window: 5 },
    high: { count: 2, window: 3 },
  },
  emaAlpha: 0.25,
  historySize: 20,
  maxTiltDeg: 90,
  suddenStepDeg: 0.5,
  spikeMinimumDeg: 0.2,
  spikeMadMultiplier: 6,
  reset: {
    warning: 0.40,
    high: 0.90,
  },
};

export function median(values) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  return n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
}

export function getMAD(values) {
  const center = median(values);
  if (center === null) return 0;
  return median(values.map(v => Math.abs(v - center))) ?? 0;
}

export function magnitude(x, y) {
  return Math.hypot(x, y);
}

export function ema(current, previous, alpha = DEFAULT_TILT_CONFIG.emaAlpha) {
  if (previous == null || !Number.isFinite(previous)) return current;
  return alpha * current + (1 - alpha) * previous;
}

export function countAbove(values, threshold) {
  return values.filter(v => Number.isFinite(v) && v >= threshold).length;
}

/**
 * Resolves dynamic thresholds from a device's AlertRule (if assigned),
 * or falls back to DEFAULT_TILT_CONFIG.thresholds / reset.
 */
export function resolveTiltThresholds(rule = null) {
  if (!rule) {
    return {
      source: 'DEFAULT',
      ruleName: 'Default Geotechnical Limits',
      thresholds: { ...DEFAULT_TILT_CONFIG.thresholds },
      reset: { ...DEFAULT_TILT_CONFIG.reset },
    };
  }

  const critical = Number(rule.criticalThreshold ?? rule.thresholdValue ?? DEFAULT_TILT_CONFIG.thresholds.critical);
  const high = Number(rule.warningThreshold ?? DEFAULT_TILT_CONFIG.thresholds.high);
  const warning = Number(rule.infoThreshold ?? DEFAULT_TILT_CONFIG.thresholds.warning);

  const safeCritical = Number.isFinite(critical) && critical > 0 ? critical : DEFAULT_TILT_CONFIG.thresholds.critical;
  const safeHigh = Number.isFinite(high) && high > 0 ? high : DEFAULT_TILT_CONFIG.thresholds.high;
  const safeWarning = Number.isFinite(warning) && warning > 0 ? warning : DEFAULT_TILT_CONFIG.thresholds.warning;

  return {
    source: 'RULE',
    ruleId: rule.id || null,
    ruleName: rule.ruleName || 'Custom Tilt Rule',
    thresholds: {
      warning: safeWarning,
      high: safeHigh,
      critical: safeCritical,
    },
    reset: {
      warning: Number((safeWarning * 0.8).toFixed(3)),
      high: Number((safeHigh * 0.9).toFixed(3)),
    },
  };
}

function buildResult(status, event, data) {
  return { status, event, ...data };
}

/**
 * Core single-reading processor (pure function, no DB side effects).
 */
export function processTiltReading({
  reading,
  device = {},
  previous = [],
  previousEma = null,
  previousRate = null,
  currentAlert = 'NORMAL',
  config = DEFAULT_TILT_CONFIG,
}) {
  const x = Number(reading?.x);
  const y = Number(reading?.y);
  const timestamp = reading?.timestamp;
  const parsedTs = Date.parse(timestamp);

  // 1. Validate sensor values & timestamp
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(parsedTs)) {
    return buildResult('SENSOR_FAULT', 'INVALID_READING', {
      reason: 'Invalid sensor values or timestamp',
      timestamp,
      immediate: true,
      requiresVerification: true,
    });
  }

  const maxTiltDeg = Number(device.maxTiltDeg ?? config.maxTiltDeg ?? DEFAULT_TILT_CONFIG.maxTiltDeg);
  if (Math.abs(x) > maxTiltDeg || Math.abs(y) > maxTiltDeg) {
    return buildResult('SENSOR_FAULT', 'OUT_OF_RANGE', {
      reason: `Reading (${x.toFixed(2)}°, ${y.toFixed(2)}°) exceeds instrument range (±${maxTiltDeg}°)`,
      timestamp,
      immediate: true,
      requiresVerification: true,
    });
  }

  // 2. Signed baseline normalization
  const baselineX = Number(device.baselineX ?? device.refThetaX ?? 0) || 0;
  const baselineY = Number(device.baselineY ?? device.refThetaY ?? 0) || 0;
  const dx = x - baselineX;
  const dy = y - baselineY;
  const rawMagnitude = magnitude(dx, dy);
  const movementDirectionDeg = (Math.atan2(dy, dx) * 180) / Math.PI;

  // 3. Sudden single-step movement on ORIGINAL data
  const last = previous.length > 0 ? previous[previous.length - 1] : null;
  const suddenStep = last ? magnitude(dx - last.dx, dy - last.dy) : 0;

  // 4. Adaptive MAD spike analysis
  const recentMagnitudes = previous.slice(-5).map(p => p.rawMagnitude);
  const center = median(recentMagnitudes);
  const mad = getMAD(recentMagnitudes);
  const spikeLimit = Math.max(
    config.spikeMinimumDeg ?? DEFAULT_TILT_CONFIG.spikeMinimumDeg,
    (config.spikeMadMultiplier ?? DEFAULT_TILT_CONFIG.spikeMadMultiplier) * 1.4826 * mad
  );
  const suspectedSpike = center !== null && Math.abs(rawMagnitude - center) > spikeLimit;

  const thresholds = config.thresholds || DEFAULT_TILT_CONFIG.thresholds;
  const reset = config.reset || DEFAULT_TILT_CONFIG.reset;
  const suddenStepLimit = Number(device.suddenStepDeg ?? config.suddenStepDeg ?? DEFAULT_TILT_CONFIG.suddenStepDeg);

  // 5. Fast immediate escalation path (never hide behind median/EMA filter)
  if (rawMagnitude >= thresholds.critical) {
    return buildResult('CRITICAL', 'CRITICAL_PROVISIONAL', {
      timestamp,
      dx,
      dy,
      rawMagnitude,
      filteredX: dx,
      filteredY: dy,
      filteredMagnitude: rawMagnitude,
      movementDirectionDeg,
      rateDegPerHour: null,
      accelerationDegPerHour2: null,
      suddenStep,
      suspectedSpike,
      immediate: true,
      requiresVerification: true,
    });
  }

  if (suddenStep >= suddenStepLimit) {
    return buildResult('URGENT_VERIFY', 'SUDDEN_MOVEMENT', {
      timestamp,
      dx,
      dy,
      rawMagnitude,
      filteredX: dx,
      filteredY: dy,
      filteredMagnitude: rawMagnitude,
      movementDirectionDeg,
      rateDegPerHour: null,
      accelerationDegPerHour2: null,
      suddenStep,
      suspectedSpike,
      immediate: true,
      requiresVerification: true,
    });
  }

  // 6. Trend filtering (exclude isolated suspect spike from trend filter, retain raw)
  const accepted = !suspectedSpike;
  const trendX = accepted
    ? median([...previous.slice(-4).map(p => p.dx), dx])
    : (last?.dx ?? dx);
  const trendY = accepted
    ? median([...previous.slice(-4).map(p => p.dy), dy])
    : (last?.dy ?? dy);

  const alpha = config.emaAlpha ?? DEFAULT_TILT_CONFIG.emaAlpha;
  const filteredX = ema(trendX, previousEma?.x ?? null, alpha);
  const filteredY = ema(trendY, previousEma?.y ?? null, alpha);
  const filteredMagnitude = magnitude(filteredX, filteredY);

  // 7. Velocity (deg/h) and acceleration (deg/h^2) using actual timestamps
  const timeHours = last ? (parsedTs - Date.parse(last.timestamp)) / 3600000 : 0;
  const rate = timeHours > 0 && last ? (filteredMagnitude - last.filteredMagnitude) / timeHours : null;
  const acceleration =
    rate !== null && previousRate !== null && timeHours > 0
      ? (rate - previousRate) / timeHours
      : null;

  // 8. Historical persistence confirmation
  const trendHistory = [...previous.slice(-4).map(p => p.filteredMagnitude), filteredMagnitude];
  const warningConfirmed = countAbove(trendHistory, thresholds.warning) >= (config.confirmation?.warning?.count ?? 3);
  const highConfirmed = countAbove(trendHistory.slice(-3), thresholds.high) >= (config.confirmation?.high?.count ?? 2);

  let level = 'NORMAL';
  if (highConfirmed) {
    level = 'HIGH';
  } else if (warningConfirmed) {
    level = 'WARNING';
  }

  // 9. Hysteresis & recovery (never auto-resolves CRITICAL)
  if (currentAlert === 'CRITICAL') {
    level = 'CRITICAL';
  } else if (currentAlert === 'HIGH' && filteredMagnitude >= reset.high) {
    level = 'HIGH';
  } else if (currentAlert === 'WARNING' && filteredMagnitude >= reset.warning && level === 'NORMAL') {
    level = 'WARNING';
  }

  return buildResult(level, suspectedSpike ? 'SUSPECTED_TRANSIENT' : 'TREND_ANALYSIS', {
    timestamp,
    dx,
    dy,
    rawMagnitude,
    filteredX,
    filteredY,
    filteredMagnitude,
    movementDirectionDeg,
    rateDegPerHour: rate,
    accelerationDegPerHour2: acceleration,
    suddenStep,
    suspectedSpike,
    immediate: false,
    requiresVerification: false,
  });
}

/**
 * Replays real chronological TelemetryRecord history + current reading for a device
 * using either dynamic rule thresholds or provisional defaults.
 */
export function evaluateDeviceTiltHistory({
  historyRows = [],
  currentReading,
  device = {},
  rule = null,
  activeAlarmSeverity = null,
}) {
  const resolved = resolveTiltThresholds(rule);
  const config = {
    ...DEFAULT_TILT_CONFIG,
    thresholds: resolved.thresholds,
    reset: resolved.reset,
  };

  // Map active DB alarm severity into engine state for hysteresis
  let currentAlert = 'NORMAL';
  const sev = String(activeAlarmSeverity || '').toUpperCase();
  if (sev === 'CRITICAL' || sev === 'EMERGENCY') currentAlert = 'CRITICAL';
  else if (sev === 'HIGH' || sev === 'WARNING' || sev === 'MAJOR') currentAlert = 'HIGH';
  else if (sev === 'INFO' || sev === 'MINOR') currentAlert = 'WARNING';

  // Normalize & sort historical rows chronologically (oldest -> newest)
  const samples = [];
  const seenTs = new Set();

  for (const row of historyRows) {
    const ts = row.timestamp || row.createdAt;
    const x = Number(row.xTilt ?? row.tilt?.roll ?? row.tilt?.x ?? row.roll);
    const y = Number(row.yTilt ?? row.tilt?.pitch ?? row.tilt?.y ?? row.pitch);
    const tsMs = Date.parse(ts);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(tsMs)) continue;
    if (seenTs.has(tsMs)) continue;
    seenTs.add(tsMs);
    samples.push({ x, y, timestamp: new Date(tsMs).toISOString(), tsMs });
  }

  // Append current reading if not already in samples
  if (currentReading) {
    const curTsMs = Date.parse(currentReading.timestamp);
    if (Number.isFinite(curTsMs) && !seenTs.has(curTsMs)) {
      samples.push({
        x: Number(currentReading.x),
        y: Number(currentReading.y),
        timestamp: new Date(curTsMs).toISOString(),
        tsMs: curTsMs,
      });
    }
  }

  samples.sort((a, b) => a.tsMs - b.tsMs);
  const windowSamples = samples.slice(-config.historySize);

  const processed = [];
  let prevEma = null;
  let prevRate = null;
  let alertState = currentAlert;
  let latestOutput = null;

  for (const sample of windowSamples) {
    const out = processTiltReading({
      reading: sample,
      device,
      previous: processed,
      previousEma: prevEma,
      previousRate: prevRate,
      currentAlert: alertState,
      config,
    });

    latestOutput = out;
    if (out.status !== 'SENSOR_FAULT') {
      processed.push({
        timestamp: out.timestamp,
        dx: out.dx,
        dy: out.dy,
        rawMagnitude: out.rawMagnitude,
        filteredMagnitude: out.filteredMagnitude,
      });
      prevEma = { x: out.filteredX, y: out.filteredY };
      if (out.rateDegPerHour !== null) prevRate = out.rateDegPerHour;
    }

    if (out.status === 'CRITICAL' || out.status === 'URGENT_VERIFY') {
      alertState = 'CRITICAL';
    } else if (out.status === 'HIGH') {
      alertState = 'HIGH';
    } else if (out.status === 'WARNING') {
      alertState = 'WARNING';
    } else if (out.status === 'NORMAL') {
      alertState = 'NORMAL';
    }
  }

  return {
    result: latestOutput,
    thresholdMeta: resolved,
  };
}

