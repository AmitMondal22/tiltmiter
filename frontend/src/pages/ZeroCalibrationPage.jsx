import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Target,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Lock,
  ShieldCheck,
  Cpu,
  MapPin,
  Activity,
  Sliders,
  Search,
  RefreshCw,
  Info,
  ArrowRight,
  Clock,
  Sparkles,
  Layers,
  BatteryCharging,
  Radio,
  Thermometer,
  Compass
} from 'lucide-react';
import {
  getDevices,
  getDevice,
  zeroDeviceReadings,
  zeroAllDevicesReadings
} from '../api/apiClient';
import { useAuth } from '../context/AuthContext';

export default function ZeroCalibrationPage({ isDark = false }) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  // Selected device & device lists
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState(searchParams.get('deviceId') || '');
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Calibration scope options
  const [updateHistory, setUpdateHistory] = useState(false);
  const [setReferenceBaseline, setSetReferenceBaseline] = useState(true);
  const [isBulkMode, setIsBulkMode] = useState(false);

  // UI state
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [feedback, setFeedback] = useState(null); // { type: 'success' | 'error', message, details }
  const [activityLogs, setActivityLogs] = useState(() => {
    try {
      const saved = localStorage.getItem('tiltmeter_zero_activity_logs');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  // Load devices on mount
  const loadDeviceList = async (preferredId = '') => {
    setLoadingDevices(true);
    try {
      const res = await getDevices();
      const list = res?.devices || [];
      setDevices(list);

      const queryDevId = preferredId || selectedDeviceId || searchParams.get('deviceId');
      if (queryDevId && list.some(d => d.id === queryDevId)) {
        setSelectedDeviceId(queryDevId);
      } else if (list.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(list[0].id);
      }
    } catch (err) {
      console.error('Failed to load devices:', err);
    } finally {
      setLoadingDevices(false);
    }
  };

  useEffect(() => {
    loadDeviceList();
  }, []);

  // Fetch full details of selected device
  useEffect(() => {
    if (!selectedDeviceId || isBulkMode) {
      setSelectedDevice(null);
      return;
    }

    let isMounted = true;
    getDevice(selectedDeviceId)
      .then(res => {
        if (isMounted && res?.device) {
          setSelectedDevice(res.device);
        }
      })
      .catch(() => {
        // Fallback to existing list item
        const local = devices.find(d => d.id === selectedDeviceId);
        if (isMounted) setSelectedDevice(local || null);
      });

    return () => { isMounted = false; };
  }, [selectedDeviceId, isBulkMode, devices]);

  // Persist activity logs
  const logActivity = (entry) => {
    setActivityLogs(prev => {
      const updated = [entry, ...prev].slice(0, 20);
      try {
        localStorage.setItem('tiltmeter_zero_activity_logs', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
  };

  // Perform Zero Calibration for Single Device
  const handleExecuteSingleZero = async () => {
    if (!selectedDeviceId) return;
    setSubmitting(true);
    setFeedback(null);

    const prevSnapshot = selectedDevice ? {
      xTilt: selectedDevice.xTilt ?? 0,
      yTilt: selectedDevice.yTilt ?? 0,
      resultantTilt: selectedDevice.resultantTilt ?? 0,
      xDisplacement: selectedDevice.xDisplacement ?? 0,
      yDisplacement: selectedDevice.yDisplacement ?? 0,
      totalDisplacement: selectedDevice.totalDisplacement ?? 0,
    } : null;

    try {
      const res = await zeroDeviceReadings(selectedDeviceId, {
        updateHistory,
        setReference: setReferenceBaseline,
      });

      if (res?.statusCode === 200 || res?.message) {
        setFeedback({
          type: 'success',
          message: `Tilt & Displacement successfully zeroed for ${selectedDeviceId}!`,
          details: `Updated xTilt, yTilt, resultantTilt to 0.000° and displacements to 0.000mm. All other data (battery, signal, temperature, status) remained unchanged.`,
        });

        // Update local state immediately
        if (res.device) {
          setSelectedDevice(res.device);
          setDevices(prev => prev.map(d => d.id === selectedDeviceId ? res.device : d));
        } else {
          setSelectedDevice(prev => prev ? {
            ...prev,
            xTilt: 0.0,
            yTilt: 0.0,
            resultantTilt: 0.0,
            xDisplacement: 0.0,
            yDisplacement: 0.0,
            totalDisplacement: 0.0,
          } : null);
        }

        logActivity({
          id: Date.now(),
          timestamp: new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }),
          date: new Date().toLocaleDateString('en-IN'),
          deviceId: selectedDeviceId,
          operator: user?.fullName || user?.username || 'Operator',
          scope: 'Single Device',
          previous: prevSnapshot,
          status: 'SUCCESS',
        });
      } else {
        throw new Error(res?.message || 'Failed to update zero readings.');
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: `Failed to set zero for ${selectedDeviceId}`,
        details: err.message || 'Network error or permission denied.',
      });
    } finally {
      setSubmitting(false);
      setConfirmModalOpen(false);
    }
  };

  // Perform Zero Calibration for ALL Devices (Bulk)
  const handleExecuteBulkZero = async () => {
    setSubmitting(true);
    setFeedback(null);

    try {
      const targetIds = filteredDevices.map(d => d.id);
      const res = await zeroAllDevicesReadings({
        updateHistory,
        setReference: setReferenceBaseline,
        deviceIds: targetIds,
      });

      if (res?.statusCode === 200 || res?.message) {
        setFeedback({
          type: 'success',
          message: `Tilt & Displacement zeroed across all ${res?.updatedDeviceCount || targetIds.length} devices!`,
          details: `All selected devices have had their Tilt and Displacement set to 0.000. All non-tilt metadata was protected and unchanged.`,
        });

        // Refresh devices
        await loadDeviceList();

        logActivity({
          id: Date.now(),
          timestamp: new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }),
          date: new Date().toLocaleDateString('en-IN'),
          deviceId: `ALL (${targetIds.length} Devices)`,
          operator: user?.fullName || user?.username || 'Operator',
          scope: 'Bulk All Devices',
          status: 'SUCCESS',
        });
      } else {
        throw new Error(res?.message || 'Bulk zeroing failed.');
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: 'Failed to zero all devices',
        details: err.message || 'An error occurred during bulk operation.',
      });
    } finally {
      setSubmitting(false);
      setConfirmModalOpen(false);
    }
  };

  // Filter devices list for search
  const filteredDevices = devices.filter(d => {
    const matchesSearch =
      d.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (d.name && d.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (d.Site?.name && d.Site.name.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesStatus =
      statusFilter === 'ALL' ||
      (statusFilter === 'ONLINE' && d.status === 'ONLINE') ||
      (statusFilter === 'OFFLINE' && d.status === 'OFFLINE') ||
      (statusFilter === 'ALARM' && (d.status === 'ALARM' || d.status === 'WARNING'));
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Banner / Header */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 md:p-8 shadow-xs relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-blue-50 to-indigo-50/50 rounded-full blur-3xl -z-10 pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200/60 text-blue-700 text-xs font-semibold">
              <Compass className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: '10s' }} />
              <span>ClinoX Calibration & Tare Engine</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
              <Target className="w-8 h-8 text-blue-600" />
              Device Zero Calibration
            </h1>
            <p className="text-sm text-slate-600 max-w-3xl">
              Select an inclinometer device to set its current <strong className="text-slate-900 font-semibold">Tilt (X, Y, Resultant)</strong> and <strong className="text-slate-900 font-semibold">Displacement (X, Y, Total)</strong> readings to exactly <span className="font-mono text-blue-600 font-bold bg-blue-50 px-1.5 py-0.5 rounded">0.000</span>.
              All other device parameters (battery, signal, temperature, status, organization, hardware metadata) are <strong className="text-emerald-700 font-semibold">strictly locked & unchanged</strong>.
            </p>
          </div>

          {/* Quick mode switch */}
          <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-2xl border border-slate-200 self-start md:self-auto">
            <button
              onClick={() => setIsBulkMode(false)}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                !isBulkMode
                  ? 'bg-white text-blue-600 shadow-xs border border-slate-200/80 font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Single Device
            </button>
            <button
              onClick={() => setIsBulkMode(true)}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                isBulkMode
                  ? 'bg-white text-blue-600 shadow-xs border border-slate-200/80 font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Devices (Bulk)
            </button>
          </div>
        </div>
      </div>

      {/* Feedback Alerts */}
      {feedback && (
        <div
          className={`p-4 rounded-2xl border flex items-start gap-3 transition-all ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 text-sm">
            <p className="font-semibold">{feedback.message}</p>
            {feedback.details && <p className="text-xs mt-1 opacity-90">{feedback.details}</p>}
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-xs font-bold px-2 py-1 rounded-lg hover:bg-black/5 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Grid: Selection Column & Preview/Action Column */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Device Selector & Filter (4 cols or 5 cols) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Cpu className="w-4 h-4 text-blue-600" />
                {isBulkMode ? 'Bulk Scope' : 'Select Device'}
              </h2>
              <button
                onClick={() => loadDeviceList(selectedDeviceId)}
                disabled={loadingDevices}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-blue-600 hover:bg-slate-50 transition-colors cursor-pointer"
                title="Refresh Device List"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingDevices ? 'animate-spin text-blue-600' : ''}`} />
              </button>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search by ID, name or site..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              />
            </div>

            {/* Status Pills Filter */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {['ALL', 'ONLINE', 'ALARM', 'OFFLINE'].map(st => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`px-2.5 py-1 text-[11px] rounded-lg font-medium transition-colors cursor-pointer ${
                    statusFilter === st
                      ? 'bg-blue-600 text-white font-semibold shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>

            {/* Device List or Bulk Counter */}
            {isBulkMode ? (
              <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200/70 text-slate-800 space-y-2">
                <div className="flex items-center justify-between font-bold text-sm text-blue-900">
                  <span>Selected Target Devices:</span>
                  <span className="px-2 py-0.5 rounded-full bg-blue-600 text-white text-xs">
                    {filteredDevices.length} Devices
                  </span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Bulk mode will iterate over every matching device in your tenant scope and apply a Tilt = 0.000° and Displacement = 0.000mm tare update to each one.
                </p>
                <div className="max-h-48 overflow-y-auto space-y-1.5 pt-2 border-t border-blue-200/50">
                  {filteredDevices.map(d => (
                    <div key={d.id} className="flex items-center justify-between text-xs py-1 px-2 rounded-lg bg-white/80 border border-blue-100">
                      <span className="font-semibold text-slate-800">{d.id}</span>
                      <span className="text-[11px] text-slate-500 truncate max-w-[140px]">{d.name}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        d.status === 'ONLINE' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
                      }`}>
                        {d.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                {filteredDevices.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    No devices match the search criteria.
                  </div>
                ) : (
                  filteredDevices.map(device => {
                    const isSelected = selectedDeviceId === device.id;
                    return (
                      <div
                        key={device.id}
                        onClick={() => setSelectedDeviceId(device.id)}
                        className={`p-3 rounded-xl border text-xs cursor-pointer transition-all flex items-center justify-between ${
                          isSelected
                            ? 'bg-blue-50/80 border-blue-500 ring-2 ring-blue-500/20 shadow-xs'
                            : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <div className="space-y-0.5 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-900">{device.id}</span>
                            <span className={`w-2 h-2 rounded-full ${
                              device.status === 'ONLINE' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                            }`} />
                          </div>
                          <p className="text-slate-500 truncate font-medium">{device.name}</p>
                          {device.Site?.name && (
                            <p className="text-[10px] text-slate-400 flex items-center gap-1">
                              <MapPin className="w-2.5 h-2.5" />
                              {device.Site.name}
                            </p>
                          )}
                        </div>

                        <div className="text-right shrink-0 space-y-0.5">
                          <div className="font-mono text-slate-700 font-semibold text-[11px]">
                            Tilt: {(device.resultantTilt ?? 0).toFixed(3)}°
                          </div>
                          <div className="font-mono text-slate-500 text-[10px]">
                            Disp: {(device.totalDisplacement ?? 0).toFixed(3)} mm
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* Safe Calibration Guarantee Card */}
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 shadow-xs text-xs text-emerald-900 space-y-2">
            <div className="flex items-center gap-2 font-bold text-emerald-950">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Strict Data Isolation Guarantee</span>
            </div>
            <p className="text-[11px] leading-relaxed text-emerald-800">
              This routine triggers an atomic database write affecting <strong className="underline">ONLY</strong> Tilt angles and Lateral Displacements.
              Network CSQ, battery state of charge, temperature, device ID, assigned site/asset, and operational status are untouched.
            </p>
          </div>
        </div>

        {/* Right Column: Comparison, Safety Options & Action Execution (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          {/* Before & After Comparison Card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
              <div>
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Activity className="w-5 h-5 text-blue-600" />
                  Telemetry Values: Current vs. Target (Zeroed)
                </h2>
                <p className="text-xs text-slate-500">
                  {isBulkMode
                    ? `Showing target 0.000 values that will be applied to all ${filteredDevices.length} filtered devices.`
                    : `Active device: ${selectedDeviceId || 'None'} (${selectedDevice?.name || 'Loading...'})`}
                </p>
              </div>

              {!isBulkMode && selectedDevice && (
                <div className="flex items-center gap-2">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                    selectedDevice.status === 'ONLINE'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}>
                    {selectedDevice.status || 'ONLINE'}
                  </span>
                  <span className="text-xs font-mono text-slate-400">
                    SN: {selectedDevice.serialNumber || 'N/A'}
                  </span>
                </div>
              )}
            </div>

            {/* Target 0 Comparison Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Box 1: Tilt Angles */}
              <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-blue-900 flex items-center gap-1.5 uppercase tracking-wider">
                    <Compass className="w-3.5 h-3.5 text-blue-600" />
                    Tilt Angles (° Deg)
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-600 text-white">
                    Target: 0.000°
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  {/* X Tilt */}
                  <div className="flex items-center justify-between p-2 rounded-lg bg-white border border-blue-100/80">
                    <span className="text-slate-600 font-medium">Roll / X-Tilt (θX):</span>
                    <div className="flex items-center gap-2 font-mono">
                      <span className="text-slate-500 line-through">
                        {isBulkMode ? '--' : `${(selectedDevice?.xTilt ?? 0).toFixed(3)}°`}
                      </span>
                      <ArrowRight className="w-3 h-3 text-blue-500" />
                      <span className="font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                        0.000°
                      </span>
                    </div>
                  </div>

                  {/* Y Tilt */}
                  <div className="flex items-center justify-between p-2 rounded-lg bg-white border border-blue-100/80">
                    <span className="text-slate-600 font-medium">Pitch / Y-Tilt (θY):</span>
                    <div className="flex items-center gap-2 font-mono">
                      <span className="text-slate-500 line-through">
                        {isBulkMode ? '--' : `${(selectedDevice?.yTilt ?? 0).toFixed(3)}°`}
                      </span>
                      <ArrowRight className="w-3 h-3 text-blue-500" />
                      <span className="font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                        0.000°
                      </span>
                    </div>
                  </div>

                  {/* Resultant Tilt */}
                  <div className="flex items-center justify-between p-2 rounded-lg bg-white border border-blue-100/80">
                    <span className="text-slate-600 font-medium">Resultant Tilt (θR):</span>
                    <div className="flex items-center gap-2 font-mono">
                      <span className="text-slate-500 line-through">
                        {isBulkMode ? '--' : `${(selectedDevice?.resultantTilt ?? 0).toFixed(3)}°`}
                      </span>
                      <ArrowRight className="w-3 h-3 text-blue-500" />
                      <span className="font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                        0.000°
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Box 2: Lateral Displacement */}
              <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-indigo-900 flex items-center gap-1.5 uppercase tracking-wider">
                    <Sliders className="w-3.5 h-3.5 text-indigo-600" />
                    Lateral Displacement (mm)
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-600 text-white">
                    Target: 0.000 mm
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  {/* X Displacement */}
                  <div className="flex items-center justify-between p-2 rounded-lg bg-white border border-indigo-100/80">
                    <span className="text-slate-600 font-medium">X Displacement (DX):</span>
                    <div className="flex items-center gap-2 font-mono">
                      <span className="text-slate-500 line-through">
                        {isBulkMode ? '--' : `${(selectedDevice?.xDisplacement ?? 0).toFixed(3)} mm`}
                      </span>
                      <ArrowRight className="w-3 h-3 text-indigo-500" />
                      <span className="font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                        0.000 mm
                      </span>
                    </div>
                  </div>

                  {/* Y Displacement */}
                  <div className="flex items-center justify-between p-2 rounded-lg bg-white border border-indigo-100/80">
                    <span className="text-slate-600 font-medium">Y Displacement (DY):</span>
                    <div className="flex items-center gap-2 font-mono">
                      <span className="text-slate-500 line-through">
                        {isBulkMode ? '--' : `${(selectedDevice?.yDisplacement ?? 0).toFixed(3)} mm`}
                      </span>
                      <ArrowRight className="w-3 h-3 text-indigo-500" />
                      <span className="font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                        0.000 mm
                      </span>
                    </div>
                  </div>

                  {/* Total Displacement */}
                  <div className="flex items-center justify-between p-2 rounded-lg bg-white border border-indigo-100/80">
                    <span className="text-slate-600 font-medium">Total Displacement:</span>
                    <div className="flex items-center gap-2 font-mono">
                      <span className="text-slate-500 line-through">
                        {isBulkMode ? '--' : `${(selectedDevice?.totalDisplacement ?? 0).toFixed(3)} mm`}
                      </span>
                      <ArrowRight className="w-3 h-3 text-indigo-500" />
                      <span className="font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                        0.000 mm
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Protected Data Grid (Visual Proof that non-tilt data is untouched) */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-800 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-slate-500" />
                  Protected Parameters (Locked & Preserved)
                </span>
                <span className="text-[11px] font-medium text-slate-500">
                  These values are NEVER modified by the zero calibration routine
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="p-2.5 rounded-lg bg-white border border-slate-200 flex items-center gap-2.5">
                  <BatteryCharging className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[10px] text-slate-400 uppercase font-semibold">Battery</div>
                    <div className="font-bold text-slate-800 truncate">
                      {isBulkMode ? 'Retained per device' : (selectedDevice?.battery || '100%')}
                    </div>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-white border border-slate-200 flex items-center gap-2.5">
                  <Radio className="w-4 h-4 text-blue-600 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[10px] text-slate-400 uppercase font-semibold">Cellular Signal</div>
                    <div className="font-bold text-slate-800 truncate">
                      {isBulkMode ? 'Retained per device' : (selectedDevice?.signalStrength || '-60 dBm')}
                    </div>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-white border border-slate-200 flex items-center gap-2.5">
                  <Thermometer className="w-4 h-4 text-amber-600 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[10px] text-slate-400 uppercase font-semibold">Temperature</div>
                    <div className="font-bold text-slate-800 truncate">
                      {isBulkMode ? 'Retained per device' : `${selectedDevice?.temperature ?? 25.0} °C`}
                    </div>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-white border border-slate-200 flex items-center gap-2.5">
                  <Layers className="w-4 h-4 text-purple-600 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[10px] text-slate-400 uppercase font-semibold">Location / Asset</div>
                    <div className="font-bold text-slate-800 truncate">
                      {isBulkMode ? 'Retained per device' : (selectedDevice?.Site?.name || 'Assigned Site')}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Scope & Safety Options Checkboxes */}
            <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <Sliders className="w-3.5 h-3.5 text-blue-600" />
                Zero Calibration Configuration Options
              </h3>

              <div className="space-y-2.5 text-xs">
                {/* Option 1: Live Registry Update (Always Checked) */}
                <label className="flex items-start gap-3 p-2.5 rounded-lg bg-slate-50 border border-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={true}
                    disabled
                    className="mt-0.5 rounded text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <span className="font-bold text-slate-900">
                      Update Current Device Live Readings in Database
                    </span>
                    <p className="text-slate-500 text-[11px] mt-0.5">
                      Sets instantaneous database values of <code className="font-mono text-blue-600">xTilt, yTilt, resultantTilt, xDisplacement, yDisplacement, totalDisplacement</code> to 0.000 and broadcasts the update live over WebSockets.
                    </p>
                  </div>
                </label>

                {/* Option 2: Tare / ClinoX Baseline Reference */}
                <label className="flex items-start gap-3 p-2.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer">
                  <input
                    type="checkbox"
                    checked={setReferenceBaseline}
                    onChange={(e) => setSetReferenceBaseline(e.target.checked)}
                    className="mt-0.5 rounded text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <span className="font-bold text-slate-900">
                      Set ClinoX Zero Reference Baseline (Tare)
                    </span>
                    <p className="text-slate-500 text-[11px] mt-0.5">
                      Stores current angular position as reference zero (<code className="font-mono text-slate-700">θX₀, θY₀</code>) so subsequent telemetry incoming from hardware accelerometer is calculated with zero lateral displacement.
                    </p>
                  </div>
                </label>

                {/* Option 3: Update Stored History */}
                <label className="flex items-start gap-3 p-2.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer">
                  <input
                    type="checkbox"
                    checked={updateHistory}
                    onChange={(e) => setUpdateHistory(e.target.checked)}
                    className="mt-0.5 rounded text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <span className="font-bold text-slate-900">
                      Update All Historical Telemetry Records to Zero
                    </span>
                    <p className="text-slate-500 text-[11px] mt-0.5">
                      Optional: In addition to resetting current state, retroactively updates all stored past records in the telemetry table for this device to 0.000 tilt and 0.000 mm displacement.
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* Main Call to Action Button */}
            <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
              <button
                type="button"
                onClick={() => setConfirmModalOpen(true)}
                disabled={submitting || (!isBulkMode && !selectedDeviceId)}
                className="w-full sm:w-auto flex-1 flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-md hover:shadow-lg transition-all disabled:opacity-50 cursor-pointer"
              >
                <Target className="w-4 h-4" />
                <span>
                  {isBulkMode
                    ? `Set Tilt & Displacement to 0 for ALL (${filteredDevices.length}) Devices`
                    : `Set Tilt & Displacement to 0 for ${selectedDeviceId || 'Device'}`}
                </span>
              </button>

              <button
                type="button"
                onClick={() => loadDeviceList(selectedDeviceId)}
                className="w-full sm:w-auto px-4 py-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Discard / Reload</span>
              </button>
            </div>
          </div>

          {/* Activity / Audit History Log */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-600" />
                Recent Zero Calibration Activity Log
              </h3>
              <span className="text-[11px] text-slate-400">
                {activityLogs.length} events recorded
              </span>
            </div>

            {activityLogs.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                No zero calibration events logged in this session yet.
              </div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {activityLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900">{log.deviceId}</span>
                        <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                          {log.status}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {log.scope}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Zeroed by <strong className="text-slate-700 font-semibold">{log.operator}</strong> on {log.date} at {log.timestamp}
                      </p>
                    </div>

                    {log.previous && (
                      <div className="text-right text-[10px] font-mono text-slate-500 bg-white px-2 py-1 rounded border border-slate-200/80">
                        Prev: θR={log.previous.resultantTilt?.toFixed(3)}° | TotDisp={log.previous.totalDisplacement?.toFixed(3)}mm
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {confirmModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-fade-in">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                <Target className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Confirm Zero Calibration
                </h3>
                <p className="text-xs text-slate-500">
                  Please review the parameters before applying the zero update.
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Target Device(s):</span>
                <span className="font-bold text-slate-900">
                  {isBulkMode ? `ALL (${filteredDevices.length}) Devices` : selectedDeviceId}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Fields to set to 0.000:</span>
                <span className="font-bold text-blue-600 font-mono">
                  xTilt, yTilt, resultantTilt, xDisp, yDisp, totalDisp
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Protected Non-Tilt Data:</span>
                <span className="font-semibold text-emerald-700">
                  Battery, Signal CSQ, Temp, Status (Preserved)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">ClinoX Tare Baseline:</span>
                <span className="font-semibold text-slate-800">
                  {setReferenceBaseline ? 'Yes (Set θX₀, θY₀)' : 'No'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Historical Telemetry Rewrite:</span>
                <span className="font-semibold text-slate-800">
                  {updateHistory ? 'Yes (All records set to 0)' : 'No (Current state + live only)'}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmModalOpen(false)}
                disabled={submitting}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={isBulkMode ? handleExecuteBulkZero : handleExecuteSingleZero}
                disabled={submitting}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition-all disabled:opacity-50 cursor-pointer"
              >
                {submitting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Applying Zero Update...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Confirm & Zero Now</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
