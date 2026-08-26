import React, { useState, useEffect } from 'react';
import {
  Shield, Battery, Signal, Sun, ExternalLink, Clock
} from 'lucide-react';
import TiltmeterStatCards from '../components/TiltmeterStatCards';
import TiltmeterChartsRow from '../components/TiltmeterChartsRow';
import TiltDirectionCompass from '../components/TiltDirectionCompass';
import TiltPositionVisualizer from '../components/TiltPositionVisualizer';
import AlarmSummaryWidget from '../components/AlarmSummaryWidget';
import SensorHealthWidget from '../components/SensorHealthWidget';
import RecentEventsWidget from '../components/RecentEventsWidget';
import { telemetryService } from '../services/telemetryManager';
import { parseTelemetry } from '../utils/telemetryHelper';

export default function DashboardPage({ devices = [], currentDevice, onSelectDevice }) {
  const [liveOverride, setLiveOverride] = useState(null);

  const baseDevice = currentDevice || devices[0] || {
    id: 'TILTM00001',
    name: 'Tilt Meter 001',
    siteId: 'SITE-KB01',
    structureType: 'Crash Barrier',
    status: 'ONLINE',
    battery: '92%',
    signalStrength: '-65 dBm',
  };

  const activeDevice = liveOverride && (liveOverride.id === baseDevice.id || liveOverride.deviceId === baseDevice.id)
    ? { ...baseDevice, ...liveOverride }
    : baseDevice;

  // Real-time WebSocket connection while Dashboard is open; automatically disconnects on page change
  useEffect(() => {
    const unsubscribe = telemetryService.subscribe((packet) => {
      if (!packet) return;
      const targetId = packet.deviceId || packet.id;
      if (!targetId || targetId === baseDevice.id || targetId === baseDevice.serialNumber) {
        const parsed = parseTelemetry(packet);
        setLiveOverride(parsed);
        if (onSelectDevice) {
          onSelectDevice(prev => (prev ? { ...prev, ...parsed } : parsed));
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [baseDevice.id]);

  const lastSyncTime = activeDevice.timestamp 
    ? new Date(activeDevice.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })
    : 'Just now';

  return (
    <div className="space-y-3 font-sans text-slate-900">
      {/* Top Active Sensor Node Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl border border-slate-200/80 bg-white shadow-xs">
        {/* Left: Tiltmeter Sensor Icon + Label + Selector Dropdown + Asset Badge */}
        <div className="flex items-center gap-3">
          {/* Tiltmeter Sensor Icon (Replaced Camera Icon) */}
          <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20 flex-shrink-0">
            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <line x1="12" y1="3" x2="12" y2="6" />
              <line x1="12" y1="18" x2="12" y2="21" />
              <line x1="3" y1="12" x2="6" y2="12" />
              <line x1="18" y1="12" x2="21" y2="12" />
              <path d="m9 15 6-6" strokeWidth="2.5" />
              <circle cx="15" cy="9" r="1.5" fill="currentColor" />
            </svg>
          </div>

          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono">
              ACTIVE SENSOR NODE
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <select
                value={activeDevice.id}
                onChange={(e) => {
                  const dev = devices.find(d => d.id === e.target.value);
                  if (dev && onSelectDevice) onSelectDevice(dev);
                }}
                className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-900 font-bold text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer shadow-2xs"
              >
                {devices.map(dev => (
                  <option key={dev.id} value={dev.id}>
                    {dev.name || 'Tilt Meter 001'} ({dev.id || 'TILTM00001'})
                  </option>
                ))}
                {devices.length === 0 && (
                  <option value="TILTM00001">Tilt Meter 001 (TILTM00001)</option>
                )}
              </select>

              <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-semibold shadow-2xs">
                <Shield className="w-3.5 h-3.5 text-blue-500" />
                <span>{activeDevice.structureType || 'Crash Barrier'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Status Pill, Battery, Signal, Sun, External Link */}
        <div className="flex items-center gap-2.5 text-xs">
          {/* ONLINE (2.5 Hz) Status Pill */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
            <span>ONLINE (2.5 Hz)</span>
          </div>

          {/* Last Live Packet Time */}
          <div className="hidden md:flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-600 font-mono font-medium shadow-2xs">
            <Clock className="w-3.5 h-3.5 text-blue-500" />
            <span>{lastSyncTime}</span>
          </div>

          {/* Battery Level */}
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-700 font-semibold shadow-2xs">
            <Battery className="w-4 h-4 text-emerald-600" />
            <span>{activeDevice.battery || '100%'}</span>
          </div>

          {/* Signal Strength */}
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-700 font-semibold shadow-2xs">
            <Signal className="w-4 h-4 text-blue-600" />
            <span>{activeDevice.signalStrength || activeDevice.signal || '100%'}</span>
          </div>

          {/* Sun Icon */}
          <div className="p-2 rounded-xl border border-slate-200 text-slate-400 hover:text-slate-600 cursor-pointer shadow-2xs">
            <Sun className="w-4 h-4 text-amber-500" />
          </div>

          {/* External Fullscreen Icon */}
          <div className="p-2 rounded-xl border border-slate-200 text-slate-400 hover:text-slate-600 cursor-pointer shadow-2xs">
            <ExternalLink className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Row 1: 7 Primary Inclinometer Stat Cards */}
      {/* Row 2: 7 Secondary Diagnostics Pills */}
      <TiltmeterStatCards currentDevice={activeDevice} />

      {/* Row 3: 3 Real-Time Multi-Axis Trend Charts */}
      <TiltmeterChartsRow currentDevice={activeDevice} />

      {/* Row 4: 5 Deep Analysis Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
        {/* 1. Live Vector Direction Compass */}
        <TiltDirectionCompass currentDevice={activeDevice} />

        {/* 2. Dual-Axis Tilt Level */}
        <TiltPositionVisualizer currentDevice={activeDevice} />

        {/* 3. Alarm Console Summary */}
        <AlarmSummaryWidget currentDevice={activeDevice} />

        {/* 4. Core Sensor Diagnostics */}
        <SensorHealthWidget currentDevice={activeDevice} />

        {/* 5. Live System Events Log */}
        <RecentEventsWidget currentDevice={activeDevice} />
      </div>
    </div>
  );
}
