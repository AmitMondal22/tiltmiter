import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, X, CheckCircle2 } from 'lucide-react';
import { getOrganizations, createOrganization, updateOrganization, deleteOrganization } from '../api/apiClient';

export default function OrganizationsPage() {
  const cardCls = 'rounded-2xl border border-slate-200 bg-white p-5 text-black shadow-xs';

  const [orgsList, setOrgsList] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingOrg, setEditingOrg] = useState(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });

  const [formData, setFormData] = useState({
    name: '',
    code: '',
    type: 'PARENT_ORG',
    address: '',
    contactEmail: '',
    description: '',
    status: 'ACTIVE',
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await getOrganizations();
      if (res?.organizations) {
        setOrgsList(res.organizations);
      }
    } catch (e) {
      setOrgsList([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenAdd = () => {
    setEditingOrg(null);
    setFormData({
      name: '',
      code: `ORG-${Date.now().toString().slice(-4)}`,
      type: 'PARENT_ORG',
      address: '',
      contactEmail: '',
      description: '',
      status: 'ACTIVE'
    });
    setModalOpen(true);
  };

  const handleOpenEdit = (org) => {
    setEditingOrg(org);
    setFormData({
      name: org.name,
      code: org.code,
      type: org.type || 'PARENT_ORG',
      address: org.address || '',
      contactEmail: org.contactEmail || org.email || '',
      description: org.description || '',
      status: org.status || 'ACTIVE',
    });
    setModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      if (editingOrg) {
        await updateOrganization(editingOrg.id, formData);
        setOrgsList(prev => prev.map(o => o.id === editingOrg.id ? { ...o, ...formData } : o));
        setMsg({ type: 'success', text: `Organization ${formData.name} updated.` });
      } else {
        const res = await createOrganization(formData);
        const newOrg = res?.organization || { id: Date.now(), ...formData, Projects: [] };
        setOrgsList(prev => [...prev, newOrg]);
        setMsg({ type: 'success', text: `Organization ${formData.name} created.` });
      }
      setModalOpen(false);
    } catch (err) {
      setMsg({ type: 'error', text: err.message || 'Error saving organization' });
    } finally {
      setTimeout(() => setMsg({ type: '', text: '' }), 3500);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this organization?')) {
      await deleteOrganization(id).catch(() => {});
      setOrgsList(prev => prev.filter(o => o.id !== id));
      setMsg({ type: 'success', text: `Organization ${id} deleted.` });
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
            Enterprise Organizations
          </h2>
          <p className="text-xs text-slate-700 font-medium mt-0.5">
            {orgsList.length} enterprise tenant accounts
          </p>
        </div>

        {/* Black Pill Action Button */}
        <button
          onClick={handleOpenAdd}
          className="flex items-center gap-1.5 px-5 py-2.5 bg-black text-white font-bold text-xs rounded-xl shadow-xs hover:bg-neutral-800 transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>Add Organization</span>
        </button>
      </div>

      {/* Organizations Table */}
      <div className={cardCls}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b-2 border-slate-200 text-black font-extrabold uppercase text-[11px] tracking-wider">
                <th className="py-3 px-3.5">Organization Name</th>
                <th className="py-3 px-3.5">Org Code</th>
                <th className="py-3 px-3.5">Address & Contact</th>
                <th className="py-3 px-3.5">Projects</th>
                <th className="py-3 px-3.5">Status</th>
                <th className="py-3 px-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-black font-medium">
              {orgsList.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500 text-xs">
                    No organizations created yet. Click "+ Add Organization" to add the first tenant.
                  </td>
                </tr>
              ) : (
                orgsList.map(org => {
                  const projectCount = org.Projects ? org.Projects.length : 0;

                  return (
                    <tr key={org.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-4 px-3.5">
                        <div className="font-bold text-black text-sm">{org.name}</div>
                        <div className="text-[11px] text-slate-700 font-mono mt-0.5">{org.description || 'Enterprise Tenant'}</div>
                      </td>
                      <td className="py-4 px-3.5 font-mono font-bold text-black">
                        {org.code}
                      </td>
                      <td className="py-4 px-3.5">
                        <div className="text-black font-semibold">{org.address || '--'}</div>
                        <div className="text-[11px] text-slate-700 font-mono mt-0.5">{org.contactEmail || '--'}</div>
                      </td>
                      <td className="py-4 px-3.5">
                        <span className="px-2.5 py-1 rounded-md bg-black text-white font-bold text-[11px]">
                          {projectCount} Projects
                        </span>
                      </td>
                      <td className="py-4 px-3.5">
                        <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-950 border border-emerald-300 font-extrabold text-[10px]">
                          {org.status || 'ACTIVE'}
                        </span>
                      </td>
                      <td className="py-4 px-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button onClick={() => handleOpenEdit(org)} className="p-1.5 text-black hover:bg-slate-200 rounded-lg transition-colors">
                            <Edit className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDelete(org.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
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
                {editingOrg ? 'Edit Organization' : 'Create Organization'}
              </h3>
              <button onClick={() => setModalOpen(false)} className="text-black hover:bg-slate-100 p-1 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3 text-xs text-black">
              <div>
                <label className="block text-black font-extrabold mb-1">Organization Name</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Acme Infra Ltd"
                  className="w-full px-3 py-2 rounded-xl border-2 border-slate-300 bg-white text-black font-bold"
                />
              </div>

              <div>
                <label className="block text-black font-extrabold mb-1">Organization Code</label>
                <input
                  type="text"
                  required
                  value={formData.code}
                  onChange={e => setFormData({ ...formData, code: e.target.value })}
                  placeholder="e.g. ACME"
                  className="w-full px-3 py-2 rounded-xl border-2 border-slate-300 bg-white text-black font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-black font-extrabold mb-1">Address</label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={e => setFormData({ ...formData, address: e.target.value })}
                  placeholder="Main Office Address"
                  className="w-full px-3 py-2 rounded-xl border-2 border-slate-300 bg-white text-black font-semibold"
                />
              </div>

              <div>
                <label className="block text-black font-extrabold mb-1">Contact Email</label>
                <input
                  type="email"
                  value={formData.contactEmail}
                  onChange={e => setFormData({ ...formData, contactEmail: e.target.value })}
                  placeholder="contact@company.com"
                  className="w-full px-3 py-2 rounded-xl border-2 border-slate-300 bg-white text-black font-semibold"
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
                  Save Organization
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
