import React, { useState, useEffect, useMemo } from 'react';
import {
  Download, Calendar, Filter, RefreshCw, BarChart2, Activity,
  ShieldCheck, Thermometer, Zap, Clock, FileSpreadsheet, MapPin,
  ChevronLeft, ChevronRight, Layers, CheckCircle2, AlertTriangle, Printer
} from 'lucide-react';
import { getTelemetryHistory, getReportsAnalytics, getProjects, getSites, getDevices } from '../api/apiClient';
import { formatISTDateInput, istDatetimeToUTC, formatFullDateTime, formatTimeString } from '../utils/dateHelper';

export default function ReportsPage({ currentDevice }) {
  const cardCls = 'rounded-2xl border border-slate-200 bg-white p-4.5 text-slate-800 shadow-xs';

  const [projects, setProjects] = useState([]);
  const [sites, setSites] = useState([]);
  const [devices, setDevices] = useState([]);

  // Time presets: '24h', '7d', '30d', '90d', 'custom'
  const [timePreset, setTimePreset] = useState('7d');

  // Date range defaults in IST: 7 days ago to today
  const now = new Date();
  const todayStr = formatISTDateInput(now);
  const lastWeekDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const lastWeekStr = formatISTDateInput(lastWeekDate);

  const [selectedDevice, setSelectedDevice] = useState(currentDevice?.id || '');
  const [selectedSite, setSelectedSite] = useState('ALL');
  const [fromDate, setFromDate] = useState(lastWeekStr);
  const [toDate, setToDate] = useState(todayStr);
  const [paramCategory, setParamCategory] = useState('ALL'); // 'ALL', 'TILT', 'DISPLACEMENT', 'VIBRATION', 'ENVIRONMENT'
  const [reportRows, setReportRows] = useState([]);
  const [summaryStats, setSummaryStats] = useState(null);
  const [loading, setLoading] = useState(false);

  // Table pagination
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 25;

  useEffect(() => {
    getProjects().then(res => setProjects(res.projects || [])).catch(() => {});
    getSites().then(res => setSites(res.sites || [])).catch(() => {});
    getDevices().then(res => {
      if (res?.devices?.length) {
        setDevices(res.devices);
        if (!selectedDevice) setSelectedDevice(res.devices[0].id);
      }
    }).catch(() => {});
  }, []);

  // Handle Preset Switching
  const handlePresetSelect = (preset) => {
    setTimePreset(preset);
    const curr = new Date();
    const to = formatISTDateInput(curr);
    let from = todayStr;

    if (preset === '24h') {
      const d = new Date(curr.getTime() - 24 * 60 * 60 * 1000);
      from = formatISTDateInput(d);
    } else if (preset === '7d') {
      const d = new Date(curr.getTime() - 7 * 24 * 60 * 60 * 1000);
      from = formatISTDateInput(d);
    } else if (preset === '30d') {
      const d = new Date(curr.getTime() - 30 * 24 * 60 * 60 * 1000);
      from = formatISTDateInput(d);
    } else if (preset === '90d') {
      const d = new Date(curr.getTime() - 90 * 24 * 60 * 60 * 1000);
      from = formatISTDateInput(d);
    }

    setFromDate(from);
    setToDate(to);
    if (selectedDevice) {
      fetchReport(selectedDevice, from, to);
    }
  };

  const fetchReport = (devId = selectedDevice, from = fromDate, to = toDate, siteId = selectedSite) => {
    if (!devId && siteId === 'ALL') return;
    setLoading(true);
    setCurrentPage(1);

    const utcFrom = istDatetimeToUTC(from, false);
    const utcTo = istDatetimeToUTC(to, true);

    const filters = {
      deviceId: devId,
      siteId: siteId !== 'ALL' ? siteId : undefined,
      fromDate: utcFrom,
      toDate: utcTo,
    };

    getReportsAnalytics(filters)
      .then(res => {
        if (res?.timeSeriesData?.length) {
          const seen = new Set();
          const uniqueRows = res.timeSeriesData.filter(r => {
            const ts = r.timestamp || r.time;
            if (ts && seen.has(ts)) return false;
            if (ts) seen.add(ts);
            return true;
          });
          setReportRows(uniqueRows);
          setSummaryStats(res.summary || null);
        } else {
          getTelemetryHistory(devId, utcFrom, utcTo)
            .then(tRes => {
              if (tRes?.history?.length) {
                const seen = new Set();
                const uniqueRows = tRes.history.filter(r => {
                  const ts = r.timestamp || r.time;
                  if (ts && seen.has(ts)) return false;
                  if (ts) seen.add(ts);
                  return true;
                });
                setReportRows(uniqueRows);
              } else {
                setReportRows([]);
              }
            })
            .catch(() => setReportRows([]));
        }
      })
      .catch(() => {
        getTelemetryHistory(devId, utcFrom, utcTo)
          .then(tRes => {
            if (tRes?.history?.length) {
              const seen = new Set();
              const uniqueRows = tRes.history.filter(r => {
                const ts = r.timestamp || r.time;
                if (ts && seen.has(ts)) return false;
                if (ts) seen.add(ts);
                return true;
              });
              setReportRows(uniqueRows);
            } else {
              setReportRows([]);
            }
          })
          .catch(() => setReportRows([]));
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    if (selectedDevice) {
      fetchReport(selectedDevice, fromDate, toDate, selectedSite);
    }
  }, [selectedDevice, selectedSite]);

  const handleApplyFilter = (e) => {
    e.preventDefault();
    fetchReport(selectedDevice, fromDate, toDate, selectedSite);
  };

  // Calculated Stats
  const stats = useMemo(() => {
    if (summaryStats && summaryStats.totalDataPoints > 0) {
      return {
        count: summaryStats.totalDataPoints,
        maxTilt: summaryStats.maxResultantTilt || 0,
        maxDisp: summaryStats.maxTotalDisplacement_mm || 0,
        maxVib: summaryStats.maxVibrationPeak_g || 0,
        avgTemp: summaryStats.averageTemperature_C || 0,
      };
    }
    if (!reportRows || reportRows.length === 0) {
      return { count: 0, maxTilt: 0, maxDisp: 0, maxVib: 0, avgTemp: 0 };
    }
    let maxTilt = 0;
    let maxDisp = 0;
    let maxVib = 0;
    let tempSum = 0;

    reportRows.forEach(r => {
      const t = parseFloat(r.resultant || r.resultantTilt || 0);
      const d = parseFloat(r.totalDisp || r.totalDisplacement || 0);
      const v = parseFloat(r.vibPeak || r.vibrationPeak || 0);
      const temp = parseFloat(r.temperature || r.temp || 0);

      if (t > maxTilt) maxTilt = t;
      if (d > maxDisp) maxDisp = d;
      if (v > maxVib) maxVib = v;
      tempSum += temp;
    });

    return {
      count: reportRows.length,
      maxTilt,
      maxDisp,
      maxVib,
      avgTemp: (tempSum / reportRows.length).toFixed(1),
    };
  }, [reportRows, summaryStats]);

  // Paginated Rows
  const totalPages = Math.max(1, Math.ceil(reportRows.length / rowsPerPage));
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return reportRows.slice(start, start + rowsPerPage);
  }, [reportRows, currentPage, rowsPerPage]);

  const handleExportCSV = () => {
    if (reportRows.length === 0) {
      alert('No telemetry records available to export for the selected date range.');
      return;
    }
    const headers = [
      'Timestamp_IST',
      'Timestamp_UTC',
      'Device_ID',
      'Resultant_Tilt_deg',
      'Roll_X_Tilt_deg',
      'Pitch_Y_Tilt_deg',
      'Total_Displacement_mm',
      'X_Displacement_mm',
      'Y_Displacement_mm',
      'Z_Displacement_mm',
      'Acceleration_Mag_g',
      'Vibration_RMS_g',
      'Vibration_Peak_g',
      'Temperature_C',
      'Stability_Status'
    ].join(',');

    const rows = reportRows.map(r => {
      const t = r.resultant || r.resultantTilt || 0;
      const d = r.totalDisp || r.totalDisplacement || 0;
      const status = d >= 15 ? 'CRITICAL RISK' : (d >= 5 ? 'WARNING CREEP' : 'STABLE');

      return [
        `"${formatFullDateTime(r.timestamp || r.time)}"`,
        r.timestamp || '',
        r.deviceId || selectedDevice,
        Number(t).toFixed(4),
        Number(r.xTilt || 0).toFixed(4),
        Number(r.yTilt || 0).toFixed(4),
        Number(d).toFixed(4),
        Number(r.xDisp || r.xDisplacement || 0).toFixed(4),
        Number(r.yDisp || r.yDisplacement || 0).toFixed(4),
        Number(r.zDisp || r.zDisplacement || 0).toFixed(4),
        Number(r.accMag || 0.982).toFixed(3),
        Number(r.vibRMS || r.vibrationRMS || 0.045).toFixed(4),
        Number(r.vibPeak || r.vibrationPeak || 0.104).toFixed(4),
        Number(r.temperature || r.temp || 28.5).toFixed(1),
        status
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers, ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `telemetry_report_${selectedDevice}_${fromDate}_to_${toDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  const activeDeviceObj = devices.find(d => d.id === selectedDevice) || currentDevice;

  return (
    <div className="space-y-4 font-sans text-slate-800 animate-fadeIn">
      {/* Top Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-1 border-b border-slate-200">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-blue-600" />
            <span>Reports & Historical Analytics</span>
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Statistical multi-parameter inclinometer telemetry reports, time-range queries & data exports
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 shadow-2xs transition-all cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5 text-slate-500" />
            <span>Print Report</span>
          </button>
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Main Two-Column Layout (Left: Filters & Summary Table | Right: KPI Metrics & Full Telemetry Table) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* ================= LEFT SIDE: FILTERS & FIXED SUMMARY TABLE ================= */}
        <div className="lg:col-span-4 space-y-4">
          {/* 1. Query & Filter Card */}
          <div className={cardCls}>
            <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-slate-100">
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-blue-600" />
                <span>Report Parameters</span>
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                {timePreset.toUpperCase()}
              </span>
            </div>

            <form onSubmit={handleApplyFilter} className="space-y-3 text-xs">
              {/* Quick Time Presets Buttons */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1.5">
                  Preset Time Range:
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { id: '24h', label: '24 Hours' },
                    { id: '7d', label: '7 Days' },
                    { id: '30d', label: '30 Days' },
                    { id: '90d', label: '90 Days' },
                    { id: 'custom', label: 'Custom' },
                  ].map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handlePresetSelect(p.id)}
                      className={`py-1.5 px-2 rounded-xl text-[11px] font-bold transition-all cursor-pointer text-center ${
                        timePreset === p.id
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Monitored Location */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Location Site:
                </label>
                <select
                  value={selectedSite}
                  onChange={e => setSelectedSite(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-900 font-bold text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs"
                >
                  <option value="ALL">All Sites ({sites.length})</option>
                  {sites.map(s => (
                    <option key={s.id || s.siteId} value={s.id || s.siteId}>{s.name}</option>
                  ))}
                </select>
              </div>

              {/* Target Device */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Sensor Device Node:
                </label>
                <select
                  value={selectedDevice}
                  onChange={e => setSelectedDevice(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-900 font-bold text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs"
                >
                  {devices
                    .filter(d => selectedSite === 'ALL' || d.siteId === selectedSite)
                    .map(d => (
                      <option key={d.id} value={d.id}>{d.name} ({d.id})</option>
                    ))}
                  {devices.length === 0 && <option value="">No Devices Found</option>}
                </select>
              </div>

              {/* Date From & To */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1 flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-slate-400" />
                    <span>From Date</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={fromDate}
                    onChange={e => {
                      setTimePreset('custom');
                      setFromDate(e.target.value);
                    }}
                    className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-900 font-bold text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1 flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-slate-400" />
                    <span>To Date</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={toDate}
                    onChange={e => {
                      setTimePreset('custom');
                      setToDate(e.target.value);
                    }}
                    className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-900 font-bold text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs"
                  />
                </div>
              </div>

              {/* Submit Query Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 flex items-center justify-center gap-2 py-2.5 bg-slate-900 hover:bg-black text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
              >
                {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Filter className="w-3.5 h-3.5" />}
                <span>Run Analytics Query</span>
              </button>
            </form>
          </div>

          {/* 2. Fixed Left-Side Summary Table Format */}
          <div className={cardCls}>
            <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-100">
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                <BarChart2 className="w-3.5 h-3.5 text-blue-600" />
                <span>Executive Summary</span>
              </span>
              <span className="text-[10px] text-slate-500 font-mono">
                {selectedDevice || 'N/A'}
              </span>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold text-[10px] uppercase tracking-wider">
                    <th className="py-2 px-3 text-left">Report Metric</th>
                    <th className="py-2 px-3 text-right">Statistical Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-800 text-[11px]">
                  <tr>
                    <td className="py-2 px-3 font-semibold text-slate-600">Target Node</td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-blue-600">{selectedDevice || '--'}</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-semibold text-slate-600">Site Location</td>
                    <td className="py-2 px-3 text-right font-semibold text-slate-900">{activeDeviceObj?.site?.name || selectedSite}</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-semibold text-slate-600">Total Data Points</td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">{stats.count}</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-semibold text-slate-600">Max Resultant Tilt (θ)</td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-purple-700">{Number(stats.maxTilt).toFixed(4)}°</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-semibold text-slate-600">Max Total Disp (Δ)</td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-pink-700">{Number(stats.maxDisp).toFixed(4)} mm</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-semibold text-slate-600">Peak Vibration Shock</td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-amber-700">{Number(stats.maxVib).toFixed(4)} g</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-semibold text-slate-600">Avg Temperature</td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-emerald-700">{stats.avgTemp} °C</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-semibold text-slate-600">Structural Stability</td>
                    <td className="py-2 px-3 text-right">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                        stats.maxDisp >= 15
                          ? 'bg-rose-100 text-rose-800'
                          : (stats.maxDisp >= 5 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800')
                      }`}>
                        {stats.maxDisp >= 15 ? 'CRITICAL RISK' : (stats.maxDisp >= 5 ? 'WARNING CREEP' : 'NORMAL / STABLE')}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-semibold text-slate-600">Report Date Range</td>
                    <td className="py-2 px-3 text-right text-[10px] font-medium text-slate-500">{fromDate} &rarr; {toDate}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ================= RIGHT SIDE: KPI METRICS & FULL TELEMETRY DATA TABLE ================= */}
        <div className="lg:col-span-8 space-y-4">
          {/* Summary KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="p-3 rounded-2xl border border-slate-200 bg-white shadow-2xs">
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Total Readings</div>
              <div className="text-base font-bold text-slate-900 font-mono mt-0.5">{stats.count}</div>
              <div className="text-[10px] text-blue-600 font-medium mt-0.5">Time Query Buffer</div>
            </div>

            <div className="p-3 rounded-2xl border border-slate-200 bg-white shadow-2xs">
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Peak Incline θ</div>
              <div className="text-base font-bold text-purple-700 font-mono mt-0.5">{Number(stats.maxTilt).toFixed(3)}°</div>
              <div className="text-[10px] text-slate-400 font-medium mt-0.5">Max Tilt Angle</div>
            </div>

            <div className="p-3 rounded-2xl border border-slate-200 bg-white shadow-2xs">
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Max Displacement</div>
              <div className="text-base font-bold text-pink-700 font-mono mt-0.5">{Number(stats.maxDisp).toFixed(2)} mm</div>
              <div className="text-[10px] text-slate-400 font-medium mt-0.5">Vector Total</div>
            </div>

            <div className="p-3 rounded-2xl border border-slate-200 bg-white shadow-2xs">
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Peak Vibration</div>
              <div className="text-base font-bold text-amber-700 font-mono mt-0.5">{Number(stats.maxVib).toFixed(3)} g</div>
              <div className="text-[10px] text-slate-400 font-medium mt-0.5">Dynamic Shock</div>
            </div>
          </div>

          {/* Telemetry Data Table Card */}
          <div className={cardCls}>
            {/* Header & Category Filter Tabs */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 mb-3">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-extrabold text-slate-900 mr-1">Parameter:</span>
                {[
                  { id: 'ALL', label: 'All Columns' },
                  { id: 'TILT', label: 'Tilt (°)' },
                  { id: 'DISPLACEMENT', label: 'Displacement (mm)' },
                  { id: 'VIBRATION', label: 'Vibration (g)' },
                  { id: 'ENVIRONMENT', label: 'Thermal / Health' },
                ].map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setParamCategory(tab.id)}
                    className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition-colors cursor-pointer ${
                      paramCategory === tab.id
                        ? 'bg-blue-600 text-white shadow-2xs'
                        : 'border border-slate-200 text-slate-600 hover:bg-slate-100 bg-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Status and loading indicator */}
              <div className="flex items-center gap-2">
                {loading ? (
                  <span className="flex items-center gap-1.5 text-xs text-blue-600 font-bold">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Loading...</span>
                  </span>
                ) : (
                  <span className="text-[11px] font-mono text-slate-500">
                    Showing {paginatedRows.length} of {reportRows.length} records
                  </span>
                )}
              </div>
            </div>

            {/* Fixed-Format Telemetry Data Table */}
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-xs table-auto border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-extrabold uppercase text-[10px] tracking-wider">
                    {/* Left-Aligned Text Columns */}
                    <th className="py-2.5 px-3 text-left whitespace-nowrap">Timestamp (IST)</th>
                    <th className="py-2.5 px-3 text-left whitespace-nowrap font-mono">Node ID</th>

                    {/* Right-Aligned Data Columns (Tilt) */}
                    {(paramCategory === 'ALL' || paramCategory === 'TILT') && (
                      <>
                        <th className="py-2.5 px-3 text-right whitespace-nowrap text-purple-700">Resultant θ (°)</th>
                        <th className="py-2.5 px-3 text-right whitespace-nowrap text-purple-600">Roll X (°)</th>
                        <th className="py-2.5 px-3 text-right whitespace-nowrap text-purple-600">Pitch Y (°)</th>
                      </>
                    )}

                    {/* Right-Aligned Data Columns (Displacement) */}
                    {(paramCategory === 'ALL' || paramCategory === 'DISPLACEMENT') && (
                      <>
                        <th className="py-2.5 px-3 text-right whitespace-nowrap text-pink-700">Total Δ (mm)</th>
                        <th className="py-2.5 px-3 text-right whitespace-nowrap text-pink-600">ΔX (mm)</th>
                        <th className="py-2.5 px-3 text-right whitespace-nowrap text-pink-600">ΔY (mm)</th>
                        <th className="py-2.5 px-3 text-right whitespace-nowrap text-pink-600">ΔZ (mm)</th>
                      </>
                    )}

                    {/* Right-Aligned Data Columns (Vibration) */}
                    {(paramCategory === 'ALL' || paramCategory === 'VIBRATION') && (
                      <>
                        <th className="py-2.5 px-3 text-right whitespace-nowrap text-amber-700">Accel Mag (g)</th>
                        <th className="py-2.5 px-3 text-right whitespace-nowrap text-amber-600">Vib RMS (g)</th>
                        <th className="py-2.5 px-3 text-right whitespace-nowrap text-amber-600">Vib Peak (g)</th>
                      </>
                    )}

                    {/* Right-Aligned Data Columns (Environment) */}
                    {(paramCategory === 'ALL' || paramCategory === 'ENVIRONMENT') && (
                      <>
                        <th className="py-2.5 px-3 text-right whitespace-nowrap text-emerald-700">Temp (°C)</th>
                        <th className="py-2.5 px-3 text-center whitespace-nowrap text-slate-700">Stability</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700 font-medium font-mono text-[11px]">
                  {paginatedRows.length === 0 ? (
                    <tr>
                      <td colSpan={14} className="py-12 text-center text-slate-400 font-sans text-xs">
                        {loading ? 'Querying records from PostgreSQL time-series store...' : 'No telemetry data points found for this range. Try adjusting the query range.'}
                      </td>
                    </tr>
                  ) : (
                    paginatedRows.map((r, i) => {
                      const t = parseFloat(r.resultant || r.resultantTilt || 0);
                      const d = parseFloat(r.totalDisp || r.totalDisplacement || 0);
                      const status = d >= 15 ? 'CRITICAL' : (d >= 5 ? 'WARNING' : 'NORMAL');
                      const statusBadge = d >= 15
                        ? 'bg-rose-100 text-rose-800'
                        : (d >= 5 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800');

                      return (
                        <tr key={i} className="hover:bg-slate-50 transition-colors">
                          {/* Left-aligned Text Columns */}
                          <td className="py-2 px-3 text-left whitespace-nowrap text-slate-900 font-sans font-medium">
                            {formatFullDateTime(r.timestamp || r.time)}
                          </td>
                          <td className="py-2 px-3 text-left whitespace-nowrap text-slate-800 font-bold">
                            {r.deviceId || selectedDevice}
                          </td>

                          {/* Right-aligned Numerical Tilt Columns */}
                          {(paramCategory === 'ALL' || paramCategory === 'TILT') && (
                            <>
                              <td className="py-2 px-3 text-right whitespace-nowrap font-bold text-purple-700">{t.toFixed(4)}</td>
                              <td className="py-2 px-3 text-right whitespace-nowrap text-purple-600">{(r.xTilt || 0).toFixed(4)}</td>
                              <td className="py-2 px-3 text-right whitespace-nowrap text-purple-600">{(r.yTilt || 0).toFixed(4)}</td>
                            </>
                          )}

                          {/* Right-aligned Numerical Displacement Columns */}
                          {(paramCategory === 'ALL' || paramCategory === 'DISPLACEMENT') && (
                            <>
                              <td className="py-2 px-3 text-right whitespace-nowrap font-bold text-pink-700">{d.toFixed(4)}</td>
                              <td className="py-2 px-3 text-right whitespace-nowrap text-pink-600">{(r.xDisp || r.xDisplacement || 0).toFixed(4)}</td>
                              <td className="py-2 px-3 text-right whitespace-nowrap text-pink-600">{(r.yDisp || r.yDisplacement || 0).toFixed(4)}</td>
                              <td className="py-2 px-3 text-right whitespace-nowrap text-pink-600">{(r.zDisp || r.zDisplacement || 0).toFixed(4)}</td>
                            </>
                          )}

                          {/* Right-aligned Numerical Vibration Columns */}
                          {(paramCategory === 'ALL' || paramCategory === 'VIBRATION') && (
                            <>
                              <td className="py-2 px-3 text-right whitespace-nowrap text-amber-700">{(r.accMag || 0.982).toFixed(3)}</td>
                              <td className="py-2 px-3 text-right whitespace-nowrap text-amber-600">{(r.vibRMS || r.vibrationRMS || 0.045).toFixed(4)}</td>
                              <td className="py-2 px-3 text-right whitespace-nowrap text-amber-600">{(r.vibPeak || r.vibrationPeak || 0.104).toFixed(4)}</td>
                            </>
                          )}

                          {/* Right-aligned Numerical Environment Columns */}
                          {(paramCategory === 'ALL' || paramCategory === 'ENVIRONMENT') && (
                            <>
                              <td className="py-2 px-3 text-right whitespace-nowrap text-emerald-700 font-bold">{Number(r.temperature || r.temp || 28.5).toFixed(1)}</td>
                              <td className="py-2 px-3 text-center whitespace-nowrap font-sans">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${statusBadge}`}>
                                  {status}
                                </span>
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls Footer */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-3 mt-2 border-t border-slate-100 text-xs">
                <span className="text-slate-500 font-medium text-[11px]">
                  Page {currentPage} of {totalPages}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4 text-slate-600" />
                  </button>
                  <span className="px-2 py-1 font-mono font-bold text-slate-800 text-xs">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4 text-slate-600" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
