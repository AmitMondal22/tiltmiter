import React from 'react';
import { parseTelemetry } from '../utils/telemetryHelper';

const num = (v, d = null) => (typeof v === 'number' && !isNaN(v) ? v : (v !== null && v !== undefined && v !== '' && !isNaN(parseFloat(v)) ? parseFloat(v) : d));

export default function SensorHealthWidget({ currentDevice }) {
  const d = parseTelemetry(currentDevice);

  const rowCls = 'text-[11px] flex justify-between items-center py-1.5 border-b border-slate-100 last:border-0';
  const labelCls = 'text-slate-600 font-semibold';

  const accMagVal = num(d.accMag, null);
  const tempVal = num(d.temp, null);
  const hasData = Boolean(d.timestamp || currentDevice?.lastSeen);

  const diagnosticsList = [
    { name: 'X-Axis MEMS Sensor', status: d.xTilt !== null ? 'NORMAL' : '--', isGood: d.xTilt !== null },
    { name: 'Y-Axis MEMS Sensor', status: d.yTilt !== null ? 'NORMAL' : '--', isGood: d.yTilt !== null },
    { name: 'Accelerometer Core', status: accMagVal !== null ? `✓ ${accMagVal.toFixed(2)} g` : '--', isGood: accMagVal !== null },
    { name: 'Gyroscope Core', status: d.gx !== null ? 'OK' : '--', isGood: d.gx !== null },
    { name: 'Vibration Transducer', status: d.vibRMS !== null ? 'NORMAL' : '--', isGood: d.vibRMS !== null },
    { name: 'Thermal Sensor', status: tempVal !== null ? `${tempVal.toFixed(1)} °C` : '--', isGood: tempVal !== null },
  ];

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 flex flex-col justify-between shadow-xs h-full">
      <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-1">
        <div className="text-[10px] font-black uppercase tracking-wider font-mono text-slate-800">
          CORE SENSOR DIAGNOSTICS
        </div>
        <span className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded-md border ${
          hasData
            ? 'text-emerald-600 bg-emerald-50 border-emerald-200'
            : 'text-slate-500 bg-slate-50 border-slate-200'
        }`}>
          {hasData ? (currentDevice?.status || 'ONLINE') : 'NO DATA'}
        </span>
      </div>

      <div className="space-y-0.5 flex-1 my-1">
        {diagnosticsList.map((h, i) => (
          <div key={i} className={rowCls}>
            <span className={labelCls}>{h.name}</span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
              h.isGood
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-slate-50 text-slate-500 border-slate-200'
            }`}>
              {h.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
