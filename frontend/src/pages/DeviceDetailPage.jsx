import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Battery, Signal, Sliders, Calendar,
  Download, RefreshCw, Layers, ShieldCheck, Activity,
  CheckCircle2, AlertTriangle, Radio, Clock, MapPin,
  Compass, Zap, Thermometer, Search, Bed, Crosshair, Database, Settings, Move, X
} from 'lucide-react';
import { getDevice, getDeviceTelemetry, configureDeviceTelemetry, setDeviceReference, resetDeviceReference } from '../api/apiClient';
import { parseTelemetry, hasTelemetryData, formatSigned, formatPresent, formatBatteryPercentage, formatCSQPercentage } from '../utils/telemetryHelper';
import { formatISTDatetimeLocal, istDatetimeToUTC, formatFullDateTime, formatTimeString, formatHHMM } from '../utils/dateHelper';
import TiltmeterChartsRow from '../components/TiltmeterChartsRow';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';

export default function DeviceDetailPage() {
  const { deviceId } = useParams();
  const navigate = useNavigate();
  const cardCls = 'rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs text-slate-800';

  const [device, setDevice] = useState(null);
  const [liveData, setLiveData] = useState(null);
  const [telemetryHistory, setTelemetryHistory] = useState([]);

  // Time presets: '1h', '6h', '24h', '7d', '30d', 'custom'
  const [activeFilter, setActiveFilter] = useState('24h');

  const now = new Date();
  const initFrom = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const [fromDateTime, setFromDateTime] = useState(formatISTDatetimeLocal(initFrom));
  const [toDateTime, setToDateTime] = useState(formatISTDatetimeLocal(now));

  const [tableSearch, setTableSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 20;

  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [configForm, setConfigForm] = useState({
    sleep_count: 15,
    wake_count: 30,
    gaugeLength_mm: 1000,
    samplingWindowSeconds: 1,
    samplingRateHz: 400,
    calibrate: false,
    debug: true,
    status: 'ONLINE',
    rockfall_on: 12.0,
    rockfall_off: 3.0,
    landslide_on: 15.0,
    landslide_off: 5.0,
    landslide_seconds: 5,
    human_touch_on: 5.0,
    human_touch_off: 1.5,
    air_wind_on: 0.8,
    air_wind_off: 0.25,
    air_wind_seconds: 12,
    normal_seconds: 10,
  });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });

  // 1. Load individual device metadata using getDevice(deviceId) strictly for this device
  useEffect(() => {
    if (!deviceId) return;
    setDevice(null); // Clear previous device data immediately
    setLiveData(null);
    setTelemetryHistory([]);

    let isCurrent = true;

    getDevice(deviceId)
      .then(res => {
        if (!isCurrent) return;
        const dev = res?.device || res;
        if (dev && (dev.id || dev.name)) {
          setDevice(dev);
          const s = dev.monitoringSettings || {};
          setConfigForm({
            sleep_count: dev.sleep_count !== undefined && dev.sleep_count !== null ? dev.sleep_count : (s.uploadIntervalMinutes || 15),
            wake_count: dev.wake_count !== undefined && dev.wake_count !== null ? dev.wake_count : (s.wakeCountSeconds || 30),
            gaugeLength_mm: dev.gaugeLength_mm !== undefined && dev.gaugeLength_mm !== null ? dev.gaugeLength_mm : (s.gaugeLength_mm || 1000),
            samplingWindowSeconds: s.samplingWindowSeconds ?? 1,
            samplingRateHz: s.samplingRateHz ?? 400,
            calibrate: Boolean(dev.calibrate ?? dev.hasReferenceZero),
            debug: s.debug !== undefined ? Boolean(s.debug) : true,
            status: dev.status || 'ONLINE',
            rockfall_on: s.rockfall_on ?? 12.0,
            rockfall_off: s.rockfall_off ?? 3.0,
            landslide_on: s.landslide_on ?? 15.0,
            landslide_off: s.landslide_off ?? 5.0,
            landslide_seconds: s.landslide_seconds ?? 5,
            human_touch_on: s.human_touch_on ?? 5.0,
            human_touch_off: s.human_touch_off ?? 1.5,
            air_wind_on: s.air_wind_on ?? 0.8,
            air_wind_off: s.air_wind_off ?? 0.25,
            air_wind_seconds: s.air_wind_seconds ?? 12,
            normal_seconds: s.normal_seconds ?? 10,
          });
        } else {
          setDevice({ id: deviceId, name: `Tiltmeter ${deviceId}`, status: 'ONLINE' });
        }
      })
      .catch(() => {
        if (!isCurrent) return;
        setDevice({ id: deviceId, name: `Tiltmeter ${deviceId}`, status: 'ONLINE' });
      });

    loadHistory(deviceId, null, null, activeFilter, () => isCurrent);

    return () => {
      isCurrent = false;
    };
  }, [deviceId]);

  const mapPointData = (pt) => {
    const ts = pt.timestamp || pt.time;
    const parseNum = (v) => {
      if (v === null || v === undefined || v === '' || v === '--') return null;
      const n = typeof v === 'number' ? v : parseFloat(v);
      return !isNaN(n) ? n : null;
    };

    // 1. Axis Mapping:
    // X-Axis: tilt.roll
    // Y-Axis: tilt.pitch
    // Z-Axis: tilt.yaw
    const currentRoll = pt.tilt?.roll ?? pt.roll ?? pt.presentX ?? pt.xTilt;
    const currentPitch = pt.tilt?.pitch ?? pt.pitch ?? pt.presentY ?? pt.yTilt;
    const currentYaw = pt.tilt?.yaw ?? pt.yaw ?? pt.presentZ ?? pt.zTilt;

    // 2. Present Values: actual device angle values without subtracting reference
    const presentX = parseNum(currentRoll);
    const presentY = parseNum(currentPitch);
    const presentZ = parseNum(currentYaw);
    const rawRes = pt.tilt?.tilt ?? pt.presentTilt ?? pt.resultantTilt ?? pt.resultant ?? pt.tilt;
    const presentRes = parseNum(rawRes) ?? (presentX !== null && presentY !== null ? Math.sqrt(presentX * presentX + presentY * presentY) : null);

    // 3. Stored Reference Angles: Initially 0.0°, or calibrated reference if configured
    const L = parseFloat(device?.gaugeLength_mm || 1000.0);
    const hasCalibratedRef = Boolean(device?.hasReferenceZero || device?.calibrate || pt.hasReferenceZero);
    const refX = hasCalibratedRef ? (parseFloat(device?.refThetaX ?? pt.refThetaX ?? 0.0) || 0.0) : 0.0;
    const refY = hasCalibratedRef ? (parseFloat(device?.refThetaY ?? pt.refThetaY ?? 0.0) || 0.0) : 0.0;
    const refZ = hasCalibratedRef ? (parseFloat(device?.refThetaZ ?? pt.refThetaZ ?? 0.0) || 0.0) : 0.0;

    // 4. Delta Values: Current − Reference (Calculated with original numeric full precision)
    const deltaX = parseNum(pt.deltaX) ?? (presentX !== null ? (presentX - refX) : null);
    const deltaY = parseNum(pt.deltaY) ?? (presentY !== null ? (presentY - refY) : null);
    const deltaZ = parseNum(pt.deltaZ) ?? (presentZ !== null ? (presentZ - refZ) : null);

    // Device-provided displacement data:
    const rawDisp = pt.displacement || pt.rawPayload?.displacement || {};
    const rawXDisp = rawDisp.xDisplacement_mm ?? pt.xDisplacement_mm ?? pt.xDisp ?? pt.xDisplacement;
    const rawYDisp = rawDisp.yDisplacement_mm ?? pt.yDisplacement_mm ?? pt.yDisp ?? pt.yDisplacement;
    const rawZDisp = rawDisp.zDisplacement_mm ?? pt.zDisplacement_mm ?? pt.zDisp ?? pt.zDisplacement;
    const rawTotalDisp = rawDisp.totalDisplacement_mm ?? pt.totalDisplacement_mm ?? pt.totalDisp ?? pt.totalDisplacement;

    const xD = parseNum(rawXDisp);
    const yD = parseNum(rawYDisp);
    const zD = parseNum(rawZDisp);
    const totD = parseNum(rawTotalDisp) ?? (xD !== null && yD !== null ? Math.sqrt(xD * xD + yD * yD + (zD || 0) * (zD || 0)) : null);
    const deltaRes = (deltaX !== null && deltaY !== null) ? Math.sqrt(deltaX * deltaX + deltaY * deltaY) : null;

    // Sensor data - use actual values from DB, no dummy fallbacks
    const rawAxRaw = pt.axG ?? pt.ax ?? pt.acceleration?.ax ?? pt.acceleration?.x ?? null;
    const rawAyRaw = pt.ayG ?? pt.ay ?? pt.acceleration?.ay ?? pt.acceleration?.y ?? null;
    const rawAzRaw = pt.azG ?? pt.az ?? pt.acceleration?.az ?? pt.acceleration?.z ?? null;
    const rawAx = rawAxRaw !== null ? parseFloat(rawAxRaw) : null;
    const rawAy = rawAyRaw !== null ? parseFloat(rawAyRaw) : null;
    const rawAz = rawAzRaw !== null ? parseFloat(rawAzRaw) : null;
    const axG = rawAx !== null && !isNaN(rawAx) ? rawAx : null;
    const ayG = rawAy !== null && !isNaN(rawAy) ? rawAy : null;
    const azG = rawAz !== null && !isNaN(rawAz) ? rawAz : null;

    const accMRaw = pt.accMag ?? pt.acceleration?.accMag ?? null;
    const accM = accMRaw !== null ? parseFloat(accMRaw) : null;
    const vibRRaw = pt.vibRMS ?? pt.vibrationRMS ?? pt.vibration?.vibrationRMS ?? null;
    const vibR = vibRRaw !== null ? parseFloat(vibRRaw) : null;
    const vibPRaw = pt.vibPeak ?? pt.vibrationPeak ?? pt.vibration?.vibrationPeak ?? null;
    const vibP = vibPRaw !== null ? parseFloat(vibPRaw) : null;
    const tempRaw = pt.temp ?? pt.temperature ?? pt.environment?.temperature ?? null;
    const tempC = tempRaw !== null ? parseFloat(tempRaw) : null;

    // Stability classification
    const vibForStability = vibR ?? 0;
    let stability = 'Stable';
    let stabilityClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (deltaRes !== null && totD !== null) {
      if (Math.abs(deltaRes) >= 2.0 || Math.abs(totD) >= 10.0 || vibForStability >= 0.5) {
        stability = 'Critical';
        stabilityClass = 'bg-red-50 text-red-700 border-red-200';
      } else if (Math.abs(deltaRes) >= 1.0 || Math.abs(totD) >= 5.0 || vibForStability >= 0.2) {
        stability = 'Warning';
        stabilityClass = 'bg-amber-50 text-amber-700 border-amber-200';
      }
    }

    return {
      time: formatHHMM(ts),
      fullTime: formatFullDateTime(ts),
      timestamp: ts,

      // Pure actual device values directly from device without logic modifications
      presentX: presentX !== null ? Number(presentX.toFixed(1)) : null,
      presentY: presentY !== null ? Number(presentY.toFixed(1)) : null,
      presentZ: presentZ !== null ? Number(presentZ.toFixed(1)) : null,
      roll: presentX !== null ? Number(presentX.toFixed(1)) : null,
      pitch: presentY !== null ? Number(presentY.toFixed(1)) : null,
      yaw: presentZ !== null ? Number(presentZ.toFixed(1)) : null,
      resultant: presentRes !== null ? Number(presentRes.toFixed(1)) : null,

      deltaX: deltaX !== null ? Number(deltaX.toFixed(1)) : null,
      deltaY: deltaY !== null ? Number(deltaY.toFixed(1)) : null,
      deltaZ: deltaZ !== null ? Number(deltaZ.toFixed(1)) : null,
      deltaThetaX: deltaX !== null ? Number(deltaX.toFixed(1)) : null,
      deltaThetaY: deltaY !== null ? Number(deltaY.toFixed(1)) : null,
      deltaThetaZ: deltaZ !== null ? Number(deltaZ.toFixed(1)) : null,
      deltaResultant: deltaRes !== null ? Number(deltaRes.toFixed(1)) : null,

      xTilt: presentX !== null ? Number(presentX.toFixed(1)) : null,
      yTilt: presentY !== null ? Number(presentY.toFixed(1)) : null,
      zTilt: presentZ !== null ? Number(presentZ.toFixed(1)) : null,

      totalDisp: totD !== null ? Number(totD.toFixed(2)) : null,
      xDisp: xD !== null ? Number(xD.toFixed(2)) : null,
      yDisp: yD !== null ? Number(yD.toFixed(2)) : null,
      zDisp: zD !== null ? Number(zD.toFixed(2)) : null,
      axG: axG !== null && !isNaN(axG) ? Number(axG.toFixed(2)) : null,
      ayG: ayG !== null && !isNaN(ayG) ? Number(ayG.toFixed(2)) : null,
      azG: azG !== null && !isNaN(azG) ? Number(azG.toFixed(2)) : null,
      accMag: accM !== null && !isNaN(accM) ? Number(accM.toFixed(2)) : null,
      vibRMS: vibR !== null && !isNaN(vibR) ? Number(vibR.toFixed(3)) : null,
      vibPeak: vibP !== null && !isNaN(vibP) ? Number(vibP.toFixed(3)) : null,
      temp: tempC !== null && !isNaN(tempC) ? Number(tempC.toFixed(1)) : null,
      battery: pt.battery ?? pt.batteryVoltage ?? pt.power?.batteryVoltage ?? null,
      batteryVoltage: pt.batteryVoltage ?? pt.power?.batteryVoltage ?? null,
      power: pt.power || null,
      signal: pt.signal ?? pt.signalStrength ?? pt.network?.csq ?? null,
      signalStrength: pt.signalStrength ?? pt.signal ?? null,
      stability,
      stabilityClass,
    };
  };

  const loadHistory = (id, fromDt = null, toDt = null, rangeKey = activeFilter, isCurrentCheck = null) => {
    if (!id) return;
    setLoading(true);

    const isCustom = !rangeKey || rangeKey === 'custom';
    const utcFrom = (isCustom && fromDt) ? istDatetimeToUTC(fromDt) : null;
    const utcTo = (isCustom && toDt) ? istDatetimeToUTC(toDt) : null;
    const effectiveRange = isCustom ? null : rangeKey;

    getDeviceTelemetry(id, utcFrom, utcTo, effectiveRange)
      .then(res => {
        if (isCurrentCheck && !isCurrentCheck()) return;
        if (res?.history?.length) {
          const seen = new Set();
          const mapped = [];
          for (const pt of res.history) {
            const ts = pt.timestamp || pt.time;
            if (ts && seen.has(ts)) continue;
            if (ts) seen.add(ts);
            mapped.push(mapPointData(pt));
          }
          setTelemetryHistory(mapped);
          const firstPoint = mapped[0];
          const lastPoint = mapped[mapped.length - 1];
          if (firstPoint?.timestamp && lastPoint?.timestamp && effectiveRange) {
            setFromDateTime(formatISTDatetimeLocal(new Date(firstPoint.timestamp)));
            setToDateTime(formatISTDatetimeLocal(new Date(lastPoint.timestamp)));
          }
          const latestPointCandidate = res?.latest ? mapPointData(res.latest) : lastPoint;
          if (latestPointCandidate) {
            setLiveData(parseTelemetry(latestPointCandidate));
          }
        } else if (res?.latest) {
          const mappedLatest = mapPointData(res.latest);
          setLiveData(parseTelemetry(mappedLatest));
          setTelemetryHistory(prev => prev.length > 0 ? prev : [mappedLatest]);
        } else {
          setTelemetryHistory([]);
          setLiveData(null);
        }
      })
      .catch(() => {
        if (isCurrentCheck && !isCurrentCheck()) return;
        setTelemetryHistory([]);
        setLiveData(null);
      })
      .finally(() => {
        if (isCurrentCheck && !isCurrentCheck()) return;
        setLoading(false);
      });
  };

  // 1-minute auto-refresh interval: fetch telemetry data and device status from API every 60s
  useEffect(() => {
    if (!deviceId) return;

    const intervalId = setInterval(() => {
      // Re-fetch historical telemetry and device status every 1 minute
      if (activeFilter === 'custom') {
        loadHistory(deviceId, fromDateTime, toDateTime, 'custom');
      } else {
        loadHistory(deviceId, null, null, activeFilter);
      }
      getDevice(deviceId)
        .then(res => {
          const dev = res?.device || res;
          if (dev) setDevice(dev);
        })
        .catch(() => { });
    }, 60000);

    return () => clearInterval(intervalId);
  }, [deviceId, activeFilter, fromDateTime, toDateTime]);

  // Handle Preset Selection: 1h, 6h, 24h, 7d, 30d relative to last available data
  const handleRangeSelect = (presetKey) => {
    setActiveFilter(presetKey);
    loadHistory(deviceId, null, null, presetKey);
  };

  const handleCustomDateSubmit = (e) => {
    e.preventDefault();
    setActiveFilter('custom');
    loadHistory(deviceId, fromDateTime, toDateTime, null);
  };

  const handleOpenConfigModal = () => {
    if (device) {
      const s = device.monitoringSettings || {};
      setConfigForm({
        sleep_count: device.sleep_count !== undefined && device.sleep_count !== null ? device.sleep_count : (s.uploadIntervalMinutes || 15),
        wake_count: device.wake_count !== undefined && device.wake_count !== null ? device.wake_count : (s.wakeCountSeconds || 30),
        gaugeLength_mm: device.gaugeLength_mm !== undefined && device.gaugeLength_mm !== null ? device.gaugeLength_mm : (s.gaugeLength_mm || 1000),
        samplingWindowSeconds: s.samplingWindowSeconds ?? 1,
        samplingRateHz: s.samplingRateHz ?? 400,
        calibrate: Boolean(device.calibrate ?? device.hasReferenceZero),
        debug: s.debug !== undefined ? Boolean(s.debug) : true,
        status: device.status || 'ONLINE',
        rockfall_on: s.rockfall_on ?? 12.0,
        rockfall_off: s.rockfall_off ?? 3.0,
        landslide_on: s.landslide_on ?? 15.0,
        landslide_off: s.landslide_off ?? 5.0,
        landslide_seconds: s.landslide_seconds ?? 5,
        human_touch_on: s.human_touch_on ?? 5.0,
        human_touch_off: s.human_touch_off ?? 1.5,
        air_wind_on: s.air_wind_on ?? 0.8,
        air_wind_off: s.air_wind_off ?? 0.25,
        air_wind_seconds: s.air_wind_seconds ?? 12,
        normal_seconds: s.normal_seconds ?? 10,
      });
    }
    setConfigModalOpen(true);
  };

  const handleResetDefaults = () => {
    setConfigForm(prev => ({
      ...prev,
      sleep_count: 15,
      wake_count: 30,
      gaugeLength_mm: 1000,
      samplingWindowSeconds: 1,
      samplingRateHz: 400,
      calibrate: false,
      debug: true,
      rockfall_on: 12.0,
      rockfall_off: 3.0,
      landslide_on: 15.0,
      landslide_off: 5.0,
      landslide_seconds: 5,
      human_touch_on: 5.0,
      human_touch_off: 1.5,
      air_wind_on: 0.8,
      air_wind_off: 0.25,
      air_wind_seconds: 12,
      normal_seconds: 10,
    }));
  };

  const handleSaveConfig = async (e) => {
    e.preventDefault();
    const sleepVal = Math.max(1, Number(configForm.sleep_count) || 15);
    const wakeVal = Math.max(1, Number(configForm.wake_count) || 30);
    const gaugeVal = parseFloat(configForm.gaugeLength_mm) || 1000;
    const samplingWin = parseInt(configForm.samplingWindowSeconds, 10) || 1;
    const samplingHz = parseInt(configForm.samplingRateHz, 10) || 400;

    const monitoringSettings = {
      uploadIntervalMinutes: sleepVal,
      wakeCountSeconds: wakeVal,
      gaugeLength_mm: gaugeVal,
      samplingWindowSeconds: samplingWin,
      samplingRateHz: samplingHz,
      debug: Boolean(configForm.debug),
      rockfall_on: parseFloat(configForm.rockfall_on) || 12.0,
      rockfall_off: parseFloat(configForm.rockfall_off) || 3.0,
      landslide_on: parseFloat(configForm.landslide_on) || 15.0,
      landslide_off: parseFloat(configForm.landslide_off) || 5.0,
      landslide_seconds: parseInt(configForm.landslide_seconds, 10) || 5,
      human_touch_on: parseFloat(configForm.human_touch_on) || 5.0,
      human_touch_off: parseFloat(configForm.human_touch_off) || 1.5,
      air_wind_on: parseFloat(configForm.air_wind_on) || 0.8,
      air_wind_off: parseFloat(configForm.air_wind_off) || 0.25,
      air_wind_seconds: parseInt(configForm.air_wind_seconds, 10) || 12,
      normal_seconds: parseInt(configForm.normal_seconds, 10) || 10,
    };

    const payload = {
      sleep_count: sleepVal,
      wake_count: wakeVal,
      gaugeLength_mm: gaugeVal,
      calibrate: Boolean(configForm.calibrate),
      hasReferenceZero: Boolean(configForm.calibrate),
      debug: Boolean(configForm.debug),
      status: configForm.status || 'ONLINE',
      monitoringSettings,
      thresholds: monitoringSettings,
    };
    try {
      const res = await configureDeviceTelemetry(deviceId, payload);
      const updatedDev = res?.device || { ...device, ...payload, monitoringSettings };
      setMsg({ type: 'success', text: `Configuration deployed to ${deviceId} successfully.` });
      setConfigModalOpen(false);
      setDevice(prev => ({ ...prev, ...updatedDev, calibrate: payload.calibrate, hasReferenceZero: payload.calibrate, monitoringSettings }));
      loadHistory(deviceId, null, null, activeFilter);
    } catch (err) {
      setMsg({ type: 'error', text: err.message || 'Error deploying config' });
    } finally {
      setTimeout(() => setMsg({ type: '', text: '' }), 3500);
    }
  };

  const handleSetReference = async () => {
    try {
      const lastHist = telemetryHistory.length > 0 ? telemetryHistory[telemetryHistory.length - 1] : null;
      const curX = liveData?.xTilt ?? liveData?.roll ?? lastHist?.xTilt ?? parseFloat(device?.xTilt ?? 0) ?? 0;
      const curY = liveData?.yTilt ?? liveData?.pitch ?? lastHist?.yTilt ?? parseFloat(device?.yTilt ?? 0) ?? 0;
      const curZ = liveData?.yaw ?? liveData?.zTilt ?? lastHist?.yaw ?? lastHist?.zTilt ?? parseFloat(device?.zTilt ?? 0) ?? 0;
      const L = parseFloat(configForm.gaugeLength_mm || device?.gaugeLength_mm || 1000);

      const res = await setDeviceReference(deviceId, {
        refThetaX: curX,
        refThetaY: curY,
        refThetaZ: curZ,
        gaugeLength_mm: L,
        refOperator: 'Commissioning Engineer',
      }).catch(() => null);

      const updatedDevice = res?.device || {
        ...device,
        refThetaX: curX,
        refThetaY: curY,
        refThetaZ: curZ,
        gaugeLength_mm: L,
        hasReferenceZero: true,
        calibrate: true,
        refTimestamp: new Date().toISOString(),
      };

      setDevice(updatedDevice);
      setLiveData(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          deltaThetaX: 0,
          deltaThetaY: 0,
          deltaThetaZ: 0,
          xDisplacement: 0,
          yDisplacement: 0,
          zDisplacement: 0,
          totalDisplacement: 0,
          hasReferenceZero: true,
          refThetaX: curX,
          refThetaY: curY,
          refThetaZ: curZ,
          gaugeLength_mm: L,
        };
      });

      loadHistory(deviceId, null, null, activeFilter);
      setMsg({
        type: 'success',
        text: `Zero reference baseline saved: θX₀=${curX.toFixed(1)}°, θY₀=${curY.toFixed(1)}° (L=${L}mm). At instant: ΔθX=ΔθY=0° and DX=DY=0.0mm.`,
      });
    } catch (err) {
      setMsg({ type: 'error', text: err.message || 'Error saving zero reference' });
    } finally {
      setTimeout(() => setMsg({ type: '', text: '' }), 4500);
    }
  };

  const handleResetReference = async () => {
    try {
      const res = await resetDeviceReference(deviceId).catch(() => null);
      const updatedDevice = res?.device || {
        ...device,
        refThetaX: 0.0,
        refThetaY: 0.0,
        refThetaZ: 0.0,
        hasReferenceZero: false,
        calibrate: false,
        refTimestamp: null,
      };

      setDevice(updatedDevice);
      loadHistory(deviceId, null, null, activeFilter);
      setMsg({ type: 'success', text: 'Reference Zero reset to factory 0.000°. Tracking absolute tilt.' });
    } catch (err) {
      setMsg({ type: 'error', text: err.message || 'Error resetting reference zero' });
    } finally {
      setTimeout(() => setMsg({ type: '', text: '' }), 4000);
    }
  };

  // Export Table Data to CSV
  const handleExportCSV = () => {
    if (telemetryHistory.length === 0) {
      alert('No telemetry records available to export for the selected date range.');
      return;
    }
    const headers = 'Timestamp_IST,Timestamp_UTC,Device_ID,Tilt_X_deg,Tilt_Y_deg,Tilt_Z_deg,XDisp_mm,YDisp_mm,TotalDisp_mm,AccelMag_g,VibrationRMS_g,VibrationPeak_g,Temperature_C,Stability';
    const rows = telemetryHistory.map(r =>
      `"${formatFullDateTime(r.timestamp || r.time)}",${r.timestamp || ''},${deviceId},${(r.xTilt ?? r.deltaX)?.toFixed(1) ?? ''},${(r.yTilt ?? r.deltaY)?.toFixed(1) ?? ''},${(r.zTilt ?? r.deltaZ)?.toFixed(1) ?? ''},${r.xDisp?.toFixed(1) ?? ''},${r.yDisp?.toFixed(1) ?? ''},${r.totalDisp?.toFixed(1) ?? ''},${r.accMag !== null && r.accMag !== undefined ? Number(r.accMag).toFixed(2) : ''},${r.vibRMS !== null && r.vibRMS !== undefined ? Number(r.vibRMS).toFixed(3) : ''},${r.vibPeak !== null && r.vibPeak !== undefined ? Number(r.vibPeak).toFixed(3) : ''},${r.temp !== null && r.temp !== undefined ? Number(r.temp).toFixed(1) : ''},${r.stability || ''}`
    );
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers, ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `telemetry_${deviceId}_${activeFilter}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Resolve latest device telemetry packet:
  // 1. liveData (from real-time stream) ONLY if it has genuine telemetry
  // 2. OR latest historical record (last point in telemetryHistory)
  // 3. OR null if device has never sent any data
  const latestData = useMemo(() => {
    if (telemetryHistory && telemetryHistory.length > 0) {
      const lastPoint = telemetryHistory[telemetryHistory.length - 1];
      if (liveData && hasTelemetryData(liveData)) {
        if (!lastPoint?.timestamp || new Date(liveData.timestamp) >= new Date(lastPoint.timestamp)) {
          return liveData;
        }
      }
      return lastPoint;
    }
    if (liveData && hasTelemetryData(liveData)) {
      return liveData;
    }
    if (device?.latestTelemetry && hasTelemetryData(device.latestTelemetry)) {
      return mapPointData(device.latestTelemetry);
    }
    return null;
  }, [liveData, telemetryHistory, device]);

  const hasData = Boolean(latestData && hasTelemetryData(latestData));

  const d = latestData || {};

  // 1. Axis Mapping:
  // X-Axis: tilt.roll
  // Y-Axis: tilt.pitch
  // Z-Axis: tilt.yaw
  // Do not use the combined tilt.tilt value as an individual X, Y, or Z axis value.
  const currentRoll = d.tilt?.roll ?? d.roll;
  const currentPitch = d.tilt?.pitch ?? d.pitch;
  const currentYaw = d.tilt?.yaw ?? d.yaw;

  // 2. Present Values: actual device angle values (Never subtract reference angle)
  const presentX = hasData && currentRoll !== undefined && currentRoll !== null && !isNaN(parseFloat(currentRoll)) ? parseFloat(currentRoll) : null;
  const presentY = hasData && currentPitch !== undefined && currentPitch !== null && !isNaN(parseFloat(currentPitch)) ? parseFloat(currentPitch) : null;
  const presentZ = hasData && currentYaw !== undefined && currentYaw !== null && !isNaN(parseFloat(currentYaw)) ? parseFloat(currentYaw) : null;

  const rawRes = typeof d.presentTilt === 'number' ? d.presentTilt : (typeof d.resultantTilt === 'number' ? d.resultantTilt : (typeof d.tilt === 'number' ? d.tilt : null));
  const presentResultant = hasData && presentX !== null && presentY !== null
    ? ((rawRes !== null && !isNaN(rawRes)) ? rawRes : Math.sqrt(presentX * presentX + presentY * presentY))
    : null;

  const L = parseFloat(device?.gaugeLength_mm || d.gaugeLength_mm || 1000.0);
  // Stored reference angles: initially 0.0° or calibrated reference if configured later
  const hasRef = Boolean(device?.hasReferenceZero || device?.calibrate || d.hasReferenceZero);
  const refX = hasRef ? (parseFloat(device?.refThetaX ?? d.refThetaX ?? 0.0) || 0.0) : 0.0;
  const refY = hasRef ? (parseFloat(device?.refThetaY ?? d.refThetaY ?? 0.0) || 0.0) : 0.0;
  const refZ = hasRef ? (parseFloat(device?.refThetaZ ?? d.refThetaZ ?? 0.0) || 0.0) : 0.0;

  // Pure actual device values directly from device without logic modifications
  const deltaX = hasData && presentX !== null ? presentX : null;
  const deltaY = hasData && presentY !== null ? presentY : null;
  const deltaZ = hasData && presentZ !== null ? presentZ : null;
  const deltaResultant = hasData && deltaX !== null && deltaY !== null ? Math.sqrt(deltaX * deltaX + deltaY * deltaY) : null;

  const roll = deltaX;
  const pitch = deltaY;
  const zTilt = deltaZ;
  const yaw = deltaZ;
  const resultant = deltaResultant;

  // Device-provided displacement data:
  const rawDisp = d.displacement || d.rawPayload?.displacement || {};
  const rawXDisp = rawDisp.xDisplacement_mm ?? d.xDisplacement_mm ?? d.xDisp ?? d.xDisplacement;
  const rawYDisp = rawDisp.yDisplacement_mm ?? d.yDisplacement_mm ?? d.yDisp ?? d.yDisplacement;
  const rawZDisp = rawDisp.zDisplacement_mm ?? d.zDisplacement_mm ?? d.zDisp ?? d.zDisplacement;
  const rawTotalDisp = rawDisp.totalDisplacement_mm ?? d.totalDisplacement_mm ?? d.totalDisp ?? d.totalDisplacement;

  const xDisp = hasData && rawXDisp !== undefined && rawXDisp !== null && !isNaN(parseFloat(rawXDisp)) ? parseFloat(rawXDisp) : null;
  const yDisp = hasData && rawYDisp !== undefined && rawYDisp !== null && !isNaN(parseFloat(rawYDisp)) ? parseFloat(rawYDisp) : null;
  const zDisp = hasData && rawZDisp !== undefined && rawZDisp !== null && !isNaN(parseFloat(rawZDisp)) ? parseFloat(rawZDisp) : null;
  const totalDisp = hasData && rawTotalDisp !== undefined && rawTotalDisp !== null && !isNaN(parseFloat(rawTotalDisp)) ? parseFloat(rawTotalDisp) : null;

  // Filtered rows for the table: newest logs at the top
  const filteredRows = useMemo(() => {
    const list = [...telemetryHistory].reverse();
    if (!tableSearch) return list;
    const q = tableSearch.toLowerCase();
    return list.filter(r =>
      r.fullTime?.toLowerCase().includes(q) ||
      r.stability?.toLowerCase().includes(q) ||
      String(r.resultant).includes(q) ||
      String(r.totalDisp).includes(q)
    );
  }, [telemetryHistory, tableSearch]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / rowsPerPage));
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return filteredRows.slice(start, start + rowsPerPage);
  }, [filteredRows, currentPage]);

  return (
    <div className="space-y-4 font-sans text-slate-800">
      {/* Toast Notification */}
      {msg.text && (
        <div className={`p-3 rounded-xl border flex items-center gap-2 text-xs font-semibold shadow-2xs ${msg.type === 'error' ? 'bg-red-50 border-red-200 text-red-800' : 'bg-emerald-50 border-emerald-200 text-emerald-800'
          }`}>
          {msg.type === 'error' ? <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" /> : <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />}
          <span>{msg.text}</span>
        </div>
      )}

      {/* Top Header & Navigation Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl border border-slate-200/80 bg-white shadow-xs">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/devices')}
            className="p-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-bold text-slate-900 leading-tight">
                {device?.name || deviceId}
              </h1>
              <span className="font-mono text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">
                {deviceId}
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold text-[10px]">
                {device?.status || 'ONLINE'}
              </span>
              <span className="flex items-center gap-1 text-[11px] font-mono text-slate-500 bg-slate-50 px-2.5 py-0.5 rounded-md border border-slate-200">
                <Clock className="w-3 h-3 text-slate-400" />
                <span>Last Updated: {hasData && d.timestamp ? formatFullDateTime(d.timestamp) : '--'}</span>
              </span>
              {device?.latitude && device?.longitude && (
                <span className="flex items-center gap-1 text-[11px] font-mono text-slate-500 bg-slate-50 px-2.5 py-0.5 rounded-md border border-slate-200">
                  <MapPin className="w-3 h-3 text-blue-500" />
                  <span>{Number(device.latitude).toFixed(4)}°N, {Number(device.longitude).toFixed(4)}°E</span>
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Live Inclinometer Diagnostics & Historical Data Logs
            </p>
          </div>
        </div>

        {/* Hardware Status & Configuration Button */}
        <div className="flex items-center gap-2 text-xs flex-wrap">
          <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 font-medium">
            <Battery className="w-3.5 h-3.5 text-emerald-600" />
            <span>
              {formatBatteryPercentage(
                (d.battery && d.battery !== '--' ? d.battery : null) ??
                d.batteryVoltage ??
                (device?.battery && device?.battery !== '--' ? device.battery : null) ??
                device?.batteryVoltage ??
                '100%'
              )}
            </span>
          </div>

          <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 font-medium">
            <Signal className="w-3.5 h-3.5 text-blue-600" />
            <span>
              {formatCSQPercentage(
                (d.signal && d.signal !== '--' ? d.signal : null) ??
                (d.signalStrength && d.signalStrength !== '--' ? d.signalStrength : null) ??
                d.csq ??
                (device?.signalStrength && device?.signalStrength !== '--' ? device.signalStrength : null) ??
                (device?.signal && device?.signal !== '--' ? device.signal : null) ??
                '85%'
              )}
            </span>
          </div>

          <button
            onClick={handleOpenConfigModal}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs rounded-xl shadow-xs transition-all cursor-pointer"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Configure Device</span>
          </button>
        </div>
      </div>

      {/* Date-Time Range Quick Filters (1h, 6h, 24h, 7d, 30d) & Custom Range */}
      <div className={cardCls}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Preset Buttons */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-semibold text-slate-500 mr-1">Time Preset:</span>
            {[
              { id: '1h', label: '1h' },
              { id: '6h', label: '6h' },
              { id: '24h', label: '24h' },
              { id: '7d', label: '7d' },
              { id: '30d', label: '30d' },
            ].map(b => (
              <button
                key={b.id}
                onClick={() => handleRangeSelect(b.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${activeFilter === b.id
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
              >
                {b.label}
              </button>
            ))}
          </div>

          {/* Custom Date-Time Form (Converted to UTC for query) */}
          <form onSubmit={handleCustomDateSubmit} className="flex flex-wrap items-center gap-2 text-xs">
            <div className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <input
                type="datetime-local"
                required
                value={fromDateTime}
                onChange={e => setFromDateTime(e.target.value)}
                className="px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-800 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
              />
              <span className="text-slate-400">to</span>
              <input
                type="datetime-local"
                required
                value={toDateTime}
                onChange={e => setToDateTime(e.target.value)}
                className="px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-800 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-medium rounded-lg border border-slate-200 transition-colors cursor-pointer"
            >
              {loading ? '...' : 'Apply'}
            </button>
          </form>
        </div>
      </div>

      {/* Row 1: Live Status Readouts & Device Sampling Config */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* 1. Live Primary Inclinometer & Vector Metrics Readout matching user mockup */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs flex flex-col justify-between">
          {/* Top Header */}
          <div className="flex items-center justify-between pb-3.5 border-b border-slate-100 mb-3.5">
            <div className="flex items-center gap-2.5">
              {/* Inclinometer Slope & Pendulum Icon matching image */}
              <div className="text-blue-600 flex-shrink-0">
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 20h18" />
                  <path d="M4 20L17 5" />
                  <path d="M15 8.5v5" />
                  <circle cx="15" cy="15.5" r="1.8" fill="currentColor" />
                </svg>
              </div>
              <div className="h-5 w-px bg-slate-200" />
              <h3 className="text-sm sm:text-base font-extrabold text-slate-900 tracking-tight">
                LIVE INCLINOMETER &amp; DISPLACEMENT
              </h3>
            </div>
            {hasData ? (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-600 text-white font-semibold text-xs shadow-xs">
                <Radio className="w-3.5 h-3.5 animate-pulse" />
                <span>LIVE STREAM</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-500 font-semibold text-xs border border-slate-200">
                <Radio className="w-3.5 h-3.5" />
                <span>NO DATA</span>
              </div>
            )}
          </div>

          <div className="space-y-4">
            {/* TILT ANGLE */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-900 tracking-wide uppercase">
                  <Layers className="w-4 h-4 text-slate-800" />
                  <span>TILT ANGLE</span>
                </div>
                {/* <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-500">
                  <span>θ₀ Ref:</span>
                  <span className="font-semibold text-slate-700">X:{formatSigned(refX, 1)}</span>
                  <span className="font-semibold text-slate-700">Y:{formatSigned(refY, 1)}</span>
                  <span className="font-semibold text-slate-700">Z:{formatSigned(refZ, 1)}</span>
                </div> */}
              </div>

              <div className="grid grid-cols-3 gap-3 text-center">
                {/* Tilt X */}
                <div className="relative overflow-hidden p-3.5 rounded-2xl bg-blue-50/40 border border-blue-100/80 flex flex-col items-center justify-center">
                  <span className="px-3.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-bold text-xs tracking-tight">
                    Tilt X
                  </span>
                  <div className="text-xl sm:text-2xl font-bold text-blue-600 mt-2 font-mono tracking-tight">
                    {formatSigned(deltaX, 1)}
                  </div>
                  <div className="absolute bottom-0 right-0 pointer-events-none opacity-45">
                    <svg className="w-20 h-10" viewBox="0 0 100 50" preserveAspectRatio="none">
                      <path d="M0,50 Q40,15 100,20 L100,50 Z" fill="#93c5fd" />
                    </svg>
                  </div>
                </div>

                {/* Tilt Y */}
                <div className="relative overflow-hidden p-3.5 rounded-2xl bg-purple-50/40 border border-purple-100/80 flex flex-col items-center justify-center">
                  <span className="px-3.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-bold text-xs tracking-tight">
                    Tilt Y
                  </span>
                  <div className="text-xl sm:text-2xl font-bold text-purple-700 mt-2 font-mono tracking-tight">
                    {formatSigned(deltaY, 1)}
                  </div>
                  <div className="absolute bottom-0 right-0 pointer-events-none opacity-45">
                    <svg className="w-20 h-10" viewBox="0 0 100 50" preserveAspectRatio="none">
                      <path d="M0,50 Q40,15 100,20 L100,50 Z" fill="#d8b4fe" />
                    </svg>
                  </div>
                </div>

                {/* Tilt Z */}
                <div className="relative overflow-hidden p-3.5 rounded-2xl bg-emerald-50/40 border border-emerald-100/80 flex flex-col items-center justify-center">
                  <span className="px-3.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold text-xs tracking-tight">
                    Tilt Z
                  </span>
                  <div className="text-xl sm:text-2xl font-bold text-emerald-600 mt-2 font-mono tracking-tight">
                    {formatSigned(deltaZ, 1)}
                  </div>
                  <div className="absolute bottom-0 right-0 pointer-events-none opacity-45">
                    <svg className="w-20 h-10" viewBox="0 0 100 50" preserveAspectRatio="none">
                      <path d="M0,50 Q40,15 100,20 L100,50 Z" fill="#86efac" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            {/* 3. X / Y DISPLACEMENT IN MM FROM DEVICE TELEMETRY */}
            <div>
              <div className="flex items-center justify-between text-xs font-bold text-slate-900 tracking-wide mb-2.5">
                <div className="flex items-center gap-2">
                  <Move className="w-4 h-4 text-slate-800" />
                  <span>X / Y DISPLACEMENT (MM)</span>
                </div>
                <span className="text-[10px] font-mono font-medium text-slate-500">
                  Total: <strong className="text-slate-800">{hasData && typeof totalDisp === 'number' ? `${totalDisp.toFixed(2)} mm` : '--'}</strong>
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2.5 text-center">
                {/* DX */}
                <div className="relative overflow-hidden p-3 rounded-2xl bg-blue-50/40 border border-blue-100/80 flex flex-col items-center justify-center min-h-[80px]">
                  <span className="px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-bold text-xs">
                    DX
                  </span>
                  <div className="flex items-baseline font-mono mt-1">
                    <span className="text-lg sm:text-xl font-extrabold text-blue-600 tracking-tight">
                      {hasData && typeof xDisp === 'number' ? Number(xDisp).toFixed(2) : '--'}
                    </span>
                    <span className="text-xs font-semibold text-slate-500 ml-1 font-sans">mm</span>
                  </div>
                </div>

                {/* DY */}
                <div className="relative overflow-hidden p-3 rounded-2xl bg-amber-50/40 border border-amber-100/80 flex flex-col items-center justify-center min-h-[80px]">
                  <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-bold text-xs">
                    DY
                  </span>
                  <div className="flex items-baseline font-mono mt-1">
                    <span className="text-lg sm:text-xl font-extrabold text-amber-600 tracking-tight">
                      {hasData && typeof yDisp === 'number' ? Number(yDisp).toFixed(2) : '--'}
                    </span>
                    <span className="text-xs font-semibold text-slate-500 ml-1 font-sans">mm</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Ambient Temperature Readout matching user mockup */}
            <div className="border-t border-slate-100 pt-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm sm:text-base font-bold text-slate-900 font-sans">
                <Thermometer className="w-5 h-5 text-amber-500 flex-shrink-0" />
                <span>Ambient Temperature:</span>
              </div>
              <div className="px-5 py-1.5 rounded-full bg-amber-100/80 border border-amber-200/90 font-mono text-sm sm:text-base font-bold text-amber-900 shadow-2xs">
                {hasData && d.temp !== null && d.temp !== undefined
                  ? `${Number(d.temp).toFixed(1)} °C`
                  : '--'}
              </div>
            </div>
          </div>
        </div>

        {/* 2. Sensor Health & Hardware Configuration matching user design */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs flex flex-col justify-between">
          {/* Header */}
          <div className="flex items-center justify-between pb-3.5 border-b border-slate-100 mb-1 relative z-10">
            <div className="flex items-center gap-2.5">
              <Settings className="w-5 h-5 text-indigo-600 flex-shrink-0" />
              <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                Device Sampling &amp; Configuration
              </h3>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 font-semibold text-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
              <span>Active</span>
            </div>
          </div>

          {/* 5 Configuration Metric Rows */}
          <div className="divide-y divide-slate-100/80 relative z-10 flex-1 flex flex-col justify-around py-1">
            {/* 1. Sleep Interval */}
            <div className="flex items-center justify-between py-2.5">
              <div className="flex items-center gap-3">
                <Bed className="w-5 h-5 text-slate-700 flex-shrink-0" />
                <span className="text-xs sm:text-sm font-semibold text-slate-700">Sleep Interval (Min 15M)</span>
              </div>
              <span className="px-3.5 py-1 rounded-xl bg-slate-100/70 border border-slate-200/50 font-bold text-slate-900 text-xs sm:text-sm">
                {device?.sleep_count || 15} Minutes
              </span>
            </div>

            {/* 2. Wake Sampling Duration */}
            <div className="flex items-center justify-between py-2.5">
              <div className="flex items-center gap-3">
                <Layers className="w-5 h-5 text-slate-700 flex-shrink-0" />
                <span className="text-xs sm:text-sm font-semibold text-slate-700">Wake Sampling Duration</span>
              </div>
              <span className="px-3.5 py-1 rounded-xl bg-slate-100/70 border border-slate-200/50 font-bold text-slate-900 text-xs sm:text-sm">
                {device?.wake_count || 30} Seconds
              </span>
            </div>

            {/* 3. Zero Calibration Offset */}
            <div className="flex items-center justify-between py-2.5">
              <div className="flex items-center gap-3">
                <Crosshair className="w-5 h-5 text-slate-700 flex-shrink-0" />
                <span className="text-xs sm:text-sm font-semibold text-slate-700">Zero Calibration Offset</span>
              </div>
              {hasRef ? (
                <span className="px-3.5 py-1 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold text-xs sm:text-sm">
                  PASSED ✓
                </span>
              ) : (
                <span className="px-3.5 py-1 rounded-xl bg-slate-100/70 border border-slate-200/50 font-medium text-slate-500 text-xs sm:text-sm">
                  Not Set
                </span>
              )}
            </div>

            {/* 4. Ambient Temperature */}
            <div className="flex items-center justify-between py-2.5">
              <div className="flex items-center gap-3">
                <Thermometer className="w-5 h-5 text-slate-700 flex-shrink-0" />
                <span className="text-xs sm:text-sm font-semibold text-slate-700">Ambient Temperature</span>
              </div>
              <span className="px-3.5 py-1 rounded-xl bg-slate-100/70 border border-slate-200/50 font-bold text-slate-900 text-xs sm:text-sm">
                {hasData && d.temp !== null && d.temp !== undefined ? `${Number(d.temp).toFixed(1)} °C` : '--'}
              </span>
            </div>

            {/* 5. Telemetry History Points */}
            <div className="flex items-center justify-between py-2.5">
              <div className="flex items-center gap-3">
                <Database className="w-5 h-5 text-slate-700 flex-shrink-0" />
                <span className="text-xs sm:text-sm font-semibold text-slate-700">Telemetry History Points</span>
              </div>
              <span className="px-3.5 py-1 rounded-xl bg-blue-50 border border-blue-100 font-bold text-blue-600 text-xs sm:text-sm">
                {telemetryHistory.length} Points
              </span>
            </div>
          </div>

          {/* Mountain / Wave Silhouette Graphic at Bottom matching uploaded image */}
          <div className="absolute bottom-0 left-0 right-0 pointer-events-none overflow-hidden rounded-b-2xl h-24 z-0">
            <svg className="w-full h-full" viewBox="0 0 400 100" preserveAspectRatio="none">
              <path
                d="M0,100 L0,80 Q90,35 180,70 T360,45 Q380,40 400,55 L400,100 Z"
                fill="#e0e7ff"
                opacity="0.45"
              />
              <path
                d="M0,100 L0,90 Q120,55 240,80 T400,60 L400,100 Z"
                fill="#dbeafe"
                opacity="0.6"
              />
            </svg>
          </div>
        </div>
      </div>

      {/* Row 2: Live Historical Multi-Axis Time-Series Charts (4 Panels matching exact layout) */}
      <TiltmeterChartsRow telemetryHistory={telemetryHistory} loading={loading} currentDevice={device} />

      {/* Row 3: Dedicated Device Historical Telemetry Data Table */}
      <div className={cardCls}>
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider font-mono text-slate-800">
              HISTORICAL TELEMETRY LOGS • <span className="text-blue-600">{deviceId}</span> ({filteredRows.length} Records)
            </span>
            <div className="flex items-center gap-1 text-[10px] text-blue-600 font-semibold font-mono">
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              {/* <span>AUTO SYNC (1m)</span> */}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
              <input
                type="text"
                placeholder="Filter logs..."
                value={tableSearch}
                onChange={e => {
                  setTableSearch(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-8 pr-3 py-1 rounded-xl border border-slate-200 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-blue-500 w-40 sm:w-56"
              />
            </div>
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-xs rounded-xl border border-slate-200 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-slate-600" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full text-left text-xs whitespace-nowrap">
            <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 z-10 font-mono">
              <tr className="uppercase text-[10px] tracking-wider text-slate-600 font-bold">
                <th className="py-2.5 px-3">Timestamp</th>
                <th className="py-2.5 px-3 text-blue-700">Tilt X (°)</th>
                <th className="py-2.5 px-3 text-purple-700">Tilt Y (°)</th>
                <th className="py-2.5 px-3 text-emerald-700">Tilt Z (°)</th>
                <th className="py-2.5 px-3 text-cyan-700">X Disp (mm)</th>
                <th className="py-2.5 px-3 text-amber-700">Y Disp (mm)</th>
                <th className="py-2.5 px-3 text-pink-700">Total Disp (mm)</th>
                <th className="py-2.5 px-3 text-amber-800">Vib Peak (g)</th>
                <th className="py-2.5 px-3 text-orange-700">Temp (°C)</th>
                <th className="py-2.5 px-3 text-center">Stability</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {paginatedRows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-slate-400 text-xs font-mono">
                    {loading ? 'Fetching telemetry logs for this device...' : 'No telemetry records found for this period.'}
                  </td>
                </tr>
              ) : (
                paginatedRows.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2 px-3 text-slate-600 font-medium font-sans">
                      {r.fullTime || r.time}
                    </td>
                    <td className="py-2 px-3 text-blue-700 font-bold">
                      {formatSigned(r.xTilt ?? r.deltaX, 1)}
                    </td>
                    <td className="py-2 px-3 text-purple-700 font-bold">
                      {formatSigned(r.yTilt ?? r.deltaY, 1)}
                    </td>
                    <td className="py-2 px-3 text-emerald-700 font-bold">
                      {formatSigned(r.zTilt ?? r.deltaZ, 1)}
                    </td>
                    <td className="py-2 px-3 text-cyan-700 font-semibold">
                      {r.xDisp !== null && r.xDisp !== undefined ? `${r.xDisp >= 0 ? '+' : ''}${Number(r.xDisp).toFixed(2)} mm` : '--'}
                    </td>
                    <td className="py-2 px-3 text-amber-700 font-semibold">
                      {r.yDisp !== null && r.yDisp !== undefined ? `${r.yDisp >= 0 ? '+' : ''}${Number(r.yDisp).toFixed(2)} mm` : '--'}
                    </td>
                    <td className="py-2 px-3 text-pink-700 font-bold">
                      {r.totalDisp !== null && r.totalDisp !== undefined ? `${Number(r.totalDisp).toFixed(2)} mm` : '--'}
                    </td>
                    <td className="py-2 px-3 text-amber-800">
                      {r.vibPeak !== null && r.vibPeak !== undefined ? `${Number(r.vibPeak).toFixed(2)} g` : '--'}
                    </td>
                    <td className="py-2 px-3 text-orange-700">
                      {r.temp !== null && r.temp !== undefined ? `${Number(r.temp).toFixed(1)} °C` : '--'}
                    </td>
                    <td className="py-2 px-3 text-center font-sans">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${r.stabilityClass}`}>
                        {r.stability}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Table Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs font-mono">
            <span className="text-slate-500">
              Page {currentPage} of {totalPages} ({filteredRows.length} total entries)
            </span>
            <div className="flex items-center gap-1">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                className="px-2.5 py-1 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                className="px-2.5 py-1 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal: Complete Device Configuration & Applied Parameters */}
      {configModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 font-sans">
          <div className="w-full max-w-2xl max-h-[92vh] rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 via-white to-blue-50/30">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-blue-100/80 text-blue-700">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Configure Device {deviceId}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">Sampling intervals, physical dimensions &amp; multi-priority hazard thresholds</p>
                </div>
              </div>
              <button onClick={() => setConfigModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg cursor-pointer transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveConfig} className="p-4 sm:p-5 overflow-y-auto space-y-3.5 text-xs flex-1 bg-slate-50/40">
              {/* Card 1: Timing & Physical Parameters */}
              <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs space-y-3">
                <h4 className="text-sm font-bold text-slate-800">Timing &amp; Physical Parameters</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Upload Interval (Min)</label>
                    <input
                      type="number"
                      required
                      min="1"
                      max="1440"
                      value={configForm.sleep_count}
                      onChange={e => setConfigForm({ ...configForm, sleep_count: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-mono text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <span className="block text-[11px] text-slate-400 mt-1">Default: 15m</span>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Wake Sampling (Sec)</label>
                    <input
                      type="number"
                      required
                      min="1"
                      max="3600"
                      value={configForm.wake_count}
                      onChange={e => setConfigForm({ ...configForm, wake_count: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-mono text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <span className="block text-[11px] text-slate-400 mt-1">Default: 30s</span>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Gauge Length (mm)</label>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      value={configForm.gaugeLength_mm}
                      onChange={e => setConfigForm({ ...configForm, gaugeLength_mm: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-mono text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <span className="block text-[11px] text-slate-400 mt-1">L for ΔDisp (1000)</span>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Sampling Rate (Hz)</label>
                    <input
                      type="number"
                      step="10"
                      min="10"
                      max="1000"
                      value={configForm.samplingRateHz}
                      onChange={e => setConfigForm({ ...configForm, samplingRateHz: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-mono text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <span className="block text-[11px] text-slate-400 mt-1">LSM6DSO: 400Hz</span>
                  </div>
                </div>
              </div>

              {/* Card 2: Priority 1: Rockfall Thresholds (m/s²) */}
              <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-slate-800">Priority 1: Rockfall Thresholds (m/s²)</h4>
                  <span className="font-mono text-xs font-bold text-red-600">rockfallAlarm</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">ON Threshold (Trigger peak)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={configForm.rockfall_on}
                      onChange={e => setConfigForm({ ...configForm, rockfall_on: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-mono text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <span className="block text-[11px] text-slate-400 mt-1">Default: 12.0 m/s²</span>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">OFF Threshold (Recovery)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={configForm.rockfall_off}
                      onChange={e => setConfigForm({ ...configForm, rockfall_off: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-mono text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <span className="block text-[11px] text-slate-400 mt-1">Default: 3.0 m/s²</span>
                  </div>
                </div>
              </div>

              {/* Card 3: Priority 2: Landslide Thresholds (deg & duration) */}
              <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-slate-800">Priority 2: Landslide Thresholds (deg &amp; duration)</h4>
                  <span className="font-mono text-xs font-bold text-amber-600">Continuous Angle Drift</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">ON Angle (°)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={configForm.landslide_on}
                      onChange={e => setConfigForm({ ...configForm, landslide_on: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-mono text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <span className="block text-[11px] text-slate-400 mt-1">Default: 15.0°</span>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">OFF Angle (°)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={configForm.landslide_off}
                      onChange={e => setConfigForm({ ...configForm, landslide_off: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-mono text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <span className="block text-[11px] text-slate-400 mt-1">Default: 5.0°</span>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Duration (Sec)</label>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      value={configForm.landslide_seconds}
                      onChange={e => setConfigForm({ ...configForm, landslide_seconds: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-mono text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <span className="block text-[11px] text-slate-400 mt-1">Default: 5s</span>
                  </div>
                </div>
              </div>

              {/* Card 4: Priority 3: Human Touch Vibration Thresholds (m/s²) */}
              <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-slate-800">Priority 3: Human Touch Vibration Thresholds (m/s²)</h4>
                  <span className="font-mono text-xs font-bold text-blue-600">Transient Touch</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">ON Peak Threshold</label>
                    <input
                      type="number"
                      step="0.1"
                      value={configForm.human_touch_on}
                      onChange={e => setConfigForm({ ...configForm, human_touch_on: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-mono text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <span className="block text-[11px] text-slate-400 mt-1">Default: 5.0 m/s²</span>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">OFF Peak Threshold</label>
                    <input
                      type="number"
                      step="0.1"
                      value={configForm.human_touch_off}
                      onChange={e => setConfigForm({ ...configForm, human_touch_off: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-mono text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <span className="block text-[11px] text-slate-400 mt-1">Default: 1.5 m/s²</span>
                  </div>
                </div>
              </div>

              {/* Card 5: Priority 4: Air / Wind Disturbance Thresholds */}
              <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-slate-800">Priority 4: Air / Wind Disturbance Thresholds</h4>
                  <span className="font-mono text-xs font-bold text-teal-600">Low-Frequency Wind Gusts</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">ON (m/s²)</label>
                    <input
                      type="number"
                      step="0.05"
                      value={configForm.air_wind_on}
                      onChange={e => setConfigForm({ ...configForm, air_wind_on: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-mono text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <span className="block text-[11px] text-slate-400 mt-1">Default: 0.8</span>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">OFF (m/s²)</label>
                    <input
                      type="number"
                      step="0.05"
                      value={configForm.air_wind_off}
                      onChange={e => setConfigForm({ ...configForm, air_wind_off: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-mono text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <span className="block text-[11px] text-slate-400 mt-1">Default: 0.25</span>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Duration (Sec)</label>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      value={configForm.air_wind_seconds}
                      onChange={e => setConfigForm({ ...configForm, air_wind_seconds: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-mono text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <span className="block text-[11px] text-slate-400 mt-1">Default: 12s</span>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Settle (Sec)</label>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      value={configForm.normal_seconds}
                      onChange={e => setConfigForm({ ...configForm, normal_seconds: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-mono text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <span className="block text-[11px] text-slate-400 mt-1">Default: 10s</span>
                  </div>
                </div>
              </div>

              {/* Card 6: Zero Reference Calibration (Tare Offset) */}
              <div className="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4 shadow-xs flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
                    <ShieldCheck className="w-5 h-5 text-indigo-600 shrink-0" />
                    <span>Zero Reference Calibration (Tare Offset)</span>
                  </div>
                  <p className="text-xs text-indigo-900/80">
                    When enabled, marks current mounting angle as zero reference (Δθ = 0.000° datum)
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(configForm.calibrate)}
                  onChange={e => setConfigForm({ ...configForm, calibrate: e.target.checked })}
                  className="w-5 h-5 text-indigo-600 border-slate-300 rounded cursor-pointer shrink-0"
                />
              </div>

              {/* Card 7: Serial Debug Stream (*DBG) */}
              <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <h4 className="text-sm font-bold text-slate-900">Serial Debug Stream (*DBG)</h4>
                  <p className="text-xs text-slate-500">Enable 1-second compact UART sensor line</p>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(configForm.debug)}
                  onChange={e => setConfigForm({ ...configForm, debug: e.target.checked })}
                  className="w-5 h-5 text-blue-600 border-slate-300 rounded cursor-pointer shrink-0"
                />
              </div>

              {/* Card 8: Operational State */}
              <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs flex items-center justify-between gap-4">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">Device Operational State</h4>
                  <p className="text-xs text-slate-500">Enable or disable sensor device telemetry tracking</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={configForm.status !== 'DISABLED' && configForm.status !== 'OFFLINE'}
                    onChange={e => setConfigForm({ ...configForm, status: e.target.checked ? 'ONLINE' : 'DISABLED' })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                  <span className="ml-2 text-xs font-bold text-slate-700">
                    {configForm.status !== 'DISABLED' && configForm.status !== 'OFFLINE' ? 'ONLINE' : 'DISABLED'}
                  </span>
                </label>
              </div>

              {/* Action Bar */}
              <div className="pt-3 flex items-center justify-between gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={handleResetDefaults}
                  className="px-3.5 py-2 rounded-xl border border-slate-200 text-slate-700 font-medium cursor-pointer hover:bg-slate-100 transition-colors"
                >
                  Reset Defaults
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setConfigModalOpen(false)}
                    className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-medium cursor-pointer hover:bg-slate-100 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <Sliders className="w-4 h-4" />
                    <span>Deploy Configuration</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
