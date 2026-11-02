import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Shield, Battery, Signal, Sliders, Calendar,
  Download, RefreshCw, Layers, ShieldCheck, Activity,
  CheckCircle2, AlertTriangle, AlertCircle, Radio, Clock, MapPin,
  Compass, Zap, Thermometer, Search, ExternalLink, Sun, Target,
  Bed, Crosshair, Database, Settings, Move, Copy, Check, Eye, Code,
  Flame, Wind, Hand, Mountain, HardHat, Gauge, HelpCircle
} from 'lucide-react';
import {
  getDevice, getDevices, getDeviceTelemetry, configureDeviceTelemetry,
  setDeviceReference, resetDeviceReference, getWsUrl
} from '../api/apiClient';
import {
  parseTelemetry, hasTelemetryData, formatSigned, formatPresent,
  formatBatteryPercentage, formatCSQPercentage
} from '../utils/telemetryHelper';
import {
  formatISTDatetimeLocal, istDatetimeToUTC, formatFullDateTime,
  formatTimeString, formatHHMM
} from '../utils/dateHelper';
import TiltmeterChartsRow from '../components/TiltmeterChartsRow';
import AlarmSummaryWidget from '../components/AlarmSummaryWidget';
import RecentEventsWidget from '../components/RecentEventsWidget';

// Helper to format device uptime from milliseconds into a human-readable duration
function formatUptime(ms) {
  if (ms === undefined || ms === null || isNaN(ms)) return '--';
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m ${seconds}s`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s (${ms.toLocaleString()} ms)`;
}

