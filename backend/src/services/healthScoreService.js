// Algorithmic Calculation for Device Health & Site Health Scores (0-100%)
export function calculateDeviceHealth(device, recentTelemetry = []) {
  if (!device) return { overallHealth: 95, commScore: 100, batteryScore: 90, sensorScore: 98, calibScore: 100, vibrationScore: 92, tempScore: 96 };

  // 1. Communication Score
  const now = new Date();
  const lastSeen = device.lastSeen ? new Date(device.lastSeen) : now;
  const diffMins = (now - lastSeen) / (1000 * 60);
  let commScore = 100;
  if (diffMins > 60) commScore = 0;
  else if (diffMins > 15) commScore = 50;
  else if (diffMins > 5) commScore = 80;

  // 2. Battery Score
  const batVal = parseInt(String(device.battery || '100').replace('%', ''), 10);
  const batteryScore = Math.max(0, Math.min(100, isNaN(batVal) ? 90 : batVal));

  // 3. Sensor Score (Tilt & Roll Stability)
  let sensorScore = 100;
  if (Math.abs(device.xTilt || 0) > 2.0 || Math.abs(device.yTilt || 0) > 2.0) sensorScore -= 40;
  else if (Math.abs(device.xTilt || 0) > 1.0 || Math.abs(device.yTilt || 0) > 1.0) sensorScore -= 20;

  // 4. Calibration Score
  const calibScore = device.lifecycleStatus === 'ACTIVE' ? 100 : 70;

  // 5. Vibration Score
  const vibVal = device.vibrationRms || 0.02;
  let vibrationScore = 100;
  if (vibVal > 0.5) vibrationScore = 50;
  else if (vibVal > 0.2) vibrationScore = 80;

  // 6. Temperature Score
  const temp = device.temperature || 25;
  let tempScore = 100;
  if (temp > 50 || temp < -10) tempScore = 60;
  else if (temp > 40 || temp < 0) tempScore = 85;

  // Weighted Overall Health Score
  const overallHealth = Math.round(
    commScore * 0.25 +
    batteryScore * 0.15 +
    sensorScore * 0.25 +
    calibScore * 0.15 +
    vibrationScore * 0.10 +
    tempScore * 0.10
  );

  return {
    overallHealth,
    commScore,
    batteryScore,
    sensorScore,
    calibScore,
    vibrationScore,
    tempScore,
  };
}

export function calculateSiteHealth(siteDevices = []) {
  if (!siteDevices.length) return { overallHealth: 100, totalDevices: 0, online: 0, offline: 0, normal: 0, warning: 0, critical: 0 };

  const totalDevices = siteDevices.length;
  let online = 0;
  let offline = 0;
  let normal = 0;
  let warning = 0;
  let critical = 0;
  let totalScoreSum = 0;

  for (const dev of siteDevices) {
    if (dev.status === 'OFFLINE') offline++;
    else online++;

    if (dev.status === 'CRITICAL' || Math.abs(dev.resultantTilt || 0) > 2.0) critical++;
    else if (dev.status === 'WARNING' || Math.abs(dev.resultantTilt || 0) > 1.0) warning++;
    else normal++;

    const h = calculateDeviceHealth(dev);
    totalScoreSum += h.overallHealth;
  }

  const overallHealth = Math.round(totalScoreSum / totalDevices);
  return {
    overallHealth,
    totalDevices,
    online,
    offline,
    normal,
    warning,
    critical,
  };
}
