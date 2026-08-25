import React, { useState, useEffect } from 'react';
import { getAlarms } from '../api/apiClient';

const TYPES = [
  { key: 'critical', label: 'Critical Alarms', dot: 'bg-red-500', badge: 'bg-red-50 text-red-500 font-bold' },
  { key: 'major', label: 'Major Alarms', dot: 'bg-orange-400', badge: 'bg-orange-50 text-orange-500 font-bold' },
  { key: 'minor', label: 'Minor Alarms', dot: 'bg-yellow-400', badge: 'bg-yellow-50 text-yellow-600 font-bold' },
  { key: 'warnings', label: 'Warnings', dot: 'bg-blue-500', badge: 'bg-blue-50 text-blue-500 font-bold' },
];

export default function AlarmSummaryWidget() {
  const [summary, setSummary] = useState({ critical: 0, major: 0, minor: 0, warnings: 0, total: 5 });

  useEffect(() => {
    getAlarms()
      .then(res => {
        if (res?.summary) setSummary(res.summary);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 flex flex-col justify-between shadow-xs">
      <div className="text-[10px] font-black uppercase tracking-wider font-mono text-slate-800">
        ALARM CONSOLE SUMMARY
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
        <span>Total System Alarms</span>
        <span className="font-mono font-bold text-sm text-emerald-600">{summary.total || 5}</span>
      </div>
    </div>
  );
}
