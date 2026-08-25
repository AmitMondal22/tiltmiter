import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, X, CheckCircle2, Shield, Lock } from 'lucide-react';
import { getUsers, getOrganizations, getProjects, getSites, createUser, updateUser, deleteUser } from '../api/apiClient';

export default function UsersPage() {
  const cardCls = 'rounded-2xl border border-slate-200 bg-white p-5 text-black shadow-xs';

  const [usersList, setUsersList] = useState([]);
  const [orgsList, setOrgsList] = useState([]);
  const [projectsList, setProjectsList] = useState([]);
  const [sitesList, setSitesList] = useState([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });

  const [formData, setFormData] = useState({
    username: '',
    fullName: '',
    email: '',
    password: '',
    role: 'SITE_USER',
    organizationId: '',
    projectId: '',
    siteId: '',
    status: 'ACTIVE'
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [usersRes, orgsRes, projRes, sitesRes] = await Promise.all([
        getUsers().catch(() => ({ users: [] })),
        getOrganizations().catch(() => ({ organizations: [] })),
        getProjects().catch(() => ({ projects: [] })),
        getSites().catch(() => ({ sites: [] })),
      ]);

      if (usersRes?.users) setUsersList(usersRes.users);
      if (orgsRes?.organizations) setOrgsList(orgsRes.organizations);
      if (projRes?.projects) setProjectsList(projRes.projects);
      if (sitesRes?.sites) setSitesList(sitesRes.sites);
    } catch (e) {
      setUsersList([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenAdd = () => {
    setEditingUser(null);
    setFormData({
      username: '',
      fullName: '',
      email: '',
      password: '',
      role: 'SITE_USER',
      organizationId: orgsList[0]?.id || '',
      projectId: projectsList[0]?.id || '',
      siteId: sitesList[0]?.id || sitesList[0]?.siteId || '',
      status: 'ACTIVE'
    });
    setModalOpen(true);
  };

  const handleOpenEdit = (user) => {
    setEditingUser(user);
    setFormData({
      username: user.username,
      fullName: user.fullName || '',
      email: user.email || '',
      password: '',
      role: user.role,
      organizationId: user.organizationId || '',
      projectId: user.projectId || '',
      siteId: user.siteId || '',
      status: user.status || 'ACTIVE'
    });
    setModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      if (editingUser) {
        await updateUser(editingUser.id, formData);
        setUsersList(prev => prev.map(u => u.id === editingUser.id ? { ...u, ...formData } : u));
        setMsg({ type: 'success', text: `User ${formData.username} updated.` });
      } else {
        const res = await createUser(formData);
        const newUser = res?.user || { id: Date.now(), ...formData };
        setUsersList(prev => [...prev, newUser]);
        setMsg({ type: 'success', text: `User ${formData.username} created.` });
      }
      setModalOpen(false);
    } catch (err) {
      setMsg({ type: 'error', text: err.message || 'Error saving user' });
    } finally {
      setTimeout(() => setMsg({ type: '', text: '' }), 3500);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this user?')) {
      await deleteUser(id).catch(() => {});
      setUsersList(prev => prev.filter(u => u.id !== id));
      setMsg({ type: 'success', text: `User deleted.` });
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
            Users & RBAC Access
          </h2>
          <p className="text-xs text-slate-700 font-medium mt-0.5">
            {usersList.length} authenticated operator accounts
          </p>
        </div>

        {/* Black Pill Action Button */}
        <button
          onClick={handleOpenAdd}
          className="flex items-center gap-1.5 px-5 py-2.5 bg-black text-white font-bold text-xs rounded-xl shadow-xs hover:bg-neutral-800 transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>Add User</span>
        </button>
      </div>

      {/* Users Table */}
      <div className={cardCls}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b-2 border-slate-200 text-black font-extrabold uppercase text-[11px] tracking-wider">
                <th className="py-3 px-3.5">User Full Name</th>
                <th className="py-3 px-3.5">Username / Login</th>
                <th className="py-3 px-3.5">RBAC Role</th>
                <th className="py-3 px-3.5">Assigned Scope</th>
                <th className="py-3 px-3.5">Status</th>
                <th className="py-3 px-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-black font-medium">
              {usersList.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500 text-xs">
                    No operator users registered. Click "+ Add User" to create one.
                  </td>
                </tr>
              ) : (
                usersList.map(user => (
                  <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-4 px-3.5">
                      <div className="font-bold text-black text-sm">{user.fullName || user.username}</div>
                      <div className="text-[11px] text-slate-700 font-mono mt-0.5">{user.email || 'No email attached'}</div>
                    </td>
                    <td className="py-4 px-3.5 font-mono font-bold text-black">
                      {user.username}
                    </td>
                    <td className="py-4 px-3.5">
                      <span className={`px-2.5 py-1 rounded-full font-bold text-[10px] font-mono border ${
                        user.role === 'SUPER_ADMIN' ? 'bg-purple-100 text-purple-950 border-purple-300' :
                        user.role === 'ORG_ADMIN' ? 'bg-blue-100 text-blue-950 border-blue-300' :
                        'bg-slate-100 text-slate-900 border-slate-300'
                      }`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="py-4 px-3.5">
                      <div className="font-bold text-black font-mono text-[11px]">
                        {user.siteId ? `Site: ${user.siteId}` : user.organizationId ? `Org #${user.organizationId}` : 'ALL SITES'}
                      </div>
                    </td>
                    <td className="py-4 px-3.5">
                      <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-950 border border-emerald-300 font-extrabold text-[10px]">
                        {user.status || 'ACTIVE'}
                      </span>
                    </td>
                    <td className="py-4 px-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button onClick={() => handleOpenEdit(user)} className="p-1.5 text-black hover:bg-slate-200 rounded-lg transition-colors">
                          <Edit className="w-4 h-4" />
                        </button>
                        {user.role !== 'SUPER_ADMIN' && (
                          <button onClick={() => handleDelete(user.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
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
                {editingUser ? 'Edit User Account' : 'Create User Account'}
              </h3>
              <button onClick={() => setModalOpen(false)} className="text-black hover:bg-slate-100 p-1 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3 text-xs text-black">
              <div>
                <label className="block text-black font-extrabold mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  value={formData.fullName}
                  onChange={e => setFormData({ ...formData, fullName: e.target.value })}
                  placeholder="e.g. John Doe"
                  className="w-full px-3 py-2 rounded-xl border-2 border-slate-300 bg-white text-black font-bold"
                />
              </div>

              <div>
                <label className="block text-black font-extrabold mb-1">Username / Operator ID *</label>
                <input
                  type="text"
                  required
                  value={formData.username}
                  onChange={e => setFormData({ ...formData, username: e.target.value })}
                  placeholder="e.g. jdoe"
                  className="w-full px-3 py-2 rounded-xl border-2 border-slate-300 bg-white text-black font-mono font-bold"
                />
              </div>

              {!editingUser && (
                <div>
                  <label className="block text-black font-extrabold mb-1">Password *</label>
                  <input
                    type="password"
                    required
                    value={formData.password}
                    onChange={e => setFormData({ ...formData, password: e.target.value })}
                    placeholder="••••••••••••"
                    className="w-full px-3 py-2 rounded-xl border-2 border-slate-300 bg-white text-black font-bold"
                  />
                </div>
              )}

              <div>
                <label className="block text-black font-extrabold mb-1">Role *</label>
                <select
                  value={formData.role}
                  onChange={e => setFormData({ ...formData, role: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border-2 border-slate-300 bg-white text-black font-bold"
                >
                  <option value="SUPER_ADMIN">Super Administrator (Full System)</option>
                  <option value="ORG_ADMIN">Organization Administrator</option>
                  <option value="PROJECT_MANAGER">Project Manager</option>
                  <option value="SITE_ADMIN">Site Administrator</option>
                  <option value="SITE_USER">Site Operator / Viewer</option>
                </select>
              </div>

              <div>
                <label className="block text-black font-extrabold mb-1">Email Address</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                  placeholder="user@company.com"
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
                  Save User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
