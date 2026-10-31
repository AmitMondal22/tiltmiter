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

const parseNum = (val) => {
  if (val === null || val === undefined || val === '' || val === '--') return null;
  const num = typeof val === 'number' ? val : parseFloat(val);
  return !isNaN(num) ? num : null;
};

import { formatFullDateTime } from '../utils/dateHelper';

export default function TiltmeterStatCards({ currentDevice: rawDevice }) {
  const d = parseTelemetry(rawDevice);

  const deltaX = typeof d.presentX === 'number' ? d.presentX : parseNum(d.tilt?.roll ?? d.roll ?? d.xTilt);
  const deltaY = typeof d.presentY === 'number' ? d.presentY : parseNum(d.tilt?.pitch ?? d.pitch ?? d.yTilt);
  const deltaZ = typeof d.presentZ === 'number' ? d.presentZ : parseNum(d.tilt?.yaw ?? d.yaw ?? d.zTilt);
  const resT = parseNum(d.resultantTilt);
  const xDisp = parseNum(d.xDisplacement ?? d.displacement?.xDisplacement_mm);
  const yDisp = parseNum(d.yDisplacement ?? d.displacement?.yDisplacement_mm);
  const totD = parseNum(d.totalDisplacement ?? d.displacement?.totalDisplacement_mm);

  const lastFullDateTime = d.timestamp ? formatFullDateTime(d.timestamp) : '--';

  // Primary Stat Cards: Tilt Angle (X, Y, Z) + Device Displacement (X, Y, Total)
  const primary = [
    {
      label: 'Tilt X',
      value: deltaX !== null ? `${deltaX >= 0 ? '+' : ''}${deltaX.toFixed(1)}°` : '--',
      unit: 'Tilt Angle',
      color: '#3b82f6',
      spark: d.sparklineXTilt || null,
    },
    {
      label: 'Tilt Y',
      value: deltaY !== null ? `${deltaY >= 0 ? '+' : ''}${deltaY.toFixed(1)}°` : '--',
      unit: 'Tilt Angle',
      color: '#0d9488',
      spark: d.sparklineYTilt || null,
    },
    {
      label: 'Tilt Z',
      value: deltaZ !== null ? `${deltaZ >= 0 ? '+' : ''}${deltaZ.toFixed(1)}°` : '--',
      unit: 'Tilt Angle',
      color: '#ea580c',
      spark: d.sparklineResultant || null,
    },
    {
      label: 'DX',
      value: xDisp !== null ? `${xDisp.toFixed(2)}` : '--',
      unit: 'mm',
      iconCircle: 'bg-cyan-50 text-cyan-500 border-cyan-200',
      icon: Layers,
    },
    {
      label: 'DY',
      value: yDisp !== null ? `${yDisp.toFixed(2)}` : '--',
      unit: 'mm',
      iconCircle: 'bg-purple-50 text-purple-500 border-purple-200',
      icon: Radio,
    },
    {
      label: 'Total Displacement',
      value: totD !== null ? `${totD.toFixed(2)}` : '--',
      unit: 'mm',
      iconCircle: 'bg-pink-50 text-pink-500 border-pink-200',
      icon: Zap,
    },
  ];

  // Secondary Sensor Diagnostic Pills
  const secondary = [
    { label: 'Vibration Peak', val: d.vibPeak !== null && d.vibPeak !== undefined ? `${Number(d.vibPeak).toFixed(4)} g` : '--', icon: Zap, iconColor: 'text-amber-500 bg-amber-50' },
    { label: 'Vibration RMS', val: d.vibRMS !== null && d.vibRMS !== undefined ? `${Number(d.vibRMS).toFixed(4)} g` : '--', icon: Activity, iconColor: 'text-purple-500 bg-purple-50' },
    { label: 'Acceleration Mag', val: d.accMag !== null && d.accMag !== undefined ? `${Number(d.accMag).toFixed(3)} g` : '--', icon: Activity, iconColor: 'text-blue-500 bg-blue-50' },
    { label: 'Ambient Temp.', val: d.temp !== null && d.temp !== undefined ? `${Number(d.temp).toFixed(1)} °C` : '--', icon: Thermometer, iconColor: 'text-orange-500 bg-orange-50' },
    { label: 'Last Sync Date & Time', val: lastFullDateTime, icon: Clock, iconColor: 'text-blue-500 bg-blue-50' },
  ];

  return (
    <div className="space-y-2.5">
      {/* Row 1: Primary Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2.5">
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
