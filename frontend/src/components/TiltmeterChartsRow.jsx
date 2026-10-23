import React, { useMemo } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { formatHHMM, formatFullDateTime } from '../utils/dateHelper';

// Custom Inclinometer Triangle with sensor waves icon matching screenshot
const TiltSensorIcon = () => (
  <svg className="w-5 h-5 text-slate-800 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 20L10 6l10 14H4z" />
    <path d="M11 5a3.5 3.5 0 0 1 3 2" />
    <path d="M12.5 3a6 6 0 0 1 5 3.5" />
  </svg>
);

// 4-Way Cross Arrow icon matching screenshot
const DisplacementIcon = () => (
  <svg className="w-5 h-5 text-slate-800 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2v20M2 12h20" />
    <path d="M12 2l-2.5 2.5M12 2l2.5 2.5" />
    <path d="M12 22l-2.5-2.5M12 22l2.5-2.5" />
    <path d="M2 12l2.5-2.5M2 12l2.5 2.5" />
    <path d="M22 12l-2.5-2.5M22 12l2.5 2.5" />
  </svg>
);

// Pulse / Activity Waveform icon matching screenshot
const AccelerationIcon = () => (
  <svg className="w-5 h-5 text-slate-800 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="2 12 6 12 9 4 15 20 18 12 22 12" />
  </svg>
);

// Thermometer icon matching screenshot
const TemperatureIcon = () => (
  <svg className="w-5 h-5 text-slate-800 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
  </svg>
);

// High-fidelity callout dot rendered ONLY on the very last data point with colored value badge
const renderCalloutDot = (dataKey, totalPoints, color, formatFn, yNudge = 0) => {
  return (props) => {
    const { cx, cy, index, payload } = props;
    if (index === totalPoints - 1 && cx !== undefined && cy !== undefined && !isNaN(cx) && !isNaN(cy)) {
      const val = payload?.[dataKey];
      if (val === undefined || val === null || isNaN(val)) return null;
      const formatted = formatFn ? formatFn(val) : String(val);
      return (
        <g key={`callout-${dataKey}-${index}`} className="pointer-events-none select-none">
          <circle cx={cx} cy={cy} r={3.8} fill={color} stroke="#ffffff" strokeWidth={1.5} />
          <text
            x={cx + 6}
            y={cy + 3.5 + yNudge}
            fill={color}
            fontSize={9.5}
            fontWeight="bold"
            fontFamily="monospace, system-ui, sans-serif"
            textAnchor="start"
          >
            {formatted}
          </text>
        </g>
      );
    }
    return null;
  };
};

