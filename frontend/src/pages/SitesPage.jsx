import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, X, CheckCircle2 } from 'lucide-react';
import { getSites, getProjects, getOrganizations, createSite, updateSite, deleteSite } from '../api/apiClient';

export default function SitesPage() {
  const cardCls = 'rounded-2xl border border-slate-200 bg-white p-5 text-black shadow-xs';

  const [sitesList, setSitesList] = useState([]);
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
      const [sitesRes, projRes, orgRes] = await Promise.all([
        getSites().catch(() => ({ sites: [] })),
        getProjects().catch(() => ({ projects: [] })),
        getOrganizations().catch(() => ({ organizations: [] })),
      ]);

      if (sitesRes?.sites) setSitesList(sitesRes.sites);
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

  const handleOpenEdit = (site) => {
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

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this site location?')) {
      await deleteSite(id).catch(() => {});
      setSitesList(prev => prev.filter(s => (s.id !== id && s.siteId !== id)));
      setMsg({ type: 'success', text: `Site location deleted.` });
      setTimeout(() => setMsg({ type: '', text: '' }), 3000);
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
            Site Locations
          </h2>
          <p className="text-xs text-slate-700 font-medium mt-0.5">
            {sitesList.length} monitored geolocations
          </p>
        </div>

        {/* Black Pill Action Button */}
        <button
          onClick={handleOpenAdd}
          className="flex items-center gap-1.5 px-5 py-2.5 bg-black text-white font-bold text-xs rounded-xl shadow-xs hover:bg-neutral-800 transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>Add Location</span>
        </button>
      </div>

      {/* Locations Table */}
      <div className={cardCls}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b-2 border-slate-200 text-black font-extrabold uppercase text-[11px] tracking-wider">
                <th className="py-3 px-3.5">Site Name</th>
                <th className="py-3 px-3.5">Site ID</th>
                <th className="py-3 px-3.5">Project / Org</th>
                <th className="py-3 px-3.5">GPS Coordinates</th>
                <th className="py-3 px-3.5">Assets</th>
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

                  return (
                    <tr key={site.siteId || site.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-4 px-3.5">
                        <div className="font-bold text-black text-sm">{site.name}</div>
                        <div className="text-[11px] text-slate-700 font-mono mt-0.5">{site.description || 'Geotechnical Site'}</div>
                      </td>
                      <td className="py-4 px-3.5 font-mono font-bold text-black">
                        {site.siteId || site.id}
                      </td>
                      <td className="py-4 px-3.5">
                        <div className="font-bold text-black">{proj?.name || site.Project?.name || '--'}</div>
                        <div className="text-[11px] text-slate-700 font-medium">{org?.name || '--'}</div>
                      </td>
                      <td className="py-4 px-3.5 font-mono font-bold text-black">
                        {site.latitude ? `${site.latitude}°N, ${site.longitude}°E` : '--'}
                      </td>
                      <td className="py-4 px-3.5">
                        <span className="px-2.5 py-1 rounded-md bg-black text-white font-bold text-[11px]">
                          {structCount} Assets
                        </span>
                      </td>
                      <td className="py-4 px-3.5">
                        <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-950 border border-emerald-300 font-extrabold text-[10px]">
                          {site.status || 'ACTIVE'}
                        </span>
                      </td>
                      <td className="py-4 px-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button onClick={() => handleOpenEdit(site)} className="p-1.5 text-black hover:bg-slate-200 rounded-lg transition-colors">
                            <Edit className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDelete(site.siteId || site.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
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

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white text-black shadow-2xl p-6">
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-200 mb-4">
              <h3 className="text-base font-black text-black">
                {editingSite ? 'Edit Site Location' : 'Create Site Location'}
              </h3>
              <button onClick={() => setModalOpen(false)} className="text-black hover:bg-slate-100 p-1 rounded-lg">
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
                  className="px-4 py-2 rounded-xl border-2 border-slate-300 text-black font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-black text-white font-bold hover:bg-neutral-800 shadow-xs"
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
