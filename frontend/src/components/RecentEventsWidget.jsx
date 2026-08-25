import React, { useState, useEffect } from 'react';
import { CheckCircle2, AlertTriangle, Radio } from 'lucide-react';
import { parseTelemetry } from '../utils/telemetryHelper';

export default function RecentEventsWidget({ currentDevice }) {
  const [events, setEvents] = useState([]);

  useEffect(() => {
    if (!currentDevice) return;
    const d = parseTelemetry(currentDevice);
    const timeStr = d.timestamp ? new Date(d.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString();

    setEvents(prev => {
      const isWarn = d.tiltStatus === 'WARNING' || d.tiltStatus === 'ALARM';
      const newEv = {
        id: Date.now(),
        title: isWarn ? `Tilt Variation Detected (${d.resultantTilt?.toFixed(3)}°)` : `Telemetry Ingest Sync (${d.id || 'Node'})`,
        time: timeStr,
        type: isWarn ? 'warning' : 'info',
      };
      return [newEv, ...prev].slice(0, 4);
    });
  }, [currentDevice?.timestamp, currentDevice?.tilt?.tilt]);

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 flex flex-col justify-between shadow-xs">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-black uppercase tracking-wider font-mono text-slate-800">
          LIVE SYSTEM EVENTS
        </span>
        <span className="text-[9px] font-mono text-emerald-600 font-bold px-1.5 py-0.2 rounded-md bg-emerald-50 border border-emerald-200">
          Active
        </span>
      </div>

      <div className="space-y-2 flex-1 my-1">
        {events.length === 0 ? (
          <div className="py-6 text-center text-slate-400 text-xs font-mono">
            Waiting for live telemetry stream...
          </div>
        ) : (
          events.map(ev => (
            <div key={ev.id} className="flex items-center gap-2 py-1.5 border-b border-slate-50 last:border-0">
              {ev.type === 'warning' ? (
                <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-semibold text-slate-800 truncate">{ev.title}</div>
                <div className="text-[9px] font-mono text-slate-400">{ev.time}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
