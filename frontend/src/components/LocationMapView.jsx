import React, { useEffect, useRef, useState, useMemo } from 'react';
import { renderToString } from 'react-dom/server';
import { useNavigate } from 'react-router-dom';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  MapPin, Cpu, Radio, Battery, Signal, Layers, Search, Filter,
  Navigation, ExternalLink, ChevronRight, Activity, ShieldCheck,
  BarChart3, Zap, TrendingUp, AlertTriangle, CheckCircle2, Box,
  Map as MapIcon, Globe, Mountain, Flame, Eye, Maximize2, Camera,
  X, RotateCcw, Compass
} from 'lucide-react';
import { formatBatteryPercentage, formatCSQPercentage } from '../utils/telemetryHelper';
import { formatAssetUrl } from '../api/apiClient';

// Free, open map styles requiring NO API Key
const MAP_STYLES = {
  satellite: {
    id: 'satellite',
    name: 'Satellite 3D',
    style: {
      version: 8,
      sources: {
        'esri-satellite': {
          type: 'raster',
          tiles: [
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
          ],
          tileSize: 256,
          maxzoom: 18, // Esri native zoom stops at 18; setting maxzoom: 18 ensures MapLibre overscales without requesting non-existent tiles
          attribution: '&copy; Esri World Imagery, Maxar, Earthstar'
        },
        'terrain-dem': {
          type: 'raster-dem',
          tiles: [
            'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
          ],
          encoding: 'terrarium',
          tileSize: 256,
          maxzoom: 15
        }
      },
      layers: [
        {
          id: 'satellite-tiles-layer',
          type: 'raster',
          source: 'esri-satellite',
          minzoom: 0,
          maxzoom: 22
        }
      ]
    }
  },
  google: {
    id: 'google',
    name: 'Google Satellite',
    style: {
      version: 8,
      sources: {
        'google-satellite': {
          type: 'raster',
          tiles: [
            'https://mt0.google.com/vt/lyrs=y&hl=en&x={x}&y={y}&z={z}',
            'https://mt1.google.com/vt/lyrs=y&hl=en&x={x}&y={y}&z={z}',
            'https://mt2.google.com/vt/lyrs=y&hl=en&x={x}&y={y}&z={z}',
            'https://mt3.google.com/vt/lyrs=y&hl=en&x={x}&y={y}&z={z}'
          ],
          tileSize: 256,
          maxzoom: 20, // Google Hybrid provides sub-meter resolution up to zoom 20
          attribution: '&copy; Google Maps'
        },
        'terrain-dem': {
          type: 'raster-dem',
          tiles: [
            'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
          ],
          encoding: 'terrarium',
          tileSize: 256,
          maxzoom: 15
        }
      },
      layers: [
        {
          id: 'google-satellite-layer',
          type: 'raster',
          source: 'google-satellite',
          minzoom: 0,
          maxzoom: 22
        }
      ]
    }
  },
  street: {
    id: 'street',
    name: 'Street View',
    style: {
      version: 8,
      sources: {
        'osm-tiles': {
          type: 'raster',
          tiles: [
            'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
          ],
          tileSize: 256,
          maxzoom: 19,
          attribution: '&copy; OpenStreetMap contributors'
        },
        'terrain-dem': {
          type: 'raster-dem',
          tiles: [
            'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
          ],
          encoding: 'terrarium',
          tileSize: 256,
          maxzoom: 15
        }
      },
      layers: [
        {
          id: 'osm-tiles-layer',
          type: 'raster',
          source: 'osm-tiles',
          minzoom: 0,
          maxzoom: 22
        }
      ]
    }
  },
  topo: {
    id: 'topo',
    name: 'Topographic Relief',
    style: {
      version: 8,
      sources: {
        'topo-tiles': {
          type: 'raster',
          tiles: [
            'https://tile.opentopomap.org/{z}/{x}/{y}.png'
          ],
          tileSize: 256,
          maxzoom: 17,
          attribution: '&copy; OpenTopoMap contributors'
        },
        'terrain-dem': {
          type: 'raster-dem',
          tiles: [
            'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
          ],
          encoding: 'terrarium',
          tileSize: 256,
          maxzoom: 15
        }
      },
      layers: [
        {
          id: 'topo-tiles-layer',
          type: 'raster',
          source: 'topo-tiles',
          minzoom: 0,
          maxzoom: 22
        }
      ]
    }
  },
  hillshade: {
    id: 'hillshade',
    name: 'Slope Hillshade',
    style: {
      version: 8,
      sources: {
        'hillshade-tiles': {
          type: 'raster',
          tiles: [
            'https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}'
          ],
          tileSize: 256,
          maxzoom: 13, // Esri World Hillshade native global resolution stops at 13; capping at 13 allows MapLibre to overscale cleanly without requesting non-existent tiles
          attribution: '&copy; Esri World Hillshade, USGS, NGA'
        },
        'terrain-dem': {
          type: 'raster-dem',
          tiles: [
            'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
          ],
          encoding: 'terrarium',
          tileSize: 256,
          maxzoom: 15
        }
      },
      layers: [
        {
          id: 'hillshade-tiles-layer',
          type: 'raster',
          source: 'hillshade-tiles',
          minzoom: 0,
          maxzoom: 22
        },
        {
          id: 'dem-hillshade-layer',
          type: 'hillshade',
          source: 'terrain-dem',
          minzoom: 13,
          maxzoom: 22,
          paint: {
            'hillshade-illumination-direction': 315,
            'hillshade-exaggeration': 0.7,
            'hillshade-shadow-color': '#0f172a',
            'hillshade-highlight-color': '#ffffff',
            'hillshade-accent-color': '#334155'
          }
        }
      ]
    }
  },
  analytics: {
    id: 'analytics',
    name: 'Analytics Canvas',
    style: {
      version: 8,
      sources: {
        'esri-dark-base': {
          type: 'raster',
          tiles: [
            'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}'
          ],
          tileSize: 256,
          maxzoom: 16, // Esri Dark Canvas native resolution stops at 16; setting maxzoom: 16 ensures MapLibre overscales without requesting non-existent tiles
          attribution: '&copy; Esri, HERE, Garmin, OpenStreetMap'
        },
        'esri-dark-ref': {
          type: 'raster',
          tiles: [
            'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}'
          ],
          tileSize: 256,
          maxzoom: 16,
          attribution: '&copy; Esri'
        },
        'terrain-dem': {
          type: 'raster-dem',
          tiles: [
            'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
          ],
          encoding: 'terrarium',
          tileSize: 256,
          maxzoom: 15
        }
      },
      layers: [
        {
          id: 'esri-dark-base-layer',
          type: 'raster',
          source: 'esri-dark-base',
          minzoom: 0,
          maxzoom: 22
        },
        {
          id: 'esri-dark-ref-layer',
          type: 'raster',
          source: 'esri-dark-ref',
          minzoom: 0,
          maxzoom: 22
        }
      ]
    }
  }
};

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
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const popupRef = useRef(null);
  const initialBoundsFittedRef = useRef(false);

  // States
  const [selectedSiteId, setSelectedSiteId] = useState(initialSelectedSiteId || 'ALL');
  const [statusFilter, setStatusFilter] = useState('ALL'); // ALL, ONLINE, OFFLINE
  const [searchQuery, setSearchQuery] = useState('');
  const [mapType, setMapType] = useState('satellite'); // 'satellite', 'google', 'street', 'topo', 'hillshade', 'analytics'
  const [is3D, setIs3D] = useState(true); // 3D Pitch tilt (55deg vs 0deg)
  const [isGlobe, setIsGlobe] = useState(false); // 3D Globe vs Mercator projection
  const [isTerrain, setIsTerrain] = useState(true); // 3D Terrain elevation mesh
  const [showHeatmap, setShowHeatmap] = useState(false); // Inclinometer displacement heatmap
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [selectedSite, setSelectedSite] = useState(null);
  const [showAnalyticsPanel, setShowAnalyticsPanel] = useState(false);

  // Lightbox Preview Modal State
  const [previewImageModal, setPreviewImageModal] = useState({
    open: false,
    url: null,
    device: null
  });

  // Sync initialSelectedSiteId when changed from parent
  useEffect(() => {
    if (initialSelectedSiteId && initialSelectedSiteId !== selectedSiteId) {
      setSelectedSiteId(initialSelectedSiteId);
      const site = sites.find(s => s.id === initialSelectedSiteId || s.siteId === initialSelectedSiteId);
      if (site) setSelectedSite(site);
    }
  }, [initialSelectedSiteId]);

  // Window bridge so DOM popup click can open React image preview modal
  useEffect(() => {
    window.__openDeviceImagePreview = (deviceId) => {
      const dev = devices.find(d => d.id === deviceId);
      if (dev && dev.imageUrl) {
        setPreviewImageModal({
          open: true,
          url: formatAssetUrl(dev.imageUrl),
          device: dev
        });
      }
    };
    return () => {
      delete window.__openDeviceImagePreview;
    };
  }, [devices]);

  // 1. Initialize MapLibre GL Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Center coordinates from sites or default
    let centerLng = 88.3639;
    let centerLat = 22.5726;
    if (sites.length > 0) {
      const firstWithCoords = sites.find(s => s.latitude && s.longitude);
      if (firstWithCoords) {
        centerLat = parseFloat(firstWithCoords.latitude);
        centerLng = parseFloat(firstWithCoords.longitude);
      }
    }

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: MAP_STYLES[mapType].style,
      center: [centerLng, centerLat],
      zoom: 12.5,
      pitch: is3D ? 55 : 0,
      bearing: 0,
      maxPitch: 85,
      maxZoom: 20, // Prevents zooming past zoom 20 where no raster tiles or imagery exist
      minZoom: 2
    });

    mapInstanceRef.current = map;

    // Add navigation controls (Zoom + 3D Compass)
    const navControl = new maplibregl.NavigationControl({
      visualizePitch: true,
      showCompass: true,
      showZoom: true
    });
    map.addControl(navControl, 'top-right');

    const fullscreenControl = new maplibregl.FullscreenControl();
    map.addControl(fullscreenControl, 'top-right');

    map.on('load', () => {
      // Set projection if globe
      try {
        if (typeof map.setProjection === 'function') {
          map.setProjection({ type: isGlobe ? 'globe' : 'mercator' });
        }
      } catch (e) {
        // Fallback for projections
      }

      // Set 3D terrain if enabled
      if (isTerrain && map.getSource('terrain-dem')) {
        try {
          map.setTerrain({ source: 'terrain-dem', exaggeration: 1.5 });
        } catch (e) {
          console.warn('Terrain DEM setup:', e);
        }
      }
    });

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // 2. Handle Map Style Change
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    map.setStyle(MAP_STYLES[mapType].style);
    map.once('style.load', () => {
      try {
        if (typeof map.setProjection === 'function') {
          map.setProjection({ type: isGlobe ? 'globe' : 'mercator' });
        }
      } catch (e) {}

      if (isTerrain && map.getSource('terrain-dem')) {
        try {
          map.setTerrain({ source: 'terrain-dem', exaggeration: 1.5 });
        } catch (e) {}
      } else {
        try {
          map.setTerrain(null);
        } catch (e) {}
      }

      updateHeatmapLayer();
    });
  }, [mapType]);

  // 3. Handle Projection (Globe vs Mercator)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    try {
      if (typeof map.setProjection === 'function') {
        map.setProjection({ type: isGlobe ? 'globe' : 'mercator' });
      }
    } catch (e) {}
  }, [isGlobe]);

  // 4. Handle 3D Terrain
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    try {
      if (isTerrain && map.getSource('terrain-dem')) {
        map.setTerrain({ source: 'terrain-dem', exaggeration: 1.5 });
      } else {
        map.setTerrain(null);
      }
    } catch (e) {}
  }, [isTerrain]);

  // 5. Handle 3D Tilt Pitch
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    map.easeTo({
      pitch: is3D ? 55 : 0,
      duration: 800
    });
  }, [is3D]);

  // Helper to reliably compute device coordinates with parent site anchoring fallback
  const getDeviceCoordinates = (dev) => {
    let lat = parseFloat(dev.latitude);
    let lng = parseFloat(dev.longitude);

    if (isNaN(lat) || isNaN(lng)) {
      const parentSite = sites.find(s => s.id === dev.siteId || s.siteId === dev.siteId);
      const hash = (dev.id || dev.name || 'dev').split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const angle = ((hash % 12) / 12) * 2 * Math.PI;
      const dist = 0.0015 + ((hash % 5) * 0.0004);
      if (parentSite && parentSite.latitude && parentSite.longitude) {
        lat = parseFloat(parentSite.latitude) + Math.cos(angle) * dist;
        lng = parseFloat(parentSite.longitude) + Math.sin(angle) * dist;
      } else {
        lat = 22.5726 + Math.cos(angle) * 0.003;
        lng = 88.3639 + Math.sin(angle) * 0.003;
      }
    }
    return [lng, lat];
  };

  // 6. Filter Sites and Devices
  const filteredSites = useMemo(() => {
    return sites.filter(s => {
      if (selectedSiteId !== 'ALL' && s.id !== selectedSiteId && s.siteId !== selectedSiteId) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return s.name?.toLowerCase().includes(q) || (s.siteId || s.id)?.toLowerCase().includes(q);
      }
      return true;
    });
  }, [sites, selectedSiteId, searchQuery]);

  const filteredDevices = useMemo(() => {
    return devices.filter(dev => {
      if (selectedSiteId !== 'ALL' && dev.siteId !== selectedSiteId) return false;
      if (statusFilter !== 'ALL' && dev.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          dev.name?.toLowerCase().includes(q) ||
          dev.id?.toLowerCase().includes(q) ||
          dev.siteId?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [devices, selectedSiteId, statusFilter, searchQuery]);

  // 7. Update Heatmap Layer
  const updateHeatmapLayer = () => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (!map.isStyleLoaded()) {
      map.once('styledata', () => updateHeatmapLayer());
      return;
    }

    if (!showHeatmap) {
      if (map.getLayer('inclinometer-heat')) map.removeLayer('inclinometer-heat');
      if (map.getSource('device-heatmap-source')) map.removeSource('device-heatmap-source');
      return;
    }

    const targetDevices = filteredDevices && filteredDevices.length > 0 ? filteredDevices : devices;
    const features = targetDevices
      .map(d => {
        const [lng, lat] = getDeviceCoordinates(d);
        if (isNaN(lat) || isNaN(lng)) return null;
        const disp = parseFloat(
          d.totalDisplacement !== undefined
            ? d.totalDisplacement
            : (d.displacement?.totalDisplacement_mm || 0.25)
        );
        return {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [lng, lat]
          },
          properties: {
            id: d.id,
            displacement: disp
          }
        };
      })
      .filter(Boolean);

    const geojson = {
      type: 'FeatureCollection',
      features
    };

    if (!map.getSource('device-heatmap-source')) {
      map.addSource('device-heatmap-source', {
        type: 'geojson',
        data: geojson
      });
    } else {
      map.getSource('device-heatmap-source').setData(geojson);
    }

    if (!map.getLayer('inclinometer-heat')) {
      map.addLayer({
        id: 'inclinometer-heat',
        type: 'heatmap',
        source: 'device-heatmap-source',
        maxzoom: 24,
        paint: {
          'heatmap-weight': [
            'interpolate',
            ['linear'],
            ['get', 'displacement'],
            0, 0.5,
            2, 0.9,
            8, 1.8,
            20, 3.5
          ],
          'heatmap-intensity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            0, 1.0,
            9, 1.8,
            14, 3.2,
            18, 5.0
          ],
          'heatmap-color': [
            'interpolate',
            ['linear'],
            ['heatmap-density'],
            0, 'rgba(0, 0, 0, 0)',
            0.1, 'rgba(34, 197, 94, 0.5)',
            0.3, 'rgba(34, 197, 94, 0.85)',
            0.5, 'rgba(234, 179, 8, 0.9)',
            0.75, 'rgba(249, 115, 22, 0.95)',
            1, 'rgba(239, 68, 68, 1)'
          ],
          'heatmap-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            0, 10,
            9, 22,
            14, 45,
            17, 75,
            20, 115
          ],
          'heatmap-opacity': 0.85
        }
      });
    }
  };

  useEffect(() => {
    updateHeatmapLayer();
  }, [showHeatmap, devices, filteredDevices, sites, selectedSiteId]);

  // 8. Render Site & Device Markers
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Render React Lucide Icon components to SVGs for MapLibre HTML Markers & Popups
    const cameraIconSvg = renderToString(<Camera style={{ width: 10, height: 10, color: '#ffffff', display: 'inline-block' }} />);
    const maximizeIconSvg = renderToString(<Maximize2 style={{ width: 9, height: 9, color: '#ffffff', display: 'inline-block' }} />);
    const noPhotoIconSvg = renderToString(<Camera style={{ width: 22, height: 22, color: '#94a3b8', display: 'inline-block' }} />);
    const chevronRightSvg = renderToString(<ChevronRight style={{ width: 12, height: 12, color: '#ffffff', display: 'inline-block' }} />);
    const mapPinSvg = renderToString(<MapPin style={{ width: 11, height: 11, color: '#ffffff', display: 'inline-block' }} />);

    // Clear previous markers
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    const bounds = new maplibregl.LngLatBounds();
    let hasCoords = false;

    // 1. Site Location Markers
    filteredSites.forEach(site => {
      const lat = parseFloat(site.latitude) || 22.5726;
      const lng = parseFloat(site.longitude) || 88.3639;

      if (!isNaN(lat) && !isNaN(lng)) {
        bounds.extend([lng, lat]);
        hasCoords = true;

        const siteDevices = devices.filter(d => d.siteId === site.id || d.siteId === site.siteId);

        const el = document.createElement('div');
        el.className = 'site-marker-wrapper select-none';
        el.style.width = 'fit-content';
        el.style.height = 'fit-content';
        el.style.cursor = 'pointer';
        el.innerHTML = `
          <div style="display: flex; flex-direction: column; align-items: center; pointer-events: auto;">
            <div style="background: #2563eb; color: white; padding: 4px 10px; border-radius: 12px; font-weight: 800; font-size: 11px; box-shadow: 0 4px 12px rgba(37,99,235,0.4); border: 2px solid #ffffff; display: flex; align-items: center; gap: 6px; white-space: nowrap;">
              ${mapPinSvg}
              <span>${site.name}</span>
              <span style="background: #1e40af; padding: 1px 6px; border-radius: 6px; font-size: 9px; font-family: monospace;">${siteDevices.length} Dev</span>
            </div>
            <div style="width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 8px solid #2563eb; margin-top: -1px;"></div>
          </div>
        `;

        el.addEventListener('click', () => {
          setSelectedSite(site);
          setSelectedSiteId(site.id || site.siteId);
          setSelectedDevice(null);
          map.flyTo({ center: [lng, lat], zoom: 15.5, pitch: is3D ? 50 : 0, duration: 1200 });
          if (onSelectSite) onSelectSite(site);
        });

        const marker = new maplibregl.Marker({
          element: el,
          anchor: 'bottom',
          pitchAlignment: 'viewport',
          rotationAlignment: 'viewport'
        })
          .setLngLat([lng, lat])
          .addTo(map);

        markersRef.current.push(marker);
      }
    });

    // 1b. Geotechnical Structure / Asset Markers
    structures.forEach(st => {
      const lat = parseFloat(st.latitude) || 22.5726;
      const lng = parseFloat(st.longitude) || 88.3639;

      if (!isNaN(lat) && !isNaN(lng)) {
        bounds.extend([lng, lat]);
        hasCoords = true;

        const stDevices = devices.filter(d => d.structureId === st.id || d.structureId === st.structureId);

        const el = document.createElement('div');
        el.className = 'structure-marker-wrapper select-none';
        el.style.width = 'fit-content';
        el.style.height = 'fit-content';
        el.style.cursor = 'pointer';
        el.innerHTML = `
          <div style="display: flex; flex-direction: column; align-items: center; pointer-events: auto;">
            <div style="background: #0f172a; color: white; padding: 4px 10px; border-radius: 12px; font-weight: 800; font-size: 11px; box-shadow: 0 4px 12px rgba(0,0,0,0.4); border: 2px solid #38bdf8; display: flex; align-items: center; gap: 6px; white-space: nowrap;">
              <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #38bdf8;"></span>
              <span>${st.name || st.structureId || st.id}</span>
              <span style="background: #1e293b; color: #7dd3fc; padding: 1px 6px; border-radius: 6px; font-size: 9px; font-family: monospace;">${stDevices.length} Dev</span>
            </div>
            <div style="width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 8px solid #0f172a; margin-top: -1px;"></div>
          </div>
        `;

        el.addEventListener('click', () => {
          map.flyTo({ center: [lng, lat], zoom: 16.5, pitch: is3D ? 50 : 0, duration: 1200 });
        });

        const marker = new maplibregl.Marker({
          element: el,
          anchor: 'bottom',
          pitchAlignment: 'viewport',
          rotationAlignment: 'viewport'
        })
          .setLngLat([lng, lat])
          .addTo(map);

        markersRef.current.push(marker);
      }
    });

    // 2. Hardware Device Markers with Fixed Sub-pixel Anchor
    filteredDevices.forEach(dev => {
      const [lng, lat] = getDeviceCoordinates(dev);
      if (isNaN(lat) || isNaN(lng)) return;

      bounds.extend([lng, lat]);
      hasCoords = true;

      const isOnline = (dev.status || 'ONLINE') === 'ONLINE';
      const devDisplacement = dev.totalDisplacement !== undefined
        ? dev.totalDisplacement
        : (dev.displacement?.totalDisplacement_mm || 0.18);
      const devTilt = dev.resultantTilt !== undefined
        ? dev.resultantTilt
        : (dev.tilt?.tilt || 0.22);
      const devImage = dev.imageUrl ? formatAssetUrl(dev.imageUrl) : null;

      // Custom Fixed Pin Marker
      const el = document.createElement('div');
      el.className = 'device-marker-wrapper select-none';
      el.style.width = 'fit-content';
      el.style.height = 'fit-content';
      el.style.cursor = 'pointer';
      el.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; pointer-events: auto;">
          <div style="background: ${isOnline ? '#0f172a' : '#78350f'}; color: #ffffff; padding: 3px 8px; border-radius: 10px; font-family: monospace; font-weight: 800; font-size: 10px; box-shadow: 0 4px 10px rgba(0,0,0,0.3); border: 1.5px solid ${isOnline ? '#34d399' : '#f59e0b'}; display: flex; align-items: center; gap: 5px; white-space: nowrap;">
            <span style="width: 6px; height: 6px; border-radius: 50%; background: ${isOnline ? '#34d399' : '#f59e0b'};"></span>
            <span>${dev.name || dev.id}</span>
            <span style="color: #67e8f9; font-weight: bold;">Δ ${Number(devDisplacement).toFixed(2)}mm</span>
            ${devImage ? `<span style="background: #9333ea; padding: 2px 4px; border-radius: 4px; display: inline-flex; align-items: center; justify-content: center; vertical-align: middle;">${cameraIconSvg}</span>` : ''}
          </div>
          <div style="width: 0; height: 0; border-left: 5px solid transparent; border-right: 5px solid transparent; border-top: 6px solid ${isOnline ? '#0f172a' : '#78350f'};"></div>
          <div style="width: 8px; height: 8px; border-radius: 50%; background: ${isOnline ? '#10b981' : '#f59e0b'}; border: 2px solid #ffffff; box-shadow: 0 1px 4px rgba(0,0,0,0.5); margin-top: -2px;"></div>
        </div>
      `;

      // Interactive Popup with Small Size Image Thumbnail
      const popupHtml = `
        <div style="font-family: system-ui, sans-serif; padding: 2px; min-width: 230px; max-width: 270px; color: #0f172a;">
          <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #f1f5f9; padding-bottom: 6px; margin-bottom: 8px;">
            <div>
              <div style="font-weight: 800; font-size: 13px; color: #0f172a;">${dev.name || dev.id}</div>
              <div style="font-family: monospace; font-size: 10px; color: #2563eb; font-weight: 700;">ID: ${dev.id}</div>
            </div>
            <span style="display: inline-block; padding: 2px 6px; border-radius: 9999px; font-size: 9px; font-weight: 800; background: ${isOnline ? '#ecfdf5' : '#fef3c7'}; color: ${isOnline ? '#047857' : '#b45309'}; border: 1px solid ${isOnline ? '#a7f3d0' : '#fde68a'};">
              ${dev.status || 'ONLINE'}
            </span>
          </div>

          <!-- Small Size Device Photo with Click-to-Preview -->
          <div style="margin-bottom: 8px;">
            ${devImage ? `
              <div 
                onclick="window.__openDeviceImagePreview('${dev.id}')"
                style="position: relative; width: 100%; height: 110px; border-radius: 10px; overflow: hidden; border: 1.5px solid #e2e8f0; cursor: pointer; background: #0f172a;"
                title="Click to preview full-size image"
              >
                <img 
                  src="${devImage}" 
                  alt="${dev.name || dev.id}" 
                  style="width: 100%; height: 100%; object-fit: cover; transition: transform 0.25s;"
                  onmouseover="this.style.transform='scale(1.06)'"
                  onmouseout="this.style.transform='scale(1)'"
                />
                <div style="position: absolute; bottom: 0; left: 0; right: 0; background: linear-gradient(to top, rgba(0,0,0,0.8), transparent); padding: 4px 8px; display: flex; align-items: center; justify-content: space-between; color: white;">
                  <span style="font-size: 9px; font-weight: 700;">Installed Hardware</span>
                  <span style="font-size: 8px; background: rgba(0,0,0,0.5); padding: 2px 6px; border-radius: 4px; font-family: monospace; display: inline-flex; align-items: center; gap: 4px;">
                    ${maximizeIconSvg}
                    <span>Click to enlarge</span>
                  </span>
                </div>
              </div>
            ` : `
              <div style="width: 100%; height: 75px; border-radius: 10px; border: 1px dashed #cbd5e1; background: #f8fafc; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; color: #94a3b8; padding: 6px;">
                <div style="margin-bottom: 2px; display: flex; align-items: center; justify-content: center;">${noPhotoIconSvg}</div>
                <span style="font-size: 10px; font-weight: 600; color: #64748b;">No photo uploaded</span>
              </div>
            `}
          </div>

          <!-- Telemetry Quick Badges -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 5px; margin-bottom: 8px; text-align: center;">
            <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 4px 6px; border-radius: 8px;">
              <div style="font-size: 9px; font-weight: 700; color: #166534;">DISPLACEMENT</div>
              <div style="font-family: monospace; font-size: 11px; font-weight: 800; color: #15803d;">Δ ${Number(devDisplacement).toFixed(2)} mm</div>
            </div>
            <div style="background: #faf5ff; border: 1px solid #e9d5ff; padding: 4px 6px; border-radius: 8px;">
              <div style="font-size: 9px; font-weight: 700; color: #7e22ce;">RESULTANT TILT</div>
              <div style="font-family: monospace; font-size: 11px; font-weight: 800; color: #6b21a8;">${Number(devTilt).toFixed(1)}°</div>
            </div>
          </div>

          <!-- Button to navigate to Device Dashboard -->
          <a 
            href="#/devices/${dev.id}" 
            style="display: flex; align-items: center; justify-content: center; gap: 4px; width: 100%; text-align: center; background: #2563eb; color: #ffffff; padding: 5px 0; border-radius: 8px; font-weight: 700; font-size: 10.5px; text-decoration: none; box-shadow: 0 2px 4px rgba(37,99,235,0.25);"
          >
            <span>Open Device Console</span>
            ${chevronRightSvg}
          </a>
        </div>
      `;

      const popup = new maplibregl.Popup({
        offset: [0, -36],
        closeButton: true,
        closeOnClick: false,
        maxWidth: '280px'
      }).setHTML(popupHtml);

      el.addEventListener('click', () => {
        setSelectedDevice(dev);
        map.flyTo({ center: [lng, lat], zoom: 16.5, pitch: is3D ? 55 : 0, duration: 1000 });
      });

      const marker = new maplibregl.Marker({
        element: el,
        anchor: 'bottom',
        pitchAlignment: 'viewport',
        rotationAlignment: 'viewport'
      })
        .setLngLat([lng, lat])
        .setPopup(popup)
        .addTo(map);

      markersRef.current.push(marker);
    });

    // Fit map bounds only once on initial mount
    if (hasCoords && bounds && !initialBoundsFittedRef.current) {
      try {
        map.fitBounds(bounds, {
          padding: { top: 60, bottom: 60, left: 340, right: 340 },
          maxZoom: 15.5
        });
        initialBoundsFittedRef.current = true;
      } catch (e) {}
    }
  }, [filteredSites, filteredDevices, structures]);

  // Handle Site Selection
  const handleSiteSelect = (siteId) => {
    setSelectedSiteId(siteId);
    const map = mapInstanceRef.current;
    if (!map) return;

    if (siteId === 'ALL') {
      setSelectedSite(null);
      if (sites.length > 0) {
        const bounds = new maplibregl.LngLatBounds();
        sites.forEach(s => {
          if (s.longitude && s.latitude) bounds.extend([parseFloat(s.longitude), parseFloat(s.latitude)]);
        });
        map.fitBounds(bounds, { padding: 80, maxZoom: 14.5 });
      }
    } else {
      const site = sites.find(s => s.id === siteId || s.siteId === siteId);
      if (site) {
        setSelectedSite(site);
        setSelectedDevice(null);
        const lat = parseFloat(site.latitude) || 22.5726;
        const lng = parseFloat(site.longitude) || 88.3639;
        map.flyTo({ center: [lng, lat], zoom: 15.5, pitch: is3D ? 55 : 0, duration: 1500 });
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
    <div className="flex flex-col h-[calc(100vh-210px)] min-h-[640px] rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs relative">
      {/* Top Controls Bar */}
      <div className="p-3 border-b border-slate-200 bg-slate-50/90 backdrop-blur-md flex flex-wrap items-center justify-between gap-2.5 text-xs z-10">
        {/* Left: Search & Site dropdown */}
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
          <div className="relative flex-1 min-w-[170px] max-w-[260px]">
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
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Right: MapLibre 3D & Layer Controls (Satellite, Street, Topo, 3D Globe, Terrain, Heatmap) */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Layer Switcher */}
          <div className="flex items-center bg-white border border-slate-200 rounded-xl p-0.5 shadow-2xs">
            {Object.entries(MAP_STYLES).map(([key, styleObj]) => (
              <button
                key={key}
                onClick={() => setMapType(key)}
                className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer ${
                  mapType === key ? 'bg-blue-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {styleObj.name}
              </button>
            ))}
          </div>

          {/* 3D Tilt Pitch Toggle */}
          <button
            onClick={() => setIs3D(!is3D)}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl border font-bold text-[11px] shadow-2xs transition-all cursor-pointer ${
              is3D
                ? 'bg-blue-50 text-blue-700 border-blue-300'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
            title="Toggle 3D Oblique Perspective (55° Pitch)"
          >
            <Compass className="w-3.5 h-3.5 text-blue-600" />
            <span>{is3D ? '3D View (55°)' : '2D (Top Down)'}</span>
          </button>

          {/* Interactive 3D Globe Toggle */}
          <button
            onClick={() => setIsGlobe(!isGlobe)}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl border font-bold text-[11px] shadow-2xs transition-all cursor-pointer ${
              isGlobe
                ? 'bg-purple-50 text-purple-700 border-purple-300'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
            title="Toggle 3D Earth Globe Projection"
          >
            <Globe className="w-3.5 h-3.5 text-purple-600" />
            <span>{isGlobe ? '3D Globe' : 'Mercator'}</span>
          </button>

          {/* 3D Terrain DEM Toggle */}
          <button
            onClick={() => setIsTerrain(!isTerrain)}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl border font-bold text-[11px] shadow-2xs transition-all cursor-pointer ${
              isTerrain
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
            title="Toggle 3D Elevation Terrain Mesh"
          >
            <Mountain className="w-3.5 h-3.5 text-emerald-600" />
            <span>Terrain {isTerrain ? 'ON' : 'OFF'}</span>
          </button>

          {/* Displacement Heatmap Toggle */}
          <button
            onClick={() => setShowHeatmap(!showHeatmap)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border font-bold text-[11px] shadow-2xs transition-all cursor-pointer ${
              showHeatmap
                ? 'bg-orange-600 text-white border-orange-600 shadow-xs ring-2 ring-orange-300'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
            title="Toggle Inclinometer Ground Movement Heatmap"
          >
            <Flame className={`w-3.5 h-3.5 ${showHeatmap ? 'text-white' : 'text-orange-600'}`} />
            <span>Heatmap</span>
          </button>

          {/* Toggle Analytics Sidebar */}
          <button
            onClick={() => setShowAnalyticsPanel(!showAnalyticsPanel)}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl border font-bold text-[11px] shadow-2xs transition-all cursor-pointer ${
              showAnalyticsPanel
                ? 'bg-slate-800 text-white border-slate-800'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>{showAnalyticsPanel ? 'Hide Panel' : 'Analytics'}</span>
          </button>
        </div>
      </div>

      {/* Main MapLibre 3D Canvas */}
      <div className="flex-1 relative flex overflow-hidden w-full h-full">
        <div ref={mapContainerRef} className="w-full h-full relative z-0" />

        {/* Displacement Heatmap Legend */}
        {showHeatmap && (
          <div className="absolute bottom-4 left-4 z-10 bg-slate-900/90 text-white backdrop-blur-md px-3.5 py-2 rounded-xl border border-slate-700 shadow-xl flex items-center gap-3 text-xs animate-fadeIn pointer-events-auto">
            <div className="flex items-center gap-1.5 font-bold">
              <Flame className="w-4 h-4 text-orange-400 animate-pulse" />
              <span>Ground Displacement Heatmap:</span>
            </div>
            <div className="flex items-center gap-2.5 text-[11px] font-mono">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span> Stable (&lt;2mm)</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-yellow-400"></span> Warning (2-8mm)</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500"></span> Critical (&gt;8mm)</span>
            </div>
          </div>
        )}

        {/* Left Floating Location Analytics Cards */}
        {showAnalyticsPanel && (
          <div className="absolute left-3 top-3 bottom-3 w-80 max-w-[90%] bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200 shadow-2xl p-4 flex flex-col justify-between z-10 animate-fadeIn overflow-y-auto">
            <div>
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                    <BarChart3 className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      MAPLIBRE 3D ANALYTICS
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
                  <X className="w-4 h-4" />
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

                <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                  {activeLocationDevices.length === 0 ? (
                    <div className="text-center py-4 text-slate-400 text-[11px]">
                      No devices deployed in this location.
                    </div>
                  ) : (
                    activeLocationDevices.map(d => {
                      const isOnline = (d.status || 'ONLINE') === 'ONLINE';
                      const disp = Number(d.totalDisplacement || d.displacement?.totalDisplacement_mm || 0.18);
                      const hasPhoto = Boolean(d.imageUrl);

                      return (
                        <div
                          key={d.id}
                          onClick={() => {
                            setSelectedDevice(d);
                            if (mapInstanceRef.current && d.latitude && d.longitude) {
                              mapInstanceRef.current.flyTo({
                                center: [parseFloat(d.longitude), parseFloat(d.latitude)],
                                zoom: 16.5,
                                pitch: 55,
                                duration: 1000
                              });
                            }
                          }}
                          className={`p-2 rounded-xl border transition-colors flex items-center justify-between cursor-pointer ${
                            selectedDevice?.id === d.id ? 'bg-blue-50 border-blue-300' : 'bg-white border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <div className="min-w-0 flex items-center gap-2">
                            {hasPhoto && (
                              <div className="w-7 h-7 rounded-lg overflow-hidden border border-slate-200 bg-slate-100 flex-shrink-0">
                                <img
                                  src={formatAssetUrl(d.imageUrl)}
                                  alt={d.name || d.id}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="font-bold text-slate-900 truncate text-xs">{d.name || d.id}</div>
                              <div className="text-[10px] font-mono text-slate-500 flex items-center gap-2">
                                <span>{d.id}</span>
                                <span className="text-blue-600 font-bold">Δ {disp.toFixed(2)}mm</span>
                              </div>
                            </div>
                          </div>
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isOnline ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Bottom Info */}
            <div className="pt-3 border-t border-slate-100">
              <div className="text-[10px] text-slate-400 text-center font-mono">
                Click any device above to focus in 3D & inspect telemetry
              </div>
            </div>
          </div>
        )}

        {/* Right Floating Device Inspector Drawer */}
        {selectedDevice && (
          <div className="absolute right-3 top-3 bottom-3 w-84 max-w-[90%] bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200 shadow-2xl p-4 flex flex-col justify-between z-10 animate-fadeIn">
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
                    <div className="font-bold text-slate-900 text-sm truncate max-w-[190px]">
                      {selectedDevice.name || selectedDevice.id}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedDevice(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Small Size Image Show with Click to Preview Image */}
              <div className="mb-3">
                <div className="text-[11px] font-bold text-slate-700 mb-1 flex items-center justify-between">
                  <span>Installation Photo:</span>
                  {selectedDevice.imageUrl && (
                    <button
                      onClick={() => setPreviewImageModal({
                        open: true,
                        url: formatAssetUrl(selectedDevice.imageUrl),
                        device: selectedDevice
                      })}
                      className="text-[10px] font-bold text-blue-600 hover:underline cursor-pointer flex items-center gap-0.5"
                    >
                      <Maximize2 className="w-3 h-3" />
                      <span>Preview Image</span>
                    </button>
                  )}
                </div>

                {selectedDevice.imageUrl ? (
                  <div
                    onClick={() => setPreviewImageModal({
                      open: true,
                      url: formatAssetUrl(selectedDevice.imageUrl),
                      device: selectedDevice
                    })}
                    className="relative w-full h-32 rounded-xl overflow-hidden border border-slate-200 bg-slate-900 cursor-pointer group shadow-xs"
                    title="Click to view full preview"
                  >
                    <img
                      src={formatAssetUrl(selectedDevice.imageUrl)}
                      alt={selectedDevice.name || selectedDevice.id}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex items-end justify-between p-2.5 text-white">
                      <div>
                        <div className="text-xs font-bold leading-tight">{selectedDevice.name || selectedDevice.id}</div>
                        <div className="text-[10px] text-slate-300 font-mono">Hardware Photo</div>
                      </div>
                      <span className="p-1.5 rounded-lg bg-black/60 text-white group-hover:bg-blue-600 transition-colors shadow-sm">
                        <Maximize2 className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="w-full h-24 rounded-xl border border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center p-3 text-center">
                    <Camera className="w-6 h-6 text-slate-300 mb-1" />
                    <span className="text-[11px] font-bold text-slate-600">No Photo Uploaded</span>
                    <span className="text-[10px] text-slate-400">Upload in Edit Device Node modal</span>
                  </div>
                )}
              </div>

              {/* Metadata Details */}
              <div className="space-y-2 text-xs text-slate-700">
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 space-y-1.5 font-mono text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-sans">Device ID:</span>
                    <span className="font-bold text-slate-900">{selectedDevice.id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-sans">Location Site:</span>
                    <span className="font-bold text-slate-900">
                      {sites.find(s => s.id === selectedDevice.siteId || s.siteId === selectedDevice.siteId)?.name || 'Standalone'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-sans">Operational Status:</span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                      {selectedDevice.status || 'ONLINE'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-100">
                    <div className="text-[10px] text-blue-600 font-bold uppercase">Displacement</div>
                    <div className="text-base font-bold text-blue-900 font-mono mt-0.5">
                      {Number(selectedDevice.totalDisplacement || 0.18).toFixed(2)} mm
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-purple-50 border border-purple-100">
                    <div className="text-[10px] text-purple-600 font-bold uppercase">Resultant Tilt</div>
                    <div className="text-base font-bold text-purple-900 font-mono mt-0.5">
                      {Number(selectedDevice.resultantTilt || 0.22).toFixed(1)}°
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100 font-mono text-[11px]">
                  <div className="flex items-center gap-1.5 font-bold text-emerald-600">
                    <Battery className="w-4 h-4" />
                    <span>{formatBatteryPercentage(selectedDevice.battery ?? selectedDevice.batteryVoltage)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 font-bold text-blue-600">
                    <Signal className="w-4 h-4" />
                    <span>{formatCSQPercentage(selectedDevice.signal ?? selectedDevice.signalStrength)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100">
              <button
                onClick={() => navigate(`/devices/${selectedDevice.id}`)}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open Device Live Dashboard</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Fullscreen Image Preview Lightbox Modal */}
      {previewImageModal.open && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fadeIn"
          onClick={() => setPreviewImageModal({ open: false, url: null, device: null })}
        >
          <div
            className="relative max-w-4xl w-full max-h-[92vh] bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-950/80 text-white">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center">
                  <Camera className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-sm text-white">
                    {previewImageModal.device?.name || previewImageModal.device?.id || 'Hardware Device Photo'}
                  </div>
                  <div className="text-[11px] font-mono text-slate-400">
                    ID: {previewImageModal.device?.id} &bull; Installation Photo Preview
                  </div>
                </div>
              </div>
              <button
                onClick={() => setPreviewImageModal({ open: false, url: null, device: null })}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body: Large Image */}
            <div className="flex-1 min-h-[320px] max-h-[72vh] flex items-center justify-center p-4 bg-black/70 overflow-hidden">
              <img
                src={previewImageModal.url}
                alt={previewImageModal.device?.name || 'Device Photo'}
                className="max-w-full max-h-[70vh] object-contain rounded-xl shadow-2xl"
              />
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between text-xs text-slate-300">
              <div className="flex items-center gap-3 font-mono">
                <span>Location: <strong className="text-white">{sites.find(s => s.id === previewImageModal.device?.siteId || s.siteId === previewImageModal.device?.siteId)?.name || 'Standalone'}</strong></span>
                <span>Status: <strong className="text-emerald-400">{previewImageModal.device?.status || 'ONLINE'}</strong></span>
              </div>
              <button
                onClick={() => {
                  setPreviewImageModal({ open: false, url: null, device: null });
                  navigate(`/devices/${previewImageModal.device?.id}`);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition-colors cursor-pointer"
              >
                <span>Go to Device Dashboard</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
