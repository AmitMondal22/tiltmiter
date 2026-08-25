import React from 'react';
import { parseTelemetry } from '../utils/telemetryHelper';

const num = (v, d = 0) => (typeof v === 'number' && !isNaN(v) ? v : (parseFloat(v) || d));

export default function TiltPositionVisualizer({ currentDevice }) {
  const d = parseTelemetry(currentDevice);
  const roll = num(d.xTilt, 1.53);
  const pitch = num(d.yTilt, -0.92);
  const resultant = num(d.resultantTilt, 1.83);

  // Precision bubble level offset calculation (clamped to [-36, 36] px)
  const bubbleX = Math.max(-36, Math.min(36, roll * 14));
  const bubbleY = Math.max(-36, Math.min(36, -pitch * 14));

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 flex flex-col justify-between shadow-xs h-full">
      {/* Card Header */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-1">
        <span className="text-[10px] font-bold uppercase tracking-wider font-mono text-slate-700">
          DUAL-AXIS TILT LEVEL
        </span>

      </div>

      {/* High-Precision Electronic Dual-Axis Bullseye Horizon Level */}
      <div className="flex flex-col items-center justify-center my-2">
        <div className="relative w-28 h-28 rounded-full border border-slate-200 bg-slate-50/80 flex items-center justify-center shadow-inner overflow-hidden">
          {/* Concentric Calibration Rings */}
          <div className="absolute w-24 h-24 rounded-full border border-slate-200/80" />
          <div className="absolute w-18 h-18 rounded-full border border-dashed border-slate-300" />
          <div className="absolute w-10 h-10 rounded-full border border-slate-300 bg-slate-100/60" />
          <div className="absolute w-3 h-3 rounded-full border border-slate-400" />

          {/* Axis Crosshairs */}
          <div className="absolute w-full h-[1px] bg-slate-200" />
          <div className="absolute h-full w-[1px] bg-slate-200" />

          {/* Crosshair Axis Labels */}
          <span className="absolute top-1 text-[7px] font-mono font-medium text-slate-400">+Y</span>
          <span className="absolute bottom-1 text-[7px] font-mono font-medium text-slate-400">-Y</span>
          <span className="absolute left-1 text-[7px] font-mono font-medium text-slate-400">-X</span>
          <span className="absolute right-1 text-[7px] font-mono font-medium text-slate-400">+X</span>

          {/* Fluid Inclinometer Sensor Bubble */}
          <div
            className="absolute w-6 h-6 rounded-full bg-blue-600 border-2 border-white shadow-md transition-all duration-300 ease-out flex items-center justify-center z-10"
            style={{
              transform: `translate(${bubbleX}px, ${bubbleY}px)`,
            }}
          >
            <div className="w-1.5 h-1.5 bg-white rounded-full opacity-80" />
          </div>
        </div>
      </div>

      {/* Numerical Degree Readouts */}
      <div className="grid grid-cols-3 gap-1.5 pt-2 border-t border-slate-100 text-center font-mono">
        <div className="p-1 rounded-lg bg-slate-50 border border-slate-100">
          <span className="text-[8px] text-slate-500 uppercase font-medium block">Roll (X)</span>
          <span className="text-[11px] font-semibold text-blue-600">{roll.toFixed(2)}°</span>
        </div>
        <div className="p-1 rounded-lg bg-slate-50 border border-slate-100">
          <span className="text-[8px] text-slate-500 uppercase font-medium block">Pitch (Y)</span>
          <span className="text-[11px] font-semibold text-purple-600">{pitch.toFixed(2)}°</span>
        </div>
        <div className="p-1 rounded-lg bg-slate-50 border border-slate-100">
          <span className="text-[8px] text-slate-500 uppercase font-medium block">Resultant</span>
          <span className="text-[11px] font-semibold text-emerald-600">{resultant.toFixed(2)}°</span>
        </div>
      </div>
    </div>
  );
}