// Custom Chart Tooltip with clean timestamps and colored badges
const CustomTooltip = ({ active, payload, label, unit = '', formatVal }) => {
  if (!active || !payload || !payload.length) return null;
  const fullTimeStr = payload[0]?.payload?.fullTime || `Time: ${label}`;

  return (
    <div className="bg-white/95 backdrop-blur-md p-2 rounded-xl border border-slate-200 shadow-lg text-[11px] font-mono z-50">
      <div className="text-slate-500 font-semibold mb-1 text-[10px] pb-1 border-b border-slate-100">
        {fullTimeStr}
      </div>
      <div className="space-y-1">
        {payload.map((entry, idx) => {
          const val = entry.value;
          const display = formatVal ? formatVal(val) : `${val >= 0 ? '+' : ''}${Number(val).toFixed(3)} ${unit}`;
          return (
            <div key={`item-${idx}`} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5" style={{ color: entry.color }}>
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                <span>{entry.name}:</span>
              </span>
              <span className="font-bold text-slate-800">
                {display}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default function TiltmeterChartsRow({ telemetryHistory = [], loading = false, currentDevice = null }) {
  const L = parseFloat(currentDevice?.gaugeLength_mm || currentDevice?.gaugeLength || 1000.0);
  const refX = parseFloat(currentDevice?.refThetaX ?? 0.0);
  const refY = parseFloat(currentDevice?.refThetaY ?? 0.0);
  const refZ = parseFloat(currentDevice?.refThetaZ ?? 0.0);
  const hasRef = Boolean(currentDevice?.hasReferenceZero || currentDevice?.calibrate);

  // Prepare cleaned and formatted data points using ClinoX Reference-Zero method
  const chartData = useMemo(() => {
    if (!telemetryHistory || telemetryHistory.length === 0) return [];
    return telemetryHistory.map(pt => {
      const ts = pt.timestamp || pt.time;
      const rawX = parseFloat(pt.xTilt ?? pt.tiltX ?? pt.roll ?? 0) || 0;
      const rawY = parseFloat(pt.yTilt ?? pt.tiltY ?? pt.pitch ?? 0) || 0;
      const rawZ = parseFloat(pt.zTilt ?? pt.tiltZ ?? pt.resultant ?? pt.resultantTilt ?? 0) || 0;

      // Relative tilt change: If pt.xTilt is defined (stored from DB or ingestion), it is already relative to reference zero or zeroed!
      const xT = (pt.deltaThetaX !== undefined) ? pt.deltaThetaX : (pt.xTilt !== undefined ? rawX : (hasRef ? rawX - refX : rawX));
      const yT = (pt.deltaThetaY !== undefined) ? pt.deltaThetaY : (pt.yTilt !== undefined ? rawY : (hasRef ? rawY - refY : rawY));
      const zT = (pt.zTilt !== undefined) ? rawZ : (hasRef ? rawZ - refZ : rawZ);

      // ClinoX Primary conversion formula: D = L * tan(Δθ * π / 180)
      const radX = (xT * Math.PI) / 180.0;
      const radY = (yT * Math.PI) / 180.0;
      const clinoDx = L * Math.tan(radX);
      const clinoDy = L * Math.tan(radY);

      // Estimated lateral displacement (mm): use stored displacement directly when present
      const xD = (pt.xDisp !== undefined && pt.xDisp !== null) ? parseFloat(pt.xDisp) : (pt.xDisplacement !== undefined && pt.xDisplacement !== null ? parseFloat(pt.xDisplacement) : clinoDx);
      const yD = (pt.yDisp !== undefined && pt.yDisp !== null) ? parseFloat(pt.yDisp) : (pt.yDisplacement !== undefined && pt.yDisplacement !== null ? parseFloat(pt.yDisplacement) : clinoDy);

      // Acceleration: convert to g if > 3
      const rawAx = parseFloat(pt.axG ?? pt.ax ?? pt.acceleration?.ax ?? pt.acceleration?.x ?? 0.012) || 0.012;
      const rawAy = parseFloat(pt.ayG ?? pt.ay ?? pt.acceleration?.ay ?? pt.acceleration?.y ?? -0.006) || -0.006;
      const rawAz = parseFloat(pt.azG ?? pt.az ?? pt.acceleration?.az ?? pt.acceleration?.z ?? 0.998) || 0.998;

      const axG = Math.abs(rawAx) > 3.0 ? rawAx / 9.80665 : rawAx;
      const ayG = Math.abs(rawAy) > 3.0 ? rawAy / 9.80665 : rawAy;
      const azG = Math.abs(rawAz) > 3.0 ? rawAz / 9.80665 : rawAz;

      const tempVal = parseFloat(pt.temp ?? pt.temperature ?? pt.environment?.temperature ?? 26.4) || 26.4;

      return {
        ...pt,
        time: pt.time && pt.time.length <= 5 ? pt.time : formatHHMM(ts),
        fullTime: pt.fullTime || formatFullDateTime(ts),
        xTilt: Number(xT.toFixed(4)),
        yTilt: Number(yT.toFixed(4)),
        zTilt: Number(zT.toFixed(4)),
        xDisp: Number(xD.toFixed(3)),
        yDisp: Number(yD.toFixed(3)),
        axG: Number(axG.toFixed(3)),
        ayG: Number(ayG.toFixed(3)),
        azG: Number(azG.toFixed(3)),
        temp: Number(tempVal.toFixed(1)),
      };
    });
  }, [telemetryHistory, L, refX, refY, refZ, hasRef]);

  const totalPoints = chartData.length;
  const lastPt = totalPoints > 0 ? chartData[totalPoints - 1] : null;

  // Chart 1: Dynamic smart vertical offsets for Tilt (X, Y, Z) to prevent text collision
  const tiltOffsets = useMemo(() => {
    if (!lastPt) return { x: -2, y: 2, z: 0 };
    const items = [
      { key: 'x', val: lastPt.xTilt },
      { key: 'y', val: lastPt.yTilt },
      { key: 'z', val: lastPt.zTilt },
    ].sort((a, b) => b.val - a.val); // Descending

    const offsets = { x: 0, y: 0, z: 0 };
    if (Math.abs(items[0].val - items[1].val) < 0.25 || Math.abs(items[1].val - items[2].val) < 0.25) {
      offsets[items[0].key] = -7;
      offsets[items[1].key] = 0;
      offsets[items[2].key] = 8;
    } else {
      offsets.x = -2;
      offsets.y = 2;
      offsets.z = 0;
    }
    return offsets;
  }, [lastPt]);

  // Chart 2: Dynamic smart vertical offsets for Displacement (X, Y)
  const dispOffsets = useMemo(() => {
    if (!lastPt) return { x: 0, y: 0 };
    const diff = lastPt.xDisp - lastPt.yDisp;
    if (Math.abs(diff) < 0.8) {
      return diff >= 0 ? { x: -5, y: 7 } : { x: 7, y: -5 };
    }
    return { x: 0, y: 0 };
  }, [lastPt]);

  // Chart 3: Dynamic smart vertical offsets for Acceleration (X, Y, Z)
  const accelOffsets = useMemo(() => {
    if (!lastPt) return { z: 0, x: -5, y: 7 };
    const diffXY = lastPt.axG - lastPt.ayG;
    const offsets = { z: 0, x: -5, y: 7 };
    if (Math.abs(diffXY) < 0.2) {
      if (lastPt.axG >= lastPt.ayG) {
        offsets.x = -6;
        offsets.y = 8;
      } else {
        offsets.x = 8;
        offsets.y = -6;
      }
    }
    return offsets;
  }, [lastPt]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* ─────────────────────────────────────────────────────────────
          CHART 1: X / Y / Z Tilt Change (°)
      ───────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-xs flex flex-col justify-between">
        {/* Card Header: Icon & Title & Reference Status */}
        <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <TiltSensorIcon />
            <h3 className="font-bold text-slate-800 text-[13px] tracking-tight">
              X / Y / Z Tilt Change (°)
            </h3>
          </div>
          {hasRef && (
            <span className="text-[9px] font-mono font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
              Ref Zero
            </span>
          )}
        </div>

        {/* Top Centered Legend */}
        <div className="flex items-center justify-center gap-4 py-1.5 text-xs font-semibold">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#0284c7]" />
            <span className="text-slate-700">X</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#0d9488]" />
            <span className="text-slate-700">Y</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#ea580c]" />
            <span className="text-slate-700">Z</span>
          </span>
        </div>

        {/* Chart Body */}
        <div className="h-56 w-full relative">
          {totalPoints === 0 ? (
            <div className="h-full w-full flex items-center justify-center text-slate-400 text-xs font-mono">
              {loading ? 'Loading tilt records...' : 'No telemetry data available'}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 12, right: 62, left: -10, bottom: 18 }}>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="2 2" />
                <XAxis
                  dataKey="time"
                  stroke="#64748b"
                  tick={{ fontSize: 9.5, fill: '#64748b' }}
                  minTickGap={16}
                  label={{ value: 'Time (hh:mm)', position: 'insideBottom', offset: -12, style: { fontSize: 9.5, fill: '#64748b', fontWeight: 600, textAnchor: 'middle' } }}
                />
                <YAxis
                  stroke="#64748b"
                  tick={{ fontSize: 9.5, fill: '#64748b' }}
                  domain={['auto', 'auto']}
                  tickFormatter={(v) => Number(v).toFixed(2)}
                  label={{ value: 'Tilt Change (°)', angle: -90, position: 'insideLeft', offset: 18, style: { fontSize: 9.5, fill: '#64748b', fontWeight: 600, textAnchor: 'middle' } }}
                />
                <Tooltip
                  content={
                    <CustomTooltip
                      unit="°"
                      formatVal={(v) => `${v >= 0 ? '+' : ''}${Number(v).toFixed(3)}°`}
                    />
                  }
                />
                <Line
                  type="monotone"
                  dataKey="xTilt"
                  name="X"
                  stroke="#0284c7"
                  strokeWidth={2}
                  isAnimationActive={false}
                  dot={renderCalloutDot('xTilt', totalPoints, '#0284c7', (v) => `${v >= 0 ? '+' : ''}${Number(v).toFixed(3)}°`, tiltOffsets.x)}
                />
                <Line
                  type="monotone"
                  dataKey="yTilt"
                  name="Y"
                  stroke="#0d9488"
                  strokeWidth={2}
                  isAnimationActive={false}
                  dot={renderCalloutDot('yTilt', totalPoints, '#0d9488', (v) => `${v >= 0 ? '+' : ''}${Number(v).toFixed(3)}°`, tiltOffsets.y)}
                />
                <Line
                  type="monotone"
                  dataKey="zTilt"
                  name="Z"
                  stroke="#ea580c"
                  strokeWidth={2}
                  isAnimationActive={false}
                  dot={renderCalloutDot('zTilt', totalPoints, '#ea580c', (v) => `${v >= 0 ? '+' : ''}${Number(v).toFixed(3)}°`, tiltOffsets.z)}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          CHART 2: X / Y Displacement (mm)
      ───────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-xs flex flex-col justify-between">
        {/* Card Header: Icon & Title */}
        <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <DisplacementIcon />
            <h3 className="font-bold text-slate-800 text-[13px] tracking-tight">
              X / Y Displacement (mm)
            </h3>
          </div>
        </div>

        {/* Top Centered Legend (Only X and Y as in screenshot) */}
        <div className="flex items-center justify-center gap-4 py-1.5 text-xs font-semibold">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#0284c7]" />
            <span className="text-slate-700">X</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#0d9488]" />
            <span className="text-slate-700">Y</span>
          </span>
        </div>

        {/* Chart Body */}
        <div className="h-56 w-full relative">
          {totalPoints === 0 ? (
            <div className="h-full w-full flex items-center justify-center text-slate-400 text-xs font-mono">
              {loading ? 'Loading displacement records...' : 'No telemetry data available'}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 12, right: 62, left: -10, bottom: 18 }}>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="2 2" />
                <XAxis
                  dataKey="time"
                  stroke="#64748b"
                  tick={{ fontSize: 9.5, fill: '#64748b' }}
                  minTickGap={16}
                  label={{ value: 'Time (hh:mm)', position: 'insideBottom', offset: -12, style: { fontSize: 9.5, fill: '#64748b', fontWeight: 600, textAnchor: 'middle' } }}
                />
                <YAxis
                  stroke="#64748b"
                  tick={{ fontSize: 9.5, fill: '#64748b' }}
                  domain={['auto', 'auto']}
                  tickFormatter={(v) => Number(v).toFixed(1)}
                  label={{ value: 'Displacement (mm)', angle: -90, position: 'insideLeft', offset: 18, style: { fontSize: 9.5, fill: '#64748b', fontWeight: 600, textAnchor: 'middle' } }}
                />
                <Tooltip
                  content={
                    <CustomTooltip
                      unit="mm"
                      formatVal={(v) => `${v >= 0 ? '+' : ''}${Number(v).toFixed(2)} mm`}
                    />
                  }
                />
                <Line
                  type="monotone"
                  dataKey="xDisp"
                  name="X"
                  stroke="#0284c7"
                  strokeWidth={2}
                  isAnimationActive={false}
                  dot={renderCalloutDot('xDisp', totalPoints, '#0284c7', (v) => `${v >= 0 ? '+' : ''}${Number(v).toFixed(2)} mm`, dispOffsets.x)}
                />
                <Line
                  type="monotone"
                  dataKey="yDisp"
                  name="Y"
                  stroke="#0d9488"
                  strokeWidth={2}
                  isAnimationActive={false}
                  dot={renderCalloutDot('yDisp', totalPoints, '#0d9488', (v) => `${v >= 0 ? '+' : ''}${Number(v).toFixed(2)} mm`, dispOffsets.y)}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          CHART 3: X / Y / Z Acceleration (g)
      ───────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-xs flex flex-col justify-between">
        {/* Card Header: Icon & Title */}
        <div className="flex items-center gap-2 pb-1.5 border-b border-slate-100">
          <AccelerationIcon />
          <h3 className="font-bold text-slate-800 text-[13px] tracking-tight">
            X / Y / Z Acceleration (g)
          </h3>
        </div>

        {/* Top Centered Legend */}
        <div className="flex items-center justify-center gap-4 py-1.5 text-xs font-semibold">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#0284c7]" />
            <span className="text-slate-700">X</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#0d9488]" />
            <span className="text-slate-700">Y</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#ea580c]" />
            <span className="text-slate-700">Z</span>
          </span>
        </div>

        {/* Chart Body */}
        <div className="h-56 w-full relative">
          {totalPoints === 0 ? (
            <div className="h-full w-full flex items-center justify-center text-slate-400 text-xs font-mono">
              {loading ? 'Loading acceleration records...' : 'No telemetry data available'}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 12, right: 62, left: -10, bottom: 18 }}>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="2 2" />
                <XAxis
                  dataKey="time"
                  stroke="#64748b"
                  tick={{ fontSize: 9.5, fill: '#64748b' }}
                  minTickGap={16}
                  label={{ value: 'Time (hh:mm)', position: 'insideBottom', offset: -12, style: { fontSize: 9.5, fill: '#64748b', fontWeight: 600, textAnchor: 'middle' } }}
                />
                <YAxis
                  stroke="#64748b"
                  tick={{ fontSize: 9.5, fill: '#64748b' }}
                  domain={['auto', 'auto']}
                  tickFormatter={(v) => Number(v).toFixed(1)}
                  label={{ value: 'Acceleration (g)', angle: -90, position: 'insideLeft', offset: 18, style: { fontSize: 9.5, fill: '#64748b', fontWeight: 600, textAnchor: 'middle' } }}
                />
                <Tooltip
                  content={
                    <CustomTooltip
                      unit="g"
                      formatVal={(v) => `${v >= 0 ? '+' : ''}${Number(v).toFixed(3)} g`}
                    />
                  }
                />
                <Line
                  type="monotone"
                  dataKey="azG"
                  name="Z"
                  stroke="#ea580c"
                  strokeWidth={2}
                  isAnimationActive={false}
                  dot={renderCalloutDot('azG', totalPoints, '#ea580c', (v) => `${v >= 0 ? '+' : ''}${Number(v).toFixed(3)} g`, accelOffsets.z)}
                />
                <Line
                  type="monotone"
                  dataKey="axG"
                  name="X"
                  stroke="#0284c7"
                  strokeWidth={2}
                  isAnimationActive={false}
                  dot={renderCalloutDot('axG', totalPoints, '#0284c7', (v) => `${v >= 0 ? '+' : ''}${Number(v).toFixed(3)} g`, accelOffsets.x)}
                />
                <Line
                  type="monotone"
                  dataKey="ayG"
                  name="Y"
                  stroke="#0d9488"
                  strokeWidth={2}
                  isAnimationActive={false}
                  dot={renderCalloutDot('ayG', totalPoints, '#0d9488', (v) => `${v >= 0 ? '+' : ''}${Number(v).toFixed(3)} g`, accelOffsets.y)}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          CHART 4: Temperature (°C)
      ───────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-xs flex flex-col justify-between">
        {/* Card Header: Icon & Title */}
        <div className="flex items-center gap-2 pb-1.5 border-b border-slate-100">
          <TemperatureIcon />
          <h3 className="font-bold text-slate-800 text-[13px] tracking-tight">
            Temperature (°C)
          </h3>
        </div>

        {/* Top Spacer to align with legends of other 3 charts */}
        <div className="flex items-center justify-center py-1.5 text-xs font-semibold h-[24px]">
          <span className="w-2.5 h-0.5 bg-transparent" />
        </div>

        {/* Chart Body */}
        <div className="h-56 w-full relative">
          {totalPoints === 0 ? (
            <div className="h-full w-full flex items-center justify-center text-slate-400 text-xs font-mono">
              {loading ? 'Loading temperature records...' : 'No telemetry data available'}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 12, right: 62, left: -10, bottom: 18 }}>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="2 2" />
                <XAxis
                  dataKey="time"
                  stroke="#64748b"
                  tick={{ fontSize: 9.5, fill: '#64748b' }}
                  minTickGap={16}
                  label={{ value: 'Time (hh:mm)', position: 'insideBottom', offset: -12, style: { fontSize: 9.5, fill: '#64748b', fontWeight: 600, textAnchor: 'middle' } }}
                />
                <YAxis
                  stroke="#64748b"
                  tick={{ fontSize: 9.5, fill: '#64748b' }}
                  domain={['auto', 'auto']}
                  tickFormatter={(v) => Math.round(v)}
                  label={{ value: 'Temperature (°C)', angle: -90, position: 'insideLeft', offset: 18, style: { fontSize: 9.5, fill: '#64748b', fontWeight: 600, textAnchor: 'middle' } }}
                />
                <Tooltip
                  content={
                    <CustomTooltip
                      unit="°C"
                      formatVal={(v) => `${Number(v).toFixed(1)} °C`}
                    />
                  }
                />
                <Line
                  type="monotone"
                  dataKey="temp"
                  name="Temperature"
                  stroke="#9333ea"
                  strokeWidth={2}
                  isAnimationActive={false}
                  dot={renderCalloutDot('temp', totalPoints, '#9333ea', (v) => `${Number(v).toFixed(1)} °C`, 0)}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
