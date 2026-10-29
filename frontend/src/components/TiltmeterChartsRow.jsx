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
          const display = formatVal ? formatVal(val) : `${val >= 0 ? '+' : ''}${Number(val).toFixed(1)} ${unit}`;
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
      // 1. Axis Mapping:
      // X-Axis: tilt.roll
      // Y-Axis: tilt.pitch
      // Z-Axis: tilt.yaw
      // Do not use the combined tilt.tilt value as an individual X, Y, or Z axis value.
      const currentRoll = pt.tilt?.roll ?? pt.roll;
      const currentPitch = pt.tilt?.pitch ?? pt.pitch;
      const currentYaw = pt.tilt?.yaw ?? pt.yaw;

      // 2. Present Value:
      // Display the actual angle values received from the device without subtracting the reference angle.
      const presentX = (currentRoll !== undefined && currentRoll !== null && !isNaN(parseFloat(currentRoll))) ? parseFloat(currentRoll) : 0.0;
      const presentY = (currentPitch !== undefined && currentPitch !== null && !isNaN(parseFloat(currentPitch))) ? parseFloat(currentPitch) : 0.0;
      const presentZ = (currentYaw !== undefined && currentYaw !== null && !isNaN(parseFloat(currentYaw))) ? parseFloat(currentYaw) : 0.0;

      // 3. Delta Value:
      // Delta represents the change in angle relative to the zero reference angle (0.0°).
      // Delta X = Current Roll − Reference Roll
      // Delta Y = Current Pitch − Reference Pitch
      // Delta Z = Current Yaw − Reference Yaw
      // Initially, all reference angles are 0.0°. If a calibrated reference is configured later, use that stored reference for the calculation.
      const deltaX = presentX - refX;
      const deltaY = presentY - refY;
      const deltaZ = presentZ - refZ;

      const xT = deltaX;
      const yT = deltaY;
      const zT = deltaZ;

      // Device-provided displacement data:
      const rawDisp = pt.displacement || pt.rawPayload?.displacement || {};
      const rawXDisp = rawDisp.xDisplacement_mm ?? pt.xDisplacement_mm ?? pt.xDisp ?? pt.xDisplacement;
      const rawYDisp = rawDisp.yDisplacement_mm ?? pt.yDisplacement_mm ?? pt.yDisp ?? pt.yDisplacement;
      const rawZDisp = rawDisp.zDisplacement_mm ?? pt.zDisplacement_mm ?? pt.zDisp ?? pt.zDisplacement;
      const rawTotalDisp = rawDisp.totalDisplacement_mm ?? pt.totalDisplacement_mm ?? pt.totalDisp ?? pt.totalDisplacement;

      const xD = (rawXDisp !== undefined && rawXDisp !== null && !isNaN(parseFloat(rawXDisp))) ? parseFloat(rawXDisp) : 0.0;
      const yD = (rawYDisp !== undefined && rawYDisp !== null && !isNaN(parseFloat(rawYDisp))) ? parseFloat(rawYDisp) : 0.0;
      const zD = (rawZDisp !== undefined && rawZDisp !== null && !isNaN(parseFloat(rawZDisp))) ? parseFloat(rawZDisp) : 0.0;
      const totalD = (rawTotalDisp !== undefined && rawTotalDisp !== null && !isNaN(parseFloat(rawTotalDisp))) ? parseFloat(rawTotalDisp) : 0.0;

      // Acceleration: convert to g if > 3 (no dummy fallbacks)
      const rawAxRaw = pt.axG ?? pt.ax ?? pt.acceleration?.ax ?? pt.acceleration?.x ?? null;
      const rawAyRaw = pt.ayG ?? pt.ay ?? pt.acceleration?.ay ?? pt.acceleration?.y ?? null;
      const rawAzRaw = pt.azG ?? pt.az ?? pt.acceleration?.az ?? pt.acceleration?.z ?? null;

      const rawAx = rawAxRaw !== null && !isNaN(parseFloat(rawAxRaw)) ? parseFloat(rawAxRaw) : null;
      const rawAy = rawAyRaw !== null && !isNaN(parseFloat(rawAyRaw)) ? parseFloat(rawAyRaw) : null;
      const rawAz = rawAzRaw !== null && !isNaN(parseFloat(rawAzRaw)) ? parseFloat(rawAzRaw) : null;

      const axG = rawAx !== null ? (Math.abs(rawAx) > 3.0 ? rawAx / 9.80665 : rawAx) : null;
      const ayG = rawAy !== null ? (Math.abs(rawAy) > 3.0 ? rawAy / 9.80665 : rawAy) : null;
      const azG = rawAz !== null ? (Math.abs(rawAz) > 3.0 ? rawAz / 9.80665 : rawAz) : null;

      const rawTemp = pt.temp ?? pt.temperature ?? pt.environment?.temperature ?? null;
      const tempVal = rawTemp !== null && !isNaN(parseFloat(rawTemp)) ? parseFloat(rawTemp) : null;

      return {
        ...pt,
        time: pt.time && pt.time.length <= 5 ? pt.time : formatHHMM(ts),
        fullTime: pt.fullTime || formatFullDateTime(ts),
        presentX,
        presentY,
        presentZ,
        deltaX,
        deltaY,
        deltaZ,
        xTilt: Number(xT.toFixed(2)),
        yTilt: Number(yT.toFixed(2)),
        zTilt: Number(zT.toFixed(2)),
        xDisp: Number(xD.toFixed(2)),
        yDisp: Number(yD.toFixed(2)),
        zDisp: Number(zD.toFixed(2)),
        totalDisp: Number(totalD.toFixed(2)),
        axG: axG !== null ? Number(axG.toFixed(2)) : null,
        ayG: ayG !== null ? Number(ayG.toFixed(2)) : null,
        azG: azG !== null ? Number(azG.toFixed(2)) : null,
        temp: tempVal !== null ? Number(tempVal.toFixed(1)) : null,
      };
    });
  }, [telemetryHistory, L, refX, refY, refZ, hasRef]);

  const totalPoints = chartData.length;
  const lastPt = totalPoints > 0 ? chartData[totalPoints - 1] : null;

  const hasAccelData = useMemo(() => {
    return chartData.some(p => p.axG !== null || p.ayG !== null || p.azG !== null);
  }, [chartData]);

  const hasTempData = useMemo(() => {
    return chartData.some(p => p.temp !== null);
  }, [chartData]);

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

  // Chart 2: Dynamic smart vertical offsets for Displacement (X, Y, Z)
  const dispOffsets = useMemo(() => {
    if (!lastPt) return { x: 0, y: 0, z: 0 };
    const items = [
      { key: 'x', val: lastPt.xDisp || 0 },
      { key: 'y', val: lastPt.yDisp || 0 },
      { key: 'z', val: lastPt.zDisp || 0 },
    ].sort((a, b) => b.val - a.val);

    const offsets = { x: 0, y: 0, z: 0 };
    if (Math.abs(items[0].val - items[1].val) < 0.5 || Math.abs(items[1].val - items[2].val) < 0.5) {
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

  // Chart 3: Dynamic smart vertical offsets for Acceleration (X, Y, Z)
  const accelOffsets = useMemo(() => {
    if (!lastPt || lastPt.axG === null || lastPt.ayG === null) return { z: 0, x: -5, y: 7 };
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
                  tickFormatter={(v) => Number(v).toFixed(1)}
                  label={{ value: 'Tilt Change (°)', angle: -90, position: 'insideLeft', offset: 18, style: { fontSize: 9.5, fill: '#64748b', fontWeight: 600, textAnchor: 'middle' } }}
                />
                <Tooltip
                  content={
                    <CustomTooltip
                      unit="°"
                      formatVal={(v) => `${v >= 0 ? '+' : ''}${Number(v).toFixed(1)}°`}
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
                  dot={renderCalloutDot('xTilt', totalPoints, '#0284c7', (v) => `${v >= 0 ? '+' : ''}${Number(v).toFixed(1)}°`, tiltOffsets.x)}
                />
                <Line
                  type="monotone"
                  dataKey="yTilt"
                  name="Y"
                  stroke="#0d9488"
                  strokeWidth={2}
                  isAnimationActive={false}
                  dot={renderCalloutDot('yTilt', totalPoints, '#0d9488', (v) => `${v >= 0 ? '+' : ''}${Number(v).toFixed(1)}°`, tiltOffsets.y)}
                />
                <Line
                  type="monotone"
                  dataKey="zTilt"
                  name="Z"
                  stroke="#ea580c"
                  strokeWidth={2}
                  isAnimationActive={false}
                  dot={renderCalloutDot('zTilt', totalPoints, '#ea580c', (v) => `${v >= 0 ? '+' : ''}${Number(v).toFixed(1)}°`, tiltOffsets.z)}
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
              X / Y / Z Displacement (mm)
            </h3>
          </div>
          {lastPt && typeof lastPt.totalDisp === 'number' && (
            <span className="text-[10px] font-mono font-bold text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded">
              Total: {lastPt.totalDisp.toFixed(2)} mm
            </span>
          )}
        </div>

        {/* Top Centered Legend */}
        <div className="flex items-center justify-center gap-4 py-1.5 text-xs font-semibold">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#0284c7]" />
            <span className="text-slate-700">DX</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#0d9488]" />
            <span className="text-slate-700">DY</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#ea580c]" />
            <span className="text-slate-700">DZ</span>
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
                      formatVal={(v) => `${Number(v).toFixed(2)} mm`}
                    />
                  }
                />
                <Line
                  type="monotone"
                  dataKey="xDisp"
                  name="DX"
                  stroke="#0284c7"
                  strokeWidth={2}
                  isAnimationActive={false}
                  dot={renderCalloutDot('xDisp', totalPoints, '#0284c7', (v) => `${Number(v).toFixed(2)} mm`, dispOffsets.x)}
                />
                <Line
                  type="monotone"
                  dataKey="yDisp"
                  name="DY"
                  stroke="#0d9488"
                  strokeWidth={2}
                  isAnimationActive={false}
                  dot={renderCalloutDot('yDisp', totalPoints, '#0d9488', (v) => `${Number(v).toFixed(2)} mm`, dispOffsets.y)}
                />
                <Line
                  type="monotone"
                  dataKey="zDisp"
                  name="DZ"
                  stroke="#ea580c"
                  strokeWidth={2}
                  isAnimationActive={false}
                  dot={renderCalloutDot('zDisp', totalPoints, '#ea580c', (v) => `${Number(v).toFixed(2)} mm`, dispOffsets.z)}
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
          {totalPoints === 0 || !hasAccelData ? (
            <div className="h-full w-full flex items-center justify-center text-slate-400 text-xs font-mono">
              {loading ? 'Loading acceleration records...' : (totalPoints === 0 ? 'No telemetry data available' : 'No acceleration data recorded')}
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
                      formatVal={(v) => `${v >= 0 ? '+' : ''}${Number(v).toFixed(1)} g`}
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
                  dot={renderCalloutDot('azG', totalPoints, '#ea580c', (v) => `${v >= 0 ? '+' : ''}${Number(v).toFixed(1)} g`, accelOffsets.z)}
                />
                <Line
                  type="monotone"
                  dataKey="axG"
                  name="X"
                  stroke="#0284c7"
                  strokeWidth={2}
                  isAnimationActive={false}
                  dot={renderCalloutDot('axG', totalPoints, '#0284c7', (v) => `${v >= 0 ? '+' : ''}${Number(v).toFixed(1)} g`, accelOffsets.x)}
                />
                <Line
                  type="monotone"
                  dataKey="ayG"
                  name="Y"
                  stroke="#0d9488"
                  strokeWidth={2}
                  isAnimationActive={false}
                  dot={renderCalloutDot('ayG', totalPoints, '#0d9488', (v) => `${v >= 0 ? '+' : ''}${Number(v).toFixed(1)} g`, accelOffsets.y)}
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
          {totalPoints === 0 || !hasTempData ? (
            <div className="h-full w-full flex items-center justify-center text-slate-400 text-xs font-mono">
              {loading ? 'Loading temperature records...' : (totalPoints === 0 ? 'No telemetry data available' : 'No temperature data recorded')}
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
