import React, { useState, useEffect } from 'react';
import { CheckCircle2, AlertTriangle, Radio } from 'lucide-react';
import { parseTelemetry } from '../utils/telemetryHelper';
import { formatTimeString } from '../utils/dateHelper';

export default function RecentEventsWidget({ currentDevice }) {
  const [events, setEvents] = useState([]);
  const devId = currentDevice?.id;

  // Clear events when selected device changes
  useEffect(() => {
    setEvents([]);
  }, [devId]);

  useEffect(() => {
    if (!currentDevice || !currentDevice.id) return;
    const d = parseTelemetry(currentDevice);
    if (!d.timestamp && !currentDevice.timestamp) return;
    const timeStr = formatTimeString(d.timestamp || currentDevice.timestamp);

    setEvents(prev => {
      const isWarn = d.tiltStatus === 'WARNING' || d.tiltStatus === 'ALARM';
      const newEv = {
        id: Date.now(),
        deviceId: currentDevice.id,
        title: isWarn ? `Tilt Variation Detected (${d.resultantTilt?.toFixed(3)}°)` : `Telemetry Ingest Sync (${currentDevice.id})`,
        time: timeStr,
        type: isWarn ? 'warning' : 'info',
      };
      // Keep only events belonging to this specific device
      const filtered = prev.filter(e => e.deviceId === currentDevice.id);
      return [newEv, ...filtered].slice(0, 4);
    });
  }, [devId, currentDevice?.timestamp, currentDevice?.tilt?.tilt, currentDevice?.resultantTilt]);

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 flex flex-col justify-between shadow-xs">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-black uppercase tracking-wider font-mono text-slate-800">
          LIVE SYSTEM EVENTS
        </span>
        <div className="flex items-center gap-1.5">
          {devId && (
            <span className="text-[9px] font-mono text-slate-500 font-semibold px-1.5 py-0.5 rounded bg-slate-50 border border-slate-200">
              {devId}
            </span>
          )}
          <span className="text-[9px] font-mono text-emerald-600 font-bold px-1.5 py-0.2 rounded-md bg-emerald-50 border border-emerald-200">
            Active
          </span>
        </div>
      </div>

      <div className="space-y-2 flex-1 my-1">
        {events.length === 0 ? (
          <div className="py-6 text-center text-slate-400 text-xs font-mono">
            Waiting for live telemetry stream for {devId || 'selected device'}...
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
