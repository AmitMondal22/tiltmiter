import React, { useState, useEffect } from 'react';
import { HashRouter as Router, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import { AuthProvider, useAuth } from './context/AuthContext';
import { getSites, getDevices, getWsUrl } from './api/apiClient';
import { Menu } from 'lucide-react';

// Core Page Components
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import OrganizationsPage from './pages/OrganizationsPage';
import ProjectsPage from './pages/ProjectsPage';
import SitesPage from './pages/SitesPage';
import StructuresPage from './pages/StructuresPage';
import DevicesPage from './pages/DevicesPage';
import DeviceDetailPage from './pages/DeviceDetailPage';
import UsersPage from './pages/UsersPage';
import TrendsPage from './pages/TrendsPage';
import ReportsPage from './pages/ReportsPage';
import AlarmsPage from './pages/AlarmsPage';
import SettingsPage from './pages/SettingsPage';
import { parseTelemetry } from './utils/telemetryHelper';
import { telemetryService } from './services/telemetryManager';

function MainLayout() {
  const location = useLocation();
  const { user, logout, loading: authLoading } = useAuth();
  const [devices, setDevices] = useState([]);
  const [currentDevice, setCurrentDevice] = useState(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Set pure Light Mode on document
  useEffect(() => {
    document.documentElement.classList.remove('dark');
    document.body.style.backgroundColor = '#f8fafc';
    document.body.style.color = '#0f172a';
  }, []);

  // Fetch real database devices from API
  useEffect(() => {
    if (!user) return;

    getDevices()
      .then(data => {
        if (data?.devices?.length) {
          setDevices(data.devices);
          setCurrentDevice(prev => prev || data.devices[0]);
        }
      })
      .catch(() => {});
  }, [user]);

  // Cleanup on logout
  useEffect(() => {
    if (!user) {
      telemetryService.disconnect();
    }
  }, [user]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center font-sans bg-slate-50 text-slate-900">
        <div className="flex items-center gap-3 font-semibold text-sm">
          <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <span>Loading platform...</span>
        </div>
      </div>
    );
  }

  // Mandatory Authentication Guard -> Render Full-Page Login
  if (!user) {
    return <LoginPage />;
  }

  return (
    <div className="min-h-screen flex bg-[#f8fafc] text-slate-900 font-sans">
      {/* Sidebar Navigation */}
      <Sidebar
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
        user={user}
        logout={logout}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Mobile Hamburger Button */}
        <div className="md:hidden p-3 pb-0 flex items-center justify-between">
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="p-2 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 shadow-2xs"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Page Content (Footer Removed) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          <Routes>
            <Route path="/" element={<DashboardPage devices={devices} currentDevice={currentDevice} onSelectDevice={setCurrentDevice} />} />
            <Route path="/dashboard" element={<DashboardPage devices={devices} currentDevice={currentDevice} onSelectDevice={setCurrentDevice} />} />
            <Route path="/organizations" element={<OrganizationsPage isDark={false} />} />
            <Route path="/projects" element={<ProjectsPage isDark={false} />} />
            <Route path="/sites" element={<SitesPage isDark={false} />} />
            <Route path="/locations" element={<SitesPage isDark={false} />} />
            <Route path="/structures" element={<StructuresPage isDark={false} />} />
            <Route path="/assets" element={<StructuresPage isDark={false} />} />
            <Route path="/devices" element={<DevicesPage isDark={false} />} />
            <Route path="/devices/:deviceId" element={<DeviceDetailPage />} />
            <Route path="/users" element={<UsersPage isDark={false} />} />
            <Route path="/trends" element={<TrendsPage isDark={false} />} />
            <Route path="/history" element={<TrendsPage isDark={false} />} />
            <Route path="/reports" element={<ReportsPage currentDevice={currentDevice} isDark={false} />} />
            <Route path="/alarms" element={<AlarmsPage isDark={false} />} />
            <Route path="/alerts" element={<AlarmsPage isDark={false} />} />
            <Route path="/settings" element={<SettingsPage isDark={false} />} />
            <Route path="/login" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <MainLayout />
      </Router>
    </AuthProvider>
  );
}
