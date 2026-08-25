import React, { useState, useEffect } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { parseTelemetry } from '../utils/telemetryHelper';

const RANGES = ['1H', '6H', '12H', '24H', '7D', '30D'];

export default function TiltmeterChartsRow({ currentDevice }) {
  const [range1, setRange1] = useState('24H');
  const [range2, setRange2] = useState('24H');
  const [range3, setRange3] = useState('24H');

  const [liveHistory, setLiveHistory] = useState([
    { time: '14:20:00', resultant: 0.12, xTilt: 0.08, yTilt: -0.09, totalDisp: 4.60, xDisp: 0.12, yDisp: 4.59, peakG: 0.14 },
    { time: '14:21:00', resultant: 0.15, xTilt: 0.11, yTilt: -0.08, totalDisp: 4.62, xDisp: 0.13, yDisp: 4.60, peakG: 0.17 },
    { time: '14:22:00', resultant: 0.19, xTilt: 0.14, yTilt: -0.09, totalDisp: 4.65, xDisp: 0.15, yDisp: 4.63, peakG: 0.18 },
    { time: '14:23:00', resultant: 0.22, xTilt: 0.16, yTilt: -0.07, totalDisp: 4.68, xDisp: 0.16, yDisp: 4.65, peakG: 0.22 },
    { time: '14:24:00', resultant: 0.20, xTilt: 0.15, yTilt: -0.08, totalDisp: 4.66, xDisp: 0.15, yDisp: 4.64, peakG: 0.21 },
    { time: '14:25:00', resultant: 0.18, xTilt: 0.14, yTilt: -0.08, totalDisp: 4.64, xDisp: 0.14, yDisp: 4.62, peakG: 0.18 },
  ]);

  useEffect(() => {
    if (!currentDevice) return;
    const d = parseTelemetry(currentDevice);
    const timeStr = d.timestamp ? new Date(d.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString();

    setLiveHistory(prev => {
      const newPoint = {
        time: timeStr,
        resultant: parseFloat(d.resultantTilt?.toFixed(3)) || 0.18,
        xTilt: parseFloat(d.xTilt?.toFixed(3)) || 0.15,
        yTilt: parseFloat(d.yTilt?.toFixed(3)) || -0.09,
        totalDisp: parseFloat(d.totalDisplacement?.toFixed(3)) || 4.67,
        xDisp: parseFloat(d.xDisplacement?.toFixed(3)) || 0.12,
        yDisp: parseFloat(d.yDisplacement?.toFixed(3)) || 4.59,
        peakG: parseFloat((d.accMag ? d.accMag / 10 : d.vibPeak)?.toFixed(3)) || 0.18,
      };

      const updated = [...prev, newPoint];
      return updated.slice(-15); // keep latest 15 telemetry points
    });
  }, [currentDevice?.timestamp, currentDevice?.resultantTilt, currentDevice?.xTilt, currentDevice?.yTilt, currentDevice?.totalDisplacement, currentDevice?.tilt, currentDevice?.displacement]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
      {/* Chart 1: TILT (°) VS TIME */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 flex flex-col justify-between shadow-xs">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-2">
          <div className="text-[10px] font-black text-slate-800 uppercase font-mono tracking-wider">
            TILT (°) VS TIME
          </div>
          <div className="flex items-center gap-1">
            {RANGES.map(r => (
              <button
                key={r}
                onClick={() => setRange1(r)}
                className={`px-1.5 py-0.5 text-[9px] font-mono font-bold rounded transition-colors ${
                  range1 === r ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-700'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        <div className="h-44 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={liveHistory}>
              <CartesianGrid stroke="#f8fafc" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="time" stroke="#94a3b8" tick={{ fontSize: 9 }} />
              <YAxis stroke="#94a3b8" tick={{ fontSize: 9 }} domain={['auto', 'auto']} />
              <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 10 }} />
              <Line type="monotone" dataKey="resultant" stroke="#a855f7" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="xTilt" stroke="#3b82f6" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="yTilt" stroke="#10b981" strokeWidth={2} dot={false} isAnimationActive={false} />
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
          <div className="text-[10px] font-black text-slate-800 uppercase font-mono tracking-wider">
            DISPLACEMENT (MM) VS TIME
          </div>
          <div className="flex items-center gap-1">
            {RANGES.map(r => (
              <button
                key={r}
                onClick={() => setRange2(r)}
                className={`px-1.5 py-0.5 text-[9px] font-mono font-bold rounded transition-colors ${
                  range2 === r ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-700'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        <div className="h-44 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={liveHistory}>
              <CartesianGrid stroke="#f8fafc" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="time" stroke="#94a3b8" tick={{ fontSize: 9 }} />
              <YAxis stroke="#94a3b8" tick={{ fontSize: 9 }} domain={['auto', 'auto']} />
              <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 10 }} />
              <Line type="monotone" dataKey="totalDisp" stroke="#ec4899" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="xDisp" stroke="#06b6d4" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="yDisp" stroke="#f59e0b" strokeWidth={2} dot={false} isAnimationActive={false} />
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
          <div className="text-[10px] font-black text-slate-800 uppercase font-mono tracking-wider">
            PEAK G VS TIME
          </div>
          <div className="flex items-center gap-1">
            {RANGES.map(r => (
              <button
                key={r}
                onClick={() => setRange3(r)}
                className={`px-1.5 py-0.5 text-[9px] font-mono font-bold rounded transition-colors ${
                  range3 === r ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-700'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        <div className="h-44 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={liveHistory}>
              <CartesianGrid stroke="#f8fafc" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="time" stroke="#94a3b8" tick={{ fontSize: 9 }} />
              <YAxis stroke="#94a3b8" tick={{ fontSize: 9 }} domain={['auto', 'auto']} />
              <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 10 }} />
              <Line type="monotone" dataKey="peakG" stroke="#0f172a" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-4 pt-2 border-t border-slate-50 text-[10px] font-semibold text-slate-600 font-mono">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 bg-slate-900 rounded-full" />
            <span>Peak G</span>
          </span>
        </div>
      </div>
    </div>
  );
}
