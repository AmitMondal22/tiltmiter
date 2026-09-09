import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import {
  Layers, Filter, Search, Shield, Cpu, Activity, AlertTriangle,
  CheckCircle2, Compass, Radio, ExternalLink, ChevronRight,
  Eye, EyeOff, Zap, MapPin, Sliders
} from 'lucide-react';

// Curated Asset Type Palettes
export const ASSET_TYPES = {
  'Crash Barrier': {
    name: 'Crash Barrier',
    color: '#0284c7',
    fillColor: '#38bdf8',
    bg: 'bg-sky-50',
    border: 'border-sky-200',
    text: 'text-sky-700',
    areaShape: 'corridor', // linear buffer
  },
  'Slope Barrier': {
    name: 'Slope Barrier',
    color: '#ea580c',
    fillColor: '#fb923c',
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    text: 'text-orange-700',
    areaShape: 'polygon',
  },
  'Retaining Wall': {
    name: 'Retaining Wall',
    color: '#059669',
    fillColor: '#34d399',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    text: 'text-emerald-700',
    areaShape: 'rectangle',
  },
  'Bridge Pier': {
    name: 'Bridge Pier',
    color: '#7c3aed',
    fillColor: '#a78bfa',
    bg: 'bg-purple-50',
    border: 'border-purple-200',
    text: 'text-purple-700',
    areaShape: 'radial',
  },
  'Tunnel Crown': {
    name: 'Tunnel Crown',
    color: '#e11d48',
    fillColor: '#fb7185',
    bg: 'bg-rose-50',
    border: 'border-rose-200',
    text: 'text-rose-700',
    areaShape: 'sector',
  },
  'Sound Barrier': {
    name: 'Sound Barrier',
    color: '#0d9488',
    fillColor: '#2dd4bf',
    bg: 'bg-teal-50',
    border: 'border-teal-200',
    text: 'text-teal-700',
    areaShape: 'corridor',
  }
};

export const getAssetTypeConfig = (type) => {
  return ASSET_TYPES[type] || {
    name: type || 'Structural Asset',
    color: '#2563eb',
    fillColor: '#60a5fa',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    text: 'text-blue-700',
    areaShape: 'rectangle',
  };
};

