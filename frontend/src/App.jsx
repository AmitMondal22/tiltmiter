import React, { useState, useEffect, lazy, Suspense } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import { AuthProvider, useAuth } from './context/AuthContext';
import { getDevices } from './api/apiClient';
import { Menu } from 'lucide-react';
import { telemetryService } from './services/telemetryManager';

// Eagerly loaded critical pages
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';

// Lazy loaded feature pages for bundle size optimization & fast initial page load
const OrganizationsPage = lazy(() => import('./pages/OrganizationsPage'));
const ProjectsPage = lazy(() => import('./pages/ProjectsPage'));
const SitesPage = lazy(() => import('./pages/SitesPage'));
const StructuresPage = lazy(() => import('./pages/StructuresPage'));
const DevicesPage = lazy(() => import('./pages/DevicesPage'));
const DeviceDetailPage = lazy(() => import('./pages/DeviceDetailPage'));
const UsersPage = lazy(() => import('./pages/UsersPage'));
const TrendsPage = lazy(() => import('./pages/TrendsPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const AlarmsPage = lazy(() => import('./pages/AlarmsPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

// Sleek fallback component for lazy-loaded route transitions
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[300px] w-full text-slate-500">
      <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-white border border-slate-200 shadow-xs font-semibold text-xs text-slate-700">
        <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <span>Loading view...</span>
      </div>
    </div>
  );
}

function MainLayout() {
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
            className="p-2 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 shadow-2xs cursor-pointer"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Page Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          <Suspense fallback={<PageLoader />}>
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
          </Suspense>
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
