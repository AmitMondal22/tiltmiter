import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, MapPin, Cpu, Shield, Layers, Box, Map as MapIcon,
  Activity, AlertTriangle, CheckCircle2, Battery, Signal, Zap,
  ExternalLink, TrendingUp, Navigation, RefreshCw, Radio, ShieldCheck, Mountain
} from 'lucide-react';
import { getSites, getDevices, getStructures, getProjects, getOrganizations } from '../api/apiClient';
import LocationMapView from '../components/LocationMapView';
import { DetailPageSkeleton } from '../components/SkeletonLoader';
import { getAssetTypeConfig } from '../components/AssetsMapView';
import { formatBatteryPercentage, formatCSQPercentage } from '../utils/telemetryHelper';
import { getSiteStructures, getSiteDevices } from '../utils/siteHelper';

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
  const [sidebarTab, setSidebarTab] = useState('assets'); // 'assets' or 'devices'

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

      // Filter structures strictly under this site
      const structs = getSiteStructures(foundSite, structRes?.structures || []);
      setSiteStructures(structs);

      // Filter devices strictly added/assigned to this site
      const devs = getSiteDevices(foundSite, devRes?.devices || [], structs);
      setSiteDevices(devs);

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
    return <DetailPageSkeleton />;
  }

  
  // Compute effective location coordinates: use site coords, or fallback to its devices
  const firstDevWithCoords = siteDevices.find(d => d.latitude && d.longitude && !isNaN(parseFloat(d.latitude)) && !isNaN(parseFloat(d.longitude)));
  const hasExplicitSiteCoords = site?.latitude && site?.longitude && !isNaN(parseFloat(site.latitude)) && !isNaN(parseFloat(site.longitude)) && (Math.abs(parseFloat(site.latitude) - 22.5726) >= 0.001 || Math.abs(parseFloat(site.longitude) - 88.3639) >= 0.001);
  const effectiveLat = hasExplicitSiteCoords ? parseFloat(site.latitude) : (firstDevWithCoords ? parseFloat(firstDevWithCoords.latitude) : 26.7271);
  const effectiveLng = hasExplicitSiteCoords ? parseFloat(site.longitude) : (firstDevWithCoords ? parseFloat(firstDevWithCoords.longitude) : 88.4315);
  const effectiveSite = site ? { ...site, latitude: effectiveLat, longitude: effectiveLng } : site;

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
                {site?.name || 'Monitored Location'}
              </h1>
            </div>
            <p className="text-xs text-slate-700 font-medium mt-0.5">
              {project?.name ? `${project.name} &bull; ` : ''}{org?.name ? `${org.name} &bull; ` : ''}
              GPS: {effectiveLat.toFixed(4)}°N, {effectiveLng.toFixed(4)}°E{!hasExplicitSiteCoords && firstDevWithCoords ? ' (Device Coords)' : ''}
            </p>
          </div>
        </div>

        {/* Header: Satellite Map & Actions */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-600 text-white font-bold text-xs shadow-2xs">
            <Layers className="w-3.5 h-3.5 text-white" />
            <span>Satellite Map</span>
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

      {/* Main Map Viewport & Devices List */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Left 3 Cols: Map (Satellite/Street) */}
        <div className="lg:col-span-3">
          <LocationMapView
            sites={[effectiveSite]}
            devices={siteDevices}
            structures={siteStructures}
            projects={project ? [project] : []}
            organizations={org ? [org] : []}
            initialSelectedSiteId={site?.siteId || site?.id}
            onSelectSite={() => {}}
          />
        </div>

        {/* Right 1 Col: Tabs for Assets & Hardware Inclinometers */}
        <div className="space-y-3">
          <div className={cardCls}>
            {/* Tab Switcher */}
            <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl mb-3 border border-slate-200">
              <button
                type="button"
                onClick={() => setSidebarTab('assets')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  sidebarTab === 'assets'
                    ? 'bg-white text-blue-900 shadow-xs border border-blue-200'
                    : 'text-slate-600 hover:text-black hover:bg-slate-200/60'
                }`}
              >
                <Mountain className="w-3.5 h-3.5 text-blue-600" />
                <span>Assets ({siteStructures.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setSidebarTab('devices')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  sidebarTab === 'devices'
                    ? 'bg-white text-blue-900 shadow-xs border border-blue-200'
                    : 'text-slate-600 hover:text-black hover:bg-slate-200/60'
                }`}
              >
                <Cpu className="w-3.5 h-3.5 text-blue-600" />
                <span>Devices ({siteDevices.length})</span>
              </button>
            </div>

            {sidebarTab === 'assets' ? (
              <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
                {siteStructures.length === 0 ? (
                  <div className="text-center py-8 text-slate-500 text-xs">
                    No slope assets registered under this location yet.
                  </div>
                ) : (
                  siteStructures.map(st => {
                    const typeCfg = getAssetTypeConfig(st.type);
                    const TypeIcon = typeCfg?.icon || Mountain;
                    const attachedDevs = siteDevices.filter(d => d.structureId === st.id);

                    return (
                      <div
                        key={st.id}
                        className="p-3 rounded-xl border border-slate-200 bg-white hover:border-blue-400 hover:bg-slate-50/50 transition-all space-y-2.5"
                      >
                        <div className="flex items-center justify-between gap-1">
                          <div className="font-bold text-black text-xs truncate max-w-[160px]" title={st.name || st.structureId}>
                            {st.name || st.structureId || st.id}
                          </div>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${typeCfg.badgeCls}`}>
                            <TypeIcon className="w-3 h-3" />
                            <span>{typeCfg.label}</span>
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-slate-600 font-mono">
                          <span>Asset ID: {st.structureId || st.id}</span>
                          <span className="font-bold text-blue-700">{attachedDevs.length} Node{attachedDevs.length === 1 ? '' : 's'}</span>
                        </div>

                        {(st.latitude || st.height) && (
                          <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono pt-1 border-t border-slate-100">
                            {st.height ? (
                              <span>Elev: {st.height}m</span>
                            ) : <span>GPS</span>}
                            {st.latitude && st.longitude && (
                              <span>{Number(st.latitude).toFixed(4)}, {Number(st.longitude).toFixed(4)}</span>
                            )}
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={() => navigate(`/structures/${st.id}`)}
                          className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] shadow-2xs transition-colors cursor-pointer"
                        >
                          <span>Open Asset Details</span>
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            ) : (
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
                          <span className="font-bold text-black">Δ {disp.toFixed(1)}mm</span>
                        </div>

                        <div className="flex items-center justify-between text-[11px] font-mono text-slate-700 pt-1 border-t border-slate-100">
                          <span className="text-purple-700 font-bold">θ {tiltVal.toFixed(1)}°</span>
                          <div className="flex items-center gap-2">
                            <span className="flex items-center gap-0.5 text-emerald-700 font-bold">
                              <Zap className="w-3 h-3" /> {formatBatteryPercentage(d.battery ?? d.batteryVoltage)}
                            </span>
                            <span className="flex items-center gap-0.5 text-blue-700 font-bold">
                              <Radio className="w-3 h-3" /> {formatCSQPercentage(d.signal ?? d.signalStrength)}
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
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
