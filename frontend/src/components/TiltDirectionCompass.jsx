import React from 'react';
import { parseTelemetry } from '../utils/telemetryHelper';

const num = (v, d = 0) => (typeof v === 'number' && !isNaN(v) ? v : (parseFloat(v) || d));

export default function TiltDirectionCompass({ currentDevice }) {
  const d = parseTelemetry(currentDevice);
  const angle = num(d.tiltDirectionAngle, 329.8);
  const cardinal = d.tiltDirectionCardinal || 'NW';

  // Arrow calculation for 329.8°
  const rad = ((angle - 90) * Math.PI) / 180;
  const r = 46;
  const ax = 70 + r * Math.cos(rad);
  const ay = 70 + r * Math.sin(rad);

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 flex flex-col justify-between shadow-xs">
      <div className="text-[10px] font-black uppercase tracking-wider font-mono text-slate-800">
        LIVE VECTOR DIRECTION
      </div>

      <div className="flex justify-center my-1">
        <svg className="w-28 h-28" viewBox="0 0 140 140">
          <circle cx="70" cy="70" r="58" fill="none" stroke="#f1f5f9" strokeWidth="1.5" />
          <circle cx="70" cy="70" r="40" fill="none" stroke="#e2e8f0" strokeWidth="1" strokeDasharray="2 2" />
          <circle cx="70" cy="70" r="20" fill="none" stroke="#f1f5f9" strokeWidth="0.8" />

          {/* Cross lines */}
          <line x1="12" y1="70" x2="128" y2="70" stroke="#f1f5f9" strokeWidth="1" />
          <line x1="70" y1="12" x2="70" y2="128" stroke="#f1f5f9" strokeWidth="1" />

          {/* Cardinal Labels */}
          {[['N',70,10],['S',70,135],['E',134,74],['W',6,74]].map(([l,x,y]) => (
            <text key={l} x={x} y={y} textAnchor="middle" fill="#64748b" fontSize="9" fontWeight="700" fontFamily="monospace">{l}</text>
          ))}
          {[['NE',116,28],['SE',116,116],['SW',24,116],['NW',24,28]].map(([l,x,y]) => (
            <text key={l} x={x} y={y} textAnchor="middle" fill="#94a3b8" fontSize="7.5" fontWeight="600" fontFamily="monospace">{l}</text>
          ))}

          {/* Orange Pointer Arrow */}
          <defs>
            <marker id="arrowOrange" markerWidth="6" markerHeight="6" refX="4" refY="3" orient="auto">
              <polygon points="0 0, 6 3, 0 6" fill="#f97316" />
            </marker>
          </defs>
          <line x1="70" y1="70" x2={ax} y2={ay} stroke="#f97316" strokeWidth="2.5" markerEnd="url(#arrowOrange)" />
          <circle cx="70" cy="70" r="3" fill="#f97316" />
        </svg>
      </div>

      <div className="text-center font-mono">
        <div className="text-base font-black text-slate-900 leading-tight">
          {angle.toFixed(1)}°
        </div>
        <div className="text-[10px] font-bold text-orange-500 mt-0.5">
          {cardinal} Vector
        </div>
      </div>
    </div>
  );
}
