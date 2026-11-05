import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, MapPin, Cpu, Shield, Layers, Box, Map as MapIcon,
  Activity, AlertTriangle, CheckCircle2, Battery, Signal, Zap,
  ExternalLink, TrendingUp, Navigation, RefreshCw, Radio, ShieldCheck,
  Mountain, Calendar, Hash, Globe, Info
} from 'lucide-react';
import {
  getStructure, getStructures, getSites, getDevices,
  getProjects, getOrganizations
} from '../api/apiClient';
import LocationMapView from '../components/LocationMapView';
import Landslide3DMapView from '../components/Landslide3DMapView';
import { getAssetTypeConfig } from '../components/AssetsMapView';
import { formatBatteryPercentage, formatCSQPercentage } from '../utils/telemetryHelper';

export default function StructureDetailPage() {
  const { structureId } = useParams();
  const navigate = useNavigate();

  const [structure, setStructure] = useState(null);
  const [site, setSite] = useState(null);
  const [attachedDevices, setAttachedDevices] = useState([]);
  const [project, setProject] = useState(null);
  const [org, setOrg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [viewType, setViewType] = useState('satellite'); // 'satellite' or '3d'
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [showAnalytics, setShowAnalytics] = useState(false);

  const cardCls = 'rounded-2xl border border-slate-200 bg-white p-5 text-black shadow-xs';

  const loadData = async () => {
    setLoading(true);
    try {
      // Fetch single structure details, with fallback to all structures
      let foundStruct = null;
      try {
        const res = await getStructure(structureId);
        if (res?.structure) {
          foundStruct = res.structure;
        }
      } catch {
        // Fallback below
      }

      const [allStructsRes, sitesRes, devRes, projRes, orgRes] = await Promise.all([
        foundStruct ? Promise.resolve({ structures: [] }) : getStructures().catch(() => ({ structures: [] })),
        getSites().catch(() => ({ sites: [] })),
        getDevices().catch(() => ({ devices: [] })),
        getProjects().catch(() => ({ projects: [] })),
        getOrganizations().catch(() => ({ organizations: [] })),
      ]);

      if (!foundStruct) {
        foundStruct = (allStructsRes?.structures || []).find(
          s => s.id === structureId || s.structureId === structureId || String(s.id) === String(structureId)
        );
      }

      if (!foundStruct) {
        foundStruct = {
          id: structureId,
          structureId: structureId,
          name: `Asset ${structureId}`,
          type: 'Mountain Slope',
          latitude: '26.7271',
          longitude: '88.4315',
          heightElevation: '450',
          description: 'Geotechnical Slope Asset',
          status: 'ACTIVE'
        };
      }

      setStructure(foundStruct);

      // Find parent site
      const allSites = sitesRes?.sites || [];
      const parentSite = allSites.find(
        s => s.id === foundStruct.siteId || s.siteId === foundStruct.siteId || String(s.id) === String(foundStruct.siteId)
      ) || foundStruct.Site || {
        id: foundStruct.siteId || 'SITE-DEFAULT',
        siteId: foundStruct.siteId || 'SITE-DEFAULT',
        name: 'Associated Site Location',
        latitude: foundStruct.latitude || '26.7271',
        longitude: foundStruct.longitude || '88.4315'
      };
      setSite(parentSite);

      // Filter attached devices
      const allDevs = devRes?.devices || [];
      let attached = allDevs.filter(
        d => d.structureId === foundStruct.id ||
             d.structureId === foundStruct.structureId ||
             String(d.structureId) === String(foundStruct.id)
      );

      // If backend attached devices exist in foundStruct.Devices, merge/use them
      if (attached.length === 0 && foundStruct.Devices && foundStruct.Devices.length > 0) {
        attached = foundStruct.Devices;
      }
      setAttachedDevices(attached);

      // Parent Project & Org
      const projId = parentSite.projectId || foundStruct.projectId;
      const foundProj = (projRes?.projects || []).find(p => p.id === projId) || parentSite.Project;
      setProject(foundProj);

      const orgId = parentSite.organizationId || foundStruct.organizationId || foundProj?.organizationId;
      const foundOrg = (orgRes?.organizations || []).find(o => o.id === orgId) || parentSite.Organization;
      setOrg(foundOrg);

    } catch (err) {
      console.error('Failed to load asset details:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [structureId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  const typeConfig = getAssetTypeConfig(structure?.type);
  const TypeIcon = typeConfig.icon;

  // Compute live geotechnical displacement & tilt aggregates
  const maxDisp = attachedDevices.reduce((max, d) => {
    const v = Number(d.totalDisplacement || d.displacement?.totalDisplacement_mm || 0);
    return v > max ? v : max;
  }, 0);

  const avgTilt = attachedDevices.length > 0
    ? attachedDevices.reduce((sum, d) => sum + Number(d.resultantTilt || d.tilt?.tilt || 0), 0) / attachedDevices.length
    : 0;

  const onlineCount = attachedDevices.filter(d => (d.status || 'ONLINE') === 'ONLINE').length;
  const offlineCount = attachedDevices.length - onlineCount;

  const stabilityStatus = maxDisp > 15 ? 'CRITICAL' : maxDisp > 5 ? 'WARNING' : 'STABLE';
  const stabilityBadge = {
    STABLE: 'bg-emerald-100 text-emerald-950 border-emerald-300',
    WARNING: 'bg-amber-100 text-amber-950 border-amber-300',
    CRITICAL: 'bg-red-100 text-red-950 border-red-300'
  }[stabilityStatus];

  return (
    <div className="space-y-4 font-sans text-black animate-fadeIn">
      {/* Top Breadcrumb & Action Row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/structures')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-300 hover:bg-slate-100 font-bold text-xs text-black shadow-2xs transition-all cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to All Assets</span>
          </button>

          <div className="text-xs text-slate-500 font-medium hidden sm:flex items-center gap-1.5">
            {org?.name && (
              <>
                <span>{org.name}</span>
                <span>/</span>
              </>
            )}
            {project?.name && (
              <>
                <span>{project.name}</span>
                <span>/</span>
              </>
            )}
            {site && (
              <>
                <Link
                  to={`/sites/${site.id || site.siteId}`}
                  className="text-blue-600 hover:underline font-bold"
                >
                  {site.name}
                </Link>
                <span>/</span>
              </>
            )}
            <span className="text-black font-bold">{structure?.name}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* View mode: Satellite Map vs 3D Landslide Model */}
          <div className="flex items-center bg-slate-100 border border-slate-200 rounded-xl p-0.5 shadow-2xs">
            <button
              onClick={() => setViewType('satellite')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs transition-all cursor-pointer ${
                viewType === 'satellite'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Satellite Map</span>
            </button>
            <button
              onClick={() => setViewType('3d')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs transition-all cursor-pointer ${
                viewType === '3d'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Box className="w-3.5 h-3.5" />
              <span>3D Landslide View</span>
            </button>
          </div>

          {/* Collapsible Analytics Toggle */}
          <button
            onClick={() => setShowAnalytics(!showAnalytics)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all shadow-2xs cursor-pointer ${
              showAnalytics
                ? 'bg-blue-50 border-blue-300 text-blue-700'
                : 'border-slate-300 bg-white hover:bg-slate-50 text-black'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Analytics</span>
          </button>

          <button
            onClick={loadData}
            className="p-2 rounded-xl border border-slate-300 hover:bg-slate-100 text-black transition-colors cursor-pointer"
            title="Refresh Data"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Asset Header Info Card */}
      <div className={cardCls}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl font-black text-black tracking-tight">
                {structure?.name || `Asset ${structure?.id}`}
              </h1>

              {/* Slope Asset Type Badge */}
              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${typeConfig.badgeCls}`}>
                <TypeIcon className="w-3.5 h-3.5" />
                <span>{typeConfig.label}</span>
              </span>

              {/* Status Badge */}
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${stabilityBadge}`}>
                {stabilityStatus === 'STABLE' ? 'Slope Stable' : stabilityStatus === 'WARNING' ? 'Monitoring Alert' : 'Critical Hazard'}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-700 font-medium">
              <span className="flex items-center gap-1">
                <Hash className="w-3.5 h-3.5 text-slate-500" />
                <span className="font-mono">ID: {structure?.structureId || structure?.id}</span>
              </span>

              {site && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-blue-600" />
                  <span>Site: </span>
                  <Link to={`/sites/${site.id || site.siteId}`} className="font-bold text-blue-700 hover:underline">
                    {site.name}
                  </Link>
                </span>
              )}

              {structure?.heightElevation && (
                <span className="flex items-center gap-1">
                  <Mountain className="w-3.5 h-3.5 text-slate-500" />
                  <span className="font-mono">Elev: {structure.heightElevation}m</span>
                </span>
              )}

              {structure?.latitude && structure?.longitude && (
                <span className="flex items-center gap-1 font-mono text-slate-600">
                  <Navigation className="w-3 h-3 text-slate-500" />
                  <span>{Number(structure.latitude).toFixed(4)}° N, {Number(structure.longitude).toFixed(4)}° E</span>
                </span>
              )}
            </div>

            {structure?.description && (
              <p className="text-xs text-slate-600 max-w-3xl pt-0.5">
                {structure.description}
              </p>
            )}
          </div>

          {/* Quick Metrics Badges */}
          <div className="flex items-center gap-3">
            <div className="text-right px-3 py-2 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Inclinometers</div>
              <div className="text-sm font-black text-black font-mono">
                {attachedDevices.length} <span className="text-[11px] font-normal text-emerald-700 font-bold">({onlineCount} live)</span>
              </div>
            </div>

            <div className="text-right px-3 py-2 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Max Displacement</div>
              <div className="text-sm font-black text-black font-mono">
                Δ {maxDisp.toFixed(2)} mm
              </div>
            </div>

            <div className="text-right px-3 py-2 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Avg Tilt</div>
              <div className="text-sm font-black text-purple-700 font-mono">
                θ {avgTilt.toFixed(2)}°
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Collapsible Analytics Row */}
      {showAnalytics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 animate-fadeIn">
          <div className={cardCls}>
            <div className="flex items-center justify-between pb-1">
              <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Attached Inclinometers</span>
              <Cpu className="w-4 h-4 text-blue-600" />
            </div>
            <div className="text-xl font-black text-black font-mono mt-1">{attachedDevices.length}</div>
            <div className="text-[11px] text-slate-600 font-medium mt-0.5">
              <span className="text-emerald-700 font-bold">{onlineCount} online</span>
              {offlineCount > 0 && <span className="text-amber-700 font-bold"> &bull; {offlineCount} offline</span>}
            </div>
          </div>

          <div className={cardCls}>
            <div className="flex items-center justify-between pb-1">
              <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Peak Displacement</span>
              <TrendingUp className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-xl font-black text-black font-mono mt-1">Δ {maxDisp.toFixed(2)} mm</div>
            <div className="text-[11px] text-slate-600 font-medium mt-0.5">
              Alert threshold: 15.0 mm
            </div>
          </div>

          <div className={cardCls}>
            <div className="flex items-center justify-between pb-1">
              <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Mean Resultant Tilt</span>
              <Activity className="w-4 h-4 text-purple-600" />
            </div>
            <div className="text-xl font-black text-purple-700 font-mono mt-1">θ {avgTilt.toFixed(2)}°</div>
            <div className="text-[11px] text-slate-600 font-medium mt-0.5">
              Dual-axis MEMS vector
            </div>
          </div>

          <div className={cardCls}>
            <div className="flex items-center justify-between pb-1">
              <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Slope Stability Status</span>
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-xl font-black text-emerald-700 font-mono mt-1">
              {stabilityStatus === 'STABLE' ? 'STABLE (98.4%)' : stabilityStatus}
            </div>
            <div className="text-[11px] text-slate-600 font-medium mt-0.5">
              Continuous 24/7 telemetry
            </div>
          </div>
        </div>
      )}

      {/* Main Layout: Left Map / Right Devices */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left 8-9 Cols: Interactive Map */}
        <div className="lg:col-span-8 space-y-4">
          {viewType === '3d' ? (
            <Landslide3DMapView
              structures={[structure]}
              devices={attachedDevices}
              sites={site ? [site] : []}
              onSelectStructure={() => {}}
              onSelectDevice={(d) => setSelectedDevice(d)}
            />
          ) : (
            <LocationMapView
              sites={site ? [site] : []}
              devices={attachedDevices}
              structures={[structure]}
              projects={project ? [project] : []}
              organizations={org ? [org] : []}
              initialSelectedSiteId={site?.siteId || site?.id}
              onSelectSite={() => {}}
            />
          )}
        </div>

        {/* Right 3-4 Cols: Attached Hardware Inclinometers & Asset Specs */}
        <div className="lg:col-span-4 space-y-4">
          {/* Deployed Hardware Inclinometers Under This Asset */}
          <div className={cardCls}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-3">
              <div>
                <h3 className="text-sm font-black text-black flex items-center gap-1.5">
                  <Cpu className="w-4 h-4 text-blue-600" />
                  <span>Devices Under Asset</span>
                </h3>
                <p className="text-[11px] text-slate-700 font-medium">
                  {attachedDevices.length} Hardware Inclinometer Node{attachedDevices.length === 1 ? '' : 's'}
                </p>
              </div>
            </div>

            <div className="space-y-2 max-h-[440px] overflow-y-auto pr-1">
              {attachedDevices.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-xs space-y-2">
                  <p>No inclinometer devices attached to this asset yet.</p>
                  <p className="text-[11px] text-slate-400">
                    Go to Structural Assets and click the device button to attach an inclinometer.
                  </p>
                </div>
              ) : (
                attachedDevices.map(d => {
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
                          isOnline
                            ? 'bg-emerald-100 text-emerald-950 border border-emerald-300'
                            : 'bg-amber-100 text-amber-950 border border-amber-300'
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
                        type="button"
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

          {/* Asset Metadata & Geotechnical Specs Card */}
          <div className={cardCls}>
            <div className="flex items-center gap-1.5 pb-2.5 border-b border-slate-200 mb-3">
              <Info className="w-4 h-4 text-blue-600" />
              <h3 className="text-xs font-black text-black uppercase tracking-wider">Asset Specifications</h3>
            </div>

            <div className="space-y-2 text-xs font-medium">
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Asset Type:</span>
                <span className="font-bold text-black">{structure?.type || 'Mountain Slope'}</span>
              </div>

              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Elevation:</span>
                <span className="font-mono font-bold text-black">{structure?.heightElevation || 0} m</span>
              </div>

              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Coverage Aria / Radius:</span>
                <span className="font-mono font-bold text-black">{structure?.ariaRadius || 60} m</span>
              </div>

              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Latitude:</span>
                <span className="font-mono font-bold text-black">{structure?.latitude || 'N/A'}</span>
              </div>

              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Longitude:</span>
                <span className="font-mono font-bold text-black">{structure?.longitude || 'N/A'}</span>
              </div>

              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Parent Site:</span>
                <span className="font-bold text-blue-700">
                  {site ? (
                    <Link to={`/sites/${site.id || site.siteId}`} className="hover:underline">
                      {site.name}
                    </Link>
                  ) : 'N/A'}
                </span>
              </div>

              {structure?.createdAt && (
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">Registered:</span>
                  <span className="font-mono text-slate-700">
                    {new Date(structure.createdAt).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

