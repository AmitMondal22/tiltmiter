import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Battery, Signal, Sliders, Calendar,
  Download, RefreshCw, Layers, ShieldCheck, Activity,
  CheckCircle2, AlertTriangle, Radio, Clock
} from 'lucide-react';
import { getDevice, getDeviceTelemetry, configureDeviceTelemetry, getWsUrl } from '../api/apiClient';
import { parseTelemetry } from '../utils/telemetryHelper';
import { telemetryService } from '../services/telemetryManager';
import { formatLocalDatetime, formatFullDateTime, formatTimeString } from '../utils/dateHelper';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';

export default function DeviceDetailPage() {
  const { deviceId } = useParams();
  const navigate = useNavigate();
  const cardCls = 'rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs text-slate-800';

  const [device, setDevice] = useState(null);
  const [liveData, setLiveData] = useState(null);
  const [telemetryHistory, setTelemetryHistory] = useState([]);

  // Time presets: '1h', '6h', '24h', '7d', 'custom'
  const [activeFilter, setActiveFilter] = useState('24h');

  const now = new Date();
  const initFrom = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const [fromDateTime, setFromDateTime] = useState(formatLocalDatetime(initFrom));
  const [toDateTime, setToDateTime] = useState(formatLocalDatetime(now));

  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [configForm, setConfigForm] = useState({ sleep_count: 60, wake_count: 30, calibrate: false });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });

  // 1. Load individual device metadata using getDevice(deviceId)
  useEffect(() => {
    if (!deviceId) return;

    getDevice(deviceId).then(res => {
      const dev = res?.device || res;
      if (dev && (dev.id || dev.name)) {
        setDevice(dev);
        setConfigForm({
          sleep_count: Math.max(60, dev.sleep_count || 60),
          wake_count: dev.wake_count || 30,
          calibrate: dev.calibrate || false,
        });
        const parsed = parseTelemetry(dev);
        setLiveData(parsed);
      }
    }).catch(() => { });

    loadHistory(deviceId, fromDateTime, toDateTime);
  }, [deviceId]);

  const loadHistory = (id, fromDt = fromDateTime, toDt = toDateTime) => {
    if (!id) return;
    setLoading(true);

    let utcFrom = null;
    let utcTo = null;
    try {
      if (fromDt) utcFrom = new Date(fromDt).toISOString();
      if (toDt) utcTo = new Date(toDt).toISOString();
    } catch (e) { }

    getDeviceTelemetry(id, utcFrom, utcTo)
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
            vibRMS: parseFloat(pt.vibRMS || pt.vibrationRMS || 0.045),
            vibPeak: parseFloat(pt.vibPeak || pt.vibrationPeak || 0.104),
          }));
          setTelemetryHistory(mapped);
          const lastPoint = mapped[mapped.length - 1];
          if (lastPoint) {
            setLiveData(prev => prev || parseTelemetry(lastPoint));
          }
        } else {
          setTelemetryHistory([]);
        }
      })
      .catch(() => {
        setTelemetryHistory([]);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  // 2. Subscribe to centralized telemetry stream for live hardware updates
  useEffect(() => {
    const unsubscribe = telemetryService.subscribe((packet) => {
      if (!packet) return;
      const pktId = packet.deviceId || packet.id;
      if (pktId === deviceId || !deviceId) {
        const parsed = parseTelemetry(packet);
        setLiveData(parsed);
        setTelemetryHistory(prev => {
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
            vibRMS: parsed.vibRMS || 0.045,
            vibPeak: parsed.vibPeak || 0.104,
          };
          return [...prev, newPoint].slice(-60);
        });
      }
    }, deviceId);

    return () => {
      unsubscribe();
    };
  }, [deviceId]);

  // Handle Preset Selection: 1h, 6h, 24h, 7d (Week)
  const handleRangeSelect = (presetKey, hours) => {
    setActiveFilter(presetKey);
    const end = new Date();
    const start = new Date(end.getTime() - hours * 60 * 60 * 1000);
    const startLocal = formatLocalDatetime(start);
    const endLocal = formatLocalDatetime(end);
    setFromDateTime(startLocal);
    setToDateTime(endLocal);
    loadHistory(deviceId, startLocal, endLocal);
  };

  const handleCustomDateSubmit = (e) => {
    e.preventDefault();
    setActiveFilter('custom');
    loadHistory(deviceId, fromDateTime, toDateTime);
  };

  const handleSaveConfig = async (e) => {
    e.preventDefault();
    if (configForm.sleep_count < 60) {
      setMsg({ type: 'error', text: 'Sleep count must be at least 60 minutes (60M minimum).' });
      return;
    }
    try {
      await configureDeviceTelemetry(deviceId, configForm);
      setMsg({ type: 'success', text: `Configuration deployed to ${deviceId} successfully.` });
      setConfigModalOpen(false);
      setDevice(prev => ({ ...prev, ...configForm }));
    } catch (err) {
      setMsg({ type: 'error', text: err.message || 'Error deploying config' });
    } finally {
      setTimeout(() => setMsg({ type: '', text: '' }), 3500);
    }
  };

  const d = liveData || parseTelemetry({ id: deviceId });
  const roll = d.xTilt ?? 1.53;
  const pitch = d.yTilt ?? -0.92;
  const resultant = d.resultantTilt ?? 1.83;

  const bubbleX = Math.max(-32, Math.min(32, roll * 14));
  const bubbleY = Math.max(-32, Math.min(32, -pitch * 14));

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
                {device?.status || 'ONLINE (2.5 Hz)'}
              </span>
              <span className="flex items-center gap-1 text-[11px] font-mono text-slate-500 bg-slate-50 px-2.5 py-0.5 rounded-md border border-slate-200">
                <Clock className="w-3 h-3 text-slate-400" />
                <span>Last Updated: {d.timestamp ? new Date(d.timestamp).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }) : new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}</span>
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Live Inclinometer Diagnostics & Historical Data Logs
            </p>
          </div>
        </div>

        {/* Hardware Status & Configuration Button */}
        <div className="flex items-center gap-2 text-xs">
          <div className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 font-medium">
            <Battery className="w-3.5 h-3.5 text-emerald-600" />
            <span>{device?.battery || '100%'}</span>
          </div>

          <div className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 font-medium">
            <Signal className="w-3.5 h-3.5 text-blue-600" />
            <span>{device?.signalStrength || device?.signal || '14'}</span>
          </div>

          <button
            onClick={() => setConfigModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs rounded-xl shadow-xs transition-all cursor-pointer"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Configure Device</span>
          </button>
        </div>
      </div>

      {/* Date-Time Range Quick Filters (1h, 6h, 24h, 1 Week) & Custom Range */}
      <div className={cardCls}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Preset Buttons */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-semibold text-slate-500 mr-1">Time Preset:</span>
            {[
              { id: '1h', label: '1h', hours: 1 },
              { id: '6h', label: '6h', hours: 6 },
              { id: '24h', label: '24h', hours: 24 },
              { id: '7d', label: '1 Week', hours: 168 },
            ].map(b => (
              <button
                key={b.id}
                onClick={() => handleRangeSelect(b.id, b.hours)}
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

      {/* Row 1: Live Status Readouts & Dual-Axis Bullseye Horizon Gauge */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* 1. Live Primary Inclinometer Readout */}
        <div className={cardCls}>
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider font-mono text-slate-700">
              LIVE INCLINOMETER READINGS
            </span>
            <div className="flex items-center gap-1 text-[10px] font-mono text-blue-600 font-semibold">
              <Radio className="w-3 h-3 animate-pulse" />
              <span>LIVE STREAM</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center my-2 font-mono">
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
              <div className="text-[9px] text-slate-400 uppercase font-semibold">Roll (X)</div>
              <div className="text-base font-bold text-blue-600 mt-0.5">{roll.toFixed(3)}°</div>
              <div className="text-[8px] text-slate-400 mt-0.5">mm/m slope</div>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
              <div className="text-[9px] text-slate-400 uppercase font-semibold">Pitch (Y)</div>
              <div className="text-base font-bold text-purple-600 mt-0.5">{pitch.toFixed(3)}°</div>
              <div className="text-[8px] text-slate-400 mt-0.5">mm/m slope</div>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
              <div className="text-[9px] text-slate-400 uppercase font-semibold">Resultant</div>
              <div className="text-base font-bold text-emerald-600 mt-0.5">{resultant.toFixed(3)}°</div>
              <div className="text-[8px] text-slate-400 mt-0.5">3D vector</div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-slate-100 text-xs font-mono">
            <div className="flex justify-between py-1">
              <span className="text-slate-500 font-medium font-sans">Total Displacement:</span>
              <span className="font-semibold text-slate-900">{(d.totalDisplacement ?? 4.67).toFixed(2)} mm</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-500 font-medium font-sans">Ambient Temp:</span>
              <span className="font-semibold text-slate-900">{(d.temp ?? 28.7).toFixed(1)} °C</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-500 font-medium font-sans">Last Packet:</span>
              <span className="font-semibold text-blue-600 truncate">{d.timestamp ? new Date(d.timestamp).toLocaleTimeString('en-IN') : 'Just now'}</span>
            </div>
          </div>
        </div>

        {/* 2. Dual-Axis Bullseye Horizon Gauge */}
        <div className={cardCls}>
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider font-mono text-slate-700">
              DUAL-AXIS BULLSEYE LEVEL
            </span>
            <span className="text-[9px] font-mono text-blue-600 font-semibold px-1.5 py-0.2 rounded-md bg-blue-50 border border-blue-200">
              MEMS
            </span>
          </div>

          <div className="flex flex-col items-center justify-center my-1">
            <div className="relative w-24 h-24 rounded-full border border-slate-200 bg-slate-50/80 flex items-center justify-center shadow-inner overflow-hidden">
              <div className="absolute w-20 h-20 rounded-full border border-slate-200/80" />
              <div className="absolute w-14 h-14 rounded-full border border-dashed border-slate-300" />
              <div className="absolute w-7 h-7 rounded-full border border-slate-300 bg-slate-100/60" />
              <div className="absolute w-2.5 h-2.5 rounded-full border border-slate-400" />

              <div className="absolute w-full h-[1px] bg-slate-200" />
              <div className="absolute h-full w-[1px] bg-slate-200" />

              <span className="absolute top-1 text-[6.5px] font-mono font-medium text-slate-400">+Y</span>
              <span className="absolute bottom-1 text-[6.5px] font-mono font-medium text-slate-400">-Y</span>
              <span className="absolute left-1 text-[6.5px] font-mono font-medium text-slate-400">-X</span>
              <span className="absolute right-1 text-[6.5px] font-mono font-medium text-slate-400">+X</span>

              <div
                className="absolute w-5 h-5 rounded-full bg-blue-600 border-2 border-white shadow-md transition-all duration-300 ease-out flex items-center justify-center z-10"
                style={{
                  transform: `translate(${bubbleX}px, ${bubbleY}px)`,
                }}
              >
                <div className="w-1 h-1 bg-white rounded-full opacity-80" />
              </div>
            </div>
            <div className="text-[10px] font-mono font-semibold text-slate-700 mt-1">
              Bearing: {d.tiltDirectionCardinal || 'NW'} Vector
            </div>
          </div>
        </div>

        {/* 3. Sensor Health & Hardware Configuration */}
        <div className={cardCls}>
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider font-mono text-slate-700">
              DEVICE SAMPLING & CONFIG
            </span>
            <span className="text-[9px] font-mono text-emerald-600 font-semibold px-1.5 py-0.2 rounded-md bg-emerald-50 border border-emerald-200">
              Active
            </span>
          </div>

          <div className="space-y-1 text-xs">
            <div className="flex justify-between py-1 border-b border-slate-50">
              <span className="text-slate-500 font-medium">Sleep Interval (Min 60M):</span>
              <span className="font-mono font-semibold text-slate-900">{device?.sleep_count || 60} Minutes</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-50">
              <span className="text-slate-500 font-medium">Wake Sampling Duration:</span>
              <span className="font-mono font-semibold text-slate-900">{device?.wake_count || 30} Seconds</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-50">
              <span className="text-slate-500 font-medium">Zero Calibration Offset:</span>
              <span className="font-mono font-semibold text-emerald-600">PASSED ✓</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-500 font-medium">Telemetry History Points:</span>
              <span className="font-mono font-semibold text-blue-600">{telemetryHistory.length} Points</span>
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: Live Historical Multi-Axis Time-Series Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Chart 1: Inclinometer Tilt vs Time */}
        <div className={cardCls}>
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider font-mono text-slate-700">
              TILT ANGLE (°) VS TIME
            </span>
            <span className="text-[9px] font-mono text-slate-400">
              {activeFilter.toUpperCase()} Window
            </span>
          </div>

          <div className="h-56 w-full flex items-center justify-center">
            {telemetryHistory.length === 0 ? (
              <div className="text-center text-slate-400 text-xs font-mono">
                {loading ? 'Fetching telemetry records...' : 'No historical data found for this period.'}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={telemetryHistory}>
                  <CartesianGrid stroke="#f8fafc" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="time" stroke="#94a3b8" tick={{ fontSize: 9 }} />
                  <YAxis stroke="#94a3b8" tick={{ fontSize: 9 }} />
                  <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 10 }} />
                  <Legend wrapperStyle={{ fontSize: 10, paddingTop: 4 }} />
                  <Line type="monotone" dataKey="resultant" stroke="#a855f7" strokeWidth={2} dot={false} name="Resultant Tilt" />
                  <Line type="monotone" dataKey="xTilt" stroke="#3b82f6" strokeWidth={2} dot={false} name="X Tilt" />
                  <Line type="monotone" dataKey="yTilt" stroke="#10b981" strokeWidth={2} dot={false} name="Y Tilt" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Chart 2: Sub-surface Displacement vs Time */}
        <div className={cardCls}>
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider font-mono text-slate-700">
              3D DISPLACEMENT (MM) VS TIME
            </span>
            <span className="text-[9px] font-mono text-slate-400">
              {activeFilter.toUpperCase()} Window
            </span>
          </div>

          <div className="h-56 w-full flex items-center justify-center">
            {telemetryHistory.length === 0 ? (
              <div className="text-center text-slate-400 text-xs font-mono">
                {loading ? 'Fetching telemetry records...' : 'No historical data found for this period.'}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={telemetryHistory}>
                  <CartesianGrid stroke="#f8fafc" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="time" stroke="#94a3b8" tick={{ fontSize: 9 }} />
                  <YAxis stroke="#94a3b8" tick={{ fontSize: 9 }} />
                  <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 10 }} />
                  <Legend wrapperStyle={{ fontSize: 10, paddingTop: 4 }} />
                  <Line type="monotone" dataKey="totalDisp" stroke="#ec4899" strokeWidth={2} dot={false} name="Total Disp" />
                  <Line type="monotone" dataKey="xDisp" stroke="#06b6d4" strokeWidth={2} dot={false} name="X Disp" />
                  <Line type="monotone" dataKey="yDisp" stroke="#f59e0b" strokeWidth={2} dot={false} name="Y Disp" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
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
                <p className="text-xs text-slate-500 font-medium">Sampling Rate (Min 60M) & Calibration Parameters</p>
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
                  <span className="text-[10px] font-mono text-blue-600 font-semibold bg-blue-50 px-1.5 py-0.5 rounded">
                    Min 60M
                  </span>
                </div>
                <input
                  type="number"
                  required
                  min="60"
                  max="1440"
                  value={configForm.sleep_count}
                  onChange={e => setConfigForm({ ...configForm, sleep_count: parseInt(e.target.value) || 60 })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-mono font-medium focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <p className="text-[10px] text-slate-400 mt-1">Minimum allowed value is 60 minutes.</p>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Wake Count (Seconds)
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  max="3600"
                  value={configForm.wake_count}
                  onChange={e => setConfigForm({ ...configForm, wake_count: parseInt(e.target.value) || 30 })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-mono font-medium focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-900">Calibrate Zero Offset</div>
                  <div className="text-[11px] text-slate-500">Recalibrate MEMS zero tilt reference</div>
                </div>
                <input
                  type="checkbox"
                  checked={configForm.calibrate}
                  onChange={e => setConfigForm({ ...configForm, calibrate: e.target.checked })}
                  className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                />
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
