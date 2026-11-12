import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  TicketCheck, Search, Filter, Plus, RefreshCw, AlertTriangle,
  CheckCircle2, Clock, MapPin, Layers, Cpu, User, UserPlus,
  Eye, X, Upload, Camera, ShieldCheck, ShieldAlert,
  MessageSquare, ChevronRight, Copy, Check, RotateCcw,
  Wrench, FileText, Image as ImageIcon, Building2,
  Trash2, AlertCircle, ArrowUpRight, HelpCircle, Download, Printer
} from 'lucide-react';
import {
  getTickets, getTicketStats, createTicket, assignTicket,
  resolveTicket, closeTicket, reopenTicket, addTicketComment,
  deleteTicket, getSites, getStructures, getDevices, getUsers,
  formatAssetUrl
} from '../api/apiClient';
import { useAuth } from '../context/AuthContext';

// Helper for formatted date
function formatDateTime(isoStr) {
  if (!isoStr) return '-';
  try {
    const d = new Date(isoStr);
    return d.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch (_) {
    return isoStr;
  }
}

function getRelativeTime(isoStr) {
  if (!isoStr) return '';
  try {
    const diffMs = Date.now() - new Date(isoStr).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  } catch (_) {
    return '';
  }
}

// Category Badge
function CategoryBadge({ category }) {
  const cat = (category || 'MANUAL').toUpperCase();
  let label = 'Manual Ticket';
  let color = 'bg-slate-100 text-slate-700 border-slate-200';

  if (cat === 'CRITICAL_ALERT') {
    label = 'Critical Alert';
    color = 'bg-red-50 text-red-700 border-red-200';
  } else if (cat === 'STRUCTURAL_ANOMALY') {
    label = 'Structural Anomaly';
    color = 'bg-amber-50 text-amber-700 border-amber-200';
  } else if (cat === 'SENSOR_FAULT') {
    label = 'Sensor Fault';
    color = 'bg-orange-50 text-orange-700 border-orange-200';
  } else if (cat === 'MAINTENANCE') {
    label = 'Maintenance';
    color = 'bg-blue-50 text-blue-700 border-blue-200';
  } else if (cat === 'SITE_INSPECTION') {
    label = 'Site Inspection';
    color = 'bg-indigo-50 text-indigo-700 border-indigo-200';
  } else if (cat === 'BATTERY_POWER') {
    label = 'Power / Battery';
    color = 'bg-yellow-50 text-yellow-800 border-yellow-200';
  }

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${color}`}>
      {label}
    </span>
  );
}

// Priority Badge
function PriorityBadge({ priority }) {
  const p = (priority || 'HIGH').toUpperCase();
  if (p === 'CRITICAL' || p === 'EMERGENCY') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-800 border border-red-300 shadow-2xs">
        <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-ping" />
        Critical
      </span>
    );
  }
  if (p === 'HIGH') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
        High
      </span>
    );
  }
  if (p === 'MEDIUM') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-100 text-blue-800 border border-blue-200">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
        Medium
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
      <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
      Low
    </span>
  );
}

// Status Badge
function StatusBadge({ status }) {
  const s = (status || 'OPEN').toUpperCase();
  if (s === 'OPEN' || s === 'NEW') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 shadow-2xs">
        <span className="w-2 h-2 rounded-full bg-amber-500" />
        Open
      </span>
    );
  }
  if (s === 'IN_PROGRESS') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs">
        <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
        In Progress
      </span>
    );
  }
  if (s === 'RESOLVED') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200 shadow-2xs">
        <CheckCircle2 className="w-3.5 h-3.5 text-purple-600" />
        Resolved (Pending Admin)
      </span>
    );
  }
  if (s === 'REOPENED') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 shadow-2xs">
        <RotateCcw className="w-3.5 h-3.5 text-rose-600" />
        Rework Required
      </span>
    );
  }
  if (s === 'CLOSED') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
        Closed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
      {status}
    </span>
  );
}

export default function TicketsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'ORG_ADMIN' || user?.role === 'SITE_ADMIN';

  // Data states
  const [tickets, setTickets] = useState([]);
  const [stats, setStats] = useState({
    total: 0,
    open: 0,
    inProgress: 0,
    resolved: 0,
    closed: 0,
    reopened: 0,
    critical: 0,
  });
  const [loading, setLoading] = useState(true);
  const [sites, setSites] = useState([]);
  const [structures, setStructures] = useState([]);
  const [devices, setDevices] = useState([]);
  const [usersList, setUsersList] = useState([]);

  // Filter & Search states
  const [activeTab, setActiveTab] = useState('ALL'); // ALL, OPEN, IN_PROGRESS, RESOLVED, REOPENED, CLOSED
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [selectedSiteFilter, setSelectedSiteFilter] = useState('');

  // Modals & Drawers
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [resolveModalOpen, setResolveModalOpen] = useState(false);
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [reopenModalOpen, setReopenModalOpen] = useState(false);
  const [lightboxImage, setLightboxImage] = useState(null);

  // Form states for Create Ticket
  const [createForm, setCreateForm] = useState({
    title: '',
    category: 'MANUAL',
    severity: 'HIGH',
    siteId: '',
    structureId: '',
    deviceId: '',
    assignedUserId: '',
    remarks: '',
  });

  // Form states for Resolve Ticket
  const [resolveForm, setResolveForm] = useState({
    siteRemarks: '',
    correctiveAction: '',
    rootCause: '',
    images: [],
  });

  // Form states for Admin Close / Reopen
  const [adminFeedback, setAdminFeedback] = useState('');
  const [assignForm, setAssignForm] = useState({ userId: '', note: '' });
  const [commentText, setCommentText] = useState('');
  const [copiedCode, setCopiedCode] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  // File input ref for image upload
  const fileInputRef = useRef(null);

  // Load Initial Data
  const loadTicketsAndMetadata = async () => {
    setLoading(true);
    try {
      const [ticketsRes, statsRes, sitesRes, structuresRes, devicesRes, usersRes] = await Promise.allSettled([
        getTickets(),
        getTicketStats(),
        getSites(),
        getStructures(),
        getDevices(),
        getUsers(),
      ]);

      if (ticketsRes.status === 'fulfilled' && ticketsRes.value) {
        const list = ticketsRes.value.tickets || ticketsRes.value.incidents || [];
        setTickets(list);
      }
      if (statsRes.status === 'fulfilled' && statsRes.value?.stats) {
        setStats(statsRes.value.stats);
      }
      if (sitesRes.status === 'fulfilled' && sitesRes.value) {
        setSites(sitesRes.value.sites || sitesRes.value || []);
      }
      if (structuresRes.status === 'fulfilled' && structuresRes.value) {
        setStructures(structuresRes.value.structures || structuresRes.value || []);
      }
      if (devicesRes.status === 'fulfilled' && devicesRes.value) {
        setDevices(devicesRes.value.devices || devicesRes.value || []);
      }
      if (usersRes.status === 'fulfilled' && usersRes.value) {
        setUsersList(usersRes.value.users || usersRes.value || []);
      }
    } catch (err) {
      console.error('Error loading tickets data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTicketsAndMetadata();
  }, []);

  // Filtered tickets
  const filteredTickets = useMemo(() => {
    return tickets.filter(t => {
      // Tab filter
      if (activeTab === 'OPEN' && !['OPEN', 'NEW'].includes((t.status || '').toUpperCase())) return false;
      if (activeTab === 'IN_PROGRESS' && (t.status || '').toUpperCase() !== 'IN_PROGRESS') return false;
      if (activeTab === 'RESOLVED' && (t.status || '').toUpperCase() !== 'RESOLVED') return false;
      if (activeTab === 'REOPENED' && (t.status || '').toUpperCase() !== 'REOPENED') return false;
      if (activeTab === 'CLOSED' && (t.status || '').toUpperCase() !== 'CLOSED') return false;

      // Priority filter
      if (priorityFilter && (t.severity || '').toUpperCase() !== priorityFilter.toUpperCase()) return false;

      // Source filter
      if (sourceFilter && (t.source || '').toUpperCase() !== sourceFilter.toUpperCase()) return false;

      // Site filter
      if (selectedSiteFilter && String(t.siteId || '') !== String(selectedSiteFilter)) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchCode = (t.incidentCode || '').toLowerCase().includes(q);
        const matchTitle = (t.title || '').toLowerCase().includes(q);
        const matchDev = (t.deviceId || '').toLowerCase().includes(q);
        const matchUser = (t.assignedUserName || '').toLowerCase().includes(q);
        const matchRemarks = (t.siteRemarks || '').toLowerCase().includes(q) || (t.rootCause || '').toLowerCase().includes(q);
        if (!matchCode && !matchTitle && !matchDev && !matchUser && !matchRemarks) return false;
      }

      return true;
    });
  }, [tickets, activeTab, priorityFilter, sourceFilter, selectedSiteFilter, searchQuery]);

  // Copy Ticket Code
  const copyToClipboard = (text) => {
    navigator.clipboard?.writeText(text);
    setCopiedCode(text);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  // Handle Create Ticket Submit
  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!createForm.title.trim()) return;

    setActionLoading(true);
    try {
      const selectedUserObj = usersList.find(u => String(u.id) === String(createForm.assignedUserId));
      const res = await createTicket({
        title: createForm.title.trim(),
        category: createForm.category,
        severity: createForm.severity,
        siteId: createForm.siteId || null,
        structureId: createForm.structureId || null,
        deviceId: createForm.deviceId || null,
        assignedUserId: createForm.assignedUserId ? parseInt(createForm.assignedUserId, 10) : null,
        assignedUserName: selectedUserObj ? (selectedUserObj.fullName || selectedUserObj.username) : null,
        assignedUserEmail: selectedUserObj?.email || null,
        remarks: createForm.remarks.trim(),
      });

      if (res?.ticket || res?.incident) {
        setCreateModalOpen(false);
        setCreateForm({
          title: '',
          category: 'MANUAL',
          severity: 'HIGH',
          siteId: '',
          structureId: '',
          deviceId: '',
          assignedUserId: '',
          remarks: '',
        });
        await loadTicketsAndMetadata();
      }
    } catch (err) {
      alert(err.message || 'Error creating ticket');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Assign Submit
  const handleAssignSubmit = async (e) => {
    e.preventDefault();
    if (!selectedTicket || !assignForm.userId) return;

    setActionLoading(true);
    try {
      const targetUser = usersList.find(u => String(u.id) === String(assignForm.userId));
      const res = await assignTicket(selectedTicket.id || selectedTicket.incidentCode, {
        assignedUserId: targetUser.id,
        assignedUserName: targetUser.fullName || targetUser.username,
        assignedUserEmail: targetUser.email || null,
        note: assignForm.note.trim() || undefined,
      });

      if (res?.ticket) {
        setSelectedTicket(res.ticket);
        setAssignModalOpen(false);
        setAssignForm({ userId: '', note: '' });
        await loadTicketsAndMetadata();
      }
    } catch (err) {
      alert(err.message || 'Error assigning ticket');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Image Upload for Resolution
  const handleImageFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    files.forEach(file => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = () => {
        setResolveForm(prev => ({
          ...prev,
          images: [...prev.images, reader.result],
        }));
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const removeResolutionImage = (idx) => {
    setResolveForm(prev => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== idx),
    }));
  };

  // Handle User Site Resolve Submit
  const handleResolveSubmit = async (e) => {
    e.preventDefault();
    if (!selectedTicket) return;
    if (!resolveForm.siteRemarks.trim()) {
      alert('Please enter site resolution remarks describing what was inspected and repaired.');
      return;
    }

    setActionLoading(true);
    try {
      const res = await resolveTicket(selectedTicket.id || selectedTicket.incidentCode, {
        siteRemarks: resolveForm.siteRemarks.trim(),
        correctiveAction: resolveForm.correctiveAction.trim() || undefined,
        rootCause: resolveForm.rootCause.trim() || undefined,
        images: resolveForm.images,
      });

      if (res?.ticket) {
        setSelectedTicket(res.ticket);
        setResolveModalOpen(false);
        setResolveForm({ siteRemarks: '', correctiveAction: '', rootCause: '', images: [] });
        await loadTicketsAndMetadata();
      }
    } catch (err) {
      alert(err.message || 'Error resolving ticket');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Admin Close Ticket Submit
  const handleCloseSubmit = async (e) => {
    e.preventDefault();
    if (!selectedTicket) return;

    setActionLoading(true);
    try {
      const res = await closeTicket(selectedTicket.id || selectedTicket.incidentCode, {
        adminRemarks: adminFeedback.trim() || 'Verified by Admin. Ticket approved and closed.',
      });

      if (res?.ticket) {
        setSelectedTicket(res.ticket);
        setCloseModalOpen(false);
        setAdminFeedback('');
        await loadTicketsAndMetadata();
      }
    } catch (err) {
      alert(err.message || 'Error closing ticket');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Admin Reject / Replay / Reopen Submit
  const handleReopenSubmit = async (e) => {
    e.preventDefault();
    if (!selectedTicket) return;
    if (!adminFeedback.trim()) {
      alert('Please provide feedback explaining why the resolution is rejected and what rework is required.');
      return;
    }

    setActionLoading(true);
    try {
      const res = await reopenTicket(selectedTicket.id || selectedTicket.incidentCode, {
        adminRemarks: adminFeedback.trim(),
      });

      if (res?.ticket) {
        setSelectedTicket(res.ticket);
        setReopenModalOpen(false);
        setAdminFeedback('');
        await loadTicketsAndMetadata();
      }
    } catch (err) {
      alert(err.message || 'Error reopening ticket');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Add Discussion Comment
  const handleCommentSubmit = async (e) => {
    e.preventDefault();
    if (!selectedTicket || !commentText.trim()) return;

    try {
      const res = await addTicketComment(selectedTicket.id || selectedTicket.incidentCode, {
        text: commentText.trim(),
      });
      if (res?.ticket) {
        setSelectedTicket(res.ticket);
        setCommentText('');
        // Update local tickets list item
        setTickets(prev => prev.map(t => (t.id === res.ticket.id ? res.ticket : t)));
      }
    } catch (err) {
      alert(err.message || 'Error adding comment');
    }
  };

  // Handle Delete Ticket
  const handleDeleteTicket = async (id) => {
    if (!window.confirm('Are you sure you want to permanently delete this ticket?')) return;
    try {
      await deleteTicket(id);
      if (selectedTicket?.id === id || selectedTicket?.incidentCode === id) {
        setDetailDrawerOpen(false);
        setSelectedTicket(null);
      }
      await loadTicketsAndMetadata();
    } catch (err) {
      alert(err.message || 'Error deleting ticket');
    }
  };

  // Cascading Select for Structure in Create Form
  const filteredStructuresForCreate = useMemo(() => {
    if (!createForm.siteId) return structures;
    return structures.filter(s => String(s.siteId) === String(createForm.siteId));
  }, [structures, createForm.siteId]);

  // Cascading Select for Devices in Create Form
  const filteredDevicesForCreate = useMemo(() => {
    if (createForm.structureId) {
      return devices.filter(d => String(d.structureId) === String(createForm.structureId));
    }
    if (createForm.siteId) {
      return devices.filter(d => String(d.siteId) === String(createForm.siteId));
    }
    return devices;
  }, [devices, createForm.structureId, createForm.siteId]);

  // Export Filtered Tickets to CSV
  const handleExportCSV = () => {
    if (!filteredTickets.length) {
      alert('No tickets available to export for the current filters.');
      return;
    }

    const headers = [
      'Ticket Code',
      'Title',
      'Category',
      'Severity / Priority',
      'Status',
      'Source',
      'Device ID',
      'Site ID',
      'Structure ID',
      'Assigned User',
      'Assigned Email',
      'Created By',
      'Root Cause / Description',
      'Site Resolution Remarks',
      'Corrective Action Taken',
      'Admin Remarks',
      'Resolution Photos Count',
      'Created At',
      'Resolved At',
      'Closed At'
    ].join(',');

    const rows = filteredTickets.map(t => [
      `"${t.incidentCode || ''}"`,
      `"${(t.title || '').replace(/"/g, '""')}"`,
      `"${t.category || ''}"`,
      `"${t.severity || ''}"`,
      `"${t.status || ''}"`,
      `"${t.source || ''}"`,
      `"${t.deviceId || ''}"`,
      `"${t.siteId || ''}"`,
      `"${t.structureId || ''}"`,
      `"${(t.assignedUserName || '').replace(/"/g, '""')}"`,
      `"${t.assignedUserEmail || ''}"`,
      `"${t.createdByUserName || ''}"`,
      `"${(t.rootCause || '').replace(/"/g, '""')}"`,
      `"${(t.siteRemarks || '').replace(/"/g, '""')}"`,
      `"${(t.correctiveAction || '').replace(/"/g, '""')}"`,
      `"${(t.adminRemarks || '').replace(/"/g, '""')}"`,
      t.resolutionImages ? t.resolutionImages.length : 0,
      `"${t.createdAt || ''}"`,
      `"${t.resolvedAt || ''}"`,
      `"${t.closedAt || ''}"`,
    ].join(','));

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers, ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `incident_tickets_report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="flex-1 flex flex-col p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto w-full space-y-6">
      {/* ── Top Header Bar ─────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
              <TicketCheck className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">
                Incident & Maintenance Tickets
              </h1>
              <p className="text-xs md:text-sm text-slate-500 mt-0.5">
                Automated critical alerts, field site service, resolution proofs & administrative verification.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl shadow-2xs transition-all active:scale-95 cursor-pointer"
            title="Print tickets report"
          >
            <Printer className="w-3.5 h-3.5 text-slate-500" />
            <span>Print Report</span>
          </button>

          <button
            type="button"
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl shadow-2xs transition-all active:scale-95 cursor-pointer"
            title="Export tickets to CSV"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Export CSV</span>
          </button>

          <button
            type="button"
            onClick={loadTicketsAndMetadata}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl shadow-2xs transition-all active:scale-95 disabled:opacity-60"
            title="Refresh tickets list"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            onClick={() => setCreateModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md shadow-blue-600/20 transition-all active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Ticket</span>
          </button>
        </div>
      </div>

      {/* ── KPI Metric Cards ───────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
        {/* Total Tickets */}
        <div className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold">Total Tickets</span>
            <TicketCheck className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">{stats.total || tickets.length}</span>
            <span className="text-[11px] text-slate-500 font-medium">Logged</span>
          </div>
        </div>

        {/* Open & Active */}
        <div className="p-3.5 rounded-2xl bg-white border border-amber-200/80 shadow-2xs flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-amber-500/5 rounded-full blur-xl pointer-events-none" />
          <div className="flex items-center justify-between text-amber-700">
            <span className="text-xs font-semibold">Open / Active</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-amber-800">{stats.open || 0}</span>
            <span className="text-[11px] text-amber-700 font-medium">Action pending</span>
          </div>
        </div>

        {/* Critical Alerts */}
        <div className="p-3.5 rounded-2xl bg-white border border-red-200/80 shadow-2xs flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-red-500/5 rounded-full blur-xl pointer-events-none" />
          <div className="flex items-center justify-between text-red-700">
            <span className="text-xs font-semibold">Critical Priority</span>
            <AlertTriangle className="w-4 h-4 text-red-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-red-800">{stats.critical || 0}</span>
            <span className="text-[11px] text-red-600 font-medium">High Urgency</span>
          </div>
        </div>

        {/* In Progress */}
        <div className="p-3.5 rounded-2xl bg-white border border-blue-200/80 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-blue-700">
            <span className="text-xs font-semibold">In Progress</span>
            <Wrench className="w-4 h-4 text-blue-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-blue-800">{stats.inProgress || 0}</span>
            <span className="text-[11px] text-blue-600 font-medium">Assigned</span>
          </div>
        </div>

        {/* Pending Admin Review (Resolved by Field) */}
        <div className="p-3.5 rounded-2xl bg-purple-50/60 border border-purple-200 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-purple-700">
            <span className="text-xs font-semibold">Pending Admin</span>
            <ShieldAlert className="w-4 h-4 text-purple-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-purple-900">{stats.resolved || 0}</span>
            <span className="text-[11px] text-purple-700 font-medium">Awaiting review</span>
          </div>
        </div>

        {/* Closed */}
        <div className="p-3.5 rounded-2xl bg-white border border-emerald-200/80 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-emerald-700">
            <span className="text-xs font-semibold">Closed & Verified</span>
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-800">{stats.closed || 0}</span>
            <span className="text-[11px] text-emerald-600 font-medium">Completed</span>
          </div>
        </div>
      </div>

      {/* ── Filter & Search Toolbar ─────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-2xs space-y-3">
        {/* Status Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-slate-100">
          {[
            { id: 'ALL', label: 'All Tickets' },
            { id: 'OPEN', label: 'Open' },
            { id: 'IN_PROGRESS', label: 'In Progress' },
            { id: 'RESOLVED', label: 'Resolved (Pending Review)' },
            { id: 'REOPENED', label: 'Rework Required' },
            { id: 'CLOSED', label: 'Closed' },
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Filter Controls Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-12 gap-2.5">
          {/* Search Input */}
          <div className="relative lg:col-span-4">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search code, title, device, technician..."
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Priority Filter */}
          <div className="lg:col-span-3">
            <select
              value={priorityFilter}
              onChange={e => setPriorityFilter(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-700"
            >
              <option value="">All Priorities</option>
              <option value="CRITICAL">Critical Priority</option>
              <option value="HIGH">High Priority</option>
              <option value="MEDIUM">Medium Priority</option>
              <option value="LOW">Low Priority</option>
            </select>
          </div>

          {/* Source Filter */}
          <div className="lg:col-span-2">
            <select
              value={sourceFilter}
              onChange={e => setSourceFilter(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-700"
            >
              <option value="">All Sources</option>
              <option value="AUTO_ALERT">Auto Alert (System)</option>
              <option value="MANUAL">Manual Ticket</option>
            </select>
          </div>

          {/* Site Filter */}
          <div className="lg:col-span-3">
            <select
              value={selectedSiteFilter}
              onChange={e => setSelectedSiteFilter(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-700"
            >
              <option value="">All Locations / Sites</option>
              {sites.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name || s.id}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── Tickets Main List Table ─────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center text-slate-500 gap-3">
            <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs font-semibold">Loading ticket database...</p>
          </div>
        ) : filteredTickets.length === 0 ? (
          <div className="py-20 text-center flex flex-col items-center justify-center p-6 text-slate-500 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400">
              <TicketCheck className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-800">No Tickets Found</h4>
              <p className="text-xs text-slate-500 max-w-sm mt-0.5">
                No tickets match your filter criteria. Adjust the filters or create a new incident ticket.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setActiveTab('ALL');
                setSearchQuery('');
                setPriorityFilter('');
                setSourceFilter('');
                setSelectedSiteFilter('');
              }}
              className="px-3.5 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors cursor-pointer"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/75 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Ticket Code</th>
                  <th className="py-3 px-4">Priority / Category</th>
                  <th className="py-3 px-4">Incident Title & Device</th>
                  <th className="py-3 px-4">Site / Asset</th>
                  <th className="py-3 px-4">Assigned To</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Created</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredTickets.map(t => {
                  const siteObj = sites.find(s => String(s.id) === String(t.siteId));
                  const structObj = structures.find(s => String(s.id) === String(t.structureId));

                  return (
                    <tr
                      key={t.id || t.incidentCode}
                      className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                      onClick={() => {
                        setSelectedTicket(t);
                        setDetailDrawerOpen(true);
                      }}
                    >
                      {/* Ticket Code */}
                      <td className="py-3.5 px-4 font-mono font-semibold text-slate-900 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span>{t.incidentCode}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              copyToClipboard(t.incidentCode);
                            }}
                            className="p-1 text-slate-400 hover:text-slate-700 rounded transition-colors"
                            title="Copy Code"
                          >
                            {copiedCode === t.incidentCode ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                        <span className="text-[10px] text-slate-400 font-sans block mt-0.5">
                          {t.source === 'AUTO_ALERT' ? '🤖 Auto Alert' : '👤 Manual'}
                        </span>
                      </td>

                      {/* Priority / Category */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex flex-col gap-1 items-start">
                          <PriorityBadge priority={t.severity} />
                          <CategoryBadge category={t.category} />
                        </div>
                      </td>

                      {/* Title & Device */}
                      <td className="py-3.5 px-4 min-w-[220px] max-w-[340px]">
                        <p className="font-semibold text-slate-900 truncate" title={t.title}>
                          {t.title}
                        </p>
                        <div className="flex items-center gap-2 mt-1 text-slate-500 text-[11px]">
                          {t.deviceId ? (
                            <span className="inline-flex items-center gap-1 font-mono font-medium text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                              <Cpu className="w-3 h-3 text-blue-600" />
                              {t.deviceId}
                            </span>
                          ) : (
                            <span className="text-slate-400">No device attached</span>
                          )}
                          {t.resolutionImages && t.resolutionImages.length > 0 && (
                            <span className="inline-flex items-center gap-0.5 text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200 font-medium">
                              <ImageIcon className="w-3 h-3" />
                              {t.resolutionImages.length} photo{t.resolutionImages.length > 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Site / Asset */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-slate-600">
                        <div className="flex items-center gap-1.5 text-slate-800 font-medium">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                          <span className="truncate max-w-[140px]" title={siteObj?.name || t.siteId || 'Main Site'}>
                            {siteObj?.name || t.siteId || '-'}
                          </span>
                        </div>
                        {structObj?.name && (
                          <div className="flex items-center gap-1 mt-0.5 text-[11px] text-slate-500">
                            <Layers className="w-3 h-3 text-slate-400" />
                            <span className="truncate max-w-[140px]">{structObj.name}</span>
                          </div>
                        )}
                      </td>

                      {/* Assigned User */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {t.assignedUserName ? (
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 font-bold text-[10px] flex items-center justify-center uppercase">
                              {t.assignedUserName.slice(0, 2)}
                            </div>
                            <span className="font-medium text-slate-800 truncate max-w-[130px]">
                              {t.assignedUserName}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">Unassigned</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <StatusBadge status={t.status} />
                      </td>

                      {/* Created */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-slate-500 text-[11px]">
                        <div>{formatDateTime(t.createdAt)}</div>
                        <span className="text-[10px] text-slate-400">{getRelativeTime(t.createdAt)}</span>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          {/* View details */}
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedTicket(t);
                              setDetailDrawerOpen(true);
                            }}
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="View Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {/* Quick Assign */}
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedTicket(t);
                              setAssignForm({ userId: t.assignedUserId ? String(t.assignedUserId) : '', note: '' });
                              setAssignModalOpen(true);
                            }}
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Assign User"
                          >
                            <UserPlus className="w-4 h-4" />
                          </button>

                          {/* Resolve Button (for field users on open/in-progress) */}
                          {['OPEN', 'IN_PROGRESS', 'REOPENED', 'NEW'].includes((t.status || '').toUpperCase()) && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedTicket(t);
                                setResolveForm({
                                  siteRemarks: t.siteRemarks || '',
                                  correctiveAction: t.correctiveAction || '',
                                  rootCause: t.rootCause || '',
                                  images: [],
                                });
                                setResolveModalOpen(true);
                              }}
                              className="px-2 py-1 text-[11px] font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-lg border border-purple-200 transition-colors"
                              title="Submit Site Resolution"
                            >
                              Resolve
                            </button>
                          )}

                          {/* Admin Review Action (Close / Reopen) */}
                          {isAdmin && (t.status || '').toUpperCase() === 'RESOLVED' && (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedTicket(t);
                                  setAdminFeedback('');
                                  setCloseModalOpen(true);
                                }}
                                className="px-2 py-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200 transition-colors"
                                title="Admin Close Ticket"
                              >
                                Close
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedTicket(t);
                                  setAdminFeedback('');
                                  setReopenModalOpen(true);
                                }}
                                className="px-2 py-1 text-[11px] font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg border border-rose-200 transition-colors"
                                title="Admin Reject & Reopen (Replay)"
                              >
                                Reopen
                              </button>
                            </div>
                          )}

                          {/* Delete (Admin only) */}
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => handleDeleteTicket(t.id || t.incidentCode)}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Delete Ticket"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Slide-Over / Full Drawer: Ticket Details & Audit Trail ───── */}
      {detailDrawerOpen && selectedTicket && (
        <div className="fixed inset-0 z-50 overflow-hidden flex justify-end animate-in fade-in duration-200">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-2xs transition-opacity"
            onClick={() => setDetailDrawerOpen(false)}
          />

          <div className="relative w-full max-w-2xl bg-white shadow-2xl h-full flex flex-col z-10 border-l border-slate-200 overflow-y-auto">
            {/* Drawer Header */}
            <div className="p-5 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between sticky top-0 z-10 backdrop-blur-xs">
              <div className="min-w-0 pr-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
                    {selectedTicket.incidentCode}
                  </span>
                  <StatusBadge status={selectedTicket.status} />
                  <PriorityBadge priority={selectedTicket.severity} />
                  <CategoryBadge category={selectedTicket.category} />
                </div>
                <h3 className="text-base font-bold text-slate-900 mt-2 truncate" title={selectedTicket.title}>
                  {selectedTicket.title}
                </h3>
              </div>

              <button
                type="button"
                onClick={() => setDetailDrawerOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200 transition-colors flex-shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="p-6 space-y-6 flex-1">
              {/* Geotechnical Asset Metadata Card */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 grid grid-cols-2 sm:grid-cols-3 gap-3.5 text-xs">
                <div>
                  <span className="text-[11px] font-semibold text-slate-500 uppercase block">Monitored Device</span>
                  <span className="font-mono font-bold text-blue-700 mt-0.5 block">
                    {selectedTicket.deviceId || 'No device attached'}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] font-semibold text-slate-500 uppercase block">Location Site</span>
                  <span className="font-semibold text-slate-800 mt-0.5 block truncate">
                    {sites.find(s => String(s.id) === String(selectedTicket.siteId))?.name || selectedTicket.siteId || '-'}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] font-semibold text-slate-500 uppercase block">Structural Asset</span>
                  <span className="font-semibold text-slate-800 mt-0.5 block truncate">
                    {structures.find(s => String(s.id) === String(selectedTicket.structureId))?.name || selectedTicket.structureId || '-'}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] font-semibold text-slate-500 uppercase block">Ticket Source</span>
                  <span className="font-medium text-slate-700 mt-0.5 block">
                    {selectedTicket.source === 'AUTO_ALERT' ? '🤖 Automated Critical Alert' : '👤 Manual Ticket'}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] font-semibold text-slate-500 uppercase block">Logged Timestamp</span>
                  <span className="text-slate-600 mt-0.5 block">{formatDateTime(selectedTicket.createdAt)}</span>
                </div>
                <div>
                  <span className="text-[11px] font-semibold text-slate-500 uppercase block">Created By</span>
                  <span className="text-slate-600 mt-0.5 block">{selectedTicket.createdByUserName || 'System'}</span>
                </div>
              </div>

              {/* Assignment Card */}
              <div className="p-4 rounded-xl border border-slate-200 bg-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-sm">
                    {selectedTicket.assignedUserName ? selectedTicket.assignedUserName.slice(0, 2).toUpperCase() : <User className="w-5 h-5 text-slate-400" />}
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Assigned Engineer / Technician</span>
                    <span className="font-bold text-slate-900 text-sm">
                      {selectedTicket.assignedUserName || 'Not assigned yet'}
                    </span>
                    {selectedTicket.assignedUserEmail && (
                      <span className="text-xs text-slate-500 block">{selectedTicket.assignedUserEmail}</span>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setAssignForm({
                      userId: selectedTicket.assignedUserId ? String(selectedTicket.assignedUserId) : '',
                      note: '',
                    });
                    setAssignModalOpen(true);
                  }}
                  className="px-3 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition-colors"
                >
                  {selectedTicket.assignedUserId ? 'Reassign' : 'Assign'}
                </button>
              </div>

              {/* Diagnostic Root Cause */}
              {selectedTicket.rootCause && (
                <div className="space-y-1.5">
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                    Problem Summary & Diagnostics
                  </h4>
                  <div className="p-3.5 rounded-xl bg-amber-50/50 border border-amber-200/80 text-xs text-amber-950 leading-relaxed">
                    {selectedTicket.rootCause}
                  </div>
                </div>
              )}

              {/* ── Field Resolution Section ──────────────────────── */}
              {(selectedTicket.siteRemarks || (selectedTicket.resolutionImages && selectedTicket.resolutionImages.length > 0)) && (
                <div className="p-4 rounded-xl border border-purple-200 bg-purple-50/40 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-purple-900 uppercase tracking-wider flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-purple-600" />
                      Field Site Resolution Report
                    </h4>
                    {selectedTicket.resolvedAt && (
                      <span className="text-[11px] text-purple-700 font-medium">
                        Resolved: {formatDateTime(selectedTicket.resolvedAt)}
                      </span>
                    )}
                  </div>

                  {selectedTicket.siteRemarks && (
                    <div className="text-xs text-purple-950 bg-white p-3 rounded-lg border border-purple-200 leading-relaxed">
                      <strong className="block text-[11px] text-purple-800 font-bold mb-1">Technician Remarks:</strong>
                      {selectedTicket.siteRemarks}
                    </div>
                  )}

                  {selectedTicket.correctiveAction && (
                    <div className="text-xs text-slate-700 bg-white p-2.5 rounded-lg border border-purple-100">
                      <strong className="text-slate-900">Corrective Action Taken: </strong>
                      {selectedTicket.correctiveAction}
                    </div>
                  )}

                  {/* Resolution Image Gallery */}
                  {selectedTicket.resolutionImages && selectedTicket.resolutionImages.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <span className="text-[11px] font-bold text-purple-900 block">
                        Site Evidence Photos ({selectedTicket.resolutionImages.length}):
                      </span>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {selectedTicket.resolutionImages.map((imgUrl, i) => (
                          <div
                            key={i}
                            onClick={() => setLightboxImage(formatAssetUrl(imgUrl))}
                            className="relative h-24 rounded-lg overflow-hidden border border-purple-200 bg-slate-100 group cursor-pointer shadow-2xs hover:shadow-md transition-all"
                          >
                            <img
                              src={formatAssetUrl(imgUrl)}
                              alt={`Resolution proof ${i + 1}`}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                            />
                            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white text-xs font-semibold">
                              <span>Click to Zoom</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Admin Feedback / Closing Notes ────────────────── */}
              {selectedTicket.adminRemarks && (
                <div className={`p-4 rounded-xl border space-y-1.5 ${
                  selectedTicket.status === 'REOPENED'
                    ? 'border-rose-200 bg-rose-50/50 text-rose-950'
                    : 'border-emerald-200 bg-emerald-50/50 text-emerald-950'
                }`}>
                  <h4 className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                    {selectedTicket.status === 'REOPENED' ? (
                      <>
                        <RotateCcw className="w-4 h-4 text-rose-600" />
                        Admin Rejection Feedback (Rework Required)
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4 text-emerald-600" />
                        Admin Closure Verification
                      </>
                    )}
                  </h4>
                  <p className="text-xs leading-relaxed bg-white/80 p-2.5 rounded-lg border border-slate-200/60">
                    {selectedTicket.adminRemarks}
                  </p>
                </div>
              )}

              {/* ── Activity Audit Trail & Timeline ───────────────── */}
              <div className="space-y-3 pt-2">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-blue-600" />
                  Audit Trail & Activity Log
                </h4>

                <div className="relative pl-6 space-y-4 before:content-[''] before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                  {(selectedTicket.notes || []).map((n, idx) => (
                    <div key={n.id || idx} className="relative">
                      {/* Timeline dot */}
                      <div className="absolute -left-6 top-1 w-3 h-3 rounded-full bg-white border-2 border-blue-600" />
                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs space-y-1">
                        <div className="flex items-center justify-between text-slate-500 text-[11px]">
                          <span className="font-bold text-slate-800">{n.author || 'User'}</span>
                          <span>{formatDateTime(n.timestamp)}</span>
                        </div>
                        <p className="text-slate-700 leading-relaxed">{n.text}</p>
                        {n.images && n.images.length > 0 && (
                          <div className="flex gap-2 pt-1.5">
                            {n.images.map((img, imIdx) => (
                              <img
                                key={imIdx}
                                src={formatAssetUrl(img)}
                                alt="Attachment"
                                onClick={() => setLightboxImage(formatAssetUrl(img))}
                                className="w-14 h-14 object-cover rounded-md border border-slate-300 cursor-pointer hover:opacity-90"
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add Comment input */}
                <form onSubmit={handleCommentSubmit} className="flex gap-2 pt-2">
                  <input
                    type="text"
                    value={commentText}
                    onChange={e => setCommentText(e.target.value)}
                    placeholder="Add an internal progress note or comment..."
                    className="flex-1 px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                  <button
                    type="submit"
                    disabled={!commentText.trim()}
                    className="px-4 py-2 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-900 rounded-xl disabled:opacity-50 transition-all cursor-pointer"
                  >
                    Post Note
                  </button>
                </form>
              </div>
            </div>

            {/* Drawer Sticky Footer Actions */}
            <div className="p-4 border-t border-slate-200 bg-white sticky bottom-0 z-10 flex items-center justify-between gap-3">
              <div>
                <span className="text-[11px] text-slate-400 block">Status Action:</span>
                <span className="text-xs font-bold text-slate-800">{selectedTicket.status}</span>
              </div>

              <div className="flex items-center gap-2">
                {/* Resolve Button */}
                {['OPEN', 'IN_PROGRESS', 'REOPENED', 'NEW'].includes((selectedTicket.status || '').toUpperCase()) && (
                  <button
                    type="button"
                    onClick={() => {
                      setResolveForm({
                        siteRemarks: selectedTicket.siteRemarks || '',
                        correctiveAction: selectedTicket.correctiveAction || '',
                        rootCause: selectedTicket.rootCause || '',
                        images: [],
                      });
                      setResolveModalOpen(true);
                    }}
                    className="px-4 py-2 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-xl shadow-md shadow-purple-600/20 transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Submit Site Resolution</span>
                  </button>
                )}

                {/* Admin Verification Actions: Close or Reopen */}
                {isAdmin && (selectedTicket.status || '').toUpperCase() === 'RESOLVED' && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setAdminFeedback('');
                        setReopenModalOpen(true);
                      }}
                      className="px-3.5 py-2 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Request Rework (Reopen)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setAdminFeedback('');
                        setCloseModalOpen(true);
                      }}
                      className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-md shadow-emerald-600/20 transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      <span>Approve & Close Ticket</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal 1: Create New Ticket ──────────────────────────────── */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
                  <Plus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Create New Incident Ticket</h3>
                  <p className="text-xs text-slate-500">Log a manual inspection, defect, or maintenance task.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-6 space-y-4">
              {/* Title */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Ticket Subject / Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={createForm.title}
                  onChange={e => setCreateForm({ ...createForm, title: e.target.value })}
                  placeholder="e.g. Loose bracket on Hill Slope Section B"
                  className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              {/* Category & Priority */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Category</label>
                  <select
                    value={createForm.category}
                    onChange={e => setCreateForm({ ...createForm, category: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
                  >
                    <option value="STRUCTURAL_ANOMALY">Structural Anomaly</option>
                    <option value="SENSOR_FAULT">Sensor Fault</option>
                    <option value="MAINTENANCE">Maintenance</option>
                    <option value="SITE_INSPECTION">Site Inspection</option>
                    <option value="BATTERY_POWER">Battery / Power</option>
                    <option value="MANUAL">General Issue</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Priority</label>
                  <select
                    value={createForm.severity}
                    onChange={e => setCreateForm({ ...createForm, severity: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
                  >
                    <option value="CRITICAL">Critical</option>
                    <option value="HIGH">High</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="LOW">Low</option>
                  </select>
                </div>
              </div>

              {/* Site Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Location Site</label>
                <select
                  value={createForm.siteId}
                  onChange={e => setCreateForm({ ...createForm, siteId: e.target.value, structureId: '', deviceId: '' })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
                >
                  <option value="">-- Select Location Site --</option>
                  {sites.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name || s.id}
                    </option>
                  ))}
                </select>
              </div>

              {/* Structural Asset (Cascading) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Attach to Structural Asset</label>
                <select
                  value={createForm.structureId}
                  onChange={e => setCreateForm({ ...createForm, structureId: e.target.value, deviceId: '' })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
                >
                  <option value="">-- Select Structural Asset (Optional) --</option>
                  {filteredStructuresForCreate.map(st => (
                    <option key={st.id} value={st.id}>
                      {st.name || st.id} ({st.type || 'Asset'})
                    </option>
                  ))}
                </select>
              </div>

              {/* Device Selector (Cascading) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Monitored Device Node</label>
                <select
                  value={createForm.deviceId}
                  onChange={e => setCreateForm({ ...createForm, deviceId: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
                >
                  <option value="">-- Select Monitored Device (Optional) --</option>
                  {filteredDevicesForCreate.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.name || d.id} (ID: {d.id})
                    </option>
                  ))}
                </select>
              </div>

              {/* Assigned User */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Assign To (Technician / Engineer)</label>
                <select
                  value={createForm.assignedUserId}
                  onChange={e => setCreateForm({ ...createForm, assignedUserId: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
                >
                  <option value="">-- Leave Unassigned --</option>
                  {usersList.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.fullName || u.username} ({u.role})
                    </option>
                  ))}
                </select>
              </div>

              {/* Description / Remarks */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Detailed Remarks / Observations</label>
                <textarea
                  rows={3}
                  value={createForm.remarks}
                  onChange={e => setCreateForm({ ...createForm, remarks: e.target.value })}
                  placeholder="Describe observed physical anomalies, bolt torque, weather factors, etc..."
                  className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md shadow-blue-600/20 transition-all cursor-pointer disabled:opacity-50"
                >
                  {actionLoading ? 'Creating Ticket...' : 'Generate Ticket'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal 2: User Site Resolution Report ─────────────────────── */}
      {resolveModalOpen && selectedTicket && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-purple-100 flex items-center justify-between bg-purple-50/70">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-purple-950">Submit Site Resolution</h3>
                  <p className="text-xs text-purple-700 font-mono">{selectedTicket.incidentCode}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setResolveModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleResolveSubmit} className="p-6 space-y-4">
              {/* Site Remarks */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Site Resolution Remarks <span className="text-red-500">*</span>
                </label>
                <textarea
                  required
                  rows={4}
                  value={resolveForm.siteRemarks}
                  onChange={e => setResolveForm({ ...resolveForm, siteRemarks: e.target.value })}
                  placeholder="Detail the work carried out on site (e.g. tightened M16 bolts to 120 Nm, replaced gasket, re-calibrated zero reference at 0.005°)..."
                  className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                />
              </div>

              {/* Corrective Action */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">Corrective Action Taken</label>
                <input
                  type="text"
                  value={resolveForm.correctiveAction}
                  onChange={e => setResolveForm({ ...resolveForm, correctiveAction: e.target.value })}
                  placeholder="e.g. Replaced mounting plate and re-torqued anchor fasteners"
                  className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
                />
              </div>

              {/* Upload Site Photos */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Upload Site Photos & Evidence Proof
                </label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-purple-200 hover:border-purple-400 bg-purple-50/30 rounded-xl p-4 text-center cursor-pointer transition-colors group"
                >
                  <Camera className="w-6 h-6 text-purple-600 mx-auto mb-1 group-hover:scale-110 transition-transform" />
                  <span className="text-xs font-semibold text-purple-900 block">Click to upload photos</span>
                  <span className="text-[11px] text-purple-600 block mt-0.5">JPG, PNG, or mobile camera capture</span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handleImageFileChange}
                    className="hidden"
                  />
                </div>

                {/* Thumbnail Previews */}
                {resolveForm.images.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 mt-2.5">
                    {resolveForm.images.map((img, idx) => (
                      <div key={idx} className="relative h-20 rounded-lg overflow-hidden border border-slate-200 group">
                        <img src={img} alt="preview" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => removeResolutionImage(idx)}
                          className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 hover:bg-red-600 transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setResolveModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-xl shadow-md shadow-purple-600/20 transition-all cursor-pointer disabled:opacity-50"
                >
                  {actionLoading ? 'Submitting...' : 'Submit Resolution'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal 3: Admin Close Ticket ─────────────────────────────── */}
      {closeModalOpen && selectedTicket && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-emerald-100 flex items-center justify-between bg-emerald-50/70">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-emerald-950">Admin Verification & Closure</h3>
                  <p className="text-xs text-emerald-700 font-mono">{selectedTicket.incidentCode}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCloseModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCloseSubmit} className="p-6 space-y-4">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700">
                <strong className="block text-slate-900 font-bold mb-1">Technician Resolution:</strong>
                <p className="italic">{selectedTicket.siteRemarks || 'Site inspection completed.'}</p>
                {selectedTicket.resolutionImages && selectedTicket.resolutionImages.length > 0 && (
                  <span className="text-[11px] text-purple-700 font-semibold block mt-1">
                    ✓ {selectedTicket.resolutionImages.length} site evidence photo(s) submitted
                  </span>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Admin Verification Remarks (Optional)
                </label>
                <textarea
                  rows={3}
                  value={adminFeedback}
                  onChange={e => setAdminFeedback(e.target.value)}
                  placeholder="e.g. Geotechnical telemetry verified stable. Resolution approved for formal closure."
                  className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setCloseModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-md shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-50"
                >
                  {actionLoading ? 'Closing...' : 'Confirm & Close Ticket'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal 4: Admin Reject & Reopen (Replay) ─────────────────── */}
      {reopenModalOpen && selectedTicket && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-rose-100 flex items-center justify-between bg-rose-50/70">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center">
                  <RotateCcw className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-rose-950">Reject Resolution & Request Rework</h3>
                  <p className="text-xs text-rose-700 font-mono">{selectedTicket.incidentCode}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReopenModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleReopenSubmit} className="p-6 space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                If the field work is incomplete, photos are inadequate, or telemetry remains unstable, return this ticket with feedback. The assigned technician will be notified to re-inspect.
              </p>

              <div>
                <label className="block text-xs font-bold text-rose-900 mb-1">
                  Replay Feedback / Rework Instructions <span className="text-red-500">*</span>
                </label>
                <textarea
                  required
                  rows={4}
                  value={adminFeedback}
                  onChange={e => setAdminFeedback(e.target.value)}
                  placeholder="Explain what is missing or unsatisfactory (e.g. Safety wire not installed, mounting angle still shows 1.8° tilt, please re-visit site and re-tighten)..."
                  className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setReopenModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-md shadow-rose-600/20 transition-all cursor-pointer disabled:opacity-50"
                >
                  {actionLoading ? 'Reopening...' : 'Return for Rework'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal 5: Assign Ticket ──────────────────────────────────── */}
      {assignModalOpen && selectedTicket && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-blue-100 flex items-center justify-between bg-blue-50/70">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
                  <UserPlus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-blue-950">Assign Ticket</h3>
                  <p className="text-xs text-blue-700 font-mono">{selectedTicket.incidentCode}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAssignModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAssignSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Select Technician / Engineer <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={assignForm.userId}
                  onChange={e => setAssignForm({ ...assignForm, userId: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
                >
                  <option value="">-- Select Technician --</option>
                  {usersList.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.fullName || u.username} ({u.role})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">Assignment Directive / Note</label>
                <textarea
                  rows={3}
                  value={assignForm.note}
                  onChange={e => setAssignForm({ ...assignForm, note: e.target.value })}
                  placeholder="e.g. Urgent site inspection needed before monsoon rains. Please bring M16 bolt set."
                  className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setAssignModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md shadow-blue-600/20 transition-all cursor-pointer disabled:opacity-50"
                >
                  {actionLoading ? 'Assigning...' : 'Confirm Assignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Image Lightbox Modal ────────────────────────────────────── */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setLightboxImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] flex flex-col items-center">
            <button
              type="button"
              onClick={() => setLightboxImage(null)}
              className="absolute -top-12 right-0 text-white/80 hover:text-white p-2 rounded-full"
            >
              <X className="w-6 h-6" />
            </button>
            <img
              src={lightboxImage}
              alt="Full view"
              className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl border border-white/10"
              onClick={e => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  );
}

