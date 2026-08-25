import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, X, CheckCircle2, ChevronRight, Cpu } from 'lucide-react';
import { getStructures, getSites, getProjects, getOrganizations, createStructure, updateStructure, deleteStructure, createDevice } from '../api/apiClient';

export default function StructuresPage() {
  const cardCls = 'rounded-2xl border border-slate-200 bg-white p-5 text-black shadow-xs';

  const [structuresList, setStructuresList] = useState([]);
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
      const [structRes, siteRes, projRes, orgRes] = await Promise.all([
        getStructures().catch(() => ({ structures: [] })),
        getSites().catch(() => ({ sites: [] })),
        getProjects().catch(() => ({ projects: [] })),
        getOrganizations().catch(() => ({ organizations: [] })),
      ]);

      if (structRes?.structures) setStructuresList(structRes.structures);
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
    <div className="space-y-4 font-sans text-black">
      {/* Toast */}
      {msg.text && (
        <div className="p-3.5 rounded-xl border flex items-center gap-2 text-xs font-bold bg-emerald-50 border-emerald-300 text-emerald-950 shadow-sm animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-700" />
          <span>{msg.text}</span>
        </div>
      )}

      {/* Top Header Row */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-black">
            Structural Assets
          </h2>
          <p className="text-xs text-slate-700 font-medium mt-0.5">
            {structuresList.length} registered geotechnical assets
          </p>
        </div>

        {/* Black Pill Action Button */}
        <button
          onClick={handleOpenAdd}
          className="flex items-center gap-1.5 px-5 py-2.5 bg-black text-white font-bold text-xs rounded-xl shadow-xs hover:bg-neutral-800 transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>Add Asset</span>
        </button>
      </div>

      {/* Assets Table */}
      <div className={cardCls}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b-2 border-slate-200 text-black font-extrabold uppercase text-[11px] tracking-wider">
                <th className="py-3 px-3.5">Asset Name</th>
                <th className="py-3 px-3.5">Asset Code</th>
                <th className="py-3 px-3.5">Type & Elevation</th>
                <th className="py-3 px-3.5">Site Location</th>
                <th className="py-3 px-3.5">Attached Devices</th>
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
                  const devCount = st.Devices ? st.Devices.length : 0;

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
                        <div className="font-bold text-black">{st.type}</div>
                        <div className="text-[11px] text-slate-700 font-mono mt-0.5">{st.heightElevation}m</div>
                      </td>
                      <td className="py-4 px-3.5">
                        <div className="font-bold text-black">{site?.name || st.siteId || '--'}</div>
                        <div className="text-[11px] text-slate-700 font-mono font-bold">{st.siteId}</div>
                      </td>
                      <td className="py-4 px-3.5">
                        <button
                          onClick={() => setSelectedAsset(st)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-300 hover:bg-slate-100 font-bold text-black text-[11px] shadow-2xs"
                        >
                          <Cpu className="w-3.5 h-3.5 text-black" />
                          <span>{devCount} Devices</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </td>
                      <td className="py-4 px-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button onClick={() => handleOpenEdit(st)} className="p-1.5 text-black hover:bg-slate-200 rounded-lg transition-colors">
                            <Edit className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDelete(st.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
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

      {/* Attach Device Modal */}
      {selectedAsset && (
        <div className="p-5 rounded-2xl border-2 border-slate-300 bg-slate-50 text-black space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black text-black">
                Devices attached to: {selectedAsset.name} ({selectedAsset.id})
              </h3>
              <p className="text-xs text-slate-600">Attached hardware sensor nodes</p>
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
                className="flex items-center gap-1 px-3 py-1.5 bg-black text-white font-bold text-xs rounded-xl shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Device to Asset</span>
              </button>
              <button onClick={() => setSelectedAsset(null)} className="p-1.5 text-black hover:bg-slate-200 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {(selectedAsset.Devices || []).length === 0 ? (
              <div className="col-span-full py-4 text-center text-slate-500 text-xs">
                No sensor nodes attached yet. Click "Add Device to Asset".
              </div>
            ) : (
              selectedAsset.Devices.map(d => (
                <div key={d.id} className="p-3 rounded-xl border border-slate-300 bg-white font-mono text-xs">
                  <div className="font-bold text-black">{d.id}</div>
                  <div className="text-slate-600 text-[11px]">{d.name}</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white text-black shadow-2xl p-6">
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-200 mb-4">
              <h3 className="text-base font-black text-black">
                {editingStruct ? 'Edit Structural Asset' : 'Create Structural Asset'}
              </h3>
              <button onClick={() => setModalOpen(false)} className="text-black hover:bg-slate-100 p-1 rounded-lg">
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
                </select>
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-xl border-2 border-slate-300 text-black font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-black text-white font-bold hover:bg-neutral-800 shadow-xs"
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
              <button onClick={() => setDeviceModalOpen(false)} className="text-black hover:bg-slate-100 p-1 rounded-lg">
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
                  className="px-4 py-2 rounded-xl border-2 border-slate-300 text-black font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-black text-white font-bold hover:bg-neutral-800 shadow-xs"
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
