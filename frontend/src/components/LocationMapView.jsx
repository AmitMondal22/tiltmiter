import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import {
  MapPin, Cpu, Radio, Battery, Signal, Layers, Search, Filter,
  Navigation, ExternalLink, ChevronRight, Activity, ShieldCheck,
  BarChart3, Zap, TrendingUp, AlertTriangle, CheckCircle2, Box, Map as MapIcon
} from 'lucide-react';
import Landslide3DMapView from './Landslide3DMapView';

export default function LocationMapView({
  sites = [],
  devices = [],
  structures = [],
  projects = [],
  organizations = [],
  initialSelectedSiteId = 'ALL',
  onSelectSite,
}) {
  const navigate = useNavigate();
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersLayerGroupRef = useRef(null);
  const circlesLayerGroupRef = useRef(null);

  const [selectedSiteId, setSelectedSiteId] = useState(initialSelectedSiteId || 'ALL');
  const [statusFilter, setStatusFilter] = useState('ALL'); // ALL, ONLINE, OFFLINE
  const [searchQuery, setSearchQuery] = useState('');
  const [mapType, setMapType] = useState('satellite'); // 'satellite', 'street', or '3d'
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [selectedSite, setSelectedSite] = useState(null);
  const [showAnalyticsPanel, setShowAnalyticsPanel] = useState(true);

  // Sync initialSelectedSiteId when changed from parent
  useEffect(() => {
    if (initialSelectedSiteId && initialSelectedSiteId !== selectedSiteId) {
      setSelectedSiteId(initialSelectedSiteId);
      const site = sites.find(s => s.id === initialSelectedSiteId || s.siteId === initialSelectedSiteId);
      if (site) setSelectedSite(site);
    }
  }, [initialSelectedSiteId]);

  // Initialize Map
  useEffect(() => {
    if (mapType === '3d' || !mapRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapRef.current, {
        center: [22.5726, 88.3639],
        zoom: 12,
        zoomControl: false,
      });

      L.control.zoom({ position: 'bottomright' }).addTo(map);

      mapInstanceRef.current = map;
      markersLayerGroupRef.current = L.layerGroup().addTo(map);
      circlesLayerGroupRef.current = L.layerGroup().addTo(map);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [mapType]);

  // Update Base Tile Layer
  useEffect(() => {
    if (mapType === '3d') return;
    const map = mapInstanceRef.current;
    if (!map) return;

    map.eachLayer((layer) => {
      if (layer instanceof L.TileLayer) {
        map.removeLayer(layer);
      }
    });

    const tileUrl = mapType === 'satellite'
      ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
      : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

    const attribution = mapType === 'satellite'
      ? '&copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
      : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

    L.tileLayer(tileUrl, {
      maxZoom: 19,
      attribution,
    }).addTo(map);
  }, [mapType]);

  // Update Markers and Boundaries based on filtered data
  useEffect(() => {
    if (mapType === '3d') return;
    const map = mapInstanceRef.current;
    if (!map || !markersLayerGroupRef.current || !circlesLayerGroupRef.current) return;

    markersLayerGroupRef.current.clearLayers();
    circlesLayerGroupRef.current.clearLayers();

    const bounds = L.latLngBounds([]);

    // Filter sites
    const filteredSites = sites.filter(s => {
      if (selectedSiteId !== 'ALL' && s.id !== selectedSiteId && s.siteId !== selectedSiteId) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = s.name?.toLowerCase().includes(q);
        const matchId = (s.siteId || s.id)?.toLowerCase().includes(q);
        return matchName || matchId;
      }
      return true;
    });

    // 1. Render Site Markers & Boundary Zones
    filteredSites.forEach(site => {
      const lat = parseFloat(site.latitude) || 22.5726;
      const lng = parseFloat(site.longitude) || 88.3639;

      if (!isNaN(lat) && !isNaN(lng)) {
        bounds.extend([lat, lng]);

        const circle = L.circle([lat, lng], {
          radius: 350,
          color: '#2563eb',
          fillColor: '#3b82f6',
          fillOpacity: 0.12,
          weight: 2,
          dashArray: '5, 5',
        });
        circlesLayerGroupRef.current.addLayer(circle);

        const siteDevices = devices.filter(d => d.siteId === site.id || d.siteId === site.siteId);
        const siteIcon = L.divIcon({
          className: 'custom-map-pin',
          html: `
            <div class="relative group cursor-pointer flex flex-col items-center">
              <div class="px-2.5 py-1 rounded-xl bg-blue-600 text-white font-bold text-[11px] shadow-lg flex items-center gap-1.5 border border-white whitespace-nowrap">
                <span class="w-2 h-2 rounded-full bg-cyan-300 animate-ping"></span>
                <span>${site.name}</span>
                <span class="px-1 py-0.2 rounded-md bg-blue-800 text-[9px] font-mono">${siteDevices.length} Dev</span>
              </div>
              <div class="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-blue-600 -mt-[1px]"></div>
            </div>
          `,
          iconSize: [120, 40],
          iconAnchor: [60, 40],
        });

        const siteMarker = L.marker([lat, lng], { icon: siteIcon });
        siteMarker.on('click', () => {
          setSelectedSite(site);
          setSelectedSiteId(site.id || site.siteId);
          setSelectedDevice(null);
          map.setView([lat, lng], 15, { animate: true });
          if (onSelectSite) onSelectSite(site);
        });

        markersLayerGroupRef.current.addLayer(siteMarker);
      }
    });

    // 2. Render Devices under Sites
    const filteredDevices = devices.filter(dev => {
      if (selectedSiteId !== 'ALL' && dev.siteId !== selectedSiteId) return false;
      if (statusFilter !== 'ALL' && dev.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = dev.name?.toLowerCase().includes(q);
        const matchId = dev.id?.toLowerCase().includes(q);
        const matchSite = dev.siteId?.toLowerCase().includes(q);
        return matchName || matchId || matchSite;
      }
      return true;
    });

    filteredDevices.forEach(dev => {
      let lat = parseFloat(dev.latitude);
      let lng = parseFloat(dev.longitude);

      if (isNaN(lat) || isNaN(lng)) {
        const parentSite = sites.find(s => s.id === dev.siteId || s.siteId === dev.siteId);
        if (parentSite && parentSite.latitude && parentSite.longitude) {
          const hash = (dev.id || '').split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
          const angle = ((hash % 12) / 12) * 2 * Math.PI;
          const dist = 0.0015 + ((hash % 5) * 0.0004);
          lat = parseFloat(parentSite.latitude) + Math.cos(angle) * dist;
          lng = parseFloat(parentSite.longitude) + Math.sin(angle) * dist;
        } else {
          lat = 22.5726 + (Math.random() - 0.5) * 0.01;
          lng = 88.3639 + (Math.random() - 0.5) * 0.01;
        }
      }

      bounds.extend([lat, lng]);

      const isOnline = (dev.status || 'ONLINE') === 'ONLINE';
      const devDisplacement = dev.totalDisplacement !== undefined ? dev.totalDisplacement : (dev.displacement?.totalDisplacement_mm || 0.18);

      const devIcon = L.divIcon({
        className: 'custom-map-pin',
        html: `
          <div class="relative group cursor-pointer flex flex-col items-center">
            <div class="px-2 py-0.5 rounded-lg ${isOnline ? 'bg-slate-900' : 'bg-amber-900'} text-white font-mono font-bold text-[10px] shadow-md border ${isOnline ? 'border-emerald-400' : 'border-amber-400'} flex items-center gap-1 whitespace-nowrap">
              <span class="w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-amber-400'}"></span>
              <span>${dev.name || dev.id}</span>
              <span class="text-[9px] text-cyan-300">Δ ${Number(devDisplacement).toFixed(1)}mm</span>
            </div>
            <div class="w-3 h-3 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-amber-500'} border-2 border-white shadow-sm mt-0.5"></div>
          </div>
        `,
        iconSize: [110, 36],
        iconAnchor: [55, 36],
      });

      const devMarker = L.marker([lat, lng], { icon: devIcon });
      devMarker.on('click', () => {
        setSelectedDevice(dev);
        map.setView([lat, lng], 16, { animate: true });
      });

      markersLayerGroupRef.current.addLayer(devMarker);
    });

    if (bounds.isValid() && (filteredSites.length > 0 || filteredDevices.length > 0)) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
    }
  }, [sites, devices, selectedSiteId, statusFilter, searchQuery, mapType]);

  // Handle Site Selection Center
  const handleSiteSelect = (siteId) => {
    setSelectedSiteId(siteId);
    if (siteId === 'ALL') {
      setSelectedSite(null);
      const map = mapInstanceRef.current;
      if (map && sites.length > 0) {
        const bounds = L.latLngBounds(sites.map(s => [parseFloat(s.latitude) || 22.5726, parseFloat(s.longitude) || 88.3639]));
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
      }
    } else {
      const site = sites.find(s => s.id === siteId || s.siteId === siteId);
      if (site) {
        setSelectedSite(site);
        setSelectedDevice(null);
        if (mapInstanceRef.current) {
          const lat = parseFloat(site.latitude) || 22.5726;
          const lng = parseFloat(site.longitude) || 88.3639;
          mapInstanceRef.current.setView([lat, lng], 15, { animate: true });
        }
      }
    }
  };

  // Location Analytics Calculations
  const activeLocationDevices = selectedSiteId === 'ALL'
    ? devices
    : devices.filter(d => d.siteId === selectedSiteId);

  const locOnlineCount = activeLocationDevices.filter(d => (d.status || 'ONLINE') === 'ONLINE').length;
  const locOfflineCount = activeLocationDevices.length - locOnlineCount;

  const displacements = activeLocationDevices.map(d => Number(d.totalDisplacement || d.displacement?.totalDisplacement_mm || 0.18));
  const maxDisplacement = displacements.length > 0 ? Math.max(...displacements) : 0;
  const avgDisplacement = displacements.length > 0 ? (displacements.reduce((a, b) => a + b, 0) / displacements.length) : 0;

  const tilts = activeLocationDevices.map(d => Number(d.resultantTilt || d.tilt?.tilt || 0.22));
  const avgTilt = tilts.length > 0 ? (tilts.reduce((a, b) => a + b, 0) / tilts.length) : 0;

  return (
    <div className="flex flex-col h-[calc(100vh-210px)] min-h-[640px] rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
      {/* Top Controls Bar */}
      <div className="p-3.5 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Left: Search & Site dropdown */}
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
          <div className="relative flex-1 min-w-[180px] max-w-[280px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search site or device node..."
              className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 bg-white font-medium text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <select
              value={selectedSiteId}
              onChange={e => handleSiteSelect(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs cursor-pointer"
            >
              <option value="ALL">All Monitored Locations ({sites.length})</option>
              {sites.map(s => (
                <option key={s.id || s.siteId} value={s.id || s.siteId}>
                  {s.name} ({s.id || s.siteId})
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center bg-white border border-slate-200 rounded-xl p-0.5 shadow-2xs">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer ${
                statusFilter === 'ALL' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All ({devices.length})
            </button>
            <button
              onClick={() => setStatusFilter('ONLINE')}
              className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer ${
                statusFilter === 'ONLINE' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Online ({locOnlineCount})
            </button>
            <button
              onClick={() => setStatusFilter('OFFLINE')}
              className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer ${
                statusFilter === 'OFFLINE' ? 'bg-amber-600 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Offline ({locOfflineCount})
            </button>
          </div>
        </div>

        {/* Right: Map Layers (Satellite, Street, 3D Landslide) */}
        <div className="flex items-center gap-2">
          {/* Map View Switcher: Satellite / Street / 3D Landslide */}
          <div className="flex items-center bg-white border border-slate-200 rounded-xl p-0.5 shadow-2xs">
            <button
              onClick={() => setMapType('satellite')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg font-bold text-xs transition-all cursor-pointer ${
                mapType === 'satellite' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Satellite</span>
            </button>
            <button
              onClick={() => setMapType('street')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg font-bold text-xs transition-all cursor-pointer ${
                mapType === 'street' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <MapIcon className="w-3.5 h-3.5" />
              <span>Street</span>
            </button>
            <button
              onClick={() => setMapType('3d')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg font-bold text-xs transition-all cursor-pointer ${
                mapType === '3d' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Box className="w-3.5 h-3.5" />
              <span>3D Landslide</span>
            </button>
          </div>

          <button
            onClick={() => setShowAnalyticsPanel(!showAnalyticsPanel)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border font-bold shadow-2xs transition-all cursor-pointer ${
              showAnalyticsPanel
                ? 'bg-blue-50 text-blue-700 border-blue-200'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>{showAnalyticsPanel ? 'Hide Analytics' : 'Show Analytics'}</span>
          </button>
        </div>
      </div>

      {/* Main Map View (2D Leaflet OR 3D Landslide Slope) + Analytics Panel */}
      <div className="flex-1 relative flex overflow-hidden">
        {mapType === '3d' ? (
          <div className="w-full h-full">
            <Landslide3DMapView
              structures={structures}
              devices={activeLocationDevices}
              sites={selectedSite ? [selectedSite] : sites}
              onSelectStructure={() => {}}
              onSelectDevice={(d) => setSelectedDevice(d)}
            />
          </div>
        ) : (
          <div ref={mapRef} className="flex-1 w-full h-full z-0" />
        )}

        {/* Left Floating Location Analytics Cards (only in 2D mode to avoid overlapping 3D controls) */}
        {mapType !== '3d' && showAnalyticsPanel && (
          <div className="absolute left-3 top-3 bottom-3 w-80 max-w-[90%] bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200 shadow-2xl p-4 flex flex-col justify-between z-20 animate-fadeIn overflow-y-auto">
            <div>
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                    <BarChart3 className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      LOCATION ANALYTICS
                    </div>
                    <div className="font-bold text-slate-900 text-sm truncate max-w-[190px]">
                      {selectedSite ? selectedSite.name : 'All Monitored Locations'}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setShowAnalyticsPanel(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  &times;
                </button>
              </div>

              {/* 4 Analytics Metric Cards */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="text-[10px] text-slate-500 font-semibold">Active Devices</div>
                  <div className="text-lg font-bold text-slate-900 font-mono mt-0.5">
                    {locOnlineCount} / {activeLocationDevices.length}
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-100">
                  <div className="text-[10px] text-emerald-700 font-semibold">Max Displacement</div>
                  <div className="text-lg font-bold text-emerald-950 font-mono mt-0.5">
                    {maxDisplacement.toFixed(2)} mm
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-blue-50/70 border border-blue-100">
                  <div className="text-[10px] text-blue-700 font-semibold">Avg Displacement</div>
                  <div className="text-lg font-bold text-blue-950 font-mono mt-0.5">
                    {avgDisplacement.toFixed(2)} mm
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-purple-50/70 border border-purple-100">
                  <div className="text-[10px] text-purple-700 font-semibold">Avg Vector Tilt</div>
                  <div className="text-lg font-bold text-purple-950 font-mono mt-0.5">
                    {avgTilt.toFixed(2)}°
                  </div>
                </div>
              </div>

              {/* All Devices deployed under this location */}
              <div>
                <div className="font-bold text-slate-900 text-xs mb-1.5 flex items-center justify-between">
                  <span>Devices in Location:</span>
                  <span className="px-2 py-0.2 rounded-full bg-slate-200 text-slate-800 font-mono font-bold text-[10px]">
                    {activeLocationDevices.length} Nodes
                  </span>
                </div>
                <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                  {activeLocationDevices.length === 0 ? (
                    <div className="text-center py-4 text-slate-400 text-[11px]">
                      No devices deployed in this location.
                    </div>
                  ) : (
                    activeLocationDevices.map(d => {
                      const isOnline = (d.status || 'ONLINE') === 'ONLINE';
                      const disp = Number(d.totalDisplacement || d.displacement?.totalDisplacement_mm || 0.18);

                      return (
                        <div
                          key={d.id}
                          onClick={() => {
                            setSelectedDevice(d);
                            if (mapInstanceRef.current && d.latitude && d.longitude) {
                              mapInstanceRef.current.setView([parseFloat(d.latitude), parseFloat(d.longitude)], 16, { animate: true });
                            }
                          }}
                          className={`p-2 rounded-xl border transition-colors flex items-center justify-between cursor-pointer ${
                            selectedDevice?.id === d.id ? 'bg-blue-50 border-blue-300' : 'bg-white border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="font-bold text-slate-900 truncate text-xs">{d.name || d.id}</div>
                            <div className="text-[10px] font-mono text-slate-500 flex items-center gap-2">
                              <span>{d.id}</span>
                              <span className="text-blue-600 font-bold">Δ {disp.toFixed(2)}mm</span>
                            </div>
                          </div>
                          <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Bottom button */}
            <div className="pt-3 border-t border-slate-100">
              <div className="text-[10px] text-slate-400 text-center font-mono">
                Click any device above to focus and inspect telemetry
              </div>
            </div>
          </div>
        )}

        {/* Right Floating Device Inspector Drawer */}
        {mapType !== '3d' && selectedDevice && (
          <div className="absolute right-3 top-3 bottom-3 w-80 max-w-[90%] bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200 shadow-2xl p-4 flex flex-col justify-between z-20 animate-fadeIn">
            <div>
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                    <Cpu className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      SENSOR NODE INSPECTOR
                    </div>
                    <div className="font-bold text-slate-900 text-sm truncate max-w-[180px]">
                      {selectedDevice.name || selectedDevice.id}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedDevice(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  &times;
                </button>
              </div>

              <div className="space-y-2.5 text-xs text-slate-700">
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 space-y-1.5 font-mono text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-sans">Device ID:</span>
                    <span className="font-bold text-slate-900">{selectedDevice.id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-sans">Location Site:</span>
                    <span className="font-bold text-slate-900">{selectedDevice.siteId || 'Standalone'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-sans">Status:</span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                      {selectedDevice.status || 'ONLINE'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-100">
                    <div className="text-[10px] text-blue-600 font-bold">Total Displacement</div>
                    <div className="text-base font-bold text-blue-900 font-mono mt-0.5">
                      {Number(selectedDevice.totalDisplacement || 0.18).toFixed(2)} mm
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-purple-50 border border-purple-100">
                    <div className="text-[10px] text-purple-600 font-bold">Resultant Tilt</div>
                    <div className="text-base font-bold text-purple-900 font-mono mt-0.5">
                      {Number(selectedDevice.resultantTilt || 0.22).toFixed(2)}°
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100 font-mono text-[11px]">
                  <div className="flex items-center gap-1.5 font-bold text-emerald-600">
                    <Battery className="w-4 h-4" />
                    <span>{selectedDevice.battery || '100%'}</span>
                  </div>
                  <div className="flex items-center gap-1.5 font-bold text-blue-600">
                    <Signal className="w-4 h-4" />
                    <span>{selectedDevice.signal || '85%'}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100">
              <button
                onClick={() => navigate(`/devices/${selectedDevice.id}`)}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open Live Telemetry Console</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
