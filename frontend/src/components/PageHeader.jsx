import React from 'react';
import { Menu, Radio, Bell, Clock } from 'lucide-react';

export default function PageHeader({
  title,
  description,
  isRealTime,
  onToggleMobileNav
}) {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 px-3 sm:px-6 py-3 bg-white text-black shadow-xs">
      <div className="flex items-center justify-between gap-3 sm:gap-4">
        {/* Left: Mobile Hamburger + Page Title & Subtitle */}
        <div className="flex items-center gap-3">
          <button
            onClick={onToggleMobileNav}
            title="Open Navigation"
            className="p-2 rounded-xl md:hidden border border-slate-300 text-black hover:bg-slate-100 transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div>
            <h1 className="font-black text-lg sm:text-xl leading-tight text-black">
              {title}
            </h1>
            <p className="text-xs mt-0.5 font-bold text-slate-700">
              {description}
            </p>
          </div>
        </div>

        {/* Right: Live Telemetry Status, Notifications, and Real-time Clock */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Status Badge */}
          <div className="hidden sm:flex items-center gap-1.5 text-xs font-extrabold px-3 py-1.5 rounded-xl bg-emerald-100 text-emerald-950 border border-emerald-300">
            <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
            <span>ONLINE</span>
          </div>

          {/* Live Indicator */}
          {isRealTime && (
            <div className="flex items-center gap-1.5 text-xs font-black px-3 py-1.5 rounded-xl bg-sky-600 text-white shadow-xs">
              <Radio className="w-3.5 h-3.5 animate-pulse" />
              <span>LIVE STREAM</span>
            </div>
          )}

          {/* Alert Notification Bell */}
          <div className="relative">
            <button
              title="System Alerts"
              className="p-2 rounded-xl border border-slate-300 bg-slate-50 text-black hover:bg-slate-100 transition-colors"
            >
              <Bell className="w-4 h-4 text-black" />
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-600 text-white rounded-full text-[9px] font-bold flex items-center justify-center">
                3
              </span>
            </button>
          </div>

          {/* Clock Widget */}
          <div className="hidden md:flex items-center gap-2 pl-3 border-l border-slate-300 font-mono text-xs font-extrabold text-black">
            <Clock className="w-3.5 h-3.5 text-black" />
            <span>{timeStr}</span>
            <span className="text-slate-500">|</span>
            <span className="text-slate-800">{dateStr}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
