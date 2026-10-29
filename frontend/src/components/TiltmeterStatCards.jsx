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

const n = (val, def = 0) => {
  if (val === null || val === undefined || val === '' || val === '--') return def;
  const num = typeof val === 'number' ? val : parseFloat(val);
  return !isNaN(num) ? num : def;
};

import { formatFullDateTime } from '../utils/dateHelper';

export default function TiltmeterStatCards({ currentDevice: rawDevice }) {
  const d = parseTelemetry(rawDevice);

  const deltaX = typeof d.deltaX === 'number' ? d.deltaX : (typeof d.deltaThetaX === 'number' ? d.deltaThetaX : (n(d.presentX ?? d.xTilt, 0) - (d.refThetaX || 0)));
  const deltaY = typeof d.deltaY === 'number' ? d.deltaY : (typeof d.deltaThetaY === 'number' ? d.deltaThetaY : (n(d.presentY ?? d.yTilt, 0) - (d.refThetaY || 0)));
  const deltaZ = typeof d.deltaZ === 'number' ? d.deltaZ : (typeof d.deltaThetaZ === 'number' ? d.deltaThetaZ : (n(d.presentZ ?? d.zTilt, 0) - (d.refThetaZ || 0)));
  const resT = n(d.resultantTilt, 0);
  const xDisp = n(d.xDisplacement ?? d.displacement?.xDisplacement_mm, 0);
  const yDisp = n(d.yDisplacement ?? d.displacement?.yDisplacement_mm, 0);
  const zDisp = n(d.zDisplacement ?? d.displacement?.zDisplacement_mm, 0);
  const totD = n(d.totalDisplacement ?? d.displacement?.totalDisplacement_mm, 0);

  const lastFullDateTime = formatFullDateTime(d.timestamp);

  // Primary Stat Cards: Tilt Change (X, Y, Z) + Device Displacement (X, Y, Z, Total)
  const primary = [
    {
      label: 'ΔX (Roll)',
      value: `${deltaX >= 0 ? '+' : ''}${deltaX.toFixed(1)}°`,
      unit: 'Delta Tilt',
      color: '#3b82f6',
      spark: d.sparklineXTilt || null,
    },
    {
      label: 'ΔY (Pitch)',
      value: `${deltaY >= 0 ? '+' : ''}${deltaY.toFixed(1)}°`,
      unit: 'Delta Tilt',
      color: '#0d9488',
      spark: d.sparklineYTilt || null,
    },
    {
      label: 'ΔZ (Yaw)',
      value: `${deltaZ >= 0 ? '+' : ''}${deltaZ.toFixed(1)}°`,
      unit: 'Delta Tilt',
      color: '#ea580c',
      spark: d.sparklineResultant || null,
    },
    {
      label: 'DX',
      value: `${xDisp.toFixed(2)}`,
      unit: 'mm',
      iconCircle: 'bg-cyan-50 text-cyan-500 border-cyan-200',
      icon: Layers,
    },
    {
      label: 'DY',
      value: `${yDisp.toFixed(2)}`,
      unit: 'mm',
      iconCircle: 'bg-purple-50 text-purple-500 border-purple-200',
      icon: Radio,
    },
    {
      label: 'DZ',
      value: `${zDisp.toFixed(2)}`,
      unit: 'mm',
      iconCircle: 'bg-emerald-50 text-emerald-500 border-emerald-200',
      icon: Layers,
    },
    {
      label: 'Total Displacement',
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
    { label: 'Acceleration Mag', val: `${n(d.accMag, 0).toFixed(3)} m/s²`, icon: Activity, iconColor: 'text-blue-500 bg-blue-50' },
    { label: 'Ambient Temp.', val: `${n(d.temp, 0).toFixed(1)} °C`, icon: Thermometer, iconColor: 'text-orange-500 bg-orange-50' },
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
