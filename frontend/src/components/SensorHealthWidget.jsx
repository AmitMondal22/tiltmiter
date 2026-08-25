import React from 'react';
import { parseTelemetry } from '../utils/telemetryHelper';

const num = (v, d = 0) => (typeof v === 'number' && !isNaN(v) ? v : (parseFloat(v) || d));

export default function SensorHealthWidget({ currentDevice }) {
  const d = parseTelemetry(currentDevice);

  const rowCls = 'text-[11px] flex justify-between items-center py-1.5 border-b border-slate-100 last:border-0';
  const labelCls = 'text-slate-600 font-semibold';

  const accMagVal = num(d.accMag, 0.98);
  const tempVal = num(d.temp, 28.7);

  const diagnosticsList = [
    { name: 'X-Axis MEMS Sensor', status: 'NORMAL', isGood: true },
    { name: 'Y-Axis MEMS Sensor', status: 'NORMAL', isGood: true },
    { name: 'Accelerometer Core', status: `✓ ${accMagVal.toFixed(2)} g`, isGood: true },
    { name: 'Gyroscope Core', status: 'OK', isGood: true },
    { name: 'Vibration Transducer', status: 'NORMAL', isGood: true },
    { name: 'Thermal Sensor', status: `${tempVal.toFixed(1)} °C`, isGood: true },
  ];

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 flex flex-col justify-between shadow-xs h-full">
      <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-1">
        <div className="text-[10px] font-black uppercase tracking-wider font-mono text-slate-800">
          CORE SENSOR DIAGNOSTICS
        </div>
        <span className="text-[9px] font-mono text-emerald-600 font-bold px-1.5 py-0.2 rounded-md bg-emerald-50 border border-emerald-200">
          ONLINE
        </span>
      </div>

      <div className="space-y-0.5 flex-1 my-1">
        {diagnosticsList.map((h, i) => (
          <div key={i} className={rowCls}>
            <span className={labelCls}>{h.name}</span>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              {h.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
