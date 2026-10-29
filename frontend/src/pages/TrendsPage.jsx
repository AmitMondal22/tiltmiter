import React, { useState, useEffect, useMemo } from 'react';
import {
  Download, Calendar, Filter, RefreshCw, Radio,
  Activity, Layers, BarChart2, TrendingUp, Thermometer, Zap, Clock
} from 'lucide-react';
import { getDevices, getTelemetryHistory, getWsUrl } from '../api/apiClient';
import { parseTelemetry } from '../utils/telemetryHelper';
import { telemetryService } from '../services/telemetryManager';
import { formatISTDatetimeLocal, istDatetimeToUTC, formatFullDateTime, formatTimeString, formatHHMM } from '../utils/dateHelper';
import TiltmeterChartsRow from '../components/TiltmeterChartsRow';

export default function TrendsPage() {
  const cardCls = 'rounded-2xl border border-slate-200/80 bg-white p-4 text-slate-800 shadow-xs';

  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  
  // Time presets: '1h', '6h', '24h', '7d', 'custom'
  const [activePreset, setActivePreset] = useState('24h');
  
  const now = new Date();
  const initFrom = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const [fromDateTime, setFromDateTime] = useState(formatISTDatetimeLocal(initFrom));
  const [toDateTime, setToDateTime] = useState(formatISTDatetimeLocal(now));

  const [telemetryLogs, setTelemetryLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  // 1. Fetch available devices
  useEffect(() => {
    getDevices().then(res => {
      if (res?.devices?.length) {
        setDevices(res.devices);
        if (!selectedDeviceId) setSelectedDeviceId(res.devices[0].id);
      }
    }).catch(() => {});
  }, []);

  const selectedDevice = useMemo(() => {
    return devices.find(d => d.id?.toLowerCase() === selectedDeviceId?.toLowerCase()) ||
           devices.find(d => d.id === selectedDeviceId) ||
           { id: selectedDeviceId || 'ABCDEF0002', name: selectedDeviceId || 'Device Node' };
  }, [devices, selectedDeviceId]);

  // Standard point mapper identical to device dashboard
  const mapPointData = (pt, activeDev = selectedDevice) => {
    const ts = pt.timestamp || pt.time;
    // 1. Axis Mapping:
    // X-Axis: tilt.roll
    // Y-Axis: tilt.pitch
    // Z-Axis: tilt.yaw
    const currentRoll = pt.tilt?.roll ?? pt.roll;
    const currentPitch = pt.tilt?.pitch ?? pt.pitch;
    const currentYaw = pt.tilt?.yaw ?? pt.yaw;

    // 2. Present Values: actual device angle values without subtracting reference
    const presentX = (currentRoll !== undefined && currentRoll !== null && !isNaN(parseFloat(currentRoll))) ? parseFloat(currentRoll) : 0.0;
    const presentY = (currentPitch !== undefined && currentPitch !== null && !isNaN(parseFloat(currentPitch))) ? parseFloat(currentPitch) : 0.0;
    const presentZ = (currentYaw !== undefined && currentYaw !== null && !isNaN(parseFloat(currentYaw))) ? parseFloat(currentYaw) : 0.0;
    const rawRes = pt.tilt?.tilt ?? pt.presentTilt ?? pt.resultantTilt ?? pt.resultant ?? pt.tilt;
    const presentRes = typeof rawRes === 'number' && !isNaN(rawRes) ? rawRes : Math.sqrt(presentX * presentX + presentY * presentY);

    // 3. Stored Reference Angles: Initially 0.0°, or calibrated reference if configured
    const L = parseFloat(activeDev?.gaugeLength_mm || 1000.0);
    const refX = parseFloat(activeDev?.refThetaX ?? 0.0) || 0.0;
    const refY = parseFloat(activeDev?.refThetaY ?? 0.0) || 0.0;
    const refZ = parseFloat(activeDev?.refThetaZ ?? 0.0) || 0.0;
    const hasRef = Boolean(activeDev?.hasReferenceZero || activeDev?.calibrate || (refX !== 0 || refY !== 0));

    // 4. Delta Values = Current − Reference
    const deltaX = presentX - refX;
    const deltaY = presentY - refY;
    const deltaZ = presentZ - refZ;

    // Device-provided displacement data:
    const rawDisp = pt.displacement || pt.rawPayload?.displacement || {};
    const rawXDisp = rawDisp.xDisplacement_mm ?? pt.xDisplacement_mm ?? pt.xDisp ?? pt.xDisplacement;
    const rawYDisp = rawDisp.yDisplacement_mm ?? pt.yDisplacement_mm ?? pt.yDisp ?? pt.yDisplacement;
    const rawZDisp = rawDisp.zDisplacement_mm ?? pt.zDisplacement_mm ?? pt.zDisp ?? pt.zDisplacement;
    const rawTotalDisp = rawDisp.totalDisplacement_mm ?? pt.totalDisplacement_mm ?? pt.totalDisp ?? pt.totalDisplacement;

    const xD = (rawXDisp !== undefined && rawXDisp !== null && !isNaN(parseFloat(rawXDisp))) ? parseFloat(rawXDisp) : 0.0;
    const yD = (rawYDisp !== undefined && rawYDisp !== null && !isNaN(parseFloat(rawYDisp))) ? parseFloat(rawYDisp) : 0.0;
    const zD = (rawZDisp !== undefined && rawZDisp !== null && !isNaN(parseFloat(rawZDisp))) ? parseFloat(rawZDisp) : 0.0;
    const totD = (rawTotalDisp !== undefined && rawTotalDisp !== null && !isNaN(parseFloat(rawTotalDisp))) ? parseFloat(rawTotalDisp) : 0.0;
    const deltaRes = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

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
      resultant: Number(activeResT.toFixed(1)),
      xTilt: Number(deltaX.toFixed(1)),
      yTilt: Number(deltaY.toFixed(1)),
      zTilt: Number(deltaZ.toFixed(1)),
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
      temperature: tempC !== null && !isNaN(tempC) ? Number(tempC.toFixed(1)) : 25.0,
      battery: pt.battery ?? pt.batteryVoltage ?? pt.power?.batteryVoltage ?? null,
      batteryVoltage: pt.batteryVoltage ?? pt.power?.batteryVoltage ?? null,
      power: pt.power || null,
      signal: pt.signal ?? pt.signalStrength ?? pt.network?.csq ?? null,
      signalStrength: pt.signalStrength ?? pt.signal ?? null,
      stability,
      stabilityClass,
    };
  };

  // 2. Fetch historical logs for selected device & range (converting IST user input to UTC ISO string for backend query)
  const loadHistory = (devId = selectedDeviceId, fromDt = null, toDt = null, rangeKey = activePreset) => {
    if (!devId) return;
    setLoading(true);

    const utcFrom = fromDt ? istDatetimeToUTC(fromDt) : null;
    const utcTo = toDt ? istDatetimeToUTC(toDt) : null;

    getTelemetryHistory(devId, utcFrom, utcTo, rangeKey)
      .then(res => {
        if (res?.history?.length) {
          const seen = new Set();
          const mapped = [];
          for (const pt of res.history) {
            const ts = pt.timestamp || pt.time;
            if (ts && seen.has(ts)) continue;
            if (ts) seen.add(ts);
            mapped.push(mapPointData(pt, selectedDevice));
          }
          setTelemetryLogs(mapped);
          const firstPoint = mapped[0];
          const lastPoint = mapped[mapped.length - 1];
          if (firstPoint?.timestamp && lastPoint?.timestamp && rangeKey) {
            setFromDateTime(formatISTDatetimeLocal(new Date(firstPoint.timestamp)));
            setToDateTime(formatISTDatetimeLocal(new Date(lastPoint.timestamp)));
          }
        } else {
          setTelemetryLogs([]);
        }
      })
      .catch(() => {
        setTelemetryLogs([]);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    if (selectedDeviceId) {
      loadHistory(selectedDeviceId, null, null, activePreset);
    }
  }, [selectedDeviceId]);

  // 3. Subscribe to live telemetry stream for live packet streaming into history
  useEffect(() => {
    if (!selectedDeviceId) return;

    const unsubscribe = telemetryService.subscribe((packet) => {
      if (!packet) return;
      const pktId = (packet.deviceId || packet.id || packet.device_id || '').toString().trim().toLowerCase();
      const curId = (selectedDeviceId || '').toString().trim().toLowerCase();
      if (pktId && curId && pktId === curId) {
        const parsed = parseTelemetry(packet);
        const newPoint = mapPointData(parsed, selectedDevice);
        setTelemetryLogs(prev => {
          if (prev.some(p => p.timestamp === newPoint.timestamp)) {
            return prev; // Skip duplicate timestamp
          }
          return [...prev, newPoint].slice(-200);
        });
      }
    }, selectedDeviceId);

    return () => {
      unsubscribe();
    };
  }, [selectedDeviceId, selectedDevice]);

  // Handle Preset Time Selection: 1h, 6h, 24h, 7d, 30d relative to last available data
  const handlePresetSelect = (presetKey) => {
    setActivePreset(presetKey);
    loadHistory(selectedDeviceId, null, null, presetKey);
  };

  const handleCustomQuery = (e) => {
    e.preventDefault();
    setActivePreset('custom');
    loadHistory(selectedDeviceId, fromDateTime, toDateTime, null);
  };

  // CSV Export
  const handleExportCSV = () => {
    if (telemetryLogs.length === 0) {
      alert('No telemetry records available to export for the selected date range.');
      return;
    }
    const headers = 'Timestamp_IST,Timestamp_UTC,Device_ID,XTilt_deg,YTilt_deg,ZTilt_deg,ResultantTilt_deg,XDisp_mm,YDisp_mm,ZDisp_mm,TotalDisp_mm,AccelMag_g,VibrationRMS_g,VibrationPeak_g,Temperature_C';
    const rows = telemetryLogs.map(r =>
      `"${formatFullDateTime(r.timestamp || r.time)}",${r.timestamp || ''},${selectedDeviceId},${r.xTilt?.toFixed(1) ?? ''},${r.yTilt?.toFixed(1) ?? ''},${r.zTilt?.toFixed(1) ?? ''},${r.resultant?.toFixed(1) ?? ''},${r.xDisp?.toFixed(1) ?? ''},${r.yDisp?.toFixed(1) ?? ''},${r.zDisp?.toFixed(1) ?? ''},${r.totalDisp?.toFixed(1) ?? ''},${r.accMag !== null && r.accMag !== undefined ? Number(r.accMag).toFixed(1) : ''},${r.vibRMS !== null && r.vibRMS !== undefined ? Number(r.vibRMS).toFixed(1) : ''},${r.vibPeak !== null && r.vibPeak !== undefined ? Number(r.vibPeak).toFixed(1) : ''},${r.temperature !== null && r.temperature !== undefined ? Number(r.temperature).toFixed(1) : (r.temp !== null && r.temp !== undefined ? Number(r.temp).toFixed(1) : '')}`
    );
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers, ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `historical_logs_${selectedDeviceId}_${activePreset}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-4 font-sans text-slate-800">
      {/* Top Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Historical Data & Telemetry Logs
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Real-time multi-axis inclination curves, structural displacement, vibration & thermal history (System UTC Sync)
          </p>
        </div>

        {/* Action Button */}
        <button
          onClick={handleExportCSV}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs rounded-xl shadow-xs transition-all cursor-pointer"
        >
          <Download className="w-4 h-4" />
          <span>Export Logs (CSV)</span>
        </button>
      </div>

      {/* Date-Time Range & Device Filter Toolbar */}
      <div className={cardCls}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Left: Device Selector & Presets (1h, 6h, 24h, Week) */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold text-slate-600">Device Node:</span>
              <select
                value={selectedDeviceId}
                onChange={e => setSelectedDeviceId(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-900 font-medium text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {devices.map(d => (
                  <option key={d.id} value={d.id}>{d.name} ({d.id})</option>
                ))}
                {devices.length === 0 && <option value="">No Devices Available</option>}
              </select>
            </div>

            {/* Presets: 1h, 6h, 24h, 7d, 30d */}
            <div className="flex items-center gap-1">
              {[
                { id: '1h', label: '1h', hours: 1 },
                { id: '6h', label: '6h', hours: 6 },
                { id: '24h', label: '24h', hours: 24 },
                { id: '7d', label: '7d', hours: 168 },
                { id: '30d', label: '30d', hours: 720 },
              ].map(p => (
                <button
                  key={p.id}
                  onClick={() => handlePresetSelect(p.id, p.hours)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                    activePreset === p.id
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Right: Custom Date-Time Filter Form (Local time converted to UTC) */}
          <form onSubmit={handleCustomQuery} className="flex flex-wrap items-center gap-2 text-xs">
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
              className="flex items-center gap-1 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-lg shadow-2xs transition-colors cursor-pointer"
            >
              {loading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Filter className="w-3 h-3" />}
              <span>Query</span>
            </button>
          </form>
        </div>
      </div>

      {/* Multi-Axis Time-Series Charts (4 Panels matching exact Device Dashboard layout) */}
      <TiltmeterChartsRow telemetryHistory={telemetryLogs} loading={loading} currentDevice={selectedDevice} />

      {/* Historical Telemetry Logs Table */}
      <div className={cardCls}>
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-2">
          <div className="text-xs font-semibold text-slate-800">
            Time-Series Logs • <span className="font-mono text-blue-600">{selectedDeviceId || '--'}</span> ({telemetryLogs.length} Records)
          </div>
          <div className="flex items-center gap-1.5 text-xs text-blue-600 font-semibold">
            <Radio className="w-3.5 h-3.5 animate-pulse" />
            <span>LIVE SYNC</span>
          </div>
        </div>

        <div className="overflow-x-auto max-h-72 overflow-y-auto">
          <table className="w-full text-left text-xs whitespace-nowrap">
            <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
              <tr className="uppercase text-[10px] tracking-wider text-slate-600 font-bold">
                <th className="py-2.5 px-3">Timestamp (IST)</th>
                <th className="py-2.5 px-3 text-blue-700">X Tilt (°)</th>
                <th className="py-2.5 px-3 text-emerald-700">Y Tilt (°)</th>
                <th className="py-2.5 px-3 text-amber-700">Z Tilt (°)</th>
                <th className="py-2.5 px-3 text-purple-700">Resultant Tilt (°)</th>
                <th className="py-2.5 px-3 text-cyan-700">X Disp (mm)</th>
                <th className="py-2.5 px-3 text-amber-700">Y Disp (mm)</th>
                <th className="py-2.5 px-3 text-pink-700">Total Disp (mm)</th>
                <th className="py-2.5 px-3 text-slate-700">Peak Vib (g)</th>
                <th className="py-2.5 px-3 text-emerald-700">Temp (°C)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {telemetryLogs.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-slate-400 text-xs">
                    {loading ? 'Fetching telemetry logs...' : 'No telemetry records found for this period.'}
                  </td>
                </tr>
              ) : (
                telemetryLogs.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50/80 transition-colors font-mono">
                    <td className="py-2 px-3 text-slate-700 font-medium font-sans">
                      {formatFullDateTime(r.timestamp || r.time)}
                    </td>
                    <td className="py-2 px-3 text-blue-700 font-semibold">
                      {r.xTilt !== null && r.xTilt !== undefined ? `${r.xTilt >= 0 ? '+' : ''}${r.xTilt.toFixed(1)}°` : '--'}
                    </td>
                    <td className="py-2 px-3 text-emerald-700 font-semibold">
                      {r.yTilt !== null && r.yTilt !== undefined ? `${r.yTilt >= 0 ? '+' : ''}${r.yTilt.toFixed(1)}°` : '--'}
                    </td>
                    <td className="py-2 px-3 text-amber-700 font-semibold">
                      {r.zTilt !== null && r.zTilt !== undefined ? `${r.zTilt >= 0 ? '+' : ''}${r.zTilt.toFixed(1)}°` : '--'}
                    </td>
                    <td className="py-2 px-3 font-bold text-purple-700">
                      {r.resultant !== null && r.resultant !== undefined ? `${r.resultant.toFixed(1)}°` : '--'}
                    </td>
                    <td className="py-2 px-3 text-cyan-700 font-semibold">
                      {r.xDisp !== null && r.xDisp !== undefined ? `${r.xDisp >= 0 ? '+' : ''}${r.xDisp.toFixed(1)} mm` : '--'}
                    </td>
                    <td className="py-2 px-3 text-amber-700 font-semibold">
                      {r.yDisp !== null && r.yDisp !== undefined ? `${r.yDisp >= 0 ? '+' : ''}${r.yDisp.toFixed(1)} mm` : '--'}
                    </td>
                    <td className="py-2 px-3 font-bold text-pink-700">
                      {r.totalDisp !== null && r.totalDisp !== undefined ? `${r.totalDisp.toFixed(1)} mm` : '--'}
                    </td>
                    <td className="py-2 px-3 text-slate-700">
                      {r.vibPeak !== null && r.vibPeak !== undefined ? `${r.vibPeak.toFixed(1)} g` : (r.accMag !== null && r.accMag !== undefined ? `${r.accMag.toFixed(1)} g` : '--')}
                    </td>
                    <td className="py-2 px-3 text-emerald-700 font-semibold">
                      {r.temp !== null && r.temp !== undefined ? `${r.temp.toFixed(1)} °C` : (r.temperature !== null && r.temperature !== undefined ? `${r.temperature.toFixed(1)} °C` : '--')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
