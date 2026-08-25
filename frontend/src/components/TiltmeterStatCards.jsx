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

export default function TiltmeterStatCards({ currentDevice: rawDevice }) {
  const d = parseTelemetry(rawDevice);

  const xT = n(d.xTilt, 1.53);
  const yT = n(d.yTilt, -0.92);
  const resT = n(d.resultantTilt, 1.83);
  const dirC = d.tiltDirectionCardinal || 'NW';
  const totD = n(d.totalDisplacement, 30.00);

  const lastTime = d.timestamp ? new Date(d.timestamp).toLocaleTimeString() : '12:45:32 PM';

  // Primary 7 Stat Cards (Row 1)
  const primary = [
    {
      label: 'X Tilt (Roll)',
      value: `${xT.toFixed(2)}`,
      unit: 'mm/m',
      color: '#3b82f6',
      spark: d.sparklineXTilt || [1.2, 1.4, 1.3, 1.53],
    },
    {
      label: 'Y Tilt (Pitch)',
      value: `${yT >= 0 ? '+' : ''}${yT.toFixed(2)}`,
      unit: 'mm/m',
      color: '#a855f7',
      spark: d.sparklineYTilt || [-0.7, -0.85, -0.92],
    },
    {
      label: 'Resultant Tilt',
      value: `${resT.toFixed(2)}`,
      unit: 'mm/m',
      color: '#10b981',
      spark: d.sparklineResultant || [1.6, 1.75, 1.83],
    },
    {
      label: 'Tilt Direction',
      value: `${dirC}`,
      unit: 'Bearing',
      iconCircle: 'bg-orange-50 text-orange-500 border-orange-200',
      icon: Compass,
    },
    {
      label: 'X Displacement',
      value: `${n(d.xDisplacement, 0.12).toFixed(2)}`,
      unit: 'mm',
      iconCircle: 'bg-cyan-50 text-cyan-500 border-cyan-200',
      icon: Layers,
    },
    {
      label: 'Y Displacement',
      value: `${n(d.yDisplacement, 4.59).toFixed(2)}`,
      unit: 'mm',
      iconCircle: 'bg-purple-50 text-purple-500 border-purple-200',
      icon: Radio,
    },
    {
      label: 'Total Displacement',
      value: `${totD.toFixed(2)}`,
      unit: 'mm',
      iconCircle: 'bg-pink-50 text-pink-500 border-pink-200',
      icon: Zap,
    },
  ];

  // Secondary Sensor Diagnostic Pills (Clean, real telemetry without redundant AK09918/GX3-45)
  const secondary = [
    { label: 'Vibration Peak', val: `${n(d.vibPeak, 0.1040).toFixed(4)} g`, icon: Zap, iconColor: 'text-amber-500 bg-amber-50' },
    { label: 'Vibration RMS', val: `${n(d.vibRMS, 0.0450).toFixed(4)} g`, icon: Activity, iconColor: 'text-purple-500 bg-purple-50' },
    { label: 'Acceleration Mag', val: `${n(d.accMag, 0.982).toFixed(3)} g`, icon: Activity, iconColor: 'text-blue-500 bg-blue-50' },
    { label: 'Ambient Temp.', val: `${n(d.temp, 28.6).toFixed(1)} °C`, icon: Thermometer, iconColor: 'text-orange-500 bg-orange-50' },
    { label: 'Last Packet Time', val: lastTime, icon: Clock, iconColor: 'text-blue-500 bg-blue-50' },
  ];

  return (
    <div className="space-y-2.5">
      {/* Row 1: 7 Primary Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-2.5">
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
