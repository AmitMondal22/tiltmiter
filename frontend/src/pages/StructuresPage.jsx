import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit, Trash2, X, CheckCircle2, ChevronRight, Cpu, Layers, Map as MapIcon, List, Shield, Box, MapPin, Activity, Zap, Radio, ExternalLink } from 'lucide-react';
import { getStructures, getSites, getProjects, getOrganizations, createStructure, updateStructure, deleteStructure, createDevice, getDevices, updateDevice, updateStructureDeviceLocationsBulk } from '../api/apiClient';
import { ASSET_TYPES, getAssetTypeConfig } from '../components/AssetsMapView';
import LocationMapView from '../components/LocationMapView';
import MapPicker from '../components/MapPicker';

export default function StructuresPage() {
  const navigate = useNavigate();
  const cardCls = 'rounded-2xl border border-slate-200 bg-white p-5 text-black shadow-xs';

  const [viewMode, setViewMode] = useState('list'); // 'list', 'map', or '3d'
  const [structuresList, setStructuresList] = useState([]);
  const [devicesList, setDevicesList] = useState([]);
  const [sitesList, setSitesList] = useState([]);
  const [projectsList, setProjectsList] = useState([]);
  const [orgsList, setOrgsList] = useState([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingStruct, setEditingStruct] = useState(null);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [selectedDeviceInAsset, setSelectedDeviceInAsset] = useState(null);
  const [dragLocationEnabled, setDragLocationEnabled] = useState(false);
  const [editingMapDevice, setEditingMapDevice] = useState(null);
  const [deviceModalOpen, setDeviceModalOpen] = useState(false);
  const [isCustomType, setIsCustomType] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });

  const [formData, setFormData] = useState({
    name: '',
    organizationId: '',
    projectId: '',
    siteId: '',
    type: 'Mountain Slope',
    heightElevation: '12.5',
    latitude: '',
    longitude: '',
    description: '',
  });

  const [deviceForm, setDeviceForm] = useState({
    id: '',
    name: '',
    sensorType: 'Inclinometer',
    macAddress: '',
    latitude: '',
    longitude: '',
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [structRes, devRes, siteRes, projRes, orgRes] = await Promise.all([
        getStructures().catch(() => ({ structures: [] })),
        getDevices().catch(() => ({ devices: [] })),
        getSites().catch(() => ({ sites: [] })),
        getProjects().catch(() => ({ projects: [] })),
        getOrganizations().catch(() => ({ organizations: [] })),
      ]);

      if (structRes?.structures) setStructuresList(structRes.structures);
      if (devRes?.devices) setDevicesList(devRes.devices);
      if (siteRes?.sites) setSitesList(siteRes.sites);
      if (projRes?.projects) setProjectsList(projRes.projects);
      if (orgRes?.organizations) setOrgsList(orgRes.organizations);
    } catch (e) {
      setStructuresList([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenAdd = () => {
    setEditingStruct(null);
    setIsCustomType(false);
    setFormData({
      name: '',
      organizationId: orgsList[0]?.id || '',
      projectId: projectsList[0]?.id || '',
      siteId: sitesList[0]?.id || sitesList[0]?.siteId || '',
      type: 'Mountain Slope',
      heightElevation: '12.5',
      latitude: '26.7271',
      longitude: '88.4315',
      description: '',
    });
    setModalOpen(true);
  };

  const handleOpenEdit = (st) => {
    setEditingStruct(st);
    const isKnown = Boolean(st.type && Object.keys(ASSET_TYPES).includes(st.type));
    setIsCustomType(!isKnown);
    setFormData({
      name: st.name,
      organizationId: st.organizationId || '',
      projectId: st.projectId || '',
      siteId: st.siteId || '',
      type: st.type || 'Mountain Slope',
      heightElevation: st.heightElevation || '12.5',
      latitude: st.latitude || '',
      longitude: st.longitude || '',
      description: st.description || '',
    });
    setModalOpen(true);
  };

  const handleOpenMapForAsset = (st) => {
    setSelectedAsset(st);
    setViewMode('map');
  };

  const handleOpen3DForAsset = (st) => {
    setSelectedAsset(st);
    setViewMode('3d');
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      if (editingStruct) {
        const res = await updateStructure(editingStruct.id, formData);
        const updated = res?.structure || { ...editingStruct, ...formData };
        setStructuresList(prev => prev.map(s => s.id === editingStruct.id ? updated : s));
        setMsg({ type: 'success', text: `Asset ${formData.name} updated.` });
      } else {
        const res = await createStructure(formData);
        if (res?.structure) {
          setStructuresList(prev => [res.structure, ...prev]);
        } else {
          loadData();
        }
        setMsg({ type: 'success', text: `Asset ${formData.name} created.` });
      }
      setModalOpen(false);
    } catch (err) {
      setMsg({ type: 'error', text: err.message || 'Error saving asset' });
    } finally {
      setTimeout(() => setMsg({ type: '', text: '' }), 3500);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this asset?')) {
      await deleteStructure(id).catch(() => {});
      setStructuresList(prev => prev.filter(s => s.id !== id));
      if (selectedAsset?.id === id) setSelectedAsset(null);
      setMsg({ type: 'success', text: `Asset deleted.` });
      setTimeout(() => setMsg({ type: '', text: '' }), 3000);
    }
  };

  const handleSaveDevice = async (e) => {
    e.preventDefault();
    try {
      const res = await createDevice({
        ...deviceForm,
        structureId: selectedAsset.id,
        siteId: selectedAsset.siteId || null,
        projectId: selectedAsset.projectId || null,
        organizationId: selectedAsset.organizationId || null,
        latitude: deviceForm.latitude !== '' && deviceForm.latitude !== null ? parseFloat(deviceForm.latitude) : null,
        longitude: deviceForm.longitude !== '' && deviceForm.longitude !== null ? parseFloat(deviceForm.longitude) : null,
      });
      const createdDev = res?.device || {
        ...deviceForm,
        structureId: selectedAsset.id,
        siteId: selectedAsset.siteId,
        status: 'ONLINE',
      };
      setDevicesList(prev => [createdDev, ...prev]);
      setSelectedAsset(prev =>
        prev ? { ...prev, Devices: [createdDev, ...(prev.Devices || [])] } : prev
      );
      setMsg({ type: 'success', text: `Device ${deviceForm.id} attached to ${selectedAsset.name}.` });
      setDeviceModalOpen(false);
      loadData();
    } catch (err) {
      setMsg({ type: 'error', text: err.message || 'Error attaching device' });
    } finally {
      setTimeout(() => setMsg({ type: '', text: '' }), 3500);
    }
  };

  const handleDeviceLocationSaved = (updatedDevice) => {
    setDevicesList(prev =>
      prev.map(d => (String(d.id) === String(updatedDevice.id) ? { ...d, ...updatedDevice } : d))
    );
    setStructuresList(prev =>
      prev.map(st => ({
        ...st,
        Devices: (st.Devices || []).map(d =>
          String(d.id) === String(updatedDevice.id) ? { ...d, ...updatedDevice } : d
        ),
      }))
    );
    setSelectedAsset(prev =>
      prev
        ? {
            ...prev,
            Devices: (prev.Devices || []).map(d =>
              String(d.id) === String(updatedDevice.id) ? { ...d, ...updatedDevice } : d
            ),
          }
        : prev
    );
    if (selectedDeviceInAsset && String(selectedDeviceInAsset.id) === String(updatedDevice.id)) {
      setSelectedDeviceInAsset(prev => ({ ...prev, ...updatedDevice }));
    }
    setMsg({
      type: 'success',
      text: `Updated location for ${updatedDevice.name || updatedDevice.id} (${Number(updatedDevice.latitude).toFixed(4)}°, ${Number(updatedDevice.longitude).toFixed(4)}°).`,
    });
    setTimeout(() => setMsg({ type: '', text: '' }), 4000);
  };

  const handleSaveAllMovedDevices = async (movedItems) => {
    if (!selectedAsset || !Array.isArray(movedItems) || movedItems.length === 0) return;
    try {
      const payload = movedItems.map(m => ({
        id: m.id || m.deviceId,
        deviceId: m.deviceId || m.id,
        latitude: m.latitude,
        longitude: m.longitude,
      }));
      try {
        await updateStructureDeviceLocationsBulk(selectedAsset.id, payload);
      } catch {
        await Promise.all(
          payload.map(item =>
            updateDevice(item.id, {
              latitude: item.latitude,
              longitude: item.longitude,
              structureId: selectedAsset.id,
            }).catch(() => null)
          )
        );
      }

      const moveMap = new Map(payload.map(p => [String(p.id), p]));
      const patchDevice = (d) => {
        const m = moveMap.get(String(d.id));
        return m ? { ...d, latitude: m.latitude, longitude: m.longitude } : d;
      };

      setDevicesList(prev => prev.map(patchDevice));
      setStructuresList(prev =>
        prev.map(st => ({ ...st, Devices: (st.Devices || []).map(patchDevice) }))
      );
      setSelectedAsset(prev =>
        prev ? { ...prev, Devices: (prev.Devices || []).map(patchDevice) } : prev
      );
      if (selectedDeviceInAsset) {
        setSelectedDeviceInAsset(prev => (prev ? patchDevice(prev) : prev));
      }

      setMsg({
        type: 'success',
        text: `Saved GPS locations for ${movedItems.length} moved device(s) under ${selectedAsset.name}.`,
      });
      setTimeout(() => setMsg({ type: '', text: '' }), 4000);
    } catch (err) {
      setMsg({ type: 'error', text: err.message || 'Failed to save moved device locations.' });
      setTimeout(() => setMsg({ type: '', text: '' }), 4000);
    }
  };

  return (
    <div className="space-y-4 font-sans text-black animate-fadeIn">
      {/* Toast */}
      {msg.text && (
        <div className="p-3.5 rounded-xl border flex items-center gap-2 text-xs font-bold bg-emerald-50 border-emerald-300 text-emerald-950 shadow-sm animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-700" />
          <span>{msg.text}</span>
        </div>
      )}

      {/* Top Header Row with View Mode Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-black flex items-center gap-2">
            <Layers className="w-5 h-5 text-blue-600" />
            <span>Structural Assets</span>
          </h2>
          <p className="text-xs text-slate-700 font-medium mt-0.5">
            {structuresList.length} registered geotechnical assets &bull; Coverage Areas ("aria"), Color Types & Live Inclinometers
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleOpenAdd}
            className="flex items-center gap-1.5 px-4 py-2 bg-black text-white font-bold text-xs rounded-xl shadow-xs hover:bg-neutral-800 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Asset</span>
          </button>
        </div>
      </div>

      {/* Assets Table */}
      <div className={cardCls}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b-2 border-slate-200 text-black font-extrabold uppercase text-[11px] tracking-wider">
                  <th className="py-3 px-3.5">Asset Name</th>
                  <th className="py-3 px-3.5">Type & Elevation</th>
                  <th className="py-3 px-3.5">Site Location</th>
                  <th className="py-3 px-3.5">Attached Devices</th>
                  <th className="py-3 px-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-black font-medium">
                {loading && structuresList.length === 0 ? (
                  Array.from({ length: 5 }).map((_, idx) => (
                    <tr key={`skel-${idx}`}>
                      <td colSpan={5} className="py-3 px-3.5">
                        <div className="h-9 rounded-xl bg-slate-100 animate-pulse" />
                      </td>
                    </tr>
                  ))
                ) : structuresList.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500 text-xs">
                      No structural assets registered yet. Click "+ Add Asset" to create one.
                    </td>
                  </tr>
                ) : (
                  structuresList.map(st => {
                    const site = sitesList.find(s => s.id === st.siteId || s.siteId === st.siteId);
                    const attachedDevs = (st.Devices && st.Devices.length > 0)
                      ? st.Devices
                      : devicesList.filter(d => d.structureId === st.id);
                    const typeConfig = getAssetTypeConfig(st.type);

                    return (
                      <tr key={st.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-4 px-3.5">
                          <div
                            onClick={() => navigate(`/structures/${st.id}`)}
                            className="font-bold text-black text-sm hover:text-blue-600 hover:underline cursor-pointer flex items-center gap-1.5"
                            title="Open dedicated asset view"
                          >
                            <span>{st.name}</span>
                            <ExternalLink className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          </div>
                          <div className="text-[11px] text-slate-700 font-mono mt-0.5">{st.description || 'Structural Asset'}</div>
                        </td>
                        <td className="py-4 px-3.5">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: typeConfig.color }} />
                            <span className="font-bold text-black">{st.type}</span>
                          </div>
                          <div className="text-[11px] text-slate-700 font-mono mt-0.5">{st.heightElevation}m</div>
                        </td>
                        <td className="py-4 px-3.5">
                          <div className="font-bold text-black">{site?.name || 'Assigned Location'}</div>
                        </td>
                        <td className="py-4 px-3.5">
                          <button
                            onClick={() => {
                              setDragLocationEnabled(false);
                              setEditingMapDevice(null);
                              setSelectedDeviceInAsset(null);
                              setSelectedAsset({ ...st, Devices: attachedDevs });
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-300 hover:bg-slate-100 font-bold text-black text-[11px] shadow-2xs cursor-pointer"
                          >
                            <Cpu className="w-3.5 h-3.5 text-black" />
                            <span>{attachedDevs.length} Devices</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </td>
                        <td className="py-4 px-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Open Dedicated Asset View Action */}
                            <button
                              onClick={() => navigate(`/structures/${st.id}`)}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] shadow-2xs transition-colors cursor-pointer"
                              title="Open dedicated asset view with map & devices"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              <span>Open Asset</span>
                            </button>

                            <button onClick={() => handleOpenEdit(st)} className="p-1.5 text-black hover:bg-slate-200 rounded-lg transition-colors cursor-pointer" title="Edit Asset">
                              <Edit className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleDelete(st.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer" title="Delete Asset">
                              <Trash2 className="w-4 h-4" />
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

      {/* Attach Device Modal / Detailed Attached Devices Panel (Scoped to selected Structural Asset) */}
      {selectedAsset && (() => {
        const assetDevices = (selectedAsset.Devices && selectedAsset.Devices.length > 0)
          ? selectedAsset.Devices.map(d => devicesList.find(full => String(full.id) === String(d.id)) || d)
          : devicesList.filter(d => String(d.structureId) === String(selectedAsset.id));
        const parentSite = sitesList.find(s => String(s.id || s.siteId) === String(selectedAsset.siteId));

        return (
          <div className="p-5 rounded-2xl border-2 border-slate-300 bg-slate-50 text-black space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-black text-black flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-blue-600" />
                  <span>Inclinometer Devices Attached to: {selectedAsset.name} ({selectedAsset.id || selectedAsset.code})</span>
                </h3>
                <p className="text-xs text-slate-700 mt-0.5">
                  Showing only devices under this Structural Asset &bull; Select a device or click "Edit Location" to pick GPS on map
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Top Enable / Disable Device Location Drag Button (Default OFF) */}
                <button
                  type="button"
                  onClick={() => {
                    const next = !dragLocationEnabled;
                    setDragLocationEnabled(next);
                    if (!next) setEditingMapDevice(null);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border font-bold text-xs shadow-2xs transition-all cursor-pointer ${
                    dragLocationEnabled
                      ? 'bg-emerald-600 border-emerald-600 text-white ring-2 ring-emerald-200'
                      : 'bg-white border-slate-300 hover:bg-slate-100 text-black'
                  }`}
                  title="Enable or disable dragging device locations on the map"
                >
                  <MapPin className={`w-3.5 h-3.5 ${dragLocationEnabled ? 'text-white' : 'text-blue-600'}`} />
                  <span>{dragLocationEnabled ? 'Disable Drag Location' : 'Enable Drag Location'}</span>
                </button>
                <button
                  onClick={() => {
                    setDeviceForm({
                      id: `TECHA${Date.now().toString().slice(-5)}`,
                      name: `Node on ${selectedAsset.name}`,
                      sensorType: 'Inclinometer',
                      macAddress: 'AA:BB:CC:DD:EE:FF',
                      latitude: selectedAsset.latitude || parentSite?.latitude || 26.7271,
                      longitude: selectedAsset.longitude || parentSite?.longitude || 88.4315,
                    });
                    setDeviceModalOpen(true);
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 bg-black text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer hover:bg-neutral-800"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Device to Asset</span>
                </button>
                <button
                  onClick={() => {
                    setSelectedAsset(null);
                    setSelectedDeviceInAsset(null);
                  }}
                  className="p-1.5 text-black hover:bg-slate-200 rounded-lg cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {selectedDeviceInAsset && (
              <div className="p-3 rounded-xl border border-blue-300 bg-blue-50 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-blue-600 shrink-0" />
                  <div>
                    <span className="font-bold text-black">Selected: {selectedDeviceInAsset.name || selectedDeviceInAsset.id}</span>
                    <span className="ml-2 font-mono text-slate-600">({selectedDeviceInAsset.id})</span>
                    <span className="ml-3 font-mono text-blue-800">
                      {selectedDeviceInAsset.latitude != null && selectedDeviceInAsset.longitude != null
                        ? `${Number(selectedDeviceInAsset.latitude).toFixed(5)}°, ${Number(selectedDeviceInAsset.longitude).toFixed(5)}°`
                        : 'No GPS set'}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingMapDevice(selectedDeviceInAsset)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs cursor-pointer"
                >
                  <MapPin className="w-3.5 h-3.5" />
                  <span>Move / Edit on Map</span>
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
              {/* Left 7 Cols: Structural Asset Map showing ONLY this asset & its devices */}
              <div className="lg:col-span-7 rounded-xl overflow-hidden border border-slate-200 bg-white">
                <LocationMapView
                  sites={[]}
                  structures={[selectedAsset]}
                  devices={assetDevices}
                  projects={projectsList}
                  organizations={orgsList}
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

              {/* Right 5 Cols: Device Cards with Location & Edit Location button */}
              <div className="lg:col-span-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2.5 max-h-[520px] overflow-y-auto pr-1">
                {assetDevices.length === 0 ? (
                  <div className="col-span-full py-8 text-center text-slate-500 text-xs bg-white rounded-xl border border-slate-200">
                    No sensor nodes attached yet. Click "Add Device to Asset".
                  </div>
                ) : (
                  assetDevices.map(d => {
                    const isOnline = (d.status || 'ONLINE') === 'ONLINE';
                    const disp = 0;
                    const tilt = 0;
                    const isSelected = selectedDeviceInAsset?.id === d.id;
                    const hasGps = d.latitude !== null && d.latitude !== undefined && d.latitude !== '' &&
                                   d.longitude !== null && d.longitude !== undefined && d.longitude !== '';

                    return (
                      <div
                        key={d.id}
                        onClick={() => setSelectedDeviceInAsset(d)}
                        className={`p-3 rounded-xl border font-mono text-xs space-y-2 cursor-pointer transition-all ${
                          isSelected
                            ? 'border-blue-600 bg-blue-50/70 shadow-xs'
                            : 'border-slate-300 bg-white hover:border-blue-300'
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <div className="font-bold text-black">{d.id}</div>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-950 border border-emerald-300">
                            NORMAL
                          </span>
                        </div>
                        <div className="text-slate-700 text-[11px] font-sans font-semibold truncate">{d.name}</div>

                        <div className="flex items-center justify-between text-[10.5px] bg-slate-50 px-2 py-1 rounded-lg border border-slate-200">
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
                              setSelectedDeviceInAsset(d);
                              setEditingMapDevice(d);
                            }}
                            className="text-blue-600 hover:text-blue-800 font-sans font-bold underline cursor-pointer shrink-0 ml-1"
                          >
                            Edit Location
                          </button>
                        </div>

                        <div className="grid grid-cols-2 gap-1 pt-1 border-t border-slate-100 text-[11px]">
                          <div>
                            <span className="text-slate-500 block text-[10px]">Disp Δ:</span>
                            <span className="font-bold text-blue-700">{disp.toFixed(1)}mm</span>
                          </div>
                          <div>
                            <span className="text-slate-500 block text-[10px]">Tilt θ:</span>
                            <span className="font-bold text-purple-700">{tilt.toFixed(1)}°</span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal: Add / Edit Structural Asset */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white text-black shadow-2xl p-6">
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-200 mb-4">
              <h3 className="text-base font-black text-black">
                {editingStruct ? 'Edit Structural Asset' : 'Create Structural Asset'}
              </h3>
              <button onClick={() => setModalOpen(false)} className="text-black hover:bg-slate-100 p-1 rounded-lg cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3 text-xs text-black">
              <div>
                <label className="block text-black font-extrabold mb-1">Parent Location Site *</label>
                <select
                  required
                  value={formData.siteId}
                  onChange={e => setFormData({ ...formData, siteId: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border-2 border-slate-300 bg-white text-black font-bold"
                >
                  <option value="">Select Location</option>
                  {sitesList.map(s => (
                    <option key={s.id || s.siteId} value={s.id || s.siteId}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-black font-extrabold mb-1">Asset Name *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Retaining Wall Block 1"
                  className="w-full px-3 py-2 rounded-xl border-2 border-slate-300 bg-white text-black font-bold"
                />
              </div>

              <div>
                <label className="block text-black font-extrabold mb-1">Asset Type (Mountain / Hill / Slope)</label>
                <select
                  value={Object.keys(ASSET_TYPES).includes(formData.type) ? formData.type : '__CUSTOM__'}
                  onChange={e => {
                    const val = e.target.value;
                    if (val === '__CUSTOM__') {
                      setIsCustomType(true);
                      setFormData({ ...formData, type: '' });
                    } else {
                      setIsCustomType(false);
                      setFormData({ ...formData, type: val });
                    }
                  }}
                  className="w-full px-3 py-2 rounded-xl border-2 border-slate-300 bg-white text-black font-bold"
                >
                  {Object.keys(ASSET_TYPES).map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                  <option value="__CUSTOM__">+ Enter Custom Slope / Mountain Type...</option>
                </select>
                {(isCustomType || (formData.type && !Object.keys(ASSET_TYPES).includes(formData.type))) && (
                  <div className="mt-2">
                    <input
                      type="text"
                      required
                      value={formData.type}
                      onChange={e => setFormData({ ...formData, type: e.target.value })}
                      placeholder="e.g. Ridge Crest, North Valley Slope, Scree Slope..."
                      className="w-full px-3 py-2 rounded-xl border-2 border-blue-400 bg-blue-50/30 text-black font-bold"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">Enter any geotechnical, mountain, hill, or terrain slope type.</p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-black font-extrabold mb-1">Latitude</label>
                  <input
                    type="number"
                    step="any"
                    value={formData.latitude}
                    onChange={e => setFormData({ ...formData, latitude: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border-2 border-slate-300 bg-white text-black font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-black font-extrabold mb-1">Longitude</label>
                  <input
                    type="number"
                    step="any"
                    value={formData.longitude}
                    onChange={e => setFormData({ ...formData, longitude: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border-2 border-slate-300 bg-white text-black font-mono font-bold"
                  />
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-xl border-2 border-slate-300 text-black font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-black text-white font-bold hover:bg-neutral-800 shadow-xs cursor-pointer"
                >
                  Save Asset
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Device Modal (Add Device with Map Picker) */}
      {deviceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white text-black shadow-2xl p-6 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-200 mb-4">
              <div>
                <h3 className="text-base font-black text-black">Attach Device to {selectedAsset?.name || 'Asset'}</h3>
                <p className="text-[11px] text-slate-500">Pick exact GPS location for the new device on the map</p>
              </div>
              <button onClick={() => setDeviceModalOpen(false)} className="text-black hover:bg-slate-100 p-1 rounded-lg cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveDevice} className="space-y-3 text-xs text-black">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-black font-extrabold mb-1">Device ID *</label>
                  <input
                    type="text"
                    required
                    value={deviceForm.id}
                    onChange={e => setDeviceForm({ ...deviceForm, id: e.target.value })}
                    placeholder="e.g. TECHA12346"
                    className="w-full px-3 py-2 rounded-xl border-2 border-slate-300 bg-white text-black font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block text-black font-extrabold mb-1">Device Name *</label>
                  <input
                    type="text"
                    required
                    value={deviceForm.name}
                    onChange={e => setDeviceForm({ ...deviceForm, name: e.target.value })}
                    placeholder="e.g. Sensor Node A"
                    className="w-full px-3 py-2 rounded-xl border-2 border-slate-300 bg-white text-black font-bold"
                  />
                </div>
              </div>

              <MapPicker
                latitude={parseFloat(deviceForm.latitude) || parseFloat(selectedAsset?.latitude) || 26.7271}
                longitude={parseFloat(deviceForm.longitude) || parseFloat(selectedAsset?.longitude) || 88.4315}
                deployedDevices={
                  selectedAsset
                    ? devicesList.filter(d => String(d.structureId) === String(selectedAsset.id))
                    : []
                }
                height="250px"
                onChange={({ latitude, longitude }) =>
                  setDeviceForm(prev => ({ ...prev, latitude, longitude }))
                }
              />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-black font-extrabold mb-1">Latitude</label>
                  <input
                    type="number"
                    step="any"
                    value={deviceForm.latitude}
                    onChange={e => setDeviceForm({ ...deviceForm, latitude: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border-2 border-slate-300 bg-white text-black font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-black font-extrabold mb-1">Longitude</label>
                  <input
                    type="number"
                    step="any"
                    value={deviceForm.longitude}
                    onChange={e => setDeviceForm({ ...deviceForm, longitude: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border-2 border-slate-300 bg-white text-black font-mono font-bold"
                  />
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setDeviceModalOpen(false)}
                  className="px-4 py-2 rounded-xl border-2 border-slate-300 text-black font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-black text-white font-bold hover:bg-neutral-800 shadow-xs cursor-pointer"
                >
                  Attach Device
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
