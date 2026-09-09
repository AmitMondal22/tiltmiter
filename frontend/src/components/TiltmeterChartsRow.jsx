import React, { useState, useEffect, useCallback } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { getDeviceTelemetry } from '../api/apiClient';
import { parseTelemetry } from '../utils/telemetryHelper';
import { telemetryService } from '../services/telemetryManager';
import { formatTimeString, formatFullDateTime } from '../utils/dateHelper';

const RANGES = [
  { id: '1h', label: '1H', hours: 1 },
  { id: '6h', label: '6H', hours: 6 },
  { id: '12h', label: '12H', hours: 12 },
  { id: '24h', label: '24H', hours: 24 },
  { id: '7d', label: '7D', hours: 168 },
  { id: '30d', label: '30D', hours: 720 },
];

export default function TiltmeterChartsRow({ currentDevice }) {
  const [range1, setRange1] = useState('24h');
  const [range2, setRange2] = useState('24h');
  const [range3, setRange3] = useState('24h');

  const [data1, setData1] = useState([]);
  const [data2, setData2] = useState([]);
  const [data3, setData3] = useState([]);

  const [loading1, setLoading1] = useState(false);
  const [loading2, setLoading2] = useState(false);
  const [loading3, setLoading3] = useState(false);

  const deviceId = currentDevice?.id || currentDevice?.deviceId || 'TILTM00001';

  // Helper to determine the device's latest available anchor timestamp
  const getDeviceAnchorTime = useCallback(() => {
    if (currentDevice?.timestamp) {
      const dt = new Date(currentDevice.timestamp);
      if (!isNaN(dt.getTime())) return dt;
    }
    if (currentDevice?.lastSeen) {
      const dt = new Date(currentDevice.lastSeen);
      if (!isNaN(dt.getTime())) return dt;
    }
    return new Date();
  }, [currentDevice?.timestamp, currentDevice?.lastSeen]);

  const mapTelemetryPoint = useCallback((pt) => {
    const ts = pt.timestamp || pt.time;
    return {
      time: formatTimeString(ts),
      fullTime: formatFullDateTime(ts),
      timestamp: ts,
      resultant: Number(parseFloat(pt.resultant ?? pt.resultantTilt ?? pt.tilt ?? 0.18).toFixed(3)),
      xTilt: Number(parseFloat(pt.xTilt ?? pt.tiltX ?? pt.roll ?? 0.15).toFixed(3)),
      yTilt: Number(parseFloat(pt.yTilt ?? pt.tiltY ?? pt.pitch ?? -0.09).toFixed(3)),
      totalDisp: Number(parseFloat(pt.totalDisp ?? pt.totalDisplacement ?? pt.displacement?.totalDisplacement_mm ?? 4.65).toFixed(3)),
      xDisp: Number(parseFloat(pt.xDisp ?? pt.xDisplacement ?? pt.displacement?.xDisplacement_mm ?? 0.14).toFixed(3)),
      yDisp: Number(parseFloat(pt.yDisp ?? pt.yDisplacement ?? pt.displacement?.yDisplacement_mm ?? 4.60).toFixed(3)),
      zDisp: Number(parseFloat(pt.zDisp ?? pt.zDisplacement ?? pt.displacement?.zDisplacement_mm ?? 0.12).toFixed(3)),
      peakG: Number(parseFloat(pt.peakG ?? pt.vibPeak ?? pt.vibrationPeak ?? (pt.accMag ? pt.accMag / 10 : 0.18)).toFixed(3)),
      vibRMS: Number(parseFloat(pt.vibRMS ?? pt.vibrationRMS ?? 0.045).toFixed(4)),
      accMag: Number(parseFloat(pt.accMag ?? 0.982).toFixed(3)),
    };
  }, []);

  // Fetch historical data for a specific range window
  const fetchChartData = useCallback(async (rangeKey, setData, setLoading) => {
    if (!deviceId) return;
    setLoading(true);

    const rangeObj = RANGES.find(r => r.id === rangeKey) || RANGES[3];
    const end = getDeviceAnchorTime();
    const start = new Date(end.getTime() - rangeObj.hours * 60 * 60 * 1000);

    try {
      const res = await getDeviceTelemetry(deviceId, start.toISOString(), end.toISOString());
      if (res?.history && res.history.length > 0) {
        const seen = new Set();
        const cleanList = [];
        for (const pt of res.history) {
          const ts = pt.timestamp || pt.time;
          if (ts && seen.has(ts)) continue;
          if (ts) seen.add(ts);
          cleanList.push(mapTelemetryPoint(pt));
        }
        setData(cleanList);
      } else {
        // If empty history, fallback to current telemetry point or parsed state
        const single = mapTelemetryPoint(currentDevice || { id: deviceId });
        setData([single]);
      }
    } catch (err) {
      const single = mapTelemetryPoint(currentDevice || { id: deviceId });
      setData([single]);
    } finally {
      setLoading(false);
    }
  }, [deviceId, getDeviceAnchorTime, mapTelemetryPoint, currentDevice]);

  // Load telemetry for chart 1 (Tilt)
  useEffect(() => {
    fetchChartData(range1, setData1, setLoading1);
  }, [deviceId, range1, fetchChartData]);

  // Load telemetry for chart 2 (Displacement)
  useEffect(() => {
    fetchChartData(range2, setData2, setLoading2);
  }, [deviceId, range2, fetchChartData]);

  // Load telemetry for chart 3 (Peak G / Vibration)
  useEffect(() => {
    fetchChartData(range3, setData3, setLoading3);
  }, [deviceId, range3, fetchChartData]);

  // Subscribe to live telemetry stream and append incoming points without duplicates
  useEffect(() => {
    if (!deviceId) return;

    const unsubscribe = telemetryService.subscribe((packet) => {
      if (!packet) return;
      const targetId = packet.deviceId || packet.id;
      if (targetId === deviceId || !targetId) {
        const parsed = parseTelemetry(packet);
        const newPoint = mapTelemetryPoint(parsed);

        const appendHelper = (prev) => {
          if (prev.some(p => p.timestamp === newPoint.timestamp)) {
            return prev; // Skip duplicate timestamp
          }
          return [...prev, newPoint].slice(-100);
        };

        setData1(appendHelper);
        setData2(appendHelper);
        setData3(appendHelper);
      }
    }, deviceId);

    return () => {
      unsubscribe();
    };
  }, [deviceId, mapTelemetryPoint]);

  // Custom Chart Tooltip
  const CustomTooltip = ({ active, payload, label, unit = '' }) => {
    if (!active || !payload || !payload.length) return null;
    const fullTimeStr = payload[0]?.payload?.fullTime || label;

    return (
      <div className="bg-white/95 backdrop-blur-md p-2.5 rounded-xl border border-slate-200 shadow-lg text-[11px] font-mono z-50">
        <div className="text-slate-500 font-semibold mb-1 text-[10px] pb-1 border-b border-slate-100">
          {fullTimeStr}
        </div>
        <div className="space-y-1">
          {payload.map((entry, idx) => (
            <div key={`item-${idx}`} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5" style={{ color: entry.color }}>
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                <span>{entry.name}:</span>
              </span>
              <span className="font-bold text-slate-800">
                {entry.value} {unit}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
      {/* Chart 1: TILT (°) VS TIME */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 flex flex-col justify-between shadow-xs">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-2">
          <div className="flex items-center gap-2">
            <div className="text-[10px] font-black text-slate-800 uppercase font-mono tracking-wider">
              TILT (°) VS TIME
            </div>
            {loading1 && <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-ping" />}
          </div>
          <div className="flex items-center gap-1">
            {RANGES.map(r => (
              <button
                key={r.id}
                onClick={() => setRange1(r.id)}
                className={`px-1.5 py-0.5 text-[9px] font-mono font-bold rounded transition-colors cursor-pointer ${
                  range1 === r.id ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <div className="h-44 w-full relative">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data1}>
              <CartesianGrid stroke="#f8fafc" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="time" stroke="#94a3b8" tick={{ fontSize: 9 }} minTickGap={15} />
              <YAxis stroke="#94a3b8" tick={{ fontSize: 9 }} domain={['auto', 'auto']} />
              <Tooltip content={<CustomTooltip unit="°" />} />
              <Line type="monotone" dataKey="resultant" name="Resultant" stroke="#8b5cf6" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="xTilt" name="X Tilt" stroke="#3b82f6" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="yTilt" name="Y Tilt" stroke="#10b981" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-4 pt-2 border-t border-slate-50 text-[10px] font-semibold text-slate-600 font-mono">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 bg-purple-500 rounded-full" />
            <span>Resultant</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 bg-blue-500 rounded-full" />
            <span>X Tilt</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 bg-emerald-500 rounded-full" />
            <span>Y Tilt</span>
          </span>
        </div>
      </div>

      {/* Chart 2: DISPLACEMENT (MM) VS TIME */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 flex flex-col justify-between shadow-xs">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-2">
          <div className="flex items-center gap-2">
            <div className="text-[10px] font-black text-slate-800 uppercase font-mono tracking-wider">
              DISPLACEMENT (MM) VS TIME
            </div>
            {loading2 && <span className="w-1.5 h-1.5 rounded-full bg-pink-500 animate-ping" />}
          </div>
          <div className="flex items-center gap-1">
            {RANGES.map(r => (
              <button
                key={r.id}
                onClick={() => setRange2(r.id)}
                className={`px-1.5 py-0.5 text-[9px] font-mono font-bold rounded transition-colors cursor-pointer ${
                  range2 === r.id ? 'bg-pink-600 text-white' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <div className="h-44 w-full relative">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data2}>
              <CartesianGrid stroke="#f8fafc" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="time" stroke="#94a3b8" tick={{ fontSize: 9 }} minTickGap={15} />
              <YAxis stroke="#94a3b8" tick={{ fontSize: 9 }} domain={['auto', 'auto']} />
              <Tooltip content={<CustomTooltip unit="mm" />} />
              <Line type="monotone" dataKey="totalDisp" name="Total Disp" stroke="#ec4899" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="xDisp" name="X Disp" stroke="#06b6d4" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="yDisp" name="Y Disp" stroke="#f59e0b" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-4 pt-2 border-t border-slate-50 text-[10px] font-semibold text-slate-600 font-mono">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 bg-pink-500 rounded-full" />
            <span>Total Disp</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 bg-cyan-500 rounded-full" />
            <span>X Disp</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 bg-amber-500 rounded-full" />
            <span>Y Disp</span>
          </span>
        </div>
      </div>

      {/* Chart 3: PEAK G VS TIME */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 flex flex-col justify-between shadow-xs">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-2">
          <div className="flex items-center gap-2">
            <div className="text-[10px] font-black text-slate-800 uppercase font-mono tracking-wider">
              PEAK G VS TIME
            </div>
            {loading3 && <span className="w-1.5 h-1.5 rounded-full bg-slate-700 animate-ping" />}
          </div>
          <div className="flex items-center gap-1">
            {RANGES.map(r => (
              <button
                key={r.id}
                onClick={() => setRange3(r.id)}
                className={`px-1.5 py-0.5 text-[9px] font-mono font-bold rounded transition-colors cursor-pointer ${
                  range3 === r.id ? 'bg-slate-900 text-white' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <div className="h-44 w-full relative">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data3}>
              <CartesianGrid stroke="#f8fafc" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="time" stroke="#94a3b8" tick={{ fontSize: 9 }} minTickGap={15} />
              <YAxis stroke="#94a3b8" tick={{ fontSize: 9 }} domain={['auto', 'auto']} />
              <Tooltip content={<CustomTooltip unit="g" />} />
              <Line type="monotone" dataKey="peakG" name="Peak G" stroke="#0f172a" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="vibRMS" name="Vib RMS" stroke="#6366f1" strokeWidth={1.5} strokeDasharray="3 3" dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-4 pt-2 border-t border-slate-50 text-[10px] font-semibold text-slate-600 font-mono">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 bg-slate-900 rounded-full" />
            <span>Peak G</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 bg-indigo-500 rounded-full" />
            <span>Vib RMS</span>
          </span>
        </div>
      </div>
    </div>
  );
}
