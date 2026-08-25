import React, { useState } from 'react';
import { Settings, Save, CheckCircle2, Sliders, Database, Shield } from 'lucide-react';

export default function SettingsPage() {
  const cardCls = 'rounded-2xl border p-5 transition-all bg-white border-slate-200/80 text-slate-900 shadow-xs';

  const [samplingRate, setSamplingRate] = useState('1000');
  const [retentionDays, setRetentionDays] = useState('365');
  const [autoZeroOffset, setAutoZeroOffset] = useState(true);
  const [savedNotice, setSavedNotice] = useState(false);

  const handleSave = (e) => {
    e.preventDefault();
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 3000);
  };

  return (
    <div className="space-y-4 font-sans text-slate-900">
      {/* Toast */}
      {savedNotice && (
        <div className="p-3.5 rounded-xl border flex items-center gap-2 text-xs font-semibold bg-emerald-50 border-emerald-200 text-emerald-800 shadow-sm animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>System Settings updated successfully.</span>
        </div>
      )}

      {/* Top Header Row */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-950">
            Settings
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Platform preferences, telemetry sampling rates, and data retention policies
          </p>
        </div>

        {/* Black Pill Save Button */}
        <button
          onClick={handleSave}
          className="flex items-center gap-1.5 px-5 py-2.5 bg-black text-white font-bold text-xs rounded-xl shadow-xs hover:bg-neutral-800 transition-all"
        >
          <Save className="w-4 h-4" />
          <span>Save Settings</span>
        </button>
      </div>

      {/* Hardware Telemetry Sampling & Storage */}
      <div className={cardCls}>
        <div className="flex items-center gap-2 mb-3">
          <Sliders className="w-4 h-4 text-slate-700" />
          <h3 className="text-sm font-bold text-slate-950">Hardware Telemetry Sampling & Ingestion</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/60 space-y-2">
            <label className="block font-bold">Telemetry Ingestion Interval (ms)</label>
            <select
              value={samplingRate}
              onChange={e => setSamplingRate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-mono font-bold"
            >
              <option value="500">500 ms (High Frequency)</option>
              <option value="1000">1000 ms (Standard Real-time)</option>
              <option value="5000">5000 ms (Low Power)</option>
            </select>
          </div>

          <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/60 space-y-2">
            <label className="block font-bold">Data Retention Policy</label>
            <select
              value={retentionDays}
              onChange={e => setRetentionDays(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-mono font-bold"
            >
              <option value="90">90 Days</option>
              <option value="365">365 Days (1 Year)</option>
              <option value="1095">3 Years</option>
            </select>
          </div>
        </div>
      </div>

      {/* Automatic Drift Calibration */}
      <div className={cardCls}>
        <div className="flex items-center gap-2 mb-3">
          <Shield className="w-4 h-4 text-slate-700" />
          <h3 className="text-sm font-bold text-slate-950">Sensor Calibration & Baseline</h3>
        </div>
        <div className="flex items-center justify-between p-4 rounded-xl border border-slate-100 bg-slate-50/60 text-xs">
          <div>
            <div className="font-bold text-slate-900">Auto Zero Offset Compensation</div>
            <div className="text-slate-500 text-[11px]">Auto-compensate initial structural baseline offsets upon deployment</div>
          </div>
          <button
            type="button"
            onClick={() => setAutoZeroOffset(!autoZeroOffset)}
            className={`px-4 py-2 rounded-xl font-bold font-mono text-xs border transition-all ${
              autoZeroOffset ? 'bg-black text-white shadow-xs' : 'bg-slate-200 text-slate-700'
            }`}
          >
            {autoZeroOffset ? 'ENABLED' : 'DISABLED'}
          </button>
        </div>
      </div>
    </div>
  );
}
