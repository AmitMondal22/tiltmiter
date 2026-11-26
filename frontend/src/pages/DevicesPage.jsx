import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Edit, Trash2, Sliders, CheckCircle2, ChevronRight, X, AlertTriangle, Loader2, Camera, Upload, Cpu
} from 'lucide-react';
import { getDevices, getSites, getStructures, getOrganizations, getProjects, createDevice, updateDevice, deleteDevice, configureDeviceTelemetry, formatAssetUrl } from '../api/apiClient';
import { formatBatteryPercentage, formatCSQPercentage } from '../utils/telemetryHelper';
import { ddToDms, dmsToDd, formatLatLngPair, getStoredCoordFormat, setStoredCoordFormat } from '../utils/coordinateHelper';

export default function DevicesPage() {
  const navigate = useNavigate();
  const cardCls = 'rounded-2xl border border-slate-200 bg-white p-5 text-black shadow-xs';

  const [devicesList, setDevicesList] = useState([]);
  const [sitesList, setSitesList] = useState([]);
  const [structuresList, setStructuresList] = useState([]);
  const [orgsList, setOrgsList] = useState([]);
  const [projectsList, setProjectsList] = useState([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState(null);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [coordViewFormat, setCoordViewFormat] = useState(getStoredCoordFormat);
  const [coordInputType, setCoordInputType] = useState(() => getStoredCoordFormat());
  const [dmsLat, setDmsLat] = useState({ deg: '', min: '', sec: '', dir: 'N' });
  const [dmsLng, setDmsLng] = useState({ deg: '', min: '', sec: '', dir: 'E' });

  const [formData, setFormData] = useState({
    id: '',
    name: '',
    sensorType: 'Inclinometer',
    organizationId: '',
    projectId: '',
    siteId: '',
    structureId: '',
    latitude: '',
    longitude: '',
    macAddress: '',
    status: 'ONLINE',
    sleep_count: 15,
    wake_count: 30,
    calibrate: false,
    imageUrl: '',
  });

  const [configForm, setConfigForm] = useState({
    sleep_count: '',
    wake_count: '',
    calibrate: false,
    imageUrl: '',
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [devRes, sitesRes, structRes, orgsRes, projRes] = await Promise.all([
        getDevices().catch(() => ({ devices: [] })),
        getSites().catch(() => ({ sites: [] })),
        getStructures().catch(() => ({ structures: [] })),
        getOrganizations().catch(() => ({ organizations: [] })),
        getProjects().catch(() => ({ projects: [] })),
      ]);

      if (devRes?.devices) setDevicesList(devRes.devices);
      if (sitesRes?.sites) setSitesList(sitesRes.sites);
      if (structRes?.structures) setStructuresList(structRes.structures);
      if (orgsRes?.organizations) setOrgsList(orgsRes.organizations);
      if (projRes?.projects) setProjectsList(projRes.projects);
    } catch (e) {
      setDevicesList([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenAdd = () => {
    setEditingDevice(null);
    setFormData({
      id: `TECHA${Date.now().toString().slice(-5)}`,
      name: '',
      sensorType: 'Inclinometer',
      organizationId: '',
      projectId: '',
      siteId: '',
      structureId: '',
      latitude: '',
      longitude: '',
      macAddress: 'AA:BB:CC:DD:EE:FF',
      status: 'ONLINE',
      gaugeLength_mm: 1000,
      sleep_count: 15,
      wake_count: 30,
      calibrate: false,
      imageUrl: '',
    });
    setCoordInputType(coordViewFormat);
    setDmsLat({ deg: '', min: '', sec: '', dir: 'N' });
    setDmsLng({ deg: '', min: '', sec: '', dir: 'E' });
    setModalOpen(true);
  };

  const handleOpenEdit = (dev, e) => {
    e?.stopPropagation();
    setEditingDevice(dev);

    // 1. Resolve parent structure & site
    const devSiteId = dev.siteId || '';
    const parentStruct = dev.structureId 
      ? structuresList.find(st => String(st.id) === String(dev.structureId) || String(st.structureId || '') === String(dev.structureId))
      : null;

    const effectiveSiteId = devSiteId || parentStruct?.siteId || '';
    const parentSite = effectiveSiteId 
      ? sitesList.find(s => String(s.id) === String(effectiveSiteId) || String(s.siteId || '') === String(effectiveSiteId))
      : null;

    // 2. Resolve organization from dev, site, project, or structure
    const parentProject = parentSite?.projectId 
      ? projectsList.find(p => String(p.id) === String(parentSite.projectId))
      : null;

    let orgId = dev.organizationId ? String(dev.organizationId) : '';
    if (!orgId && parentSite?.organizationId) {
      orgId = String(parentSite.organizationId);
    }
    if (!orgId && parentProject?.organizationId) {
      orgId = String(parentProject.organizationId);
    }
    if (!orgId && parentStruct?.organizationId) {
      orgId = String(parentStruct.organizationId);
    }
    if (!orgId && orgsList.length === 1) {
      orgId = String(orgsList[0].id);
    }

    setFormData({
      id: dev.id,
      name: dev.name,
      sensorType: dev.sensorType || 'Inclinometer',
      organizationId: orgId,
      projectId: dev.projectId ? String(dev.projectId) : (parentProject?.id ? String(parentProject.id) : ''),
      siteId: effectiveSiteId,
      structureId: dev.structureId || '',
      latitude: dev.latitude !== undefined && dev.latitude !== null ? dev.latitude : '',
      longitude: dev.longitude !== undefined && dev.longitude !== null ? dev.longitude : '',
      macAddress: dev.macAddress || '',
      status: dev.status || 'ONLINE',
      gaugeLength_mm: dev.gaugeLength_mm !== undefined && dev.gaugeLength_mm !== null ? dev.gaugeLength_mm : 1000,
      sleep_count: dev.sleep_count !== undefined && dev.sleep_count !== null ? dev.sleep_count : 15,
      wake_count: dev.wake_count !== undefined && dev.wake_count !== null ? dev.wake_count : 30,
      calibrate: Boolean(dev.calibrate),
      imageUrl: dev.imageUrl || '',
    });
    setCoordInputType(coordViewFormat);
    setDmsLat(ddToDms(dev.latitude, true));
    setDmsLng(ddToDms(dev.longitude, false));
    setModalOpen(true);
  };

  // Filtered projects: if organization selected, filter by org; otherwise show all projects
  const filteredProjects = formData.organizationId
    ? projectsList.filter(p => String(p.organizationId) === String(formData.organizationId))
    : projectsList;

  // Filtered sites: if organization or project selected, filter accordingly; otherwise show all sites
  const filteredSites = sitesList.filter(s => {
    if (formData.projectId && String(s.projectId) !== String(formData.projectId)) return false;
    if (formData.organizationId) {
      if (s.organizationId && String(s.organizationId) === String(formData.organizationId)) return true;
      if (s.projectId) {
        const prj = projectsList.find(p => String(p.id) === String(s.projectId));
        if (prj && String(prj.organizationId) === String(formData.organizationId)) return true;
      }
      return false;
    }
    return true;
  });

  // Filtered structures: if site selected, filter by site; otherwise show all structures
  const filteredStructures = formData.siteId
    ? structuresList.filter(st => {
        const targetSite = String(formData.siteId).trim().toLowerCase();
        if (st.siteId && String(st.siteId).trim().toLowerCase() === targetSite) return true;
        if (st.site && (
          String(st.site.id || '').trim().toLowerCase() === targetSite ||
          String(st.site.siteId || '').trim().toLowerCase() === targetSite
        )) return true;
        return false;
      })
    : structuresList;

  const handleImageFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    if (!file.type.startsWith('image/')) {
      setMsg({ type: 'error', text: 'Please select a valid image file (PNG, JPG, WebP).' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setMsg({ type: 'error', text: 'Image file size must be less than 5 MB.' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setFormData(prev => ({ ...prev, imageUrl: reader.result }));
    };
    reader.readAsDataURL(file);
  };

  const handleConfigImageFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    if (!file.type.startsWith('image/')) {
      setMsg({ type: 'error', text: 'Please select a valid image file (PNG, JPG, WebP).' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setMsg({ type: 'error', text: 'Image file size must be less than 5 MB.' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setConfigForm(prev => ({ ...prev, imageUrl: reader.result }));
    };
    reader.readAsDataURL(file);
  };

  const handleOpenConfig = (dev, e) => {
    e?.stopPropagation();
    setSelectedDevice(dev);
    setConfigForm({
      sleep_count: dev.sleep_count !== undefined ? dev.sleep_count : '',
      wake_count: dev.wake_count !== undefined ? dev.wake_count : '',
      calibrate: Boolean(dev.calibrate ?? dev.hasReferenceZero),
      status: dev.status || 'ONLINE',
      imageUrl: dev.imageUrl || '',
    });
    setConfigModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const sleepVal = formData.sleep_count !== undefined && formData.sleep_count !== '' && Number(formData.sleep_count) >= 15
      ? Number(formData.sleep_count)
      : (editingDevice?.sleep_count || 15);
    const wakeVal = formData.wake_count !== undefined && formData.wake_count !== '' && Number(formData.wake_count) > 0
      ? Number(formData.wake_count)
      : (editingDevice?.wake_count || 30);
    const gaugeVal = parseFloat(formData.gaugeLength_mm) || 1000;

    const payload = {
      ...formData,
      sleep_count: sleepVal,
      wake_count: wakeVal,
      gaugeLength_mm: gaugeVal,
      status: formData.status || 'ONLINE',
      organizationId: formData.organizationId && String(formData.organizationId).trim() !== '' ? Number(formData.organizationId) : null,
      projectId: formData.projectId && String(formData.projectId).trim() !== '' ? Number(formData.projectId) : null,
      structureId: formData.structureId && String(formData.structureId).trim() !== '' ? String(formData.structureId).trim() : null,
      siteId: formData.siteId && String(formData.siteId).trim() !== '' ? String(formData.siteId).trim() : null,
      latitude: formData.latitude !== '' && formData.latitude !== null && formData.latitude !== undefined && !isNaN(parseFloat(formData.latitude)) ? parseFloat(formData.latitude) : null,
      longitude: formData.longitude !== '' && formData.longitude !== null && formData.longitude !== undefined && !isNaN(parseFloat(formData.longitude)) ? parseFloat(formData.longitude) : null,
      imageUrl: formData.imageUrl !== undefined && formData.imageUrl !== '' ? formData.imageUrl : null,
    };
    try {
      if (editingDevice) {
        const res = await updateDevice(editingDevice.id, payload);
        const updatedDev = res?.device || { ...editingDevice, ...payload };
        setDevicesList(prev => prev.map(d => d.id === editingDevice.id ? { ...d, ...updatedDev } : d));
        setMsg({ type: 'success', text: `Device ${editingDevice.id} updated successfully.` });
      } else {
        const res = await createDevice(payload);
        const newDev = res?.device || { ...payload, battery: '100%', signal: '14' };
        setDevicesList(prev => [...prev, newDev]);
        setMsg({ type: 'success', text: `Device ${payload.id} created successfully.` });
      }
      setModalOpen(false);
    } catch (err) {
      setMsg({ type: 'error', text: err.message || 'Error saving device' });
    } finally {
      setTimeout(() => setMsg({ type: '', text: '' }), 3500);
    }
  };

  const handleSaveConfig = async (e) => {
    e.preventDefault();
    const sleepVal = Number(configForm.sleep_count);
    const wakeVal = Number(configForm.wake_count);
    if (!sleepVal || sleepVal < 15) {
      setMsg({ type: 'error', text: 'Sleep count must be at least 15 minutes (15M minimum).' });
      return;
    }
    const payload = {
      ...configForm,
      sleep_count: sleepVal,
      wake_count: wakeVal > 0 ? wakeVal : 30,
      calibrate: Boolean(configForm.calibrate),
      status: configForm.status || 'ONLINE',
      imageUrl: configForm.imageUrl !== undefined && configForm.imageUrl !== '' ? configForm.imageUrl : null,
    };
    try {
      const res = await configureDeviceTelemetry(selectedDevice.id, payload);
      const updatedDev = res?.device || { ...selectedDevice, ...payload };
      setDevicesList(prev => prev.map(d => d.id === selectedDevice.id ? { ...d, ...updatedDev, calibrate: payload.calibrate, hasReferenceZero: payload.calibrate } : d));
      setMsg({ type: 'success', text: `Configuration deployed to ${selectedDevice.id}. Calibrate: ${payload.calibrate ? 'ENABLED' : 'DISABLED'}.` });
      setConfigModalOpen(false);
    } catch (err) {
      setMsg({ type: 'error', text: err.message || 'Error configuring device' });
    } finally {
      setTimeout(() => setMsg({ type: '', text: '' }), 3500);
    }
  };

  const [deletingId, setDeletingId] = useState(null);

  const handleDelete = async (id, e) => {
    e?.stopPropagation();
    if (!window.confirm(`Are you sure you want to permanently delete device node "${id}" and all its telemetry records?`)) {
      return;
    }
    setDeletingId(id);
    try {
      const res = await deleteDevice(id);
      setDevicesList(prev => prev.filter(d => String(d.id).toLowerCase() !== String(id).toLowerCase()));
      setMsg({ type: 'success', text: res?.message || `Device ${id} deleted successfully.` });
    } catch (err) {
      console.error('Delete device error:', err);
      setMsg({ type: 'error', text: err.message || `Failed to delete device ${id}.` });
    } finally {
      setDeletingId(null);
      setTimeout(() => setMsg({ type: '', text: '' }), 4000);
    }
  };


  return (
    <div className="space-y-4 font-sans text-black">
      {/* Toast */}
      {msg.text && (
        <div className={`p-3.5 rounded-xl border flex items-center gap-2 text-xs font-bold shadow-sm animate-fadeIn ${
          msg.type === 'error' ? 'bg-red-50 border-red-300 text-red-950' : 'bg-emerald-50 border-emerald-300 text-emerald-950'
        }`}>
          {msg.type === 'error' ? <AlertTriangle className="w-4 h-4 text-red-700" /> : <CheckCircle2 className="w-4 h-4 text-emerald-700" />}
          <span>{msg.text}</span>
        </div>
      )}

      {/* Top Header Row */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Sensor Devices
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            {devicesList.length} registered inclinometer hardware nodes (Click any node to open live dashboard)
          </p>
        </div>

        {/* Action Buttons & Coordinate Format View Switcher */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-100 border border-slate-200 rounded-xl p-0.5 text-[11px] font-bold">
            <button
              type="button"
              onClick={() => {
                setCoordViewFormat('DD');
                setStoredCoordFormat('DD');
              }}
              className={`px-2.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                coordViewFormat === 'DD' ? 'bg-blue-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Display Coordinates in Decimal Degrees (DD)"
            >
              DD
            </button>
            <button
              type="button"
              onClick={() => {
                setCoordViewFormat('DMS');
                setStoredCoordFormat('DMS');
              }}
              className={`px-2.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                coordViewFormat === 'DMS' ? 'bg-blue-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Display Coordinates in Degrees, Minutes, Seconds (DMS)"
            >
              DMS
            </button>
          </div>

          <button
            onClick={handleOpenAdd}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs rounded-xl shadow-xs transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Device</span>
          </button>
        </div>
      </div>

      {/* Devices Table */}
      <div className={cardCls}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 uppercase text-[10px] tracking-wider">
                <th className="py-3 px-3.5">Device ID & Name</th>
                <th className="py-3 px-3.5">Attached Asset / Site</th>
                <th className="py-3 px-3.5">Battery</th>
                <th className="py-3 px-3.5">Signal (RSSI)</th>
                <th className="py-3 px-3.5">Config (Sleep / Wake)</th>
                <th className="py-3 px-3.5">Status</th>
                <th className="py-3 px-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {devicesList.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400 text-xs">
                    No devices registered yet. Click "+ Add Device" to add an inclinometer sensor node.
                  </td>
                </tr>
              ) : (
                devicesList.map(dev => {
                  const struct = structuresList.find(s => s.id === dev.structureId);
                  const site = sitesList.find(s => s.id === dev.siteId || s.siteId === dev.siteId);

                  return (
                    <tr
                      key={dev.id}
                      onClick={() => navigate(`/devices/${dev.id}`)}
                      className="hover:bg-blue-50/40 transition-colors cursor-pointer group"
                    >
                      <td className="py-3.5 px-3.5">
                        <div className="flex items-center gap-3">
                          {dev.imageUrl ? (
                            <div className="w-10 h-10 rounded-lg overflow-hidden border border-slate-200 bg-slate-100 shrink-0 shadow-2xs">
                              <img
                                src={formatAssetUrl(dev.imageUrl)}
                                alt={dev.name || dev.id}
                                className="w-full h-full object-cover"
                              />
                            </div>
                          ) : (
                            <div className="w-10 h-10 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center text-slate-400 shrink-0 shadow-2xs">
                              <Camera className="w-4 h-4 text-slate-400" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900 group-hover:text-blue-600 transition-colors flex items-center gap-1.5">
                              <span className="truncate">{dev.name || dev.id}</span>
                              <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 shrink-0" />
                            </div>
                            <div className="text-[11px] font-mono text-slate-500 mt-0.5">{dev.id}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-3.5">
                        <div className="text-slate-800">{struct?.name || 'No Asset Attached'}</div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1.5 flex-wrap">
                          <span>{site?.name || 'Standalone'}</span>
                          {dev.latitude !== null && dev.latitude !== undefined && dev.longitude !== null && dev.longitude !== undefined && (
                            <span className="font-mono text-[10px] text-slate-400">
                              ({formatLatLngPair(dev.latitude, dev.longitude, coordViewFormat, 4)})
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-3.5 font-mono text-emerald-600 font-semibold">
                        {formatBatteryPercentage(dev.battery ?? dev.batteryVoltage)}
                      </td>
                      <td className="py-3.5 px-3.5 font-mono text-blue-600 font-semibold">
                        {formatCSQPercentage(dev.signal ?? dev.signalStrength)}
                      </td>
                      <td className="py-3.5 px-3.5 font-mono text-[11px]">
                        {dev.sleep_count || 60}M / {dev.wake_count || 30}S
                      </td>
                      <td className="py-3.5 px-3.5">
                        <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold text-[10px]">
                          NORMAL
                        </span>
                      </td>
                      <td className="py-3.5 px-3.5 text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={(e) => handleOpenConfig(dev, e)}
                            title="Configure Sampling & Calibration"
                            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                          >
                            <Sliders className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => handleOpenEdit(dev, e)}
                            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => handleDelete(dev.id, e)}
                            disabled={deletingId === dev.id}
                            title="Delete Device Node"
                            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                              deletingId === dev.id
                                ? 'text-slate-400 bg-slate-100 cursor-not-allowed'
                                : 'text-red-500 hover:bg-red-50'
                            }`}
                          >
                            {deletingId === dev.id ? <Loader2 className="w-4 h-4 animate-spin text-red-500" /> : <Trash2 className="w-4 h-4" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal 1: Add / Edit Device (Fixed Medium Size & Scrollable) */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-3 sm:p-4 font-sans">
          <div className="w-full max-w-xl sm:max-w-2xl rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl overflow-hidden flex flex-col max-h-[88vh] animate-fadeIn">
            {/* Fixed Modal Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/80 shrink-0">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Cpu className="w-5 h-5 text-blue-600" />
                  <span>{editingDevice ? 'Edit Inclinometer Device Node' : 'Register New Inclinometer Node'}</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {editingDevice ? `Update telemetry configuration and metadata for node ${formData.id}` : 'Deploy new geotechnical hardware sensor to live monitoring'}
                </p>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 p-1.5 rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              {/* Scrollable Modal Body */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3.5 text-xs">
                {/* Device ID & Device Name (2 columns) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Device ID / Hardware Serial *</label>
                    <input
                      type="text"
                      required
                      disabled={!!editingDevice}
                      value={formData.id}
                      onChange={e => setFormData({ ...formData, id: e.target.value })}
                      placeholder="e.g. TECHA12346"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-mono text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Device Name *</label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={e => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g. Sensor Node 01"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* 1. Select Organization (Optional) */}
                <div>
                  <label className="block text-slate-700 font-semibold mb-1 flex items-center justify-between">
                    <span>1. Organization <span className="text-[10px] text-slate-500 font-normal">(Optional)</span></span>
                    {orgsList.length > 0 && <span className="text-[10px] text-slate-500 font-normal">{orgsList.length} registered</span>}
                  </label>
                  <select
                    value={formData.organizationId || ''}
                    onChange={e => {
                      const newOrgId = e.target.value;
                      setFormData(prev => ({
                        ...prev,
                        organizationId: newOrgId,
                      }));
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">-- No Organization (Optional) --</option>
                    {orgsList.map(o => (
                      <option key={o.id} value={o.id}>{o.name}</option>
                    ))}
                  </select>
                </div>

                {/* 2. Select Parent Project (Optional) */}
                <div>
                  <label className="block text-slate-700 font-semibold mb-1 flex items-center justify-between">
                    <span>2. Parent Project <span className="text-[10px] text-slate-500 font-normal">(Optional)</span></span>
                    <span className="text-[10px] text-slate-500 font-normal">
                      {filteredProjects.length} available
                    </span>
                  </label>
                  <select
                    value={formData.projectId || ''}
                    onChange={e => {
                      const newProjId = e.target.value;
                      const matchedProj = projectsList.find(p => String(p.id) === String(newProjId));
                      setFormData(prev => ({
                        ...prev,
                        projectId: newProjId,
                        organizationId: prev.organizationId || (matchedProj?.organizationId ? String(matchedProj.organizationId) : ''),
                      }));
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">-- No Project (Optional) --</option>
                    {filteredProjects.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                {/* 3. Select Location Site (Optional) */}
                <div>
                  <label className="block text-slate-700 font-semibold mb-1 flex items-center justify-between">
                    <span>3. Location Site <span className="text-[10px] text-slate-500 font-normal">(Optional)</span></span>
                    <span className="text-[10px] text-slate-500 font-normal">
                      {filteredSites.length} available
                    </span>
                  </label>
                  <select
                    value={formData.siteId || ''}
                    onChange={e => {
                      const newSiteId = e.target.value;
                      const targetSite = sitesList.find(s => String(s.id) === String(newSiteId) || String(s.siteId) === String(newSiteId));
                      const autoOrgId = formData.organizationId || targetSite?.organizationId || (projectsList.find(p => String(p.id) === String(targetSite?.projectId))?.organizationId) || '';
                      const autoProjId = formData.projectId || targetSite?.projectId || '';

                      setFormData(prev => ({
                        ...prev,
                        siteId: newSiteId,
                        organizationId: autoOrgId ? String(autoOrgId) : prev.organizationId,
                        projectId: autoProjId ? String(autoProjId) : prev.projectId,
                        // NOTE: Latitude and Longitude are strictly NOT auto-filled on site selection
                      }));
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">-- No Location Site (Optional) --</option>
                    {filteredSites.map(s => (
                      <option key={s.id || s.siteId} value={s.id || s.siteId}>
                        {s.name} ({s.id || s.siteId})
                      </option>
                    ))}
                  </select>
                </div>

                {/* 4. Select Attach to Structural Asset (Optional) */}
                <div>
                  <label className="block text-slate-700 font-semibold mb-1 flex items-center justify-between">
                    <span>4. Attach to Structural Asset <span className="text-[10px] text-slate-500 font-normal">(Optional)</span></span>
                    <span className="text-[10px] text-slate-500 font-normal">
                      {filteredStructures.length} available
                    </span>
                  </label>
                  <select
                    value={formData.structureId || ''}
                    onChange={e => {
                      const stId = e.target.value;
                      const st = structuresList.find(s => String(s.id) === String(stId));
                      setFormData(prev => ({
                        ...prev,
                        structureId: stId,
                        siteId: prev.siteId || (st?.siteId ? String(st.siteId) : ''),
                        organizationId: prev.organizationId || (st?.organizationId ? String(st.organizationId) : ''),
                        // NOTE: Latitude and Longitude are strictly NOT auto-filled on asset selection
                      }));
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">-- No Asset (Standalone Node) (Optional) --</option>
                    {filteredStructures.map(st => (
                      <option key={st.id} value={st.id}>
                        {st.name} ({st.type || 'Slope Asset'})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Status & Gauge Length */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Device Status</label>
                    <select
                      value={formData.status || 'ONLINE'}
                      onChange={e => setFormData({ ...formData, status: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="ONLINE">ONLINE</option>
                      <option value="OFFLINE">OFFLINE</option>
                      <option value="MAINTENANCE">MAINTENANCE</option>
                      <option value="WARNING">WARNING</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Gauge Length (mm)</label>
                    <input
                      type="number"
                      step="1"
                      value={formData.gaugeLength_mm ?? 1000}
                      onChange={e => setFormData({ ...formData, gaugeLength_mm: e.target.value })}
                      placeholder="1000"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-mono text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Geographic Coordinates (Fast Select: Decimal Degrees (DD) or Degrees, Minutes, Seconds (DMS)) */}
                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-slate-800 font-bold text-xs">Geographic Coordinates</span>
                    <div className="flex items-center bg-white border border-slate-200 rounded-xl p-0.5 text-[11px] font-bold shadow-2xs">
                      <button
                        type="button"
                        onClick={() => setCoordInputType('DD')}
                        className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                          coordInputType === 'DD'
                            ? 'bg-blue-600 text-white shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Decimal Degrees (DD)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDmsLat(ddToDms(formData.latitude, true));
                          setDmsLng(ddToDms(formData.longitude, false));
                          setCoordInputType('DMS');
                        }}
                        className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                          coordInputType === 'DMS'
                            ? 'bg-blue-600 text-white shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Degrees, Minutes, Seconds (DMS)
                      </button>
                    </div>
                  </div>

                  {coordInputType === 'DD' ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-slate-700 font-semibold mb-1">Latitude (DD)</label>
                          <input
                            type="number"
                            step="any"
                            value={formData.latitude ?? ''}
                            onChange={e => {
                              const val = e.target.value;
                              setFormData({ ...formData, latitude: val });
                              setDmsLat(ddToDms(val, true));
                            }}
                            placeholder="e.g. 26.7271"
                            className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-mono text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-700 font-semibold mb-1">Longitude (DD)</label>
                          <input
                            type="number"
                            step="any"
                            value={formData.longitude ?? ''}
                            onChange={e => {
                              const val = e.target.value;
                              setFormData({ ...formData, longitude: val });
                              setDmsLng(ddToDms(val, false));
                            }}
                            placeholder="e.g. 88.4315"
                            className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-mono text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                      {(formData.latitude !== '' || formData.longitude !== '') && (
                        <div className="text-[11px] font-mono text-slate-600 bg-white px-2.5 py-1.5 rounded-lg border border-slate-200/80">
                          <span className="font-sans font-semibold text-slate-500 mr-1.5">DMS Preview:</span>
                          {formatLatLngPair(formData.latitude, formData.longitude, 'DMS')}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {/* Latitude DMS */}
                      <div>
                        <label className="block text-slate-700 font-semibold mb-1">Latitude (DMS)</label>
                        <div className="grid grid-cols-4 gap-1.5">
                          <input
                            type="number"
                            step="1"
                            min="0"
                            max="90"
                            value={dmsLat.deg}
                            onChange={e => {
                              const next = { ...dmsLat, deg: e.target.value };
                              setDmsLat(next);
                              setFormData(prev => ({ ...prev, latitude: dmsToDd(next) }));
                            }}
                            placeholder="Deg °"
                            className="px-2.5 py-2 rounded-xl border border-slate-200 bg-white font-mono text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                          <input
                            type="number"
                            step="1"
                            min="0"
                            max="59"
                            value={dmsLat.min}
                            onChange={e => {
                              const next = { ...dmsLat, min: e.target.value };
                              setDmsLat(next);
                              setFormData(prev => ({ ...prev, latitude: dmsToDd(next) }));
                            }}
                            placeholder="Min '"
                            className="px-2.5 py-2 rounded-xl border border-slate-200 bg-white font-mono text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                          <input
                            type="number"
                            step="any"
                            min="0"
                            max="59.999"
                            value={dmsLat.sec}
                            onChange={e => {
                              const next = { ...dmsLat, sec: e.target.value };
                              setDmsLat(next);
                              setFormData(prev => ({ ...prev, latitude: dmsToDd(next) }));
                            }}
                            placeholder='Sec "'
                            className="px-2.5 py-2 rounded-xl border border-slate-200 bg-white font-mono text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                          <select
                            value={dmsLat.dir}
                            onChange={e => {
                              const next = { ...dmsLat, dir: e.target.value };
                              setDmsLat(next);
                              setFormData(prev => ({ ...prev, latitude: dmsToDd(next) }));
                            }}
                            className="px-2.5 py-2 rounded-xl border border-slate-200 bg-white font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          >
                            <option value="N">N</option>
                            <option value="S">S</option>
                          </select>
                        </div>
                      </div>

                      {/* Longitude DMS */}
                      <div>
                        <label className="block text-slate-700 font-semibold mb-1">Longitude (DMS)</label>
                        <div className="grid grid-cols-4 gap-1.5">
                          <input
                            type="number"
                            step="1"
                            min="0"
                            max="180"
                            value={dmsLng.deg}
                            onChange={e => {
                              const next = { ...dmsLng, deg: e.target.value };
                              setDmsLng(next);
                              setFormData(prev => ({ ...prev, longitude: dmsToDd(next) }));
                            }}
                            placeholder="Deg °"
                            className="px-2.5 py-2 rounded-xl border border-slate-200 bg-white font-mono text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                          <input
                            type="number"
                            step="1"
                            min="0"
                            max="59"
                            value={dmsLng.min}
                            onChange={e => {
                              const next = { ...dmsLng, min: e.target.value };
                              setDmsLng(next);
                              setFormData(prev => ({ ...prev, longitude: dmsToDd(next) }));
                            }}
                            placeholder="Min '"
                            className="px-2.5 py-2 rounded-xl border border-slate-200 bg-white font-mono text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                          <input
                            type="number"
                            step="any"
                            min="0"
                            max="59.999"
                            value={dmsLng.sec}
                            onChange={e => {
                              const next = { ...dmsLng, sec: e.target.value };
                              setDmsLng(next);
                              setFormData(prev => ({ ...prev, longitude: dmsToDd(next) }));
                            }}
                            placeholder='Sec "'
                            className="px-2.5 py-2 rounded-xl border border-slate-200 bg-white font-mono text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                          <select
                            value={dmsLng.dir}
                            onChange={e => {
                              const next = { ...dmsLng, dir: e.target.value };
                              setDmsLng(next);
                              setFormData(prev => ({ ...prev, longitude: dmsToDd(next) }));
                            }}
                            className="px-2.5 py-2 rounded-xl border border-slate-200 bg-white font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          >
                            <option value="E">E</option>
                            <option value="W">W</option>
                          </select>
                        </div>
                      </div>

                      {/* Converted DD Preview */}
                      {(formData.latitude !== '' || formData.longitude !== '') && (
                        <div className="text-[11px] font-mono text-blue-700 bg-blue-50/70 px-2.5 py-1.5 rounded-lg border border-blue-200/80">
                          <span className="font-sans font-semibold text-blue-800 mr-1.5">Converted DD (Stored):</span>
                          {formatLatLngPair(formData.latitude, formData.longitude, 'DD', 6)}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Hardware Installation Photo */}
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Hardware Installation Photo</label>
                  <div className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50/80">
                    {formData.imageUrl ? (
                      <div className="relative w-16 h-16 rounded-xl overflow-hidden border border-slate-200 bg-white shadow-2xs flex-shrink-0">
                        <img
                          src={formatAssetUrl(formData.imageUrl)}
                          alt="Hardware preview"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="w-16 h-16 rounded-xl border-2 border-dashed border-slate-300 bg-white flex flex-col items-center justify-center text-slate-400 shadow-2xs flex-shrink-0">
                        <Camera className="w-5 h-5 text-slate-300 mb-0.5" />
                        <span className="text-[8px] font-bold text-slate-400 uppercase">No Image</span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-xs transition-colors cursor-pointer">
                          <Upload className="w-3.5 h-3.5" />
                          <span>{formData.imageUrl ? 'Replace Image' : 'Upload Image'}</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleImageFileSelect}
                          />
                        </label>
                        {formData.imageUrl && (
                          <button
                            type="button"
                            onClick={() => setFormData(prev => ({ ...prev, imageUrl: null }))}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 font-semibold text-xs transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Remove Image</span>
                          </button>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500">
                        Upload physical hardware installation photo. Stored in server <code className="font-mono text-slate-700 font-semibold">/uploads/device_image/</code> and saved in database.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Fixed Modal Footer */}
              <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 font-medium cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-xs transition-colors cursor-pointer"
                >
                  {editingDevice ? 'Save Changes' : 'Register Device'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Telemetry Sampling & Calibration Config (Min 60M) */}
      {configModalOpen && selectedDevice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 font-sans">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Configure Device {selectedDevice.id}
                </h3>
                <p className="text-xs text-slate-500 font-medium">Sampling Interval (Min 15M) & Parameters</p>
              </div>
              <button onClick={() => setConfigModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveConfig} className="space-y-4 text-xs">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="font-semibold text-slate-700">
                    Sleep Count (Minutes)
                  </label>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                      Current: {selectedDevice?.sleep_count !== undefined ? selectedDevice.sleep_count : '-'}M
                    </span>
                    <span className="text-[10px] font-mono text-blue-600 font-semibold bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                      Min 15M
                    </span>
                  </div>
                </div>
                <input
                  type="number"
                  required
                  min="15"
                  max="1440"
                  placeholder="e.g. 15"
                  value={configForm.sleep_count}
                  onChange={e => setConfigForm({ ...configForm, sleep_count: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-mono text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <p className="text-[10px] text-slate-400 mt-1">Minimum allowed interval is 15 minutes.</p>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-slate-700 font-semibold">
                    Wake Count (Seconds)
                  </label>
                  <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                    Current: {selectedDevice?.wake_count !== undefined ? selectedDevice.wake_count : '-'}s
                  </span>
                </div>
                <input
                  type="number"
                  required
                  min="1"
                  max="3600"
                  placeholder="e.g. 30"
                  value={configForm.wake_count}
                  onChange={e => setConfigForm({ ...configForm, wake_count: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-mono text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Enable / Disable Zero Calibration Offset */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-900">Calibrate Zero Offset</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {configForm.calibrate
                      ? 'Enabled: Zero offset calibration is applied to telemetry.'
                      : 'Disabled: Standard raw telemetry is reported.'}
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(configForm.calibrate)}
                    onChange={e => setConfigForm({ ...configForm, calibrate: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  <span className="ml-2 text-xs font-bold text-slate-700">
                    {configForm.calibrate ? 'Enabled' : 'Disabled'}
                  </span>
                </label>
              </div>

              {/* Enable / Disable Device Operational State */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-900">Device Operational State</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Enable or disable sensor device telemetry tracking.
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={configForm.status !== 'DISABLED' && configForm.status !== 'OFFLINE'}
                    onChange={e => setConfigForm({ ...configForm, status: e.target.checked ? 'ONLINE' : 'DISABLED' })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                  <span className="ml-2 text-xs font-bold text-slate-700">
                    {configForm.status !== 'DISABLED' && configForm.status !== 'OFFLINE' ? 'Enabled' : 'Disabled'}
                  </span>
                </label>
              </div>

              {/* Hardware Installation Photo */}
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Hardware Installation Photo</label>
                <div className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50/80">
                  {configForm.imageUrl ? (
                    <div className="relative w-16 h-16 rounded-xl overflow-hidden border border-slate-200 bg-white shadow-2xs flex-shrink-0">
                      <img
                        src={formatAssetUrl(configForm.imageUrl)}
                        alt="Hardware preview"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="w-16 h-16 rounded-xl border-2 border-dashed border-slate-300 bg-white flex flex-col items-center justify-center text-slate-400 shadow-2xs flex-shrink-0">
                      <Camera className="w-5 h-5 text-slate-300 mb-0.5" />
                      <span className="text-[8px] font-bold text-slate-400 uppercase">No Image</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-xs transition-colors cursor-pointer">
                        <Upload className="w-3.5 h-3.5" />
                        <span>{configForm.imageUrl ? 'Replace Image' : 'Upload Image'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleConfigImageFileSelect}
                        />
                      </label>
                      {configForm.imageUrl && (
                        <button
                          type="button"
                          onClick={() => setConfigForm(prev => ({ ...prev, imageUrl: null }))}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 font-semibold text-xs transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Remove Image</span>
                        </button>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-500">
                      Upload physical hardware installation photo. Stored in server <code className="font-mono text-slate-700 font-semibold">/uploads/device_image/</code> and saved in database.
                    </p>
                  </div>
                </div>
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
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-xs transition-colors cursor-pointer"
                >
                  Deploy Configuration
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
