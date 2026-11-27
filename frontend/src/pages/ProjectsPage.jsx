import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, X, CheckCircle2, FolderTree, AlertTriangle, Cpu, Radio, MapPin, Building2 } from 'lucide-react';
import { getProjects, getOrganizations, getDevices, getSites, getAlarms, createProject, updateProject, deleteProject } from '../api/apiClient';
import { useAuth } from '../context/AuthContext';

export default function ProjectsPage() {
  const { user: currentUser } = useAuth();

  const [projectsList, setProjectsList] = useState([]);
  const [orgsList, setOrgsList] = useState([]);
  const [devicesList, setDevicesList] = useState([]);
  const [sitesList, setSitesList] = useState([]);
  const [alarmsList, setAlarmsList] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProj, setEditingProj] = useState(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });

  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN';
  const isOrgAdmin = currentUser?.role === 'ORG_ADMIN';
  const canManageProjects = isSuperAdmin || isOrgAdmin;

  const [formData, setFormData] = useState({
    name: '',
    organizationId: '',
    description: '',
    budget: '',
    status: 'ACTIVE',
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [projRes, orgRes, devRes, siteRes, alarmRes] = await Promise.all([
        getProjects().catch(() => ({ projects: [] })),
        getOrganizations().catch(() => ({ organizations: [] })),
        getDevices().catch(() => ({ devices: [] })),
        getSites().catch(() => ({ sites: [] })),
        getAlarms().catch(() => ({ alarms: [] })),
      ]);

      if (projRes?.projects) {
        setProjectsList(projRes.projects);
      }
      if (orgRes?.organizations) {
        setOrgsList(orgRes.organizations);
      }
      if (devRes?.devices) {
        setDevicesList(devRes.devices);
      }
      if (siteRes?.sites) {
        setSitesList(siteRes.sites);
      }
      if (alarmRes?.alarms) {
        setAlarmsList(alarmRes.alarms);
      }
    } catch (e) {
      setProjectsList([]);
      setOrgsList([]);
      setDevicesList([]);
      setSitesList([]);
      setAlarmsList([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenAdd = () => {
    if (!canManageProjects) return;
    setEditingProj(null);
    setFormData({
      name: '',
      organizationId: isOrgAdmin ? (currentUser?.organizationId || orgsList[0]?.id || '') : (orgsList[0]?.id || ''),
      description: '',
      budget: '',
      status: 'ACTIVE',
    });
    setModalOpen(true);
  };

  const handleOpenEdit = (proj) => {
    if (!canManageProjects) return;
    setEditingProj(proj);
    setFormData({
      name: proj.name,
      organizationId: proj.organizationId || proj.Organization?.id || currentUser?.organizationId || '',
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
        const res = await updateProject(editingProj.id, formData);
        const updated = res?.project || { ...editingProj, ...formData };
        setProjectsList(prev => prev.map(p => p.id === editingProj.id ? updated : p));
        setMsg({ type: 'success', text: `Project ${formData.name} updated.` });
      } else {
        const res = await createProject(formData);
        if (res?.project) {
          setProjectsList(prev => [res.project, ...prev]);
        } else {
          loadData();
        }
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
    if (!canManageProjects) return;
    if (window.confirm('Are you sure you want to delete this project?')) {
      try {
        await deleteProject(id);
        setProjectsList(prev => prev.filter(p => p.id !== id));
        setMsg({ type: 'success', text: `Project deleted.` });
      } catch (err) {
        setMsg({ type: 'error', text: err.message || 'Error deleting project' });
      } finally {
        setTimeout(() => setMsg({ type: '', text: '' }), 3000);
      }
    }
  };

  return (
    <div className="space-y-4 font-sans text-black animate-fadeIn">
      {/* Toast */}
      {msg.text && (
        <div className={`p-3.5 rounded-xl border flex items-center gap-2 text-xs font-bold shadow-sm animate-fadeIn ${
          msg.type === 'error' ? 'bg-red-50 border-red-300 text-red-950' : 'bg-emerald-50 border-emerald-300 text-emerald-950'
        }`}>
          {msg.type === 'error' ? <AlertTriangle className="w-4 h-4 text-red-600" /> : <CheckCircle2 className="w-4 h-4 text-emerald-700" />}
          <span>{msg.text}</span>
        </div>
      )}

      {/* Top Header Row */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-black flex items-center gap-2">
            <FolderTree className="w-5 h-5 text-blue-600" />
            <span>Infrastructure Projects</span>
          </h2>
          <p className="text-xs text-slate-700 font-medium mt-0.5">
            {isOrgAdmin ? `Projects in your Organization (${projectsList.length})` : `${projectsList.length} active infrastructure projects`}
          </p>
        </div>

        {/* Black Pill Action Button */}
        {canManageProjects && (
          <button
            onClick={handleOpenAdd}
            className="flex items-center gap-1.5 px-5 py-2.5 bg-black text-white font-bold text-xs rounded-xl shadow-xs hover:bg-neutral-800 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Project</span>
          </button>
        )}
      </div>

      {/* Projects Card Grid */}
      {loading && projectsList.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div key={`skel-${idx}`} className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 shadow-xs">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-2 flex-1">
                  <div className="h-5 w-40 rounded-lg bg-slate-200 animate-pulse" />
                  <div className="h-3.5 w-56 rounded-lg bg-slate-100 animate-pulse" />
                </div>
                <div className="h-6 w-16 rounded-full bg-slate-100 animate-pulse" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="h-16 rounded-xl bg-slate-100 animate-pulse" />
                <div className="h-16 rounded-xl bg-slate-100 animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      ) : projectsList.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-xs">
          <FolderTree className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <div className="text-sm font-bold text-slate-800">No projects registered yet</div>
          <div className="text-xs text-slate-500 mt-1">Click "+ Add Project" to create one.</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {projectsList.map(proj => {
            const org = orgsList.find(o => o.id === proj.organizationId || o.id === proj.Organization?.id);
            const projSites = sitesList.filter(s => String(s.projectId) === String(proj.id));
            const siteCount = proj.Sites ? Math.max(proj.Sites.length, projSites.length) : projSites.length;
            const projSiteIds = new Set([
              ...projSites.flatMap(s => [String(s.id || ''), String(s.siteId || '')]),
              ...(proj.Sites || []).flatMap(s => [String(s.id || ''), String(s.siteId || '')]),
            ].filter(Boolean));

            const projDevices = devicesList.filter(d =>
              String(d.projectId || '') === String(proj.id) ||
              (d.siteId && projSiteIds.has(String(d.siteId)))
            );
            const totalDevices = projDevices.length;
            const onlineDevices = projDevices.filter(
              d => String(d.status || 'ONLINE').toUpperCase() !== 'OFFLINE'
            ).length;
            const offlineDevices = Math.max(0, totalDevices - onlineDevices);

            const projDeviceIds = new Set(projDevices.map(d => String(d.id || d.deviceId || '')));
            const projAlarms = alarmsList.filter(a => {
              const isActive = String(a.status || 'ACTIVE').toUpperCase() === 'ACTIVE';
              if (!isActive) return false;
              return (
                (a.deviceId && projDeviceIds.has(String(a.deviceId))) ||
                (a.siteId && projSiteIds.has(String(a.siteId)))
              );
            });
            const criticalAlerts = projAlarms.filter(a => ['CRITICAL', 'EMERGENCY'].includes(String(a.severity || '').toUpperCase())).length;
            const warningAlerts = projAlarms.filter(a => ['WARNING', 'MAJOR'].includes(String(a.severity || '').toUpperCase())).length;
            const infoAlerts = projAlarms.filter(a => !['CRITICAL', 'EMERGENCY', 'WARNING', 'MAJOR'].includes(String(a.severity || '').toUpperCase())).length;
            const totalAlerts = projAlarms.length;

            return (
              <div
                key={proj.id}
                className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs hover:shadow-md hover:border-blue-200 transition-all flex flex-col justify-between gap-4"
              >
                {/* Card Header: Project Name, Description, Status & Actions */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200/80 text-blue-600 flex items-center justify-center shrink-0">
                      <FolderTree className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-extrabold text-slate-900 text-base truncate" title={proj.name}>
                        {proj.name}
                      </h3>
                      <p className="text-[11px] text-slate-500 font-medium truncate mt-0.5">
                        {proj.description || 'Geotechnical Monitoring Project'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-extrabold text-[10px]">
                      {proj.status || 'ACTIVE'}
                    </span>
                    {canManageProjects && (
                      <>
                        <button
                          onClick={() => handleOpenEdit(proj)}
                          className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                          title="Edit project"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(proj.id)}
                          className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                          title="Delete project"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Device Counts: Total, Online & Offline Devices */}
                <div className="grid grid-cols-3 gap-2.5">
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                    <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      <Cpu className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <span>Total</span>
                    </div>
                    <div className="text-lg font-black text-slate-900 font-mono tabular-nums mt-0.5">
                      {totalDevices}
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200/80">
                    <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                      <Radio className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>Online</span>
                    </div>
                    <div className="text-lg font-black text-emerald-800 font-mono tabular-nums mt-0.5">
                      {onlineDevices}
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-amber-50/60 border border-amber-200/80">
                    <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-700">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span>Offline</span>
                    </div>
                    <div className="text-lg font-black text-amber-800 font-mono tabular-nums mt-0.5">
                      {offlineDevices}
                    </div>
                  </div>
                </div>

                {/* Total Alerts & Color-Coded Alert Types */}
                <div className="p-2.5 rounded-xl bg-slate-50/80 border border-slate-200/80 space-y-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-slate-700 flex items-center gap-1.5">
                      <AlertTriangle className={`w-3.5 h-3.5 ${totalAlerts > 0 ? 'text-rose-600' : 'text-slate-400'}`} />
                      <span>Total Alerts</span>
                    </span>
                    <span className={`font-black font-mono tabular-nums px-2 py-0.5 rounded-md border text-[11px] ${
                      totalAlerts > 0
                        ? 'bg-rose-50 text-rose-700 border-rose-200'
                        : 'bg-white text-slate-700 border-slate-200'
                    }`}>
                      {totalAlerts}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5 text-[10px] font-bold text-center">
                    <div className="px-2 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 font-mono">
                      Crit: {criticalAlerts}
                    </div>
                    <div className="px-2 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 font-mono">
                      Warn: {warningAlerts}
                    </div>
                    <div className="px-2 py-1 rounded-lg bg-sky-50 text-sky-700 border border-sky-200 font-mono">
                      Info: {infoAlerts}
                    </div>
                  </div>
                </div>

                {/* Card Footer: Organization & Sites Count */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-600">
                  <span className="flex items-center gap-1.5 font-semibold truncate">
                    <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{org?.name || proj.Organization?.name || '--'}</span>
                  </span>
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 font-bold shrink-0">
                    <MapPin className="w-3 h-3 text-blue-600" />
                    <span>{siteCount} Sites</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white text-black shadow-2xl p-6">
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-200 mb-4">
              <h3 className="text-base font-black text-black">
                {editingProj ? `Edit Project (${editingProj.name})` : 'Create Project'}
              </h3>
              <button onClick={() => setModalOpen(false)} className="text-black hover:bg-slate-100 p-1 rounded-lg cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3 text-xs text-black">
              {isSuperAdmin ? (
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
              ) : (
                <div>
                  <label className="block text-black font-extrabold mb-1">Organization</label>
                  <div className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 bg-slate-100 text-slate-800 font-bold">
                    {orgsList.find(o => o.id === currentUser?.organizationId)?.name || `Organization #${currentUser?.organizationId}`}
                  </div>
                </div>
              )}

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
                <label className="block text-black font-extrabold mb-1">Description</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  placeholder="e.g. Real-time landslide monitoring"
                  className="w-full px-3 py-2 rounded-xl border-2 border-slate-300 bg-white text-black font-semibold"
                />
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

