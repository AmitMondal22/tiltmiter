import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, X, CheckCircle2, FolderTree, AlertTriangle, MapPin, Building2, Camera, Upload } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip } from 'recharts';
import { getProjects, getOrganizations, getDevices, getSites, getAlarms, createProject, updateProject, deleteProject, formatAssetUrl } from '../api/apiClient';
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
    imageUrl: '',
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
      imageUrl: '',
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
      imageUrl: proj.imageUrl || '',
    });
    setModalOpen(true);
  };

  const handleImageFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setMsg({ type: 'error', text: 'Image must be smaller than 5 MB.' });
      setTimeout(() => setMsg({ type: '', text: '' }), 3500);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setFormData(prev => ({ ...prev, imageUrl: reader.result }));
    };
    reader.readAsDataURL(file);
  };

  const handleQuickImageUpload = (proj, e) => {
    const file = e.target.files?.[0];
    if (!file || !canManageProjects) return;
    if (file.size > 5 * 1024 * 1024) {
      setMsg({ type: 'error', text: 'Image must be smaller than 5 MB.' });
      setTimeout(() => setMsg({ type: '', text: '' }), 3500);
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const res = await updateProject(proj.id, { imageUrl: reader.result });
        const updated = res?.project || { ...proj, imageUrl: reader.result };
        setProjectsList(prev => prev.map(p => p.id === proj.id ? updated : p));
        setMsg({ type: 'success', text: `Image updated for ${proj.name}.` });
      } catch (err) {
        setMsg({ type: 'error', text: err.message || 'Error updating project image' });
      } finally {
        setTimeout(() => setMsg({ type: '', text: '' }), 3500);
      }
    };
    reader.readAsDataURL(file);
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
        <div className={`p-3.5 rounded-xl border flex items-center gap-2 text-xs font-bold shadow-sm animate-fadeIn ${msg.type === 'error' ? 'bg-red-50 border-red-300 text-red-950' : 'bg-emerald-50 border-emerald-300 text-emerald-950'
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
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
              return (
                (a.projectId && String(a.projectId) === String(proj.id)) ||
                (a.deviceId && projDeviceIds.has(String(a.deviceId))) ||
                (a.siteId && projSiteIds.has(String(a.siteId)))
              );
            });
            const maintenanceDevices = projDevices.filter(
              d => String(d.status || '').toUpperCase() === 'MAINTENANCE'
            ).length;
            const criticalAlerts = projAlarms.filter(a => ['CRITICAL', 'EMERGENCY'].includes(String(a.severity || '').toUpperCase())).length;
            const warningAlerts = projAlarms.filter(a => ['WARNING', 'MAJOR'].includes(String(a.severity || '').toUpperCase())).length;
            const cautionAlerts = projAlarms.filter(a => ['CAUTION', 'MINOR', 'INFO'].includes(String(a.severity || '').toUpperCase())).length;
            const offlineAlertCount = offlineDevices + projAlarms.filter(a => String(a.severity || '').toUpperCase() === 'OFFLINE').length;
            const maintenanceAlertCount = maintenanceDevices + projAlarms.filter(a => String(a.severity || '').toUpperCase() === 'MAINTENANCE').length;
            const alarmedDeviceIds = new Set(
              projAlarms
                .filter(a => String(a.status || 'ACTIVE').toUpperCase() === 'ACTIVE' && a.deviceId)
                .map(a => String(a.deviceId))
            );
            const normalCount = projDevices.filter(d => {
              const st = String(d.status || 'ONLINE').toUpperCase();
              return st !== 'OFFLINE' && st !== 'MAINTENANCE' && !alarmedDeviceIds.has(String(d.id || d.deviceId || ''));
            }).length;
            const totalAlerts = projAlarms.length;

            return (
              <div
                key={proj.id}
                className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs hover:shadow-md hover:border-blue-200 transition-all flex flex-col justify-between gap-3"
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

                {/* Project Image Under Title */}
                {proj.imageUrl ? (
                  <div className="relative w-full h-28 rounded-xl overflow-hidden border border-slate-200/80 bg-slate-100 group">
                    <img
                      src={formatAssetUrl(proj.imageUrl)}
                      alt={proj.name}
                      className="w-full h-full object-cover"
                    />
                    {canManageProjects && (
                      <label className="absolute bottom-1.5 right-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-black/70 hover:bg-black text-white text-[10px] font-semibold backdrop-blur-xs opacity-90 group-hover:opacity-100 transition-opacity cursor-pointer shadow-xs">
                        <Upload className="w-3 h-3" />
                        <span>Update Image</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => handleQuickImageUpload(proj, e)}
                        />
                      </label>
                    )}
                  </div>
                ) : (
                  <div className="w-full h-16 rounded-xl border border-dashed border-slate-200 bg-slate-50/70 flex items-center justify-center">
                    {canManageProjects ? (
                      <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white hover:bg-blue-50 text-slate-600 hover:text-blue-600 border border-slate-200 text-[11px] font-semibold transition-colors cursor-pointer shadow-2xs">
                        <Camera className="w-3.5 h-3.5" />
                        <span>Upload Project Image</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => handleQuickImageUpload(proj, e)}
                        />
                      </label>
                    ) : (
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-medium">
                        <Camera className="w-3.5 h-3.5" />
                        <span>No Project Image</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Nodes Donut Chart & Summary */}
                {(() => {
                  const rawChartData = [
                    { name: 'Normal', value: normalCount, color: '#10b981' },
                    { name: 'Caution', value: cautionAlerts, color: '#facc15' },
                    { name: 'Warning', value: warningAlerts, color: '#fb923c' },
                    { name: 'Critical', value: criticalAlerts, color: '#ef4444' },
                    { name: 'Offline', value: offlineAlertCount, color: '#64748b' },
                    { name: 'Maintenance', value: maintenanceAlertCount, color: '#0ea5e9' },
                  ].filter(d => d.value > 0);
                  const chartData = rawChartData.length > 0
                    ? rawChartData
                    : [{ name: 'No Nodes', value: 1, color: '#e2e8f0' }];
                  const hasChartData = rawChartData.length > 0;

                  return (
                    <div className="p-2.5 rounded-xl bg-slate-50/60 border border-slate-200/80 flex items-center gap-3">
                      {/* Left: Recharts Donut Chart */}
                      <div className="w-[74px] h-[74px] rounded-full bg-white border border-slate-100 shadow-sm flex items-center justify-center shrink-0">
                        <PieChart width={70} height={70}>
                          <Pie
                            data={chartData}
                            cx={35}
                            cy={35}
                            innerRadius={19}
                            outerRadius={30}
                            paddingAngle={chartData.length > 1 ? 4 : 0}
                            dataKey="value"
                            stroke="none"
                            startAngle={95}
                            endAngle={-265}
                            isAnimationActive={false}
                          >
                            {chartData.map((entry, idx) => (
                              <Cell key={`cell-${idx}`} fill={entry.color} />
                            ))}
                          </Pie>
                          {hasChartData && (
                            <Tooltip
                              formatter={(value, name) => [value, name]}
                              contentStyle={{
                                fontSize: '11px',
                                padding: '4px 8px',
                                borderRadius: '8px',
                                border: '1px solid #e2e8f0',
                                boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
                              }}
                            />
                          )}
                        </PieChart>
                      </div>

                      {/* Right: Total Nodes & Status / Alert Breakdown */}
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex items-center justify-between gap-2 pb-1 border-b border-slate-200/70">
                          <span className="text-xs font-bold text-[#155b94]">Total Nodes</span>
                          <span className="text-xs font-bold text-[#155b94] tabular-nums">
                            : {totalDevices}
                          </span>
                        </div>

                        <div className="space-y-1 text-[11px]">
                          <div className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-1.5 text-emerald-700 font-medium">
                              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                              <span>Normal</span>
                            </span>
                            <span className="font-semibold text-emerald-700 tabular-nums">
                              : {normalCount}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-1.5 text-yellow-700 font-medium">
                              <span className="w-2 h-2 rounded-full bg-yellow-400 shrink-0" />
                              <span>Caution</span>
                            </span>
                            <span className="font-semibold text-yellow-700 tabular-nums">
                              : {cautionAlerts}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-1.5 text-orange-600 font-medium">
                              <span className="w-2 h-2 rounded-full bg-orange-400 shrink-0" />
                              <span>Warning</span>
                            </span>
                            <span className="font-semibold text-orange-600 tabular-nums">
                              : {warningAlerts}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-1.5 text-red-600 font-medium">
                              <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                              <span>Critical</span>
                            </span>
                            <span className="font-semibold text-red-600 tabular-nums">
                              : {criticalAlerts}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-1.5 text-slate-600 font-medium">
                              <span className="w-2 h-2 rounded-full bg-slate-500 shrink-0" />
                              <span>Offline</span>
                            </span>
                            <span className="font-semibold text-slate-700 tabular-nums">
                              : {offlineAlertCount}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-1.5 text-sky-700 font-medium">
                              <span className="w-2 h-2 rounded-full bg-sky-500 shrink-0" />
                              <span>Maintenance</span>
                            </span>
                            <span className="font-semibold text-sky-700 tabular-nums">
                              : {maintenanceAlertCount}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

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

              <div>
                <label className="block text-black font-extrabold mb-1">Project Image</label>
                <div className="flex items-center gap-3 p-3 rounded-xl border-2 border-slate-200 bg-slate-50/80">
                  {formData.imageUrl ? (
                    <div className="w-16 h-16 rounded-xl overflow-hidden border border-slate-200 bg-white shadow-2xs shrink-0">
                      <img
                        src={formatAssetUrl(formData.imageUrl)}
                        alt="Project preview"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="w-16 h-16 rounded-xl border border-dashed border-slate-300 bg-white flex items-center justify-center text-slate-400 shrink-0">
                      <Camera className="w-5 h-5" />
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-xs transition-colors cursor-pointer">
                      <Upload className="w-3.5 h-3.5" />
                      <span>{formData.imageUrl ? 'Update Image' : 'Upload Image'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleImageFileSelect}
                      />
                    </label>
                    {formData.imageUrl && (
                      <button
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, imageUrl: '' }))}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 font-semibold text-xs transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Remove</span>
                      </button>
                    )}
                  </div>
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

