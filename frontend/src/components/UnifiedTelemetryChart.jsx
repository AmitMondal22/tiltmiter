import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { TrendingUp } from 'lucide-react';
import { formatHHMM, formatFullDateTime } from '../utils/dateHelper';

const METRIC_OPTIONS = [
  { id: 'tilt', label: 'X / Y Tilt Change (°)', unit: '°' },
  { id: 'displacement', label: 'X / Y Displacement (mm)', unit: 'mm' },
  { id: 'acceleration', label: 'X / Y / Z Acceleration (g)', unit: 'g' },
  { id: 'temperature', label: 'Temperature (°C)', unit: '°C' },
];

const CHART_TYPES = [
  { id: 'line', label: 'Line' },
  { id: 'area', label: 'Area' },
  { id: 'bar', label: 'Bar' },
];

const parseNum = (v) => {
  if (v === null || v === undefined || v === '' || v === '--') return null;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return !isNaN(n) ? Number(n.toFixed(3)) : null;
};

export default function UnifiedTelemetryChart({ telemetryHistory = [], loading = false }) {
  const [metric, setMetric] = useState('tilt');
  const [chartType, setChartType] = useState('line');
  const [thickness, setThickness] = useState(2);
  const [colorPrimary, setColorPrimary] = useState('#2563eb');
  const [colorSecondary, setColorSecondary] = useState('#10b981');
  const [colorTertiary, setColorTertiary] = useState('#8b5cf6');

  const activeMetric = METRIC_OPTIONS.find(m => m.id === metric) || METRIC_OPTIONS[0];

  const chartData = useMemo(() => {
    if (!Array.isArray(telemetryHistory) || telemetryHistory.length === 0) return [];
    return telemetryHistory
      .map((pt) => {
        const ts = pt.timestamp || pt.time || pt.createdAt;
        const timeLabel = ts ? formatHHMM(ts) : '--';
        const fullTime = ts ? formatFullDateTime(ts) : '--';

        if (metric === 'tilt') {
          const x = parseNum(pt.tilt?.roll ?? pt.roll ?? pt.presentX ?? pt.xTilt ?? pt.deltaX);
          const y = parseNum(pt.tilt?.pitch ?? pt.pitch ?? pt.presentY ?? pt.yTilt ?? pt.deltaY);
          if (x === null && y === null) return null;
          return { timeLabel, fullTime, s1: x, s2: y };
        }

        if (metric === 'displacement') {
          const rawDisp = pt.displacement || pt.rawPayload?.displacement || {};
          const x = parseNum(rawDisp.xDisplacement_mm ?? pt.xDisplacement_mm ?? pt.xDisp ?? pt.xDisplacement);
          const y = parseNum(rawDisp.yDisplacement_mm ?? pt.yDisplacement_mm ?? pt.yDisp ?? pt.yDisplacement);
          if (x === null && y === null) return null;
          return { timeLabel, fullTime, s1: x, s2: y };
        }

        if (metric === 'acceleration') {
          const x = parseNum(pt.axG ?? pt.ax ?? pt.acceleration?.ax ?? pt.acceleration?.x);
          const y = parseNum(pt.ayG ?? pt.ay ?? pt.acceleration?.ay ?? pt.acceleration?.y);
          const z = parseNum(pt.azG ?? pt.az ?? pt.acceleration?.az ?? pt.acceleration?.z);
          if (x === null && y === null && z === null) return null;
          return { timeLabel, fullTime, s1: x, s2: y, s3: z };
        }

        const temp = parseNum(pt.environment?.temperature_c ?? pt.temperature ?? pt.temp);
        if (temp === null) return null;
        return { timeLabel, fullTime, s1: temp };
      })
      .filter(Boolean);
  }, [telemetryHistory, metric]);

  const seriesConfig = useMemo(() => {
    if (metric === 'tilt') {
      return [
        { key: 's1', name: 'Tilt X (°)', color: colorPrimary },
        { key: 's2', name: 'Tilt Y (°)', color: colorSecondary },
      ];
    }
    if (metric === 'displacement') {
      return [
        { key: 's1', name: 'X Disp (mm)', color: colorPrimary },
        { key: 's2', name: 'Y Disp (mm)', color: colorSecondary },
      ];
    }
    if (metric === 'acceleration') {
      return [
        { key: 's1', name: 'Acc X (g)', color: colorPrimary },
        { key: 's2', name: 'Acc Y (g)', color: colorSecondary },
        { key: 's3', name: 'Acc Z (g)', color: colorTertiary },
      ];
    }
    return [{ key: 's1', name: 'Temperature (°C)', color: colorPrimary }];
  }, [metric, colorPrimary, colorSecondary, colorTertiary]);

  const renderChart = () => {
    const commonAxis = (
      <>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="timeLabel" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} minTickGap={22} />
        <YAxis
          tick={{ fontSize: 10, fill: '#64748b' }}
          tickLine={false}
          tickFormatter={(v) => `${v}${activeMetric.unit}`}
        />
        <Tooltip
          contentStyle={{
            fontSize: '11px',
            borderRadius: '10px',
            border: '1px solid #e2e8f0',
            padding: '8px 10px',
          }}
          labelFormatter={(_, payload) => payload?.[0]?.payload?.fullTime || ''}
          formatter={(val, name) => [`${Number(val).toFixed(2)} ${activeMetric.unit}`, name]}
        />
      </>
    );

    if (chartType === 'area') {
      return (
        <AreaChart data={chartData} margin={{ top: 10, right: 12, left: -12, bottom: 4 }}>
          {commonAxis}
          {seriesConfig.map((s) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={s.color}
              fill={s.color}
              fillOpacity={0.18}
              strokeWidth={thickness}
              dot={false}
              isAnimationActive={false}
            />
          ))}
        </AreaChart>
      );
    }

    if (chartType === 'bar') {
      return (
        <BarChart data={chartData} margin={{ top: 10, right: 12, left: -12, bottom: 4 }}>
          {commonAxis}
          {seriesConfig.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.name}
              fill={s.color}
              barSize={Math.max(4, thickness * 4)}
              radius={[3, 3, 0, 0]}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      );
    }

    return (
      <LineChart data={chartData} margin={{ top: 10, right: 12, left: -12, bottom: 4 }}>
        {commonAxis}
        {seriesConfig.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.name}
            stroke={s.color}
            strokeWidth={thickness}
            dot={false}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    );
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
      {/* Toolbar: Metric Selector, Chart Type (Line / Area / Bar), Color & Thickness */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
        {/* Metric Selector */}
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value)}
            className="h-8 px-2.5 rounded-lg border border-slate-200 bg-slate-50 text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
          >
            {METRIC_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>

          {/* Chart Type Switcher: Line / Area / Bar */}
          <div className="flex items-center bg-slate-100 border border-slate-200 rounded-lg p-0.5">
            {CHART_TYPES.map((ct) => (
              <button
                key={ct.id}
                type="button"
                onClick={() => setChartType(ct.id)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors cursor-pointer ${
                  chartType === ct.id
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {ct.label}
              </button>
            ))}
          </div>
        </div>

        {/* Color & Thickness Controls */}
        <div className="flex items-center gap-3 flex-wrap text-[11px] font-bold text-slate-700">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">Color:</span>
            <input
              type="color"
              value={colorPrimary}
              onChange={(e) => setColorPrimary(e.target.value)}
              className="w-6 h-6 rounded border border-slate-200 cursor-pointer p-0 bg-transparent"
              title="Primary Series Color"
            />
            {metric !== 'temperature' && (
              <input
                type="color"
                value={colorSecondary}
                onChange={(e) => setColorSecondary(e.target.value)}
                className="w-6 h-6 rounded border border-slate-200 cursor-pointer p-0 bg-transparent"
                title="Y-Axis Series Color"
              />
            )}
            {metric === 'acceleration' && (
              <input
                type="color"
                value={colorTertiary}
                onChange={(e) => setColorTertiary(e.target.value)}
                className="w-6 h-6 rounded border border-slate-200 cursor-pointer p-0 bg-transparent"
                title="Z-Axis Series Color"
              />
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">Thickness:</span>
            <input
              type="range"
              min="1"
              max="6"
              step="0.5"
              value={thickness}
              onChange={(e) => setThickness(parseFloat(e.target.value))}
              className="w-20 accent-blue-600 cursor-pointer"
              title={`Thickness: ${thickness}px`}
            />
            <span className="font-mono text-slate-800 w-7">{thickness}px</span>
          </div>
        </div>
      </div>

      {/* Series Legend */}
      <div className="flex items-center gap-3 text-[11px] font-mono">
        {seriesConfig.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5 font-bold text-slate-700">
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: s.color }} />
            <span>{s.name}</span>
          </span>
        ))}
      </div>

      {/* Single Unified Chart */}
      <div className="w-full h-64 rounded-xl border border-slate-100 bg-slate-50/50 p-2">
        {loading ? (
          <div className="w-full h-full flex items-center justify-center gap-2 text-xs font-semibold text-slate-500">
            <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <span>Loading 24h telemetry...</span>
          </div>
        ) : chartData.length === 0 ? (
          <div className="w-full h-full flex flex-col items-center justify-center text-xs text-slate-400">
            <TrendingUp className="w-6 h-6 text-slate-300 mb-1" />
            <span>No 24h {activeMetric.label} data available</span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {renderChart()}
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

