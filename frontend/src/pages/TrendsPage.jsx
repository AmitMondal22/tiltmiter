import React, { useState, useEffect, useMemo } from 'react';
import {
  Download, Calendar, Filter, RefreshCw, Radio,
  Activity, Layers, BarChart2, TrendingUp, Thermometer, Zap, Clock
} from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { getDevices, getTelemetryHistory, getWsUrl } from '../api/apiClient';
import { parseTelemetry } from '../utils/telemetryHelper';
import { telemetryService } from '../services/telemetryManager';

// Helper to format local Date object to `YYYY-MM-DDTHH:mm` for datetime-local inputs
const formatLocalDatetime = (d) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function TrendsPage() {
  const cardCls = 'rounded-2xl border border-slate-200/80 bg-white p-4 text-slate-800 shadow-xs';

  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  
  // Time presets: '1h', '6h', '24h', '7d', 'custom'
  const [activePreset, setActivePreset] = useState('24h');
  
  const now = new Date();
  const initFrom = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const [fromDateTime, setFromDateTime] = useState(formatLocalDatetime(initFrom));
  const [toDateTime, setToDateTime] = useState(formatLocalDatetime(now));

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

  // 2. Fetch historical logs for selected device & range (converting system timezone to UTC ISO string)
  const loadHistory = (devId = selectedDeviceId, fromDt = fromDateTime, toDt = toDateTime) => {
    if (!devId) return;
    setLoading(true);

    // Convert local system datetime to UTC ISO string
    let utcFrom = null;
    let utcTo = null;
    try {
      if (fromDt) utcFrom = new Date(fromDt).toISOString();
      if (toDt) utcTo = new Date(toDt).toISOString();
    } catch (e) {}

    getTelemetryHistory(devId, utcFrom, utcTo)
      .then(res => {
        if (res?.history?.length) {
          const mapped = res.history.map(pt => ({
            time: pt.time || new Date(pt.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            timestamp: pt.timestamp || pt.time,
            resultant: parseFloat(pt.resultant || pt.resultantTilt || 0),
            xTilt: parseFloat(pt.xTilt || pt.tiltX || 0),
            yTilt: parseFloat(pt.yTilt || pt.tiltY || 0),
            totalDisp: parseFloat(pt.totalDisp || pt.totalDisplacement || 0),
            xDisp: parseFloat(pt.xDisp || pt.xDisplacement || 0),
            yDisp: parseFloat(pt.yDisp || pt.yDisplacement || 0),
            zDisp: parseFloat(pt.zDisp || pt.zDisplacement || 0),
            accMag: parseFloat(pt.accMag || 0.98),
            vibRMS: parseFloat(pt.vibRMS || pt.vibrationRMS || 0.045),
            vibPeak: parseFloat(pt.vibPeak || pt.vibrationPeak || 0.104),
            temperature: parseFloat(pt.temperature || pt.temp || 28.7),
          }));
          setTelemetryLogs(mapped);
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
      loadHistory(selectedDeviceId, fromDateTime, toDateTime);
    }
  }, [selectedDeviceId]);

  // 3. Subscribe to live telemetry stream for live packet streaming into history
  useEffect(() => {
    if (!selectedDeviceId) return;

    const unsubscribe = telemetryService.subscribe((packet) => {
      if (!packet) return;
      const pktId = packet.deviceId || packet.id;
      if (pktId === selectedDeviceId || !selectedDeviceId) {
        const parsed = parseTelemetry(packet);
        setTelemetryLogs(prev => {
          const newPoint = {
            time: new Date(parsed.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            timestamp: parsed.timestamp,
            resultant: parsed.resultantTilt,
            xTilt: parsed.xTilt,
            yTilt: parsed.yTilt,
            totalDisp: parsed.totalDisplacement,
            xDisp: parsed.xDisplacement,
            yDisp: parsed.yDisplacement,
            zDisp: parsed.zDisplacement || 0,
            accMag: parsed.accMag || 0.98,
            vibRMS: parsed.vibRMS || 0.045,
            vibPeak: parsed.vibPeak || 0.104,
            temperature: parsed.temp || 28.7,
          };
          return [...prev, newPoint].slice(-80);
        });
      }
    }, selectedDeviceId);

    return () => {
      unsubscribe();
    };
  }, [selectedDeviceId]);

  // Handle Preset Time Selection: 1h, 6h, 24h, 7d (Week)
  const handlePresetSelect = (presetKey, hours) => {
    setActivePreset(presetKey);
    const end = new Date();
    const start = new Date(end.getTime() - hours * 60 * 60 * 1000);
    const startLocal = formatLocalDatetime(start);
    const endLocal = formatLocalDatetime(end);
    setFromDateTime(startLocal);
    setToDateTime(endLocal);
    loadHistory(selectedDeviceId, startLocal, endLocal);
  };

  const handleCustomQuery = (e) => {
    e.preventDefault();
    setActivePreset('custom');
    loadHistory(selectedDeviceId, fromDateTime, toDateTime);
  };

  // CSV Export
  const handleExportCSV = () => {
    if (telemetryLogs.length === 0) {
      alert('No telemetry records available to export for the selected date range.');
      return;
    }
    const headers = 'Timestamp,Device_ID,ResultantTilt_deg,XTilt_deg,YTilt_deg,TotalDisplacement_mm,XDisp_mm,YDisp_mm,ZDisp_mm,AccelMag_g,VibrationRMS_g,VibrationPeak_g,Temperature_C';
    const rows = telemetryLogs.map(r =>
      `${r.timestamp || r.time},${selectedDeviceId},${r.resultant.toFixed(4)},${r.xTilt.toFixed(4)},${r.yTilt.toFixed(4)},${r.totalDisp.toFixed(4)},${r.xDisp.toFixed(4)},${r.yDisp.toFixed(4)},${r.zDisp.toFixed(4)},${r.accMag.toFixed(3)},${r.vibRMS.toFixed(4)},${r.vibPeak.toFixed(4)},${r.temperature.toFixed(2)}`
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

            {/* Presets: 1h, 6h, 24h, 1 Week */}
            <div className="flex items-center gap-1">
              {[
                { id: '1h', label: '1h', hours: 1 },
                { id: '6h', label: '6h', hours: 6 },
                { id: '24h', label: '24h', hours: 24 },
                { id: '7d', label: '1 Week', hours: 168 },
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

      {/* Multi-Chart Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* 1. Multi-Axis Tilt vs Time */}
        <div className={cardCls}>
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-2">
            <div className="flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-purple-600" />
              <span className="text-[10px] font-bold uppercase tracking-wider font-mono text-slate-700">
                TILT ANGLE (°) VS TIME
              </span>
            </div>
            <span className="text-[9px] font-mono text-purple-600 font-semibold bg-purple-50 px-2 py-0.5 rounded">
              Roll (X), Pitch (Y), Resultant
            </span>
          </div>

          <div className="h-56 w-full flex items-center justify-center">
            {telemetryLogs.length === 0 ? (
              <div className="text-center text-slate-400 text-xs font-mono">
                {loading ? 'Fetching telemetry curve...' : 'No historical data available.'}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={telemetryLogs}>
                  <CartesianGrid stroke="#f8fafc" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="time" stroke="#94a3b8" tick={{ fontSize: 9 }} />
                  <YAxis stroke="#94a3b8" tick={{ fontSize: 9 }} />
                  <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 10 }} />
                  <Legend wrapperStyle={{ fontSize: 10, paddingTop: 4 }} />
                  <Line type="monotone" dataKey="resultant" stroke="#a855f7" strokeWidth={2} dot={false} name="Resultant Tilt (°)" />
                  <Line type="monotone" dataKey="xTilt" stroke="#3b82f6" strokeWidth={2} dot={false} name="Roll X (°)" />
                  <Line type="monotone" dataKey="yTilt" stroke="#10b981" strokeWidth={2} dot={false} name="Pitch Y (°)" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* 2. 3D Sub-surface Displacement vs Time */}
        <div className={cardCls}>
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-2">
            <div className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-pink-600" />
              <span className="text-[10px] font-bold uppercase tracking-wider font-mono text-slate-700">
                3D DISPLACEMENT (MM) VS TIME
              </span>
            </div>
            <span className="text-[9px] font-mono text-pink-600 font-semibold bg-pink-50 px-2 py-0.5 rounded">
              Total, X, Y Displacement
            </span>
          </div>

          <div className="h-56 w-full flex items-center justify-center">
            {telemetryLogs.length === 0 ? (
              <div className="text-center text-slate-400 text-xs font-mono">
                {loading ? 'Fetching telemetry curve...' : 'No historical data available.'}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={telemetryLogs}>
                  <CartesianGrid stroke="#f8fafc" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="time" stroke="#94a3b8" tick={{ fontSize: 9 }} />
                  <YAxis stroke="#94a3b8" tick={{ fontSize: 9 }} />
                  <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 10 }} />
                  <Legend wrapperStyle={{ fontSize: 10, paddingTop: 4 }} />
                  <Line type="monotone" dataKey="totalDisp" stroke="#ec4899" strokeWidth={2} dot={false} name="Total Disp (mm)" />
                  <Line type="monotone" dataKey="xDisp" stroke="#06b6d4" strokeWidth={2} dot={false} name="X Disp (mm)" />
                  <Line type="monotone" dataKey="yDisp" stroke="#f59e0b" strokeWidth={2} dot={false} name="Y Disp (mm)" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* 3. Vibration & Dynamic Shock vs Time */}
        <div className={cardCls}>
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-2">
            <div className="flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-amber-600" />
              <span className="text-[10px] font-bold uppercase tracking-wider font-mono text-slate-700">
                VIBRATION RMS & PEAK (G) VS TIME
              </span>
            </div>
            <span className="text-[9px] font-mono text-amber-600 font-semibold bg-amber-50 px-2 py-0.5 rounded">
              RMS & Peak Transducer
            </span>
          </div>

          <div className="h-56 w-full flex items-center justify-center">
            {telemetryLogs.length === 0 ? (
              <div className="text-center text-slate-400 text-xs font-mono">
                {loading ? 'Fetching telemetry curve...' : 'No historical data available.'}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={telemetryLogs}>
                  <CartesianGrid stroke="#f8fafc" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="time" stroke="#94a3b8" tick={{ fontSize: 9 }} />
                  <YAxis stroke="#94a3b8" tick={{ fontSize: 9 }} />
                  <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 10 }} />
                  <Legend wrapperStyle={{ fontSize: 10, paddingTop: 4 }} />
                  <Area type="monotone" dataKey="vibPeak" stroke="#f59e0b" fill="#fef3c7" strokeWidth={2} name="Vibration Peak (g)" />
                  <Area type="monotone" dataKey="vibRMS" stroke="#0284c7" fill="#e0f2fe" strokeWidth={2} name="Vibration RMS (g)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* 4. Thermal & Acceleration vs Time */}
        <div className={cardCls}>
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-2">
            <div className="flex items-center gap-1.5">
              <Thermometer className="w-3.5 h-3.5 text-emerald-600" />
              <span className="text-[10px] font-bold uppercase tracking-wider font-mono text-slate-700">
                TEMPERATURE (°C) & ACCELERATION (G)
              </span>
            </div>
            <span className="text-[9px] font-mono text-emerald-600 font-semibold bg-emerald-50 px-2 py-0.5 rounded">
              Thermal Drift & Accel Mag
            </span>
          </div>

          <div className="h-56 w-full flex items-center justify-center">
            {telemetryLogs.length === 0 ? (
              <div className="text-center text-slate-400 text-xs font-mono">
                {loading ? 'Fetching telemetry curve...' : 'No historical data available.'}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={telemetryLogs}>
                  <CartesianGrid stroke="#f8fafc" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="time" stroke="#94a3b8" tick={{ fontSize: 9 }} />
                  <YAxis stroke="#94a3b8" tick={{ fontSize: 9 }} />
                  <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 10 }} />
                  <Legend wrapperStyle={{ fontSize: 10, paddingTop: 4 }} />
                  <Line type="monotone" dataKey="temperature" stroke="#10b981" strokeWidth={2} dot={false} name="Temperature (°C)" />
                  <Line type="monotone" dataKey="accMag" stroke="#64748b" strokeWidth={2} dot={false} name="Acceleration Mag (g)" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

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
              <tr className="uppercase text-[10px] tracking-wider">
                <th className="py-2.5 px-3">Timestamp</th>
                <th className="py-2.5 px-3">Resultant Tilt</th>
                <th className="py-2.5 px-3">Roll (X)</th>
                <th className="py-2.5 px-3">Pitch (Y)</th>
                <th className="py-2.5 px-3">Total Displacement</th>
                <th className="py-2.5 px-3">X Disp</th>
                <th className="py-2.5 px-3">Y Disp</th>
                <th className="py-2.5 px-3">Peak Vibration</th>
                <th className="py-2.5 px-3">Temperature</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {telemetryLogs.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400 text-xs">
                    {loading ? 'Fetching telemetry logs...' : 'No telemetry records found for this period.'}
                  </td>
                </tr>
              ) : (
                telemetryLogs.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50/80 transition-colors font-mono">
                    <td className="py-2 px-3 text-slate-600">
                      {r.timestamp || r.time}
                    </td>
                    <td className="py-2 px-3 font-semibold text-purple-700">
                      {r.resultant.toFixed(4)}°
                    </td>
                    <td className="py-2 px-3 text-blue-700">
                      {r.xTilt.toFixed(4)}°
                    </td>
                    <td className="py-2 px-3 text-emerald-700">
                      {r.yTilt.toFixed(4)}°
                    </td>
                    <td className="py-2 px-3 font-semibold text-pink-700">
                      {r.totalDisp.toFixed(3)} mm
                    </td>
                    <td className="py-2 px-3">
                      {r.xDisp.toFixed(3)} mm
                    </td>
                    <td className="py-2 px-3">
                      {r.yDisp.toFixed(3)} mm
                    </td>
                    <td className="py-2 px-3 text-amber-700">
                      {r.vibPeak.toFixed(4)} g
                    </td>
                    <td className="py-2 px-3 text-emerald-700">
                      {r.temperature.toFixed(1)} °C
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