export default function DashboardPage({ devices = [], currentDevice, onSelectDevice }) {
  const navigate = useNavigate();
  const cardCls = 'rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs text-slate-800';

  const [deviceList, setDeviceList] = useState(devices);
  const [selectedId, setSelectedId] = useState(() => {
    return currentDevice?.id || (devices.length > 0 ? devices[0].id : '');
  });
  const [deviceMeta, setDeviceMeta] = useState(null);
  const [liveData, setLiveData] = useState(null);
  const [telemetryHistory, setTelemetryHistory] = useState([]);

  // Filter presets: '1h', '6h', '24h', '7d', '30d', 'all', 'custom'
  const [activeFilter, setActiveFilter] = useState('24h');

  const now = new Date();
  const initFrom = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const [fromDateTime, setFromDateTime] = useState(formatISTDatetimeLocal(initFrom));
  const [toDateTime, setToDateTime] = useState(formatISTDatetimeLocal(now));

  const [tableSearch, setTableSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 20;

  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [rawJsonModalOpen, setRawJsonModalOpen] = useState(false);
  const [copiedRaw, setCopiedRaw] = useState(false);
  const [rawExpanded, setRawExpanded] = useState(false);
  const [selectedHistoricalRaw, setSelectedHistoricalRaw] = useState(null);

  const [configForm, setConfigForm] = useState({
    sleep_count: 15,
    wake_count: 30,
    calibrate: false,
    debug: true,
    rockfall_on: 12.0,
    rockfall_off: 3.0,
    landslide_on: 15.0,
    landslide_off: 5.0,
    landslide_seconds: 5,
    human_touch_on: 5.0,
    human_touch_off: 1.5,
    air_wind_on: 0.8,
    air_wind_off: 0.25,
    air_wind_seconds: 12,
    normal_seconds: 10,
    gaugeLength_mm: 1000,
  });

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const wsRef = useRef(null);

  // Sync devices or fetch from server
  useEffect(() => {
    if (devices && devices.length > 0) {
      setDeviceList(devices);
      if (!selectedId || !devices.some(d => d.id?.toLowerCase() === selectedId?.toLowerCase())) {
        setSelectedId(devices[0].id);
      }
    } else {
      getDevices()
        .then(res => {
          if (res?.devices?.length) {
            setDeviceList(res.devices);
            if (!selectedId || !res.devices.some(d => d.id?.toLowerCase() === selectedId?.toLowerCase())) {
              setSelectedId(res.devices[0].id);
            }
          } else {
            setDeviceList([]);
            setSelectedId('');
          }
        })
        .catch(() => {
          setDeviceList([]);
          setSelectedId('');
        });
    }
  }, [devices]);

  // Sync currentDevice prop
  useEffect(() => {
    if (currentDevice?.id && currentDevice.id !== selectedId) {
      setSelectedId(currentDevice.id);
    }
  }, [currentDevice?.id]);

  // Active Selected Device Object
  const activeDevice = useMemo(() => {
    if (!selectedId) return null;
    const found = deviceList.find(d => d.id?.toLowerCase() === selectedId?.toLowerCase());
    const matchedCurrent = currentDevice?.id?.toLowerCase() === selectedId?.toLowerCase() ? currentDevice : null;

    if (deviceMeta && deviceMeta.id?.toLowerCase() === selectedId?.toLowerCase()) {
      return { ...(found || {}), ...deviceMeta };
    }
    return found || matchedCurrent || null;
  }, [deviceList, selectedId, deviceMeta, currentDevice]);

  // Map individual history point into structured format without altering numeric precision
  const mapPointData = (pt) => {
    if (!pt) return null;
    const raw = pt.rawPayload || pt;
    const ts = pt.timestamp || pt.time || raw.timestamp || new Date().toISOString();

    const parseNum = (v) => {
      if (v === null || v === undefined || v === '' || v === '--') return null;
      const n = typeof v === 'number' ? v : parseFloat(v);
      return !isNaN(n) ? n : null;
    };

    const angleDelta = raw.angleDelta || pt.angleDelta || {};
    const tilt = raw.tilt || pt.tilt || {};
    const angleCurrent = raw.angleCurrent || pt.angleCurrent || {};
    const angleReference = raw.angleReference || pt.angleReference || {};
    const disp = raw.displacement || pt.displacement || {};
    const accelDelta = raw.accelerationDelta || pt.accelerationDelta || {};
    const vib = raw.vibration || pt.vibration || {};
    const env = raw.environment || pt.environment || {};
    const pwr = raw.power || pt.power || {};
    const net = raw.network || pt.network || {};
    const rockfall = raw.rockfallAlarm || pt.rockfallAlarm || {};
    const motion = raw.motionEvent || pt.motionEvent || {};
    const settings = raw.monitoringSettings || pt.monitoringSettings || {};

    const deltaX = parseNum(angleDelta.x ?? tilt.roll ?? pt.xTilt ?? pt.deltaX);
    const deltaY = parseNum(angleDelta.y ?? tilt.pitch ?? pt.yTilt ?? pt.deltaY);
    const deltaZ = parseNum(angleDelta.z ?? tilt.yaw ?? pt.zTilt ?? pt.deltaZ);
    const tiltRes = parseNum(tilt.tilt ?? pt.resultantTilt ?? pt.resultant) ?? (deltaX !== null && deltaY !== null ? Math.sqrt(deltaX * deltaX + deltaY * deltaY) : null);

    const xD = parseNum(disp.xDisplacement_mm ?? pt.xDisplacement ?? pt.xDisp);
    const yD = parseNum(disp.yDisplacement_mm ?? pt.yDisplacement ?? pt.yDisp);
    const zD = parseNum(disp.zDisplacement_mm ?? pt.zDisplacement ?? pt.zDisp);
    const totalD = parseNum(disp.totalDisplacement_mm ?? pt.totalDisplacement ?? pt.totalDisp) ?? (xD !== null && yD !== null ? Math.sqrt(xD * xD + yD * yD + (zD || 0) * (zD || 0)) : null);

    const rockfallPeak = parseNum(accelDelta.peak ?? pt.rockfallDeltaPeak);
    const vibPeak = parseNum(vib.vibrationPeak ?? pt.touchVibrationPeak ?? pt.vibPeak);
    const vibRMS = parseNum(vib.vibrationRMS ?? pt.vibrationRMS ?? pt.vibRMS);
    const temp = parseNum(env.temperature ?? pt.temperature ?? pt.temp);
    const batteryV = parseNum(pwr.batteryVoltage ?? pt.batteryVoltage);
    const csqVal = parseNum(net.csq ?? pt.csq);

    const classification = motion.classification || pt.motionClassification || 'STABLE';
    const eventType = motion.eventType || pt.eventType || pt.motionEventType || classification;
    const alarmActive = Boolean(rockfall.active ?? pt.alarmActive ?? pt.rockfallActive ?? false);
    const rockfallNewEvent = Boolean(rockfall.newEvent ?? pt.rockfallNewEvent ?? pt.newEvent ?? false);
    const rockfallSequence = typeof rockfall.sequence === 'number' ? rockfall.sequence : (typeof pt.rockfallSequence === 'number' ? pt.rockfallSequence : (typeof pt.sequence === 'number' ? pt.sequence : null));
    const eventPending = Boolean(motion.pending ?? pt.eventPending ?? pt.pending ?? false);

    return {
      time: formatHHMM(ts),
      fullTime: formatFullDateTime(ts),
      timestamp: ts,
      deviceId: pt.deviceId || raw.device_id || selectedId,
      schemaVersion: raw.schemaVersion ?? pt.schemaVersion ?? 2,
      sampleUptimeMs: raw.sampleUptimeMs ?? pt.sampleUptimeMs ?? null,

      // Angle readings
      deltaX,
      deltaY,
      deltaZ,
      xTilt: deltaX,
      yTilt: deltaY,
      zTilt: deltaZ,
      roll: deltaX,
      pitch: deltaY,
      yaw: deltaZ,
      resultantTilt: tiltRes,
      tiltStatus: tilt.tiltStatus || 'NORMAL',

      angleCurrent,
      angleReference,
      angleDelta,

      // Displacement
      xDisp: xD,
      yDisp: yD,
      zDisp: zD,
      totalDisp: totalD,
      xDisplacement: xD,
      yDisplacement: yD,
      zDisplacement: zD,
      totalDisplacement: totalD,
      displacement: disp,

      // Dynamic motion & triggers
      rockfallDeltaPeak: rockfallPeak,
      touchVibrationPeak: vibPeak,
      vibrationPeak: vibPeak,
      vibrationRMS: vibRMS,
      motionClassification: classification,
      eventType,
      motionEventType: eventType,
      alarmActive,
      rockfallActive: alarmActive,
      rockfallNewEvent,
      newEvent: rockfallNewEvent,
      rockfallSequence,
      sequence: rockfallSequence,
      eventPending,
      pending: eventPending,

      acceleration: raw.acceleration || pt.acceleration || null,
      accelerationCurrent: raw.accelerationCurrent || pt.accelerationCurrent || null,
      accelerationReference: raw.accelerationReference || pt.accelerationReference || null,
      accelerationDelta: accelDelta,
      gyroscope: raw.gyroscope || pt.gyroscope || null,
      vibration: vib,
      rockfallAlarm: rockfall,
      motionEvent: motion,
      monitoringSettings: settings,
      units: raw.units || pt.units || null,

      temp,
      temperature: temp,
      batteryVoltage: batteryV,
      battery: batteryV !== null ? `${batteryV.toFixed(2)} V` : '--',
      csq: csqVal,
      signalStrength: csqVal !== null ? `${csqVal} CSQ` : '--',

      rawPayload: raw,
    };
  };

  // Load telemetry history
  const loadHistory = (id, fromDt = null, toDt = null, rangeKey = activeFilter, isCurrentCheck = null) => {
    if (!id) return;
    setLoading(true);

    const isCustom = !rangeKey || rangeKey === 'custom';
    const utcFrom = (isCustom && fromDt) ? istDatetimeToUTC(fromDt) : null;
    const utcTo = (isCustom && toDt) ? istDatetimeToUTC(toDt) : null;
    const effectiveRange = isCustom ? null : rangeKey;

    getDeviceTelemetry(id, utcFrom, utcTo, effectiveRange)
      .then(res => {
        if (isCurrentCheck && !isCurrentCheck()) return;
        if (res?.history?.length) {
          const seen = new Set();
          const mapped = [];
          for (const pt of res.history) {
            const ts = pt.timestamp || pt.time;
            if (ts && seen.has(ts)) continue;
            if (ts) seen.add(ts);
            mapped.push(mapPointData(pt));
          }
          setTelemetryHistory(mapped);
          const firstPoint = mapped[0];
          const lastPoint = mapped[mapped.length - 1];
          if (firstPoint?.timestamp && lastPoint?.timestamp && effectiveRange) {
            setFromDateTime(formatISTDatetimeLocal(new Date(firstPoint.timestamp)));
            setToDateTime(formatISTDatetimeLocal(new Date(lastPoint.timestamp)));
          }
          const latestPointCandidate = res?.latest ? mapPointData(res.latest) : lastPoint;
          if (latestPointCandidate) {
            setLiveData(parseTelemetry(latestPointCandidate));
          }
        } else if (res?.latest) {
          const mappedLatest = mapPointData(res.latest);
          setLiveData(parseTelemetry(mappedLatest));
          setTelemetryHistory([mappedLatest]);
        } else {
          setTelemetryHistory([]);
          setLiveData(null);
        }
      })
      .catch(() => {
        if (isCurrentCheck && !isCurrentCheck()) return;
        setTelemetryHistory([]);
        setLiveData(null);
      })
      .finally(() => {
        if (isCurrentCheck && !isCurrentCheck()) return;
        setLoading(false);
      });
  };

  // Live WebSocket Subscription for real-time telemetry streaming
  useEffect(() => {
    const wsUrl = getWsUrl();
    let socket;
    try {
      socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        console.log('📡 [WebSocket Connected] Live stream listening at:', wsUrl);
      };

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          const packetData = message.data || message;
          const packetDeviceId = packetData.deviceId || packetData.device_id || message.deviceId;

          if (packetDeviceId && selectedId && packetDeviceId.toLowerCase() === selectedId.toLowerCase()) {
            console.log('⚡ [Live Telemetry Packet Received via WS]:', packetData);
            const mapped = mapPointData(packetData);
            setLiveData(parseTelemetry(mapped));
            setTelemetryHistory(prev => {
              const updated = [...prev, mapped];
              return updated.length > 500 ? updated.slice(updated.length - 500) : updated;
            });
          }
        } catch (e) {
          console.warn('WS message parse error:', e);
        }
      };

      socket.onerror = () => {};
    } catch (e) {}

    return () => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
    };
  }, [selectedId]);

  // Fetch device metadata & historical telemetry for selectedId
  useEffect(() => {
    if (!selectedId) return;

    setDeviceMeta(null);
    setLiveData(null);
    setTelemetryHistory([]);

    let isCurrent = true;
    const checkCurrent = () => isCurrent;

    getDevice(selectedId)
      .then(res => {
        if (!isCurrent) return;
        const dev = res?.device || res;
        if (dev && (dev.id || dev.name)) {
          setDeviceMeta(dev);
          const s = dev.monitoringSettings || {};
          setConfigForm({
            sleep_count: dev.sleep_count !== undefined ? dev.sleep_count : (s.uploadIntervalMinutes || 15),
            wake_count: dev.wake_count !== undefined ? dev.wake_count : 30,
            calibrate: Boolean(dev.calibrate ?? dev.hasReferenceZero),
            debug: s.debug !== undefined ? Boolean(s.debug) : true,
            rockfall_on: s.rockfall_on ?? 12.0,
            rockfall_off: s.rockfall_off ?? 3.0,
            landslide_on: s.landslide_on ?? 15.0,
            landslide_off: s.landslide_off ?? 5.0,
            landslide_seconds: s.landslide_seconds ?? 5,
            human_touch_on: s.human_touch_on ?? 5.0,
            human_touch_off: s.human_touch_off ?? 1.5,
            air_wind_on: s.air_wind_on ?? 0.8,
            air_wind_off: s.air_wind_off ?? 0.25,
            air_wind_seconds: s.air_wind_seconds ?? 12,
            normal_seconds: s.normal_seconds ?? 10,
            gaugeLength_mm: dev.gaugeLength_mm !== undefined ? dev.gaugeLength_mm : 1000,
          });
        }
      })
      .catch(() => {});

    loadHistory(selectedId, null, null, activeFilter, checkCurrent);

    return () => {
      isCurrent = false;
    };
  }, [selectedId]);

  // Periodic poll every 60s
  useEffect(() => {
    if (!selectedId) return;
    const intervalId = setInterval(() => {
      if (activeFilter === 'custom') {
        loadHistory(selectedId, fromDateTime, toDateTime, 'custom');
      } else {
        loadHistory(selectedId, null, null, activeFilter);
      }
    }, 60000);
    return () => clearInterval(intervalId);
  }, [selectedId, activeFilter, fromDateTime, toDateTime]);

  const handleDeviceSelect = (newId) => {
    if (newId === selectedId) return;
    setSelectedId(newId);
    setDeviceMeta(null);
    setLiveData(null);
    setTelemetryHistory([]);
    const found = deviceList.find(d => d.id === newId);
    if (found && onSelectDevice) {
      onSelectDevice(found);
    }
  };

  const handleRangeSelect = (presetKey) => {
    setActiveFilter(presetKey);
    loadHistory(selectedId, null, null, presetKey);
  };

  const handleCustomDateSubmit = (e) => {
    e.preventDefault();
    setActiveFilter('custom');
    loadHistory(selectedId, fromDateTime, toDateTime, null);
  };

  const handleSaveConfig = async (e) => {
    e.preventDefault();
    const sleepVal = Number(configForm.sleep_count);
    const wakeVal = Number(configForm.wake_count);
    const payload = {
      sleep_count: sleepVal,
      wake_count: wakeVal > 0 ? wakeVal : 30,
      calibrate: Boolean(configForm.calibrate),
      debug: Boolean(configForm.debug),
      thresholds: {
        rockfall_on: parseFloat(configForm.rockfall_on) || 12.0,
        rockfall_off: parseFloat(configForm.rockfall_off) || 3.0,
        landslide_on: parseFloat(configForm.landslide_on) || 15.0,
        landslide_off: parseFloat(configForm.landslide_off) || 5.0,
        landslide_seconds: parseInt(configForm.landslide_seconds, 10) || 5,
        human_touch_on: parseFloat(configForm.human_touch_on) || 5.0,
        human_touch_off: parseFloat(configForm.human_touch_off) || 1.5,
        air_wind_on: parseFloat(configForm.air_wind_on) || 0.8,
        air_wind_off: parseFloat(configForm.air_wind_off) || 0.25,
        air_wind_seconds: parseInt(configForm.air_wind_seconds, 10) || 12,
        normal_seconds: parseInt(configForm.normal_seconds, 10) || 10,
      }
    };
    try {
      await configureDeviceTelemetry(selectedId, payload);
      setMsg({ type: 'success', text: `Configuration deployed to ${selectedId} successfully.` });
      setConfigModalOpen(false);
      loadHistory(selectedId, null, null, activeFilter);
    } catch (err) {
      setMsg({ type: 'error', text: err.message || 'Error deploying config' });
    } finally {
      setTimeout(() => setMsg({ type: '', text: '' }), 3500);
    }
  };

  const handleExportCSV = () => {
    if (telemetryHistory.length === 0) {
      alert('No telemetry records available to export for the selected date range.');
      return;
    }
    const headers = 'Timestamp,Device_ID,Classification,Event_Type,Rockfall_Alarm_Active,Rockfall_New_Event,Rockfall_Sequence,Event_Pending,Rockfall_Delta_Peak_ms2,Tilt_X_deg,Tilt_Y_deg,Tilt_Z_deg,XDisp_mm,YDisp_mm,ZDisp_mm,TotalDisp_mm,Vib_Peak_ms2,Vib_RMS_ms2,Temp_C,Uptime_ms';
    const rows = telemetryHistory.map(r =>
      `"${formatFullDateTime(r.timestamp)}",${selectedId},"${r.motionClassification || 'STABLE'}","${r.eventType || r.motionClassification || 'STABLE'}",${Boolean(r.alarmActive || r.rockfallActive)},${Boolean(r.rockfallNewEvent || r.newEvent)},${r.rockfallSequence ?? r.sequence ?? ''},${Boolean(r.eventPending || r.pending)},${r.rockfallDeltaPeak ?? ''},${r.deltaX ?? ''},${r.deltaY ?? ''},${r.deltaZ ?? ''},${r.xDisp ?? ''},${r.yDisp ?? ''},${r.zDisp ?? ''},${r.totalDisp ?? ''},${r.vibrationPeak ?? ''},${r.vibrationRMS ?? ''},${r.temp ?? ''},${r.sampleUptimeMs ?? ''}`
    );
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers, ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `telemetry_${selectedId}_${activeFilter}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyRaw = () => {
    const rawObj = latestData?.rawPayload || latestData;
    navigator.clipboard.writeText(JSON.stringify(rawObj, null, 2)).then(() => {
      setCopiedRaw(true);
      setTimeout(() => setCopiedRaw(false), 2000);
    });
  };

  // Resolve latest device telemetry packet
  const latestData = useMemo(() => {
    if (telemetryHistory && telemetryHistory.length > 0) {
      const lastPoint = telemetryHistory[telemetryHistory.length - 1];
      if (liveData && hasTelemetryData(liveData)) {
        if (!lastPoint?.timestamp || new Date(liveData.timestamp) >= new Date(lastPoint.timestamp)) {
          return liveData;
        }
      }
      return lastPoint;
    }
    if (liveData && hasTelemetryData(liveData)) {
      return liveData;
    }
    if (activeDevice && (activeDevice.rawPayload || activeDevice.latestTelemetry || activeDevice.xTilt !== undefined)) {
      return mapPointData(activeDevice.latestTelemetry || activeDevice.rawPayload || activeDevice);
    }
    return null;
  }, [liveData, telemetryHistory, activeDevice]);

  const hasData = Boolean(latestData);
  const d = latestData || {};
  const rawP = d.rawPayload || {};

  // Settings in use (from device telemetry or meta)
  const appliedSettings = d.monitoringSettings || rawP.monitoringSettings || deviceMeta?.monitoringSettings || {
    uploadIntervalMinutes: 15,
    samplingWindowSeconds: 1,
    samplingRateHz: 400,
    debug: true,
    rockfall_on: 12.0,
    rockfall_off: 3.0,
    landslide_on: 15.0,
    landslide_off: 5.0,
    landslide_seconds: 5,
    human_touch_on: 5.0,
    human_touch_off: 1.5,
    air_wind_on: 0.8,
    air_wind_off: 0.25,
    air_wind_seconds: 12,
    normal_seconds: 10,
  };

  const parseNum = (v) => {
    if (v === null || v === undefined || v === '' || v === '--') return null;
    const n = typeof v === 'number' ? v : parseFloat(v);
    return !isNaN(n) ? n : null;
  };

  // Status flags
  const motionClass = d.motionClassification || rawP.motionEvent?.classification || (hasData ? 'STABLE' : '--');
  const eventType = rawP.motionEvent?.eventType || d.eventType || d.motionEvent?.eventType || motionClass;
  const isPending = Boolean(rawP.motionEvent?.pending ?? d.eventPending ?? d.pending);
  const isAlarmActive = Boolean(rawP.rockfallAlarm?.active ?? d.alarmActive ?? d.rockfallActive);
  const isNewEvent = Boolean(rawP.rockfallAlarm?.newEvent ?? d.rockfallNewEvent ?? d.newEvent);
  const eventSequence = rawP.rockfallAlarm?.sequence ?? d.rockfallSequence ?? d.sequence ?? (hasData ? 0 : '--');

  // Key Trigger Measurements
  const rockfallPeak = parseNum(d.rockfallDeltaPeak ?? rawP.accelerationDelta?.peak);
  const touchVibPeak = parseNum(d.vibrationPeak ?? rawP.vibration?.vibrationPeak);
  const vibRMS = parseNum(d.vibrationRMS ?? rawP.vibration?.vibrationRMS);
  const deltaX = parseNum(d.deltaX ?? rawP.angleDelta?.x);
  const deltaY = parseNum(d.deltaY ?? rawP.angleDelta?.y);
  const deltaZ = parseNum(d.deltaZ ?? rawP.angleDelta?.z);
  const maxAngleDelta = (deltaX !== null && deltaY !== null) ? Math.max(Math.abs(deltaX), Math.abs(deltaY)) : (deltaX !== null ? Math.abs(deltaX) : (deltaY !== null ? Math.abs(deltaY) : null));

  // Thresholds
  const rockfallThresh = appliedSettings.rockfall_on || 12.0;
  const landslideThresh = appliedSettings.landslide_on || 15.0;
  const touchThresh = appliedSettings.human_touch_on || 5.0;
  const windThresh = appliedSettings.air_wind_on || 0.8;

  // Displacement
  const xDisp = parseNum(d.xDisp ?? rawP.displacement?.xDisplacement_mm);
  const yDisp = parseNum(d.yDisp ?? rawP.displacement?.yDisplacement_mm);
  const zDisp = parseNum(d.zDisp ?? rawP.displacement?.zDisplacement_mm);
  const totalDisp = parseNum(d.totalDisp ?? rawP.displacement?.totalDisplacement_mm) ?? (xDisp !== null && yDisp !== null ? Math.sqrt(xDisp * xDisp + yDisp * yDisp + (zDisp || 0) * (zDisp || 0)) : null);

  // Accel, Gyro, Angle vectors
  const accCurrent = rawP.accelerationCurrent || d.accelerationCurrent || rawP.acceleration || {};
  const accRef = rawP.accelerationReference || d.accelerationReference || {};
  const accDelta = rawP.accelerationDelta || d.accelerationDelta || {};
  const gyro = rawP.gyroscope || d.gyroscope || {};
  const angCurrent = rawP.angleCurrent || d.angleCurrent || {};
  const angRef = rawP.angleReference || d.angleReference || {};
  const angDelta = rawP.angleDelta || d.angleDelta || {};
  const vibObj = rawP.vibration || d.vibration || {};

  // Table filtering & pagination
  const filteredRows = useMemo(() => {
    const list = [...telemetryHistory].reverse();
    if (!tableSearch) return list;
    const q = tableSearch.toLowerCase();
    return list.filter(r =>
      r.fullTime?.toLowerCase().includes(q) ||
      r.motionClassification?.toLowerCase().includes(q) ||
      (r.deltaX !== null && String(r.deltaX).includes(q)) ||
      (r.deltaY !== null && String(r.deltaY).includes(q)) ||
      (r.rockfallDeltaPeak !== null && String(r.rockfallDeltaPeak).includes(q))
    );
  }, [telemetryHistory, tableSearch]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / rowsPerPage));
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return filteredRows.slice(start, start + rowsPerPage);
  }, [filteredRows, currentPage]);

  return (
    <div className="space-y-4 font-sans text-slate-800">
      {/* Toast Notification */}
      {msg.text && (
        <div className={`p-3 rounded-xl border flex items-center gap-2 text-xs font-semibold shadow-xs ${
          msg.type === 'error' ? 'bg-red-50 border-red-200 text-red-800' : 'bg-emerald-50 border-emerald-200 text-emerald-800'
        }`}>
          {msg.type === 'error' ? <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" /> : <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />}
          <span>{msg.text}</span>
        </div>
      )}

      {/* Top Header & Telemetry Status Navigation Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl border border-slate-200/90 bg-white shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 text-blue-600 shadow-2xs">
            <Radio className={`w-5 h-5 ${hasData ? 'animate-pulse' : 'text-slate-400'}`} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg sm:text-xl font-bold text-slate-900 leading-tight">
                {activeDevice?.name || (selectedId ? `Device ${selectedId}` : 'No Device Registered')}
              </h1>

              {/* Device Selector */}
              <select
                id="dashboard-device-select"
                value={selectedId}
                onChange={(e) => handleDeviceSelect(e.target.value)}
                disabled={deviceList.length === 0}
                className="px-3 py-1 rounded-xl border border-slate-200 bg-white text-slate-900 font-bold text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer shadow-2xs font-mono disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {deviceList.length === 0 ? (
                  <option value="" disabled>No devices registered</option>
                ) : (
                  deviceList.map(dev => (
                    <option key={dev.id} value={dev.id}>
                      {dev.name || dev.id} ({dev.id})
                    </option>
                  ))
                )}
              </select>

              {/* Schema Version Tag */}
              <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 font-mono font-bold text-[11px]">
                Schema v{d.schemaVersion || 2}
              </span>

              {/* Status Indicator */}
              <span className={`px-2.5 py-0.5 rounded-full font-semibold text-[11px] inline-flex items-center gap-1 border ${
                !hasData
                  ? 'bg-slate-50 text-slate-600 border-slate-200'
                  : isAlarmActive
                  ? 'bg-red-50 text-red-700 border-red-300'
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${!hasData ? 'bg-slate-400' : isAlarmActive ? 'bg-red-600 animate-ping' : 'bg-emerald-500 animate-pulse'}`} />
                <span>{!hasData ? (deviceList.length === 0 ? 'NO DEVICES' : 'WAITING FOR DATA') : isAlarmActive ? 'HAZARD ALARM ACTIVE' : 'SYSTEM NORMAL'}</span>
              </span>

              {/* Server Timestamp */}
              <span className="flex items-center gap-1 text-[11px] font-mono text-slate-500 bg-slate-50 px-2.5 py-0.5 rounded-md border border-slate-200">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>Received: {d.timestamp ? formatFullDateTime(d.timestamp) : '--'}</span>
              </span>

              {/* Device Uptime */}
              <span className="flex items-center gap-1 text-[11px] font-mono text-slate-600 bg-slate-50 px-2.5 py-0.5 rounded-md border border-slate-200" title="Internal Sensor Uptime">
                <Activity className="w-3.5 h-3.5 text-blue-500" />
                <span>Uptime: {d.sampleUptimeMs !== null && d.sampleUptimeMs !== undefined ? formatUptime(d.sampleUptimeMs) : '--'}</span>
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-1">
              LSM6DSO 6-DoF Rockfall &amp; Landslide Monitoring Telemetry • Continuous 400 Hz Sampling
            </p>
          </div>
        </div>

        {/* Quick Diagnostic Badges & Actions */}
        <div className="flex items-center gap-2 text-xs flex-wrap">
          {/* Battery Voltage */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 font-medium font-mono" title="Power Supply Voltage">
            <Battery className="w-4 h-4 text-emerald-600" />
            <span>{typeof d.batteryVoltage === 'number' ? `${d.batteryVoltage.toFixed(2)} V` : '-- V'}</span>
          </div>

          {/* Modem CSQ */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 font-medium font-mono" title="Modem Signal Quality (CSQ)">
            <Signal className="w-4 h-4 text-blue-600" />
            <span>{typeof d.csq === 'number' ? `${d.csq} CSQ` : '-- CSQ'}</span>
          </div>

          {/* Calibrated Status */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 font-medium font-mono" title="Calibration Loaded">
            <ShieldCheck className="w-4 h-4 text-indigo-600" />
            <span>{rawP.calibration?.calibrated ?? d.calibrated ? 'Calibrated ✓' : (hasData ? 'Uncalibrated' : '--')}</span>
          </div>

          {/* Raw JSON Inspector Button */}
          <button
            onClick={() => setRawJsonModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-medium text-xs rounded-xl border border-slate-300 transition-colors cursor-pointer shadow-2xs font-mono"
            title="Inspect unaltered raw telemetry JSON payload"
          >
            <Code className="w-3.5 h-3.5 text-slate-700" />
            <span>Raw JSON</span>
          </button>

          {/* Configure Device Button */}
          <button
            onClick={() => setConfigModalOpen(true)}
            disabled={!selectedId}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Configure Settings</span>
          </button>
        </div>
      </div>

      {/* Empty State Banner if no devices exist in database */}
      {deviceList.length === 0 && (
        <div className="p-6 rounded-2xl border border-slate-200/90 bg-white text-center shadow-xs space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
            <Radio className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">No Inclinometer Devices Registered</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
              No devices currently exist in the database. When any device posts telemetry to <code className="bg-slate-100 px-1 py-0.5 rounded font-mono">/api/telemetry/ingest/:deviceId</code>, it will be automatically registered and appear here live.
            </p>
          </div>
          <div className="flex items-center justify-center gap-2 pt-1">
            <button
              onClick={() => navigate('/devices')}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-xs cursor-pointer"
            >
              Go to Devices Page
            </button>
          </div>
        </div>
      )}

      {/* Waiting Banner if device is selected but has no telemetry records yet */}
      {deviceList.length > 0 && !hasData && (
        <div className="p-3.5 rounded-xl border border-amber-200 bg-amber-50/70 text-amber-900 text-xs font-semibold flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-amber-600 animate-pulse flex-shrink-0" />
            <span>Device <strong>{selectedId}</strong> is registered. Waiting for live telemetry packet stream...</span>
          </div>
          <span className="text-[11px] font-mono text-amber-700">Listening on port 5001</span>
        </div>
      )}

      {/* 1. ACTIVE HAZARD BANNER (Section 11: Only true for rockfall/landslide cases) */}
      <div className={`p-4 rounded-2xl border transition-all ${
        !hasData
          ? 'bg-slate-50 border-slate-200 text-slate-800 shadow-2xs'
          : isAlarmActive
          ? 'bg-red-50/90 border-red-300 text-red-950 shadow-sm'
          : 'bg-emerald-50/70 border-emerald-200 text-emerald-950 shadow-2xs'
      }`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${
              !hasData
                ? 'bg-slate-200 text-slate-700'
                : isAlarmActive
                ? 'bg-red-600 text-white animate-bounce'
                : 'bg-emerald-100 text-emerald-700'
            }`}>
              {!hasData ? <Radio className="w-5 h-5" /> : isAlarmActive ? <AlertTriangle className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold tracking-tight">
                  {!hasData
                    ? (deviceList.length === 0 ? 'NO INCLINOMETER DEVICES CONFIGURED' : `MONITORING INITIALIZED • WAITING FOR TELEMETRY STREAM (${selectedId})`)
                    : isAlarmActive
                    ? 'ACTIVE ROCKFALL / LANDSLIDE HAZARD ALERT'
                    : 'HAZARD STATUS: NO ACTIVE HAZARD ALARM'}
                </h2>
                <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-white/80 border border-slate-200 font-bold">
                  {hasData ? `Sequence #${eventSequence}` : 'Sequence: --'}
                </span>
                {isNewEvent && (
                  <span className="px-2 py-0.5 rounded-md bg-red-600 text-white font-mono text-[10px] font-bold animate-pulse">
                    NEW EVENT
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                {!hasData
                  ? (deviceList.length === 0 ? 'Register a device or stream telemetry to begin real-time monitoring.' : `Listening for live sensor packets for device ${selectedId}. Once received, hazard rules will evaluate in real time.`)
                  : isAlarmActive
                  ? 'A rockfall impact or landslide tilt deviation has exceeded emergency safety limits and latched an active alarm state.'
                  : 'Sensor monitoring window is within safe operational thresholds. Alarm flag is reserved for rockfall/landslide hazards.'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
            <div className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 shadow-2xs">
              <span className="text-slate-500 mr-1.5">rockfallAlarm.active:</span>
              <strong className={!hasData ? 'text-slate-600' : isAlarmActive ? 'text-red-700 font-extrabold' : 'text-emerald-700'}>
                {hasData ? String(isAlarmActive) : '--'}
              </strong>
            </div>
            <div className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 shadow-2xs">
              <span className="text-slate-500 mr-1.5">rockfallAlarm.newEvent:</span>
              <strong className={!hasData ? 'text-slate-600' : isNewEvent ? 'text-amber-700 font-bold' : 'text-slate-700'}>
                {hasData ? String(isNewEvent) : '--'}
              </strong>
            </div>
            <div className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 shadow-2xs">
              <span className="text-slate-500 mr-1.5">sequence:</span>
              <strong className="text-slate-800 font-bold">
                {hasData ? `#${eventSequence}` : '--'}
              </strong>
            </div>
            <div className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 shadow-2xs">
              <span className="text-slate-500 mr-1.5">motionEvent:</span>
              <strong className="text-indigo-700 font-bold">
                {hasData ? `${motionClass} (${eventType})` : '--'}
              </strong>
            </div>
            <div className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 shadow-2xs">
              <span className="text-slate-500 mr-1.5">Queue Status:</span>
              <strong className={!hasData ? 'text-slate-600' : isPending ? 'text-amber-700' : 'text-emerald-700'}>
                {hasData ? (isPending ? 'pending=true' : 'Synced') : '--'}
              </strong>
            </div>
          </div>
        </div>
      </div>

      {/* Date-Time Range Quick Filters (1h, 6h, 24h, 7d, 30d, all, custom) */}
      <div className={cardCls}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-semibold text-slate-500 mr-1">Time Range:</span>
            {[
              { id: '1h', label: '1h' },
              { id: '6h', label: '6h' },
              { id: '24h', label: '24h' },
              { id: '7d', label: '7d' },
              { id: '30d', label: '30d' },
              { id: 'all', label: 'All' },
            ].map(b => (
              <button
                key={b.id}
                onClick={() => handleRangeSelect(b.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                  activeFilter === b.id
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {b.label}
              </button>
            ))}
          </div>

          {/* Custom Date Form */}
          <form onSubmit={handleCustomDateSubmit} className="flex flex-wrap items-center gap-2 text-xs">
            <div className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <input
                type="datetime-local"
                required
                value={fromDateTime}
                onChange={e => setFromDateTime(e.target.value)}
                className="px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-800 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
              />
              <span className="text-slate-400">to</span>
              <input
                type="datetime-local"
                required
                value={toDateTime}
                onChange={e => setToDateTime(e.target.value)}
                className="px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-800 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-medium rounded-lg border border-slate-200 transition-colors cursor-pointer"
            >
              {loading ? '...' : 'Apply'}
            </button>
          </form>
        </div>
      </div>

      {/* 5. GYROSCOPE & DYNAMIC VIBRATION DEEP-DIVE */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Gyroscope Rates (rad/s) */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-600" />
              <h3 className="font-bold text-slate-900 text-sm">
                Gyroscope Angular Velocity (rad/s)
              </h3>
            </div>
            <span className="text-xs font-mono text-slate-500">
              Mag: <strong className="text-slate-800">{gyro.gyroMag !== undefined ? Number(gyro.gyroMag).toFixed(6) : '--'}</strong>
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3 font-mono text-center">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[10px] text-slate-500 uppercase">Gx (X-Rate)</span>
              <div className="text-sm sm:text-base font-bold text-slate-800 mt-1">
                {gyro.gx !== undefined ? Number(gyro.gx).toFixed(6) : '--'}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[10px] text-slate-500 uppercase">Gy (Y-Rate)</span>
              <div className="text-sm sm:text-base font-bold text-slate-800 mt-1">
                {gyro.gy !== undefined ? Number(gyro.gy).toFixed(6) : '--'}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[10px] text-slate-500 uppercase">Gz (Z-Rate)</span>
              <div className="text-sm sm:text-base font-bold text-slate-800 mt-1">
                {gyro.gz !== undefined ? Number(gyro.gz).toFixed(6) : '--'}
              </div>
            </div>
          </div>
        </div>

        {/* Dynamic Vibration Components */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-teal-600" />
              <h3 className="font-bold text-slate-900 text-sm">
                Vibration Dynamics &amp; RMS Components (m/s²)
              </h3>
            </div>
            <span className="text-xs font-mono text-slate-500">
              Combined RMS: <strong className="text-teal-700">{vibObj.vibrationRMS !== undefined ? Number(vibObj.vibrationRMS).toFixed(5) : '--'}</strong>
            </span>
          </div>

          <div className="grid grid-cols-4 gap-2 font-mono text-center text-xs">
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[10px] text-slate-500 block">X-RMS</span>
              <span className="font-bold text-slate-800 mt-1 block">{vibObj.xVibrationRMS !== undefined ? Number(vibObj.xVibrationRMS).toFixed(4) : '--'}</span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[10px] text-slate-500 block">Y-RMS</span>
              <span className="font-bold text-slate-800 mt-1 block">{vibObj.yVibrationRMS !== undefined ? Number(vibObj.yVibrationRMS).toFixed(4) : '--'}</span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[10px] text-slate-500 block">Z-RMS</span>
              <span className="font-bold text-slate-800 mt-1 block">{vibObj.zVibrationRMS !== undefined ? Number(vibObj.zVibrationRMS).toFixed(4) : '--'}</span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[10px] text-slate-500 block">Dynamic Inst</span>
              <span className="font-bold text-slate-800 mt-1 block">{vibObj.vibration !== undefined ? Number(vibObj.vibration).toFixed(4) : '--'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 6. MULTI-AXIS HISTORICAL CHARTS */}
      <TiltmeterChartsRow telemetryHistory={telemetryHistory} loading={loading} currentDevice={activeDevice} />

      {/* 7. APPLIED DEVICE MONITORING SETTINGS PANEL */}
      <div className={cardCls}>
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-indigo-600" />
            <h3 className="font-bold text-slate-900 text-sm">
              Applied Monitoring Settings &amp; Telemetry Timing (Reported by Device)
            </h3>
          </div>
          <button
            onClick={() => setConfigModalOpen(true)}
            className="text-xs text-blue-600 hover:text-blue-800 font-semibold cursor-pointer"
          >
            Edit Thresholds →
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 font-mono text-xs">
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-[10px] text-slate-500 uppercase block">Upload Interval</span>
            <span className="font-bold text-slate-900 text-sm mt-0.5 block">{appliedSettings.uploadIntervalMinutes || 15} min</span>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-[10px] text-slate-500 uppercase block">Sampling Window</span>
            <span className="font-bold text-slate-900 text-sm mt-0.5 block">{appliedSettings.samplingWindowSeconds || 1} sec</span>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-[10px] text-slate-500 uppercase block">Sample Rate</span>
            <span className="font-bold text-slate-900 text-sm mt-0.5 block">{appliedSettings.samplingRateHz || 400} Hz</span>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-[10px] text-slate-500 uppercase block">Rockfall ON/OFF</span>
            <span className="font-bold text-red-700 text-sm mt-0.5 block">{appliedSettings.rockfall_on || 12.0} / {appliedSettings.rockfall_off || 3.0} m/s²</span>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-[10px] text-slate-500 uppercase block">Landslide ON/OFF</span>
            <span className="font-bold text-amber-700 text-sm mt-0.5 block">{appliedSettings.landslide_on || 15.0}° / {appliedSettings.landslide_off || 5.0}°</span>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-[10px] text-slate-500 uppercase block">Touch ON/OFF</span>
            <span className="font-bold text-blue-700 text-sm mt-0.5 block">{appliedSettings.human_touch_on || 5.0} / {appliedSettings.human_touch_off || 1.5} m/s²</span>
          </div>
        </div>
      </div>

      {/* 9. HISTORICAL TELEMETRY LOGS TABLE */}
      <div className={cardCls}>
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider font-mono text-slate-800">
              HISTORICAL TELEMETRY DATABASE LOGS • <span className="text-blue-600">{selectedId}</span> ({filteredRows.length} Points)
            </span>
            <div className="flex items-center gap-1 text-[10px] text-blue-600 font-semibold font-mono">
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
              <input
                type="text"
                placeholder="Filter logs..."
                value={tableSearch}
                onChange={e => {
                  setTableSearch(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-8 pr-3 py-1 rounded-xl border border-slate-200 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-blue-500 w-44 sm:w-56"
              />
            </div>
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-xs rounded-xl border border-slate-200 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-slate-600" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full text-left text-xs whitespace-nowrap">
            <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 z-10 font-mono">
              <tr className="uppercase text-[10px] tracking-wider text-slate-600 font-bold">
                <th className="py-2.5 px-3">Timestamp</th>
                <th className="py-2.5 px-3 text-indigo-700">Classification</th>
                <th className="py-2.5 px-3 text-indigo-600">Event Type</th>
                <th className="py-2.5 px-3 text-center text-red-700">Rockfall Alarm</th>
                <th className="py-2.5 px-3 text-red-700">Rockfall Peak (m/s²)</th>
                <th className="py-2.5 px-3 text-blue-700">Tilt X (°)</th>
                <th className="py-2.5 px-3 text-purple-700">Tilt Y (°)</th>
                <th className="py-2.5 px-3 text-emerald-700">Tilt Z (°)</th>
                <th className="py-2.5 px-3 text-cyan-700">X Disp (mm)</th>
                <th className="py-2.5 px-3 text-amber-700">Y Disp (mm)</th>
                <th className="py-2.5 px-3 text-pink-700">Z Disp (mm)</th>
                <th className="py-2.5 px-3 text-purple-800">Total Disp (mm)</th>
                <th className="py-2.5 px-3 text-amber-800">Vib Peak (m/s²)</th>
                <th className="py-2.5 px-3 text-orange-700">Temp (°C)</th>
                <th className="py-2.5 px-3 text-center">Pending</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {paginatedRows.length === 0 ? (
                <tr>
                  <td colSpan={15} className="py-8 text-center text-slate-400 text-xs font-mono">
                    {loading ? 'Fetching telemetry logs from database...' : 'No telemetry records found for this period.'}
                  </td>
                </tr>
              ) : (
                paginatedRows.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2 px-3 text-slate-600 font-medium font-sans">
                      {r.fullTime || r.time}
                    </td>
                    <td className="py-2 px-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        r.motionClassification === 'ROCKFALL'
                          ? 'bg-red-100 text-red-800'
                          : r.motionClassification === 'HUMAN_TOUCH'
                          ? 'bg-blue-100 text-blue-800'
                          : r.motionClassification === 'LANDSLIDE'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {r.motionClassification}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-slate-800 font-semibold font-mono text-[11px]">
                      {r.eventType || r.motionEventType || r.motionClassification || 'STABLE'}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          (r.rockfallActive ?? r.alarmActive) ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {(r.rockfallActive ?? r.alarmActive) ? 'ACTIVE' : 'OFF'}
                        </span>
                        {(r.rockfallNewEvent ?? r.newEvent) && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[9px] font-bold animate-pulse">
                            NEW
                          </span>
                        )}
                        {(r.rockfallSequence !== null && r.rockfallSequence !== undefined) && (
                          <span className="text-[10px] text-slate-500 font-mono">
                            #{r.rockfallSequence}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-3 text-red-700 font-bold">
                      {r.rockfallDeltaPeak !== null && r.rockfallDeltaPeak !== undefined ? Number(r.rockfallDeltaPeak).toFixed(4) : '--'}
                    </td>
                    <td className="py-2 px-3 text-blue-700 font-bold">
                      {formatSigned(r.deltaX, 3)}
                    </td>
                    <td className="py-2 px-3 text-purple-700 font-bold">
                      {formatSigned(r.deltaY, 3)}
                    </td>
                    <td className="py-2 px-3 text-emerald-700 font-bold">
                      {formatSigned(r.deltaZ, 3)}
                    </td>
                    <td className="py-2 px-3 text-cyan-700">
                      {r.xDisp !== null && r.xDisp !== undefined ? Number(r.xDisp).toFixed(4) : '--'}
                    </td>
                    <td className="py-2 px-3 text-amber-700">
                      {r.yDisp !== null && r.yDisp !== undefined ? Number(r.yDisp).toFixed(4) : '--'}
                    </td>
                    <td className="py-2 px-3 text-pink-700">
                      {r.zDisp !== null && r.zDisp !== undefined ? Number(r.zDisp).toFixed(4) : '--'}
                    </td>
                    <td className="py-2 px-3 text-purple-800 font-bold">
                      {r.totalDisp !== null && r.totalDisp !== undefined ? Number(r.totalDisp).toFixed(4) : '--'}
                    </td>
                    <td className="py-2 px-3 text-amber-800">
                      {r.vibrationPeak !== null && r.vibrationPeak !== undefined ? Number(r.vibrationPeak).toFixed(4) : '--'}
                    </td>
                    <td className="py-2 px-3 text-orange-700">
                      {r.temp !== null && r.temp !== undefined ? `${Number(r.temp).toFixed(1)}` : '--'}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        (r.eventPending ?? r.pending) ? 'bg-amber-100 text-amber-800' : 'bg-emerald-50 text-emerald-700'
                      }`}>
                        {(r.eventPending ?? r.pending) ? 'PENDING' : 'SYNCED'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Table Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs font-mono">
            <span className="text-slate-500">
              Page {currentPage} of {totalPages} ({filteredRows.length} total entries)
            </span>
            <div className="flex items-center gap-1">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                className="px-2.5 py-1 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                className="px-2.5 py-1 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Operational Widgets (Alarm Summary & Events) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <AlarmSummaryWidget deviceId={selectedId} />
        <RecentEventsWidget currentDevice={activeDevice} />
      </div>

      {/* MODAL 1: RAW JSON TELEMETRY INSPECTOR */}
      {rawJsonModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 font-sans">
          <div className="w-full max-w-4xl max-h-[90vh] rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-2">
                <Code className="w-5 h-5 text-indigo-600" />
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Raw JSON Telemetry Payload Inspector
                  </h3>
                  <p className="text-xs text-slate-500">
                    Exact, unaltered telemetry payload stored in database for {selectedId}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopyRaw}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 font-mono text-xs cursor-pointer shadow-2xs"
                >
                  {copiedRaw ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-600" />}
                  <span>{copiedRaw ? 'Copied!' : 'Copy JSON'}</span>
                </button>
                <button
                  onClick={() => setRawJsonModalOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer text-lg leading-none"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4 bg-[#0f172a] text-[#f8fafc] font-mono text-xs">
              <pre className="whitespace-pre-wrap">
                {JSON.stringify(latestData?.rawPayload || latestData || { message: 'No telemetry record loaded yet' }, null, 2)}
              </pre>
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 font-mono">
              <span>Schema Version: {d.schemaVersion || 2}</span>
              <button
                onClick={() => setRawJsonModalOpen(false)}
                className="px-4 py-1.5 rounded-xl bg-slate-800 text-white font-sans font-medium cursor-pointer"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: CONFIGURE DEVICE SETTINGS */}
      {configModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 font-sans">
          <div className="w-full max-w-xl max-h-[90vh] rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Configure Settings for {selectedId}
                </h3>
                <p className="text-xs text-slate-500 font-medium">Update timing intervals and firmware detection thresholds</p>
              </div>
              <button onClick={() => setConfigModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer text-lg">
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveConfig} className="p-5 overflow-y-auto space-y-4 text-xs flex-1">
              {/* Timing */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Upload Interval (Minutes)
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    max="1440"
                    value={configForm.sleep_count}
                    onChange={e => setConfigForm({ ...configForm, sleep_count: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-mono font-medium focus:ring-1 focus:ring-blue-500"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Default: 15 min</p>
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Wake Sampling (Seconds)
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    max="3600"
                    value={configForm.wake_count}
                    onChange={e => setConfigForm({ ...configForm, wake_count: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-mono font-medium focus:ring-1 focus:ring-blue-500"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Default: 30 s</p>
                </div>
              </div>

              {/* Rockfall Thresholds */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                <span className="font-bold text-slate-800 block text-xs">Rockfall Thresholds (m/s²)</span>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-slate-600">ON Threshold (Trigger)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={configForm.rockfall_on}
                      onChange={e => setConfigForm({ ...configForm, rockfall_on: e.target.value })}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-600">OFF Threshold (Recovery)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={configForm.rockfall_off}
                      onChange={e => setConfigForm({ ...configForm, rockfall_off: e.target.value })}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Landslide Thresholds */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                <span className="font-bold text-slate-800 block text-xs">Landslide Thresholds (deg)</span>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[11px] text-slate-600">ON Angle (°)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={configForm.landslide_on}
                      onChange={e => setConfigForm({ ...configForm, landslide_on: e.target.value })}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-600">OFF Angle (°)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={configForm.landslide_off}
                      onChange={e => setConfigForm({ ...configForm, landslide_off: e.target.value })}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-600">Seconds</label>
                    <input
                      type="number"
                      value={configForm.landslide_seconds}
                      onChange={e => setConfigForm({ ...configForm, landslide_seconds: e.target.value })}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Human Touch Thresholds */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                <span className="font-bold text-slate-800 block text-xs">Human Touch Peak Thresholds (m/s²)</span>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-slate-600">ON Peak</label>
                    <input
                      type="number"
                      step="0.1"
                      value={configForm.human_touch_on}
                      onChange={e => setConfigForm({ ...configForm, human_touch_on: e.target.value })}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-600">OFF Peak</label>
                    <input
                      type="number"
                      step="0.1"
                      value={configForm.human_touch_off}
                      onChange={e => setConfigForm({ ...configForm, human_touch_off: e.target.value })}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Serial Debug Option */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-900">Serial Debug Stream (*DBG)</div>
                  <div className="text-[11px] text-slate-500">Enable 1-second compact UART sensor line</div>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(configForm.debug)}
                  onChange={e => setConfigForm({ ...configForm, debug: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setConfigModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-xs transition-colors cursor-pointer"
                >
                  Deploy Settings to Device
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
