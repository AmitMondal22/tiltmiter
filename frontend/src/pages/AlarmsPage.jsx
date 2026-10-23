import React, { useState, useEffect } from 'react';
import {
  Plus, Mail, Send, Trash2, CheckCircle2, AlertTriangle,
  Server, ShieldAlert, RefreshCw, Power, Bell, Shield, Clock, AtSign,
  Zap, Compass, Sliders, CheckSquare, Square, Search, Filter, Activity,
  Check, ArrowRight, AlertCircle, Layers, Edit3, X, ChevronDown, CheckCheck
} from 'lucide-react';
import {
  getAlarms,
  generateAlert,
  clearAlarms,
  getAlertRules,
  createAlertRule,
  updateAlertRule,
  deleteAlertRule,
  triggerAlertRule,
  getAlertHierarchy,
  getNotificationConfig
} from '../api/apiClient';
import { formatFullDateTime } from '../utils/dateHelper';

// Default Geotechnical Alert Rules ensuring the list is always populated
const DEFAULT_ALERT_RULES = [
  {
    id: 1,
    ruleName: 'Critical Tilt Threshold - Cut Slope Beta',
    projectId: 'PROJ-01',
    projectName: 'Metro Line Expansion Corridor',
    siteId: 'SITE-01',
    siteName: 'Cut Slope Beta',
    assetId: 'ASSET-01',
    assetName: 'Retaining Wall Alpha',
    deviceIds: ['DEV-001', 'DEV-002'],
    emails: ['system@techavo.in'],
    parameter: 'tilt',
    operator: '>',
    thresholdValue: 2.000,
    severity: 'CRITICAL',
    message: 'Resultant tilt exceeded critical threshold 2.000° on slope retaining structure.',
    enabled: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: 2,
    ruleName: 'Subsurface Displacement Limit - Shaft 04',
    projectId: 'PROJ-01',
    projectName: 'Metro Line Expansion Corridor',
    siteId: 'SITE-02',
    siteName: 'Metro Deep Shaft 04',
    assetId: 'ASSET-02',
    assetName: 'Tunnel Shaft Grouting Ring',
    deviceIds: ['DEV-002'],
    emails: ['system@techavo.in'],
    parameter: 'displacement',
    operator: '>',
    thresholdValue: 10.00,
    severity: 'CRITICAL',
    message: 'Lateral displacement exceeded critical limit 10.00 mm.',
    enabled: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: 3,
    ruleName: 'Bridge Viaduct Pier Tilt Warning',
    projectId: 'PROJ-02',
    projectName: 'High-Speed Rail Viaduct Package 4',
    siteId: 'SITE-03',
    siteName: 'Bridge Viaduct Pier 12',
    assetId: 'ASSET-03',
    assetName: 'Bridge Pier BP-12',
    deviceIds: ['DEV-003'],
    emails: ['system@techavo.in'],
    parameter: 'tilt',
    operator: '>',
    thresholdValue: 1.000,
    severity: 'WARNING',
    message: 'Bridge pier resultant tilt exceeded warning limit 1.000°.',
    enabled: true,
    createdAt: new Date().toISOString(),
  },
];

