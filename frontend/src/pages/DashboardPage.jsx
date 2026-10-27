import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Shield, Battery, Signal, Sliders, Calendar,
  Download, RefreshCw, Layers, ShieldCheck, Activity,
  CheckCircle2, AlertTriangle, Radio, Clock, MapPin,
  Compass, Zap, Thermometer, Search, ExternalLink, Sun, Target,
  Bed, Crosshair, Database, Settings
} from 'lucide-react';
import { getDevice, getDevices, getDeviceTelemetry, configureDeviceTelemetry, setDeviceReference, resetDeviceReference } from '../api/apiClient';
import { parseTelemetry } from '../utils/telemetryHelper';
import { telemetryService } from '../services/telemetryManager';
import { formatISTDatetimeLocal, istDatetimeToUTC, formatFullDateTime, formatTimeString, formatHHMM } from '../utils/dateHelper';
import TiltmeterChartsRow from '../components/TiltmeterChartsRow';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import AlarmSummaryWidget from '../components/AlarmSummaryWidget';
import RecentEventsWidget from '../components/RecentEventsWidget';

export default function DashboardPage({ devices = [], currentDevice, onSelectDevice }) {
  const navigate = useNavigate();
  const cardCls = 'rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs text-slate-800';

  const [deviceList, setDeviceList] = useState(devices);
  const [selectedId, setSelectedId] = useState(currentDevice?.id || devices[0]?.id || 'ABCDEF0002');
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

  // Sync devices prop or fetch if empty
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
        .catch(() => {});
    }
  }, [devices]);

  // When currentDevice prop changes from parent
  useEffect(() => {
    if (currentDevice?.id && currentDevice.id !== selectedId) {
      setSelectedId(currentDevice.id);
    }
  }, [currentDevice]);

  // Active selected device object
  const activeDevice = useMemo(() => {
    const found = deviceList.find(d => d.id?.toLowerCase() === selectedId?.toLowerCase());
    return found || deviceMeta || currentDevice || {
      id: selectedId || 'ABCDEF0002',
      name: `Tiltmeter ${selectedId || 'ABCDEF0002'}`,
      status: 'ONLINE',
      battery: null,
      signalStrength: null
    };
  }, [deviceList, selectedId, deviceMeta, currentDevice]);

  // Map individual history point into structured format
  const mapPointData = (pt) => {
    const ts = pt.timestamp || pt.time;
    const xT = parseFloat(pt.xTilt ?? pt.tiltX ?? pt.roll ?? 0) || 0;
    const yT = parseFloat(pt.yTilt ?? pt.tiltY ?? pt.pitch ?? 0) || 0;
    const rawRes = pt.resultant ?? pt.resultantTilt ?? pt.tilt;
    const resT = typeof rawRes === 'number' && !isNaN(rawRes) ? rawRes : Math.sqrt(xT * xT + yT * yT);

    // ClinoX Reference-Zero Delta and Lateral Displacement: D = L * tan(Δθ * π / 180)
    const L = parseFloat(activeDevice?.gaugeLength_mm || 1000.0);
    const refX = parseFloat(activeDevice?.refThetaX ?? 0.0);
    const refY = parseFloat(activeDevice?.refThetaY ?? 0.0);
    const refZ = parseFloat(activeDevice?.refThetaZ ?? 0.0);
    // hasRef is only true when hasReferenceZero was explicitly set (not just calibrate=false default)
    const hasRef = Boolean(activeDevice?.hasReferenceZero === true || (activeDevice?.calibrate === true && (refX !== 0 || refY !== 0)));

    const deltaX = hasRef ? xT - refX : (pt.deltaThetaX !== undefined ? pt.deltaThetaX : xT);
    const deltaY = hasRef ? yT - refY : (pt.deltaThetaY !== undefined ? pt.deltaThetaY : yT);
    const deltaZ = hasRef ? ((parseFloat(pt.zTilt ?? pt.tiltZ) || resT) - refZ) : (parseFloat(pt.zTilt ?? pt.tiltZ) || resT);

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
      resultant: Number(activeResT.toFixed(4)),
      xTilt: Number(deltaX.toFixed(4)),
      yTilt: Number(deltaY.toFixed(4)),
      zTilt: Number(deltaZ.toFixed(4)),
      totalDisp: Number(totD.toFixed(3)),
      xDisp: Number(xD.toFixed(3)),
      yDisp: Number(yD.toFixed(3)),
      zDisp: Number(zD.toFixed(3)),
      axG: axG !== null && !isNaN(axG) ? Number(axG.toFixed(3)) : null,
      ayG: ayG !== null && !isNaN(ayG) ? Number(ayG.toFixed(3)) : null,
      azG: azG !== null && !isNaN(azG) ? Number(azG.toFixed(3)) : null,
      accMag: accM !== null && !isNaN(accM) ? Number(accM.toFixed(3)) : null,
      vibRMS: vibR !== null && !isNaN(vibR) ? Number(vibR.toFixed(4)) : null,
      vibPeak: vibP !== null && !isNaN(vibP) ? Number(vibP.toFixed(4)) : null,
      temp: tempC !== null && !isNaN(tempC) ? Number(tempC.toFixed(1)) : null,
      stability,
      stabilityClass,
    };
  };

  // Load telemetry history whenever device or date filter changes
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
          } else {
            setLiveData(null);
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

  // Fetch device metadata on selectedId change
  useEffect(() => {
    if (!selectedId) return;

    getDevice(selectedId)
      .then(res => {
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
      .catch(() => {});

    loadHistory(selectedId, null, null, activeFilter);
  }, [selectedId]);

  // Subscribe to centralized live telemetry stream
  useEffect(() => {
    if (!selectedId) return;

    const unsubscribe = telemetryService.subscribe((packet) => {
      if (!packet) return;
      const pktId = (packet.deviceId || packet.id || packet.device_id || '').toString().trim().toLowerCase();
      const curId = (selectedId || '').toString().trim().toLowerCase();
      // STRICT FILTER: Only accept packets that strictly belong to this selected device!
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
    }, selectedId);

    return () => {
      unsubscribe();
    };
  }, [selectedId]);

  const handleDeviceSelect = (newId) => {
    setSelectedId(newId);
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
      const curZ = liveData?.zTilt ?? lastHist?.zTilt ?? parseFloat(activeDevice?.zTilt ?? 0) ?? 0;
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
        text: `Zero reference baseline saved: θX₀=${curX.toFixed(3)}°, θY₀=${curY.toFixed(3)}° (L=${L}mm). At instant: ΔθX=ΔθY=0° and DX=DY=0.000mm.`,
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
    const headers = 'Timestamp_IST,Timestamp_UTC,Device_ID,XTilt_deg,YTilt_deg,ZTilt_deg,ResultantTilt_deg,XDisp_mm,YDisp_mm,ZDisp_mm,TotalDisp_mm,AccelMag_g,VibrationRMS_g,VibrationPeak_g,Temperature_C,Stability';
    const rows = telemetryHistory.map(r =>
      `"${formatFullDateTime(r.timestamp || r.time)}",${r.timestamp || ''},${selectedId},${r.xTilt?.toFixed(4) ?? ''},${r.yTilt?.toFixed(4) ?? ''},${r.zTilt?.toFixed(4) ?? ''},${r.resultant?.toFixed(4) ?? ''},${r.xDisp?.toFixed(3) ?? ''},${r.yDisp?.toFixed(3) ?? ''},${r.zDisp?.toFixed(3) ?? ''},${r.totalDisp?.toFixed(3) ?? ''},${r.accMag !== null && r.accMag !== undefined ? Number(r.accMag).toFixed(3) : ''},${r.vibRMS !== null && r.vibRMS !== undefined ? Number(r.vibRMS).toFixed(4) : ''},${r.vibPeak !== null && r.vibPeak !== undefined ? Number(r.vibPeak).toFixed(4) : ''},${r.temp !== null && r.temp !== undefined ? Number(r.temp).toFixed(1) : ''},${r.stability || ''}`
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

  const hasData = Boolean(liveData);
  const d = liveData || parseTelemetry(activeDevice || { id: selectedId });
  const rawRoll = typeof d.xTilt === 'number' ? d.xTilt : 0;
  const rawPitch = typeof d.yTilt === 'number' ? d.yTilt : 0;
  const rawRes = typeof d.resultantTilt === 'number' ? d.resultantTilt : Math.sqrt(rawRoll * rawRoll + rawPitch * rawPitch);
  const rawZTilt = typeof d.zTilt === 'number' ? d.zTilt : rawRes;

  const L = parseFloat(activeDevice?.gaugeLength_mm || d.gaugeLength_mm || 1000.0);
  const refX = parseFloat(activeDevice?.refThetaX ?? d.refThetaX ?? 0.0);
  const refY = parseFloat(activeDevice?.refThetaY ?? d.refThetaY ?? 0.0);
  const refZ = parseFloat(activeDevice?.refThetaZ ?? d.refThetaZ ?? 0.0);
  // hasRef is only true when reference zero was explicitly configured by operator
  const hasRef = Boolean(
    activeDevice?.hasReferenceZero === true ||
    (activeDevice?.calibrate === true && (refX !== 0 || refY !== 0)) ||
    d.hasReferenceZero === true
  );

  // ClinoX: ΔθX = θX,current − θX,reference; ΔθY = θY,current − θY,reference
  const roll = hasRef ? rawRoll - refX : (d.deltaThetaX !== undefined ? d.deltaThetaX : rawRoll);
  const pitch = hasRef ? rawPitch - refY : (d.deltaThetaY !== undefined ? d.deltaThetaY : rawPitch);
  const zTilt = hasRef ? rawZTilt - refZ : rawZTilt;
  const resultant = Math.sqrt(roll * roll + pitch * pitch);

  const xSlope = typeof d.xSlope === 'number' ? d.xSlope : Math.sin((roll * Math.PI) / 180) * 1000;
  const ySlope = typeof d.ySlope === 'number' ? d.ySlope : Math.sin((pitch * Math.PI) / 180) * 1000;
  const zSlope = typeof d.zSlope === 'number' ? d.zSlope : Math.sin((zTilt * Math.PI) / 180) * 1000;

  // ClinoX Primary conversion formula: D = L * tan(Δθ * π / 180)
  const radX = (roll * Math.PI) / 180.0;
  const radY = (pitch * Math.PI) / 180.0;
  const clinoDx = L * Math.tan(radX);
  const clinoDy = L * Math.tan(radY);

  const xDisp = hasRef ? clinoDx : (typeof d.xDisplacement === 'number' ? d.xDisplacement : clinoDx);
  const yDisp = hasRef ? clinoDy : (typeof d.yDisplacement === 'number' ? d.yDisplacement : clinoDy);
  const zDisp = typeof d.zDisplacement === 'number' ? d.zDisplacement : (d.displacement?.zDisplacement_mm ?? 0);
  const totalDisp = Math.sqrt(xDisp * xDisp + yDisp * yDisp);

  let dispAngleRad = Math.atan2(yDisp, xDisp);
  let dispAngleDeg = (dispAngleRad * 180) / Math.PI;
  if (dispAngleDeg < 0) dispAngleDeg += 360;
  const cardinals = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const dispCardinal = cardinals[Math.round(dispAngleDeg / 45) % 8];

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
        <div className={`p-3 rounded-xl border flex items-center gap-2 text-xs font-semibold shadow-2xs ${
          msg.type === 'error' ? 'bg-red-50 border-red-200 text-red-800' : 'bg-emerald-50 border-emerald-200 text-emerald-800'
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
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 font-medium">
            <Battery className="w-4 h-4 text-emerald-600" />
            <span>{d.battery || activeDevice?.battery || '--'}</span>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 font-medium">
            <Signal className="w-4 h-4 text-blue-600" />
            <span>{d.signalStrength || d.signal || activeDevice?.signalStrength || '--'}</span>
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
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                  activeFilter === b.id
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
        {/* 1. Live Primary Inclinometer & Vector Metrics Readout */}
        <div className={cardCls}>
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider font-mono text-slate-700">
              LIVE INCLINOMETER &amp; DISPLACEMENT
            </span>
            <div className="flex items-center gap-1 text-[10px] font-mono text-blue-600 font-semibold">
              <Radio className="w-3 h-3 animate-pulse" />
              <span>LIVE STREAM</span>
            </div>
          </div>

          {/* 1. Tilt Change per Axis X, Y, Z (ClinoX recommended label) */}
          <div className="mb-3">
            <div className="flex items-center justify-between text-[10px] font-mono font-bold text-slate-600 uppercase tracking-wider mb-1.5">
              <span>TILT CHANGE (°)</span>
              <span className="text-purple-600 font-semibold text-[9px] bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">
                {hasRef ? 'Δθ RELATIVE TO ZERO REF' : 'Δθ FROM 0.000°'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center font-mono">
              <div className="p-2 rounded-xl bg-blue-50/60 border border-blue-100">
                <div className="text-[9px] text-blue-700 uppercase font-bold">ΔθX</div>
                <div className="text-base font-bold text-blue-700 mt-0.5">{hasData ? `${roll >= 0 ? '+' : ''}${roll.toFixed(3)}°` : '--'}</div>
                <div className="text-[9px] text-slate-500 mt-0.5 font-medium">
                  {hasData ? `${xSlope >= 0 ? '+' : ''}${xSlope.toFixed(2)} mm/m` : '--'}
                </div>
              </div>

              <div className="p-2 rounded-xl bg-purple-50/60 border border-purple-100">
                <div className="text-[9px] text-purple-700 uppercase font-bold">ΔθY</div>
                <div className="text-base font-bold text-purple-700 mt-0.5">{hasData ? `${pitch >= 0 ? '+' : ''}${pitch.toFixed(3)}°` : '--'}</div>
                <div className="text-[9px] text-slate-500 mt-0.5 font-medium">
                  {hasData ? `${ySlope >= 0 ? '+' : ''}${ySlope.toFixed(2)} mm/m` : '--'}
                </div>
              </div>

              <div className="p-2 rounded-xl bg-emerald-50/60 border border-emerald-100">
                <div className="text-[9px] text-emerald-700 uppercase font-bold">ΔθZ</div>
                <div className="text-base font-bold text-emerald-700 mt-0.5">{hasData ? `${zTilt >= 0 ? '+' : ''}${zTilt.toFixed(3)}°` : '--'}</div>
                <div className="text-[9px] text-slate-500 mt-0.5 font-medium">
                  {hasData ? `${zSlope >= 0 ? '+' : ''}${zSlope.toFixed(2)} mm/m` : '--'}
                </div>
              </div>
            </div>
          </div>

          {/* 2. Estimated Lateral Displacement in MM */}
          <div className="pt-2.5 border-t border-slate-100">
            <div className="flex items-center justify-between text-[10px] font-mono font-bold text-slate-600 uppercase tracking-wider mb-1.5">
              <span>ESTIMATED LATERAL DISPLACEMENT (MM)</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-center font-mono">
              <div className="p-2 rounded-xl bg-slate-50 border border-slate-200/80">
                <div className="text-[9px] text-cyan-700 uppercase font-bold">DX</div>
                <div className="text-sm font-bold text-cyan-700 mt-0.5">{hasData ? `${xDisp >= 0 ? '+' : ''}${xDisp.toFixed(3)}` : '--'}</div>
                <div className="text-[8px] text-slate-400">mm</div>
              </div>

              <div className="p-2 rounded-xl bg-slate-50 border border-slate-200/80">
                <div className="text-[9px] text-amber-700 uppercase font-bold">DY</div>
                <div className="text-sm font-bold text-amber-700 mt-0.5">{hasData ? `${yDisp >= 0 ? '+' : ''}${yDisp.toFixed(3)}` : '--'}</div>
                <div className="text-[8px] text-slate-400">mm</div>
              </div>
            </div>

            {/* Vector Direction & Angle */}
            <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-slate-50 text-[10px] font-mono text-slate-600">
              <span>
                <span className="text-slate-400 font-sans">Displace Angle:</span>{' '}
                <span className="font-bold text-slate-800">{hasData ? `${dispAngleDeg.toFixed(1)}° (${dispCardinal})` : '--'}</span>
              </span>
              <span>
                <span className="text-slate-400 font-sans">Tilt Bearing:</span>{' '}
                <span className="font-bold text-blue-600">{hasData ? `${(d.tiltDirectionAngle ?? 0).toFixed(1)}° (${d.tiltDirectionCardinal || 'N'})` : '--'}</span>
              </span>
            </div>

            {/* 3. Ambient Temperature */}
            <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-slate-100">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 font-sans">
                <Thermometer className="w-3.5 h-3.5 text-amber-500" />
                <span>Ambient Temperature:</span>
              </div>
              <div className="font-mono text-xs font-bold bg-amber-50 border border-amber-200/80 px-2 py-0.5 rounded-lg text-amber-800">
                {hasData && d.temp !== null && d.temp !== undefined
                  ? `${Number(d.temp).toFixed(1)} °C`
                  : (device?.temperature ? `${device.temperature} °C` : '--')}
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
                {d.temp !== null && d.temp !== undefined ? `${Number(d.temp).toFixed(1)} °C` : (activeDevice?.temperature ? `${activeDevice.temperature} °C` : '--')}
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
                      {r.xTilt >= 0 ? '+' : ''}{r.xTilt.toFixed(3)}°
                    </td>
                    <td className="py-2 px-3 text-purple-700 font-semibold">
                      {r.yTilt >= 0 ? '+' : ''}{r.yTilt.toFixed(3)}°
                    </td>
                    <td className="py-2 px-3 text-emerald-700 font-semibold">
                      {r.zTilt >= 0 ? '+' : ''}{r.zTilt.toFixed(3)}°
                    </td>
                    <td className="py-2 px-3 text-purple-900 font-bold">
                      {r.resultant.toFixed(3)}°
                    </td>
                    <td className="py-2 px-3 text-cyan-700 font-semibold">
                      {r.xDisp >= 0 ? '+' : ''}{r.xDisp.toFixed(3)} mm
                    </td>
                    <td className="py-2 px-3 text-amber-700 font-semibold">
                      {r.yDisp >= 0 ? '+' : ''}{r.yDisp.toFixed(3)} mm
                    </td>
                    <td className="py-2 px-3 text-pink-700 font-bold">
                      {r.totalDisp.toFixed(3)} mm
                    </td>
                    <td className="py-2 px-3 text-amber-800">
                      {r.vibPeak !== null && r.vibPeak !== undefined ? `${Number(r.vibPeak).toFixed(4)} g` : '--'}
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
        <AlarmSummaryWidget />
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
