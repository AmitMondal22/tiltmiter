import { AlertRule, Alarm, Incident } from '../models/index.js';

export async function evaluateTelemetryAlerts(device, telemetry) {
  if (!device || !telemetry) return [];

  const triggeredAlerts = [];

  // 1. Threshold checks
  const tiltVal = Math.abs(telemetry.tilt?.tilt || telemetry.resultantTilt || device.resultantTilt || 0);
  const xDisp = Math.abs(telemetry.displacement?.xDisplacement_mm || telemetry.xDisplacement || device.xDisplacement || 0);
  const temp = telemetry.temperature || device.temperature || 25;

  if (tiltVal > 2.0) {
    triggeredAlerts.push({
      deviceId: device.id,
      siteId: device.siteId,
      parameter: 'tilt',
      severity: 'CRITICAL',
      title: `Critical Tilt Threshold Exceeded: ${tiltVal.toFixed(3)}°`,
      message: `Tilt on device ${device.id} (${device.name}) exceeded critical limit 2.0°`,
    });
  } else if (tiltVal > 1.0) {
    triggeredAlerts.push({
      deviceId: device.id,
      siteId: device.siteId,
      parameter: 'tilt',
      severity: 'WARNING',
      title: `Tilt Warning Threshold Exceeded: ${tiltVal.toFixed(3)}°`,
      message: `Tilt on device ${device.id} (${device.name}) exceeded warning limit 1.0°`,
    });
  }

  if (xDisp > 10.0) {
    triggeredAlerts.push({
      deviceId: device.id,
      siteId: device.siteId,
      parameter: 'displacement',
      severity: 'CRITICAL',
      title: `Critical Displacement Exceeded: ${xDisp.toFixed(2)} mm`,
      message: `Lateral displacement on device ${device.id} reached ${xDisp.toFixed(2)} mm`,
    });
  }

  // 2. Persist Alarms and auto-create Incident for Critical/Emergency
  for (const alt of triggeredAlerts) {
    try {
      const alarm = await Alarm.create({
        deviceId: alt.deviceId,
        siteId: alt.siteId,
        type: alt.parameter.toUpperCase(),
        severity: alt.severity,
        message: alt.message,
        timestamp: new Date(),
        status: 'ACTIVE',
      });

      if (alt.severity === 'CRITICAL' || alt.severity === 'EMERGENCY') {
        const incidentCode = `INC-${Date.now().toString().slice(-6)}`;
        await Incident.create({
          incidentCode,
          deviceId: alt.deviceId,
          siteId: alt.siteId,
          alarmId: alarm.id,
          title: alt.title,
          severity: alt.severity,
          status: 'NEW',
          rootCause: 'Automated telemetry threshold breach detected by Alert Engine.',
        });
      }
    } catch (e) {}
  }

  return triggeredAlerts;
}