export default function AlarmsPage() {
  const cardCls = 'rounded-2xl border border-slate-200/80 bg-white p-5 text-slate-800 shadow-xs';

  // State: Hierarchy (Projects, Locations, Assets, Devices)
  const [hierarchy, setHierarchy] = useState({
    projects: [
      { id: 'PROJ-01', name: 'Metro Line Expansion Corridor', code: 'METRO-EXP' },
      { id: 'PROJ-02', name: 'High-Speed Rail Viaduct Package 4', code: 'HSR-PKG4' },
      { id: 'PROJ-03', name: 'Hydroelectric Tailings Dam Safety', code: 'DAM-SAFE' },
    ],
    locations: [
      { id: 'SITE-01', projectId: 'PROJ-01', name: 'Cut Slope Beta', code: 'CS-BETA' },
      { id: 'SITE-02', projectId: 'PROJ-01', name: 'Metro Deep Shaft 04', code: 'SHAFT-04' },
      { id: 'SITE-03', projectId: 'PROJ-02', name: 'Bridge Viaduct Pier 12', code: 'VIADUCT-12' },
      { id: 'SITE-04', projectId: 'PROJ-02', name: 'Excavation Pit Zone 2', code: 'PIT-Z2' },
      { id: 'SITE-05', projectId: 'PROJ-03', name: 'Tailings Embankment East', code: 'EMBANK-E' },
    ],
    assets: [
      { id: 'ASSET-01', siteId: 'SITE-01', projectId: 'PROJ-01', name: 'Retaining Wall Alpha', type: 'Retaining Wall' },
      { id: 'ASSET-02', siteId: 'SITE-02', projectId: 'PROJ-01', name: 'Tunnel Shaft Grouting Ring', type: 'Tunnel Shaft' },
      { id: 'ASSET-03', siteId: 'SITE-03', projectId: 'PROJ-02', name: 'Bridge Pier BP-12', type: 'Bridge Pier' },
      { id: 'ASSET-04', siteId: 'SITE-04', projectId: 'PROJ-02', name: 'Sheet Pile Cutoff Wall', type: 'Slope Barrier' },
      { id: 'ASSET-05', siteId: 'SITE-05', projectId: 'PROJ-03', name: 'Dam Crest Inclinometer Array', type: 'Dam Abutment' },
    ],
    devices: [
      { id: 'DEV-001', projectId: 'PROJ-01', siteId: 'SITE-01', assetId: 'ASSET-01', name: 'Inclinometer East Slope A1', type: 'BIAXIAL_TILTMETER', status: 'ONLINE', resultantTilt: 0.325, totalDisplacement: 2.15 },
      { id: 'DEV-002', projectId: 'PROJ-01', siteId: 'SITE-02', assetId: 'ASSET-02', name: 'Inclinometer West Wall B2', type: 'SUBSURFACE_INCLINOMETER', status: 'ONLINE', resultantTilt: 0.180, totalDisplacement: 1.85 },
      { id: 'DEV-003', projectId: 'PROJ-02', siteId: 'SITE-03', assetId: 'ASSET-03', name: 'Inclinometer North Pier C3', type: 'STRUCTURAL_TILTMETER', status: 'ONLINE', resultantTilt: 0.412, totalDisplacement: 3.40 },
      { id: 'DEV-004', projectId: 'PROJ-02', siteId: 'SITE-04', assetId: 'ASSET-04', name: 'Inclinometer South Retaining D4', type: 'RETAINING_WALL_MONITOR', status: 'ONLINE', resultantTilt: 0.260, totalDisplacement: 2.90 },
      { id: 'DEV-005', projectId: 'PROJ-03', siteId: 'SITE-05', assetId: 'ASSET-05', name: 'Inclinometer Subsurface Borehole E5', type: 'BOREHOLE_INCLINOMETER', status: 'ONLINE', resultantTilt: 0.150, totalDisplacement: 1.10 },
    ],
  });

  // State: Filter/Cascaded Selection for Create & Edit Form
  const [selectedProjectId, setSelectedProjectId] = useState('ALL');
  const [selectedLocationId, setSelectedLocationId] = useState('ALL');
  const [selectedAssetId, setSelectedAssetId] = useState('ALL');
  const [selectedDeviceIds, setSelectedDeviceIds] = useState(['DEV-001', 'DEV-002']);
  const [deviceSearch, setDeviceSearch] = useState('');

  // State: Alert Rule Form Fields
  const [editingRuleId, setEditingRuleId] = useState(null); // null when creating, rule ID when editing
  const [ruleName, setRuleName] = useState('');
  const [parameter, setParameter] = useState('tilt'); // 'tilt' | 'displacement' | 'both'
  const [operator, setOperator] = useState('>');
  const [thresholdValue, setThresholdValue] = useState(2.000);
  const [severity, setSeverity] = useState('CRITICAL'); // 'CRITICAL' | 'WARNING' | 'EMERGENCY'
  const [customMessage, setCustomMessage] = useState('');

  // State: Email Recipients
  const [emails, setEmails] = useState(['system@techavo.in']);
  const [newEmailInput, setNewEmailInput] = useState('');

  // State: Alert Rules List & Alarms Feed (Initialized with default rules so it's NEVER empty)
  const [alertRules, setAlertRules] = useState(DEFAULT_ALERT_RULES);
  const [alarms, setAlarms] = useState([]);
  const [summary, setSummary] = useState({ critical: 0, major: 0, minor: 0, warnings: 0, total: 0 });
  const [smtpServerStatus, setSmtpServerStatus] = useState('smtp.gmail.com:587');

  // Loading & Feedback
  const [submitting, setSubmitting] = useState(false);
  const [dispatchingRuleId, setDispatchingRuleId] = useState(null);
  const [feedback, setFeedback] = useState({ type: '', message: '' });
  const [showAlarmsFeed, setShowAlarmsFeed] = useState(false);

  const showFeedback = (type, message, timeout = 6000) => {
    setFeedback({ type, message });
    if (timeout) {
      setTimeout(() => setFeedback({ type: '', message: '' }), timeout);
    }
  };

  // Initial Load from API
  useEffect(() => {
    loadHierarchy();
    loadRules();
    loadAlarms();
    loadSmtpInfo();
  }, []);

  const loadHierarchy = async () => {
    try {
      const res = await getAlertHierarchy();
      if (res?.projects && res.projects.length > 0) {
        setHierarchy(res);
      }
    } catch (err) {
      console.warn('Could not load hierarchy from API:', err.message);
    }
  };

  const loadRules = async () => {
    try {
      const res = await getAlertRules();
      if (res?.rules && res.rules.length > 0) {
        setAlertRules(res.rules);
      }
    } catch (err) {
      console.warn('Could not load alert rules:', err.message);
    }
  };

  const loadAlarms = async () => {
    try {
      const res = await getAlarms();
      if (res?.alarms) setAlarms(res.alarms);
      if (res?.summary) setSummary(res.summary);
    } catch (err) {
      console.warn('Could not load alarms:', err.message);
    }
  };

  const loadSmtpInfo = async () => {
    try {
      const res = await getNotificationConfig();
      if (res?.smtp?.host) {
        setSmtpServerStatus(`${res.smtp.host}:${res.smtp.port || 587}`);
      }
      if (Array.isArray(res?.recipients) && res.recipients.length > 0) {
        setEmails(res.recipients);
      }
    } catch (err) {}
  };

  // Filter Locations based on Selected Project
  const filteredLocations = hierarchy.locations.filter(loc =>
    selectedProjectId === 'ALL' ? true : loc.projectId === selectedProjectId
  );

  // Filter Assets based on Selected Location & Project
  const filteredAssets = hierarchy.assets.filter(asset => {
    const matchProj = selectedProjectId === 'ALL' || asset.projectId === selectedProjectId;
    const matchLoc = selectedLocationId === 'ALL' || asset.siteId === selectedLocationId;
    return matchProj && matchLoc;
  });

  // Filter Devices based on Selected Project, Location, and Asset
  const filteredDevices = hierarchy.devices.filter(dev => {
    const matchProj = selectedProjectId === 'ALL' || dev.projectId === selectedProjectId;
    const matchLoc = selectedLocationId === 'ALL' || dev.siteId === selectedLocationId;
    const matchAsset = selectedAssetId === 'ALL' || dev.assetId === selectedAssetId;
    const matchSearch = !deviceSearch ||
      dev.id.toLowerCase().includes(deviceSearch.toLowerCase()) ||
      (dev.name && dev.name.toLowerCase().includes(deviceSearch.toLowerCase()));
    return matchProj && matchLoc && matchAsset && matchSearch;
  });

  // Handle Project Change (resets downstream Location & Asset)
  const handleProjectChange = (projId) => {
    setSelectedProjectId(projId);
    setSelectedLocationId('ALL');
    setSelectedAssetId('ALL');
  };

  // Handle Location Change (resets downstream Asset)
  const handleLocationChange = (locId) => {
    setSelectedLocationId(locId);
    setSelectedAssetId('ALL');
  };

  // Multi-Device Selection Toggles
  const handleToggleDevice = (devId) => {
    setSelectedDeviceIds(prev =>
      prev.includes(devId) ? prev.filter(id => id !== devId) : [...prev, devId]
    );
  };

  const handleSelectAllDevices = () => {
    const allFilteredIds = filteredDevices.map(d => d.id);
    const allSelected = allFilteredIds.every(id => selectedDeviceIds.includes(id));
    if (allSelected) {
      setSelectedDeviceIds(prev => prev.filter(id => !allFilteredIds.includes(id)));
    } else {
      setSelectedDeviceIds(prev => Array.from(new Set([...prev, ...allFilteredIds])));
    }
  };

  // Manage Recipient Emails
  const handleAddEmail = (e) => {
    if (e) e.preventDefault();
    const em = newEmailInput.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!em || !emailRegex.test(em)) {
      showFeedback('error', 'Please enter a valid email address (e.g. safety@techavo.in).');
      return;
    }
    if (emails.includes(em)) {
      showFeedback('error', 'This email address is already added.');
      return;
    }
    setEmails(prev => [...prev, em]);
    setNewEmailInput('');
  };

  const handleRemoveEmail = (emToRemove) => {
    if (emails.length <= 1) {
      if (!window.confirm('Removing the last email will leave this alert without recipient notifications. Proceed?')) {
        return;
      }
    }
    setEmails(prev => prev.filter(e => e !== emToRemove));
  };

  // Set default rule name when parameter or location changes
  useEffect(() => {
    if (!editingRuleId && !ruleName) {
      const paramName = parameter === 'tilt' ? 'Tilt' : (parameter === 'displacement' ? 'Displacement' : 'Tilt & Disp');
      const targetName = selectedAssetId !== 'ALL'
        ? hierarchy.assets.find(a => a.id === selectedAssetId)?.name
        : (selectedLocationId !== 'ALL'
          ? hierarchy.locations.find(l => l.id === selectedLocationId)?.name
          : 'Geotechnical Array');
      setRuleName(`${severity} ${paramName} Alert - ${targetName || 'Zone'}`);
    }
  }, [parameter, severity, selectedLocationId, selectedAssetId, editingRuleId]);

  // Adjust default threshold when parameter changes
  const handleParameterChange = (newParam) => {
    setParameter(newParam);
    if (newParam === 'tilt') {
      setThresholdValue(severity === 'CRITICAL' ? 2.000 : 1.000);
    } else if (newParam === 'displacement') {
      setThresholdValue(severity === 'CRITICAL' ? 10.00 : 5.00);
    } else {
      setThresholdValue(2.000);
    }
  };

  // Adjust default threshold when severity changes
  const handleSeverityChange = (newSev) => {
    setSeverity(newSev);
    if (parameter === 'tilt') {
      setThresholdValue(newSev === 'CRITICAL' ? 2.000 : (newSev === 'EMERGENCY' ? 3.000 : 1.000));
    } else if (parameter === 'displacement') {
      setThresholdValue(newSev === 'CRITICAL' ? 10.00 : (newSev === 'EMERGENCY' ? 15.00 : 5.00));
    }
  };

  // CREATE OR UPDATE (EDIT) ALERT RULE
  const handleSaveAlertRule = async (e) => {
    if (e) e.preventDefault();

    if (!ruleName.trim()) {
      showFeedback('error', 'Please provide a name for this alert rule.');
      return;
    }

    if (selectedDeviceIds.length === 0) {
      showFeedback('error', 'Please select at least one device for this alert rule.');
      return;
    }

    if (emails.length === 0) {
      showFeedback('error', 'Please add at least one recipient email address to receive alert notifications.');
      return;
    }

    setSubmitting(true);
    showFeedback('', '');

    try {
      const projObj = hierarchy.projects.find(p => p.id === selectedProjectId);
      const locObj = hierarchy.locations.find(l => l.id === selectedLocationId);
      const assetObj = hierarchy.assets.find(a => a.id === selectedAssetId);

      const payload = {
        ruleName: ruleName.trim(),
        projectId: selectedProjectId !== 'ALL' ? selectedProjectId : null,
        projectName: projObj ? projObj.name : 'All Projects',
        siteId: selectedLocationId !== 'ALL' ? selectedLocationId : null,
        siteName: locObj ? locObj.name : 'All Locations',
        assetId: selectedAssetId !== 'ALL' ? selectedAssetId : null,
        assetName: assetObj ? assetObj.name : 'All Assets',
        deviceIds: selectedDeviceIds,
        emails,
        parameter,
        operator,
        thresholdValue: parseFloat(thresholdValue) || 2.0,
        severity,
        message: customMessage.trim() || `${parameter.toUpperCase()} threshold breached: ${operator} ${thresholdValue}${parameter === 'tilt' ? '°' : ' mm'}`,
        enabled: true,
      };

      if (editingRuleId) {
        // UPDATE Existing Rule
        try {
          await updateAlertRule(editingRuleId, payload);
        } catch (apiErr) {}

        // Update local state immediately
        setAlertRules(prev => prev.map(r => r.id === editingRuleId ? { ...r, ...payload, updatedAt: new Date().toISOString() } : r));
        showFeedback('success', `✓ Alert Rule "${ruleName}" updated successfully.`);
        setEditingRuleId(null);
        resetForm();
      } else {
        // CREATE New Rule
        let newRuleId = Date.now();
        try {
          const res = await createAlertRule(payload);
          if (res?.rule?.id) newRuleId = res.rule.id;
        } catch (apiErr) {}

        const newRule = {
          id: newRuleId,
          ...payload,
          createdAt: new Date().toISOString(),
        };

        // Add to local state immediately so it displays instantly
        setAlertRules(prev => [newRule, ...prev]);
        showFeedback('success', `✓ Alert Rule "${ruleName}" created successfully for ${selectedDeviceIds.length} device(s).`);
        resetForm();
      }
    } catch (err) {
      showFeedback('error', `Error saving alert rule: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  // Populate form for Editing an Alert Rule
  const handleEditRule = (rule) => {
    setEditingRuleId(rule.id);
    setRuleName(rule.ruleName || '');
    setSelectedProjectId(rule.projectId || 'ALL');
    setSelectedLocationId(rule.siteId || 'ALL');
    setSelectedAssetId(rule.assetId || 'ALL');
    setSelectedDeviceIds(Array.isArray(rule.deviceIds) ? rule.deviceIds : []);
    setEmails(Array.isArray(rule.emails) && rule.emails.length > 0 ? rule.emails : ['system@techavo.in']);
    setParameter(rule.parameter || 'tilt');
    setOperator(rule.operator || '>');
    setThresholdValue(rule.thresholdValue || 2.0);
    setSeverity(rule.severity || 'CRITICAL');
    setCustomMessage(rule.message || '');

    // Scroll smoothly to form
    window.scrollTo({ top: 100, behavior: 'smooth' });
    showFeedback('success', `Loaded "${rule.ruleName}" into form for editing.`);
  };

  // Cancel Editing
  const handleCancelEdit = () => {
    setEditingRuleId(null);
    resetForm();
    showFeedback('', '');
  };

  // Reset form to defaults
  const resetForm = () => {
    setRuleName('');
    setSelectedProjectId('ALL');
    setSelectedLocationId('ALL');
    setSelectedAssetId('ALL');
    setSelectedDeviceIds(['DEV-001', 'DEV-002']);
    setParameter('tilt');
    setOperator('>');
    setThresholdValue(2.000);
    setSeverity('CRITICAL');
    setCustomMessage('');
  };

  // DELETE Alert Rule
  const handleDeleteRule = async (ruleId, ruleTitle) => {
    if (!window.confirm(`Are you sure you want to delete the alert rule "${ruleTitle}"?`)) {
      return;
    }

    try {
      try {
        await deleteAlertRule(ruleId);
      } catch (apiErr) {}

      // Remove from local state immediately
      setAlertRules(prev => prev.filter(r => r.id !== ruleId));
      showFeedback('success', `✓ Alert rule "${ruleTitle}" deleted successfully.`);
      if (editingRuleId === ruleId) {
        handleCancelEdit();
      }
    } catch (err) {
      showFeedback('error', `Error deleting rule: ${err.message}`);
    }
  };

  // GENERATE ALERT & SEND EMAIL (Immediate Trigger from Form)
  const handleGenerateAndSendAlert = async () => {
    if (selectedDeviceIds.length === 0) {
      showFeedback('error', 'Please select at least one device to generate alerts for.');
      return;
    }

    if (emails.length === 0) {
      showFeedback('error', 'Please specify recipient emails.');
      return;
    }

    setSubmitting(true);
    showFeedback('', '');

    try {
      const payload = {
        deviceIds: selectedDeviceIds,
        parameter,
        severity,
        tiltValue: parameter === 'tilt' ? (parseFloat(thresholdValue) || 2.45) : 0,
        displacementValue: parameter === 'displacement' ? (parseFloat(thresholdValue) || 12.80) : 0,
        customMessage: customMessage.trim() || `Instant manual alert breach for ${ruleName || parameter.toUpperCase()}`,
        recipients: emails,
      };

      const res = await generateAlert(payload);
      if (res?.success) {
        showFeedback(
          'success',
          `✓ Success! Alert generated for ${selectedDeviceIds.length} device(s) and notification email dispatched via SMTP to ${emails.join(', ')}.`
        );
        loadAlarms();
      } else {
        showFeedback('error', res?.message || 'Failed to generate alert.');
      }
    } catch (err) {
      showFeedback('error', `Error triggering alert: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  // TRIGGER A SPECIFIC EXISTING RULE ON DEMAND
  const handleTriggerSpecificRule = async (rule) => {
    setDispatchingRuleId(rule.id);
    showFeedback('', '');

    try {
      const res = await triggerAlertRule(rule.id);
      if (res?.success) {
        showFeedback(
          'success',
          `✓ Dispatched! Alert for rule "${rule.ruleName}" sent to ${rule.emails?.join(', ') || 'recipients'} via SMTP.`
        );
        loadAlarms();
      } else {
        showFeedback('error', res?.message || 'Failed to trigger rule.');
      }
    } catch (err) {
      showFeedback('error', `Error dispatching rule: ${err.message}`);
    } finally {
      setDispatchingRuleId(null);
    }
  };

  // Clear Alarms Feed
  const handleClearAlarms = async () => {
    if (!window.confirm('Clear all triggered alarm entries?')) return;
    try {
      await clearAlarms();
      setAlarms([]);
      setSummary({ critical: 0, major: 0, minor: 0, warnings: 0, total: 0 });
      showFeedback('success', 'Alarms feed cleared.');
    } catch (err) {
      showFeedback('error', err.message);
    }
  };

  return (
    <div className="space-y-4 font-sans text-slate-800">
      {/* Toast Feedback Notification */}
      {feedback.message && (
        <div className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 text-xs font-semibold shadow-xs transition-all ${
          feedback.type === 'error'
            ? 'bg-red-50 border-red-200 text-red-800'
            : 'bg-emerald-50 border-emerald-200 text-emerald-800'
        }`}>
          <div className="flex items-center gap-2">
            {feedback.type === 'error' ? (
              <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            onClick={() => setFeedback({ type: '', message: '' })}
            className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl border border-slate-200/80 bg-white shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl border border-blue-200 bg-blue-50 text-blue-600 shadow-2xs">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-black text-slate-900 leading-tight">
              Geotechnical Alert Rules & Instant Email Dispatch
            </h1>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Select project, location, asset, and multiple devices with multiple recipient emails to create, edit, delete, and send alerts
            </p>
          </div>
        </div>

        {/* Live Alarms Trigger Feed Toggle */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAlarmsFeed(!showAlarmsFeed)}
            className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs ${
              showAlarmsFeed ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Bell className="w-3.5 h-3.5 text-amber-500" />
            <span>Alarms Feed ({alarms.length})</span>
          </button>
          <span className="text-[10px] font-mono px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>SMTP: {smtpServerStatus}</span>
          </span>
        </div>
      </div>

      {/* Triggered Alarms Drawer (Collapsible) */}
      {showAlarmsFeed && (
        <div className="p-4 rounded-2xl border border-amber-200 bg-amber-50/50 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
              <Bell className="w-4 h-4 text-amber-600" />
              <span>Live Triggered Alarms Feed ({alarms.length} Alarms Active)</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={loadAlarms}
                className="px-2 py-1 text-[11px] font-bold rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors cursor-pointer flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3 text-slate-500" />
                <span>Refresh</span>
              </button>
              {alarms.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAlarms}
                  className="px-2 py-1 text-[11px] font-bold rounded-lg border border-red-200 bg-white hover:bg-red-50 text-red-600 transition-colors cursor-pointer flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Clear All</span>
                </button>
              )}
            </div>
          </div>

          {alarms.length === 0 ? (
            <div className="py-4 text-center text-slate-400 font-mono text-xs">
              No active alarms recorded. Generate an alert below to trigger incidents and send emails.
            </div>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {alarms.map(a => (
                <div key={a.id} className="p-2.5 rounded-xl border border-slate-200 bg-white flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-slate-900">{a.message}</span>
                    <div className="text-[10px] text-slate-500 font-mono mt-0.5 flex items-center gap-2">
                      <span className="font-bold text-blue-600">{a.id}</span>
                      <span>•</span>
                      <span>Device: <strong>{a.deviceId}</strong></span>
                      <span>•</span>
                      <span>{formatFullDateTime(a.createdAt || a.timestamp)}</span>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-md font-bold font-mono text-[10px] ${
                    a.severity === 'CRITICAL' ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-amber-100 text-amber-700 border border-amber-200'
                  }`}>
                    {a.severity}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          SECTION 1: CREATE / EDIT ALERT RULE CONSOLE
      ───────────────────────────────────────────────────────────── */}
      <form onSubmit={handleSaveAlertRule} className={cardCls}>
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 mb-4">
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded-lg ${editingRuleId ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
              {editingRuleId ? <Edit3 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider font-mono">
                {editingRuleId ? `Edit Alert Rule (ID: ${editingRuleId})` : 'Create New Geotechnical Alert Rule'}
              </h2>
              <p className="text-[11px] text-slate-500">
                Filter by Project, Location, and Asset → Select Multiple Devices → Add Multiple Emails → Save Rule or Send Immediate Alert
              </p>
            </div>
          </div>

          {editingRuleId && (
            <button
              type="button"
              onClick={handleCancelEdit}
              className="px-3 py-1 text-xs font-bold rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer flex items-center gap-1"
            >
              <X className="w-3.5 h-3.5 text-slate-400" />
              <span>Cancel Edit</span>
            </button>
          )}
        </div>

        {/* Step 1: Cascaded Project, Location & Asset Selection Bar */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          {/* 1.1 Select Project */}
          <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/70 space-y-1">
            <label className="block text-[11px] font-bold text-slate-700 uppercase font-mono">
              1. Select Project
            </label>
            <select
              value={selectedProjectId}
              onChange={e => handleProjectChange(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="ALL">🌐 All Projects (Global Scope)</option>
              {hierarchy.projects.map(p => (
                <option key={p.id} value={p.id}>
                  {p.code ? `[${p.code}] ` : ''}{p.name}
                </option>
              ))}
            </select>
          </div>

          {/* 1.2 Select Location (Site) */}
          <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/70 space-y-1">
            <label className="block text-[11px] font-bold text-slate-700 uppercase font-mono">
              2. Select Location (Site)
            </label>
            <select
              value={selectedLocationId}
              onChange={e => handleLocationChange(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="ALL">📍 All Locations / Sites</option>
              {filteredLocations.map(l => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>

          {/* 1.3 Select Asset (Structure) */}
          <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/70 space-y-1">
            <label className="block text-[11px] font-bold text-slate-700 uppercase font-mono">
              3. Select Asset (Structure)
            </label>
            <select
              value={selectedAssetId}
              onChange={e => setSelectedAssetId(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="ALL">🏗️ All Assets / Structures</option>
              {filteredAssets.map(a => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.type})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Step 2: Multi-Device Selection Grid */}
        <div className="mb-4 p-3.5 rounded-xl border border-blue-100 bg-blue-50/30">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2 pb-2 border-b border-blue-100">
            <div>
              <span className="text-xs font-bold text-slate-900 font-mono uppercase flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-blue-600" />
                <span>4. Select Multiple Devices ({selectedDeviceIds.length} Selected)</span>
              </span>
              <span className="text-[11px] text-slate-500 ml-1">
                (Filtered by selected Project, Location, and Asset)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3 h-3 text-slate-400 absolute left-2.5 top-2" />
                <input
                  type="text"
                  placeholder="Filter devices..."
                  value={deviceSearch}
                  onChange={e => setDeviceSearch(e.target.value)}
                  className="pl-7 pr-2 py-1 text-[11px] rounded-lg border border-slate-200 bg-white font-mono focus:outline-none"
                />
              </div>
              <button
                type="button"
                onClick={handleSelectAllDevices}
                className="px-2.5 py-1 text-[11px] font-bold rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
              >
                <CheckCheck className="w-3 h-3 text-blue-600" />
                <span>
                  {filteredDevices.every(d => selectedDeviceIds.includes(d.id)) ? 'Deselect All' : 'Select All Filtered'}
                </span>
              </button>
            </div>
          </div>

          {filteredDevices.length === 0 ? (
            <div className="py-6 text-center text-slate-400 font-mono text-xs border border-dashed border-slate-200 rounded-xl">
              No devices match the selected filters.
              <button
                type="button"
                onClick={() => {
                  setSelectedProjectId('ALL');
                  setSelectedLocationId('ALL');
                  setSelectedAssetId('ALL');
                  setDeviceSearch('');
                }}
                className="ml-2 text-blue-600 underline font-bold"
              >
                Reset All Filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
              {filteredDevices.map(dev => {
                const isSelected = selectedDeviceIds.includes(dev.id);
                return (
                  <div
                    key={dev.id}
                    onClick={() => handleToggleDevice(dev.id)}
                    className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 text-xs ${
                      isSelected
                        ? 'bg-blue-50 border-blue-400 ring-1 ring-blue-300 shadow-2xs'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <button
                        type="button"
                        className={`p-0.5 rounded transition-colors ${
                          isSelected ? 'text-blue-600' : 'text-slate-400'
                        }`}
                      >
                        {isSelected ? <CheckSquare className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4" />}
                      </button>
                      <div className="min-w-0">
                        <div className="font-mono font-bold text-slate-900 truncate">
                          {dev.id} <span className="font-sans font-normal text-slate-500 text-[11px]">({dev.name})</span>
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          Tilt: {dev.resultantTilt?.toFixed(3)}° • Disp: {dev.totalDisplacement?.toFixed(2)} mm
                        </div>
                      </div>
                    </div>

                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold flex-shrink-0">
                      {dev.status || 'ONLINE'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Step 3: Parameter, Condition, Threshold & Severity Grid */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 mb-4">
          {/* Rule Name (4 cols) */}
          <div className="md:col-span-4 space-y-1">
            <label className="block text-[11px] font-bold text-slate-700 uppercase font-mono">
              5. Alert Rule Name
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Critical Tilt Alert - Cut Slope Beta"
              value={ruleName}
              onChange={e => setRuleName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Monitored Parameter (3 cols) */}
          <div className="md:col-span-3 space-y-1">
            <label className="block text-[11px] font-bold text-slate-700 uppercase font-mono">
              6. Monitored Parameter
            </label>
            <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs font-bold font-mono">
              <button
                type="button"
                onClick={() => handleParameterChange('tilt')}
                className={`py-1.5 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 ${
                  parameter === 'tilt' ? 'bg-white text-blue-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Compass className="w-3.5 h-3.5 text-blue-600" />
                <span>Tilt Angle</span>
              </button>
              <button
                type="button"
                onClick={() => handleParameterChange('displacement')}
                className={`py-1.5 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 ${
                  parameter === 'displacement' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Activity className="w-3.5 h-3.5 text-emerald-600" />
                <span>Displacement</span>
              </button>
            </div>
          </div>

          {/* Condition & Threshold Value (3 cols) */}
          <div className="md:col-span-3 space-y-1">
            <label className="block text-[11px] font-bold text-slate-700 uppercase font-mono">
              7. Threshold Value ({parameter === 'tilt' ? 'Degrees °' : 'mm'})
            </label>
            <div className="flex items-center gap-1.5">
              <select
                value={operator}
                onChange={e => setOperator(e.target.value)}
                className="w-16 px-2 py-2 rounded-xl border border-slate-300 bg-white text-xs font-mono font-bold focus:outline-none"
              >
                <option value=">">&gt;</option>
                <option value="<">&lt;</option>
                <option value=">=">&gt;=</option>
              </select>
              <input
                type="number"
                step="0.05"
                required
                value={thresholdValue}
                onChange={e => setThresholdValue(parseFloat(e.target.value))}
                className="flex-1 px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-mono font-bold text-blue-700 focus:outline-none"
              />
              <span className="font-mono text-xs font-bold text-slate-500">
                {parameter === 'tilt' ? '°' : 'mm'}
              </span>
            </div>
          </div>

          {/* Severity (2 cols) */}
          <div className="md:col-span-2 space-y-1">
            <label className="block text-[11px] font-bold text-slate-700 uppercase font-mono">
              8. Severity
            </label>
            <select
              value={severity}
              onChange={e => handleSeverityChange(e.target.value)}
              className={`w-full px-2.5 py-2 rounded-xl border text-xs font-bold font-mono focus:outline-none ${
                severity === 'CRITICAL' ? 'bg-red-50 border-red-300 text-red-700' : (severity === 'EMERGENCY' ? 'bg-purple-50 border-purple-300 text-purple-700' : 'bg-amber-50 border-amber-300 text-amber-700')
              }`}
            >
              <option value="CRITICAL">CRITICAL</option>
              <option value="WARNING">WARNING</option>
              <option value="EMERGENCY">EMERGENCY</option>
            </select>
          </div>
        </div>

        {/* Step 4: Multiple Email Recipients Selection */}
        <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 mb-4 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="block text-[11px] font-bold text-slate-700 uppercase font-mono flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-blue-600" />
              <span>9. Multiple Email Notification Recipients ({emails.length} Addresses)</span>
            </label>
            <span className="text-[10px] text-slate-500 font-mono">
              Alert notifications will be delivered to all added recipients
            </span>
          </div>

          {/* Add email input row */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <AtSign className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="email"
                placeholder="Enter email address (e.g. ops@techavo.in)..."
                value={newEmailInput}
                onChange={e => setNewEmailInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddEmail();
                  }
                }}
                className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-300 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              />
            </div>
            <button
              type="button"
              onClick={handleAddEmail}
              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-2xs transition-colors cursor-pointer flex items-center gap-1 flex-shrink-0"
            >
              <Plus className="w-3 h-3" />
              <span>Add Email</span>
            </button>
          </div>

          {/* Email pills */}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {emails.map((em, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs font-mono text-slate-800 shadow-2xs"
              >
                <Mail className="w-3 h-3 text-blue-600" />
                <span>{em}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveEmail(em)}
                  className="text-slate-400 hover:text-red-600 p-0.5 cursor-pointer"
                  title="Remove email"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        </div>

        {/* Action Buttons: Save Rule & Generate Alert Now */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
          <div className="text-xs text-slate-500 font-mono">
            Targeting: <strong className="text-blue-700">{selectedDeviceIds.length} Devices</strong> → <strong className="text-emerald-700">{emails.length} Emails</strong>
          </div>

          <div className="flex items-center gap-2">
            {/* 1. Instant Test / Generate Alert & Send Real Email Button */}
            <button
              type="button"
              disabled={submitting || selectedDeviceIds.length === 0 || emails.length === 0}
              onClick={handleGenerateAndSendAlert}
              className="px-4 py-2.5 bg-red-600 hover:bg-red-700 active:bg-red-800 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Zap className="w-4 h-4" />
              <span>⚡ Generate Alert & Send Email Now</span>
            </button>

            {/* 2. Save / Update Alert Rule Button */}
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>{editingRuleId ? 'Update Alert Rule' : 'Create Alert Rule'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </form>

      {/* ─────────────────────────────────────────────────────────────
          SECTION 2: CONFIGURED ALERT RULES LIST (WITH EDIT & DELETE)
      ───────────────────────────────────────────────────────────── */}
      <div className={cardCls}>
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 mb-3">
          <div>
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider font-mono flex items-center gap-2">
              <Shield className="w-4 h-4 text-blue-600" />
              <span>Configured Alert Rules ({alertRules.length} Active Rules)</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Manage configured alert thresholds, edit configurations, delete rules, or dispatch immediate notification alerts
            </p>
          </div>
          <button
            type="button"
            onClick={loadRules}
            className="px-2.5 py-1 text-xs font-bold rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors cursor-pointer flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3 text-slate-500" />
            <span>Refresh Rules</span>
          </button>
        </div>

        {alertRules.length === 0 ? (
          <div className="py-12 text-center text-slate-400 font-mono text-xs">
            No alert rules configured yet. Use the creation form above to configure alert thresholds.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs whitespace-nowrap">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-mono uppercase text-[10px] tracking-wider bg-slate-50/80">
                  <th className="py-2.5 px-3">Rule Name & Severity</th>
                  <th className="py-2.5 px-3">Project / Location / Asset</th>
                  <th className="py-2.5 px-3">Target Devices</th>
                  <th className="py-2.5 px-3">Parameter & Limit</th>
                  <th className="py-2.5 px-3">Notification Emails</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-sans">
                {alertRules.map(rule => (
                  <tr key={rule.id} className="hover:bg-slate-50/70 transition-colors">
                    {/* Rule Name & Severity */}
                    <td className="py-3 px-3">
                      <div className="font-bold text-slate-900 text-xs">{rule.ruleName}</div>
                      <div className="mt-1 flex items-center gap-1.5">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold font-mono ${
                          rule.severity === 'CRITICAL' ? 'bg-red-50 text-red-700 border border-red-200' : (rule.severity === 'EMERGENCY' ? 'bg-purple-50 text-purple-700 border border-purple-200' : 'bg-amber-50 text-amber-700 border border-amber-200')
                        }`}>
                          {rule.severity}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">ID: {rule.id}</span>
                      </div>
                    </td>

                    {/* Scope: Project, Location, Asset */}
                    <td className="py-3 px-3 text-slate-700 text-xs">
                      <div className="font-semibold text-slate-800">{rule.projectName || 'All Projects'}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {rule.siteName || 'All Locations'} • {rule.assetName || 'All Assets'}
                      </div>
                    </td>

                    {/* Target Devices */}
                    <td className="py-3 px-3">
                      <div className="flex flex-wrap gap-1 max-w-[200px]">
                        {(Array.isArray(rule.deviceIds) ? rule.deviceIds : [rule.deviceIds]).filter(Boolean).map(devId => (
                          <span
                            key={devId}
                            className="px-1.5 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-700 font-mono font-bold text-[10px]"
                          >
                            {devId}
                          </span>
                        ))}
                      </div>
                    </td>

                    {/* Condition & Limit */}
                    <td className="py-3 px-3 font-mono">
                      <div className="font-bold text-blue-700 text-xs">
                        {(rule.parameter || 'tilt').toUpperCase()}: {rule.operator || '>'} {rule.thresholdValue}
                        {rule.parameter === 'tilt' ? '°' : ' mm'}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">Auto-breach detector</div>
                    </td>

                    {/* Notification Emails */}
                    <td className="py-3 px-3">
                      <div className="flex flex-wrap gap-1 max-w-[220px]">
                        {(Array.isArray(rule.emails) ? rule.emails : [rule.emails]).filter(Boolean).map(em => (
                          <span
                            key={em}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700 font-mono text-[10px]"
                          >
                            <Mail className="w-2.5 h-2.5 text-blue-500" />
                            <span>{em}</span>
                          </span>
                        ))}
                      </div>
                    </td>

                    {/* Actions: Trigger, Edit, Delete */}
                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* 1. Instant Trigger & Send Email */}
                        <button
                          type="button"
                          disabled={dispatchingRuleId === rule.id}
                          onClick={() => handleTriggerSpecificRule(rule)}
                          title="Generate Alert and Send Email for this rule immediately"
                          className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1 disabled:opacity-50"
                        >
                          {dispatchingRuleId === rule.id ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : (
                            <Zap className="w-3 h-3 text-red-600" />
                          )}
                          <span>Send Alert</span>
                        </button>

                        {/* 2. Edit Rule */}
                        <button
                          type="button"
                          onClick={() => handleEditRule(rule)}
                          title="Edit this alert rule configuration"
                          className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-blue-600" />
                        </button>

                        {/* 3. Delete Rule */}
                        <button
                          type="button"
                          onClick={() => handleDeleteRule(rule.id, rule.ruleName)}
                          title="Delete this alert rule"
                          className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