export const getDisplacementStatus = (disp) => {
  const val = typeof disp === 'number' ? disp : parseFloat(disp) || 0;
  if (val >= 15.0) {
    return { label: 'CRITICAL', color: '#ef4444', bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-300' };
  }
  if (val >= 5.0) {
    return { label: 'WARNING', color: '#f59e0b', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-300' };
  }
  return { label: 'NORMAL', color: '#10b981', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-300' };
};

// Generate Area Polygons for an asset based on its type and coordinates
const generateAssetAreaCoordinates = (lat, lng, type) => {
  const cfg = getAssetTypeConfig(type);
  const shape = cfg.areaShape;
  const dLat = 0.0012;
  const dLng = 0.0016;

  if (shape === 'corridor') {
    // Linear elongated strip
    return [
      [lat - dLat * 0.3, lng - dLng * 1.5],
      [lat + dLat * 0.3, lng - dLng * 1.5],
      [lat + dLat * 0.4, lng + dLng * 1.5],
      [lat - dLat * 0.2, lng + dLng * 1.5],
    ];
  } else if (shape === 'polygon') {
    // Trapezoidal slope contour
    return [
      [lat - dLat * 0.8, lng - dLng * 0.8],
      [lat + dLat * 0.9, lng - dLng * 0.6],
      [lat + dLat * 0.7, lng + dLng * 1.1],
      [lat - dLat * 0.7, lng + dLng * 0.9],
    ];
  } else if (shape === 'radial' || shape === 'sector') {
    // Octagonal zone
    const pts = [];
    const radius = 0.0009;
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * 2 * Math.PI;
      pts.push([lat + Math.sin(angle) * radius, lng + Math.cos(angle) * (radius * 1.3)]);
    }
    return pts;
  }
  // Default rectangular bounding area
  return [
    [lat - dLat * 0.8, lng - dLng * 1.0],
    [lat + dLat * 0.8, lng - dLng * 1.0],
    [lat + dLat * 0.8, lng + dLng * 1.0],
    [lat - dLat * 0.8, lng + dLng * 1.0],
  ];
};

export default function AssetsMapView({
  structures = [],
  sites = [],
  onSelectStructure,
}) {
  const navigate = useNavigate();
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const areasLayerGroupRef = useRef(null);
  const markersLayerGroupRef = useRef(null);
  const devicesLayerGroupRef = useRef(null);

  const [selectedSiteId, setSelectedSiteId] = useState('ALL');
  const [selectedType, setSelectedType] = useState('ALL');
  const [selectedRisk, setSelectedRisk] = useState('ALL'); // ALL, NORMAL, WARNING, CRITICAL
  const [colorMode, setColorMode] = useState('TYPE'); // 'TYPE' or 'DISPLACEMENT'
  const [showAreas, setShowAreas] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [mapType, setMapType] = useState('street'); // 'street' or 'satellite'

  const [selectedAsset, setSelectedAsset] = useState(null);
  const [selectedDevice, setSelectedDevice] = useState(null);

  // Initialize Map
  useEffect(() => {
    if (!mapRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapRef.current, {
        center: [22.5726, 88.3639],
        zoom: 13,
        zoomControl: false,
      });

      L.control.zoom({ position: 'bottomright' }).addTo(map);

      mapInstanceRef.current = map;
      areasLayerGroupRef.current = L.layerGroup().addTo(map);
      markersLayerGroupRef.current = L.layerGroup().addTo(map);
      devicesLayerGroupRef.current = L.layerGroup().addTo(map);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update Base Tile Layer
  useEffect(() => {
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

  // Update Areas, Asset Markers, and Attached Device Markers
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !areasLayerGroupRef.current || !markersLayerGroupRef.current || !devicesLayerGroupRef.current) return;

    areasLayerGroupRef.current.clearLayers();
    markersLayerGroupRef.current.clearLayers();
    devicesLayerGroupRef.current.clearLayers();

    const bounds = L.latLngBounds([]);

    // Filter structures
    const filteredStructures = structures.filter(st => {
      if (selectedSiteId !== 'ALL' && st.siteId !== selectedSiteId) return false;
      if (selectedType !== 'ALL' && st.type !== selectedType) return false;

      const devices = st.Devices || [];
      const maxDisp = devices.reduce((acc, d) => Math.max(acc, d.totalDisplacement || 0.18), 0.18);
      const risk = getDisplacementStatus(maxDisp);
      if (selectedRisk !== 'ALL' && risk.label !== selectedRisk) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = st.name?.toLowerCase().includes(q);
        const matchCode = (st.code || st.id)?.toLowerCase().includes(q);
        const matchSite = st.siteId?.toLowerCase().includes(q);
        return matchName || matchCode || matchSite;
      }
      return true;
    });

    filteredStructures.forEach(st => {
      // Asset GPS
      let lat = parseFloat(st.latitude);
      let lng = parseFloat(st.longitude);

      if (isNaN(lat) || isNaN(lng)) {
        const parentSite = sites.find(s => s.id === st.siteId || s.siteId === st.siteId);
        if (parentSite && parentSite.latitude && parentSite.longitude) {
          const hash = (st.id || '').split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
          const angle = ((hash % 16) / 16) * 2 * Math.PI;
          const dist = 0.002 + ((hash % 4) * 0.0006);
          lat = parseFloat(parentSite.latitude) + Math.cos(angle) * dist;
          lng = parseFloat(parentSite.longitude) + Math.sin(angle) * dist;
        } else {
          lat = 22.5726 + (Math.random() - 0.5) * 0.015;
          lng = 88.3639 + (Math.random() - 0.5) * 0.015;
        }
      }

      bounds.extend([lat, lng]);

      const typeConfig = getAssetTypeConfig(st.type);
      const attachedDevs = st.Devices || [];
      const maxDisplacement = attachedDevs.reduce((acc, d) => Math.max(acc, d.totalDisplacement || 0.18), 0.18);
      const riskStatus = getDisplacementStatus(maxDisplacement);

      // Determine Primary Theme Color (by Type or by Displacement Risk)
      const primaryColor = colorMode === 'DISPLACEMENT' ? riskStatus.color : typeConfig.color;
      const fillColor = colorMode === 'DISPLACEMENT' ? riskStatus.color : typeConfig.fillColor;

      // 1. Render Geofenced Coverage Area ("aria") Polygon
      if (showAreas) {
        const areaCoords = generateAssetAreaCoordinates(lat, lng, st.type);
        const isSelected = selectedAsset && selectedAsset.id === st.id;

        const polygon = L.polygon(areaCoords, {
          color: primaryColor,
          weight: isSelected ? 3 : 2,
          fillColor: fillColor,
          fillOpacity: isSelected ? 0.28 : 0.16,
          dashArray: isSelected ? '6, 6' : '3, 3',
        });

        polygon.on('click', () => {
          setSelectedAsset(st);
          setSelectedDevice(null);
          map.setView([lat, lng], 15, { animate: true });
          if (onSelectStructure) onSelectStructure(st);
        });

        // Area tooltip
        polygon.bindTooltip(`
          <div class="font-sans text-xs">
            <div class="font-bold text-slate-900">${st.name}</div>
            <div class="text-[10px] text-slate-500 font-mono">${st.type} &bull; Area Coverage</div>
            <div class="text-[10px] font-bold text-blue-600 font-mono mt-0.5">Max Disp: ${maxDisplacement.toFixed(2)} mm</div>
          </div>
        `, { sticky: true });

        areasLayerGroupRef.current.addLayer(polygon);
      }

      // 2. Render Asset Main Pin Marker
      const assetIcon = L.divIcon({
        className: 'custom-map-pin',
        html: `
          <div class="relative group cursor-pointer flex flex-col items-center">
            <div class="px-2.5 py-1 rounded-xl text-white font-bold text-[11px] shadow-lg flex items-center gap-1.5 border border-white whitespace-nowrap" style="background-color: ${primaryColor};">
              <span class="w-2 h-2 rounded-full bg-white animate-ping"></span>
              <span>${st.name}</span>
              <span class="px-1 py-0.2 rounded-md bg-black/30 text-[9px] font-mono">${st.type}</span>
            </div>
            <div class="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] -mt-[1px]" style="border-t-color: ${primaryColor};"></div>
            <!-- Displacement Badge -->
            <div class="px-1.5 py-0.2 rounded-full bg-white shadow-md border text-[9px] font-mono font-bold mt-[-2px]" style="color: ${riskStatus.color}; border-color: ${riskStatus.color};">
              Δ ${maxDisplacement.toFixed(2)} mm
            </div>
          </div>
        `,
        iconSize: [140, 48],
        iconAnchor: [70, 48],
      });

      const assetMarker = L.marker([lat, lng], { icon: assetIcon });
      assetMarker.on('click', () => {
        setSelectedAsset(st);
        setSelectedDevice(null);
        map.setView([lat, lng], 15, { animate: true });
        if (onSelectStructure) onSelectStructure(st);
      });

      markersLayerGroupRef.current.addLayer(assetMarker);

      // 3. Render Attached Hardware Sensor Nodes around this asset
      attachedDevs.forEach((dev, idx) => {
        const offsetAngle = (idx / Math.max(1, attachedDevs.length)) * 2 * Math.PI;
        const dDist = 0.0008;
        const devLat = parseFloat(dev.latitude) || (lat + Math.sin(offsetAngle) * dDist);
        const devLng = parseFloat(dev.longitude) || (lng + Math.cos(offsetAngle) * dDist);

        bounds.extend([devLat, devLng]);

        const devDisp = dev.totalDisplacement !== undefined ? dev.totalDisplacement : (dev.displacement?.totalDisplacement_mm || 0.18);
        const isOnline = (dev.status || 'ONLINE') === 'ONLINE';

        // Draw dotted leader line from asset to attached device
        const line = L.polyline([[lat, lng], [devLat, devLng]], {
          color: primaryColor,
          weight: 1.5,
          dashArray: '3, 4',
          opacity: 0.6,
        });
        devicesLayerGroupRef.current.addLayer(line);

        const devIcon = L.divIcon({
          className: 'custom-map-pin',
          html: `
            <div class="relative group cursor-pointer flex flex-col items-center">
              <div class="px-2 py-0.5 rounded-lg bg-slate-900 text-white font-mono font-bold text-[9px] shadow-md border ${isOnline ? 'border-emerald-400' : 'border-amber-400'} flex items-center gap-1 whitespace-nowrap">
                <span class="w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-amber-400'}"></span>
                <span>${dev.name || dev.id}</span>
                <span class="text-cyan-300">Δ ${Number(devDisp).toFixed(1)}mm</span>
              </div>
              <div class="w-2.5 h-2.5 rounded-full bg-blue-500 border-2 border-white shadow-xs mt-0.5"></div>
            </div>
          `,
          iconSize: [100, 32],
          iconAnchor: [50, 32],
        });

        const devMarker = L.marker([devLat, devLng], { icon: devIcon });
        devMarker.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          setSelectedDevice(dev);
          setSelectedAsset(st);
          map.setView([devLat, devLng], 16, { animate: true });
        });

        devicesLayerGroupRef.current.addLayer(devMarker);
      });
    });

    if (bounds.isValid() && filteredStructures.length > 0) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
    }
  }, [structures, sites, selectedSiteId, selectedType, selectedRisk, colorMode, showAreas, searchQuery, selectedAsset?.id]);

  const handleAssetSelect = (st) => {
    setSelectedAsset(st);
    setSelectedDevice(null);
    if (mapInstanceRef.current && st) {
      const lat = parseFloat(st.latitude) || 22.5726;
      const lng = parseFloat(st.longitude) || 88.3639;
      mapInstanceRef.current.setView([lat, lng], 15, { animate: true });
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-210px)] min-h-[640px] rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
      {/* Top Filter & Toolbar */}
      <div className="p-3.5 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Left: Search & Filters */}
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[300px]">
          {/* Search Input */}
          <div className="relative min-w-[180px] max-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search structural asset..."
              className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 bg-white font-medium text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs"
            />
          </div>

          {/* Filter by Type */}
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <select
              value={selectedType}
              onChange={e => setSelectedType(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs cursor-pointer"
            >
              <option value="ALL">All Asset Types ({structures.length})</option>
              {Object.keys(ASSET_TYPES).map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* Filter by Location Site */}
          <select
            value={selectedSiteId}
            onChange={e => setSelectedSiteId(e.target.value)}
            className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs cursor-pointer"
          >
            <option value="ALL">All Sites ({sites.length})</option>
            {sites.map(s => (
              <option key={s.id || s.siteId} value={s.id || s.siteId}>
                {s.name}
              </option>
            ))}
          </select>

          {/* Displacement Risk Filter */}
          <div className="flex items-center bg-white border border-slate-200 rounded-xl p-0.5 shadow-2xs">
            <button
              onClick={() => setSelectedRisk('ALL')}
              className={`px-2 py-0.5 rounded-lg font-bold text-[10px] transition-all cursor-pointer ${
                selectedRisk === 'ALL' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Risks
            </button>
            <button
              onClick={() => setSelectedRisk('NORMAL')}
              className={`px-2 py-0.5 rounded-lg font-bold text-[10px] transition-all cursor-pointer ${
                selectedRisk === 'NORMAL' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Normal
            </button>
            <button
              onClick={() => setSelectedRisk('WARNING')}
              className={`px-2 py-0.5 rounded-lg font-bold text-[10px] transition-all cursor-pointer ${
                selectedRisk === 'WARNING' ? 'bg-amber-600 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Warning
            </button>
            <button
              onClick={() => setSelectedRisk('CRITICAL')}
              className={`px-2 py-0.5 rounded-lg font-bold text-[10px] transition-all cursor-pointer ${
                selectedRisk === 'CRITICAL' ? 'bg-red-600 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Critical
            </button>
          </div>
        </div>

        {/* Right Controls: Color Mode, Show Areas, Satellite */}
        <div className="flex items-center gap-2">
          {/* Color Mode Switcher */}
          <div className="flex items-center bg-white border border-slate-200 rounded-xl p-0.5 shadow-2xs">
            <button
              onClick={() => setColorMode('TYPE')}
              className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer ${
                colorMode === 'TYPE' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Color by Type
            </button>
            <button
              onClick={() => setColorMode('DISPLACEMENT')}
              className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer ${
                colorMode === 'DISPLACEMENT' ? 'bg-purple-600 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Color by Displacement
            </button>
          </div>

          {/* Toggle Area Geofence Overlay ("aria") */}
          <button
            onClick={() => setShowAreas(!showAreas)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border font-bold shadow-2xs transition-all cursor-pointer ${
              showAreas ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
            title="Toggle Coverage Area Geofences"
          >
            {showAreas ? <Eye className="w-3.5 h-3.5 text-blue-600" /> : <EyeOff className="w-3.5 h-3.5 text-slate-400" />}
            <span>{showAreas ? 'Area Overlay On' : 'Area Overlay Off'}</span>
          </button>

          {/* Map Layer Switcher */}
          <button
            onClick={() => setMapType(mapType === 'street' ? 'satellite' : 'street')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border font-bold shadow-2xs transition-all cursor-pointer ${
              mapType === 'satellite'
                ? 'bg-purple-600 text-white border-purple-500'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>{mapType === 'satellite' ? 'Satellite' : 'Street'}</span>
          </button>
        </div>
      </div>

      {/* Main Map Canvas and Inspector Flyout */}
      <div className="flex-1 relative flex overflow-hidden">
        {/* Leaflet Map Canvas */}
        <div ref={mapRef} className="flex-1 w-full h-full z-0" />

        {/* Bottom Floating Legend Bar */}
        <div className="absolute left-3 bottom-3 z-20 bg-white/90 backdrop-blur-md rounded-2xl border border-slate-200 shadow-lg p-2.5 hidden md:flex items-center gap-3 text-[11px] font-bold">
          <span className="text-slate-400 uppercase text-[9px] font-mono">Legend:</span>
          {Object.entries(ASSET_TYPES).map(([type, cfg]) => (
            <div key={type} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cfg.color }} />
              <span className="text-slate-700">{type}</span>
            </div>
          ))}
          <span className="text-slate-300">|</span>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span className="text-emerald-700">Normal (&lt;5mm)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <span className="text-amber-700">Warning (5-15mm)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
            <span className="text-red-700">Critical (&gt;15mm)</span>
          </div>
        </div>

        {/* Floating Asset / Device Inspector Panel */}
        {(selectedAsset || selectedDevice) && (
          <div className="absolute right-3 top-3 bottom-3 w-84 max-w-[90%] bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200 shadow-2xl p-4 flex flex-col justify-between z-20 animate-fadeIn overflow-y-auto">
            <div>
              {/* Header */}
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                    {selectedDevice ? <Cpu className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      {selectedDevice ? 'ATTACHED HARDWARE NODE' : 'STRUCTURAL ASSET INSPECTOR'}
                    </div>
                    <div className="font-bold text-slate-900 text-sm truncate max-w-[190px]">
                      {selectedDevice ? (selectedDevice.name || selectedDevice.id) : selectedAsset.name}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setSelectedDevice(null);
                    setSelectedAsset(null);
                  }}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  &times;
                </button>
              </div>

              {/* Body */}
              {selectedDevice ? (
                <div className="space-y-3 text-xs text-slate-700">
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-1.5 font-mono text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-sans">Device ID:</span>
                      <span className="font-bold text-slate-900">{selectedDevice.id}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-sans">Attached Asset:</span>
                      <span className="font-bold text-slate-900">{selectedAsset?.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-sans">Status:</span>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                        {selectedDevice.status || 'ONLINE'}
                      </span>
                    </div>
                  </div>

                  {/* Displacement Metrics */}
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

                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between font-mono text-xs">
                    <div className="flex items-center gap-1.5 text-emerald-600 font-bold">
                      <Zap className="w-3.5 h-3.5" />
                      <span>{selectedDevice.battery || '100%'}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-blue-600 font-bold">
                      <Radio className="w-3.5 h-3.5" />
                      <span>{selectedDevice.signal || '85%'}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 text-xs text-slate-700">
                  {/* Asset Metadata */}
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Asset Code:</span>
                      <span className="font-mono font-bold text-slate-900">{selectedAsset.code || selectedAsset.id}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Asset Type:</span>
                      <span className="px-2 py-0.5 rounded-lg bg-blue-100 text-blue-800 font-bold text-[10px]">
                        {selectedAsset.type}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Site Location:</span>
                      <span className="font-bold text-slate-900">{selectedAsset.siteId}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Elevation:</span>
                      <span className="font-mono font-bold text-slate-900">{selectedAsset.heightElevation || 12.5}m</span>
                    </div>
                  </div>

                  {/* Displacement Summary */}
                  <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200">
                    <div className="flex items-center justify-between">
                      <div className="text-[10px] font-bold text-emerald-800">Max Geotechnical Displacement</div>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-200 text-emerald-900 font-extrabold text-[9px]">
                        NORMAL
                      </span>
                    </div>
                    <div className="text-xl font-black text-emerald-950 font-mono mt-1">
                      {Number((selectedAsset.Devices || [])[0]?.totalDisplacement || 0.18).toFixed(2)} mm
                    </div>
                  </div>

                  {/* Attached Devices List */}
                  <div>
                    <div className="font-bold text-slate-900 text-xs mb-1.5 flex items-center justify-between">
                      <span>Attached Sensors:</span>
                      <span className="px-2 py-0.2 rounded-full bg-slate-200 text-slate-800 font-mono font-bold text-[10px]">
                        {(selectedAsset.Devices || []).length} Nodes
                      </span>
                    </div>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                      {(selectedAsset.Devices || []).length === 0 ? (
                        <div className="text-center py-3 text-slate-400 text-[11px]">
                          No sensors attached to this asset yet.
                        </div>
                      ) : (
                        (selectedAsset.Devices || []).map(d => (
                          <div
                            key={d.id}
                            onClick={() => setSelectedDevice(d)}
                            className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-blue-50 transition-colors flex items-center justify-between cursor-pointer"
                          >
                            <div>
                              <div className="font-bold text-slate-900">{d.name || d.id}</div>
                              <div className="text-[10px] font-mono text-slate-500">Δ {Number(d.totalDisplacement || 0.18).toFixed(2)} mm</div>
                            </div>
                            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Actions */}
            <div className="pt-3 border-t border-slate-100 flex gap-2">
              {selectedDevice ? (
                <button
                  onClick={() => navigate(`/devices/${selectedDevice.id}`)}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open Live Device Node</span>
                </button>
              ) : (
                <button
                  onClick={() => handleAssetSelect(selectedAsset)}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-slate-900 hover:bg-black text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
                >
                  <Compass className="w-3.5 h-3.5" />
                  <span>Focus Asset Area</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
