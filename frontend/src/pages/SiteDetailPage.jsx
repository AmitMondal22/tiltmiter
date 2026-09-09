import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, MapPin, Cpu, Shield, Layers, Box, Map as MapIcon,
  Activity, AlertTriangle, CheckCircle2, Battery, Signal, Zap,
  ExternalLink, TrendingUp, Navigation, RefreshCw, Radio, ShieldCheck
} from 'lucide-react';
import { getSites, getDevices, getStructures, getProjects, getOrganizations } from '../api/apiClient';
import LocationMapView from '../components/LocationMapView';
import Landslide3DMapView from '../components/Landslide3DMapView';

export default function SiteDetailPage() {
  const { siteId } = useParams();
  const navigate = useNavigate();

  const [site, setSite] = useState(null);
  const [siteDevices, setSiteDevices] = useState([]);
  const [siteStructures, setSiteStructures] = useState([]);
  const [project, setProject] = useState(null);
  const [org, setOrg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [viewType, setViewType] = useState('satellite'); // 'satellite', 'street', or '3d'
  const [selectedDevice, setSelectedDevice] = useState(null);

  const cardCls = 'rounded-2xl border border-slate-200 bg-white p-5 text-black shadow-xs';

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

      const foundSite = (sitesRes?.sites || []).find(
        s => s.id === siteId || s.siteId === siteId || String(s.id) === String(siteId)
      ) || {
        id: siteId,
        siteId: siteId,
        name: `Location ${siteId}`,
        latitude: '26.7271',
        longitude: '88.4315',
        description: 'Monitored Geotechnical Site',
        status: 'ACTIVE'
      };

      setSite(foundSite);

      // Filter devices under this site
      const devs = (devRes?.devices || []).filter(
        d => d.siteId === foundSite.id || d.siteId === foundSite.siteId || d.siteId === siteId
      );
      setSiteDevices(devs);

      // Filter structures under this site
      const structs = (structRes?.structures || []).filter(
        st => st.siteId === foundSite.id || st.siteId === foundSite.siteId || st.siteId === siteId
      );
      setSiteStructures(structs);

      const proj = (projRes?.projects || []).find(p => p.id === foundSite.projectId);
      setProject(proj);

      const organization = (orgRes?.organizations || []).find(
        o => o.id === foundSite.organizationId || o.id === proj?.organizationId
      );
      setOrg(organization);

      if (devs.length > 0) {
        setSelectedDevice(devs[0]);
      }
    } catch (e) {
      console.error('Error loading site details', e);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [siteId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px] text-slate-500 font-semibold text-xs gap-2">
        <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
        <span>Loading location data & sensors...</span>
      </div>
    );
  }

  // Analytics Computations
  const onlineDevCount = siteDevices.filter(d => (d.status || 'ONLINE') === 'ONLINE').length;
  const offlineDevCount = siteDevices.length - onlineDevCount;

  const displacements = siteDevices.map(d => Number(d.totalDisplacement || d.displacement?.totalDisplacement_mm || 0.18));
  const maxDisplacement = displacements.length > 0 ? Math.max(...displacements) : 0;
  const avgDisplacement = displacements.length > 0 ? (displacements.reduce((a, b) => a + b, 0) / displacements.length) : 0;

  const tilts = siteDevices.map(d => Number(d.resultantTilt || d.tilt?.tilt || 0.22));
  const avgTilt = tilts.length > 0 ? (tilts.reduce((a, b) => a + b, 0) / tilts.length) : 0;

  // Landslide Risk Assessment
  let stabilityStatus = 'STABLE';
  let statusBadgeColor = 'bg-emerald-100 text-emerald-950 border-emerald-300';
  if (maxDisplacement >= 15 || avgTilt >= 3.0) {
    stabilityStatus = 'CRITICAL LANDSLIDE RISK';
    statusBadgeColor = 'bg-rose-100 text-rose-950 border-rose-300';
  } else if (maxDisplacement >= 5.0 || avgTilt >= 1.5) {
    stabilityStatus = 'ACTIVE CREEP / WARNING';
    statusBadgeColor = 'bg-amber-100 text-amber-950 border-amber-300';
  }

  return (
    <div className="space-y-4 font-sans text-black animate-fadeIn">
      {/* Top Breadcrumb & Actions Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/sites')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 font-bold text-xs text-black shadow-2xs transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 text-black" />
            <span>Back to All Locations</span>
          </button>

          <div>
            <div className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-blue-600" />
              <h1 className="text-xl font-black text-black">
                {site?.name || `Location ${siteId}`}
              </h1>
              <span className="px-2.5 py-0.5 rounded-full bg-slate-100 border border-slate-300 text-[10px] font-mono font-bold text-slate-800">
                {site?.siteId || site?.id}
              </span>
            </div>
            <p className="text-xs text-slate-700 font-medium mt-0.5">
              {project?.name ? `${project.name} &bull; ` : ''}{org?.name ? `${org.name} &bull; ` : ''}
              GPS: {Number(site?.latitude || 26.7271).toFixed(4)}°N, {Number(site?.longitude || 88.4315).toFixed(4)}°E
            </p>
          </div>
        </div>

        {/* View Switcher: Satellite vs Street vs 3D Landslide */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-100 border border-slate-200 rounded-xl p-0.5 shadow-2xs">
            <button
              onClick={() => setViewType('satellite')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-bold text-xs transition-all cursor-pointer ${
                viewType === 'satellite'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Satellite Map</span>
            </button>
            <button
              onClick={() => setViewType('street')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-bold text-xs transition-all cursor-pointer ${
                viewType === 'street'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <MapIcon className="w-3.5 h-3.5" />
              <span>Street Map</span>
            </button>
            <button
              onClick={() => setViewType('3d')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-bold text-xs transition-all cursor-pointer ${
                viewType === '3d'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Box className="w-3.5 h-3.5" />
              <span>3D Landslide Slope Model</span>
            </button>
          </div>

          <button
            onClick={loadData}
            className="p-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-black shadow-2xs transition-colors cursor-pointer"
            title="Refresh location telemetry"
          >
            <RefreshCw className="w-4 h-4 text-black" />
          </button>
        </div>
      </div>

      {/* Location Top Analytics Summary Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-black shadow-2xs flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Location Stability</div>
            <div className="text-sm font-black text-black mt-1">
              <span className={`px-2.5 py-1 rounded-full border text-[11px] font-extrabold ${statusBadgeColor}`}>
                {stabilityStatus}
              </span>
            </div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <ShieldCheck className="w-5 h-5" />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-black shadow-2xs flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Active Devices</div>
            <div className="text-lg font-black font-mono text-black mt-0.5">
              {onlineDevCount} <span className="text-xs text-slate-700 font-sans font-medium">/ {siteDevices.length} Online</span>
            </div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
            <Cpu className="w-5 h-5" />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-black shadow-2xs flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Max Displacement Δ</div>
            <div className="text-lg font-black font-mono text-black mt-0.5">
              {maxDisplacement.toFixed(2)} <span className="text-xs text-slate-700 font-sans font-medium">mm</span>
            </div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-black shadow-2xs flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Avg Vector Tilt θ</div>
            <div className="text-lg font-black font-mono text-black mt-0.5">
              {avgTilt.toFixed(2)} <span className="text-xs text-slate-700 font-sans font-medium">degrees</span>
            </div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center font-bold">
            <Activity className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Main Map Viewport & Devices List */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Left 3 Cols: Map (Satellite/Street) OR 3D Landslide Model */}
        <div className="lg:col-span-3">
          {viewType === '3d' ? (
            <Landslide3DMapView
              structures={siteStructures}
              devices={siteDevices}
              sites={[site]}
              onSelectStructure={() => {}}
              onSelectDevice={(d) => setSelectedDevice(d)}
            />
          ) : (
            <LocationMapView
              sites={[site]}
              devices={siteDevices}
              projects={project ? [project] : []}
              organizations={org ? [org] : []}
              initialSelectedSiteId={site?.siteId || site?.id}
              onSelectSite={() => {}}
            />
          )}
        </div>

        {/* Right 1 Col: Deployed Hardware Inclinometers & Telemetry List */}
        <div className="space-y-3">
          <div className={cardCls}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-3">
              <div>
                <h3 className="text-sm font-black text-black flex items-center gap-1.5">
                  <Cpu className="w-4 h-4 text-blue-600" />
                  <span>Devices Under Location</span>
                </h3>
                <p className="text-[11px] text-slate-700 font-medium">{siteDevices.length} Hardware Inclinometers</p>
              </div>
            </div>

            <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
              {siteDevices.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-xs">
                  No devices deployed under this location yet.
                </div>
              ) : (
                siteDevices.map(d => {
                  const isOnline = (d.status || 'ONLINE') === 'ONLINE';
                  const disp = Number(d.totalDisplacement || d.displacement?.totalDisplacement_mm || 0.18);
                  const tiltVal = Number(d.resultantTilt || d.tilt?.tilt || 0.22);
                  const isSelected = selectedDevice?.id === d.id;

                  return (
                    <div
                      key={d.id}
                      onClick={() => setSelectedDevice(d)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer space-y-2 ${
                        isSelected
                          ? 'border-blue-600 bg-blue-50/50 shadow-xs'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-bold text-black text-xs truncate max-w-[170px]">
                          {d.name || d.id}
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          isOnline ? 'bg-emerald-100 text-emerald-950 border border-emerald-300' : 'bg-amber-100 text-amber-950 border border-amber-300'
                        }`}>
                          {d.status || 'ONLINE'}
                        </span>
                      </div>

                      <div className="font-mono text-[11px] text-slate-700 flex justify-between">
                        <span>Node: {d.id}</span>
                        <span className="font-bold text-black">Δ {disp.toFixed(2)}mm</span>
                      </div>

                      <div className="flex items-center justify-between text-[11px] font-mono text-slate-700 pt-1 border-t border-slate-100">
                        <span className="text-purple-700 font-bold">θ {tiltVal.toFixed(2)}°</span>
                        <div className="flex items-center gap-2">
                          <span className="flex items-center gap-0.5 text-emerald-700 font-bold">
                            <Zap className="w-3 h-3" /> {d.battery || '95%'}
                          </span>
                          <span className="flex items-center gap-0.5 text-blue-700 font-bold">
                            <Radio className="w-3 h-3" /> {d.signal || '88%'}
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/devices/${d.id}`);
                        }}
                        className="w-full flex items-center justify-center gap-1 py-1.5 rounded-lg bg-black hover:bg-neutral-800 text-white font-bold text-[10px] shadow-2xs transition-colors cursor-pointer mt-1"
                      >
                        <span>Open Telemetry Console</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
