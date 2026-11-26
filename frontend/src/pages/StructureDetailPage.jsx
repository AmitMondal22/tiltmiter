import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, MapPin, Cpu, Shield, Layers, Box, Map as MapIcon,
  Activity, AlertTriangle, CheckCircle2, Battery, Signal, Zap,
  ExternalLink, TrendingUp, Navigation, RefreshCw, Radio, ShieldCheck,
  Mountain, Calendar, Hash, Globe, Info, Search, X, Plus, Edit
} from 'lucide-react';
import {
  getStructure, getStructures, getSites, getDevices,
  getProjects, getOrganizations, createDevice, updateDevice, updateStructureDeviceLocationsBulk
} from '../api/apiClient';
import LocationMapView from '../components/LocationMapView';
import MapPicker from '../components/MapPicker';
import { getAssetTypeConfig } from '../components/AssetsMapView';
import { formatBatteryPercentage, formatCSQPercentage } from '../utils/telemetryHelper';

export default function StructureDetailPage() {
  const { structureId } = useParams();
  const navigate = useNavigate();

  const [structure, setStructure] = useState(null);
  const [site, setSite] = useState(null);
  const [siteStructures, setSiteStructures] = useState([]);
  const [attachedDevices, setAttachedDevices] = useState([]);
  const [project, setProject] = useState(null);
  const [org, setOrg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [viewType, setViewType] = useState('satellite'); // 'satellite' or '3d'
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [sidebarTab, setSidebarTab] = useState('devices'); // 'devices' or 'structures'
  const [deviceSearch, setDeviceSearch] = useState('');
  const [structureSearch, setStructureSearch] = useState('');
  const [dragLocationEnabled, setDragLocationEnabled] = useState(false);
  const [editingMapDevice, setEditingMapDevice] = useState(null);
  const [addDeviceModalOpen, setAddDeviceModalOpen] = useState(false);
  const [savingDevice, setSavingDevice] = useState(false);
  const [toastMsg, setToastMsg] = useState({ type: '', text: '' });
  const [newDeviceForm, setNewDeviceForm] = useState({
    id: '',
    name: '',
    sensorType: 'Inclinometer',
    macAddress: '',
    latitude: '',
    longitude: '',
  });

  const cardCls = 'rounded-2xl border border-slate-200 bg-white p-5 text-black shadow-xs';

  const loadData = async () => {
    setLoading(true);
    try {
      // 1. Fetch single structure if available
      let foundStruct = null;
      try {
        const res = await getStructure(structureId);
        if (res?.structure) {
          foundStruct = res.structure;
        }
      } catch {
        // Fallback below
      }

      // 2. Fetch all collections in parallel
      const [allStructsRes, sitesRes, devRes, projRes, orgRes] = await Promise.all([
        getStructures().catch(() => ({ structures: [] })),
        getSites().catch(() => ({ sites: [] })),
        getDevices().catch(() => ({ devices: [] })),
        getProjects().catch(() => ({ projects: [] })),
        getOrganizations().catch(() => ({ organizations: [] })),
      ]);

      const allStructs = allStructsRes?.structures || [];
      const allSites = sitesRes?.sites || [];
      const allDevs = devRes?.devices || [];

      if (!foundStruct) {
        foundStruct = allStructs.find(
          s => s.id === structureId || s.structureId === structureId || String(s.id) === String(structureId)
        );
      }

      if (!foundStruct) {
        foundStruct = {
          id: structureId,
          structureId: structureId,
          name: `Structure ${structureId}`,
          type: 'Mountain Slope',
          latitude: '26.7271',
          longitude: '88.4315',
          heightElevation: '450',
          description: 'Geotechnical Slope Asset',
          status: 'ACTIVE'
        };
      }

      setStructure(foundStruct);

      // Find parent site
      const parentSite = allSites.find(
        s => s.id === foundStruct.siteId || s.siteId === foundStruct.siteId || String(s.id) === String(foundStruct.siteId)
      ) || foundStruct.Site;
      setSite(parentSite);

      // Collect all structures under the same site
      const siteIdToMatch = foundStruct.siteId || parentSite?.id || parentSite?.siteId;
      let siteStructs = [];
      if (siteIdToMatch) {
        siteStructs = allStructs.filter(
          st => st.siteId === siteIdToMatch ||
                st.siteId === parentSite?.id ||
                st.siteId === parentSite?.siteId ||
                String(st.siteId) === String(siteIdToMatch)
        );
      }
      if (foundStruct && !siteStructs.some(st => st.id === foundStruct.id)) {
        siteStructs = [foundStruct, ...siteStructs];
      }
      setSiteStructures(siteStructs);

      // Filter attached devices
      let attached = allDevs.filter(
        d => d.structureId === foundStruct.id ||
             d.structureId === foundStruct.structureId ||
             String(d.structureId) === String(foundStruct.id)
      );

      // If backend attached devices exist in foundStruct.Devices, merge/use them
      if (attached.length === 0 && foundStruct.Devices && foundStruct.Devices.length > 0) {
        attached = foundStruct.Devices;
      }
      setAttachedDevices(attached);

      // Parent Project & Org
      const projId = parentSite?.projectId || foundStruct.projectId;
      const foundProj = (projRes?.projects || []).find(p => p.id === projId) || parentSite?.Project;
      setProject(foundProj);

      const orgId = parentSite?.organizationId || foundStruct.organizationId || foundProj?.organizationId;
      const foundOrg = (orgRes?.organizations || []).find(o => o.id === orgId) || parentSite?.Organization;
      setOrg(foundOrg);

    } catch (err) {
      console.error('Failed to load asset details:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setDragLocationEnabled(false);
    setEditingMapDevice(null);
    setSelectedDevice(null);
    loadData();
  }, [structureId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  const typeConfig = getAssetTypeConfig(structure?.type);
  const TypeIcon = typeConfig?.icon || Mountain;

  // Compute live geotechnical displacement & tilt aggregates
  const maxDisp = attachedDevices.reduce((max, d) => {
    const v = Number(d.totalDisplacement || d.displacement?.totalDisplacement_mm || 0);
    return v > max ? v : max;
  }, 0);

  const avgTilt = attachedDevices.length > 0
    ? attachedDevices.reduce((sum, d) => sum + Number(d.resultantTilt || d.tilt?.tilt || 0), 0) / attachedDevices.length
    : 0;

  const onlineCount = attachedDevices.filter(d => (d.status || 'ONLINE') === 'ONLINE').length;
  const offlineCount = attachedDevices.length - onlineCount;

  const stabilityStatus = maxDisp > 15 ? 'CRITICAL' : maxDisp > 5 ? 'WARNING' : 'STABLE';
  const stabilityBadge = {
    STABLE: 'bg-emerald-100 text-emerald-950 border-emerald-300',
    WARNING: 'bg-amber-100 text-amber-950 border-amber-300',
    CRITICAL: 'bg-red-100 text-red-950 border-red-300'
  }[stabilityStatus];

  // Device search filtering
  const filteredAttachedDevices = attachedDevices.filter(d => {
    if (!deviceSearch.trim()) return true;
    const q = deviceSearch.toLowerCase().trim();
    return (
      (d.name && d.name.toLowerCase().includes(q)) ||
      (d.id && String(d.id).toLowerCase().includes(q)) ||
      (d.status && d.status.toLowerCase().includes(q)) ||
      (d.serialNumber && String(d.serialNumber).toLowerCase().includes(q))
    );
  });

  // Site structures search filtering
  const filteredSiteStructures = siteStructures.filter(st => {
    if (!structureSearch.trim()) return true;
    const q = structureSearch.toLowerCase().trim();
    return (
      (st.name && st.name.toLowerCase().includes(q)) ||
      (st.id && String(st.id).toLowerCase().includes(q)) ||
      (st.structureId && String(st.structureId).toLowerCase().includes(q)) ||
      (st.type && st.type.toLowerCase().includes(q))
    );
  });

  const showToast = (type, text) => {
    setToastMsg({ type, text });
    setTimeout(() => setToastMsg({ type: '', text: '' }), 4000);
  };

  const handleOpenAddDevice = () => {
    const baseLat = parseFloat(structure?.latitude) || parseFloat(site?.latitude) || 26.7271;
    const baseLng = parseFloat(structure?.longitude) || parseFloat(site?.longitude) || 88.4315;
    setNewDeviceForm({
      id: `TECHA${Date.now().toString().slice(-5)}`,
      name: `Node on ${structure?.name || structureId}`,
      sensorType: 'Inclinometer',
      macAddress: 'AA:BB:CC:DD:EE:FF',
      latitude: baseLat,
      longitude: baseLng,
    });
    setAddDeviceModalOpen(true);
  };

  const handleSaveNewDevice = async (e) => {
    e.preventDefault();
    setSavingDevice(true);
    try {
      const res = await createDevice({
        ...newDeviceForm,
        structureId: structure?.id || structureId,
        siteId: structure?.siteId || site?.id || site?.siteId || null,
        projectId: structure?.projectId || project?.id || null,
        organizationId: structure?.organizationId || org?.id || null,
        latitude: newDeviceForm.latitude !== '' ? parseFloat(newDeviceForm.latitude) : null,
        longitude: newDeviceForm.longitude !== '' ? parseFloat(newDeviceForm.longitude) : null,
      });
      if (res?.device) {
        setAttachedDevices(prev => [res.device, ...prev]);
        setSelectedDevice(res.device);
      } else {
        await loadData();
      }
      setAddDeviceModalOpen(false);
      showToast('success', `Device ${newDeviceForm.id} added to ${structure?.name} with GPS location.`);
    } catch (err) {
      showToast('error', err.message || 'Failed to add device.');
    } finally {
      setSavingDevice(false);
    }
  };

  const handleDeviceLocationSaved = (updatedDevice) => {
    setAttachedDevices(prev =>
      prev.map(d => (String(d.id) === String(updatedDevice.id) ? { ...d, ...updatedDevice } : d))
    );
    if (selectedDevice && String(selectedDevice.id) === String(updatedDevice.id)) {
      setSelectedDevice(prev => ({ ...prev, ...updatedDevice }));
    }
    showToast('success', `Location updated for device ${updatedDevice.name || updatedDevice.id}.`);
  };

  const handleSaveAllMovedDevices = async (movedItems) => {
    if (!Array.isArray(movedItems) || movedItems.length === 0) return;
    try {
      const payload = movedItems.map(m => ({
        id: m.id || m.deviceId,
        deviceId: m.deviceId || m.id,
        latitude: m.latitude,
        longitude: m.longitude,
      }));
      let updatedList = [];
      try {
        const res = await updateStructureDeviceLocationsBulk(structure?.id || structureId, payload);
        updatedList = Array.isArray(res?.devices) ? res.devices : [];
      } catch {
        const results = await Promise.all(
          payload.map(item =>
            updateDevice(item.id, {
              latitude: item.latitude,
              longitude: item.longitude,
              structureId: structure?.id || structureId,
            }).catch(() => null)
          )
        );
        updatedList = results.map(r => r?.device).filter(Boolean);
      }

      const moveMap = new Map(payload.map(p => [String(p.id), p]));
      const updatedMap = new Map(updatedList.map(d => [String(d.id), d]));

      setAttachedDevices(prev =>
        prev.map(d => {
          const u = updatedMap.get(String(d.id));
          if (u) return { ...d, ...u };
          const m = moveMap.get(String(d.id));
          return m ? { ...d, latitude: m.latitude, longitude: m.longitude } : d;
        })
      );
      if (selectedDevice) {
        const m = moveMap.get(String(selectedDevice.id));
        if (m) {
          setSelectedDevice(prev => ({ ...prev, latitude: m.latitude, longitude: m.longitude }));
        }
      }
      showToast('success', `Updated GPS locations for ${movedItems.length} device(s) on the map.`);
    } catch (err) {
      showToast('error', err.message || 'Failed to save moved device locations.');
    }
  };

  return (
    <div className="space-y-4 font-sans text-black animate-fadeIn">
      {toastMsg.text && (
        <div className={`p-3 rounded-xl border flex items-center justify-between text-xs font-bold shadow-sm ${
          toastMsg.type === 'error'
            ? 'bg-rose-50 border-rose-200 text-rose-800'
            : 'bg-emerald-50 border-emerald-300 text-emerald-950'
        }`}>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{toastMsg.text}</span>
          </div>
          <button onClick={() => setToastMsg({ type: '', text: '' })} className="p-0.5 hover:opacity-70 cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {/* Top Breadcrumb & Action Row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/structures')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-300 hover:bg-slate-100 font-bold text-xs text-black shadow-2xs transition-all cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to All Assets</span>
          </button>

          <div className="text-xs text-slate-500 font-medium hidden sm:flex items-center gap-1.5">
            {org?.name && (
              <>
                <span>{org.name}</span>
                <span>/</span>
              </>
            )}
            {project?.name && (
              <>
                <span>{project.name}</span>
                <span>/</span>
              </>
            )}
            {site && (
              <>
                <Link
                  to={`/sites/${site.id || site.siteId}`}
                  className="text-blue-600 hover:underline font-bold"
                >
                  {site.name}
                </Link>
                <span>/</span>
              </>
            )}
            <span className="text-black font-bold">{structure?.name}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 text-white font-bold text-xs shadow-2xs">
            <Globe className="w-3.5 h-3.5" />
            <span>Satellite Map</span>
          </div>

          {/* Top Enable / Disable Device Location Drag Button (Default OFF) */}
          <button
            type="button"
            onClick={() => {
              const next = !dragLocationEnabled;
              setDragLocationEnabled(next);
              if (!next) setEditingMapDevice(null);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all shadow-2xs cursor-pointer ${
              dragLocationEnabled
                ? 'bg-emerald-600 border-emerald-600 text-white ring-2 ring-emerald-200'
                : 'border-slate-300 bg-white hover:bg-slate-50 text-black'
            }`}
            title="Enable or disable dragging device locations on the map"
          >
            <MapPin className={`w-3.5 h-3.5 ${dragLocationEnabled ? 'text-white' : 'text-blue-600'}`} />
            <span>{dragLocationEnabled ? 'Disable Drag Location' : 'Enable Drag Location'}</span>
          </button>

          {/* Collapsible Analytics Toggle */}
          <button
            onClick={() => setShowAnalytics(!showAnalytics)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all shadow-2xs cursor-pointer ${
              showAnalytics
                ? 'bg-blue-50 border-blue-300 text-blue-700'
                : 'border-slate-300 bg-white hover:bg-slate-50 text-black'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Analytics</span>
          </button>

          <button
            onClick={loadData}
            className="p-2 rounded-xl border border-slate-300 hover:bg-slate-100 text-black transition-colors cursor-pointer"
            title="Refresh Data"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Asset Header Info Card */}
      <div className={cardCls}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl font-black text-black tracking-tight">
                {structure?.name || `Asset ${structure?.id}`}
              </h1>

              {/* Slope Asset Type Badge */}
              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${typeConfig.badgeCls}`}>
                <TypeIcon className="w-3.5 h-3.5" />
                <span>{typeConfig.label}</span>
              </span>

              {/* Status Badge */}
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${stabilityBadge}`}>
                {stabilityStatus === 'STABLE' ? 'Slope Stable' : stabilityStatus === 'WARNING' ? 'Monitoring Alert' : 'Critical Hazard'}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-700 font-medium">
              <span className="flex items-center gap-1">
                <Hash className="w-3.5 h-3.5 text-slate-500" />
                <span className="font-mono">ID: {structure?.structureId || structure?.id}</span>
              </span>

              {site && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-blue-600" />
                  <span>Site: </span>
                  <Link to={`/sites/${site.id || site.siteId}`} className="font-bold text-blue-700 hover:underline">
                    {site.name}
                  </Link>
                </span>
              )}

              {structure?.heightElevation && (
                <span className="flex items-center gap-1">
                  <Mountain className="w-3.5 h-3.5 text-slate-500" />
                  <span className="font-mono">Elev: {structure.heightElevation}m</span>
                </span>
              )}

              {structure?.latitude && structure?.longitude && (
                <span className="flex items-center gap-1 font-mono text-slate-600">
                  <Navigation className="w-3 h-3 text-slate-500" />
                  <span>{Number(structure.latitude).toFixed(4)}° N, {Number(structure.longitude).toFixed(4)}° E</span>
                </span>
              )}
            </div>

            {structure?.description && (
              <p className="text-xs text-slate-600 max-w-3xl pt-0.5">
                {structure.description}
              </p>
            )}
          </div>

          {/* Quick Metrics Badges */}
          <div className="flex items-center gap-3">
            <div className="text-right px-3 py-2 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Inclinometers</div>
              <div className="text-sm font-black text-black font-mono">
                {attachedDevices.length} <span className="text-[11px] font-normal text-emerald-700 font-bold">({onlineCount} live)</span>
              </div>
            </div>

            <div className="text-right px-3 py-2 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Max Displacement</div>
              <div className="text-sm font-black text-black font-mono">
                Δ {maxDisp.toFixed(2)} mm
              </div>
            </div>

            <div className="text-right px-3 py-2 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Avg Tilt</div>
              <div className="text-sm font-black text-purple-700 font-mono">
                θ {avgTilt.toFixed(2)}°
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Collapsible Analytics Row */}
      {showAnalytics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 animate-fadeIn">
          <div className={cardCls}>
            <div className="flex items-center justify-between pb-1">
              <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Attached Inclinometers</span>
              <Cpu className="w-4 h-4 text-blue-600" />
            </div>
            <div className="text-xl font-black text-black font-mono mt-1">{attachedDevices.length}</div>
            <div className="text-[11px] text-slate-600 font-medium mt-0.5">
              <span className="text-emerald-700 font-bold">{onlineCount} online</span>
              {offlineCount > 0 && <span className="text-amber-700 font-bold"> &bull; {offlineCount} offline</span>}
            </div>
          </div>

          <div className={cardCls}>
            <div className="flex items-center justify-between pb-1">
              <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Peak Displacement</span>
              <TrendingUp className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-xl font-black text-black font-mono mt-1">Δ {maxDisp.toFixed(2)} mm</div>
            <div className="text-[11px] text-slate-600 font-medium mt-0.5">
              Alert threshold: 15.0 mm
            </div>
          </div>

          <div className={cardCls}>
            <div className="flex items-center justify-between pb-1">
              <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Mean Resultant Tilt</span>
              <Activity className="w-4 h-4 text-purple-600" />
            </div>
            <div className="text-xl font-black text-purple-700 font-mono mt-1">θ {avgTilt.toFixed(2)}°</div>
            <div className="text-[11px] text-slate-600 font-medium mt-0.5">
              Dual-axis MEMS vector
            </div>
          </div>

          <div className={cardCls}>
            <div className="flex items-center justify-between pb-1">
              <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Slope Stability Status</span>
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-xl font-black text-emerald-700 font-mono mt-1">
              {stabilityStatus === 'STABLE' ? 'STABLE (98.4%)' : stabilityStatus}
            </div>
            <div className="text-[11px] text-slate-600 font-medium mt-0.5">
              Continuous 24/7 telemetry
            </div>
          </div>
        </div>
      )}

      {/* Main Layout: Left Map / Right Devices */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left 8-9 Cols: Interactive Map (Scoped strictly to THIS Structural Asset & its devices) */}
        <div className="lg:col-span-8 space-y-3">
          {selectedDevice && (
            <div className="p-3 rounded-2xl border border-blue-200 bg-blue-50/80 flex flex-wrap items-center justify-between gap-2 text-xs shadow-2xs animate-fadeIn">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-blue-600 shrink-0" />
                <div>
                  <span className="font-bold text-slate-900">Selected Device: {selectedDevice.name || selectedDevice.id}</span>
                  <span className="ml-2 font-mono text-[11px] text-slate-600">({selectedDevice.id})</span>
                  <div className="text-[11px] font-mono text-blue-800 mt-0.5">
                    {selectedDevice.latitude != null && selectedDevice.longitude != null
                      ? `GPS: ${Number(selectedDevice.latitude).toFixed(5)}° N, ${Number(selectedDevice.longitude).toFixed(5)}° E`
                      : 'GPS: Not set yet'}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingMapDevice(selectedDevice)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-2xs transition-colors cursor-pointer"
                >
                  <Edit className="w-3.5 h-3.5" />
                  <span>Move / Update Location on Map</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedDevice(null)}
                  className="p-1.5 rounded-lg text-slate-500 hover:bg-blue-100 hover:text-black cursor-pointer"
                  title="Clear selection"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          <LocationMapView
            sites={[]} // Focus strictly on this Structural Asset and its attached devices
            devices={attachedDevices}
            structures={structure ? [structure] : []}
            projects={project ? [project] : []}
            organizations={org ? [org] : []}
            initialSelectedSiteId="ALL"
            onSelectSite={() => {}}
            enableDeviceDrag={true}
            dragActive={dragLocationEnabled}
            onDragActiveChange={setDragLocationEnabled}
            onSaveAllDeviceLocations={async (items) => {
              await handleSaveAllMovedDevices(items);
              setDragLocationEnabled(false);
            }}
            editingDevice={editingMapDevice}
            onClearEditingDevice={() => setEditingMapDevice(null)}
          />
        </div>

        {/* Right 3-4 Cols: Attached Hardware Inclinometers & Site Structures */}
        <div className="lg:col-span-4 space-y-4">
          <div className={cardCls}>
            {/* Tab Switcher: Devices Under Asset vs Site Structures */}
            <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl mb-3 border border-slate-200">
              <button
                type="button"
                onClick={() => setSidebarTab('devices')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  sidebarTab === 'devices'
                    ? 'bg-white text-blue-900 shadow-xs border border-blue-200'
                    : 'text-slate-600 hover:text-black hover:bg-slate-200/60'
                }`}
              >
                <Cpu className="w-3.5 h-3.5 text-blue-600" />
                <span>Devices ({attachedDevices.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setSidebarTab('structures')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  sidebarTab === 'structures'
                    ? 'bg-white text-blue-900 shadow-xs border border-blue-200'
                    : 'text-slate-600 hover:text-black hover:bg-slate-200/60'
                }`}
              >
                <Mountain className="w-3.5 h-3.5 text-blue-600" />
                <span>Site Structures ({siteStructures.length})</span>
              </button>
            </div>

            {/* TAB 1: Devices Under Asset */}
            {sidebarTab === 'devices' ? (
              <div className="space-y-3">
                {/* Search Device + Add Device Row */}
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={deviceSearch}
                      onChange={(e) => setDeviceSearch(e.target.value)}
                      placeholder="Search device ID, name..."
                      className="w-full pl-8 pr-7 py-1.5 text-xs bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-blue-500 rounded-xl outline-none transition-all placeholder:text-slate-400 font-medium"
                    />
                    {deviceSearch && (
                      <button
                        type="button"
                        onClick={() => setDeviceSearch('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-black cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleOpenAddDevice}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-black hover:bg-neutral-800 text-white font-bold text-[11px] shadow-2xs transition-colors cursor-pointer shrink-0"
                    title="Add new device to this Structural Asset"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add</span>
                  </button>
                </div>

                <div className="space-y-2 max-h-[440px] overflow-y-auto pr-1">
                  {filteredAttachedDevices.length === 0 ? (
                    <div className="text-center py-8 text-slate-500 text-xs space-y-1.5">
                      {deviceSearch ? (
                        <>
                          <p className="font-bold text-slate-700">No matching devices found</p>
                          <p className="text-[11px] text-slate-400">Clear search query to see all {attachedDevices.length} devices</p>
                        </>
                      ) : (
                        <>
                          <p className="font-bold text-slate-700">No inclinometers attached</p>
                          <p className="text-[11px] text-slate-400">Click "+ Add" above to attach an inclinometer node with GPS location.</p>
                        </>
                      )}
                    </div>
                  ) : (
                    filteredAttachedDevices.map(d => {
                      const isOnline = (d.status || 'ONLINE') === 'ONLINE';
                      const disp = Number(d.totalDisplacement || d.displacement?.totalDisplacement_mm || 0.18);
                      const tiltVal = Number(d.resultantTilt || d.tilt?.tilt || 0.22);
                      const isSelected = selectedDevice?.id === d.id;
                      const hasGps = d.latitude !== null && d.latitude !== undefined && d.latitude !== '' &&
                                     d.longitude !== null && d.longitude !== undefined && d.longitude !== '';

                      return (
                        <div
                          key={d.id}
                          onClick={() => setSelectedDevice(d)}
                          className={`p-3 rounded-xl border transition-all cursor-pointer space-y-2 ${
                            isSelected
                              ? 'border-blue-600 bg-blue-50/50 shadow-xs'
                              : 'border-slate-200 bg-white hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="font-bold text-black text-xs truncate max-w-[170px]" title={d.name || d.id}>
                              {d.name || d.id}
                            </div>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              isOnline
                                ? 'bg-emerald-100 text-emerald-950 border border-emerald-300'
                                : 'bg-amber-100 text-amber-950 border border-amber-300'
                            }`}>
                              {d.status || 'ONLINE'}
                            </span>
                          </div>

                          <div className="font-mono text-[11px] text-slate-700 flex justify-between">
                            <span>Node: {d.id}</span>
                            <span className="font-bold text-black">Δ {disp.toFixed(1)}mm</span>
                          </div>

                          {/* GPS Location Badge */}
                          <div className="flex items-center justify-between text-[10.5px] font-mono bg-slate-50 px-2 py-1 rounded-lg border border-slate-200/80">
                            <span className="flex items-center gap-1 text-slate-600 truncate">
                              <MapPin className="w-3 h-3 text-blue-600 shrink-0" />
                              {hasGps ? (
                                <span>{Number(d.latitude).toFixed(4)}°, {Number(d.longitude).toFixed(4)}°</span>
                              ) : (
                                <span className="italic text-slate-400 font-sans">No GPS set</span>
                              )}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedDevice(d);
                                setEditingMapDevice(d);
                              }}
                              className="text-blue-600 hover:text-blue-800 font-sans font-bold underline cursor-pointer shrink-0 ml-1"
                            >
                              Edit Map
                            </button>
                          </div>

                          <div className="flex items-center justify-between text-[11px] font-mono text-slate-700 pt-1 border-t border-slate-100">
                            <span className="text-purple-700 font-bold">θ {tiltVal.toFixed(1)}°</span>
                            <div className="flex items-center gap-2">
                              <span className="flex items-center gap-0.5 text-emerald-700 font-bold">
                                <Zap className="w-3 h-3" /> {formatBatteryPercentage(d.battery ?? d.batteryVoltage)}
                              </span>
                              <span className="flex items-center gap-0.5 text-blue-700 font-bold">
                                <Radio className="w-3 h-3" /> {formatCSQPercentage(d.signal ?? d.signalStrength)}
                              </span>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-1.5 mt-1">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedDevice(d);
                                setEditingMapDevice(d);
                              }}
                              className="flex items-center justify-center gap-1 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-bold text-[10px] transition-colors cursor-pointer"
                            >
                              <MapPin className="w-3 h-3" />
                              <span>Edit Location</span>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/devices/${d.id}`);
                              }}
                              className="flex items-center justify-center gap-1 py-1.5 rounded-lg bg-black hover:bg-neutral-800 text-white font-bold text-[10px] shadow-2xs transition-colors cursor-pointer"
                            >
                              <span>Console</span>
                              <ExternalLink className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ) : (
              /* TAB 2: Site Structures List */
              <div className="space-y-3">
                {/* Search Structure Input */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={structureSearch}
                    onChange={(e) => setStructureSearch(e.target.value)}
                    placeholder="Search site structures by name or ID..."
                    className="w-full pl-8 pr-8 py-1.5 text-xs bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-blue-500 rounded-xl outline-none transition-all placeholder:text-slate-400 font-medium"
                  />
                  {structureSearch && (
                    <button
                      type="button"
                      onClick={() => setStructureSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-black cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="space-y-2 max-h-[440px] overflow-y-auto pr-1">
                  {filteredSiteStructures.length === 0 ? (
                    <div className="text-center py-8 text-slate-500 text-xs">
                      No structures found at this site.
                    </div>
                  ) : (
                    filteredSiteStructures.map(st => {
                      const isCurrent = st.id === structure?.id || String(st.id) === String(structureId);
                      const typeCfg = getAssetTypeConfig(st.type);
                      const TypeIcon = typeCfg?.icon || Mountain;
                      const attachedCount = (st.Devices?.length) ?? attachedDevices.filter(d => d.structureId === st.id).length;

                      return (
                        <div
                          key={st.id}
                          className={`p-3 rounded-xl border transition-all space-y-2.5 ${
                            isCurrent
                              ? 'border-blue-500 bg-blue-50/60 shadow-xs ring-1 ring-blue-300'
                              : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50/50'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <div className="font-bold text-black text-xs truncate max-w-[160px]" title={st.name}>
                              {st.name || st.structureId || st.id}
                            </div>
                            {isCurrent ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-600 text-white">
                                Active Asset
                              </span>
                            ) : (
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${typeCfg.badgeCls}`}>
                                <TypeIcon className="w-3 h-3" />
                                <span>{typeCfg.label}</span>
                              </span>
                            )}
                          </div>

                          <div className="flex items-center justify-between text-[11px] text-slate-600 font-mono">
                            <span>ID: {st.structureId || st.id}</span>
                            <span className="font-bold text-blue-700">{attachedCount} Node{attachedCount === 1 ? '' : 's'}</span>
                          </div>

                          {(st.latitude || st.heightElevation || st.height) && (
                            <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono pt-1 border-t border-slate-100">
                              <span>Elev: {st.heightElevation || st.height || 0}m</span>
                              {st.latitude && st.longitude && (
                                <span>{Number(st.latitude).toFixed(3)}, {Number(st.longitude).toFixed(3)}</span>
                              )}
                            </div>
                          )}

                          {!isCurrent && (
                            <button
                              type="button"
                              onClick={() => navigate(`/structures/${st.id}`)}
                              className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] shadow-2xs transition-colors cursor-pointer"
                            >
                              <span>Open Structure Details</span>
                              <ExternalLink className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Asset Metadata & Geotechnical Specs Card */}
          <div className={cardCls}>
            <div className="flex items-center gap-1.5 pb-2.5 border-b border-slate-200 mb-3">
              <Info className="w-4 h-4 text-blue-600" />
              <h3 className="text-xs font-black text-black uppercase tracking-wider">Asset Specifications</h3>
            </div>

            <div className="space-y-2 text-xs font-medium">
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Asset Name:</span>
                <span className="font-bold text-black">{structure?.name}</span>
              </div>

              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Asset ID:</span>
                <span className="font-mono font-bold text-black">{structure?.structureId || structure?.id}</span>
              </div>

              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Slope Asset Type:</span>
                <span className="font-bold text-black">{structure?.type || 'Mountain Slope'}</span>
              </div>

              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Elevation:</span>
                <span className="font-mono font-bold text-black">{structure?.heightElevation || 0} m</span>
              </div>

              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Coverage Aria / Radius:</span>
                <span className="font-mono font-bold text-black">{structure?.ariaRadius || 60} m</span>
              </div>

              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Coordinates:</span>
                <span className="font-mono font-bold text-black">
                  {structure?.latitude && structure?.longitude
                    ? `${Number(structure.latitude).toFixed(4)}°, ${Number(structure.longitude).toFixed(4)}°`
                    : 'N/A'}
                </span>
              </div>

              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Site Structures:</span>
                <span className="font-bold text-blue-700">{siteStructures.length} assets at this site</span>
              </div>

              {structure?.createdAt && (
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">Registered:</span>
                  <span className="font-mono text-slate-700">
                    {new Date(structure.createdAt).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Add Device Modal with Map Picker */}
      {addDeviceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-xs p-4">
          <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white text-black shadow-2xl overflow-hidden animate-fadeIn">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50">
              <div>
                <h3 className="text-sm font-black text-black flex items-center gap-2">
                  <Plus className="w-4 h-4 text-blue-600" />
                  <span>Add Device to {structure?.name}</span>
                </h3>
                <p className="text-[11px] text-slate-600">Pick exact device GPS location on the map below</p>
              </div>
              <button
                type="button"
                onClick={() => setAddDeviceModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:text-black hover:bg-slate-200/70 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveNewDevice} className="p-5 space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-extrabold text-slate-800 mb-1">Device ID *</label>
                  <input
                    type="text"
                    required
                    value={newDeviceForm.id}
                    onChange={(e) => setNewDeviceForm({ ...newDeviceForm, id: e.target.value })}
                    placeholder="e.g. TECHA12346"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 focus:bg-white focus:border-blue-500 outline-none font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block font-extrabold text-slate-800 mb-1">Device Name *</label>
                  <input
                    type="text"
                    required
                    value={newDeviceForm.name}
                    onChange={(e) => setNewDeviceForm({ ...newDeviceForm, name: e.target.value })}
                    placeholder="e.g. Slope Node A"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 focus:bg-white focus:border-blue-500 outline-none font-bold"
                  />
                </div>
              </div>

              <MapPicker
                latitude={parseFloat(newDeviceForm.latitude) || parseFloat(structure?.latitude) || 26.7271}
                longitude={parseFloat(newDeviceForm.longitude) || parseFloat(structure?.longitude) || 88.4315}
                deployedDevices={attachedDevices}
                height="260px"
                onChange={({ latitude, longitude }) =>
                  setNewDeviceForm(prev => ({ ...prev, latitude, longitude }))
                }
              />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-extrabold text-slate-800 mb-1">Latitude</label>
                  <input
                    type="number"
                    step="any"
                    value={newDeviceForm.latitude}
                    onChange={(e) => setNewDeviceForm({ ...newDeviceForm, latitude: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 focus:bg-white font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block font-extrabold text-slate-800 mb-1">Longitude</label>
                  <input
                    type="number"
                    step="any"
                    value={newDeviceForm.longitude}
                    onChange={(e) => setNewDeviceForm({ ...newDeviceForm, longitude: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 focus:bg-white font-mono font-bold"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAddDeviceModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingDevice}
                  className="px-5 py-2 rounded-xl bg-black hover:bg-neutral-800 text-white font-bold shadow-xs cursor-pointer disabled:opacity-60"
                >
                  {savingDevice ? 'Attaching...' : 'Attach Device'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

