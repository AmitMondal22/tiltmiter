import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Battery, Signal, Sliders, Calendar,
  Download, RefreshCw, Layers, ShieldCheck, Activity,
  CheckCircle2, AlertTriangle, Radio, Clock, MapPin,
  Compass, Zap, Thermometer, Search, Bed, Crosshair, Database, Settings, Move
} from 'lucide-react';
import { getDevice, getDeviceTelemetry, configureDeviceTelemetry, setDeviceReference, resetDeviceReference, getWsUrl } from '../api/apiClient';
import { parseTelemetry, formatBatteryPercentage, formatCSQPercentage } from '../utils/telemetryHelper';
import { telemetryService } from '../services/telemetryManager';
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
  const [configForm, setConfigForm] = useState({ sleep_count: '', wake_count: '', calibrate: false, gaugeLength_mm: 1000 });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });

  // 1. Load individual device metadata using getDevice(deviceId)
  useEffect(() => {
    if (!deviceId) return;
    setLiveData(null); // Clear previous device data immediately
    setTelemetryHistory([]);

    getDevice(deviceId)
      .then(res => {
        const dev = res?.device || res;
        if (dev && (dev.id || dev.name)) {
          setDevice(dev);
          setConfigForm({
            sleep_count: dev.sleep_count !== undefined ? dev.sleep_count : '',
            wake_count: dev.wake_count !== undefined ? dev.wake_count : '',
            calibrate: Boolean(dev.calibrate),
            gaugeLength_mm: dev.gaugeLength_mm !== undefined ? dev.gaugeLength_mm : 1000,
          });
        } else {
          setDevice({ id: deviceId, name: `Tiltmeter ${deviceId}`, status: 'ONLINE' });
        }
      })
      .catch(() => {
        setDevice({ id: deviceId, name: `Tiltmeter ${deviceId}`, status: 'ONLINE' });
      });

    loadHistory(deviceId, null, null, activeFilter);
  }, [deviceId]);

  const mapPointData = (pt) => {
    const ts = pt.timestamp || pt.time;
    const xT = parseFloat(pt.xTilt ?? pt.tiltX ?? pt.roll ?? pt.tilt?.roll ?? 0) || 0;
    const yT = parseFloat(pt.yTilt ?? pt.tiltY ?? pt.pitch ?? pt.tilt?.pitch ?? 0) || 0;
    const rawYaw = pt.yaw ?? pt.tilt?.yaw ?? pt.zTilt ?? pt.tiltZ;
    const zT = (rawYaw !== undefined && rawYaw !== null && !isNaN(parseFloat(rawYaw))) ? parseFloat(rawYaw) : 0.0;
    const rawRes = pt.resultant ?? pt.resultantTilt ?? pt.tilt ?? pt.tilt?.tilt;
    const resT = typeof rawRes === 'number' && !isNaN(rawRes) ? rawRes : Math.sqrt(xT * xT + yT * yT);

    // ClinoX Reference-Zero Delta and Lateral Displacement: D = L * tan(Δθ * π / 180)
    const L = parseFloat(device?.gaugeLength_mm || 1000.0);
    const refX = parseFloat(device?.refThetaX ?? 0.0);
    const refY = parseFloat(device?.refThetaY ?? 0.0);
    const refZ = parseFloat(device?.refThetaZ ?? 0.0);
    // hasRef is only true when hasReferenceZero was explicitly set by operator
    const hasRef = Boolean(device?.hasReferenceZero === true || (device?.calibrate === true && (refX !== 0 || refY !== 0)));

    const deltaX = hasRef ? xT - refX : (pt.deltaThetaX !== undefined ? pt.deltaThetaX : xT);
    const deltaY = hasRef ? yT - refY : (pt.deltaThetaY !== undefined ? pt.deltaThetaY : yT);
    const deltaZ = hasRef ? zT - refZ : (pt.deltaThetaZ !== undefined ? pt.deltaThetaZ : zT);

    const radX = (deltaX * Math.PI) / 180.0;
    const radY = (deltaY * Math.PI) / 180.0;
    const clinoDx = L * Math.tan(radX);
    const clinoDy = L * Math.tan(radY);

    const xD = hasRef ? clinoDx : ((pt.xDisp !== undefined && pt.xDisp !== null) ? parseFloat(pt.xDisp) : clinoDx);
    const yD = hasRef ? clinoDy : ((pt.yDisp !== undefined && pt.yDisp !== null) ? parseFloat(pt.yDisp) : clinoDy);
    const zD = parseFloat(pt.zDisp ?? pt.zDisplacement ?? 0) || 0;
    const totD = hasRef ? Math.sqrt(clinoDx * clinoDx + clinoDy * clinoDy) : ((pt.totalDisp !== undefined && pt.totalDisp !== null) ? parseFloat(pt.totalDisp) : Math.sqrt(xD * xD + yD * yD));
    const activeResT = hasRef ? Math.sqrt(deltaX * deltaX + deltaY * deltaY) : resT;

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

    // Stability classification
    const vibForStability = vibR ?? 0;
    let stability = 'Stable';
    let stabilityClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (Math.abs(activeResT) >= 2.0 || Math.abs(totD) >= 10.0 || vibForStability >= 0.5) {
      stability = 'Critical';
      stabilityClass = 'bg-red-50 text-red-700 border-red-200';
    } else if (Math.abs(activeResT) >= 1.0 || Math.abs(totD) >= 5.0 || vibForStability >= 0.2) {
      stability = 'Warning';
      stabilityClass = 'bg-amber-50 text-amber-700 border-amber-200';
    }

    return {
      time: formatHHMM(ts),
      fullTime: formatFullDateTime(ts),
      timestamp: ts,
      resultant: Number(activeResT.toFixed(1)),
      xTilt: Number(deltaX.toFixed(1)),
      yTilt: Number(deltaY.toFixed(1)),
      zTilt: Number(deltaZ.toFixed(1)),
      deltaThetaX: Number(deltaX.toFixed(1)),
      deltaThetaY: Number(deltaY.toFixed(1)),
      totalDisp: Number(totD.toFixed(1)),
      xDisp: Number(xD.toFixed(1)),
      yDisp: Number(yD.toFixed(1)),
      zDisp: Number(zD.toFixed(1)),
      axG: axG !== null && !isNaN(axG) ? Number(axG.toFixed(1)) : null,
      ayG: ayG !== null && !isNaN(ayG) ? Number(ayG.toFixed(1)) : null,
      azG: azG !== null && !isNaN(azG) ? Number(azG.toFixed(1)) : null,
      accMag: accM !== null && !isNaN(accM) ? Number(accM.toFixed(1)) : null,
      vibRMS: vibR !== null && !isNaN(vibR) ? Number(vibR.toFixed(1)) : null,
      vibPeak: vibP !== null && !isNaN(vibP) ? Number(vibP.toFixed(1)) : null,
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

  const loadHistory = (id, fromDt = null, toDt = null, rangeKey = activeFilter) => {
    if (!id) return;
    setLoading(true);

    const utcFrom = fromDt ? istDatetimeToUTC(fromDt) : null;
    const utcTo = toDt ? istDatetimeToUTC(toDt) : null;

    getDeviceTelemetry(id, utcFrom, utcTo, rangeKey)
      .then(res => {
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
          if (lastPoint) {
            setLiveData(parseTelemetry(lastPoint));
          }
        } else {
          setTelemetryHistory([]);
          setLiveData(null);
        }
      })
      .catch(() => {
        setTelemetryHistory([]);
        setLiveData(null);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  // 2. Subscribe to centralized telemetry stream for live hardware updates
  useEffect(() => {
    const unsubscribe = telemetryService.subscribe((packet) => {
      if (!packet) return;
      const pktId = (packet.deviceId || packet.id || packet.device_id || '').toString().trim().toLowerCase();
      const curId = (deviceId || '').toString().trim().toLowerCase();
      // STRICT FILTER: Only accept packets that strictly belong to this device!
      if (pktId && curId && pktId === curId) {
        const parsed = parseTelemetry(packet);
        setLiveData(parsed);
        const newPoint = mapPointData(parsed);

        setTelemetryHistory(prev => {
          if (prev.some(p => p.timestamp === newPoint.timestamp)) {
            return prev;
          }
          return [...prev, newPoint].slice(-200);
        });
      }
    }, deviceId);

    return () => {
      unsubscribe();
    };
  }, [deviceId]);

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
      setConfigForm({
        sleep_count: device.sleep_count !== undefined ? device.sleep_count : '',
        wake_count: device.wake_count !== undefined ? device.wake_count : '',
        calibrate: Boolean(device.calibrate ?? device.hasReferenceZero),
        status: device.status || 'ONLINE',
        gaugeLength_mm: device.gaugeLength_mm !== undefined ? device.gaugeLength_mm : 1000,
      });
    }
    setConfigModalOpen(true);
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
      // Immediately zero tilt change and lateral displacement at that instant (ClinoX Step 04)
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
      const res = await configureDeviceTelemetry(deviceId, payload);
      const updatedDev = res?.device || { ...device, ...payload };
      setMsg({ type: 'success', text: `Configuration deployed to ${deviceId} successfully. Calibrate: ${payload.calibrate ? 'ENABLED' : 'DISABLED'}.` });
      setConfigModalOpen(false);
      setDevice(prev => ({ ...prev, ...updatedDev, calibrate: payload.calibrate, hasReferenceZero: payload.calibrate }));
      loadHistory(deviceId, null, null, activeFilter);
    } catch (err) {
      setMsg({ type: 'error', text: err.message || 'Error deploying config' });
    } finally {
      setTimeout(() => setMsg({ type: '', text: '' }), 3500);
    }
  };

  // Export Table Data to CSV
  const handleExportCSV = () => {
    if (telemetryHistory.length === 0) {
      alert('No telemetry records available to export for the selected date range.');
      return;
    }
    const headers = 'Timestamp_IST,Timestamp_UTC,Device_ID,XTilt_deg,YTilt_deg,ZTilt_deg,ResultantTilt_deg,XDisp_mm,YDisp_mm,ZDisp_mm,TotalDisp_mm,AccelMag_g,VibrationRMS_g,VibrationPeak_g,Temperature_C,Stability';
    const rows = telemetryHistory.map(r =>
      `"${formatFullDateTime(r.timestamp || r.time)}",${r.timestamp || ''},${deviceId},${r.xTilt?.toFixed(4) ?? ''},${r.yTilt?.toFixed(4) ?? ''},${r.zTilt?.toFixed(4) ?? ''},${r.resultant?.toFixed(4) ?? ''},${r.xDisp?.toFixed(3) ?? ''},${r.yDisp?.toFixed(3) ?? ''},${r.zDisp?.toFixed(3) ?? ''},${r.totalDisp?.toFixed(3) ?? ''},${r.accMag !== null && r.accMag !== undefined ? Number(r.accMag).toFixed(3) : ''},${r.vibRMS !== null && r.vibRMS !== undefined ? Number(r.vibRMS).toFixed(4) : ''},${r.vibPeak !== null && r.vibPeak !== undefined ? Number(r.vibPeak).toFixed(4) : ''},${r.temp !== null && r.temp !== undefined ? Number(r.temp).toFixed(1) : ''},${r.stability || ''}`
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

  const hasData = Boolean(liveData);
  const d = liveData || parseTelemetry({ id: deviceId });
  const rawRoll = typeof d.xTilt === 'number' ? d.xTilt : (parseFloat(d.tilt?.roll ?? d.roll) || 0);
  const rawPitch = typeof d.yTilt === 'number' ? d.yTilt : (parseFloat(d.tilt?.pitch ?? d.pitch) || 0);
  const rawRes = typeof d.resultantTilt === 'number' ? d.resultantTilt : Math.sqrt(rawRoll * rawRoll + rawPitch * rawPitch);
  const rawYaw = d.yaw ?? d.tilt?.yaw ?? d.zTilt ?? d.tiltZ;
  const rawZTilt = (rawYaw !== undefined && rawYaw !== null && !isNaN(parseFloat(rawYaw))) ? parseFloat(rawYaw) : 0.0;

  const L = parseFloat(device?.gaugeLength_mm || d.gaugeLength_mm || 1000.0);
  const refX = parseFloat(device?.refThetaX ?? d.refThetaX ?? 0.0);
  const refY = parseFloat(device?.refThetaY ?? d.refThetaY ?? 0.0);
  const refZ = parseFloat(device?.refThetaZ ?? d.refThetaZ ?? 0.0);
  // hasRef is only true when reference zero was explicitly configured by operator
  const hasRef = Boolean(
    device?.hasReferenceZero === true ||
    (device?.calibrate === true && (refX !== 0 || refY !== 0)) ||
    d.hasReferenceZero === true
  );

  // ClinoX: ΔθX = θX,current − θX,reference; ΔθY = θY,current − θY,reference
  const roll = hasRef ? rawRoll - refX : (d.deltaThetaX !== undefined ? d.deltaThetaX : rawRoll);
  const pitch = hasRef ? rawPitch - refY : (d.deltaThetaY !== undefined ? d.deltaThetaY : rawPitch);
  const zTilt = hasRef ? rawZTilt - refZ : rawZTilt;
  const yaw = zTilt;
  const resultant = Math.sqrt(roll * roll + pitch * pitch);

  const xSlope = Math.sin((roll * Math.PI) / 180) * 1000;
  const ySlope = Math.sin((pitch * Math.PI) / 180) * 1000;
  const zSlope = Math.sin((zTilt * Math.PI) / 180) * 1000;

  // ClinoX Primary conversion formula: D = L * tan(Δθ * π / 180)
  const radX = (roll * Math.PI) / 180.0;
  const radY = (pitch * Math.PI) / 180.0;
  const clinoDx = L * Math.tan(radX);
  const clinoDy = L * Math.tan(radY);

  const xDisp = hasRef ? clinoDx : (typeof d.xDisplacement === 'number' ? d.xDisplacement : clinoDx);
  const yDisp = hasRef ? clinoDy : (typeof d.yDisplacement === 'number' ? d.yDisplacement : clinoDy);
  const zDisp = typeof d.zDisplacement === 'number' ? d.zDisplacement : (d.displacement?.zDisplacement_mm ?? 0);
  const totalDisp = Math.sqrt(xDisp * xDisp + yDisp * yDisp);

  // Compute Total Displacement Vector Angle & Cardinal Bearing
  let dispAngleRad = Math.atan2(yDisp, xDisp);
  let dispAngleDeg = (dispAngleRad * 180) / Math.PI;
  if (dispAngleDeg < 0) dispAngleDeg += 360;
  const cardinals = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const dispCardinal = cardinals[Math.round(dispAngleDeg / 45) % 8];

  // Filtered rows for the table
  const filteredRows = useMemo(() => {
    if (!tableSearch) return telemetryHistory;
    const q = tableSearch.toLowerCase();
    return telemetryHistory.filter(r =>
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
                <span>Last Updated: {d.timestamp ? formatFullDateTime(d.timestamp) : '--'}</span>
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
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-600 text-white font-semibold text-xs shadow-xs">
              <Radio className="w-3.5 h-3.5 animate-pulse" />
              <span>LIVE STREAM</span>
            </div>
          </div>

          <div className="space-y-4">
            {/* 1. Tilt Change per Axis X, Y, Z */}
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-slate-900 tracking-wide mb-2.5">
                <Layers className="w-4 h-4 text-slate-800" />
                <span>TILT CHANGE (°)</span>
              </div>

              <div className="grid grid-cols-3 gap-3 text-center">
                {/* ΔθX */}
                <div className="relative overflow-hidden p-3.5 rounded-2xl bg-blue-50/40 border border-blue-100/80 flex flex-col items-center justify-center">
                  <span className="px-3.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-bold text-xs tracking-tight">
                    ΔθX
                  </span>
                  <div className="text-xl sm:text-2xl font-bold text-blue-600 mt-2 font-mono tracking-tight">
                    {hasData ? `${roll >= 0 ? '+' : ''}${roll.toFixed(1)}°` : '--'}
                  </div>
                  <div className="text-xs text-slate-500 font-medium mt-1 font-mono">
                    {hasData ? `${xSlope >= 0 ? '+' : ''}${xSlope.toFixed(1)} mm/m` : '--'}
                  </div>
                  {/* Soft bottom-right corner wave */}
                  <div className="absolute bottom-0 right-0 pointer-events-none opacity-45">
                    <svg className="w-20 h-10" viewBox="0 0 100 50" preserveAspectRatio="none">
                      <path d="M0,50 Q40,15 100,20 L100,50 Z" fill="#93c5fd" />
                    </svg>
                  </div>
                </div>

                {/* ΔθY */}
                <div className="relative overflow-hidden p-3.5 rounded-2xl bg-purple-50/40 border border-purple-100/80 flex flex-col items-center justify-center">
                  <span className="px-3.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-bold text-xs tracking-tight">
                    ΔθY
                  </span>
                  <div className="text-xl sm:text-2xl font-bold text-purple-700 mt-2 font-mono tracking-tight">
                    {hasData ? `${pitch >= 0 ? '+' : ''}${pitch.toFixed(1)}°` : '--'}
                  </div>
                  <div className="text-xs text-slate-500 font-medium mt-1 font-mono">
                    {hasData ? `${ySlope >= 0 ? '+' : ''}${ySlope.toFixed(1)} mm/m` : '--'}
                  </div>
                  {/* Soft bottom-right corner wave */}
                  <div className="absolute bottom-0 right-0 pointer-events-none opacity-45">
                    <svg className="w-20 h-10" viewBox="0 0 100 50" preserveAspectRatio="none">
                      <path d="M0,50 Q40,15 100,20 L100,50 Z" fill="#d8b4fe" />
                    </svg>
                  </div>
                </div>

                {/* ΔθZ */}
                <div className="relative overflow-hidden p-3.5 rounded-2xl bg-emerald-50/40 border border-emerald-100/80 flex flex-col items-center justify-center">
                  <span className="px-3.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold text-xs tracking-tight">
                    ΔθZ
                  </span>
                  <div className="text-xl sm:text-2xl font-bold text-emerald-600 mt-2 font-mono tracking-tight">
                    {hasData ? `${zTilt >= 0 ? '+' : ''}${zTilt.toFixed(1)}°` : '--'}
                  </div>
                  <div className="text-xs text-slate-500 font-medium mt-1 font-mono">
                    {hasData ? `${zSlope >= 0 ? '+' : ''}${zSlope.toFixed(1)} mm/m` : '--'}
                  </div>
                  {/* Soft bottom-right corner wave */}
                  <div className="absolute bottom-0 right-0 pointer-events-none opacity-45">
                    <svg className="w-20 h-10" viewBox="0 0 100 50" preserveAspectRatio="none">
                      <path d="M0,50 Q40,15 100,20 L100,50 Z" fill="#86efac" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Estimated Lateral Displacement in MM */}
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-slate-900 tracking-wide mb-2.5">
                <Move className="w-4 h-4 text-slate-800" />
                <span>DISPLACEMENT (MM)</span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* DX */}
                <div className="relative overflow-hidden p-4 rounded-2xl bg-blue-50/40 border border-blue-100/80 flex items-center justify-center min-h-[94px]">
                  <span className="absolute top-3 left-3.5 px-3 py-0.5 rounded-full bg-blue-100 text-blue-700 font-bold text-xs">
                    DX
                  </span>
                  <div className="flex items-baseline font-mono mt-1">
                    <span className="text-2xl sm:text-3xl font-extrabold text-blue-600 tracking-tight">
                      {hasData ? `${xDisp >= 0 ? '+' : ''}${xDisp.toFixed(1)}` : '--'}
                    </span>
                    <span className="text-sm font-semibold text-slate-500 ml-1.5 font-sans">mm</span>
                  </div>
                  {/* Subtle soft bottom-right wave */}
                  <div className="absolute bottom-0 right-0 pointer-events-none opacity-45">
                    <svg className="w-24 h-12" viewBox="0 0 100 50" preserveAspectRatio="none">
                      <path d="M0,50 Q40,15 100,20 L100,50 Z" fill="#93c5fd" />
                    </svg>
                  </div>
                </div>

                {/* DY */}
                <div className="relative overflow-hidden p-4 rounded-2xl bg-amber-50/40 border border-amber-100/80 flex items-center justify-center min-h-[94px]">
                  <span className="absolute top-3 left-3.5 px-3 py-0.5 rounded-full bg-amber-100 text-amber-700 font-bold text-xs">
                    DY
                  </span>
                  <div className="flex items-baseline font-mono mt-1">
                    <span className="text-2xl sm:text-3xl font-extrabold text-amber-600 tracking-tight">
                      {hasData ? `${yDisp >= 0 ? '+' : ''}${yDisp.toFixed(1)}` : '--'}
                    </span>
                    <span className="text-sm font-semibold text-slate-500 ml-1.5 font-sans">mm</span>
                  </div>
                  {/* Subtle soft bottom-right wave */}
                  <div className="absolute bottom-0 right-0 pointer-events-none opacity-45">
                    <svg className="w-24 h-12" viewBox="0 0 100 50" preserveAspectRatio="none">
                      <path d="M0,50 Q40,15 100,20 L100,50 Z" fill="#fcd34d" />
                    </svg>
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
                  : (device?.temperature ? `${device.temperature} °C` : '33.2 °C')}
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
                {d.temp !== null && d.temp !== undefined ? `${Number(d.temp).toFixed(1)} °C` : (device?.temperature ? `${device.temperature} °C` : '--')}
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
              <Radio className="w-3 h-3 animate-pulse" />
              <span>LIVE SYNC</span>
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
                <th className="py-2.5 px-3 text-blue-700">X Tilt (°)</th>
                <th className="py-2.5 px-3 text-purple-700">Y Tilt (°)</th>
                <th className="py-2.5 px-3 text-emerald-700">Z Tilt (°)</th>
                <th className="py-2.5 px-3 text-purple-900">Resultant (°)</th>
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
                  <td colSpan={11} className="py-8 text-center text-slate-400 text-xs font-mono">
                    {loading ? 'Fetching telemetry logs for this device...' : 'No telemetry records found for this period.'}
                  </td>
                </tr>
              ) : (
                paginatedRows.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2 px-3 text-slate-600 font-medium font-sans">
                      {r.fullTime || r.time}
                    </td>
                    <td className="py-2 px-3 text-blue-700 font-semibold">
                      {r.xTilt >= 0 ? '+' : ''}{r.xTilt.toFixed(1)}°
                    </td>
                    <td className="py-2 px-3 text-purple-700 font-semibold">
                      {r.yTilt >= 0 ? '+' : ''}{r.yTilt.toFixed(1)}°
                    </td>
                    <td className="py-2 px-3 text-emerald-700 font-semibold">
                      {r.zTilt >= 0 ? '+' : ''}{r.zTilt.toFixed(1)}°
                    </td>
                    <td className="py-2 px-3 text-purple-900 font-bold">
                      {r.resultant.toFixed(1)}°
                    </td>
                    <td className="py-2 px-3 text-cyan-700 font-semibold">
                      {r.xDisp >= 0 ? '+' : ''}{r.xDisp.toFixed(1)} mm
                    </td>
                    <td className="py-2 px-3 text-amber-700 font-semibold">
                      {r.yDisp >= 0 ? '+' : ''}{r.yDisp.toFixed(1)} mm
                    </td>
                    <td className="py-2 px-3 text-pink-700 font-bold">
                      {r.totalDisp.toFixed(1)} mm
                    </td>
                    <td className="py-2 px-3 text-amber-800">
                      {r.vibPeak !== null && r.vibPeak !== undefined ? `${Number(r.vibPeak).toFixed(1)} g` : '--'}
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

      {/* Modal: Configure Device */}
      {configModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 font-sans">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Configure Device {deviceId}
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
                      Current: {device?.sleep_count !== undefined ? device.sleep_count : '-'}M
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
                    Current: {device?.wake_count !== undefined ? device.wake_count : '-'}s
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
                    Current: {device?.gaugeLength_mm !== undefined ? device.gaugeLength_mm : 1000} mm
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
