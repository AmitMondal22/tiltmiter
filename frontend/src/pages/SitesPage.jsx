import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit, Trash2, X, CheckCircle2, MapPin, Cpu, ExternalLink, ChevronRight, Layers, ShieldCheck, Map as MapIcon, List, Box } from 'lucide-react';
import { getSites, getProjects, getOrganizations, getDevices, getStructures, createSite, updateSite, deleteSite } from '../api/apiClient';
import LocationMapView from '../components/LocationMapView';
import Landslide3DMapView from '../components/Landslide3DMapView';

export default function SitesPage() {
  const navigate = useNavigate();
  const cardCls = 'rounded-2xl border border-slate-200 bg-white p-5 text-black shadow-xs';

  const [viewMode, setViewMode] = useState('list'); // 'list', 'map', or '3d'
  const [focusedSiteId, setFocusedSiteId] = useState('ALL');
  const [sitesList, setSitesList] = useState([]);
  const [devicesList, setDevicesList] = useState([]);
  const [structuresList, setStructuresList] = useState([]);
  const [projectsList, setProjectsList] = useState([]);
  const [orgsList, setOrgsList] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSite, setEditingSite] = useState(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });

  const [formData, setFormData] = useState({
    siteId: '',
    name: '',
    organizationId: '',
    projectId: '',
    latitude: '',
    longitude: '',
    description: '',
    status: 'ACTIVE'
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [sitesRes, devRes, structRes, projRes, orgRes] = await Promise.all([
        getSites().catch(() => ({ sites: [] })),
        getDevices().catch(() => ({ devices: [] })),
        getStructures().catch(() => ({ structures: [] })),
        getProjects().catch(() => ({ projects: [] })),
        getOrganizations().catch(() => ({ organizations: [] })),
      ]);

      if (sitesRes?.sites) setSitesList(sitesRes.sites);
      if (devRes?.devices) setDevicesList(devRes.devices);
      if (structRes?.structures) setStructuresList(structRes.structures);
      if (projRes?.projects) setProjectsList(projRes.projects);
      if (orgRes?.organizations) setOrgsList(orgRes.organizations);
    } catch (e) {
      setSitesList([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenAdd = () => {
    setEditingSite(null);
    setFormData({
      siteId: `SITE-${Date.now().toString().slice(-4)}`,
      name: '',
      organizationId: orgsList[0]?.id || '',
      projectId: projectsList[0]?.id || '',
      latitude: '26.7271',
      longitude: '88.4315',
      description: '',
      status: 'ACTIVE'
    });
    setModalOpen(true);
  };

  const handleOpenEdit = (e, site) => {
    e.stopPropagation();
    setEditingSite(site);
    setFormData({
      siteId: site.siteId || site.id,
      name: site.name,
      organizationId: site.organizationId || site.Project?.organizationId || '',
      projectId: site.projectId || '',
      latitude: site.latitude || '',
      longitude: site.longitude || '',
      description: site.description || '',
      status: site.status || 'ACTIVE'
    });
    setModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      if (editingSite) {
        await updateSite(editingSite.id || editingSite.siteId, formData);
        setSitesList(prev => prev.map(s => (s.id === editingSite.id || s.siteId === editingSite.siteId) ? { ...s, ...formData } : s));
        setMsg({ type: 'success', text: `Site ${formData.name} updated.` });
      } else {
        const res = await createSite(formData);
        const newSite = res?.site || { id: formData.siteId, ...formData, Structures: [] };
        setSitesList(prev => [...prev, newSite]);
        setMsg({ type: 'success', text: `Site ${formData.name} created.` });
      }
      setModalOpen(false);
    } catch (err) {
      setMsg({ type: 'error', text: err.message || 'Error saving site' });
    } finally {
      setTimeout(() => setMsg({ type: '', text: '' }), 3500);
    }
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (window.confirm('Are you sure you want to delete this site location?')) {
      await deleteSite(id).catch(() => {});
      setSitesList(prev => prev.filter(s => (s.id !== id && s.siteId !== id)));
      setMsg({ type: 'success', text: `Site location deleted.` });
      setTimeout(() => setMsg({ type: '', text: '' }), 3000);
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
            <MapPin className="w-5 h-5 text-blue-600" />
            <span>Site Locations & Monitored Devices</span>
          </h2>
          <p className="text-xs text-slate-700 font-medium mt-0.5">
            {sitesList.length} monitored geolocations &bull; {devicesList.length} hardware sensor nodes deployed
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {/* List vs 2D Map vs 3D Map Switcher */}
          <div className="flex items-center bg-slate-100 border border-slate-200 rounded-xl p-0.5 shadow-2xs">
            <button
              onClick={() => {
                setViewMode('list');
                setFocusedSiteId('ALL');
              }}
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
              <span>Location Map & Analytics</span>
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
              <span>3D Landslide Slope Map</span>
            </button>
          </div>

          <button
            onClick={handleOpenAdd}
            className="flex items-center gap-1.5 px-4 py-2 bg-black text-white font-bold text-xs rounded-xl shadow-xs hover:bg-neutral-800 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Location</span>
          </button>
        </div>
      </div>

      {/* Main Content Area: Table View OR 2D/3D Location Map View */}
      {viewMode === 'list' ? (
        /* Dedicated Locations Table */
        <div className={cardCls}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b-2 border-slate-200 text-black font-extrabold uppercase text-[11px] tracking-wider">
                  <th className="py-3 px-3.5">Site Name</th>
                  <th className="py-3 px-3.5">Site ID</th>
                  <th className="py-3 px-3.5">Project / Org</th>
                  <th className="py-3 px-3.5">GPS Coordinates</th>
                  <th className="py-3 px-3.5">Assets & Inclinometers</th>
                  <th className="py-3 px-3.5">Status</th>
                  <th className="py-3 px-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-black font-medium">
                {sitesList.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500 text-xs">
                      No site locations registered yet. Click "+ Add Location" to create one.
                    </td>
                  </tr>
                ) : (
                  sitesList.map(site => {
                    const proj = projectsList.find(p => p.id === site.projectId);
                    const org = orgsList.find(o => o.id === site.organizationId || o.id === proj?.organizationId);
                    const structCount = site.Structures ? site.Structures.length : 0;
                    const siteDevCount = devicesList.filter(d => d.siteId === site.id || d.siteId === site.siteId).length;
                    const sId = site.siteId || site.id;

                    return (
                      <tr
                        key={sId}
                        onClick={() => navigate(`/sites/${sId}`)}
                        className="hover:bg-blue-50/60 transition-colors cursor-pointer group"
                      >
                        <td className="py-4 px-3.5">
                          <div className="font-bold text-black text-sm group-hover:text-blue-700 flex items-center gap-1.5">
                            <span>{site.name}</span>
                            <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity text-blue-600" />
                          </div>
                          <div className="text-[11px] text-slate-700 font-mono mt-0.5">{site.description || 'Geotechnical Site'}</div>
                        </td>
                        <td className="py-4 px-3.5 font-mono font-bold text-black">
                          {sId}
                        </td>
                        <td className="py-4 px-3.5">
                          <div className="font-bold text-black">{proj?.name || site.Project?.name || '--'}</div>
                          <div className="text-[11px] text-slate-700 font-medium">{org?.name || '--'}</div>
                        </td>
                        <td className="py-4 px-3.5 font-mono font-bold text-black">
                          {site.latitude ? `${Number(site.latitude).toFixed(4)}°N, ${Number(site.longitude).toFixed(4)}°E` : '--'}
                        </td>
                        <td className="py-4 px-3.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="px-2.5 py-1 rounded-md bg-black text-white font-bold text-[10px]">
                              {structCount} Assets
                            </span>
                            <span className="px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 border border-blue-200 font-bold text-[10px] flex items-center gap-1">
                              <Cpu className="w-3 h-3" />
                              <span>{siteDevCount} Devices</span>
                            </span>
                          </div>
                        </td>
                        <td className="py-4 px-3.5">
                          <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-950 border border-emerald-300 font-extrabold text-[10px]">
                            {site.status || 'ACTIVE'}
                          </span>
                        </td>
                        <td className="py-4 px-3.5 text-right" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            {/* View On Map Action */}
                            <button
                              onClick={() => {
                                setFocusedSiteId(sId);
                                setViewMode('map');
                              }}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold text-[11px] border border-blue-200 transition-colors cursor-pointer"
                              title="View site and all its devices on Map"
                            >
                              <MapPin className="w-3.5 h-3.5 text-blue-600" />
                              <span>View Map</span>
                            </button>

                            {/* Open Dedicated Location View */}
                            <button
                              onClick={() => navigate(`/sites/${sId}`)}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] shadow-2xs transition-colors cursor-pointer"
                              title="Open dedicated location view with 2D/3D map & analytics"
                            >
                              <span>Open Location</span>
                              <ExternalLink className="w-3.5 h-3.5" />
                            </button>

                            <button onClick={(e) => handleOpenEdit(e, site)} className="p-1.5 text-black hover:bg-slate-200 rounded-lg transition-colors cursor-pointer">
                              <Edit className="w-4 h-4" />
                            </button>
                            <button onClick={(e) => handleDelete(e, sId)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer">
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
        <LocationMapView
          sites={sitesList}
          devices={devicesList}
          structures={structuresList}
          projects={projectsList}
          organizations={orgsList}
          initialSelectedSiteId={focusedSiteId}
          onSelectSite={(s) => setFocusedSiteId(s.id || s.siteId)}
        />
      ) : (
        <Landslide3DMapView
          structures={structuresList}
          devices={devicesList}
          sites={sitesList}
          onSelectStructure={() => {}}
          onSelectDevice={() => {}}
        />
      )}

      {/* Modal: Create / Edit Site Location */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white text-black shadow-2xl p-6">
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-200 mb-4">
              <h3 className="text-base font-black text-black">
                {editingSite ? 'Edit Site Location' : 'Create Site Location'}
              </h3>
              <button onClick={() => setModalOpen(false)} className="text-black hover:bg-slate-100 p-1 rounded-lg cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3 text-xs text-black">
              <div>
                <label className="block text-black font-extrabold mb-1">Organization *</label>
                <select
                  value={formData.organizationId}
                  onChange={e => setFormData({ ...formData, organizationId: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border-2 border-slate-300 bg-white text-black font-bold"
                >
                  <option value="">Select Organization</option>
                  {orgsList.map(o => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-black font-extrabold mb-1">Parent Project *</label>
                <select
                  required
                  value={formData.projectId}
                  onChange={e => setFormData({ ...formData, projectId: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border-2 border-slate-300 bg-white text-black font-bold"
                >
                  <option value="">Select Project</option>
                  {projectsList.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-black font-extrabold mb-1">Site Location Name *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Hill Slope Sector B"
                  className="w-full px-3 py-2 rounded-xl border-2 border-slate-300 bg-white text-black font-bold"
                />
              </div>

              <div>
                <label className="block text-black font-extrabold mb-1">Site Identifier Code</label>
                <input
                  type="text"
                  required
                  value={formData.siteId}
                  onChange={e => setFormData({ ...formData, siteId: e.target.value })}
                  placeholder="e.g. SITE-KB01"
                  className="w-full px-3 py-2 rounded-xl border-2 border-slate-300 bg-white text-black font-mono font-bold"
                />
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
                  Save Location
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
