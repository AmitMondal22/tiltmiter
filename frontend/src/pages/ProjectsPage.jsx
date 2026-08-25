import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, X, CheckCircle2 } from 'lucide-react';
import { getProjects, getOrganizations, createProject, updateProject, deleteProject } from '../api/apiClient';

export default function ProjectsPage() {
  const cardCls = 'rounded-2xl border border-slate-200 bg-white p-5 text-black shadow-xs';

  const [projectsList, setProjectsList] = useState([]);
  const [orgsList, setOrgsList] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProj, setEditingProj] = useState(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });

  const [formData, setFormData] = useState({
    name: '',
    code: '',
    organizationId: '',
    description: '',
    budget: '',
    status: 'ACTIVE',
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [projRes, orgRes] = await Promise.all([
        getProjects().catch(() => ({ projects: [] })),
        getOrganizations().catch(() => ({ organizations: [] })),
      ]);

      if (projRes?.projects) {
        setProjectsList(projRes.projects);
      }
      if (orgRes?.organizations) {
        setOrgsList(orgRes.organizations);
      }
    } catch (e) {
      setProjectsList([]);
      setOrgsList([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenAdd = () => {
    setEditingProj(null);
    setFormData({
      name: '',
      code: `PROJ-${Date.now().toString().slice(-4)}`,
      organizationId: orgsList[0]?.id || '',
      description: '',
      budget: '',
      status: 'ACTIVE',
    });
    setModalOpen(true);
  };

  const handleOpenEdit = (proj) => {
    setEditingProj(proj);
    setFormData({
      name: proj.name,
      code: proj.code,
      organizationId: proj.organizationId || proj.Organization?.id || '',
      description: proj.description || '',
      budget: proj.budget || '',
      status: proj.status || 'ACTIVE',
    });
    setModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      if (editingProj) {
        await updateProject(editingProj.id, formData);
        setProjectsList(prev => prev.map(p => p.id === editingProj.id ? { ...p, ...formData } : p));
        setMsg({ type: 'success', text: `Project ${formData.name} updated.` });
      } else {
        const res = await createProject(formData);
        const newProj = res?.project || { id: Date.now(), ...formData, Sites: [] };
        setProjectsList(prev => [...prev, newProj]);
        setMsg({ type: 'success', text: `Project ${formData.name} created.` });
      }
      setModalOpen(false);
    } catch (err) {
      setMsg({ type: 'error', text: err.message || 'Error saving project' });
    } finally {
      setTimeout(() => setMsg({ type: '', text: '' }), 3500);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this project?')) {
      await deleteProject(id).catch(() => {});
      setProjectsList(prev => prev.filter(p => p.id !== id));
      setMsg({ type: 'success', text: `Project ${id} deleted.` });
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
            Infrastructure Projects
          </h2>
          <p className="text-xs text-slate-700 font-medium mt-0.5">
            {projectsList.length} active infrastructure projects
          </p>
        </div>

        {/* Black Pill Action Button */}
        <button
          onClick={handleOpenAdd}
          className="flex items-center gap-1.5 px-5 py-2.5 bg-black text-white font-bold text-xs rounded-xl shadow-xs hover:bg-neutral-800 transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>Add Project</span>
        </button>
      </div>

      {/* Projects Table */}
      <div className={cardCls}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b-2 border-slate-200 text-black font-extrabold uppercase text-[11px] tracking-wider">
                <th className="py-3 px-3.5">Project Name</th>
                <th className="py-3 px-3.5">Project Code</th>
                <th className="py-3 px-3.5">Organization</th>
                <th className="py-3 px-3.5">Sites</th>
                <th className="py-3 px-3.5">Status</th>
                <th className="py-3 px-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-black font-medium">
              {projectsList.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500 text-xs">
                    No projects registered yet. Click "+ Add Project" to create one.
                  </td>
                </tr>
              ) : (
                projectsList.map(proj => {
                  const org = orgsList.find(o => o.id === proj.organizationId || o.id === proj.Organization?.id);
                  const siteCount = proj.Sites ? proj.Sites.length : 0;

                  return (
                    <tr key={proj.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-4 px-3.5">
                        <div className="font-bold text-black text-sm">{proj.name}</div>
                        <div className="text-[11px] text-slate-700 font-mono mt-0.5">{proj.description || 'Geotechnical Monitoring'}</div>
                      </td>
                      <td className="py-4 px-3.5 font-mono font-bold text-black">
                        {proj.code}
                      </td>
                      <td className="py-4 px-3.5">
                        <span className="font-bold text-black">
                          {org?.name || proj.Organization?.name || '--'}
                        </span>
                      </td>
                      <td className="py-4 px-3.5">
                        <span className="px-2.5 py-1 rounded-md bg-black text-white font-bold text-[11px]">
                          {siteCount} Sites
                        </span>
                      </td>
                      <td className="py-4 px-3.5">
                        <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-950 border border-emerald-300 font-extrabold text-[10px]">
                          {proj.status || 'ACTIVE'}
                        </span>
                      </td>
                      <td className="py-4 px-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button onClick={() => handleOpenEdit(proj)} className="p-1.5 text-black hover:bg-slate-200 rounded-lg transition-colors">
                            <Edit className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDelete(proj.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
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
                {editingProj ? 'Edit Project' : 'Create Project'}
              </h3>
              <button onClick={() => setModalOpen(false)} className="text-black hover:bg-slate-100 p-1 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3 text-xs text-black">
              <div>
                <label className="block text-black font-extrabold mb-1">Organization *</label>
                <select
                  required
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
                <label className="block text-black font-extrabold mb-1">Project Name *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Hill Slope Monitoring"
                  className="w-full px-3 py-2 rounded-xl border-2 border-slate-300 bg-white text-black font-bold"
                />
              </div>

              <div>
                <label className="block text-black font-extrabold mb-1">Project Code</label>
                <input
                  type="text"
                  required
                  value={formData.code}
                  onChange={e => setFormData({ ...formData, code: e.target.value })}
                  placeholder="e.g. PROJ-01"
                  className="w-full px-3 py-2 rounded-xl border-2 border-slate-300 bg-white text-black font-mono font-bold"
                />
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
                  Save Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
