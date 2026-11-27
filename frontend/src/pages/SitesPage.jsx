import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit, Trash2, X, CheckCircle2, MapPin, Cpu, ExternalLink, ChevronRight, Layers, ShieldCheck } from 'lucide-react';
import { getSites, getProjects, getOrganizations, getDevices, getStructures, createSite, updateSite, deleteSite } from '../api/apiClient';
import { getSiteStructures, getSiteDevices, isDeviceInSite } from '../utils/siteHelper';


export default function SitesPage() {
  const navigate = useNavigate();

  const [sitesList, setSitesList] = useState([]);
  const [devicesList, setDevicesList] = useState([]);
  const [structuresList, setStructuresList] = useState([]);
  const [projectsList, setProjectsList] = useState([]);
  const [orgsList, setOrgsList] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSite, setEditingSite] = useState(null);
  const [loading, setLoading] = useState(false);
  const [siteSearch, setSiteSearch] = useState('');
  const [msg, setMsg] = useState({ type: '', text: '' });

  const [formData, setFormData] = useState({
    name: '',
    organizationId: '',
    projectId: '',
    location: '',
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
      name: '',
      organizationId: orgsList[0]?.id || '',
      projectId: projectsList[0]?.id || '',
      location: '',
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
      name: site.name,
      organizationId: site.organizationId || site.Project?.organizationId || '',
      projectId: site.projectId || '',
      location: site.location || site.address || '',
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
        const sitePk = editingSite.id || editingSite.siteId;
        const res = await updateSite(sitePk, formData);
        const updated = res?.site || { ...editingSite, ...formData };
        setSitesList(prev => prev.map(s => (s.id === sitePk || s.siteId === sitePk) ? updated : s));
        setMsg({ type: 'success', text: `Site ${formData.name} updated.` });
      } else {
        const res = await createSite(formData);
        if (res?.site) {
          setSitesList(prev => [res.site, ...prev]);
        } else {
          loadData();
        }
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
    <div className="space-y-4 text-slate-900 animate-fadeIn">
      {/* Toast */}
      {msg.text && (
        <div className="p-3.5 rounded-xl border flex items-center gap-2 text-xs font-bold bg-emerald-50 border-emerald-300 text-emerald-950 shadow-sm animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-700" />
          <span>{msg.text}</span>
        </div>
      )}

      {/* Top Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Site Locations &amp; Monitored Devices
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            {sitesList.length} locations &bull; {devicesList.filter(d => sitesList.some(s => isDeviceInSite(d, s, structuresList))).length} assigned nodes &bull; {devicesList.length} total deployed
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleOpenAdd}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-lg shadow-xs transition-all cursor-pointer"
          >
            <span>Add Location</span>
          </button>
        </div>
      </div>

      {/* Main Content Area: Table View */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 shadow-xs space-y-3">
          {/* Top-Right Search Input */}
          <div className="flex justify-end">
            <input
              type="text"
              value={siteSearch}
              onChange={(e) => setSiteSearch(e.target.value)}
              placeholder="Search by site name, project or coordinates..."
              className="w-full sm:w-80 px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200/80">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/90 border-b border-slate-200 text-slate-700 text-[11px]">
                  <th className="py-3 px-3.5 w-10">#</th>
                  <th className="py-3 px-3.5">Site Name</th>
                  <th className="py-3 px-3.5">Project / Organization</th>
                  <th className="py-3 px-3.5">GPS Coordinates</th>
                  <th className="py-3 px-3.5 text-center">Assets</th>
                  <th className="py-3 px-3.5 text-center">Devices</th>
                  <th className="py-3 px-3.5 text-left pl-6">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {loading && sitesList.length === 0 ? (
                  Array.from({ length: 5 }).map((_, idx) => (
                    <tr key={`skel-${idx}`}>
                      <td colSpan={7} className="py-3 px-3.5">
                        <div className="h-9 rounded-xl bg-slate-100 animate-pulse" />
                      </td>
                    </tr>
                  ))
                ) : (() => {
                  const q = siteSearch.trim().toLowerCase();
                  const filtered = sitesList.filter((site) => {
                    if (!q) return true;
                    const proj = projectsList.find(p => String(p.id) === String(site.projectId));
                    const org = orgsList.find(o => String(o.id) === String(site.organizationId) || String(o.id) === String(proj?.organizationId));
                    const projOrgStr = `${proj?.name || site.Project?.name || ''} ${org?.name || ''}`.toLowerCase();
                    const coordStr = `${site.latitude || ''} ${site.longitude || ''}`.toLowerCase();
                    return (
                      String(site.name || '').toLowerCase().includes(q) ||
                      projOrgStr.includes(q) ||
                      coordStr.includes(q)
                    );
                  });

                  if (filtered.length === 0) {
                    return (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-500 text-xs">
                          No site locations found.
                        </td>
                      </tr>
                    );
                  }

                  return filtered.map((site, idx) => {
                    const sId = site.siteId || site.id;
                    const proj = projectsList.find(p => String(p.id) === String(site.projectId));
                    const org = orgsList.find(o => String(o.id) === String(site.organizationId) || String(o.id) === String(proj?.organizationId));

                    const siteStructures = getSiteStructures(site, structuresList);
                    const structCount = (site.Structures && site.Structures.length > 0) ? site.Structures.length : siteStructures.length;

                    const siteDevices = getSiteDevices(site, devicesList, siteStructures);
                    const siteDevCount = siteDevices.length;

                    const firstDevWithCoords = siteDevices.find(d => d.latitude && d.longitude && !isNaN(parseFloat(d.latitude)) && !isNaN(parseFloat(d.longitude)));
                    const hasExplicitSiteCoords = site.latitude && site.longitude && !isNaN(parseFloat(site.latitude)) && !isNaN(parseFloat(site.longitude)) && (Math.abs(parseFloat(site.latitude) - 22.5726) >= 0.001 || Math.abs(parseFloat(site.longitude) - 88.3639) >= 0.001);
                    const displayLat = hasExplicitSiteCoords ? parseFloat(site.latitude) : (firstDevWithCoords ? parseFloat(firstDevWithCoords.latitude) : null);
                    const displayLng = hasExplicitSiteCoords ? parseFloat(site.longitude) : (firstDevWithCoords ? parseFloat(firstDevWithCoords.longitude) : null);

                    return (
                      <tr
                        key={sId}
                        onClick={() => navigate(`/sites/${sId}`)}
                        className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                      >
                        <td className="py-3 px-3.5 text-slate-500">{idx + 1}</td>
                        <td className="py-3 px-3.5 text-slate-900 whitespace-nowrap">
                          {site.name}
                        </td>
                        <td className="py-3 px-3.5 text-slate-700">
                          {proj?.name || site.Project?.name || org?.name || '--'}
                        </td>
                        <td className="py-3 px-3.5 text-slate-800 whitespace-nowrap">
                          {displayLat !== null && displayLng !== null
                            ? `${displayLat.toFixed(4)}° N, ${displayLng.toFixed(4)}° E`
                            : '--'}
                        </td>
                        <td className="py-3 px-3.5 text-center text-slate-900">
                          {structCount}
                        </td>
                        <td className="py-3 px-3.5 text-center text-slate-900">
                          {siteDevCount}
                        </td>
                        <td className="py-3 px-3.5 pl-6 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => navigate(`/sites/${sId}`)}
                              className="px-3 py-1.5 rounded-lg border border-blue-300 bg-blue-50/70 hover:bg-blue-100 text-blue-600 text-[11px] transition-colors cursor-pointer"
                            >
                              Open Location
                            </button>
                            <button
                              onClick={(e) => handleOpenEdit(e, site)}
                              className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-[11px] transition-colors cursor-pointer"
                            >
                              Edit
                            </button>
                            <button
                              onClick={(e) => handleDelete(e, sId)}
                              className="px-3 py-1.5 rounded-lg border border-red-200 bg-red-50/40 hover:bg-red-100 text-red-600 text-[11px] transition-colors cursor-pointer"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        </div>

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
                <label className="block text-black font-extrabold mb-1">Location / Area Name</label>
                <input
                  type="text"
                  value={formData.location}
                  onChange={e => setFormData({ ...formData, location: e.target.value })}
                  placeholder="e.g. North Ridge Section, Mile 44"
                  className="w-full px-3 py-2 rounded-xl border-2 border-slate-300 bg-white text-black font-bold"
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
