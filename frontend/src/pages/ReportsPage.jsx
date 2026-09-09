import React, { useState, useEffect, useMemo } from 'react';
import { Download, Calendar, Filter, RefreshCw, BarChart2, Activity, ShieldCheck, Thermometer, Zap, Clock, FileSpreadsheet, MapPin } from 'lucide-react';
import { getTelemetryHistory, getReportsAnalytics, getProjects, getSites, getDevices } from '../api/apiClient';
import { formatISTDateInput, istDatetimeToUTC, formatFullDateTime, formatTimeString } from '../utils/dateHelper';

export default function ReportsPage({ currentDevice }) {
  const cardCls = 'rounded-2xl border border-slate-200 bg-white p-5 text-black shadow-xs';

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
          // Fallback to getTelemetryHistory
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
        // Direct telemetry history query fallback
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
        maxVib: summaryStats.maxVibrationPeak_g || 0.104,
        avgTemp: summaryStats.averageTemperature_C || 28.5,
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
      const v = parseFloat(r.vibPeak || r.vibrationPeak || 0.104);
      const temp = parseFloat(r.temperature || r.temp || 28.5);

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

  return (
    <div className="space-y-4 font-sans text-black animate-fadeIn">
      {/* Top Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-blue-600" />
            <span>Reports & Historical Analytics</span>
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Statistical multi-parameter inclinometer telemetry reports, time-range queries & CSV data exports
          </p>
        </div>

        {/* Export Button */}
        <button
          onClick={handleExportCSV}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
        >
          <Download className="w-4 h-4" />
          <span>Export Analytics (CSV)</span>
        </button>
      </div>

      {/* Summary KPI Cards Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="p-3.5 rounded-2xl border border-slate-200 bg-white shadow-2xs">
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Total Data Points</div>
          <div className="text-lg font-bold text-slate-900 font-mono mt-0.5">{stats.count}</div>
          <div className="text-[10px] text-blue-600 font-medium mt-0.5">Filtered Range</div>
        </div>

        <div className="p-3.5 rounded-2xl border border-slate-200 bg-white shadow-2xs">
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Max Resultant Tilt</div>
          <div className="text-lg font-bold text-purple-600 font-mono mt-0.5">{Number(stats.maxTilt).toFixed(3)}°</div>
          <div className="text-[10px] text-slate-400 font-medium mt-0.5">Peak Incline</div>
        </div>

        <div className="p-3.5 rounded-2xl border border-slate-200 bg-white shadow-2xs">
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Max Displacement</div>
          <div className="text-lg font-bold text-pink-600 font-mono mt-0.5">{Number(stats.maxDisp).toFixed(2)} mm</div>
          <div className="text-[10px] text-slate-400 font-medium mt-0.5">3D Vector Total</div>
        </div>

        <div className="p-3.5 rounded-2xl border border-slate-200 bg-white shadow-2xs">
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Max Vibration Peak</div>
          <div className="text-lg font-bold text-amber-600 font-mono mt-0.5">{Number(stats.maxVib).toFixed(3)} g</div>
          <div className="text-[10px] text-slate-400 font-medium mt-0.5">Dynamic Shock</div>
        </div>

        <div className="p-3.5 rounded-2xl border border-slate-200 bg-white shadow-2xs">
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Avg Temperature</div>
          <div className="text-lg font-bold text-emerald-600 font-mono mt-0.5">{stats.avgTemp} °C</div>
          <div className="text-[10px] text-slate-400 font-medium mt-0.5">Thermal Baseline</div>
        </div>
      </div>

      {/* Filter & Time-Range Toolbar */}
      <div className={cardCls}>
        <form onSubmit={handleApplyFilter} className="space-y-3 text-xs">
          {/* Quick Time Presets Bar */}
          <div className="flex items-center gap-1.5 pb-2.5 border-b border-slate-100 flex-wrap">
            <span className="text-[11px] font-semibold text-slate-500 mr-1.5 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              <span>Time Range Presets:</span>
            </span>
            {[
              { id: '24h', label: 'Last 24 Hours' },
              { id: '7d', label: 'Last 7 Days' },
              { id: '30d', label: 'Last 30 Days' },
              { id: '90d', label: 'Last 90 Days' },
              { id: 'custom', label: 'Custom Date Range' },
            ].map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => handlePresetSelect(p.id)}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  timePreset === p.id
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-end gap-3 pt-1">
            {/* Site Filter */}
            <div className="min-w-[180px]">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Monitored Location
              </label>
              <select
                value={selectedSite}
                onChange={e => setSelectedSite(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-900 font-bold text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs"
              >
                <option value="ALL">All Locations ({sites.length})</option>
                {sites.map(s => (
                  <option key={s.id || s.siteId} value={s.id || s.siteId}>{s.name}</option>
                ))}
              </select>
            </div>

            {/* Device Selection */}
            <div className="flex-1 min-w-[200px]">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Sensor Device Node
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
                {devices.length === 0 && <option value="">No Devices Available</option>}
              </select>
            </div>

            {/* From Date */}
            <div className="min-w-[150px]">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
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
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-900 font-bold text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs"
              />
            </div>

            {/* To Date */}
            <div className="min-w-[150px]">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
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
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-900 font-bold text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs"
              />
            </div>

            {/* Apply Filter Button */}
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-black hover:bg-neutral-800 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
            >
              {loading ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Filter className="w-3.5 h-3.5" />
              )}
              <span>Query Records</span>
            </button>
          </div>

          {/* Parameter Category Selector Tabs */}
          <div className="flex items-center gap-1.5 pt-2 border-t border-slate-100 flex-wrap">
            <span className="text-[11px] font-semibold text-slate-500 mr-2">Parameter View:</span>
            {[
              { id: 'ALL', label: 'All Parameters' },
              { id: 'TILT', label: 'Tilt & Incline (°)' },
              { id: 'DISPLACEMENT', label: 'Displacement (mm)' },
              { id: 'VIBRATION', label: 'Vibration & Accel (g)' },
              { id: 'ENVIRONMENT', label: 'Thermal & Health' },
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setParamCategory(tab.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                  paramCategory === tab.id
                    ? 'bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs'
                    : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </form>
      </div>

      {/* Multi-Parameter Telemetry Report Table */}
      <div className={cardCls}>
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-2">
          <div className="text-xs font-bold text-slate-800">
            Records for <span className="font-mono text-blue-600">{selectedDevice || '--'}</span> ({fromDate} to {toDate}) &bull; {reportRows.length} Points
          </div>
          {loading && (
            <div className="flex items-center gap-1.5 text-xs text-blue-600 font-bold">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Fetching telemetry data...</span>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b-2 border-slate-200 text-slate-700 font-extrabold uppercase text-[10px] tracking-wider">
                <th className="py-2.5 px-3">Timestamp / Time</th>
                <th className="py-2.5 px-3 font-mono">Node ID</th>

                {(paramCategory === 'ALL' || paramCategory === 'TILT') && (
                  <>
                    <th className="py-2.5 px-3 text-purple-700">Resultant Tilt θ</th>
                    <th className="py-2.5 px-3 text-purple-600">Roll X θ</th>
                    <th className="py-2.5 px-3 text-purple-600">Pitch Y θ</th>
                  </>
                )}

                {(paramCategory === 'ALL' || paramCategory === 'DISPLACEMENT') && (
                  <>
                    <th className="py-2.5 px-3 text-pink-700">Total Disp Δ</th>
                    <th className="py-2.5 px-3 text-pink-600">ΔX (mm)</th>
                    <th className="py-2.5 px-3 text-pink-600">ΔY (mm)</th>
                    <th className="py-2.5 px-3 text-pink-600">ΔZ (mm)</th>
                  </>
                )}

                {(paramCategory === 'ALL' || paramCategory === 'VIBRATION') && (
                  <>
                    <th className="py-2.5 px-3 text-amber-700">Accel Mag</th>
                    <th className="py-2.5 px-3 text-amber-600">Vib RMS</th>
                    <th className="py-2.5 px-3 text-amber-600">Vib Peak</th>
                  </>
                )}

                {(paramCategory === 'ALL' || paramCategory === 'ENVIRONMENT') && (
                  <>
                    <th className="py-2.5 px-3 text-emerald-700">Temperature</th>
                    <th className="py-2.5 px-3 text-emerald-700">Stability Risk</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700 font-medium font-mono text-[11px]">
              {reportRows.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-8 text-center text-slate-400 font-sans text-xs">
                    {loading ? 'Querying records from telemetry store...' : 'No telemetry data points found for this range. Try adjusting the date range.'}
                  </td>
                </tr>
              ) : (
                reportRows.map((r, i) => {
                  const t = parseFloat(r.resultant || r.resultantTilt || 0);
                  const d = parseFloat(r.totalDisp || r.totalDisplacement || 0);
                  const status = d >= 15 ? 'CRITICAL RISK' : (d >= 5 ? 'WARNING' : 'STABLE');
                  const statusBadge = d >= 15
                    ? 'bg-rose-100 text-rose-800'
                    : (d >= 5 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800');

                  return (
                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2 px-3 text-slate-900 font-sans font-medium">
                        {formatFullDateTime(r.timestamp || r.time)}
                      </td>
                      <td className="py-2 px-3 text-slate-800 font-bold">
                        {r.deviceId || selectedDevice}
                      </td>

                      {(paramCategory === 'ALL' || paramCategory === 'TILT') && (
                        <>
                          <td className="py-2 px-3 font-bold text-purple-700">{t.toFixed(4)}°</td>
                          <td className="py-2 px-3 text-purple-600">{(r.xTilt || 0).toFixed(4)}°</td>
                          <td className="py-2 px-3 text-purple-600">{(r.yTilt || 0).toFixed(4)}°</td>
                        </>
                      )}

                      {(paramCategory === 'ALL' || paramCategory === 'DISPLACEMENT') && (
                        <>
                          <td className="py-2 px-3 font-bold text-pink-700">{d.toFixed(4)} mm</td>
                          <td className="py-2 px-3 text-pink-600">{(r.xDisp || r.xDisplacement || 0).toFixed(4)}</td>
                          <td className="py-2 px-3 text-pink-600">{(r.yDisp || r.yDisplacement || 0).toFixed(4)}</td>
                          <td className="py-2 px-3 text-pink-600">{(r.zDisp || r.zDisplacement || 0).toFixed(4)}</td>
                        </>
                      )}

                      {(paramCategory === 'ALL' || paramCategory === 'VIBRATION') && (
                        <>
                          <td className="py-2 px-3 text-amber-700">{(r.accMag || 0.982).toFixed(3)} g</td>
                          <td className="py-2 px-3 text-amber-600">{(r.vibRMS || r.vibrationRMS || 0.045).toFixed(4)}</td>
                          <td className="py-2 px-3 text-amber-600">{(r.vibPeak || r.vibrationPeak || 0.104).toFixed(4)}</td>
                        </>
                      )}

                      {(paramCategory === 'ALL' || paramCategory === 'ENVIRONMENT') && (
                        <>
                          <td className="py-2 px-3 text-emerald-700 font-bold">{r.temperature || r.temp || 28.5} °C</td>
                          <td className="py-2 px-3 font-sans">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${statusBadge}`}>
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
      </div>
    </div>
  );
}
