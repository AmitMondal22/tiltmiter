import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Building2,
  FolderTree,
  MapPin,
  Layers,
  Cpu,
  Users,
  BarChart2,
  FileText,
  Bell,
  Settings,
  CheckCircle,
  ChevronsUpDown
} from 'lucide-react';
import appLogo from '../assets/logo/logo.png';

const NAV_ITEMS = [
  { id: 'dashboard', path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'organizations', path: '/organizations', label: 'Organizations', icon: Building2 },
  { id: 'projects', path: '/projects', label: 'Projects', icon: FolderTree },
  { id: 'locations', path: '/sites', label: 'Locations / Sites', icon: MapPin },
  { id: 'assets', path: '/structures', label: 'Assets', icon: Layers },
  { id: 'devices', path: '/devices', label: 'Devices', icon: Cpu },
  { id: 'users', path: '/users', label: 'Manage Users', icon: Users },
  { id: 'trends', path: '/trends', label: 'Historical Data', icon: BarChart2 },
  { id: 'reports', path: '/reports', label: 'Reports', icon: FileText },
  { id: 'alarms', path: '/alarms', label: 'Alert & Notifications', icon: Bell, badge: '5' },
  { id: 'settings', path: '/settings', label: 'Settings', icon: Settings },
];

export default function Sidebar({
  mobileOpen,
  onCloseMobile,
  user,
  logout
}) {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-xs md:hidden"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={`fixed md:static inset-y-0 left-0 z-50 flex flex-col justify-between w-64 border-r border-slate-200/80 bg-white text-slate-800 transition-all duration-200 select-none ${mobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full md:translate-x-0'
          }`}
      >
        {/* Top Logo & Platform Title */}
        <div className="p-5 pb-3">
          <div className="flex items-center gap-3">
            {/* Logo Image */}
            <div className="h-10 flex items-center justify-start">
              <img
                src={appLogo}
                alt="Logo"
                className="max-h-10 max-w-full object-contain"
              />
            </div>
          </div>
        </div>

        {/* Navigation Menu */}
        <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active =
              location.pathname === item.path ||
              (item.path === '/' && (location.pathname === '' || location.pathname === '/dashboard')) ||
              (item.path === '/sites' && (location.pathname === '/sites' || location.pathname === '/locations')) ||
              (item.path === '/structures' && (location.pathname === '/structures' || location.pathname === '/assets')) ||
              (item.path === '/trends' && (location.pathname === '/trends' || location.pathname === '/history')) ||
              (item.path === '/alarms' && (location.pathname === '/alarms' || location.pathname === '/alerts'));

            return (
              <button
                key={item.id}
                onClick={() => {
                  navigate(item.path);
                  onCloseMobile?.();
                }}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all ${active
                    ? 'bg-blue-50 text-blue-600 font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${active ? 'text-blue-600' : 'text-slate-500'}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span className="px-1.5 py-0.2 rounded-full bg-red-50 text-red-600 border border-red-200 text-[10px] font-semibold">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom Section: System Operational Card & User Card */}
        <div className="p-3 border-t border-slate-100 space-y-2">
          {/* System Status Operational Card */}
          <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-100">
            <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center flex-shrink-0">
              <CheckCircle className="w-3.5 h-3.5" />
            </div>
            <div>
              <div className="text-[11px] font-semibold text-slate-900 leading-tight">System Status</div>
              <div className="text-[9px] text-slate-500 font-normal leading-tight">All Systems Operational</div>
            </div>
          </div>

          {/* Admin User Profile Card */}
          <div
            onClick={logout}
            title="Click to Logout"
            className="flex items-center justify-between p-2 rounded-xl border border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 font-semibold text-xs flex items-center justify-center flex-shrink-0">
                AD
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold text-slate-900 truncate">
                  Admin User
                </div>
                <div className="text-[9px] text-slate-500 truncate">
                  Super Administrator
                </div>
              </div>
            </div>
            <ChevronsUpDown className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
          </div>
        </div>
      </aside>
    </>
  );
}
