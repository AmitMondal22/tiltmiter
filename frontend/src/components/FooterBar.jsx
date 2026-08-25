import React from 'react';

export default function FooterBar() {
  return (
    <footer className="mt-4 pt-3 pb-1 text-[11px] font-mono text-slate-400 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 select-none">
      <div>
        <span>Timezone: Asia/Kolkata (UTC +05:30)</span>
      </div>
      <div className="flex items-center gap-1.5 text-cyan-500 font-semibold">
        <span>((•)) Data Source: Sensor Node (2.5 Hz)</span>
      </div>
      <div>
        <span>© 2025 Tiltmeter Monitoring System</span>
      </div>
    </footer>
  );
}
