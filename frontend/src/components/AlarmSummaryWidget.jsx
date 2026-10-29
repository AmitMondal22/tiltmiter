import React, { useState, useEffect } from 'react';
import { getAlarms } from '../api/apiClient';

const TYPES = [
  { key: 'critical', label: 'Critical Alarms', dot: 'bg-red-500', badge: 'bg-red-50 text-red-500 font-bold' },
  { key: 'major', label: 'Major Alarms', dot: 'bg-orange-400', badge: 'bg-orange-50 text-orange-500 font-bold' },
  { key: 'minor', label: 'Minor Alarms', dot: 'bg-yellow-400', badge: 'bg-yellow-50 text-yellow-600 font-bold' },
  { key: 'warnings', label: 'Warnings', dot: 'bg-blue-500', badge: 'bg-blue-50 text-blue-500 font-bold' },
];

export default function AlarmSummaryWidget({ deviceId = null }) {
  const [summary, setSummary] = useState({ critical: 0, major: 0, minor: 0, warnings: 0, total: 0 });

  useEffect(() => {
    let isCurrent = true;

    // Reset summary to 0 on device switch
    setSummary({ critical: 0, major: 0, minor: 0, warnings: 0, total: 0 });

    getAlarms(deviceId)
      .then(res => {
        if (!isCurrent) return;
        if (res?.summary) {
          setSummary(res.summary);
        } else {
          setSummary({ critical: 0, major: 0, minor: 0, warnings: 0, total: 0 });
        }
      })
      .catch(() => {
        if (!isCurrent) return;
        setSummary({ critical: 0, major: 0, minor: 0, warnings: 0, total: 0 });
      });

    return () => {
      isCurrent = false;
    };
  }, [deviceId]);

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 flex flex-col justify-between shadow-xs">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-black uppercase tracking-wider font-mono text-slate-800">
          ALARM CONSOLE SUMMARY
        </div>
        {deviceId && (
          <span className="text-[10px] font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
            {deviceId}
          </span>
        )}
      </div>

      <div className="space-y-1.5 flex-1 my-2">
        {TYPES.map(t => (
          <div key={t.key} className="flex items-center justify-between py-1 text-xs">
            <span className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${t.dot}`} />
              <span className="text-[11px] font-semibold text-slate-700">{t.label}</span>
            </span>
            <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-mono ${t.badge}`}>
              {summary[t.key] || 0}
            </span>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px] font-semibold text-slate-600">
        <span>{deviceId ? `Device Alarms (${deviceId})` : 'Total System Alarms'}</span>
        <span className="font-mono font-bold text-sm text-emerald-600">{summary.total || 0}</span>
      </div>
    </div>
  );
}
