import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, X, CheckCircle2, ChevronRight, Cpu, Layers, Map as MapIcon, List, Shield, Box, MapPin, Activity, Zap, Radio } from 'lucide-react';
import { getStructures, getSites, getProjects, getOrganizations, createStructure, updateStructure, deleteStructure, createDevice, getDevices } from '../api/apiClient';
import AssetsMapView, { ASSET_TYPES } from '../components/AssetsMapView';
import Landslide3DMapView from '../components/Landslide3DMapView';

export default function StructuresPage() {
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
  const [deviceModalOpen, setDeviceModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });

  const [formData, setFormData] = useState({
    name: '',
    code: '',
    organizationId: '',
    projectId: '',
    siteId: '',
    type: 'Crash Barrier',
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
    setFormData({
      name: '',
      code: `ASSET-${Date.now().toString().slice(-4)}`,
      organizationId: orgsList[0]?.id || '',
      projectId: projectsList[0]?.id || '',
      siteId: sitesList[0]?.id || sitesList[0]?.siteId || '',
      type: 'Crash Barrier',
      heightElevation: '12.5',
      latitude: '26.7271',
      longitude: '88.4315',
      description: '',
    });
    setModalOpen(true);
  };

  const handleOpenEdit = (st) => {
    setEditingStruct(st);
    setFormData({
      name: st.name,
      code: st.code || st.id,
      organizationId: st.organizationId || '',
      projectId: st.projectId || '',
      siteId: st.siteId || '',
      type: st.type || 'Crash Barrier',
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
        await updateStructure(editingStruct.id, formData);
        setStructuresList(prev => prev.map(s => s.id === editingStruct.id ? { ...s, ...formData } : s));
        setMsg({ type: 'success', text: `Asset ${formData.name} updated.` });
      } else {
        const res = await createStructure(formData);
        const newSt = res?.structure || { id: `STRUCT-${Date.now().toString().slice(-4)}`, ...formData, Devices: [] };
        setStructuresList(prev => [...prev, newSt]);
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
      await createDevice({
        ...deviceForm,
        structureId: selectedAsset.id,
        siteId: selectedAsset.siteId,
      });
      setMsg({ type: 'success', text: `Device ${deviceForm.id} attached to ${selectedAsset.name}.` });
      setDeviceModalOpen(false);
      loadData();
    } catch (err) {
      setMsg({ type: 'error', text: err.message || 'Error attaching device' });
    } finally {
      setTimeout(() => setMsg({ type: '', text: '' }), 3500);
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
            <span>Structural Assets & 3D Landslide Map</span>
          </h2>
          <p className="text-xs text-slate-700 font-medium mt-0.5">
            {structuresList.length} registered geotechnical assets &bull; Coverage Areas ("aria"), Color Types, 3D Slope DEM & Live Inclinometers
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Table vs 2D Map vs 3D Map Switcher */}
          <div className="flex items-center bg-slate-100 border border-slate-200 rounded-xl p-0.5 shadow-2xs">
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-bold text-xs transition-all cursor-pointer ${
                viewMode === 'list'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>Table View</span>
            </button>
            <button
              onClick={() => setViewMode('map')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-bold text-xs transition-all cursor-pointer ${
                viewMode === 'map'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <MapIcon className="w-3.5 h-3.5" />
              <span>2D Geospatial Area Map</span>
            </button>
            <button
              onClick={() => setViewMode('3d')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-bold text-xs transition-all cursor-pointer ${
                viewMode === '3d'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Box className="w-3.5 h-3.5" />
              <span>3D Landslide Slope Model</span>
            </button>
          </div>

          <button
            onClick={handleOpenAdd}
            className="flex items-center gap-1.5 px-4 py-2 bg-black text-white font-bold text-xs rounded-xl shadow-xs hover:bg-neutral-800 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Asset</span>
          </button>
        </div>
      </div>

      {/* Main View: Table View OR 2D Area Map View OR 3D Landslide Model */}
      {viewMode === 'list' ? (
        /* Assets Table */
        <div className={cardCls}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b-2 border-slate-200 text-black font-extrabold uppercase text-[11px] tracking-wider">
                  <th className="py-3 px-3.5">Asset Name</th>
                  <th className="py-3 px-3.5">Asset Code</th>
                  <th className="py-3 px-3.5">Type & Elevation</th>
                  <th className="py-3 px-3.5">Site Location</th>
                  <th className="py-3 px-3.5">Attached Inclinometer Devices</th>
                  <th className="py-3 px-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-black font-medium">
                {structuresList.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500 text-xs">
                      No structural assets registered yet. Click "+ Add Asset" to create one.
                    </td>
                  </tr>
                ) : (
                  structuresList.map(st => {
                    const site = sitesList.find(s => s.id === st.siteId || s.siteId === st.siteId);
                    const attachedDevs = (st.Devices && st.Devices.length > 0)
                      ? st.Devices
                      : devicesList.filter(d => d.structureId === st.id);
                    const typeConfig = ASSET_TYPES[st.type] || { color: '#2563eb' };

                    return (
                      <tr key={st.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-4 px-3.5">
                          <div className="font-bold text-black text-sm">{st.name}</div>
                          <div className="text-[11px] text-slate-700 font-mono mt-0.5">{st.description || 'Structural Asset'}</div>
                        </td>
                        <td className="py-4 px-3.5 font-mono font-bold text-black">
                          {st.code || st.id}
                        </td>
                        <td className="py-4 px-3.5">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: typeConfig.color }} />
                            <span className="font-bold text-black">{st.type}</span>
                          </div>
                          <div className="text-[11px] text-slate-700 font-mono mt-0.5">{st.heightElevation}m</div>
                        </td>
                        <td className="py-4 px-3.5">
                          <div className="font-bold text-black">{site?.name || st.siteId || '--'}</div>
                          <div className="text-[11px] text-slate-700 font-mono font-bold">{st.siteId}</div>
                        </td>
                        <td className="py-4 px-3.5">
                          <button
                            onClick={() => setSelectedAsset({ ...st, Devices: attachedDevs })}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-300 hover:bg-slate-100 font-bold text-black text-[11px] shadow-2xs cursor-pointer"
                          >
                            <Cpu className="w-3.5 h-3.5 text-black" />
                            <span>{attachedDevs.length} Inclinometer Devices</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </td>
                        <td className="py-4 px-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* 2D Map Pin Action */}
                            <button
                              onClick={() => handleOpenMapForAsset(st)}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold text-[11px] border border-blue-200 transition-colors cursor-pointer"
                              title="View asset coverage area on 2D map"
                            >
                              <MapPin className="w-3.5 h-3.5 text-blue-600" />
                              <span>2D Map</span>
                            </button>

                            {/* 3D Landslide Action */}
                            <button
                              onClick={() => handleOpen3DForAsset(st)}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-purple-50 text-purple-700 hover:bg-purple-100 font-bold text-[11px] border border-purple-200 transition-colors cursor-pointer"
                              title="View asset in 3D slope model"
                            >
                              <Box className="w-3.5 h-3.5 text-purple-600" />
                              <span>3D View</span>
                            </button>

                            <button onClick={() => handleOpenEdit(st)} className="p-1.5 text-black hover:bg-slate-200 rounded-lg transition-colors cursor-pointer">
                              <Edit className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleDelete(st.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer">
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
      ) : viewMode === 'map' ? (
        <AssetsMapView
          structures={structuresList}
          sites={sitesList}
          onSelectStructure={(st) => setSelectedAsset(st)}
        />
      ) : (
        <Landslide3DMapView
          structures={structuresList}
          devices={devicesList}
          sites={sitesList}
          onSelectStructure={(st) => setSelectedAsset(st)}
          onSelectDevice={() => {}}
        />
      )}

      {/* Attach Device Modal / Detailed Attached Devices Panel */}
      {selectedAsset && (
        <div className="p-5 rounded-2xl border-2 border-slate-300 bg-slate-50 text-black space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black text-black">
                Inclinometer Devices Attached to: {selectedAsset.name} ({selectedAsset.id || selectedAsset.code})
              </h3>
              <p className="text-xs text-slate-700">Hardware inclinometer nodes deployed on this structure</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setDeviceForm({
                    id: `TECHA${Date.now().toString().slice(-5)}`,
                    name: `Node on ${selectedAsset.name}`,
                    sensorType: 'Inclinometer',
                    macAddress: 'AA:BB:CC:DD:EE:FF',
                  });
                  setDeviceModalOpen(true);
                }}
                className="flex items-center gap-1 px-3 py-1.5 bg-black text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Device to Asset</span>
              </button>
              <button onClick={() => setSelectedAsset(null)} className="p-1.5 text-black hover:bg-slate-200 rounded-lg cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
            {(!selectedAsset.Devices || selectedAsset.Devices.length === 0) ? (
              <div className="col-span-full py-4 text-center text-slate-500 text-xs">
                No sensor nodes attached yet. Click "Add Device to Asset".
              </div>
            ) : (
              selectedAsset.Devices.map(d => {
                const isOnline = (d.status || 'ONLINE') === 'ONLINE';
                const disp = Number(d.totalDisplacement || d.displacement?.totalDisplacement_mm || 1.8);
                const tilt = Number(d.resultantTilt || d.tilt?.tilt || 0.4);

                return (
                  <div key={d.id} className="p-3 rounded-xl border border-slate-300 bg-white font-mono text-xs space-y-1.5">
                    <div className="flex justify-between items-center">
                      <div className="font-bold text-black">{d.id}</div>
                      <span className={`px-2 py-0.2 rounded-full text-[10px] font-bold ${
                        isOnline ? 'bg-emerald-100 text-emerald-950 border border-emerald-300' : 'bg-amber-100 text-amber-950 border border-amber-300'
                      }`}>
                        {d.status || 'ONLINE'}
                      </span>
                    </div>
                    <div className="text-slate-700 text-[11px] font-sans font-medium">{d.name}</div>
                    <div className="grid grid-cols-2 gap-1 pt-1 border-t border-slate-100 text-[11px]">
                      <div>
                        <span className="text-slate-500 block text-[10px]">Disp Δ:</span>
                        <span className="font-bold text-blue-700">{disp.toFixed(2)}mm</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px]">Tilt θ:</span>
                        <span className="font-bold text-purple-700">{tilt.toFixed(2)}°</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

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
                    <option key={s.id || s.siteId} value={s.id || s.siteId}>{s.name} ({s.id || s.siteId})</option>
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
                <label className="block text-black font-extrabold mb-1">Asset Type</label>
                <select
                  value={formData.type}
                  onChange={e => setFormData({ ...formData, type: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border-2 border-slate-300 bg-white text-black font-bold"
                >
                  <option value="Crash Barrier">Crash Barrier</option>
                  <option value="Slope Barrier">Slope Barrier</option>
                  <option value="Retaining Wall">Retaining Wall</option>
                  <option value="Bridge Pier">Bridge Pier</option>
                  <option value="Tunnel Crown">Tunnel Crown</option>
                  <option value="Sound Barrier">Sound Barrier</option>
                </select>
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

      {/* Device Modal */}
      {deviceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white text-black shadow-2xl p-6">
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-200 mb-4">
              <h3 className="text-base font-black text-black">Attach Device to Asset</h3>
              <button onClick={() => setDeviceModalOpen(false)} className="text-black hover:bg-slate-100 p-1 rounded-lg cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveDevice} className="space-y-3 text-xs text-black">
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
