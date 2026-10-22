import React from 'react';
import { parseTelemetry } from '../utils/telemetryHelper';
import {
  Compass, Radio, Layers, Activity, Zap, Thermometer,
  Clock
} from 'lucide-react';

function Spark({ data, color, width = 64, height = 20 }) {
  if (!data || data.length < 2) return null;
  const mn = Math.min(...data), mx = Math.max(...data), r = mx - mn || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * width},${height - 2 - ((v - mn) / r) * (height - 4)}`).join(' ');
  return (
    <svg width={width} height={height} className="flex-shrink-0">
      <polyline fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" points={pts} />
    </svg>
  );
}

const n = (val, def = 0) => (typeof val === 'number' && !isNaN(val) ? val : (parseFloat(val) || def));

import { formatFullDateTime } from '../utils/dateHelper';

export default function TiltmeterStatCards({ currentDevice: rawDevice }) {
  const d = parseTelemetry(rawDevice);

  const xT = n(d.xTilt, 0);
  const yT = n(d.yTilt, 0);
  const resT = n(d.resultantTilt, Math.sqrt(xT * xT + yT * yT));
  const zT = n(d.zTilt, resT);
  const dirC = d.tiltDirectionCardinal || 'N';
  const totD = n(d.totalDisplacement, Math.sqrt(n(d.xDisplacement, 0) ** 2 + n(d.yDisplacement, 0) ** 2 + n(d.zDisplacement, 0) ** 2));

  const xSlope = typeof d.xSlope === 'number' ? d.xSlope : Math.sin((xT * Math.PI) / 180) * 1000;
  const ySlope = typeof d.ySlope === 'number' ? d.ySlope : Math.sin((yT * Math.PI) / 180) * 1000;
  const zSlope = typeof d.zSlope === 'number' ? d.zSlope : Math.sin((zT * Math.PI) / 180) * 1000;
  const resSlope = typeof d.resultantSlope === 'number' ? d.resultantSlope : Math.sin((resT * Math.PI) / 180) * 1000;

  const lastFullDateTime = formatFullDateTime(d.timestamp);

  // Primary 8 Stat Cards (Row 1): 4 Tilt (X, Y, Z, Direction) + 4 Displacement (X, Y, Z, Total)
  const primary = [
    {
      label: 'ΔθX Tilt Change',
      value: `${xT >= 0 ? '+' : ''}${xT.toFixed(3)}°`,
      unit: `${xSlope >= 0 ? '+' : ''}${xSlope.toFixed(2)} mm/m`,
      color: '#3b82f6',
      spark: d.sparklineXTilt || null,
    },
    {
      label: 'ΔθY Tilt Change',
      value: `${yT >= 0 ? '+' : ''}${yT.toFixed(3)}°`,
      unit: `${ySlope >= 0 ? '+' : ''}${ySlope.toFixed(2)} mm/m`,
      color: '#0d9488',
      spark: d.sparklineYTilt || null,
    },
    {
      label: 'ΔθZ Tilt Change',
      value: `${zT >= 0 ? '+' : ''}${zT.toFixed(3)}°`,
      unit: `${zSlope >= 0 ? '+' : ''}${zSlope.toFixed(2)} mm/m`,
      color: '#ea580c',
      spark: d.sparklineResultant || null,
    },
    {
      label: 'Tilt Direction',
      value: `${dirC}`,
      unit: `${(d.tiltDirectionAngle ?? 0).toFixed(1)}° Bearing`,
      iconCircle: 'bg-orange-50 text-orange-500 border-orange-200',
      icon: Compass,
    },
    {
      label: 'DX (Lateral)',
      value: `${n(d.xDisplacement, 0) >= 0 ? '+' : ''}${n(d.xDisplacement, 0).toFixed(2)}`,
      unit: 'mm',
      iconCircle: 'bg-cyan-50 text-cyan-500 border-cyan-200',
      icon: Layers,
    },
    {
      label: 'DY (Lateral)',
      value: `${n(d.yDisplacement, 0) >= 0 ? '+' : ''}${n(d.yDisplacement, 0).toFixed(2)}`,
      unit: 'mm',
      iconCircle: 'bg-purple-50 text-purple-500 border-purple-200',
      icon: Radio,
    },
    {
      label: 'DZ (Axial)',
      value: 'N/A',
      unit: 'Not measured',
      iconCircle: 'bg-slate-50 text-slate-400 border-slate-200',
      icon: Layers,
    },
    {
      label: 'Total Lateral D',
      value: `${totD.toFixed(2)}`,
      unit: 'mm',
      iconCircle: 'bg-pink-50 text-pink-500 border-pink-200',
      icon: Zap,
    },
  ];

  // Secondary Sensor Diagnostic Pills
  const secondary = [
    { label: 'Vibration Peak', val: `${n(d.vibPeak, 0).toFixed(4)} g`, icon: Zap, iconColor: 'text-amber-500 bg-amber-50' },
    { label: 'Vibration RMS', val: `${n(d.vibRMS, 0).toFixed(4)} g`, icon: Activity, iconColor: 'text-purple-500 bg-purple-50' },
    { label: 'Acceleration Mag', val: `${n(d.accMag, 9.81).toFixed(3)} m/s²`, icon: Activity, iconColor: 'text-blue-500 bg-blue-50' },
    { label: 'Ambient Temp.', val: `${n(d.temp, 25.0).toFixed(1)} °C`, icon: Thermometer, iconColor: 'text-orange-500 bg-orange-50' },
    { label: 'Last Sync Date & Time', val: lastFullDateTime, icon: Clock, iconColor: 'text-blue-500 bg-blue-50' },
  ];

  return (
    <div className="space-y-2.5">
      {/* Row 1: Primary Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2.5">
        {primary.map((item, idx) => {
          const IconCircle = item.icon;
          return (
            <div
              key={idx}
              className="p-3.5 rounded-2xl border border-slate-200/80 bg-white flex flex-col justify-between shadow-xs hover:border-slate-300 transition-all"
            >
              <div className="text-[10px] font-semibold text-slate-500 truncate">
                {item.label}
              </div>

              <div className="flex items-center justify-between mt-1">
                <div>
                  <div className="text-lg font-bold text-slate-900 leading-tight">
                    {item.value}
                  </div>
                  <div className="text-[10px] text-slate-400 font-medium">
                    {item.unit}
                  </div>
                </div>

                {item.spark && (
                  <Spark data={item.spark} color={item.color} />
                )}

                {IconCircle && (
                  <div className={`w-8 h-8 rounded-full border flex items-center justify-center flex-shrink-0 ${item.iconCircle}`}>
                    <IconCircle className="w-4 h-4" />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Row 2: Secondary Sensor Diagnostics Pills */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        {secondary.map((item, idx) => {
          const Icon = item.icon;
          return (
            <div
              key={idx}
              className="p-2.5 rounded-2xl border border-slate-200/80 bg-white flex items-center gap-2.5 shadow-2xs hover:border-slate-300 transition-all"
            >
              <div className={`w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 ${item.iconColor}`}>
                <Icon className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[9px] font-medium text-slate-400 truncate">
                  {item.label}
                </div>
                <div className="text-xs font-bold text-slate-900 font-mono truncate mt-0.5">
                  {item.val}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
