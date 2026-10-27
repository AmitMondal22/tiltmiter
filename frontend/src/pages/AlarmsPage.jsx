import React, { useState, useEffect, useMemo } from 'react';
import {
  Bell, Mail, Plus, Trash2, Edit, Send, CheckCircle2, AlertTriangle,
  ShieldAlert, RefreshCw, X, Search, Check, Filter, Info, Eye, Layers,
  ChevronRight, Radio, ExternalLink, Zap
} from 'lucide-react';
import {
  getAlertRules,
  createAlertRule,
  updateAlertRule,
  deleteAlertRule,
  triggerAlertRule,
  getAlarmDevices,
  getAlarms,
  clearAlarms
} from '../api/apiClient';
import { useAuth } from '../context/AuthContext';

export default function AlarmsPage() {
  const cardCls = 'rounded-2xl border border-slate-200 bg-white p-5 text-black shadow-xs';
  const { user } = useAuth();

  // Active view tab: 'rules' | 'feed' (Direct Instant Alert Dispatch removed per requirement)
  const [activeTab, setActiveTab] = useState('rules');

  // Data states
  const [rules, setRules] = useState([]);
  const [devices, setDevices] = useState([]);
  const [alarms, setAlarms] = useState([]);
  const [summary, setSummary] = useState({ critical: 0, major: 0, minor: 0, total: 0 });
  const [loading, setLoading] = useState(false);
  const [triggeringId, setTriggeringId] = useState(null);

  // Notification message toast
  const [toast, setToast] = useState({ type: '', text: '' });
  const showToast = (type, text) => {
    setToast({ type, text });
    setTimeout(() => setToast({ type: '', text: '' }), 5000);
  };

  // ── Modal State for Create / Edit Alert Rule ──
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [savingRule, setSavingRule] = useState(false);

  // Form inputs
  const [formName, setFormName] = useState('');
  const [formParam, setFormParam] = useState('tilt'); // 'tilt' | 'displacement'
  const [formOperator, setFormOperator] = useState('>');
  // 3 Severity Level Threshold Values
  const [formCriticalThreshold, setFormCriticalThreshold] = useState('2.000');
  const [formWarningThreshold, setFormWarningThreshold] = useState('1.000');
  const [formInfoThreshold, setFormInfoThreshold] = useState('0.500');
  const [formSeverity, setFormSeverity] = useState('CRITICAL');
  const [formMessage, setFormMessage] = useState('');
  const [formDeviceIds, setFormDeviceIds] = useState([]);
  const [formEmails, setFormEmails] = useState([]);
  const [emailInput, setEmailInput] = useState('');
  const [deviceSearchQuery, setDeviceSearchQuery] = useState('');

  // Fetch initial data
  const loadAllData = async () => {
    setLoading(true);
    try {
      const [rulesRes, devicesRes, alarmsRes] = await Promise.all([
        getAlertRules().catch(() => ({ rules: [] })),
        getAlarmDevices().catch(() => ({ devices: [] })),
        getAlarms().catch(() => ({ alarms: [], summary: { critical: 0, major: 0, minor: 0, total: 0 } })),
      ]);

      setRules(Array.isArray(rulesRes?.rules) ? rulesRes.rules : []);
      setDevices(Array.isArray(devicesRes?.devices) ? devicesRes.devices : []);
      setAlarms(Array.isArray(alarmsRes?.alarms) ? alarmsRes.alarms : []);
      if (alarmsRes?.summary) {
        setSummary(alarmsRes.summary);
      }
    } catch (err) {
      console.error('Error fetching alarm data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  // Filter devices so that only devices belonging to the logged-in user are shown
  const userScopedDevices = useMemo(() => {
    if (!devices || devices.length === 0) return [];
    if (!user || user.role === 'SUPER_ADMIN') {
      return devices;
    }

    return devices.filter(dev => {
      // 1. Explicit allowed device IDs
      if (user.scopeType === 'SELECTED_DEVICES' && Array.isArray(user.allowedDeviceIds) && user.allowedDeviceIds.length > 0) {
        return user.allowedDeviceIds.includes(dev.id);
      }
      // 2. Explicit allowed site IDs
      if (user.scopeType === 'SELECTED_SITES' && Array.isArray(user.allowedSiteIds) && user.allowedSiteIds.length > 0) {
        return user.allowedSiteIds.includes(dev.siteId) || user.allowedSiteIds.includes(dev.SiteId);
      }
      // 3. Site-level assignment
      if (user.siteId && (dev.siteId || dev.SiteId)) {
        return String(dev.siteId || dev.SiteId) === String(user.siteId);
      }
      // 4. Project-level assignment
      if (user.projectId && (dev.projectId || dev.ProjectId)) {
        return String(dev.projectId || dev.ProjectId) === String(user.projectId);
      }
      // 5. Organization-level assignment
      if (user.organizationId && (dev.organizationId || dev.OrganizationId)) {
        return String(dev.organizationId || dev.OrganizationId) === String(user.organizationId);
      }
      return true;
    });
  }, [devices, user]);

  // Update default 3 severity thresholds when parameter changes
  const handleParamChange = (newParam) => {
    setFormParam(newParam);
    if (newParam === 'tilt') {
      setFormCriticalThreshold('2.000');
      setFormWarningThreshold('1.000');
      setFormInfoThreshold('0.500');
    } else {
      setFormCriticalThreshold('10.00');
      setFormWarningThreshold('5.00');
      setFormInfoThreshold('2.00');
    }
  };

  // Open Create Modal - Only pre-select logged-in user devices
  const handleOpenCreateModal = () => {
    setEditingRule(null);
    setFormName('');
    setFormParam('tilt');
    setFormOperator('>');
    setFormCriticalThreshold('2.000');
    setFormWarningThreshold('1.000');
    setFormInfoThreshold('0.500');
    setFormSeverity('CRITICAL');
    setFormMessage('');
    // Pre-select first 2 devices belonging to logged-in user if available
    setFormDeviceIds(userScopedDevices.slice(0, 2).map(d => d.id));
    // Clear recipient email list so superadmin@tiltmeter.io is never pre-filled
    setFormEmails([]);
    setEmailInput('');
    setDeviceSearchQuery('');
    setModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEditModal = (rule) => {
    setEditingRule(rule);
    setFormName(rule.ruleName || '');
    setFormParam(rule.parameter || 'tilt');
    setFormOperator(rule.operator || '>');
    const isTilt = (rule.parameter || 'tilt') === 'tilt';
    setFormCriticalThreshold(String(rule.criticalThreshold ?? rule.thresholdValue ?? (isTilt ? '2.000' : '10.00')));
    setFormWarningThreshold(String(rule.warningThreshold ?? (isTilt ? '1.000' : '5.00')));
    setFormInfoThreshold(String(rule.infoThreshold ?? (isTilt ? '0.500' : '2.00')));
    setFormSeverity(rule.severity || 'CRITICAL');
    setFormMessage(rule.message || '');
    // Ensure only user-scoped devices are selectable
    const validIds = Array.isArray(rule.deviceIds)
      ? rule.deviceIds.filter(id => userScopedDevices.some(d => d.id === id))
      : [];
    setFormDeviceIds(validIds.length > 0 ? validIds : userScopedDevices.slice(0, 1).map(d => d.id));
    const cleanEmails = (Array.isArray(rule.emails) ? rule.emails : [])
      .filter(e => typeof e === 'string' && !e.toLowerCase().includes('tiltmeter.io'));
    setFormEmails(cleanEmails);
    setEmailInput('');
    setDeviceSearchQuery('');
    setModalOpen(true);
  };

  // Add Email to Recipient List
  const handleAddEmail = () => {
    const clean = emailInput.trim().toLowerCase();
    if (!clean) return;
    if (clean.includes('tiltmeter.io')) {
      showToast('error', 'tiltmeter.io domain email address is not permitted.');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(clean)) {
      showToast('error', 'Please enter a valid email address.');
      return;
    }

    if (!formEmails.includes(clean)) {
      setFormEmails([...formEmails, clean]);
    }
    setEmailInput('');
  };

  const handleRemoveEmail = (emailToRemove) => {
    setFormEmails(formEmails.filter(e => e !== emailToRemove));
  };

  // Toggle Device Selection in Modal Form
  const handleToggleDevice = (deviceId) => {
    if (formDeviceIds.includes(deviceId)) {
      setFormDeviceIds(formDeviceIds.filter(id => id !== deviceId));
    } else {
      setFormDeviceIds([...formDeviceIds, deviceId]);
    }
  };

  // Save Alert Rule
  const handleSaveRule = async (andTrigger = false) => {
    if (!formName.trim()) {
      showToast('error', 'Please enter an alert rule name.');
      return;
    }
    if (formDeviceIds.length === 0) {
      showToast('error', 'Please select at least one device to monitor.');
      return;
    }
    const validEmails = formEmails.filter(e => typeof e === 'string' && !e.toLowerCase().includes('tiltmeter.io'));
    if (validEmails.length === 0) {
      showToast('error', 'Please add at least one recipient email address.');
      return;
    }

    const cVal = parseFloat(formCriticalThreshold) || (formParam === 'tilt' ? 2.0 : 10.0);
    const wVal = parseFloat(formWarningThreshold) || (formParam === 'tilt' ? 1.0 : 5.0);
    const iVal = parseFloat(formInfoThreshold) || (formParam === 'tilt' ? 0.5 : 2.0);

    setSavingRule(true);
    try {
      const payload = {
        ruleName: formName.trim(),
        parameter: formParam,
        operator: formOperator,
        thresholdValue: cVal,
        criticalThreshold: cVal,
        warningThreshold: wVal,
        infoThreshold: iVal,
        severity: formSeverity,
        message: formMessage.trim() || `${formParam.toUpperCase()} multi-level safety threshold configured on assigned inclinometer devices`,
        deviceIds: formDeviceIds,
        emails: validEmails,
        enabled: true,
      };

      let savedRuleId = editingRule?.id;

      if (editingRule) {
        await updateAlertRule(editingRule.id, payload);
        showToast('success', `Alert rule "${formName}" updated successfully.`);
      } else {
        // Create all 3 Severity Level Rules at a time (Critical, Warning, Info)
        const baseName = formName.trim();
        const unit = formParam === 'tilt' ? '°' : 'mm';

        const threeRules = [
          {
            ruleName: `${baseName} (Critical)`,
            severity: 'CRITICAL',
            thresholdValue: cVal,
            criticalThreshold: cVal,
            warningThreshold: wVal,
            infoThreshold: iVal,
            message: formMessage.trim() || `Critical ${formParam.toUpperCase()} threshold limit (${formOperator} ${cVal} ${unit}) exceeded`,
          },
          {
            ruleName: `${baseName} (Warning)`,
            severity: 'WARNING',
            thresholdValue: wVal,
            criticalThreshold: cVal,
            warningThreshold: wVal,
            infoThreshold: iVal,
            message: formMessage.trim() || `Warning ${formParam.toUpperCase()} threshold limit (${formOperator} ${wVal} ${unit}) exceeded`,
          },
          {
            ruleName: `${baseName} (Info)`,
            severity: 'INFO',
            thresholdValue: iVal,
            criticalThreshold: cVal,
            warningThreshold: wVal,
            infoThreshold: iVal,
            message: formMessage.trim() || `Advisory ${formParam.toUpperCase()} movement (${formOperator} ${iVal} ${unit}) detected`,
          },
        ];

        let firstCreatedRule = null;
        for (const rItem of threeRules) {
          const res = await createAlertRule({
            ...rItem,
            parameter: formParam,
            operator: formOperator,
            deviceIds: formDeviceIds,
            emails: validEmails,
            enabled: true,
          });
          if (!firstCreatedRule) firstCreatedRule = res?.rule;
        }

        savedRuleId = firstCreatedRule?.id;
        showToast('success', `All 3 Alert Rules (Critical, Warning, Info) created at a time successfully!`);
      }

      setModalOpen(false);
      await loadAllData();

      // If user clicked "Save & Send Test Alert Now"
      if (andTrigger && savedRuleId) {
        handleTriggerRule({ id: savedRuleId, ruleName: payload.ruleName, emails: payload.emails }, formSeverity);
      }
    } catch (err) {
      console.error('Save rule error:', err);
      showToast('error', err.message || 'Failed to save alert rule.');
    } finally {
      setSavingRule(false);
    }
  };

  // Delete Alert Rule
  const handleDeleteRule = async (rule) => {
    if (!window.confirm(`Are you sure you want to delete alert rule "${rule.ruleName}"?`)) {
      return;
    }
    try {
      await deleteAlertRule(rule.id);
      showToast('success', `Alert rule "${rule.ruleName}" deleted.`);
      loadAllData();
    } catch (err) {
      showToast('error', 'Failed to delete alert rule: ' + err.message);
    }
  };

  // Trigger Alert Rule on Demand (Sends Email & Logs Alarm)
  const handleTriggerRule = async (rule, targetSeverity = null) => {
    const sev = targetSeverity || rule.severity || 'CRITICAL';
    setTriggeringId(`${rule.id}_${sev}`);
    try {
      await triggerAlertRule(rule.id, { severity: sev });
      const emailList = Array.isArray(rule.emails) && rule.emails.length > 0
        ? rule.emails.join(', ')
        : 'configured recipients';

      showToast('success', `Alert (${sev}) triggered for "${rule.ruleName}"! Email dispatched via SMTP to: ${emailList}.`);
      loadAllData();
    } catch (err) {
      console.error('Trigger rule error:', err);
      showToast('error', 'Failed to dispatch alert: ' + (err.message || 'Email service error'));
    } finally {
      setTriggeringId(null);
    }
  };

  // Clear Alarms Feed
  const handleClearAlarms = async () => {
    if (!window.confirm('Are you sure you want to clear all alarms from the feed?')) return;
    try {
      await clearAlarms();
      showToast('success', 'Alarms feed cleared successfully.');
      loadAllData();
    } catch (err) {
      showToast('error', 'Failed to clear alarms: ' + err.message);
    }
  };

  // Filtered devices list for modal search (strictly limited to logged-in user devices)
  const filteredModalDevices = useMemo(() => {
    if (!deviceSearchQuery.trim()) return userScopedDevices;
    const q = deviceSearchQuery.toLowerCase();
    return userScopedDevices.filter(d =>
      d.id.toLowerCase().includes(q) || (d.name && d.name.toLowerCase().includes(q))
    );
  }, [userScopedDevices, deviceSearchQuery]);

  // Unique devices configured across all rules
  const totalMonitoredDevices = new Set(rules.flatMap(r => r.deviceIds || [])).size;
  // Unique emails across all rules
  const totalNotificationEmails = new Set(rules.flatMap(r => r.emails || [])).size;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 font-sans">
      {/* Toast Notification */}
      {toast.text && (
        <div className={`fixed top-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium transition-all duration-300 animate-slide-in ${
          toast.type === 'error'
            ? 'bg-rose-50 border-rose-200 text-rose-800'
            : 'bg-emerald-50 border-emerald-200 text-emerald-800'
        }`}>
          {toast.type === 'error' ? <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" /> : <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />}
          <span>{toast.text}</span>
          <button onClick={() => setToast({ type: '', text: '' })} className="ml-2 hover:opacity-75 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <div className="p-2 rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">Geotechnical Alert Rules & Instant Email Dispatch</h1>
                {user && (
                  <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[11px] font-mono border border-slate-200 font-semibold">
                    {user.username} ({user.role})
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Configure safety threshold rules across 3 severity levels, associate multi-device inclinometer arrays, and dispatch automated geotechnical emails.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={loadAllData}
            disabled={loading}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors cursor-pointer"
            title="Refresh rules & alarms"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={handleOpenCreateModal}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Create Alert Rule</span>
          </button>
        </div>
      </div>

      {/* Stats Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className={cardCls}>
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Active Rules</span>
            <Bell className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{rules.length}</div>
          <div className="text-[11px] text-slate-500 mt-1">3-Tier severity rules</div>
        </div>

        <div className={cardCls}>
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Monitored Devices</span>
            <Radio className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">
            {totalMonitoredDevices} <span className="text-xs font-normal text-slate-400">/ {userScopedDevices.length} user devices</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Logged-in user devices</div>
        </div>

        <div className={cardCls}>
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Recipient Emails</span>
            <Mail className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{totalNotificationEmails}</div>
          <div className="text-[11px] text-slate-500 mt-1">Unique alert subscribers</div>
        </div>

        <div className={cardCls}>
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Dispatched Alarms</span>
            <AlertTriangle className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{alarms.length}</div>
          <div className="text-[11px] text-slate-500 mt-1">
            <span className="text-rose-600 font-semibold">{summary.critical || 0} Critical</span> · <span className="text-amber-600 font-semibold">{summary.minor || 0} Warnings</span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs (Direct Instant Alert Dispatch removed) */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('rules')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'rules'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Bell className="w-3.5 h-3.5" />
          <span>Configured Alert Rules ({rules.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('feed')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'feed'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>Live Alarms History ({alarms.length})</span>
        </button>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* TAB 1: CONFIGURED ALERT RULES                                  */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'rules' && (
        <div className="space-y-4">
          {rules.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-xs">
              <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
                <ShieldAlert className="w-7 h-7" />
              </div>
              <h3 className="text-base font-bold text-slate-900 mb-1">No Alert Rules Configured</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto mb-6">
                Define your first geotechnical threshold rule across 3 severity levels and bind your inclinometers with instant email alerts.
              </p>
              <button
                onClick={handleOpenCreateModal}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Create First Alert Rule</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {rules.map((rule) => {
                const isCrit = rule.severity === 'CRITICAL' || rule.severity === 'EMERGENCY';
                const isWarn = rule.severity === 'WARNING' || rule.severity === 'MAJOR';
                const isInfo = rule.severity === 'INFO' || rule.severity === 'MINOR';
                const devCount = Array.isArray(rule.deviceIds) ? rule.deviceIds.length : 0;
                const ruleEmails = (Array.isArray(rule.emails) ? rule.emails : [])
                  .filter(e => typeof e === 'string' && !e.toLowerCase().includes('tiltmeter.io'));
                const emailCount = ruleEmails.length;
                const unit = rule.parameter === 'tilt' ? '°' : 'mm';
                const isTriggering = triggeringId && triggeringId.startsWith(`${rule.id}_`);

                return (
                  <div
                    key={rule.id}
                    className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between group"
                  >
                    <div>
                      {/* Card Header: Severity & Actions */}
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider ${
                          isCrit
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : isWarn
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-blue-50 text-blue-700 border border-blue-200'
                        }`}>
                          <span className={`w-2 h-2 rounded-full ${isCrit ? 'bg-rose-600 animate-pulse' : isWarn ? 'bg-amber-500' : 'bg-blue-500'}`} />
                          {rule.severity || 'CRITICAL'}
                        </span>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleOpenEditModal(rule)}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                            title="Edit rule parameters"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteRule(rule)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="Delete rule"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Rule Title */}
                      <h3 className="text-sm font-bold text-slate-900 mb-1 leading-snug group-hover:text-blue-600 transition-colors">
                        {rule.ruleName}
                      </h3>
                      <p className="text-xs text-slate-500 line-clamp-2 mb-3">
                        {rule.message || 'Automated email dispatch upon geotechnical movement breach.'}
                      </p>

                      {/* Threshold limit highlights */}
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1.5 font-mono text-xs mb-3">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-500 uppercase font-semibold">Parameter:</span>
                          <span className="font-bold text-slate-800 capitalize">
                            {rule.parameter === 'tilt' ? 'Resultant Tilt (°)' : 'Lateral Displacement (mm)'}
                          </span>
                        </div>

                        {rule.criticalThreshold !== undefined && rule.criticalThreshold !== null && (
                          <div className="flex items-center justify-between text-[11px] text-rose-700">
                            <span className="font-semibold">🔴 Critical limit:</span>
                            <span className="font-bold">{rule.operator || '>'} {Number(rule.criticalThreshold).toFixed(1)} {unit}</span>
                          </div>
                        )}

                        {rule.warningThreshold !== undefined && rule.warningThreshold !== null && (
                          <div className="flex items-center justify-between text-[11px] text-amber-700">
                            <span className="font-semibold">🟡 Warning limit:</span>
                            <span className="font-bold">{rule.operator || '>'} {Number(rule.warningThreshold).toFixed(1)} {unit}</span>
                          </div>
                        )}

                        {rule.infoThreshold !== undefined && rule.infoThreshold !== null && (
                          <div className="flex items-center justify-between text-[11px] text-blue-700">
                            <span className="font-semibold">🔵 Info limit:</span>
                            <span className="font-bold">{rule.operator || '>'} {Number(rule.infoThreshold).toFixed(1)} {unit}</span>
                          </div>
                        )}

                        {!rule.criticalThreshold && (
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-slate-500 font-semibold">Threshold:</span>
                            <span className="font-bold text-rose-600">{rule.operator || '>'} {rule.thresholdValue} {unit}</span>
                          </div>
                        )}
                      </div>

                      {/* Associated Devices & Email Pills */}
                      <div className="space-y-1.5 text-xs text-slate-600">
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-slate-500 font-medium">
                            <Radio className="w-3.5 h-3.5 text-blue-500" />
                            Target Devices:
                          </span>
                          <span className="font-bold font-mono text-slate-800">{devCount} Device{devCount !== 1 ? 's' : ''}</span>
                        </div>
                        {Array.isArray(rule.deviceIds) && rule.deviceIds.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-0.5">
                            {rule.deviceIds.slice(0, 4).map(id => (
                              <span key={id} className="px-2 py-0.5 rounded-md bg-blue-50/70 border border-blue-100 text-blue-700 font-mono text-[10px] font-semibold">
                                {id}
                              </span>
                            ))}
                            {rule.deviceIds.length > 4 && (
                              <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 font-mono text-[10px]">
                                +{rule.deviceIds.length - 4} more
                              </span>
                            )}
                          </div>
                        )}

                        <div className="flex items-center justify-between pt-1">
                          <span className="flex items-center gap-1.5 text-slate-500 font-medium">
                            <Mail className="w-3.5 h-3.5 text-purple-500" />
                            Recipients:
                          </span>
                          <span className="font-bold text-slate-800">{emailCount} Email{emailCount !== 1 ? 's' : ''}</span>
                        </div>
                        {ruleEmails.length > 0 && (
                          <div className="text-[11px] text-slate-500 truncate" title={ruleEmails.join(', ')}>
                            {ruleEmails.join(', ')}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Footer Trigger Actions */}
                    <div className="pt-4 border-t border-slate-100 mt-4 space-y-2">
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="text-[10px] uppercase font-bold text-slate-400">Trigger Alert:</span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleTriggerRule(rule, 'CRITICAL')}
                            disabled={isTriggering}
                            className="px-2 py-1 text-[10px] font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                            title="Dispatch critical alert now"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-600" />
                            Crit
                          </button>
                          <button
                            onClick={() => handleTriggerRule(rule, 'WARNING')}
                            disabled={isTriggering}
                            className="px-2 py-1 text-[10px] font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                            title="Dispatch warning alert now"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                            Warn
                          </button>
                          <button
                            onClick={() => handleTriggerRule(rule, 'INFO')}
                            disabled={isTriggering}
                            className="px-2 py-1 text-[10px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                            title="Dispatch info alert now"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                            Info
                          </button>
                        </div>
                      </div>

                      <button
                        onClick={() => handleTriggerRule(rule)}
                        disabled={isTriggering}
                        className="w-full py-2 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {isTriggering ? (
                          <>
                            <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            <span>Sending Email Dispatch...</span>
                          </>
                        ) : (
                          <>
                            <Send className="w-3.5 h-3.5" />
                            <span>Dispatch Alert &amp; Send Email</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* TAB 2: LIVE ALARMS FEED                                        */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'feed' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">Live Alarms Event Stream ({alarms.length})</h2>
            {alarms.length > 0 && (
              <button
                onClick={handleClearAlarms}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear Alarms Feed</span>
              </button>
            )}
          </div>

          {alarms.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-xs">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 mb-1">No Active Alarms</h3>
              <p className="text-xs text-slate-500">
                All monitored inclinometers are operating within normal geotechnical safety thresholds.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="px-4 py-3">Severity</th>
                      <th className="px-4 py-3">Device ID</th>
                      <th className="px-4 py-3">Parameter</th>
                      <th className="px-4 py-3">Recorded Value</th>
                      <th className="px-4 py-3">Threshold</th>
                      <th className="px-4 py-3">Message</th>
                      <th className="px-4 py-3">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {alarms.map((alm) => {
                      const isCrit = alm.severity === 'CRITICAL' || alm.severity === 'EMERGENCY';
                      const isWarn = alm.severity === 'WARNING' || alm.severity === 'MAJOR';

                      return (
                        <tr key={alm.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                              isCrit
                                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                : isWarn
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-blue-50 text-blue-700 border border-blue-200'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${isCrit ? 'bg-rose-600 animate-pulse' : isWarn ? 'bg-amber-500' : 'bg-blue-500'}`} />
                              {alm.severity}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-mono font-bold text-slate-800 whitespace-nowrap">
                            {alm.deviceId || 'DEV-N/A'}
                          </td>
                          <td className="px-4 py-3 font-semibold text-slate-700 uppercase whitespace-nowrap">
                            {alm.parameter || alm.type}
                          </td>
                          <td className="px-4 py-3 font-mono font-bold text-rose-600 whitespace-nowrap">
                            {typeof alm.value === 'number' ? alm.value.toFixed(1) : alm.value}
                          </td>
                          <td className="px-4 py-3 font-mono text-slate-500 whitespace-nowrap">
                            {alm.threshold || 'N/A'}
                          </td>
                          <td className="px-4 py-3 text-slate-600 max-w-xs truncate" title={alm.message}>
                            {alm.message}
                          </td>
                          <td className="px-4 py-3 text-slate-400 whitespace-nowrap text-[11px]">
                            {alm.createdAt ? new Date(alm.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Just now'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* MODAL: CREATE / EDIT ALERT RULE (LOGIN USER DEVICES ONLY)      */}
      {/* ───────────────────────────────────────────────────────────── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden animate-scale-in">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    {editingRule ? 'Edit Geotechnical Alert Rule' : 'Create Geotechnical Alert Rule'}
                  </h2>
                  <p className="text-xs text-slate-500">
                    Configure safety limits across 3 severity levels, assign target devices, and set recipient emails.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-5 flex-1">
              {/* Field 1: Rule Name */}
              <div>
                <label className="text-xs font-bold text-slate-800 uppercase tracking-wider block mb-1.5">
                  Alert Rule Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g., Slope Stability Inclinometer Alert"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:border-blue-500 font-medium"
                />
              </div>

              {/* Field 2: Select Target Devices (Login User Devices Only) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Radio className="w-3.5 h-3.5 text-blue-600" />
                    Select Target Devices ({formDeviceIds.length} selected) <span className="text-rose-500">*</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setFormDeviceIds(userScopedDevices.map(d => d.id))}
                      className="text-[11px] font-semibold text-blue-600 hover:underline cursor-pointer"
                    >
                      Select All ({userScopedDevices.length})
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={() => setFormDeviceIds([])}
                      className="text-[11px] font-semibold text-slate-500 hover:underline cursor-pointer"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                {user && user.role !== 'SUPER_ADMIN' && (
                  <div className="mb-2 text-[11px] text-blue-700 bg-blue-50/70 border border-blue-100 rounded-lg px-2.5 py-1 flex items-center justify-between">
                    <span>Showing devices assigned to your user account ({user.username})</span>
                    <span className="font-mono font-semibold">{userScopedDevices.length} Available</span>
                  </div>
                )}

                {/* Device Search Box */}
                <div className="relative mb-2">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Search your assigned devices..."
                    value={deviceSearchQuery}
                    onChange={(e) => setDeviceSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500"
                  />
                </div>

                {/* Devices Checkbox Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-36 overflow-y-auto p-2 bg-slate-50 rounded-xl border border-slate-200">
                  {filteredModalDevices.length === 0 ? (
                    <div className="col-span-full py-4 text-center text-xs text-slate-400">
                      No devices available for your user account.
                    </div>
                  ) : (
                    filteredModalDevices.map(dev => {
                      const isSelected = formDeviceIds.includes(dev.id);
                      return (
                        <button
                          key={dev.id}
                          type="button"
                          onClick={() => handleToggleDevice(dev.id)}
                          className={`flex items-center justify-between p-2 rounded-lg text-left text-xs font-mono transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-blue-600 text-white font-bold shadow-2xs'
                              : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                          }`}
                        >
                          <span className="truncate">{dev.id}</span>
                          {isSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Field 3: Add Multiple Recipient Emails */}
              <div>
                <label className="text-xs font-bold text-slate-800 uppercase tracking-wider block mb-1.5 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-purple-600" />
                  Recipient Email Addresses ({formEmails.length}) <span className="text-rose-500">*</span>
                </label>

                <div className="flex gap-2 mb-2">
                  <input
                    type="email"
                    placeholder="Type recipient email and press Add..."
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddEmail())}
                    className="flex-1 px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={handleAddEmail}
                    className="px-3.5 py-1.5 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-xl transition-colors cursor-pointer"
                  >
                    + Add
                  </button>
                </div>

                {/* Email Tag Pills */}
                <div className="flex flex-wrap gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-xl min-h-[44px]">
                  {formEmails.length === 0 ? (
                    <span className="text-xs text-rose-500 italic">Please add at least one recipient email address.</span>
                  ) : (
                    formEmails.map(em => (
                      <span key={em} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-purple-200 text-purple-700 text-xs font-medium shadow-2xs">
                        <span>{em}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveEmail(em)}
                          className="text-purple-400 hover:text-rose-600 cursor-pointer ml-1"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))
                  )}
                </div>
              </div>

              {/* ───────────────────────────────────────────────────────────── */}
              {/* FIELD 4: 3 SEVERITY LEVEL & PARAMETER THRESHOLD VALUE ROW-WISE */}
              {/* ───────────────────────────────────────────────────────────── */}
              <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/60 space-y-3.5">
                {/* Header: Parameter & Condition Selection in one row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
                  <div>
                    <span className="text-xs font-bold text-slate-900 uppercase tracking-wider block">
                      3 Severity Levels &amp; Threshold Limits
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Configure row-wise threshold values for each severity level tier.
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Parameter Selector */}
                    <select
                      value={formParam}
                      onChange={(e) => handleParamChange(e.target.value)}
                      className="px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 font-bold text-slate-800"
                    >
                      <option value="tilt">Resultant Tilt (°)</option>
                      <option value="displacement">Lateral Displacement (mm)</option>
                    </select>

                    {/* Condition Selector */}
                    <select
                      value={formOperator}
                      onChange={(e) => setFormOperator(e.target.value)}
                      className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 font-mono font-bold text-slate-800"
                      title="Condition Operator"
                    >
                      <option value=">">&gt; Exceeds</option>
                      <option value=">=">&gt;= At or Above</option>
                      <option value="<">&lt; Drops Below</option>
                    </select>
                  </div>
                </div>

                {/* 3 Severity Level Rows (Row-Wise Table) */}
                <div className="space-y-2.5">
                  {/* Row 1: CRITICAL Severity Level */}
                  <div className="flex items-center justify-between gap-3 p-3 bg-white rounded-xl border border-rose-200 shadow-2xs">
                    <div className="flex items-center gap-2.5 min-w-[130px]">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold uppercase">
                        <span className="w-2 h-2 rounded-full bg-rose-600 animate-pulse" />
                        CRITICAL
                      </span>
                    </div>

                    <div className="flex-1 text-xs text-slate-500 hidden sm:block">
                      Severe safety limit breach (Emergency inspection required)
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono text-xs font-bold text-slate-600">{formOperator}</span>
                      <input
                        type="number"
                        step="0.001"
                        value={formCriticalThreshold}
                        onChange={(e) => setFormCriticalThreshold(e.target.value)}
                        className="w-24 px-2.5 py-1.5 text-xs bg-rose-50/50 border border-rose-300 rounded-lg text-rose-800 font-mono font-bold focus:bg-white focus:outline-none focus:border-rose-500"
                      />
                      <span className="font-bold text-xs text-slate-500 w-8">{formParam === 'tilt' ? '°' : 'mm'}</span>
                    </div>
                  </div>

                  {/* Row 2: WARNING Severity Level */}
                  <div className="flex items-center justify-between gap-3 p-3 bg-white rounded-xl border border-amber-200 shadow-2xs">
                    <div className="flex items-center gap-2.5 min-w-[130px]">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-xs font-bold uppercase">
                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                        WARNING
                      </span>
                    </div>

                    <div className="flex-1 text-xs text-slate-500 hidden sm:block">
                      Elevated geotechnical movement (Engineering attention needed)
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono text-xs font-bold text-slate-600">{formOperator}</span>
                      <input
                        type="number"
                        step="0.001"
                        value={formWarningThreshold}
                        onChange={(e) => setFormWarningThreshold(e.target.value)}
                        className="w-24 px-2.5 py-1.5 text-xs bg-amber-50/50 border border-amber-300 rounded-lg text-amber-800 font-mono font-bold focus:bg-white focus:outline-none focus:border-amber-500"
                      />
                      <span className="font-bold text-xs text-slate-500 w-8">{formParam === 'tilt' ? '°' : 'mm'}</span>
                    </div>
                  </div>

                  {/* Row 3: INFO Severity Level */}
                  <div className="flex items-center justify-between gap-3 p-3 bg-white rounded-xl border border-blue-200 shadow-2xs">
                    <div className="flex items-center gap-2.5 min-w-[130px]">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold uppercase">
                        <span className="w-2 h-2 rounded-full bg-blue-500" />
                        INFO
                      </span>
                    </div>

                    <div className="flex-1 text-xs text-slate-500 hidden sm:block">
                      Baseline movement advisory (Routine monitoring log)
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono text-xs font-bold text-slate-600">{formOperator}</span>
                      <input
                        type="number"
                        step="0.001"
                        value={formInfoThreshold}
                        onChange={(e) => setFormInfoThreshold(e.target.value)}
                        className="w-24 px-2.5 py-1.5 text-xs bg-blue-50/50 border border-blue-300 rounded-lg text-blue-800 font-mono font-bold focus:bg-white focus:outline-none focus:border-blue-500"
                      />
                      <span className="font-bold text-xs text-slate-500 w-8">{formParam === 'tilt' ? '°' : 'mm'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Field 5: Custom Notification Note */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">Notification Message / Instructions (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g., Immediate geotechnical inspection required upon threshold breach"
                  value={formMessage}
                  onChange={(e) => setFormMessage(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="w-full sm:w-auto px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => handleSaveRule(true)}
                disabled={savingRule}
                className="w-full sm:w-auto px-4 py-2 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                title="Save rule and immediately dispatch an automated email test"
              >
                <Zap className="w-3.5 h-3.5 text-blue-600" />
                <span>Save &amp; Send Test Alert Now</span>
              </button>

              <button
                type="button"
                onClick={() => handleSaveRule(false)}
                disabled={savingRule}
                className="w-full sm:w-auto px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                {savingRule ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>{editingRule ? 'Save Alert Rule Updates' : 'Add All 3 Alert Rules (Critical, Warning, Info)'}</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
