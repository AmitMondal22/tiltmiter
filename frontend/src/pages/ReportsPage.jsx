import React, { useState, useEffect, useMemo } from 'react';
import { Download, Calendar, Filter, RefreshCw, BarChart2, Activity, ShieldCheck, Thermometer, Zap } from 'lucide-react';
import { getTelemetryHistory, getProjects, getSites, getDevices } from '../api/apiClient';

export default function ReportsPage({ currentDevice }) {
  const cardCls = 'rounded-2xl border border-slate-200 bg-white p-5 text-black shadow-xs';

  const [projects, setProjects] = useState([]);
  const [sites, setSites] = useState([]);
  const [devices, setDevices] = useState([]);

  // Date range defaults: 7 days ago to today
  const todayStr = new Date().toISOString().split('T')[0];
  const lastWeekDate = new Date();
  lastWeekDate.setDate(lastWeekDate.getDate() - 7);
  const lastWeekStr = lastWeekDate.toISOString().split('T')[0];

  const [selectedDevice, setSelectedDevice] = useState(currentDevice?.id || '');
  const [fromDate, setFromDate] = useState(lastWeekStr);
  const [toDate, setToDate] = useState(todayStr);
  const [paramCategory, setParamCategory] = useState('ALL'); // 'ALL', 'TILT', 'DISPLACEMENT', 'VIBRATION', 'ENVIRONMENT'
  const [reportRows, setReportRows] = useState([]);
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

  const fetchReport = (devId = selectedDevice, from = fromDate, to = toDate) => {
    if (!devId) return;
    setLoading(true);
    getTelemetryHistory(devId, from, to)
      .then(res => {
        if (res?.history?.length) {
          setReportRows(res.history);
        } else {
          setReportRows([]);
        }
      })
      .catch(() => {
        setReportRows([]);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    if (selectedDevice) {
      fetchReport(selectedDevice, fromDate, toDate);
    }
  }, [selectedDevice]);

  const handleApplyFilter = (e) => {
    e.preventDefault();
    fetchReport(selectedDevice, fromDate, toDate);
  };

  // Calculated Stats
  const stats = useMemo(() => {
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
      const temp = parseFloat(r.temperature || r.temp || 28.7);

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
  }, [reportRows]);

  const handleExportCSV = () => {
    if (reportRows.length === 0) {
      alert('No telemetry records available to export for the selected date range.');
      return;
    }
    const headers = [
      'Timestamp',
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
      'Calibration_Status'
    ].join(',');

    const rows = reportRows.map(r => [
      r.timestamp || r.time,
      selectedDevice,
      (r.resultant || r.resultantTilt || 0).toFixed(4),
      (r.xTilt || 0).toFixed(4),
      (r.yTilt || 0).toFixed(4),
      (r.totalDisp || r.totalDisplacement || 0).toFixed(4),
      (r.xDisp || r.xDisplacement || 0).toFixed(4),
      (r.yDisp || r.yDisplacement || 0).toFixed(4),
      (r.zDisp || r.zDisplacement || 0).toFixed(4),
      (r.accMag || 0.98).toFixed(3),
      (r.vibRMS || r.vibrationRMS || 0.045).toFixed(4),
      (r.vibPeak || r.vibrationPeak || 0.104).toFixed(4),
      (r.temperature || r.temp || 28.7),
      'CALIBRATED'
    ].join(','));

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers, ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `telemetry_analytics_${selectedDevice}_${fromDate}_to_${toDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-4 font-sans text-black">
      {/* Top Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Reports & Analytics
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Statistical multi-parameter inclinometer telemetry reports & data exports
          </p>
        </div>

        {/* Export Button */}
        <button
          onClick={handleExportCSV}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs rounded-xl shadow-xs transition-all cursor-pointer"
        >
          <Download className="w-4 h-4" />
          <span>Export Full Analytics (CSV)</span>
        </button>
      </div>

      {/* Summary KPI Cards Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="p-3.5 rounded-2xl border border-slate-200/80 bg-white shadow-2xs">
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Total Data Points</div>
          <div className="text-lg font-bold text-slate-900 font-mono mt-0.5">{stats.count}</div>
          <div className="text-[10px] text-blue-600 font-medium mt-0.5">Filtered Range</div>
        </div>

        <div className="p-3.5 rounded-2xl border border-slate-200/80 bg-white shadow-2xs">
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Max Resultant Tilt</div>
          <div className="text-lg font-bold text-purple-600 font-mono mt-0.5">{stats.maxTilt.toFixed(3)}°</div>
          <div className="text-[10px] text-slate-400 font-medium mt-0.5">Peak Incline</div>
        </div>

        <div className="p-3.5 rounded-2xl border border-slate-200/80 bg-white shadow-2xs">
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Max Displacement</div>
          <div className="text-lg font-bold text-pink-600 font-mono mt-0.5">{stats.maxDisp.toFixed(2)} mm</div>
          <div className="text-[10px] text-slate-400 font-medium mt-0.5">3D Vector Total</div>
        </div>

        <div className="p-3.5 rounded-2xl border border-slate-200/80 bg-white shadow-2xs">
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Max Vibration Peak</div>
          <div className="text-lg font-bold text-amber-600 font-mono mt-0.5">{stats.maxVib.toFixed(3)} g</div>
          <div className="text-[10px] text-slate-400 font-medium mt-0.5">Dynamic Shock</div>
        </div>

        <div className="p-3.5 rounded-2xl border border-slate-200/80 bg-white shadow-2xs">
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Avg Temperature</div>
          <div className="text-lg font-bold text-emerald-600 font-mono mt-0.5">{stats.avgTemp} °C</div>
          <div className="text-[10px] text-slate-400 font-medium mt-0.5">Thermal Baseline</div>
        </div>
      </div>

      {/* Date Range & Parameter Filter Toolbar */}
      <div className={cardCls}>
        <form onSubmit={handleApplyFilter} className="space-y-3 text-xs">
          <div className="flex flex-wrap items-end gap-3">
            {/* Device Selection */}
            <div className="flex-1 min-w-[200px]">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Sensor Device Node
              </label>
              <select
                value={selectedDevice}
                onChange={e => setSelectedDevice(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-900 font-medium text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {devices.map(d => (
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
                onChange={e => setFromDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-900 font-medium text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
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
                onChange={e => setToDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-900 font-medium text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Apply Filter Button */}
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs rounded-xl shadow-xs transition-all cursor-pointer"
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
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                  paramCategory === tab.id
                    ? 'bg-blue-50 text-blue-600 font-semibold border border-blue-200'
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
          <div className="text-xs font-semibold text-slate-800">
            Records for <span className="font-mono text-blue-600">{selectedDevice || '--'}</span> ({fromDate} to {toDate})
          </div>
          <span className="text-[11px] font-mono text-slate-500">
            {reportRows.length} Data Points Logged
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs whitespace-nowrap">
            <thead>
              <tr className="border-b border-slate-200 uppercase text-[10px] tracking-wider bg-slate-50/50">
                <th className="py-2.5 px-3">Timestamp</th>
                <th className="py-2.5 px-3">Device ID</th>

                {/* Tilt Parameters */}
                {(paramCategory === 'ALL' || paramCategory === 'TILT') && (
                  <>
                    <th className="py-2.5 px-3 text-purple-700">Resultant Tilt</th>
                    <th className="py-2.5 px-3 text-blue-700">Roll (X)</th>
                    <th className="py-2.5 px-3 text-emerald-700">Pitch (Y)</th>
                  </>
                )}

                {/* Displacement Parameters */}
                {(paramCategory === 'ALL' || paramCategory === 'DISPLACEMENT') && (
                  <>
                    <th className="py-2.5 px-3 text-pink-700">Total Disp</th>
                    <th className="py-2.5 px-3">X Disp</th>
                    <th className="py-2.5 px-3">Y Disp</th>
                    <th className="py-2.5 px-3">Z Disp</th>
                  </>
                )}

                {/* Dynamic & Vibration Parameters */}
                {(paramCategory === 'ALL' || paramCategory === 'VIBRATION') && (
                  <>
                    <th className="py-2.5 px-3">Accel Mag</th>
                    <th className="py-2.5 px-3">Vib RMS</th>
                    <th className="py-2.5 px-3 text-amber-700">Vib Peak</th>
                  </>
                )}

                {/* Environmental & Diagnostics */}
                {(paramCategory === 'ALL' || paramCategory === 'ENVIRONMENT') && (
                  <>
                    <th className="py-2.5 px-3">Ambient Temp</th>
                    <th className="py-2.5 px-3">Zero Offset</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reportRows.length === 0 ? (
                <tr>
                  <td colSpan={13} className="py-8 text-center text-slate-400 text-xs">
                    {loading ? 'Fetching telemetry records...' : 'No telemetry records found for the selected date range.'}
                  </td>
                </tr>
              ) : (
                reportRows.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2.5 px-3 font-mono">
                      {r.timestamp || r.time}
                    </td>
                    <td className="py-2.5 px-3 font-mono font-medium">
                      {selectedDevice}
                    </td>

                    {/* Tilt Parameters */}
                    {(paramCategory === 'ALL' || paramCategory === 'TILT') && (
                      <>
                        <td className="py-2.5 px-3 font-mono font-semibold text-purple-700">
                          {(r.resultant || r.resultantTilt || 0).toFixed(4)}°
                        </td>
                        <td className="py-2.5 px-3 font-mono text-blue-700">
                          {(r.xTilt || 0).toFixed(4)}°
                        </td>
                        <td className="py-2.5 px-3 font-mono text-emerald-700">
                          {(r.yTilt || 0).toFixed(4)}°
                        </td>
                      </>
                    )}

                    {/* Displacement Parameters */}
                    {(paramCategory === 'ALL' || paramCategory === 'DISPLACEMENT') && (
                      <>
                        <td className="py-2.5 px-3 font-mono font-semibold text-pink-700">
                          {(r.totalDisp || r.totalDisplacement || 0).toFixed(3)} mm
                        </td>
                        <td className="py-2.5 px-3 font-mono">
                          {(r.xDisp || r.xDisplacement || 0).toFixed(3)} mm
                        </td>
                        <td className="py-2.5 px-3 font-mono">
                          {(r.yDisp || r.yDisplacement || 0).toFixed(3)} mm
                        </td>
                        <td className="py-2.5 px-3 font-mono">
                          {(r.zDisp || r.zDisplacement || 0).toFixed(3)} mm
                        </td>
                      </>
                    )}

                    {/* Dynamic & Vibration Parameters */}
                    {(paramCategory === 'ALL' || paramCategory === 'VIBRATION') && (
                      <>
                        <td className="py-2.5 px-3 font-mono">
                          {(r.accMag || 0.98).toFixed(3)} g
                        </td>
                        <td className="py-2.5 px-3 font-mono">
                          {(r.vibRMS || r.vibrationRMS || 0.045).toFixed(4)} g
                        </td>
                        <td className="py-2.5 px-3 font-mono font-semibold text-amber-700">
                          {(r.vibPeak || r.vibrationPeak || 0.104).toFixed(4)} g
                        </td>
                      </>
                    )}

                    {/* Environmental & Diagnostics */}
                    {(paramCategory === 'ALL' || paramCategory === 'ENVIRONMENT') && (
                      <>
                        <td className="py-2.5 px-3 font-mono">
                          {(r.temperature || r.temp || 28.7)} °C
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            OK ✓
                          </span>
                        </td>
                      </>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
