import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Shield, Battery, Signal, Sliders, Calendar,
  Download, RefreshCw, Layers, ShieldCheck, Activity,
  CheckCircle2, AlertTriangle, Radio, Clock, MapPin,
  Compass, Zap, Thermometer, Search, ExternalLink, Sun, Target,
  Bed, Crosshair, Database, Settings, Move
} from 'lucide-react';
import { getDevice, getDevices, getDeviceTelemetry, configureDeviceTelemetry, setDeviceReference, resetDeviceReference } from '../api/apiClient';
import { parseTelemetry, hasTelemetryData, formatSigned, formatPresent, formatBatteryPercentage, formatCSQPercentage } from '../utils/telemetryHelper';
import { formatISTDatetimeLocal, istDatetimeToUTC, formatFullDateTime, formatTimeString, formatHHMM } from '../utils/dateHelper';
import TiltmeterChartsRow from '../components/TiltmeterChartsRow';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import AlarmSummaryWidget from '../components/AlarmSummaryWidget';
import RecentEventsWidget from '../components/RecentEventsWidget';

export default function DashboardPage({ devices = [], currentDevice, onSelectDevice }) {
  const navigate = useNavigate();
  const cardCls = 'rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs text-slate-800';

  const [deviceList, setDeviceList] = useState(devices);
  const [selectedId, setSelectedId] = useState(currentDevice?.id || devices[0]?.id || '');
  const [deviceMeta, setDeviceMeta] = useState(null);
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
  const [configForm, setConfigForm] = useState({ sleep_count: '', wake_count: '', calibrate: false });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });

  // Sync devices prop or fetch only once if empty
  useEffect(() => {
    if (devices && devices.length > 0) {
      setDeviceList(devices);
      if (!selectedId) setSelectedId(devices[0].id);
    } else {
      getDevices()
        .then(res => {
          if (res?.devices?.length) {
            setDeviceList(res.devices);
            if (!selectedId) setSelectedId(res.devices[0].id);
          }
        })
        .catch(() => { });
    }
  }, [devices]);

  // When currentDevice prop changes from parent, sync selectedId
  useEffect(() => {
    if (currentDevice?.id && currentDevice.id !== selectedId) {
      setSelectedId(currentDevice.id);
    }
  }, [currentDevice?.id]);

  // Active selected device object - strictly for the selectedId only
  const activeDevice = useMemo(() => {
    if (!selectedId) return null;
    const found = deviceList.find(d => d.id?.toLowerCase() === selectedId?.toLowerCase());
    const matchedCurrent = currentDevice?.id?.toLowerCase() === selectedId?.toLowerCase() ? currentDevice : null;

    if (deviceMeta && deviceMeta.id?.toLowerCase() === selectedId?.toLowerCase()) {
      return { ...(found || {}), ...deviceMeta };
    }
    return found || matchedCurrent || {
      id: selectedId,
      name: `Tiltmeter ${selectedId}`,
      status: 'ONLINE',
    };
  }, [deviceList, selectedId, deviceMeta, currentDevice]);

  // Map individual history point into structured format
  const mapPointData = (pt) => {
    const ts = pt.timestamp || pt.time;

    // 1. Axis Mapping:
    // X-Axis: tilt.roll
    // Y-Axis: tilt.pitch
    // Z-Axis: tilt.yaw
    const currentRoll = pt.tilt?.roll ?? pt.roll ?? pt.presentX ?? pt.xTilt;
    const currentPitch = pt.tilt?.pitch ?? pt.pitch ?? pt.presentY ?? pt.yTilt;
    const currentYaw = pt.tilt?.yaw ?? pt.yaw ?? pt.presentZ ?? pt.zTilt;

    // 2. Present Values: actual device angle values without subtracting reference
    const presentX = (currentRoll !== undefined && currentRoll !== null && !isNaN(parseFloat(currentRoll))) ? parseFloat(currentRoll) : 0.0;
    const presentY = (currentPitch !== undefined && currentPitch !== null && !isNaN(parseFloat(currentPitch))) ? parseFloat(currentPitch) : 0.0;
    const presentZ = (currentYaw !== undefined && currentYaw !== null && !isNaN(parseFloat(currentYaw))) ? parseFloat(currentYaw) : 0.0;
    const rawRes = pt.tilt?.tilt ?? pt.presentTilt ?? pt.resultantTilt ?? pt.resultant ?? pt.tilt;
    const presentRes = typeof rawRes === 'number' && !isNaN(rawRes) ? rawRes : Math.sqrt(presentX * presentX + presentY * presentY);

    // 3. Stored Reference Angles: Initially 0.0°, or calibrated reference if configured
    const L = parseFloat(activeDevice?.gaugeLength_mm || 1000.0);
    const hasCalibratedRef = Boolean(activeDevice?.hasReferenceZero || activeDevice?.calibrate || pt.hasReferenceZero);
    const refX = hasCalibratedRef ? (parseFloat(activeDevice?.refThetaX ?? pt.refThetaX ?? 0.0) || 0.0) : 0.0;
    const refY = hasCalibratedRef ? (parseFloat(activeDevice?.refThetaY ?? pt.refThetaY ?? 0.0) || 0.0) : 0.0;
    const refZ = hasCalibratedRef ? (parseFloat(activeDevice?.refThetaZ ?? pt.refThetaZ ?? 0.0) || 0.0) : 0.0;

    // 4. Delta Values: Current − Reference (Calculated with original numeric full precision)
    // Delta X = Current Roll − Reference Roll
    // Delta Y = Current Pitch − Reference Pitch
    // Delta Z = Current Yaw − Reference Yaw
    const deltaX = (pt.deltaX !== undefined && pt.deltaX !== null && !isNaN(parseFloat(pt.deltaX)))
      ? parseFloat(pt.deltaX)
      : (presentX - refX);
    const deltaY = (pt.deltaY !== undefined && pt.deltaY !== null && !isNaN(parseFloat(pt.deltaY)))
      ? parseFloat(pt.deltaY)
      : (presentY - refY);
    const deltaZ = (pt.deltaZ !== undefined && pt.deltaZ !== null && !isNaN(parseFloat(pt.deltaZ)))
      ? parseFloat(pt.deltaZ)
      : (presentZ - refZ);

    // Device-provided displacement data:
    const rawDisp = pt.displacement || pt.rawPayload?.displacement || {};
    const rawXDisp = rawDisp.xDisplacement_mm ?? pt.xDisplacement_mm ?? pt.xDisp ?? pt.xDisplacement;
    const rawYDisp = rawDisp.yDisplacement_mm ?? pt.yDisplacement_mm ?? pt.yDisp ?? pt.yDisplacement;
    const rawZDisp = rawDisp.zDisplacement_mm ?? pt.zDisplacement_mm ?? pt.zDisp ?? pt.zDisplacement;
    const rawTotalDisp = rawDisp.totalDisplacement_mm ?? pt.totalDisplacement_mm ?? pt.totalDisp ?? pt.totalDisplacement;

    const xD = (rawXDisp !== undefined && rawXDisp !== null && !isNaN(parseFloat(rawXDisp))) ? parseFloat(rawXDisp) : 0.0;
    const yD = (rawYDisp !== undefined && rawYDisp !== null && !isNaN(parseFloat(rawYDisp))) ? parseFloat(rawYDisp) : 0.0;
    const zD = (rawZDisp !== undefined && rawZDisp !== null && !isNaN(parseFloat(rawZDisp))) ? parseFloat(rawZDisp) : 0.0;
    const totD = (rawTotalDisp !== undefined && rawTotalDisp !== null && !isNaN(parseFloat(rawTotalDisp))) ? parseFloat(rawTotalDisp) : Math.sqrt(xD * xD + yD * yD + zD * zD);
    const deltaRes = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    // Sensor data - use actual values from DB, no dummy fallbacks
    const rawAxRaw = pt.axG ?? pt.ax ?? pt.acceleration?.ax ?? pt.acceleration?.x ?? null;
    const rawAyRaw = pt.ayG ?? pt.ay ?? pt.acceleration?.ay ?? pt.acceleration?.y ?? null;
    const rawAzRaw = pt.azG ?? pt.az ?? pt.acceleration?.az ?? pt.acceleration?.z ?? null;
    const rawAx = rawAxRaw !== null ? parseFloat(rawAxRaw) : null;
    const rawAy = rawAyRaw !== null ? parseFloat(rawAyRaw) : null;
    const rawAz = rawAzRaw !== null ? parseFloat(rawAzRaw) : null;
    const axG = rawAx !== null && !isNaN(rawAx) ? (Math.abs(rawAx) > 3.0 ? rawAx / 9.80665 : rawAx) : null;
    const ayG = rawAy !== null && !isNaN(rawAy) ? (Math.abs(rawAy) > 3.0 ? rawAy / 9.80665 : rawAy) : null;
    const azG = rawAz !== null && !isNaN(rawAz) ? (Math.abs(rawAz) > 3.0 ? rawAz / 9.80665 : rawAz) : null;

    const accMRaw = pt.accMag ?? pt.acceleration?.accMag ?? null;
    const accM = accMRaw !== null ? parseFloat(accMRaw) : null;
    const vibRRaw = pt.vibRMS ?? pt.vibrationRMS ?? pt.vibration?.vibrationRMS ?? null;
    const vibR = vibRRaw !== null ? parseFloat(vibRRaw) : null;
    const vibPRaw = pt.vibPeak ?? pt.vibrationPeak ?? pt.vibration?.vibrationPeak ?? null;
    const vibP = vibPRaw !== null ? parseFloat(vibPRaw) : null;
    const tempRaw = pt.temp ?? pt.temperature ?? pt.environment?.temperature ?? null;
    const tempC = tempRaw !== null ? parseFloat(tempRaw) : null;

    const vibForStability = vibR ?? 0;
    let stability = 'Stable';
    let stabilityClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (Math.abs(deltaRes) >= 2.0 || Math.abs(totD) >= 10.0 || vibForStability >= 0.5) {
      stability = 'Critical';
      stabilityClass = 'bg-red-50 text-red-700 border-red-200';
    } else if (Math.abs(deltaRes) >= 1.0 || Math.abs(totD) >= 5.0 || vibForStability >= 0.2) {
      stability = 'Warning';
      stabilityClass = 'bg-amber-50 text-amber-700 border-amber-200';
    }

    return {
      time: formatHHMM(ts),
      fullTime: formatFullDateTime(ts),
      timestamp: ts,

      // Present Values = Pure actual device values (Never subtract reference zero)
      presentX: Number(presentX.toFixed(1)),
      presentY: Number(presentY.toFixed(1)),
      presentZ: Number(presentZ.toFixed(1)),
      roll: Number(presentX.toFixed(1)),
      pitch: Number(presentY.toFixed(1)),
      yaw: Number(presentZ.toFixed(1)),
      xTilt: Number(deltaX.toFixed(1)),
      yTilt: Number(deltaY.toFixed(1)),
      zTilt: Number(deltaZ.toFixed(1)),
      resultant: Number(presentRes.toFixed(1)),

      // Delta Values = Current Roll/Pitch/Yaw − Zero Reference Roll/Pitch/Yaw
      deltaX: Number(deltaX.toFixed(1)),
      deltaY: Number(deltaY.toFixed(1)),
      deltaZ: Number(deltaZ.toFixed(1)),
      deltaThetaX: Number(deltaX.toFixed(1)),
      deltaThetaY: Number(deltaY.toFixed(1)),
      deltaThetaZ: Number(deltaZ.toFixed(1)),
      deltaResultant: Number(deltaRes.toFixed(1)),

      refX,
      refY,
      refZ,

      totalDisp: Number(totD.toFixed(2)),
      xDisp: Number(xD.toFixed(2)),
      yDisp: Number(yD.toFixed(2)),
      zDisp: Number(zD.toFixed(2)),
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

  // Load telemetry history whenever device or date filter changes - strictly for id
  const loadHistory = (id, fromDt = null, toDt = null, rangeKey = activeFilter, isCurrentCheck = null) => {
    if (!id) return;
    setLoading(true);

    const utcFrom = fromDt ? istDatetimeToUTC(fromDt) : null;
    const utcTo = toDt ? istDatetimeToUTC(toDt) : null;

    getDeviceTelemetry(id, utcFrom, utcTo, rangeKey)
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
          if (firstPoint?.timestamp && lastPoint?.timestamp && rangeKey) {
            setFromDateTime(formatISTDatetimeLocal(new Date(firstPoint.timestamp)));
            setToDateTime(formatISTDatetimeLocal(new Date(lastPoint.timestamp)));
          }
          const latestPointCandidate = res?.latest ? mapPointData(res.latest) : lastPoint;
          if (latestPointCandidate) {
            setLiveData(parseTelemetry(latestPointCandidate));
          } else {
            setLiveData(null);
          }
        } else if (res?.latest) {
          const mappedLatest = mapPointData(res.latest);
          setTelemetryHistory([mappedLatest]);
          setLiveData(parseTelemetry(mappedLatest));
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

  // Fetch device metadata & historical telemetry ONLY for selectedId
  useEffect(() => {
    if (!selectedId) return;

    // Immediately wipe stale data from previously selected device
    setDeviceMeta(null);
    setLiveData(null);
    setTelemetryHistory([]);

    let isCurrent = true;
    const checkCurrent = () => isCurrent;

    getDevice(selectedId)
      .then(res => {
        if (!isCurrent) return;
        const dev = res?.device || res;
        if (dev && (dev.id || dev.name)) {
          setDeviceMeta(dev);
          setConfigForm({
            sleep_count: dev.sleep_count !== undefined ? dev.sleep_count : '',
            wake_count: dev.wake_count !== undefined ? dev.wake_count : '',
            calibrate: Boolean(dev.calibrate ?? dev.hasReferenceZero),
            status: dev.status || 'ONLINE',
            gaugeLength_mm: dev.gaugeLength_mm !== undefined ? dev.gaugeLength_mm : 1000,
          });
        }
      })
      .catch(() => { });

    loadHistory(selectedId, null, null, activeFilter, checkCurrent);

    return () => {
      isCurrent = false;
    };
  }, [selectedId]);

  // 1-minute auto-refresh interval: fetch telemetry data and device status from API every 60s
  useEffect(() => {
    if (!selectedId) return;

    const intervalId = setInterval(() => {
      // Re-fetch telemetry history and device metadata every 1 minute
      loadHistory(selectedId, fromDateTime, toDateTime, activeFilter);
      getDevice(selectedId)
        .then(res => {
          const dev = res?.device || res;
          if (dev && (dev.id || dev.name)) {
            setDeviceMeta(dev);
          }
        })
        .catch(() => { });
    }, 60000);

    return () => clearInterval(intervalId);
  }, [selectedId, fromDateTime, toDateTime, activeFilter]);

  const handleDeviceSelect = (newId) => {
    if (newId === selectedId) return;
    setSelectedId(newId);
    setDeviceMeta(null);
    setLiveData(null);
    setTelemetryHistory([]);
    const found = deviceList.find(d => d.id === newId);
    if (found && onSelectDevice) {
      onSelectDevice(found);
    }
  };

  const handleRangeSelect = (presetKey) => {
    setActiveFilter(presetKey);
    loadHistory(selectedId, null, null, presetKey);
  };

  const handleCustomDateSubmit = (e) => {
    e.preventDefault();
    setActiveFilter('custom');
    loadHistory(selectedId, fromDateTime, toDateTime, null);
  };

  const handleOpenConfigModal = () => {
    if (deviceMeta || activeDevice) {
      const dev = deviceMeta || activeDevice;
      setConfigForm({
        sleep_count: dev.sleep_count !== undefined ? dev.sleep_count : '',
        wake_count: dev.wake_count !== undefined ? dev.wake_count : '',
        calibrate: Boolean(dev.calibrate ?? dev.hasReferenceZero),
        status: dev.status || 'ONLINE',
        gaugeLength_mm: dev.gaugeLength_mm !== undefined ? dev.gaugeLength_mm : 1000,
      });
    }
    setConfigModalOpen(true);
  };

  const handleSetReference = async () => {
    try {
      const lastHist = telemetryHistory.length > 0 ? telemetryHistory[telemetryHistory.length - 1] : null;
      const curX = liveData?.xTilt ?? liveData?.roll ?? lastHist?.xTilt ?? parseFloat(activeDevice?.xTilt ?? 0) ?? 0;
      const curY = liveData?.yTilt ?? liveData?.pitch ?? lastHist?.yTilt ?? parseFloat(activeDevice?.yTilt ?? 0) ?? 0;
      const curZ = liveData?.yaw ?? liveData?.zTilt ?? lastHist?.yaw ?? lastHist?.zTilt ?? parseFloat(activeDevice?.zTilt ?? 0) ?? 0;
      const L = parseFloat(configForm.gaugeLength_mm || activeDevice?.gaugeLength_mm || 1000);

      const res = await setDeviceReference(selectedId, {
        refThetaX: curX,
        refThetaY: curY,
        refThetaZ: curZ,
        gaugeLength_mm: L,
        refOperator: 'Commissioning Engineer',
      }).catch(() => null);

      const updatedDevice = res?.device || {
        ...activeDevice,
        refThetaX: curX,
        refThetaY: curY,
        refThetaZ: curZ,
        gaugeLength_mm: L,
        hasReferenceZero: true,
        calibrate: true,
        refTimestamp: new Date().toISOString(),
      };

      setDeviceMeta(updatedDevice);
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

      loadHistory(selectedId, null, null, activeFilter);
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
      const res = await resetDeviceReference(selectedId).catch(() => null);
      const updatedDevice = res?.device || {
        ...activeDevice,
        refThetaX: 0.0,
        refThetaY: 0.0,
        refThetaZ: 0.0,
        hasReferenceZero: false,
        calibrate: false,
        refTimestamp: null,
      };

      setDeviceMeta(updatedDevice);
      loadHistory(selectedId, null, null, activeFilter);
      setMsg({ type: 'success', text: 'Reference Zero reset to factory 0.000°. Tracking absolute tilt.' });
    } catch (err) {
      setMsg({ type: 'error', text: err.message || 'Error resetting reference zero' });
    } finally {
      setTimeout(() => setMsg({ type: '', text: '' }), 4000);
    }
  };

  const handleSaveConfig = async (e) => {
    e.preventDefault();
    const sleepVal = Number(configForm.sleep_count);
    const wakeVal = Number(configForm.wake_count);
    const gaugeVal = parseFloat(configForm.gaugeLength_mm) || 1000;
    if (!sleepVal || sleepVal < 15) {
      setMsg({ type: 'error', text: 'Sleep count must be at least 15 minutes (15M minimum).' });
      return;
    }
    const payload = {
      ...configForm,
      sleep_count: sleepVal,
      wake_count: wakeVal > 0 ? wakeVal : 30,
      gaugeLength_mm: gaugeVal,
      calibrate: Boolean(configForm.calibrate),
      status: configForm.status || 'ONLINE',
    };
    try {
      const res = await configureDeviceTelemetry(selectedId, payload);
      const updatedDev = res?.device || { ...activeDevice, ...payload };
      setMsg({ type: 'success', text: `Configuration deployed to ${selectedId} successfully. Calibrate: ${payload.calibrate ? 'ENABLED' : 'DISABLED'}.` });
      setConfigModalOpen(false);
      setDeviceMeta(prev => ({ ...prev, ...updatedDev, calibrate: payload.calibrate, hasReferenceZero: payload.calibrate }));
      loadHistory(selectedId, null, null, activeFilter);
    } catch (err) {
      setMsg({ type: 'error', text: err.message || 'Error deploying config' });
    } finally {
      setTimeout(() => setMsg({ type: '', text: '' }), 3500);
    }
  };

  const handleExportCSV = () => {
    if (telemetryHistory.length === 0) {
      alert('No telemetry records available to export for the selected date range.');
      return;
    }
    const headers = 'Timestamp_IST,Timestamp_UTC,Device_ID,Tilt_X_deg,Tilt_Y_deg,Tilt_Z_deg,XDisp_mm,YDisp_mm,TotalDisp_mm,AccelMag_g,VibrationRMS_g,VibrationPeak_g,Temperature_C,Stability';
    const rows = telemetryHistory.map(r =>
      `"${formatFullDateTime(r.timestamp || r.time)}",${r.timestamp || ''},${selectedId},${(r.xTilt ?? r.deltaX)?.toFixed(1) ?? ''},${(r.yTilt ?? r.deltaY)?.toFixed(1) ?? ''},${(r.zTilt ?? r.deltaZ)?.toFixed(1) ?? ''},${r.xDisp?.toFixed(1) ?? ''},${r.yDisp?.toFixed(1) ?? ''},${r.totalDisp?.toFixed(1) ?? ''},${r.accMag !== null && r.accMag !== undefined ? Number(r.accMag).toFixed(2) : ''},${r.vibRMS !== null && r.vibRMS !== undefined ? Number(r.vibRMS).toFixed(3) : ''},${r.vibPeak !== null && r.vibPeak !== undefined ? Number(r.vibPeak).toFixed(3) : ''},${r.temp !== null && r.temp !== undefined ? Number(r.temp).toFixed(1) : ''},${r.stability || ''}`
    );
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers, ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `telemetry_${selectedId}_${activeFilter}.csv`);
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
    if (deviceMeta?.latestTelemetry && hasTelemetryData(deviceMeta.latestTelemetry)) {
      return mapPointData(deviceMeta.latestTelemetry);
    }
    if (activeDevice?.latestTelemetry && hasTelemetryData(activeDevice.latestTelemetry)) {
      return mapPointData(activeDevice.latestTelemetry);
    }
    return null;
  }, [liveData, telemetryHistory, deviceMeta, activeDevice]);

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

  const L = parseFloat(activeDevice?.gaugeLength_mm || d.gaugeLength_mm || 1000.0);
  // Stored reference angles: initially 0.0° or calibrated reference if configured later
  const hasRef = Boolean(activeDevice?.hasReferenceZero || activeDevice?.calibrate || d.hasReferenceZero);
  const refX = hasRef ? (parseFloat(activeDevice?.refThetaX ?? d.refThetaX ?? 0.0) || 0.0) : 0.0;
  const refY = hasRef ? (parseFloat(activeDevice?.refThetaY ?? d.refThetaY ?? 0.0) || 0.0) : 0.0;
  const refZ = hasRef ? (parseFloat(activeDevice?.refThetaZ ?? d.refThetaZ ?? 0.0) || 0.0) : 0.0;

  // 3. Delta Values: Current − Reference (Calculated with original numeric full precision)
  // Delta X = Current Roll − Reference Roll
  // Delta Y = Current Pitch − Reference Pitch
  // Delta Z = Current Yaw − Reference Yaw
  const deltaX = hasData && presentX !== null ? (presentX - refX) : null;
  const deltaY = hasData && presentY !== null ? (presentY - refY) : null;
  const deltaZ = hasData && presentZ !== null ? (presentZ - refZ) : null;
  const deltaResultant = hasData && deltaX !== null && deltaY !== null ? Math.sqrt(deltaX * deltaX + deltaY * deltaY) : null;

  const roll = deltaX;
  const pitch = deltaY;
  const zTilt = deltaZ;

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

  const filteredRows = useMemo(() => {
    // Reverse array so newest historical logs appear first at the top of the table
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
          <div className="p-2 rounded-xl border border-slate-200 bg-slate-50 text-blue-600 shadow-2xs">
            <Radio className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-bold text-slate-900 leading-tight">
                {activeDevice?.name || selectedId}
              </h1>

              {/* Device Selector */}
              <select
                id="dashboard-device-select"
                value={selectedId}
                onChange={(e) => handleDeviceSelect(e.target.value)}
                className="px-2.5 py-1 rounded-xl border border-slate-200 bg-white text-slate-900 font-bold text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer shadow-2xs font-mono"
              >
                {deviceList.map(dev => (
                  <option key={dev.id} value={dev.id}>
                    {dev.name || dev.id} ({dev.id})
                  </option>
                ))}
                {deviceList.length === 0 && (
                  <option value="ABCDEF0002">Tilt Meter 002 (ABCDEF0002)</option>
                )}
              </select>

              <Link
                to={`/devices/${selectedId}`}
                className="font-mono text-xs text-blue-600 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded-md border border-blue-100 inline-flex items-center gap-1 transition-colors"
                title="Open Dedicated Device Page"
              >
                <span>{selectedId}</span>
                <ExternalLink className="w-2.5 h-2.5 text-blue-500" />
              </Link>

              <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold text-[10px] inline-flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>{activeDevice?.status || 'ONLINE'}</span>
              </span>

              <span className="flex items-center gap-1 text-[11px] font-mono text-slate-500 bg-slate-50 px-2.5 py-0.5 rounded-md border border-slate-200">
                <Clock className="w-3 h-3 text-slate-400" />
                <span>Last Updated: {d.timestamp ? formatFullDateTime(d.timestamp) : '--'}</span>
              </span>

              {activeDevice?.latitude && activeDevice?.longitude ? (
                <span className="flex items-center gap-1 text-[11px] font-mono text-slate-500 bg-slate-50 px-2.5 py-0.5 rounded-md border border-slate-200">
                  <MapPin className="w-3 h-3 text-blue-500" />
                  <span>{Number(activeDevice.latitude).toFixed(4)}°N, {Number(activeDevice.longitude).toFixed(4)}°E</span>
                </span>
              ) : activeDevice?.structureType && (
                <span className="flex items-center gap-1 text-[11px] font-mono text-slate-500 bg-slate-50 px-2.5 py-0.5 rounded-md border border-slate-200">
                  <Shield className="w-3 h-3 text-blue-500" />
                  <span>{activeDevice.structureType}</span>
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
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 font-medium">
            <Battery className="w-4 h-4 text-emerald-600" />
            <span>
              {formatBatteryPercentage(
                (d.battery && d.battery !== '--' ? d.battery : null) ??
                d.batteryVoltage ??
                (activeDevice?.battery && activeDevice?.battery !== '--' ? activeDevice.battery : null) ??
                activeDevice?.batteryVoltage ??
                '100%'
              )}
            </span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 font-medium">
            <Signal className="w-4 h-4 text-blue-600" />
            <span>
              {formatCSQPercentage(
                (d.signal && d.signal !== '--' ? d.signal : null) ??
                (d.signalStrength && d.signalStrength !== '--' ? d.signalStrength : null) ??
                d.csq ??
                (activeDevice?.signalStrength && activeDevice?.signalStrength !== '--' ? activeDevice.signalStrength : null) ??
                (activeDevice?.signal && activeDevice?.signal !== '--' ? activeDevice.signal : null) ??
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

            {/* 3. DISPLACEMENT IN MM FROM DEVICE TELEMETRY */}
            <div>
              <div className="flex items-center justify-between text-xs font-bold text-slate-900 tracking-wide mb-2.5">
                <div className="flex items-center gap-2">
                  <Move className="w-4 h-4 text-slate-800" />
                  <span>DISPLACEMENT (MM)</span>
                </div>
                <span className="text-[10px] font-mono font-medium text-slate-500">
                  Total: <strong className="text-slate-800">{hasData && typeof totalDisp === 'number' ? `${totalDisp.toFixed(2)} mm` : '--'}</strong>
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2.5 text-center">
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

                {/* DZ */}
                <div className="relative overflow-hidden p-3 rounded-2xl bg-emerald-50/40 border border-emerald-100/80 flex flex-col items-center justify-center min-h-[80px]">
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold text-xs">
                    DZ
                  </span>
                  <div className="flex items-baseline font-mono mt-1">
                    <span className="text-lg sm:text-xl font-extrabold text-emerald-600 tracking-tight">
                      {hasData && typeof zDisp === 'number' ? Number(zDisp).toFixed(2) : '--'}
                    </span>
                    <span className="text-xs font-semibold text-slate-500 ml-1 font-sans">mm</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Ambient Temperature Readout */}
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
                {activeDevice?.sleep_count || 15} Minutes
              </span>
            </div>

            {/* 2. Wake Sampling Duration */}
            <div className="flex items-center justify-between py-2.5">
              <div className="flex items-center gap-3">
                <Layers className="w-5 h-5 text-slate-700 flex-shrink-0" />
                <span className="text-xs sm:text-sm font-semibold text-slate-700">Wake Sampling Duration</span>
              </div>
              <span className="px-3.5 py-1 rounded-xl bg-slate-100/70 border border-slate-200/50 font-bold text-slate-900 text-xs sm:text-sm">
                {activeDevice?.wake_count || 30} Seconds
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
      <TiltmeterChartsRow telemetryHistory={telemetryHistory} loading={loading} currentDevice={activeDevice} />

      {/* Row 3: Dedicated Device Historical Telemetry Data Table */}
      <div className={cardCls}>
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider font-mono text-slate-800">
              HISTORICAL TELEMETRY LOGS • <span className="text-blue-600">{selectedId}</span> ({filteredRows.length} Records)
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

      {/* Row 4: Operational System Status (Alarm Summary & Recent Events) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <AlarmSummaryWidget deviceId={selectedId} />
        <RecentEventsWidget currentDevice={activeDevice} />
      </div>

      {/* Modal: Configure Device */}
      {configModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 font-sans">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Configure Device {selectedId}
                </h3>
                <p className="text-xs text-slate-500 font-medium">Sampling Interval (Min 15M) & Telemetry Parameters</p>
              </div>
              <button onClick={() => setConfigModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer">
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveConfig} className="space-y-4 text-xs">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="font-semibold text-slate-700">
                    Sleep Count (Minutes)
                  </label>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                      Current: {activeDevice?.sleep_count !== undefined ? activeDevice.sleep_count : '-'}M
                    </span>
                    <span className="text-[10px] font-mono text-blue-600 font-semibold bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                      Min 15M
                    </span>
                  </div>
                </div>
                <input
                  type="number"
                  required
                  min="15"
                  max="1440"
                  placeholder="e.g. 15"
                  value={configForm.sleep_count}
                  onChange={e => setConfigForm({ ...configForm, sleep_count: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-mono font-medium focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <p className="text-[10px] text-slate-400 mt-1">Minimum allowed interval is 15 minutes.</p>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block font-semibold text-slate-700">
                    Wake Count (Seconds)
                  </label>
                  <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                    Current: {activeDevice?.wake_count !== undefined ? activeDevice.wake_count : '-'}s
                  </span>
                </div>
                <input
                  type="number"
                  required
                  min="1"
                  max="3600"
                  placeholder="e.g. 30"
                  value={configForm.wake_count}
                  onChange={e => setConfigForm({ ...configForm, wake_count: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-mono font-medium focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Vertical Separation / Gauge Length L (mm) for ClinoX D = L * tan(Δθ) */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block font-semibold text-slate-700">
                    Vertical Distance / Gauge Length L (mm)
                  </label>
                  <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                    Current: {activeDevice?.gaugeLength_mm !== undefined ? activeDevice.gaugeLength_mm : 1000} mm
                  </span>
                </div>
                <input
                  type="number"
                  required
                  min="10"
                  max="100000"
                  placeholder="e.g. 1000"
                  value={configForm.gaugeLength_mm}
                  onChange={e => setConfigForm({ ...configForm, gaugeLength_mm: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-mono font-medium focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Vertical separation from pivot level to measurement point. Used in D = L × tan(Δθ × π / 180).
                </p>
              </div>

              {/* Enable / Disable Zero Calibration Offset */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-900">Calibrate Zero Offset</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {configForm.calibrate
                      ? 'Enabled: Zero offset calibration is applied to telemetry.'
                      : 'Disabled: Standard raw telemetry is reported.'}
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(configForm.calibrate)}
                    onChange={e => setConfigForm({ ...configForm, calibrate: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  <span className="ml-2 text-xs font-bold text-slate-700">
                    {configForm.calibrate ? 'Enabled' : 'Disabled'}
                  </span>
                </label>
              </div>

              {/* Enable / Disable Device Operational State */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-900">Device Operational State</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Enable or disable sensor device telemetry tracking.
                  </div>
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
                    {configForm.status !== 'DISABLED' && configForm.status !== 'OFFLINE' ? 'Enabled' : 'Disabled'}
                  </span>
                </label>
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setConfigModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-xs transition-colors cursor-pointer"
                >
                  Deploy Config
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
