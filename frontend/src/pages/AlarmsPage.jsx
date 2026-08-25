import React, { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { getAlarms } from '../api/apiClient';

export default function AlarmsPage() {
  const cardCls = 'rounded-2xl border border-slate-200 bg-white p-4 text-black shadow-xs';

  const [alarms, setAlarms] = useState([]);
  const [summary, setSummary] = useState({ critical: 0, major: 0, minor: 0, warnings: 0, total: 0 });
  const [activeTab, setActiveTab] = useState('rules'); // 'rules', 'console', 'notifications'

  const [alertRules, setAlertRules] = useState([
    { id: 'RULE-01', name: 'Critical Tilt Threshold', parameter: 'Resultant Tilt', operator: '>', threshold: '2.000°', severity: 'CRITICAL', enabled: true, notifyChannels: ['SMS', 'Email'] },
    { id: 'RULE-02', name: 'High Dynamic Vibration', parameter: 'Vibration Peak', operator: '>', threshold: '0.250 G', severity: 'MAJOR', enabled: true, notifyChannels: ['Email'] },
    { id: 'RULE-03', name: 'Sub-surface Displacement Drift', parameter: 'Total Disp', operator: '>', threshold: '15.0 mm', severity: 'MAJOR', enabled: true, notifyChannels: ['Email', 'SMS'] },
    { id: 'RULE-04', name: 'Low Battery Voltage', parameter: 'Battery Level', operator: '<', threshold: '20%', severity: 'MINOR', enabled: true, notifyChannels: ['Email'] },
  ]);

  const [recipients, setRecipients] = useState([
    { id: 'NOTIF-01', name: 'Emergency Geotechnical Operations', type: 'SMS + Email', target: 'safety-ops@tiltmeter.io', status: 'ACTIVE' },
    { id: 'NOTIF-02', name: 'Field Maintenance Crew', type: 'Email', target: 'field-crew@tiltmeter.io', status: 'ACTIVE' },
  ]);

  useEffect(() => {
    getAlarms()
      .then(res => {
        if (res?.alarms) setAlarms(res.alarms);
        if (res?.summary) setSummary(res.summary);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-3 font-sans text-black">
      {/* Top Header Row */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black text-black">
            Alert Rules & Alarms
          </h2>
          <p className="text-[11px] text-slate-700 font-medium mt-0.5">
            Geotechnical threshold alert rules, notification channels, and active incident feed
          </p>
        </div>

        {/* View Switcher Tabs (Compact) */}
        <div className="flex rounded-xl p-1 bg-white border border-slate-300 shadow-xs text-xs font-bold">
          <button
            onClick={() => setActiveTab('rules')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeTab === 'rules' ? 'bg-black text-white shadow-xs' : 'text-black hover:bg-slate-100'
            }`}
          >
            Alert Rules
          </button>
          <button
            onClick={() => setActiveTab('console')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeTab === 'console' ? 'bg-black text-white shadow-xs' : 'text-black hover:bg-slate-100'
            }`}
          >
            Alarms Feed
          </button>
          <button
            onClick={() => setActiveTab('notifications')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeTab === 'notifications' ? 'bg-black text-white shadow-xs' : 'text-black hover:bg-slate-100'
            }`}
          >
            Notification Channels
          </button>
        </div>
      </div>

      {/* Overview Cards (Small & Compact) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className={cardCls}>
          <div className="text-[11px] text-black font-extrabold uppercase">Critical Alarms</div>
          <div className="text-xl font-black text-red-600 font-mono mt-0.5">{summary.critical || 0}</div>
        </div>
        <div className={cardCls}>
          <div className="text-[11px] text-black font-extrabold uppercase">Major Alarms</div>
          <div className="text-xl font-black text-amber-600 font-mono mt-0.5">{summary.major || 0}</div>
        </div>
        <div className={cardCls}>
          <div className="text-[11px] text-black font-extrabold uppercase">Minor Alarms</div>
          <div className="text-xl font-black text-black font-mono mt-0.5">{summary.minor || 0}</div>
        </div>
        <div className={cardCls}>
          <div className="text-[11px] text-black font-extrabold uppercase">Active Rules</div>
          <div className="text-xl font-black text-black font-mono mt-0.5">{alertRules.length}</div>
        </div>
      </div>

      {/* TAB 1: ALERT RULES */}
      {activeTab === 'rules' && (
        <div className={cardCls}>
          <div className="flex items-center justify-between pb-2.5 border-b border-slate-200 mb-2.5">
            <h3 className="text-xs font-black text-black uppercase tracking-wider font-mono">Trigger Rules Configuration</h3>
            <button className="flex items-center gap-1.5 px-3.5 py-1.5 bg-black text-white font-bold text-xs rounded-xl shadow-xs hover:bg-neutral-800 transition-all">
              <Plus className="w-3.5 h-3.5" />
              <span>Create Rule</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b-2 border-slate-200 text-black font-extrabold uppercase text-[10px] tracking-wider">
                  <th className="py-2.5 px-3">Rule Name</th>
                  <th className="py-2.5 px-3">Metric</th>
                  <th className="py-2.5 px-3">Threshold</th>
                  <th className="py-2.5 px-3">Severity</th>
                  <th className="py-2.5 px-3">Channels</th>
                  <th className="py-2.5 px-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-black font-medium">
                {alertRules.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-3 font-bold text-black text-xs">{r.name}</td>
                    <td className="py-3 px-3 font-mono font-bold text-black">{r.parameter}</td>
                    <td className="py-3 px-3 font-mono font-extrabold text-black">{r.operator} {r.threshold}</td>
                    <td className="py-3 px-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold font-mono ${
                        r.severity === 'CRITICAL' ? 'bg-red-100 text-red-950 border border-red-300' : 'bg-amber-100 text-amber-950 border border-amber-300'
                      }`}>
                        {r.severity}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-mono text-black font-semibold text-[11px]">{r.notifyChannels.join(', ')}</td>
                    <td className="py-3 px-3 text-right">
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-950 border border-emerald-300 font-extrabold text-[10px]">
                        ACTIVE
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: ALARMS FEED */}
      {activeTab === 'console' && (
        <div className={cardCls}>
          <div className="flex items-center justify-between pb-2.5 border-b border-slate-200 mb-2.5">
            <h3 className="text-xs font-black text-black uppercase tracking-wider font-mono">Live Incidents Feed</h3>
          </div>
          {alarms.length === 0 ? (
            <div className="py-8 text-center text-slate-500 text-xs">
              No active alarms. All systems operating within normal parameters.
            </div>
          ) : (
            <div className="space-y-2">
              {alarms.map(a => (
                <div key={a.id} className="p-3 rounded-xl border border-slate-200 bg-slate-50/70 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-xs text-black">{a.message}</div>
                    <div className="text-[10px] text-slate-700 font-mono font-bold mt-0.5">{a.id} • {a.deviceId} • {a.time}</div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-950 border border-red-300 font-extrabold text-[10px]">
                    {a.severity}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: NOTIFICATIONS */}
      {activeTab === 'notifications' && (
        <div className={cardCls}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {recipients.map(r => (
              <div key={r.id} className="p-3 rounded-xl border border-slate-200 bg-slate-50/70 space-y-1.5">
                <div className="font-bold text-xs text-black">{r.name}</div>
                <div className="text-[11px] font-mono font-bold text-black">{r.target}</div>
                <span className="inline-block px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-950 border border-emerald-300 font-extrabold text-[10px]">
                  {r.type} • ACTIVE
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
