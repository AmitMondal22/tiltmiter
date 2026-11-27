import React, { useState, useEffect, useMemo } from 'react';
import {
  Download, Calendar, Filter, RefreshCw, BarChart2, Activity,
  ShieldCheck, Thermometer, Zap, Clock, FileSpreadsheet, MapPin,
  ChevronLeft, ChevronRight, Layers, CheckCircle2, AlertTriangle, Printer,
  TicketCheck, Wrench, RotateCcw, Image as ImageIcon, Cpu, User
} from 'lucide-react';
import { getTelemetryHistory, getReportsAnalytics, getProjects, getSites, getDevices, getTicketsReport, getStructures } from '../api/apiClient';
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

  // --- Incident & Tickets Report States ---
  const [reportCategory, setReportCategory] = useState('TELEMETRY'); // 'TELEMETRY' | 'TICKETS'
  const [structures, setStructures] = useState([]);
  const [ticketPreset, setTicketPreset] = useState('7d');
  const [ticketFromDate, setTicketFromDate] = useState(lastWeekStr);
  const [ticketToDate, setTicketToDate] = useState(todayStr);
  const [ticketSite, setTicketSite] = useState('ALL');
  const [ticketDevice, setTicketDevice] = useState('ALL');
  const [ticketStatus, setTicketStatus] = useState('ALL');
  const [ticketSeverity, setTicketSeverity] = useState('ALL');
  const [ticketSource, setTicketSource] = useState('ALL');
  const [ticketRows, setTicketRows] = useState([]);
  const [ticketSummary, setTicketSummary] = useState(null);
  const [ticketLoading, setTicketLoading] = useState(false);
  const [ticketCurrentPage, setTicketCurrentPage] = useState(1);
  const ticketRowsPerPage = 20;

  // Table pagination
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 25;

  useEffect(() => {
    getProjects().then(res => setProjects(res.projects || [])).catch(() => {});
    getStructures().then(res => setStructures(res.structures || res || [])).catch(() => {});
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

    const activeDev = devices.find(d => d.id?.toLowerCase() === devId?.toLowerCase()) || currentDevice;
    const isZeroCalibrated = Boolean(
      (activeDev && (
        (activeDev.xTilt === 0 || activeDev.xTilt === 0.0 || activeDev.xTilt === null || activeDev.xTilt === undefined) &&
        (activeDev.yTilt === 0 || activeDev.yTilt === 0.0 || activeDev.yTilt === null || activeDev.yTilt === undefined)
      )) ||
      (activeDev?.resultantTilt === 0 || activeDev?.resultantTilt === 0.0) ||
      activeDev?.hasReferenceZero ||
      activeDev?.calibrate
    );

    const parseNum = (v) => {
      if (v === null || v === undefined || v === '' || v === '--') return null;
      const n = typeof v === 'number' ? v : parseFloat(v);
      return !isNaN(n) ? n : null;
    };

    const mapReportRow = (r) => {
      let raw = r.rawPayload || r.raw_payload || {};
      if (typeof raw === 'string') {
        try { raw = JSON.parse(raw); } catch { raw = {}; }
      }
      const rockfall = raw.rockfallAlarm || r.rockfallAlarm || {};
      const motion = raw.motionEvent || r.motionEvent || {};
      const angleDelta = raw.angleDelta || {};
      const disp = raw.displacement || {};

      const xTilt = parseNum(r.xTilt ?? r.tiltX ?? angleDelta.x);
      const yTilt = parseNum(r.yTilt ?? r.tiltY ?? angleDelta.y);
      const zTilt = parseNum(r.zTilt ?? r.tiltZ ?? angleDelta.z);
      const resultantTilt = parseNum(r.resultantTilt ?? r.resultant) ?? (xTilt !== null && yTilt !== null ? Math.sqrt(xTilt * xTilt + yTilt * yTilt) : null);
      const xDisp = 0.0;
      const yDisp = 0.0;
      const zDisp = 0.0;
      const totalDisp = 0.0;

      const rockfallActive = false;
      const rockfallNewEvent = false;
      const rockfallSequence = typeof rockfall.sequence === 'number' ? rockfall.sequence : (typeof r.rockfallSequence === 'number' ? r.rockfallSequence : (typeof r.sequence === 'number' ? r.sequence : null));
      const motionClassification = motion.classification || r.motionClassification || 'STABLE';
      const motionEventType = motion.eventType || r.motionEventType || r.eventType || motionClassification;
      const eventPending = Boolean(motion.pending ?? r.eventPending ?? r.pending ?? false);

      return {
        ...r,
        resultant: resultantTilt,
        resultantTilt,
        xTilt,
        tiltX: xTilt,
        yTilt,
        tiltY: yTilt,
        zTilt,
        tiltZ: zTilt,
        totalDisp,
        totalDisplacement: totalDisp,
        xDisp,
        xDisplacement: xDisp,
        yDisp,
        yDisplacement: yDisp,
        zDisp,
        zDisplacement: zDisp,
        accMag: parseNum(r.accMag ?? raw.accelerationDelta?.peak),
        rockfallDeltaPeak: parseNum(r.rockfallDeltaPeak ?? raw.accelerationDelta?.peak),
        vibrationRMS: parseNum(r.vibrationRMS ?? r.vibRMS ?? raw.vibration?.vibrationRMS),
        vibRMS: parseNum(r.vibRMS ?? r.vibrationRMS ?? raw.vibration?.vibrationRMS),
        vibrationPeak: parseNum(r.vibrationPeak ?? r.vibPeak ?? raw.vibration?.vibrationPeak),
        vibPeak: parseNum(r.vibPeak ?? r.vibrationPeak ?? raw.vibration?.vibrationPeak),
        temperature: parseNum(r.temperature ?? r.temp ?? raw.environment?.temperature),
        temp: parseNum(r.temp ?? r.temperature ?? raw.environment?.temperature),
        rockfallAlarm: rockfall,
        motionEvent: motion,
        rockfallActive,
        alarmActive: rockfallActive,
        rockfallNewEvent,
        newEvent: rockfallNewEvent,
        rockfallSequence,
        sequence: rockfallSequence,
        motionClassification,
        motionEventType,
        eventType: motionEventType,
        eventPending,
        pending: eventPending,
        rawPayload: raw,
      };
    };


    getReportsAnalytics(filters)
      .then(res => {
        if (res?.timeSeriesData?.length) {
          const seen = new Set();
          const uniqueRows = [];
          for (const r of res.timeSeriesData) {
            const ts = r.timestamp || r.time;
            if (ts && seen.has(ts)) continue;
            if (ts) seen.add(ts);
            uniqueRows.push(mapReportRow(r));
          }
          setReportRows(uniqueRows);
          if (isZeroCalibrated && res.summary) {
            setSummaryStats({
              ...res.summary,
              maxResultantTilt: 0.0,
              maxXTilt: 0.0,
              maxYTilt: 0.0,
              maxZTilt: 0.0,
              maxTotalDisplacement_mm: 0.0,
              maxXDisplacement_mm: 0.0,
              maxYDisplacement_mm: 0.0,
              averageResultantTilt: 0.0,
            });
          } else {
            setSummaryStats(res.summary || null);
          }
        } else {
          getTelemetryHistory(devId, utcFrom, utcTo)
            .then(tRes => {
              if (tRes?.history?.length) {
                const seen = new Set();
                const uniqueRows = [];
                for (const r of tRes.history) {
                  const ts = r.timestamp || r.time;
                  if (ts && seen.has(ts)) continue;
                  if (ts) seen.add(ts);
                  uniqueRows.push(mapReportRow(r));
                }
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
              const uniqueRows = [];
              for (const r of tRes.history) {
                const ts = r.timestamp || r.time;
                if (ts && seen.has(ts)) continue;
                if (ts) seen.add(ts);
                uniqueRows.push(mapReportRow(r));
              }
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
    let maxTilt = 0;
    let maxXTilt = 0;
    let maxYTilt = 0;
    let maxZTilt = 0;
    let maxDisp = 0;
    let maxXDisp = 0;
    let maxYDisp = 0;
    let maxVib = 0;
    let tempSum = 0;
    let rockfallAlarmCount = 0;
    let newEventCount = 0;
    let pendingCount = 0;

    reportRows.forEach(r => {
      const t = parseFloat(r.resultant || r.resultantTilt || 0);
      const xt = Math.abs(parseFloat(r.xTilt || r.tiltX || 0));
      const yt = Math.abs(parseFloat(r.yTilt || r.tiltY || 0));
      const zt = Math.abs(parseFloat(r.zTilt || r.tiltZ || r.resultantTilt || 0));
      const d = parseFloat(r.totalDisp || r.totalDisplacement || 0);
      const xd = Math.abs(parseFloat(r.xDisp || r.xDisplacement || 0));
      const yd = Math.abs(parseFloat(r.yDisp || r.yDisplacement || 0));
      const v = parseFloat(r.vibPeak || r.vibrationPeak || 0);
      const temp = parseFloat(r.temperature || r.temp || 0);

      if (t > maxTilt) maxTilt = t;
      if (xt > maxXTilt) maxXTilt = xt;
      if (yt > maxYTilt) maxYTilt = yt;
      if (zt > maxZTilt) maxZTilt = zt;
      if (d > maxDisp) maxDisp = d;
      if (xd > maxXDisp) maxXDisp = xd;
      if (yd > maxYDisp) maxYDisp = yd;
      if (v > maxVib) maxVib = v;
      tempSum += temp;

      if (r.rockfallActive) rockfallAlarmCount++;
      if (r.rockfallNewEvent) newEventCount++;
      if (r.eventPending) pendingCount++;
    });

    const latestRow = reportRows[0] || {};

    if (summaryStats && summaryStats.totalDataPoints > 0) {
      maxTilt = summaryStats.maxResultantTilt !== undefined ? summaryStats.maxResultantTilt : maxTilt;
      maxXTilt = summaryStats.maxXTilt !== undefined ? summaryStats.maxXTilt : maxXTilt;
      maxYTilt = summaryStats.maxYTilt !== undefined ? summaryStats.maxYTilt : maxYTilt;
      maxZTilt = summaryStats.maxZTilt !== undefined ? summaryStats.maxZTilt : maxZTilt;
      maxDisp = 0.0;
      maxXDisp = 0.0;
      maxYDisp = 0.0;
      maxVib = summaryStats.maxVibrationPeak_g !== undefined ? summaryStats.maxVibrationPeak_g : maxVib;
    }

    return {
      count: summaryStats?.totalDataPoints || reportRows.length,
      maxTilt,
      maxXTilt,
      maxYTilt,
      maxZTilt,
      maxDisp: 0.0,
      maxXDisp: 0.0,
      maxYDisp: 0.0,
      maxVib,
      avgTemp: reportRows.length > 0 ? (tempSum / reportRows.length).toFixed(1) : (summaryStats?.averageTemperature_C || 0),
      rockfallAlarmCount,
      newEventCount,
      pendingCount,
      latestMotionClassification: latestRow.motionClassification || 'STABLE',
      latestEventType: latestRow.motionEventType || latestRow.motionClassification || 'STABLE',
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
      'Motion_Classification',
      'Event_Type',
      'Rockfall_Alarm_Active',
      'Rockfall_New_Event',
      'Rockfall_Sequence',
      'Event_Pending',
      'XTilt_deg',
      'YTilt_deg',
      'ResultantTilt_deg',
      'XDisp_mm',
      'YDisp_mm',
      'ZDisp_mm',
      'TotalDisp_mm',
      'Acceleration_Mag_g',
      'Vibration_RMS_g',
      'Vibration_Peak_g',
      'Temperature_C',
      'Stability_Status'
    ].join(',');

    const rows = reportRows.map(r => {
      const d = r.totalDisp || r.totalDisplacement || 0;
      const status = d >= 15 ? 'CRITICAL RISK' : (d >= 5 ? 'WARNING CREEP' : 'STABLE');

      return [
        `"${formatFullDateTime(r.timestamp || r.time)}"`,
        r.timestamp || '',
        r.deviceId || selectedDevice,
        `"${r.motionClassification || 'STABLE'}"`,
        `"${r.motionEventType || r.motionClassification || 'STABLE'}"`,
        Boolean(r.rockfallActive),
        Boolean(r.rockfallNewEvent),
        r.rockfallSequence !== null && r.rockfallSequence !== undefined ? r.rockfallSequence : '',
        Boolean(r.eventPending),
        r.xTilt !== null && r.xTilt !== undefined ? Number(r.xTilt).toFixed(4) : '',
        r.yTilt !== null && r.yTilt !== undefined ? Number(r.yTilt).toFixed(4) : '',
        r.resultant !== null && r.resultant !== undefined ? Number(r.resultant).toFixed(4) : '',
        '0.0',
        '0.0',
        '0.0',
        '0.0',
        r.accMag !== null && r.accMag !== undefined ? Number(r.accMag).toFixed(3) : '',
        r.vibRMS !== null && r.vibRMS !== undefined ? Number(r.vibRMS).toFixed(4) : '',
        r.vibPeak !== null && r.vibPeak !== undefined ? Number(r.vibPeak).toFixed(4) : '',
        (r.temperature ?? r.temp) !== null && (r.temperature ?? r.temp) !== undefined ? Number(r.temperature ?? r.temp).toFixed(1) : '',
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

    // --- Incident Tickets Report Functions ---
  const handleTicketPresetSelect = (preset) => {
    setTicketPreset(preset);
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
    } else if (preset === 'all') {
      from = '2025-01-01';
    }

    setTicketFromDate(from);
    setTicketToDate(to);
    fetchTicketsReport(from, to, ticketSite, ticketDevice, ticketStatus, ticketSeverity, ticketSource);
  };

  const fetchTicketsReport = (
    from = ticketFromDate,
    to = ticketToDate,
    siteId = ticketSite,
    devId = ticketDevice,
    status = ticketStatus,
    severity = ticketSeverity,
    source = ticketSource
  ) => {
    setTicketLoading(true);
    setTicketCurrentPage(1);

    const params = {
      fromDate: from,
      toDate: to,
      siteId: siteId !== 'ALL' ? siteId : undefined,
      deviceId: devId !== 'ALL' ? devId : undefined,
      status: status !== 'ALL' ? status : undefined,
      severity: severity !== 'ALL' ? severity : undefined,
      source: source !== 'ALL' ? source : undefined,
    };

    getTicketsReport(params)
      .then(res => {
        if (res?.tickets) {
          setTicketRows(res.tickets);
          setTicketSummary(res.summary || null);
        } else {
          setTicketRows([]);
          setTicketSummary(null);
        }
      })
      .catch(err => {
        console.error('Error fetching tickets report:', err);
        setTicketRows([]);
      })
      .finally(() => {
        setTicketLoading(false);
      });
  };

  const handleExportTicketCSV = () => {
    if (ticketRows.length === 0) {
      alert('No ticket records available to export for the selected date range.');
      return;
    }

    const headers = [
      'Ticket_Code',
      'Title',
      'Category',
      'Priority',
      'Status',
      'Source',
      'Device_ID',
      'Site_ID',
      'Structure_ID',
      'Assigned_Technician',
      'Assigned_Email',
      'Created_By',
      'Diagnostic_Root_Cause',
      'Site_Resolution_Remarks',
      'Corrective_Action',
      'Admin_Remarks',
      'Uploaded_Photos_Count',
      'Created_At',
      'Resolved_At',
      'Closed_At'
    ].join(',');

    const rows = ticketRows.map(t => [
      `"${t.incidentCode || ''}"`,
      `"${(t.title || '').replace(/"/g, '""')}"`,
      `"${t.category || ''}"`,
      `"${t.severity || ''}"`,
      `"${t.status || ''}"`,
      `"${t.source || ''}"`,
      `"${t.deviceId || ''}"`,
      `"${t.siteId || ''}"`,
      `"${t.structureId || ''}"`,
      `"${(t.assignedUserName || '').replace(/"/g, '""')}"`,
      `"${t.assignedUserEmail || ''}"`,
      `"${t.createdByUserName || ''}"`,
      `"${(t.rootCause || '').replace(/"/g, '""')}"`,
      `"${(t.siteRemarks || '').replace(/"/g, '""')}"`,
      `"${(t.correctiveAction || '').replace(/"/g, '""')}"`,
      `"${(t.adminRemarks || '').replace(/"/g, '""')}"`,
      t.resolutionImages ? t.resolutionImages.length : 0,
      `"${t.createdAt || ''}"`,
      `"${t.resolvedAt || ''}"`,
      `"${t.closedAt || ''}"`,
    ].join(','));

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers, ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `incident_tickets_report_${ticketFromDate}_to_${ticketToDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const totalTicketPages = Math.ceil(ticketRows.length / ticketRowsPerPage) || 1;
  const paginatedTickets = useMemo(() => {
    const start = (ticketCurrentPage - 1) * ticketRowsPerPage;
    return ticketRows.slice(start, start + ticketRowsPerPage);
  }, [ticketRows, ticketCurrentPage, ticketRowsPerPage]);

  const activeDeviceObj = devices.find(d => d.id === selectedDevice) || currentDevice;

  return (
    <div className="space-y-4 font-sans text-slate-800 animate-fadeIn">
      {/* Top Header Bar & Report Type Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl border border-slate-200/90 bg-white shadow-xs">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200/80 text-blue-600 flex items-center justify-center shadow-2xs">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                {reportCategory === 'TELEMETRY' ? 'Telemetry & Sensor Data Report' : 'Incident & Maintenance Tickets Report'}
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                {reportCategory === 'TELEMETRY'
                  ? 'Statistical multi-parameter inclinometer telemetry reports, time-range queries & data exports'
                  : 'Comprehensive geotechnical incident log, field resolution remarks, photo proofs & admin verification audit'}
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls & Report Category Switcher */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Report Category Switcher */}
          <div className="flex items-center p-1 bg-slate-50 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => setReportCategory('TELEMETRY')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                reportCategory === 'TELEMETRY'
                  ? 'bg-white text-blue-600 shadow-xs border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Telemetry Report</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setReportCategory('TICKETS');
                if (ticketRows.length === 0) fetchTicketsReport();
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                reportCategory === 'TICKETS'
                  ? 'bg-white text-blue-600 shadow-xs border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <TicketCheck className="w-3.5 h-3.5" />
              <span>Tickets & Incidents Report</span>
            </button>
          </div>

          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 shadow-2xs transition-all cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5 text-slate-500" />
            <span>Print Report</span>
          </button>
          <button
            onClick={reportCategory === 'TELEMETRY' ? handleExportCSV : handleExportTicketCSV}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Full-Width Stacked Layout: Top Filter Bar -> KPI Metrics -> Full-Width Telemetry Table */}
      <div className="space-y-4">
        {/* ================= TOP FULL-WIDTH FILTER BAR ================= */}
        <div className={cardCls}>
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 mb-3 border-b border-slate-100">
            <span className="text-xs font-extrabold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-blue-600" />
              <span>Report Parameters</span>
            </span>
            <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
              {timePreset.toUpperCase()}
            </span>
          </div>

          <form onSubmit={handleApplyFilter} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end text-xs">
            {/* Quick Time Presets Buttons */}
            <div className="lg:col-span-4">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1.5">
                Preset Time Range:
              </label>
              <div className="grid grid-cols-5 gap-1">
                {[
                  { id: '24h', label: '24h' },
                  { id: '7d', label: '7d' },
                  { id: '30d', label: '30d' },
                  { id: '90d', label: '90d' },
                  { id: 'custom', label: 'Custom' },
                ].map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handlePresetSelect(p.id)}
                    className={`py-2 px-1.5 rounded-xl text-[11px] font-bold transition-all cursor-pointer text-center ${
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
            <div className="lg:col-span-2">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Location Site:
              </label>
              <select
                value={selectedSite}
                onChange={e => setSelectedSite(e.target.value)}
                className="w-full px-2.5 py-2 rounded-xl border border-slate-200 bg-white text-slate-900 font-bold text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs"
              >
                <option value="ALL">All Sites ({sites.length})</option>
                {sites.map(s => (
                  <option key={s.id || s.siteId} value={s.id || s.siteId}>{s.name}</option>
                ))}
              </select>
            </div>

            {/* Target Device */}
            <div className="lg:col-span-2">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Sensor Device Node:
              </label>
              <select
                value={selectedDevice}
                onChange={e => setSelectedDevice(e.target.value)}
                className="w-full px-2.5 py-2 rounded-xl border border-slate-200 bg-white text-slate-900 font-bold text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs"
              >
                {devices
                  .filter(d => selectedSite === 'ALL' || d.siteId === selectedSite)
                  .map(d => (
                    <option key={d.id} value={d.id}>{d.name} ({d.id})</option>
                  ))}
                {devices.length === 0 && <option value="">No Devices Found</option>}
              </select>
            </div>

            {/* Date From */}
            <div className="lg:col-span-1 sm:col-span-1">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1 flex items-center gap-1">
                <Calendar className="w-3 h-3 text-slate-400" />
                <span>From</span>
              </label>
              <input
                type="date"
                required
                value={fromDate}
                onChange={e => {
                  setTimePreset('custom');
                  setFromDate(e.target.value);
                }}
                className="w-full px-2 py-2 rounded-xl border border-slate-200 bg-white text-slate-900 font-bold text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs"
              />
            </div>

            {/* Date To */}
            <div className="lg:col-span-1 sm:col-span-1">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1 flex items-center gap-1">
                <Calendar className="w-3 h-3 text-slate-400" />
                <span>To</span>
              </label>
              <input
                type="date"
                required
                value={toDate}
                onChange={e => {
                  setTimePreset('custom');
                  setToDate(e.target.value);
                }}
                className="w-full px-2 py-2 rounded-xl border border-slate-200 bg-white text-slate-900 font-bold text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs"
              />
            </div>

            {/* Submit Query Button */}
            <div className="lg:col-span-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
              >
                {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Filter className="w-3.5 h-3.5" />}
                <span>Run Query</span>
              </button>
            </div>
          </form>
        </div>

        {/* ================= FULL-WIDTH KPI METRICS & TELEMETRY DATA TABLE ================= */}
        <div className="w-full space-y-4">
          {/* Summary KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            <div className="p-3.5 rounded-2xl border border-slate-200/90 bg-white shadow-xs">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Readings</div>
              <div className="text-lg font-extrabold text-slate-900 font-mono tabular-nums mt-0.5">{stats.count}</div>
              <div className="text-[10px] text-blue-600 font-semibold mt-0.5">Time Query Buffer</div>
            </div>

            <div className="p-3.5 rounded-2xl border border-slate-200/90 bg-white shadow-xs">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Peak Incline θ</div>
              <div className="text-lg font-extrabold text-purple-700 font-mono tabular-nums mt-0.5">{Number(stats.maxTilt).toFixed(1)}°</div>
              <div className="text-[10px] text-slate-400 font-medium mt-0.5">Max Tilt Angle</div>
            </div>

            <div className="p-3.5 rounded-2xl border border-slate-200/90 bg-white shadow-xs">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Max Displacement</div>
              <div className="text-lg font-extrabold text-pink-700 font-mono tabular-nums mt-0.5">{Number(stats.maxDisp).toFixed(1)} mm</div>
              <div className="text-[10px] text-slate-400 font-medium mt-0.5">Vector Total</div>
            </div>

            <div className="p-3.5 rounded-2xl border border-slate-200/90 bg-white shadow-xs">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Peak Vibration</div>
              <div className="text-lg font-extrabold text-amber-700 font-mono tabular-nums mt-0.5">{Number(stats.maxVib).toFixed(1)} g</div>
              <div className="text-[10px] text-slate-400 font-medium mt-0.5">Dynamic Shock</div>
            </div>

            <div className="p-3.5 rounded-2xl border border-slate-200/90 bg-white shadow-xs">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Rockfall Alarms</div>
              <div className={`text-lg font-extrabold font-mono tabular-nums mt-0.5 ${stats.rockfallAlarmCount > 0 ? 'text-red-600' : 'text-slate-800'}`}>
                {stats.rockfallAlarmCount}
              </div>
              <div className="text-[10px] text-slate-400 font-medium mt-0.5">Latched States</div>
            </div>

            <div className="p-3.5 rounded-2xl border border-slate-200/90 bg-white shadow-xs">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Motion State</div>
              <div className="text-sm font-extrabold font-mono mt-1 text-indigo-700 truncate">
                {stats.latestMotionClassification}
              </div>
              <div className="text-[10px] text-slate-400 font-medium mt-0.5 truncate">{stats.latestEventType}</div>
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
                  { id: 'HAZARDS', label: 'Hazards & Rockfall' },
                  { id: 'TILT', label: 'Tilt Angle (°)' },
                  { id: 'DISPLACEMENT', label: 'Displacement (mm)' },
                  { id: 'VIBRATION', label: 'Vibration (g)' },
                  { id: 'ENVIRONMENT', label: 'Thermal & Stability' },
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
                  <div className="h-4 w-32 rounded bg-slate-200 animate-pulse" />
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

                    {/* Data Columns (Hazards & Rockfall Alarm) */}
                    {(paramCategory === 'ALL' || paramCategory === 'HAZARDS') && (
                      <>
                        <th className="py-2.5 px-3 text-left whitespace-nowrap text-indigo-700">Classification</th>
                        <th className="py-2.5 px-3 text-left whitespace-nowrap text-indigo-600">Event Type</th>
                        <th className="py-2.5 px-3 text-center whitespace-nowrap text-red-700">Rockfall Alarm</th>
                        <th className="py-2.5 px-3 text-center whitespace-nowrap text-amber-700">New Event</th>
                        <th className="py-2.5 px-3 text-center whitespace-nowrap text-slate-700">Sequence</th>
                        <th className="py-2.5 px-3 text-center whitespace-nowrap text-slate-700">Queue Status</th>
                      </>
                    )}

                    {/* Right-Aligned Data Columns (Tilt: X, Y, Resultant (°)) */}
                    {(paramCategory === 'ALL' || paramCategory === 'TILT') && (
                      <>
                        <th className="py-2.5 px-3 text-right whitespace-nowrap text-blue-700">X Tilt (°)</th>
                        <th className="py-2.5 px-3 text-right whitespace-nowrap text-emerald-700">Y Tilt (°)</th>
                        <th className="py-2.5 px-3 text-right whitespace-nowrap text-purple-700">Resultant (°)</th>
                      </>
                    )}

                    {/* Right-Aligned Data Columns (Displacement: X, Y, Total mm) */}
                    {(paramCategory === 'ALL' || paramCategory === 'DISPLACEMENT') && (
                      <>
                        <th className="py-2.5 px-3 text-right whitespace-nowrap text-cyan-700">X Disp (mm)</th>
                        <th className="py-2.5 px-3 text-right whitespace-nowrap text-amber-700">Y Disp (mm)</th>
                        <th className="py-2.5 px-3 text-right whitespace-nowrap text-pink-700">Total Disp (mm)</th>
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
                      <td colSpan={20} className="py-12 text-center text-slate-400 font-sans text-xs">
                        {loading ? 'Querying records from PostgreSQL time-series store...' : 'No telemetry data points found for this range. Try adjusting the query range.'}
                      </td>
                    </tr>
                  ) : (
                    paginatedRows.map((r, i) => {
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

                          {/* Data Columns (Hazards & Rockfall Alarm) */}
                          {(paramCategory === 'ALL' || paramCategory === 'HAZARDS') && (
                            <>
                              <td className="py-2 px-3 text-left whitespace-nowrap">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  r.motionClassification === 'ROCKFALL'
                                    ? 'bg-red-100 text-red-800'
                                    : r.motionClassification === 'HUMAN_TOUCH'
                                    ? 'bg-blue-100 text-blue-800'
                                    : r.motionClassification === 'LANDSLIDE'
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-emerald-100 text-emerald-800'
                                }`}>
                                  {r.motionClassification || 'STABLE'}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-left whitespace-nowrap text-slate-800 font-semibold font-mono text-[11px]">
                                {r.motionEventType || r.motionClassification || 'STABLE'}
                              </td>
                              <td className="py-2 px-3 text-center whitespace-nowrap">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  r.rockfallActive ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-600'
                                }`}>
                                  {r.rockfallActive ? 'ACTIVE' : 'OFF'}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-center whitespace-nowrap">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  r.rockfallNewEvent ? 'bg-amber-100 text-amber-800 animate-pulse' : 'bg-slate-100 text-slate-500'
                                }`}>
                                  {r.rockfallNewEvent ? 'YES' : 'NO'}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-center whitespace-nowrap font-mono text-slate-700">
                                {r.rockfallSequence !== null && r.rockfallSequence !== undefined ? `#${r.rockfallSequence}` : '--'}
                              </td>
                              <td className="py-2 px-3 text-center whitespace-nowrap">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  r.eventPending ? 'bg-amber-100 text-amber-800' : 'bg-emerald-50 text-emerald-700'
                                }`}>
                                  {r.eventPending ? 'PENDING' : 'SYNCED'}
                                </span>
                              </td>
                            </>
                          )}

                          {/* Right-aligned Numerical Tilt Columns (X, Y, Resultant) */}
                          {(paramCategory === 'ALL' || paramCategory === 'TILT') && (
                            <>
                              <td className="py-2 px-3 text-right whitespace-nowrap text-blue-700 font-semibold">
                                {r.xTilt !== null && r.xTilt !== undefined ? `${r.xTilt >= 0 ? '+' : ''}${Number(r.xTilt).toFixed(1)}°` : '--'}
                              </td>
                              <td className="py-2 px-3 text-right whitespace-nowrap text-emerald-700 font-semibold">
                                {r.yTilt !== null && r.yTilt !== undefined ? `${r.yTilt >= 0 ? '+' : ''}${Number(r.yTilt).toFixed(1)}°` : '--'}
                              </td>
                              <td className="py-2 px-3 text-right whitespace-nowrap text-purple-700 font-bold">
                                {r.resultant !== null && r.resultant !== undefined ? `${Number(r.resultant).toFixed(1)}°` : '--'}
                              </td>
                            </>
                          )}

                          {/* Right-aligned Numerical Displacement Columns (X, Y, Total mm) */}
                          {(paramCategory === 'ALL' || paramCategory === 'DISPLACEMENT') && (
                            <>
                              <td className="py-2 px-3 text-right whitespace-nowrap text-cyan-700 font-semibold">
                                0.0 mm
                              </td>
                              <td className="py-2 px-3 text-right whitespace-nowrap text-amber-700 font-semibold">
                                0.0 mm
                              </td>
                              <td className="py-2 px-3 text-right whitespace-nowrap text-pink-700 font-bold">
                                0.0 mm
                              </td>
                            </>
                          )}

                          {/* Right-aligned Numerical Vibration Columns */}
                          {(paramCategory === 'ALL' || paramCategory === 'VIBRATION') && (
                            <>
                              <td className="py-2 px-3 text-right whitespace-nowrap text-amber-700 font-semibold">{r.accMag !== null && r.accMag !== undefined ? Number(r.accMag).toFixed(1) : '--'}</td>
                              <td className="py-2 px-3 text-right whitespace-nowrap text-amber-600">{(r.vibRMS ?? r.vibrationRMS) !== null && (r.vibRMS ?? r.vibrationRMS) !== undefined ? Number(r.vibRMS ?? r.vibrationRMS).toFixed(1) : '--'}</td>
                              <td className="py-2 px-3 text-right whitespace-nowrap text-amber-600">{(r.vibPeak ?? r.vibrationPeak) !== null && (r.vibPeak ?? r.vibrationPeak) !== undefined ? Number(r.vibPeak ?? r.vibrationPeak).toFixed(1) : '--'}</td>
                            </>
                          )}

                          {/* Right-aligned Numerical Environment Columns */}
                          {(paramCategory === 'ALL' || paramCategory === 'ENVIRONMENT') && (
                            <>
                              <td className="py-2 px-3 text-right whitespace-nowrap text-emerald-700 font-bold">{(r.temperature ?? r.temp) !== null && (r.temperature ?? r.temp) !== undefined ? `${Number(r.temperature ?? r.temp).toFixed(1)} °C` : '--'}</td>
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
