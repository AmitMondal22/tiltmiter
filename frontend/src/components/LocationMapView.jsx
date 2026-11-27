import React, { useEffect, useRef, useState, useMemo } from 'react';
import { renderToString } from 'react-dom/server';
import { useNavigate } from 'react-router-dom';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  MapPin, Cpu, Radio, Battery, Signal, Layers, Search, Filter,
  Navigation, ExternalLink, ChevronLeft, ChevronRight, Activity, ShieldCheck,
  BarChart3, Zap, TrendingUp, AlertTriangle, CheckCircle2, Box,
  Map as MapIcon, Globe, Mountain, Flame, Eye, Maximize2, Camera,
  X, RotateCcw, Compass, Home, Plus, Minus
} from 'lucide-react';
import { formatBatteryPercentage, formatCSQPercentage } from '../utils/telemetryHelper';
import { formatAssetUrl, getDeviceTelemetry, getAlertRules } from '../api/apiClient';
import { getSiteStructures, getSiteDevices, isDeviceInSite } from '../utils/siteHelper';
import { formatHHMM, formatFullDateTime } from '../utils/dateHelper';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import UnifiedTelemetryChart from './UnifiedTelemetryChart';

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
  alarms = [],
  initialSelectedSiteId = 'ALL',
  onSelectSite,
  enableDeviceDrag = false,
  dragActive = undefined,
  onDragActiveChange = null,
  onSaveAllDeviceLocations = null,
  editingDevice = null,
  onClearEditingDevice = null,
  pointOnlyMarkers = true,
  controlsInsideMap = true,
  fullHeight = false,
}) {
  const navigate = useNavigate();
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const popupRef = useRef(null);
  const initialBoundsFittedRef = useRef(false);
  const lastFittedKeyRef = useRef('');

  // States
  const [selectedSiteId, setSelectedSiteId] = useState(initialSelectedSiteId || 'ALL');
  const [statusFilter, setStatusFilter] = useState('ALL'); // ALL, ALERT, NORMAL
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [mapType, setMapType] = useState('satellite'); // 'satellite', 'google', 'street', 'topo', 'hillshade', 'analytics'
  const [is3D, setIs3D] = useState(false); // 2D Top-Down default (0deg), toggleable to 3D Pitch (55deg)
  const [isGlobe, setIsGlobe] = useState(false); // 3D Globe vs Mercator projection
  const [isTerrain, setIsTerrain] = useState(true); // 3D Terrain elevation mesh
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [hoverCoords, setHoverCoords] = useState(null);
  const [showStyleMenu, setShowStyleMenu] = useState(false);
  const [showAlertLayerPanel, setShowAlertLayerPanel] = useState(false);
  const [alertSeverityFilter, setAlertSeverityFilter] = useState('ALL');
  const mapWrapperRef = useRef(null);
  const deviceMarkerMapRef = useRef(new Map());
  const pendingFocusDeviceIdRef = useRef(null); // Inclinometer displacement heatmap
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [inspectorExpanded, setInspectorExpanded] = useState(false);
  const [inspectorRawHistory, setInspectorRawHistory] = useState([]);
  const [inspectorChartData, setInspectorChartData] = useState([]);
  const [inspectorChartLoading, setInspectorChartLoading] = useState(false);
  const [alertRulesList, setAlertRulesList] = useState([]);

  useEffect(() => {
    if (!selectedDevice || alertRulesList.length > 0) return;
    getAlertRules()
      .then((res) => {
        const list = res?.rules || (Array.isArray(res) ? res : []);
        setAlertRulesList(list);
      })
      .catch(() => {});
  }, [selectedDevice]);

  // Fetch last 24h Tilt X / Y telemetry whenever a device is selected in the Sensor Node Inspector
  useEffect(() => {
    const devId = selectedDevice?.id || selectedDevice?.deviceId;
    if (!devId) {
      setInspectorChartData([]);
      setInspectorRawHistory([]);
      return;
    }
    let cancelled = false;
    setInspectorChartLoading(true);
    getDeviceTelemetry(devId, null, null, '24h')
      .then((res) => {
        if (cancelled) return;
        const rows = res?.telemetry || res?.data || res?.history || (Array.isArray(res) ? res : []);
        setInspectorRawHistory(rows);
        const parseNum = (v) => {
          if (v === null || v === undefined || v === '' || v === '--') return null;
          const n = typeof v === 'number' ? v : parseFloat(v);
          return !isNaN(n) ? Number(n.toFixed(2)) : null;
        };
        const formatted = rows
          .map((pt) => {
            const ts = pt.timestamp || pt.time || pt.createdAt;
            const xVal = parseNum(pt.tilt?.roll ?? pt.roll ?? pt.presentX ?? pt.xTilt ?? pt.deltaX);
            const yVal = parseNum(pt.tilt?.pitch ?? pt.pitch ?? pt.presentY ?? pt.yTilt ?? pt.deltaY);
            if (xVal === null && yVal === null) return null;
            return {
              timeLabel: ts ? formatHHMM(ts) : '--',
              fullTime: ts ? formatFullDateTime(ts) : '--',
              xTilt: xVal,
              yTilt: yVal,
            };
          })
          .filter(Boolean);
        setInspectorChartData(formatted);
      })
      .catch(() => {
        if (!cancelled) {
          setInspectorChartData([]);
          setInspectorRawHistory([]);
        }
      })
      .finally(() => {
        if (!cancelled) setInspectorChartLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedDevice?.id, selectedDevice?.deviceId]);
  const [selectedSite, setSelectedSite] = useState(null);
  const [showAnalyticsPanel, setShowAnalyticsPanel] = useState(false);
  const [internalDragMode, setInternalDragMode] = useState(false);
  const [selectedDragDevice, setSelectedDragDevice] = useState(null);
  const dragMode = dragActive !== undefined ? Boolean(dragActive) : internalDragMode;
  const activeDragDevice = editingDevice || selectedDragDevice;
  const setDragMode = (nextVal) => {
    const resolved = typeof nextVal === 'function' ? nextVal(dragMode) : Boolean(nextVal);
    setInternalDragMode(resolved);
    if (onDragActiveChange) onDragActiveChange(resolved);
    if (!resolved) {
      setPendingMoves({});
      setSelectedDragDevice(null);
      if (onClearEditingDevice) onClearEditingDevice();
    }
  };
  const [pendingMoves, setPendingMoves] = useState({});
  const [savingMoves, setSavingMoves] = useState(false);

  // When parent activates editingDevice, focus the map on it and turn on dragMode
  useEffect(() => {
    if (!editingDevice) return;
    if (enableDeviceDrag) setDragMode(true);
    setSelectedDragDevice(editingDevice);
    setSelectedDevice(null);
    try {
      mapContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch {}
    const map = mapInstanceRef.current;
    if (map) {
      const [lng, lat] = getDeviceCoordinates(editingDevice);
      if (!isNaN(lat) && !isNaN(lng)) {
        map.flyTo({ center: [lng, lat], zoom: 17.5, pitch: is3D ? 45 : 0, duration: 750 });
      }
    }
  }, [editingDevice]);

  // Allow clicking directly on the map to move the active selected/editing device pin
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !enableDeviceDrag || !dragMode || !activeDragDevice) return;

    const handleMapClickToMove = (e) => {
      // Ignore clicks that originated on an existing marker DOM element
      if (e.originalEvent?.target?.closest?.('.maplibregl-marker')) return;
      const { lng, lat } = e.lngLat;
      const targetId = activeDragDevice.id || activeDragDevice.deviceId;
      setPendingMoves(prev => ({
        ...prev,
        [targetId]: {
          id: targetId,
          deviceId: targetId,
          latitude: parseFloat(lat.toFixed(6)),
          longitude: parseFloat(lng.toFixed(6)),
          device: activeDragDevice,
        },
      }));
    };

    map.on('click', handleMapClickToMove);
    return () => {
      map.off('click', handleMapClickToMove);
    };
  }, [enableDeviceDrag, dragMode, activeDragDevice]);

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

  
  // Helper to reliably compute site coordinates with attached device fallback
  const getSiteCoordinates = (site) => {
    let lat = parseFloat(site.latitude);
    let lng = parseFloat(site.longitude);

    const siteDevices = getSiteDevices(site, devices, structures);

    const validDevs = siteDevices.filter(d => {
      const dLat = parseFloat(d.latitude);
      const dLng = parseFloat(d.longitude);
      return !isNaN(dLat) && !isNaN(dLng) && dLat !== 0 && dLng !== 0;
    });

    const isDefaultCoords = (Math.abs(lat - 22.5726) < 0.001 && Math.abs(lng - 88.3639) < 0.001);

    if ((isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0 || isDefaultCoords) && validDevs.length > 0) {
      const avgLat = validDevs.reduce((sum, d) => sum + parseFloat(d.latitude), 0) / validDevs.length;
      const avgLng = validDevs.reduce((sum, d) => sum + parseFloat(d.longitude), 0) / validDevs.length;
      return [avgLng, avgLat];
    }

    if (isNaN(lat) || isNaN(lng)) {
      if (validDevs.length > 0) {
        return [parseFloat(validDevs[0].longitude), parseFloat(validDevs[0].latitude)];
      }
      lat = 26.7271;
      lng = 88.4315;
    }

    return [lng, lat];
  };

  // 1. Initialize MapLibre GL Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Center coordinates from sites or devices or default
    let centerLng = 88.4315;
    let centerLat = 26.7271;
    if (sites.length > 0) {
      const [sLng, sLat] = getSiteCoordinates(sites[0]);
      if (!isNaN(sLat) && !isNaN(sLng)) {
        centerLat = sLat;
        centerLng = sLng;
      }
    } else if (devices.length > 0) {
      const [dLng, dLat] = getDeviceCoordinates(devices[0]);
      if (!isNaN(dLat) && !isNaN(dLng)) {
        centerLat = dLat;
        centerLng = dLng;
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
    setHoverCoords({ lat: centerLat, lng: centerLng });

    const handleMouseMove = (e) => {
      if (e?.lngLat) {
        setHoverCoords({ lat: e.lngLat.lat, lng: e.lngLat.lng });
      }
    };
    map.on('mousemove', handleMouseMove);

    // Add default MapLibre navigation controls only when external top bar mode is active
    if (!controlsInsideMap) {
      const navControl = new maplibregl.NavigationControl({
        visualizePitch: true,
        showCompass: true,
        showZoom: true
      });
      map.addControl(navControl, 'top-right');

      const fullscreenControl = new maplibregl.FullscreenControl();
      map.addControl(fullscreenControl, 'top-right');
    }

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

  // Helper to reliably compute device coordinates with parent site / structure / standalone anchoring fallback
  const getDeviceCoordinates = (dev) => {
    const moved = pendingMoves[dev.id];
    if (moved) {
      return [moved.longitude, moved.latitude];
    }

    let lat = parseFloat(dev.latitude);
    let lng = parseFloat(dev.longitude);
    const hasValidCoords = !isNaN(lat) && !isNaN(lng) && !(Math.abs(lat) < 0.0001 && Math.abs(lng) < 0.0001);

    if (!hasValidCoords) {
      const parentSite = sites.find(s => s.id === dev.siteId || s.siteId === dev.siteId);
      const parentStruct = structures.find(st => String(st.id) === String(dev.structureId));
      const hash = (dev.id || dev.name || 'dev').split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const angle = ((hash % 12) / 12) * 2 * Math.PI;
      const dist = 0.0008 + ((hash % 5) * 0.00025);

      if (parentStruct && parentStruct.latitude && parentStruct.longitude) {
        lat = parseFloat(parentStruct.latitude) + Math.cos(angle) * dist;
        lng = parseFloat(parentStruct.longitude) + Math.sin(angle) * dist;
      } else if (parentSite && parentSite.latitude && parentSite.longitude) {
        lat = parseFloat(parentSite.latitude) + Math.cos(angle) * dist;
        lng = parseFloat(parentSite.longitude) + Math.sin(angle) * dist;
      } else {
        // Standalone device without GPS: anchor near first site or first GPS-enabled device or default
        const firstSite = sites.find(s => s.latitude && s.longitude);
        const firstDev = devices.find(d => {
          const dLat = parseFloat(d.latitude);
          const dLng = parseFloat(d.longitude);
          return !isNaN(dLat) && !isNaN(dLng) && !(Math.abs(dLat) < 0.0001 && Math.abs(dLng) < 0.0001);
        });
        const baseLat = firstSite ? parseFloat(firstSite.latitude) : (firstDev ? parseFloat(firstDev.latitude) : 26.7271);
        const baseLng = firstSite ? parseFloat(firstSite.longitude) : (firstDev ? parseFloat(firstDev.longitude) : 88.4315);
        lat = baseLat + Math.cos(angle) * 0.002;
        lng = baseLng + Math.sin(angle) * 0.002;
      }
    }
    return [lng, lat];
  };

  // 6. Filter Sites and Devices (Ignore standalone/unassigned devices on all maps)
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

  const isDeviceInAlert = () => false;

  const normalizeAlarmTier = (severity) => {
    const s = String(severity || '').toUpperCase();
    if (s === 'CRITICAL' || s === 'EMERGENCY') return 'CRITICAL';
    if (s === 'WARNING' || s === 'MAJOR') return 'WARNING';
    return 'INFO';
  };

  const filteredDevices = useMemo(() => {
    return devices.filter(dev => {
      // Do not show standalone / unassigned devices (must belong to a site or structural asset)
      if (!dev.siteId && !dev.structureId) return false;

      if (selectedSiteId !== 'ALL') {
        const targetSite = sites.find(s => String(s.id || s.siteId) === String(selectedSiteId)) || { id: selectedSiteId };
        if (!isDeviceInSite(dev, targetSite, structures)) return false;
      }
      if (statusFilter === 'ALERT' && !isDeviceInAlert(dev)) return false;
      if (statusFilter === 'NORMAL' && isDeviceInAlert(dev)) return false;
      if (statusFilter !== 'ALL' && statusFilter !== 'ALERT' && statusFilter !== 'NORMAL' && dev.status !== statusFilter) return false;
      if (alertSeverityFilter !== 'ALL') {
        const devIdStr = String(dev.id || dev.deviceId || '');
        const hasMatchingAlarm = Array.isArray(alarms) && alarms.some(a =>
          String(a.deviceId) === devIdStr &&
          String(a.status || 'ACTIVE').toUpperCase() === 'ACTIVE' &&
          normalizeAlarmTier(a.severity) === alertSeverityFilter
        );
        if (!hasMatchingAlarm) return false;
      }
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
  }, [devices, sites, structures, alarms, selectedSiteId, statusFilter, alertSeverityFilter, searchQuery]);

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
    const mapPinSvg = renderToString(<MapPin style={{ width: 13, height: 13, color: '#ffffff', display: 'inline-block' }} />);
    const layersIconSvg = renderToString(<Layers style={{ width: 13, height: 13, color: '#ffffff', display: 'inline-block' }} />);
    const tiltmeterIconSvg = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block;">
        <path d="M12 3a9 9 0 0 1 9 9" />
        <path d="M12 3a9 9 0 0 0-9 9" />
        <line x1="3" y1="12" x2="21" y2="12" />
        <line x1="12" y1="12" x2="17" y2="6" />
        <circle cx="12" cy="12" r="2" fill="#ffffff" />
        <line x1="12" y1="14" x2="12" y2="21" />
      </svg>
    `;

    // Clear previous markers
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];
    deviceMarkerMapRef.current.clear();

    const bounds = new maplibregl.LngLatBounds();
    let hasCoords = false;

    // 1. Site Location Markers
    filteredSites.forEach(site => {
      const [lng, lat] = getSiteCoordinates(site);

      if (!isNaN(lat) && !isNaN(lng)) {
        bounds.extend([lng, lat]);
        hasCoords = true;

        const siteDevices = getSiteDevices(site, devices, structures);

        const el = document.createElement('div');
        el.className = 'site-marker-wrapper select-none';
        el.style.width = 'fit-content';
        el.style.height = 'fit-content';
        el.style.cursor = 'pointer';
        el.title = `${site.name} (Location) - Click to show name`;

        if (pointOnlyMarkers) {
          el.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; pointer-events: auto;">
              <div style="width: 28px; height: 28px; border-radius: 8px; background: #2563eb; border: 2px solid #ffffff; box-shadow: 0 4px 12px rgba(37,99,235,0.45); display: flex; align-items: center; justify-content: center;">
                ${mapPinSvg}
              </div>
              <div style="width: 0; height: 0; border-left: 5px solid transparent; border-right: 5px solid transparent; border-top: 6px solid #2563eb; margin-top: -1px;"></div>
            </div>
          `;
        } else {
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
        }

        const sitePopupHtml = `
          <div style="font-family: system-ui, sans-serif; padding: 4px 6px; min-width: 170px; color: #0f172a;">
            <div style="font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: #2563eb; margin-bottom: 2px;">Location</div>
            <div style="font-weight: 800; font-size: 13px; color: #0f172a;">${site.name}</div>
            <div style="font-size: 11px; color: #64748b; margin-top: 2px;">${siteDevices.length} Assigned Device${siteDevices.length === 1 ? '' : 's'}</div>
          </div>
        `;
        const sitePopup = new maplibregl.Popup({
          offset: 26,
          closeButton: true,
          closeOnClick: true,
          maxWidth: '240px',
        }).setHTML(sitePopupHtml);

        el.addEventListener('click', () => {
          setSelectedSite(site);
          setSelectedDevice(null);
          if (!pointOnlyMarkers) {
            setSelectedSiteId(site.id || site.siteId);
            map.flyTo({ center: [lng, lat], zoom: 15.5, pitch: is3D ? 50 : 0, duration: 1200 });
          }
          if (onSelectSite) onSelectSite(site);
        });

        const marker = new maplibregl.Marker({
          element: el,
          anchor: 'bottom',
          pitchAlignment: 'viewport',
          rotationAlignment: 'viewport'
        })
          .setLngLat([lng, lat])
          .setPopup(sitePopup)
          .addTo(map);

        markersRef.current.push(marker);
      }
    });

    // 1b. Geotechnical Structure / Asset Markers
    const visibleStructures = selectedSiteId === 'ALL'
      ? structures
      : structures.filter(st =>
          String(st.siteId || '') === String(selectedSiteId) ||
          String(st.site?.id || '') === String(selectedSiteId) ||
          String(st.site?.siteId || '') === String(selectedSiteId)
        );

    visibleStructures.forEach(st => {
      let lat = parseFloat(st.latitude);
      let lng = parseFloat(st.longitude);
      if (isNaN(lat) || isNaN(lng)) {
        const parentSite = sites.find(s => String(s.id || s.siteId) === String(st.siteId));
        if (parentSite) {
          const [sLng, sLat] = getSiteCoordinates(parentSite);
          lng = sLng;
          lat = sLat;
        }
      }

      if (!isNaN(lat) && !isNaN(lng)) {
        bounds.extend([lng, lat]);
        hasCoords = true;

        const stDevices = devices.filter(d => d.structureId === st.id || d.structureId === st.structureId);
        const stName = st.name || st.structureId || st.id;

        const el = document.createElement('div');
        el.className = 'structure-marker-wrapper select-none';
        el.style.width = 'fit-content';
        el.style.height = 'fit-content';
        el.style.cursor = 'pointer';
        el.title = `${stName} (Structural Asset) - Click to show name`;

        if (pointOnlyMarkers) {
          el.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: center; width: 26px; height: 26px; pointer-events: auto;">
              <div style="width: 22px; height: 22px; transform: rotate(45deg); border-radius: 5px; background: #7c3aed; border: 2px solid #ffffff; box-shadow: 0 4px 12px rgba(124,58,237,0.45); display: flex; align-items: center; justify-content: center;">
                <div style="transform: rotate(-45deg); display: flex; align-items: center; justify-content: center;">
                  ${layersIconSvg}
                </div>
              </div>
            </div>
          `;
        } else {
          el.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; pointer-events: auto;">
              <div style="background: #0f172a; color: white; padding: 4px 10px; border-radius: 12px; font-weight: 800; font-size: 11px; box-shadow: 0 4px 12px rgba(0,0,0,0.4); border: 2px solid #38bdf8; display: flex; align-items: center; gap: 6px; white-space: nowrap;">
                ${layersIconSvg}
                <span>${stName}</span>
                <span style="background: #1e293b; color: #7dd3fc; padding: 1px 6px; border-radius: 6px; font-size: 9px; font-family: monospace;">${stDevices.length} Dev</span>
              </div>
              <div style="width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 8px solid #0f172a; margin-top: -1px;"></div>
            </div>
          `;
        }

        const stPopupHtml = `
          <div style="font-family: system-ui, sans-serif; padding: 4px 6px; min-width: 170px; color: #0f172a;">
            <div style="font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: #7c3aed; margin-bottom: 2px;">Structural Asset</div>
            <div style="font-weight: 800; font-size: 13px; color: #0f172a;">${stName}</div>
            ${st.type ? `<div style="font-size: 11px; color: #475569; margin-top: 1px;">Type: ${st.type}</div>` : ''}
            <div style="font-size: 11px; color: #64748b; margin-top: 2px;">${stDevices.length} Assigned Device${stDevices.length === 1 ? '' : 's'}</div>
          </div>
        `;
        const stPopup = new maplibregl.Popup({
          offset: 20,
          closeButton: true,
          closeOnClick: true,
          maxWidth: '240px',
        }).setHTML(stPopupHtml);

        el.addEventListener('click', () => {
          if (!pointOnlyMarkers) {
            map.flyTo({ center: [lng, lat], zoom: 16.5, pitch: is3D ? 50 : 0, duration: 1200 });
          }
        });

        const marker = new maplibregl.Marker({
          element: el,
          anchor: pointOnlyMarkers ? 'center' : 'bottom',
          pitchAlignment: 'viewport',
          rotationAlignment: 'viewport'
        })
          .setLngLat([lng, lat])
          .setPopup(stPopup)
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

      const isMoved = Boolean(pendingMoves[dev.id]);
      const isEditingTarget = activeDragDevice && String(activeDragDevice.id) === String(dev.id);
      const isAlertDev = isDeviceInAlert(dev);

      // Custom Fixed Pin Marker
      const el = document.createElement('div');
      el.className = 'device-marker-wrapper select-none';
      el.style.width = 'fit-content';
      el.style.height = 'fit-content';
      el.style.cursor = dragMode ? 'grab' : 'pointer';
      if (pointOnlyMarkers) {
        const badgeColor = isMoved ? '#2563eb' : (isEditingTarget ? '#4f46e5' : (isAlertDev ? '#ef4444' : '#059669'));
        const ringColor = isEditingTarget ? 'rgba(79, 70, 229, 0.30)' : (isAlertDev ? 'rgba(239, 68, 68, 0.30)' : 'rgba(16, 185, 129, 0.25)');
        el.title = `${dev.name || dev.id} (Tiltmeter - ${isAlertDev ? 'ALERT' : 'NORMAL'}) - Click for details`;
        el.innerHTML = `
          <div style="display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 9px; background: ${ringColor}; pointer-events: auto;">
            <div style="width: 22px; height: 22px; border-radius: 7px; background: ${badgeColor}; border: 2px solid #ffffff; box-shadow: 0 2px 8px rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center;">
              ${tiltmeterIconSvg}
            </div>
          </div>
        `;
      } else {
        el.innerHTML = `
          <div style="display: flex; flex-direction: column; align-items: center; pointer-events: auto;">
            <div style="background: ${isMoved ? '#1d4ed8' : (isEditingTarget ? '#4f46e5' : (isAlertDev ? '#991b1b' : (isOnline ? '#0f172a' : '#78350f')))}; color: #ffffff; padding: 3px 8px; border-radius: 10px; font-family: monospace; font-weight: 800; font-size: 10px; box-shadow: ${isEditingTarget ? '0 0 0 3px rgba(99,102,241,0.45), 0 4px 12px rgba(0,0,0,0.4)' : '0 4px 10px rgba(0,0,0,0.3)'}; border: ${isMoved || isEditingTarget ? '2px solid #93c5fd' : `1.5px solid ${isAlertDev ? '#f87171' : (isOnline ? '#34d399' : '#f59e0b')}`}; display: flex; align-items: center; gap: 5px; white-space: nowrap;">
              <span style="width: 6px; height: 6px; border-radius: 50%; background: ${isMoved || isEditingTarget ? '#93c5fd' : (isAlertDev ? '#f87171' : (isOnline ? '#34d399' : '#f59e0b'))};"></span>
              <span>${dev.name || dev.id}</span>
              <span style="color: #67e8f9; font-weight: bold;">Δ ${Number(devDisplacement).toFixed(2)}mm</span>
              ${dragMode ? `<span style="background: rgba(255,255,255,0.22); padding: 1px 4px; border-radius: 4px; font-size: 9px; color: #e0f2fe;" title="Drag pin to move">${isMoved ? 'MOVED' : (isEditingTarget ? 'EDITING' : '⇄')}</span>` : ''}
              ${devImage ? `<span style="background: #9333ea; padding: 2px 4px; border-radius: 4px; display: inline-flex; align-items: center; justify-content: center; vertical-align: middle;">${cameraIconSvg}</span>` : ''}
            </div>
            <div style="width: 0; height: 0; border-left: 5px solid transparent; border-right: 5px solid transparent; border-top: 6px solid ${isMoved ? '#1d4ed8' : (isEditingTarget ? '#4f46e5' : (isAlertDev ? '#991b1b' : (isOnline ? '#0f172a' : '#78350f')))};"></div>
            <div style="width: 9px; height: 9px; border-radius: 50%; background: ${isMoved || isEditingTarget ? '#3b82f6' : (isAlertDev ? '#ef4444' : (isOnline ? '#10b981' : '#f59e0b'))}; border: 2px solid #ffffff; box-shadow: 0 1px 4px rgba(0,0,0,0.5); margin-top: -2px;"></div>
          </div>
        `;
      }

      el.addEventListener('click', (e) => {
        e.stopPropagation();
        if (enableDeviceDrag && dragMode) {
          setSelectedDragDevice(dev);
          setSelectedDevice(null);
        } else {
          setSelectedDevice(dev);
          map.flyTo({ center: [lng, lat], zoom: 16.5, pitch: is3D ? 55 : 0, duration: 1000 });
        }
      });

      const marker = new maplibregl.Marker({
        element: el,
        anchor: pointOnlyMarkers ? 'center' : 'bottom',
        pitchAlignment: 'viewport',
        rotationAlignment: 'viewport',
        draggable: dragMode
      })
        .setLngLat([lng, lat])
        .addTo(map);

      if (dragMode) {
        marker.on('dragstart', () => {
          el.style.cursor = 'grabbing';
        });
        marker.on('dragend', () => {
          el.style.cursor = 'grab';
          const ll = marker.getLngLat();
          setSelectedDragDevice(dev);
          setPendingMoves(prev => ({
            ...prev,
            [dev.id]: {
              id: dev.id,
              deviceId: dev.id,
              latitude: parseFloat(ll.lat.toFixed(6)),
              longitude: parseFloat(ll.lng.toFixed(6)),
              device: dev,
            },
          }));
        });
      }

      markersRef.current.push(marker);
      deviceMarkerMapRef.current.set(String(dev.id || dev.deviceId), {
        marker,
        device: dev,
        lng,
        lat,
      });
    });

    // If an alert click requested focusing a device after filter reset, fly to it now
    if (pendingFocusDeviceIdRef.current) {
      const targetEntry = deviceMarkerMapRef.current.get(pendingFocusDeviceIdRef.current);
      pendingFocusDeviceIdRef.current = null;
      if (targetEntry) {
        map.flyTo({ center: [targetEntry.lng, targetEntry.lat], zoom: 17, pitch: is3D ? 55 : 0, duration: 900 });
      }
    }

    // Fit map bounds when sites/devices load or site filter changes
    const fitKey = `${sites.length}-${devices.length}-${structures.length}-${selectedSiteId}`;
    if (hasCoords && bounds && (!initialBoundsFittedRef.current || lastFittedKeyRef.current !== fitKey)) {
      try {
        map.fitBounds(bounds, {
          padding: { top: 60, bottom: 60, left: 100, right: 100 },
          maxZoom: 15.5
        });
        initialBoundsFittedRef.current = true;
        lastFittedKeyRef.current = fitKey;
      } catch (e) {}
    }
  }, [filteredSites, filteredDevices, structures, dragMode, pendingMoves, editingDevice, selectedDragDevice, pointOnlyMarkers]);

  // Handle Site Selection
  const handleSiteSelect = (siteId) => {
    setSelectedSiteId(siteId);
    const map = mapInstanceRef.current;
    if (!map) return;

    if (siteId === 'ALL') {
      setSelectedSite(null);
      if (sites.length > 0 || devices.length > 0) {
        const bounds = new maplibregl.LngLatBounds();
        sites.forEach(s => {
          const [sLng, sLat] = getSiteCoordinates(s);
          if (!isNaN(sLng) && !isNaN(sLat)) bounds.extend([sLng, sLat]);
        });
        devices.filter(d => Boolean(d.siteId || d.structureId)).forEach(d => {
          const [dLng, dLat] = getDeviceCoordinates(d);
          if (!isNaN(dLng) && !isNaN(dLat)) bounds.extend([dLng, dLat]);
        });
        if (!bounds.isEmpty()) {
          map.fitBounds(bounds, { padding: 80, maxZoom: 14.5 });
        }
      }
    } else {
      const site = sites.find(s => s.id === siteId || s.siteId === siteId || String(s.id) === String(siteId) || String(s.siteId) === String(siteId));
      if (site) {
        setSelectedSite(site);
        setSelectedDevice(null);
        const [lng, lat] = getSiteCoordinates(site);
        map.flyTo({ center: [lng, lat], zoom: 15.5, pitch: is3D ? 55 : 0, duration: 1500 });
      }
    }
  };

  // Location Analytics Calculations (exclude standalone unassigned devices)
  const activeLocationDevices = selectedSiteId === 'ALL'
    ? devices.filter(d => Boolean(d.siteId || d.structureId))
    : devices.filter(d => {
        if (!d.siteId && !d.structureId) return false;
        const targetSite = sites.find(s => String(s.id || s.siteId) === String(selectedSiteId)) || { id: selectedSiteId };
        return isDeviceInSite(d, targetSite, structures);
      });

  const locOnlineCount = activeLocationDevices.filter(d => (d.status || 'ONLINE') === 'ONLINE').length;
  const locOfflineCount = activeLocationDevices.length - locOnlineCount;

  const displacements = activeLocationDevices.map(d => Number(d.totalDisplacement || d.displacement?.totalDisplacement_mm || 0.18));
  const maxDisplacement = displacements.length > 0 ? Math.max(...displacements) : 0;
  const avgDisplacement = displacements.length > 0 ? (displacements.reduce((a, b) => a + b, 0) / displacements.length) : 0;

  const tilts = activeLocationDevices.map(d => Number(d.resultantTilt || d.tilt?.tilt || 0.22));
  const avgTilt = tilts.length > 0 ? (tilts.reduce((a, b) => a + b, 0) / tilts.length) : 0;

  const assignedDevices = devices.filter(d => Boolean(d.siteId || d.structureId));
  const alertDeviceCount = assignedDevices.filter(d => isDeviceInAlert(d)).length;
  const normalDeviceCount = assignedDevices.length - alertDeviceCount;

  const handleSearchSubmit = (e) => {
    if (e) e.preventDefault();
    const q = searchInput.trim();
    setSearchQuery(q);
    const map = mapInstanceRef.current;
    if (!map || !q) return;
    const ql = q.toLowerCase();
    const matchedDev = assignedDevices.find(
      d => d.name?.toLowerCase().includes(ql) || d.id?.toLowerCase().includes(ql)
    );
    if (matchedDev) {
      const [lng, lat] = getDeviceCoordinates(matchedDev);
      if (!isNaN(lat) && !isNaN(lng)) {
        map.flyTo({ center: [lng, lat], zoom: 16.5, pitch: is3D ? 55 : 0, duration: 900 });
        return;
      }
    }
    const matchedSite = sites.find(
      s => s.name?.toLowerCase().includes(ql) || (s.siteId || s.id)?.toLowerCase().includes(ql)
    );
    if (matchedSite) {
      const [lng, lat] = getSiteCoordinates(matchedSite);
      if (!isNaN(lat) && !isNaN(lng)) {
        map.flyTo({ center: [lng, lat], zoom: 15.5, pitch: is3D ? 55 : 0, duration: 900 });
      }
    }
  };

  const renderSearchAndDropdowns = (insideMap = false) => (
    <div className={`flex flex-wrap items-center ${insideMap ? 'gap-1 bg-slate-900/80 backdrop-blur-md p-1 rounded-xl border border-white/15 shadow-lg' : 'gap-2 flex-1 min-w-[280px]'}`}>
      {/* Search Input + Search Button */}
      <form onSubmit={handleSearchSubmit} className="flex items-center gap-1">
        <div className={`relative ${insideMap ? 'w-[115px] sm:w-[140px]' : 'min-w-[165px] max-w-[230px]'}`}>
          <Search className={`${insideMap ? 'w-3 h-3 left-2 text-slate-300' : 'w-3.5 h-3.5 left-2.5 text-slate-400'} absolute top-1/2 -translate-y-1/2`} />
          <input
            type="text"
            value={searchInput}
            onChange={e => {
              setSearchInput(e.target.value);
              if (!e.target.value.trim()) setSearchQuery('');
            }}
            placeholder="Search..."
            className={`w-full border font-medium focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs ${
              insideMap
                ? 'h-7 pl-6 pr-5 rounded-lg text-[11px] bg-slate-800/90 border-white/15 text-white placeholder-slate-400'
                : 'pl-8 pr-6 py-1.5 rounded-xl text-xs bg-white border-slate-200 text-slate-900'
            }`}
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => {
                setSearchInput('');
                setSearchQuery('');
              }}
              className={`absolute right-1.5 top-1/2 -translate-y-1/2 cursor-pointer ${insideMap ? 'text-slate-300 hover:text-white' : 'text-slate-400 hover:text-slate-700'}`}
              title="Clear search"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
        <button
          type="submit"
          className={`bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-2xs transition-colors cursor-pointer flex items-center justify-center gap-1 ${
            insideMap ? 'w-7 h-7 p-0 rounded-lg' : 'px-2.5 py-1.5 rounded-xl text-xs'
          }`}
          title="Search on map"
        >
          <Search className="w-3.5 h-3.5" />
          {!insideMap && <span>Search</span>}
        </button>
      </form>

      {/* Location / Site Dropdown */}
      <div className="flex items-center">
        <select
          value={selectedSiteId}
          onChange={e => handleSiteSelect(e.target.value)}
          className={`border font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs cursor-pointer ${
            insideMap
              ? 'h-7 px-1.5 rounded-lg text-[11px] max-w-[115px] bg-slate-800/90 border-white/15 text-white'
              : 'px-2.5 py-1.5 rounded-xl text-xs bg-white border-slate-200 text-slate-900'
          }`}
          title="Select Location"
        >
          <option value="ALL">All Locations ({sites.length})</option>
          {sites.map(s => (
            <option key={s.id || s.siteId} value={s.id || s.siteId}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {/* Alert / Normal / All Device Layer Dropdown */}
      <div className="flex items-center">
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className={`border font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs cursor-pointer ${
            insideMap ? 'h-7 px-1.5 rounded-lg text-[11px] max-w-[108px]' : 'px-2.5 py-1.5 rounded-xl text-xs'
          } ${
            statusFilter === 'ALERT'
              ? insideMap ? 'bg-rose-900/90 border-rose-400/50 text-rose-100' : 'bg-rose-50 border-rose-300 text-rose-800'
              : statusFilter === 'NORMAL'
              ? insideMap ? 'bg-emerald-900/90 border-emerald-400/50 text-emerald-100' : 'bg-emerald-50 border-emerald-300 text-emerald-800'
              : insideMap ? 'bg-slate-800/90 border-white/15 text-white' : 'bg-white border-slate-200 text-slate-900'
          }`}
          title="Filter Devices (All / Alert / Normal)"
        >
          <option value="ALL">Devices ({assignedDevices.length})</option>
          <option value="ALERT">Alert ({alertDeviceCount})</option>
          <option value="NORMAL">Normal ({normalDeviceCount})</option>
        </select>
      </div>
    </div>
  );

  const handleFitAllBounds = () => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const b = new maplibregl.LngLatBounds();
    let any = false;
    filteredSites.forEach(s => {
      const [lng, lat] = getSiteCoordinates(s);
      if (!isNaN(lat) && !isNaN(lng)) { b.extend([lng, lat]); any = true; }
    });
    filteredDevices.forEach(d => {
      const [lng, lat] = getDeviceCoordinates(d);
      if (!isNaN(lat) && !isNaN(lng)) { b.extend([lng, lat]); any = true; }
    });
    if (any) {
      map.fitBounds(b, { padding: { top: 60, bottom: 60, left: 100, right: 100 }, maxZoom: 15.5, duration: 800 });
    }
  };

  const handleToggleFullscreen = () => {
    const el = mapWrapperRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  // Active alerts grouped across the 3 severity tiers: CRITICAL, WARNING, INFO (frontend normal override)
  const activeAlarmsList = useMemo(() => [], []);

  const criticalAlarms = useMemo(
    () => activeAlarmsList.filter(a => normalizeAlarmTier(a.severity) === 'CRITICAL'),
    [activeAlarmsList]
  );
  const warningAlarms = useMemo(
    () => activeAlarmsList.filter(a => normalizeAlarmTier(a.severity) === 'WARNING'),
    [activeAlarmsList]
  );
  const infoAlarms = useMemo(
    () => activeAlarmsList.filter(a => normalizeAlarmTier(a.severity) === 'INFO'),
    [activeAlarmsList]
  );

  const visibleAlertPanelItems = useMemo(() => {
    if (alertSeverityFilter === 'CRITICAL') return criticalAlarms;
    if (alertSeverityFilter === 'WARNING') return warningAlarms;
    if (alertSeverityFilter === 'INFO') return infoAlarms;
    return activeAlarmsList;
  }, [alertSeverityFilter, activeAlarmsList, criticalAlarms, warningAlarms, infoAlarms]);

  const handleFocusAlertDevice = (alarm) => {
    const map = mapInstanceRef.current;
    if (!map || !alarm) return;
    const targetDevId = String(alarm.deviceId || '');
    const dev = devices.find(d => String(d.id || d.deviceId) === targetDevId);
    if (!dev) return;

    setSelectedDevice(dev);
    setShowAlertLayerPanel(false);

    const existingEntry = deviceMarkerMapRef.current.get(targetDevId);
    if (existingEntry) {
      map.flyTo({ center: [existingEntry.lng, existingEntry.lat], zoom: 17, pitch: is3D ? 55 : 0, duration: 900 });
      return;
    }

    // If the device is currently filtered out (e.g. NORMAL filter or another site), make it visible and fly to it after re-render
    pendingFocusDeviceIdRef.current = targetDevId;
    if (statusFilter === 'NORMAL') setStatusFilter('ALL');
    if (selectedSiteId !== 'ALL') setSelectedSiteId('ALL');
  };

  return (
    <div
      ref={mapWrapperRef}
      className={`flex flex-col ${fullHeight ? 'h-[calc(100vh-88px)] min-h-[640px]' : 'h-[calc(100vh-200px)] min-h-[580px]'} rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs relative`}
    >
      {/* Top Controls Bar (shown only when controlsInsideMap is false) */}
      {!controlsInsideMap && (
      <div className="p-3 border-b border-slate-200 bg-slate-50/90 backdrop-blur-md flex flex-wrap items-center justify-between gap-2.5 text-xs z-10">
        {/* Left: Search & Dropdowns */}
        {renderSearchAndDropdowns(false)}

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

          {/* Move All Device Pins Toggle (default OFF, when enabled by parent) */}
          {enableDeviceDrag && (
            <button
              type="button"
              onClick={() => setDragMode(!dragMode)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border font-bold text-[11px] shadow-2xs transition-all cursor-pointer ${
                dragMode
                  ? 'bg-blue-600 text-white border-blue-600 shadow-xs ring-2 ring-blue-300'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
              title="Enable or disable dragging device pins on the map"
            >
              <MapPin className={`w-3.5 h-3.5 ${dragMode ? 'text-white' : 'text-blue-600'}`} />
              <span>{dragMode ? 'Location Drag: ON' : 'Location Drag: OFF'}</span>
            </button>
          )}

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
      )}

      {/* Main MapLibre 3D Canvas */}
      <div className="flex-1 relative flex overflow-hidden w-full h-full">
        <div ref={mapContainerRef} className="w-full h-full relative z-0" />

        {/* GIS Inside-Map Controls (Dashboard Map Mode) */}
        {controlsInsideMap && (
          <>
            {/* Top-Left: Search, Dropdowns + Left Zoom Stack */}
            <div className="absolute top-3 left-3 z-10 flex flex-col items-start gap-2 max-w-[calc(100%-24px)] pointer-events-none">
              <div className="flex flex-wrap items-center gap-1.5 pointer-events-auto">
                {renderSearchAndDropdowns(true)}
                <button
                  type="button"
                  onClick={handleFitAllBounds}
                  className="p-1.5 rounded-xl bg-slate-900/80 text-white border border-white/20 hover:bg-slate-900/95 backdrop-blur-md shadow-md transition-colors cursor-pointer"
                  title="Reset Map View"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>

              {/* Left Vertical Zoom & Home Stack */}
              <div className="flex flex-col bg-slate-900/80 backdrop-blur-md border border-white/15 rounded-xl overflow-hidden shadow-lg pointer-events-auto text-white">
                <button
                  type="button"
                  onClick={handleFitAllBounds}
                  className="p-2 hover:bg-white/15 transition-colors cursor-pointer border-b border-white/10"
                  title="Home / Fit All Locations & Devices"
                >
                  <Home className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => mapInstanceRef.current?.zoomIn({ duration: 250 })}
                  className="p-2 hover:bg-white/15 transition-colors cursor-pointer border-b border-white/10"
                  title="Zoom In"
                >
                  <Plus className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => mapInstanceRef.current?.zoomOut({ duration: 250 })}
                  className="p-2 hover:bg-white/15 transition-colors cursor-pointer"
                  title="Zoom Out"
                >
                  <Minus className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Top-Right Inside-Map: Compact Icon-Only Vertical GIS Toolbar */}
            <div className="absolute top-3 right-3 z-10 flex flex-col items-end gap-1.5 pointer-events-auto">
              <div className="flex flex-col bg-slate-900/80 backdrop-blur-md border border-white/15 rounded-xl overflow-hidden shadow-xl text-white">
                {/* Map Layer Style Switcher */}
                <button
                  type="button"
                  onClick={() => {
                    setShowStyleMenu(prev => !prev);
                    setShowAlertLayerPanel(false);
                  }}
                  className={`p-2 hover:bg-white/15 transition-colors cursor-pointer border-b border-white/10 ${showStyleMenu ? 'bg-blue-600/80' : ''}`}
                  title={`Map Layer: ${MAP_STYLES[mapType]?.name || 'Satellite 3D'}`}
                >
                  <Layers className="w-3.5 h-3.5" />
                </button>
                {/* 3-Type Alert Layer Panel Toggle */}
                <button
                  type="button"
                  onClick={() => {
                    setShowAlertLayerPanel(prev => !prev);
                    setShowStyleMenu(false);
                  }}
                  className={`p-2 hover:bg-white/15 transition-colors cursor-pointer border-b border-white/10 relative ${showAlertLayerPanel ? 'bg-rose-600/85 text-white' : activeAlarmsList.length > 0 ? 'text-rose-400' : ''}`}
                  title={`Alert Layers (${activeAlarmsList.length} Active)`}
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {activeAlarmsList.length > 0 && (
                    <span className="absolute top-0.5 right-0.5 min-w-[13px] h-[13px] px-0.5 rounded-full bg-rose-500 text-white text-[8px] font-black flex items-center justify-center leading-none">
                      {activeAlarmsList.length > 99 ? '99+' : activeAlarmsList.length}
                    </span>
                  )}
                </button>
                {/* 3D Tilt Pitch */}
                <button
                  type="button"
                  onClick={() => setIs3D(!is3D)}
                  className={`p-2 hover:bg-white/15 transition-colors cursor-pointer border-b border-white/10 ${is3D ? 'text-sky-400 bg-white/10' : ''}`}
                  title={is3D ? '3D View (55°)' : '2D (Top Down)'}
                >
                  <Compass className="w-3.5 h-3.5" />
                </button>
                {/* 3D Globe / Mercator */}
                <button
                  type="button"
                  onClick={() => setIsGlobe(!isGlobe)}
                  className={`p-2 hover:bg-white/15 transition-colors cursor-pointer border-b border-white/10 ${isGlobe ? 'text-purple-300 bg-white/10' : ''}`}
                  title={isGlobe ? '3D Globe' : 'Mercator'}
                >
                  <Globe className="w-3.5 h-3.5" />
                </button>
                {/* 3D Terrain */}
                <button
                  type="button"
                  onClick={() => setIsTerrain(!isTerrain)}
                  className={`p-2 hover:bg-white/15 transition-colors cursor-pointer border-b border-white/10 ${isTerrain ? 'text-emerald-400 bg-white/10' : ''}`}
                  title={`Terrain ${isTerrain ? 'ON' : 'OFF'}`}
                >
                  <Mountain className="w-3.5 h-3.5" />
                </button>
                {/* Heatmap */}
                <button
                  type="button"
                  onClick={() => setShowHeatmap(!showHeatmap)}
                  className={`p-2 hover:bg-white/15 transition-colors cursor-pointer border-b border-white/10 ${showHeatmap ? 'text-orange-400 bg-orange-500/25' : ''}`}
                  title="Heatmap"
                >
                  <Flame className="w-3.5 h-3.5" />
                </button>
                {/* Device Pin Drag Toggle (when enabled by parent, e.g. Structural Assets) */}
                {enableDeviceDrag && (
                  <button
                    type="button"
                    onClick={() => setDragMode(!dragMode)}
                    className={`p-2 hover:bg-white/15 transition-colors cursor-pointer border-b border-white/10 ${dragMode ? 'bg-blue-600 text-white' : ''}`}
                    title={dragMode ? 'Location Drag: ON (Click to disable)' : 'Location Drag: OFF (Click to enable)'}
                  >
                    <MapPin className="w-3.5 h-3.5" />
                  </button>
                )}
                {/* Analytics Panel */}
                <button
                  type="button"
                  onClick={() => setShowAnalyticsPanel(!showAnalyticsPanel)}
                  className={`p-2 hover:bg-white/15 transition-colors cursor-pointer border-b border-white/10 ${showAnalyticsPanel ? 'text-blue-400 bg-white/10' : ''}`}
                  title={showAnalyticsPanel ? 'Hide Analytics' : 'Analytics'}
                >
                  <BarChart3 className="w-3.5 h-3.5" />
                </button>
                {/* Fullscreen */}
                <button
                  type="button"
                  onClick={handleToggleFullscreen}
                  className="p-2 hover:bg-white/15 transition-colors cursor-pointer"
                  title="Fullscreen"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Popout Map Style Selector (All Map Layer Types) */}
              {showStyleMenu && (
                <div className="bg-slate-900/90 backdrop-blur-md border border-white/15 rounded-xl p-1.5 shadow-2xl flex flex-col gap-1 min-w-[160px]">
                  <div className="px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-slate-400">
                    Map Layer Type
                  </div>
                  {Object.entries(MAP_STYLES).map(([key, styleObj]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setMapType(key);
                        setShowStyleMenu(false);
                      }}
                      className={`px-2.5 py-1 rounded-lg text-left text-[11px] font-bold transition-colors cursor-pointer ${
                        mapType === key ? 'bg-blue-600 text-white' : 'text-slate-200 hover:bg-white/10'
                      }`}
                    >
                      {styleObj.name}
                    </button>
                  ))}
                </div>
              )}

              {/* 3-Type Alert Layer Section (Critical / Warning / Info) + Click Alert to Focus Device on Map */}
              {showAlertLayerPanel && (
                <div className="bg-slate-900/92 backdrop-blur-md border border-white/15 rounded-xl p-2 shadow-2xl w-[265px] max-h-[340px] flex flex-col gap-2 text-white">
                  <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
                    <div className="flex items-center gap-1.5 text-[11px] font-extrabold">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                      <span>Alert Layers ({activeAlarmsList.length})</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowAlertLayerPanel(false)}
                      className="text-slate-400 hover:text-white cursor-pointer"
                      title="Close"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* 3 Alert Severity Type Filter Buttons */}
                  <div className="grid grid-cols-4 gap-1 text-[10px] font-bold">
                    <button
                      type="button"
                      onClick={() => setAlertSeverityFilter('ALL')}
                      className={`py-1 px-1 rounded-lg cursor-pointer transition-colors ${
                        alertSeverityFilter === 'ALL'
                          ? 'bg-blue-600 text-white'
                          : 'bg-white/10 text-slate-200 hover:bg-white/20'
                      }`}
                    >
                      All ({activeAlarmsList.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setAlertSeverityFilter('CRITICAL')}
                      className={`py-1 px-1 rounded-lg cursor-pointer transition-colors ${
                        alertSeverityFilter === 'CRITICAL'
                          ? 'bg-rose-600 text-white'
                          : 'bg-rose-500/20 text-rose-200 hover:bg-rose-500/35'
                      }`}
                    >
                      Crit ({criticalAlarms.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setAlertSeverityFilter('WARNING')}
                      className={`py-1 px-1 rounded-lg cursor-pointer transition-colors ${
                        alertSeverityFilter === 'WARNING'
                          ? 'bg-amber-600 text-white'
                          : 'bg-amber-500/20 text-amber-200 hover:bg-amber-500/35'
                      }`}
                    >
                      Warn ({warningAlarms.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setAlertSeverityFilter('INFO')}
                      className={`py-1 px-1 rounded-lg cursor-pointer transition-colors ${
                        alertSeverityFilter === 'INFO'
                          ? 'bg-sky-600 text-white'
                          : 'bg-sky-500/20 text-sky-200 hover:bg-sky-500/35'
                      }`}
                    >
                      Info ({infoAlarms.length})
                    </button>
                  </div>

                  {/* Clickable Alert Items -> Focuses & Opens Device on Map */}
                  <div className="flex-1 overflow-y-auto space-y-1 pr-0.5 max-h-[225px]">
                    {visibleAlertPanelItems.length === 0 ? (
                      <div className="text-[11px] text-slate-400 text-center py-4">
                        No active alerts in this layer
                      </div>
                    ) : (
                      visibleAlertPanelItems.map(alm => {
                        const tier = normalizeAlarmTier(alm.severity);
                        const devObj = devices.find(d => String(d.id || d.deviceId) === String(alm.deviceId));
                        const devName = devObj?.name || alm.deviceId || 'Unknown Device';
                        const tierBadgeCls =
                          tier === 'CRITICAL'
                            ? 'bg-rose-500/25 text-rose-200 border-rose-400/40'
                            : tier === 'WARNING'
                            ? 'bg-amber-500/25 text-amber-200 border-amber-400/40'
                            : 'bg-sky-500/25 text-sky-200 border-sky-400/40';

                        return (
                          <button
                            key={alm.id || `${alm.deviceId}-${alm.parameter}-${alm.createdAt}`}
                            type="button"
                            onClick={() => handleFocusAlertDevice(alm)}
                            className="w-full text-left p-2 rounded-lg bg-white/5 hover:bg-white/15 border border-white/10 transition-colors cursor-pointer flex flex-col gap-1"
                            title="Click to locate & view device on map"
                          >
                            <div className="flex items-center justify-between gap-1.5">
                              <span className="font-bold text-[11px] text-white truncate">
                                {devName}
                              </span>
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold border shrink-0 ${tierBadgeCls}`}>
                                {tier}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-300 truncate">
                              {alm.message || `${alm.parameter || 'Alert'} threshold exceeded`}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Bottom-Left: Live Cursor Lat/Lon & Time Readout */}
            <div className="absolute bottom-3 left-3 z-10 pointer-events-none flex flex-col gap-1">
              <div className="px-2.5 py-1 rounded-md bg-slate-900/75 backdrop-blur-md border border-white/15 text-white font-mono text-[11px] font-semibold shadow-md">
                {hoverCoords
                  ? `Lat/Lon ${hoverCoords.lat.toFixed(6)} ${hoverCoords.lng.toFixed(6)}`
                  : 'Lat/Lon -- --'}
              </div>
              <div className="px-2 py-0.5 rounded bg-slate-900/65 backdrop-blur-md text-slate-200 text-[10px] font-medium w-fit">
                {`Local Time (${Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'})`}
              </div>
            </div>
          </>
        )}

        {/* Floating All-Device Pin Move & Batch Save Bar */}
        {enableDeviceDrag && dragMode && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex flex-wrap items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-slate-900/95 text-white backdrop-blur-md border border-slate-700 shadow-2xl text-xs pointer-events-auto max-w-[92%] animate-fadeIn">
            {Object.keys(pendingMoves).length === 0 ? (
              <div className="flex items-center gap-2 text-slate-200 font-medium">
                <MapPin className="w-4 h-4 text-blue-400 shrink-0" />
                {activeDragDevice ? (
                  <>
                    <span>
                      Editing <strong className="text-white">{activeDragDevice.name || activeDragDevice.id}</strong>: Drag pin or click anywhere on the map to move
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedDragDevice(null);
                        if (onClearEditingDevice) onClearEditingDevice();
                      }}
                      className="ml-2 px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-[11px] cursor-pointer"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <span>Click any device point to select &amp; move, or drag it directly on the map</span>
                )}
              </div>
            ) : (
              <>
                <div className="flex items-center gap-1.5 font-bold text-blue-300">
                  <MapPin className="w-4 h-4 text-blue-400 shrink-0" />
                  <span>{Object.keys(pendingMoves).length} device(s) moved</span>
                </div>
                <button
                  type="button"
                  disabled={savingMoves}
                  onClick={async () => {
                    if (!onSaveAllDeviceLocations) return;
                    setSavingMoves(true);
                    try {
                      await onSaveAllDeviceLocations(Object.values(pendingMoves));
                      setPendingMoves({});
                      setSelectedDragDevice(null);
                      if (onClearEditingDevice) onClearEditingDevice();
                    } finally {
                      setSavingMoves(false);
                    }
                  }}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-bold text-xs shadow-xs cursor-pointer transition-colors"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{savingMoves ? 'Saving...' : `Save All Locations (${Object.keys(pendingMoves).length})`}</span>
                </button>
                <button
                  type="button"
                  disabled={savingMoves}
                  onClick={() => {
                    setPendingMoves({});
                    setSelectedDragDevice(null);
                    if (onClearEditingDevice) onClearEditingDevice();
                  }}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs cursor-pointer transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset</span>
                </button>
              </>
            )}
          </div>
        )}

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
                            if (mapInstanceRef.current) {
                              const [dLng, dLat] = getDeviceCoordinates(d);
                              mapInstanceRef.current.flyTo({
                                center: [dLng, dLat],
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

        {/* Right Floating Device Inspector Drawer (Compact or Expanded Full Device Details) */}
        {selectedDevice && (
          <div className={`absolute bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200 shadow-2xl p-4 flex flex-col justify-between animate-fadeIn ${
            inspectorExpanded
              ? 'inset-3 z-20 overflow-hidden'
              : 'right-3 top-3 bottom-3 w-84 max-w-[90%] z-10'
          }`}>
            <div className={inspectorExpanded ? 'flex flex-col flex-1 min-h-0' : ''}>
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-3 shrink-0">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setInspectorExpanded(prev => !prev)}
                    className="p-1.5 rounded-lg bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-600 transition-colors cursor-pointer"
                    title={inspectorExpanded ? 'Collapse Inspector' : 'Expand Full Device Details (All Charts & Table)'}
                  >
                    {inspectorExpanded ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
                  </button>
                  <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                    <Cpu className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      SENSOR NODE INSPECTOR
                    </div>
                    <div className={`font-bold text-slate-900 text-sm truncate ${inspectorExpanded ? 'max-w-[420px]' : 'max-w-[160px]'}`}>
                      {selectedDevice.name || selectedDevice.id}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedDevice.imageUrl) {
                        setPreviewImageModal({
                          open: true,
                          url: formatAssetUrl(selectedDevice.imageUrl),
                          device: selectedDevice
                        });
                      }
                    }}
                    disabled={!selectedDevice.imageUrl}
                    className={`p-1.5 rounded-lg transition-colors ${
                      selectedDevice.imageUrl
                        ? 'text-blue-600 bg-blue-50 hover:bg-blue-100 cursor-pointer'
                        : 'text-slate-300 bg-slate-50 cursor-not-allowed'
                    }`}
                    title={selectedDevice.imageUrl ? 'View Device Image' : 'No Photo Uploaded'}
                  >
                    <Camera className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      setSelectedDevice(null);
                      setInspectorExpanded(false);
                    }}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {inspectorExpanded ? (
                <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                  {/* Top KPI Summary Strip */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2.5 text-xs">
                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                      <div className="text-[10px] text-slate-500 font-bold uppercase">Device ID</div>
                      <div className="font-mono font-bold text-slate-900 truncate mt-0.5">{selectedDevice.id}</div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                      <div className="text-[10px] text-slate-500 font-bold uppercase">Location</div>
                      <div className="font-bold text-slate-900 truncate mt-0.5">
                        {sites.find(s => s.id === selectedDevice.siteId || s.siteId === selectedDevice.siteId)?.name || 'Standalone'}
                      </div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-100">
                      <div className="text-[10px] text-blue-600 font-bold uppercase">Displacement</div>
                      <div className="font-mono font-bold text-blue-900 mt-0.5">
                        {Number(selectedDevice.totalDisplacement || 0.18).toFixed(2)} mm
                      </div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-purple-50 border border-purple-100">
                      <div className="text-[10px] text-purple-600 font-bold uppercase">Resultant Tilt</div>
                      <div className="font-mono font-bold text-purple-900 mt-0.5">
                        {Number(selectedDevice.resultantTilt || 0.22).toFixed(1)}°
                      </div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-100">
                      <div className="text-[10px] text-emerald-700 font-bold uppercase">Battery</div>
                      <div className="font-mono font-bold text-emerald-900 mt-0.5">
                        {formatBatteryPercentage(selectedDevice.battery ?? selectedDevice.batteryVoltage)}
                      </div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-sky-50 border border-sky-100">
                      <div className="text-[10px] text-sky-700 font-bold uppercase">Signal</div>
                      <div className="font-mono font-bold text-sky-900 mt-0.5">
                        {formatCSQPercentage(selectedDevice.signal ?? selectedDevice.signalStrength)}
                      </div>
                    </div>
                  </div>

                  {/* Single Unified Customizable Chart (Line / Area / Bar, Color, Thickness & Metric Selector) */}
                  <UnifiedTelemetryChart
                    telemetryHistory={inspectorRawHistory}
                    loading={inspectorChartLoading}
                  />

                  {/* Device Alert Threshold Values */}
                  {(() => {
                    const devRules = alertRulesList.filter(r =>
                      Array.isArray(r.deviceIds) && r.deviceIds.includes(selectedDevice.id)
                    );
                    return (
                      <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                            <span>Alert Threshold Values</span>
                          </span>
                          <span className="text-[10px] font-semibold text-slate-500">
                            {devRules.length > 0 ? `${devRules.length} Assigned Rule(s)` : 'Default Safety Limits'}
                          </span>
                        </div>
                        {devRules.length > 0 ? (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {devRules.map(rule => {
                              const unit = rule.parameter === 'displacement' ? 'mm' : '°';
                              const cVal = rule.criticalThreshold ?? rule.thresholdValue ?? (unit === 'mm' ? 10 : 2);
                              const wVal = rule.warningThreshold ?? (unit === 'mm' ? 5 : 1);
                              const iVal = rule.infoThreshold ?? (unit === 'mm' ? 2 : 0.5);
                              return (
                                <div key={rule.id} className="p-2 rounded-lg bg-white border border-slate-200 flex items-center justify-between gap-2 text-[11px]">
                                  <div className="min-w-0">
                                    <div className="font-bold text-slate-800 truncate">{rule.ruleName || rule.parameter}</div>
                                    <div className="text-[10px] text-slate-500 uppercase font-mono">{rule.parameter}</div>
                                  </div>
                                  <div className="flex items-center gap-1 font-mono text-[10px] shrink-0">
                                    <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 font-bold">Crit: {cVal}{unit}</span>
                                    <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 font-bold">Warn: {wVal}{unit}</span>
                                    <span className="px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200 font-bold">Info: {iVal}{unit}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
                            <span className="px-2 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 font-bold">Critical: &gt; 2.00°</span>
                            <span className="px-2 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 font-bold">Warning: &gt; 1.00°</span>
                            <span className="px-2 py-1 rounded-lg bg-sky-50 text-sky-700 border border-sky-200 font-bold">Info: &gt; 0.50°</span>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Telemetry History Table */}
                  <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                    <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800">Recent 24h Telemetry History</span>
                      <span className="text-[11px] font-mono text-slate-500">{inspectorRawHistory.length} records</span>
                    </div>
                    <div className="max-h-64 overflow-auto">
                      <table className="w-full text-left text-[11px] border-collapse">
                        <thead className="bg-slate-50 sticky top-0 text-slate-600 font-bold border-b border-slate-200">
                          <tr>
                            <th className="px-3 py-2">Timestamp</th>
                            <th className="px-3 py-2">Tilt X (°)</th>
                            <th className="px-3 py-2">Tilt Y (°)</th>
                            <th className="px-3 py-2">Tilt Z (°)</th>
                            <th className="px-3 py-2">Total Disp (mm)</th>
                            <th className="px-3 py-2">Temp (°C)</th>
                            <th className="px-3 py-2">Battery</th>
                            <th className="px-3 py-2">Signal</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-mono">
                          {inspectorRawHistory.length === 0 ? (
                            <tr>
                              <td colSpan={8} className="px-3 py-6 text-center text-slate-400 font-sans">
                                {inspectorChartLoading ? 'Loading telemetry records...' : 'No telemetry records in last 24h'}
                              </td>
                            </tr>
                          ) : (
                            [...inspectorRawHistory].reverse().slice(0, 100).map((row, idx) => {
                              const ts = row.timestamp || row.time || row.createdAt;
                              const xV = row.tilt?.roll ?? row.roll ?? row.presentX ?? row.xTilt ?? row.deltaX;
                              const yV = row.tilt?.pitch ?? row.pitch ?? row.presentY ?? row.yTilt ?? row.deltaY;
                              const zV = row.tilt?.yaw ?? row.yaw ?? row.presentZ ?? row.zTilt ?? row.deltaZ;
                              const dV = row.displacement?.totalDisplacement_mm ?? row.totalDisplacement_mm ?? row.totalDisp ?? row.totalDisplacement;
                              const tV = row.environment?.temperature_c ?? row.temperature ?? row.temp;
                              const bV = row.power?.batteryVoltage ?? row.batteryVoltage ?? row.battery;
                              const sV = row.network?.csq ?? row.csq ?? row.signalStrength ?? row.signal;
                              return (
                                <tr key={row.id || idx} className="hover:bg-slate-50">
                                  <td className="px-3 py-1.5 text-slate-700 whitespace-nowrap">{ts ? formatFullDateTime(ts) : '--'}</td>
                                  <td className="px-3 py-1.5 text-blue-700 font-semibold">{xV != null && !isNaN(Number(xV)) ? Number(xV).toFixed(2) : '--'}</td>
                                  <td className="px-3 py-1.5 text-emerald-700 font-semibold">{yV != null && !isNaN(Number(yV)) ? Number(yV).toFixed(2) : '--'}</td>
                                  <td className="px-3 py-1.5 text-purple-700">{zV != null && !isNaN(Number(zV)) ? Number(zV).toFixed(2) : '--'}</td>
                                  <td className="px-3 py-1.5 text-slate-800">{dV != null && !isNaN(Number(dV)) ? Number(dV).toFixed(2) : '--'}</td>
                                  <td className="px-3 py-1.5 text-slate-700">{tV != null && !isNaN(Number(tV)) ? Number(tV).toFixed(1) : '--'}</td>
                                  <td className="px-3 py-1.5 text-emerald-700">{bV != null ? formatBatteryPercentage(bV) : '--'}</td>
                                  <td className="px-3 py-1.5 text-blue-700">{sV != null ? formatCSQPercentage(sV) : '--'}</td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : (
                <>
              {/* Last 24h Tilt X / Y Angle Chart */}
              <div className="mb-3">
                <div className="text-[11px] font-bold text-slate-700 mb-1.5 flex items-center justify-between">
                  <span>Tilt X / Y Angle (Last 24h)</span>
                  <div className="flex items-center gap-2 text-[10px] font-mono">
                    <span className="flex items-center gap-1 text-blue-600 font-bold">
                      <span className="w-2 h-2 rounded-full bg-blue-600 inline-block" />X
                    </span>
                    <span className="flex items-center gap-1 text-emerald-600 font-bold">
                      <span className="w-2 h-2 rounded-full bg-emerald-600 inline-block" />Y
                    </span>
                  </div>
                </div>

                <div className="w-full h-36 rounded-xl border border-slate-200 bg-slate-50/70 p-1.5">
                  {inspectorChartLoading ? (
                    <div className="w-full h-full flex items-center justify-center gap-2 text-[11px] font-semibold text-slate-500">
                      <div className="w-3.5 h-3.5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                      <span>Loading 24h chart...</span>
                    </div>
                  ) : inspectorChartData.length === 0 ? (
                    <div className="w-full h-full flex flex-col items-center justify-center text-center text-[11px] text-slate-400">
                      <TrendingUp className="w-5 h-5 text-slate-300 mb-1" />
                      <span>No 24h tilt data available</span>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={inspectorChartData} margin={{ top: 6, right: 8, left: -22, bottom: 2 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis
                          dataKey="timeLabel"
                          tick={{ fontSize: 9, fill: '#64748b' }}
                          tickLine={false}
                          minTickGap={20}
                        />
                        <YAxis
                          tick={{ fontSize: 9, fill: '#64748b' }}
                          tickLine={false}
                          tickFormatter={(v) => `${v}°`}
                        />
                        <Tooltip
                          contentStyle={{
                            fontSize: '10px',
                            borderRadius: '8px',
                            border: '1px solid #e2e8f0',
                            padding: '6px 8px',
                          }}
                          labelFormatter={(_, payload) => payload?.[0]?.payload?.fullTime || ''}
                          formatter={(val, name) => [`${Number(val).toFixed(2)}°`, name === 'xTilt' ? 'Tilt X' : 'Tilt Y']}
                        />
                        <Line
                          type="monotone"
                          dataKey="xTilt"
                          name="xTilt"
                          stroke="#2563eb"
                          strokeWidth={1.8}
                          dot={false}
                          isAnimationActive={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="yTilt"
                          name="yTilt"
                          stroke="#10b981"
                          strokeWidth={1.8}
                          dot={false}
                          isAnimationActive={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
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
                      NORMAL
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

                {/* Alert Threshold Values (Compact Inspector View) */}
                {(() => {
                  const devRules = alertRulesList.filter(r =>
                    Array.isArray(r.deviceIds) && r.deviceIds.includes(selectedDevice.id)
                  );
                  const primaryRule = devRules[0];
                  const unit = primaryRule?.parameter === 'displacement' ? 'mm' : '°';
                  const cVal = primaryRule ? (primaryRule.criticalThreshold ?? primaryRule.thresholdValue ?? (unit === 'mm' ? 10 : 2)) : 2.0;
                  const wVal = primaryRule ? (primaryRule.warningThreshold ?? (unit === 'mm' ? 5 : 1)) : 1.0;
                  const iVal = primaryRule ? (primaryRule.infoThreshold ?? (unit === 'mm' ? 2 : 0.5)) : 0.5;
                  return (
                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 space-y-1.5">
                      <div className="flex items-center justify-between text-[10px] font-bold text-slate-600">
                        <span className="flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 text-rose-500" />
                          <span>Alert Thresholds</span>
                        </span>
                        <span className="text-slate-400 font-normal">
                          {primaryRule ? (primaryRule.ruleName || primaryRule.parameter) : 'Default Tilt'}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-1 font-mono text-[10px] text-center">
                        <div className="px-1.5 py-1 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 font-bold">
                          Crit: {cVal}{unit}
                        </div>
                        <div className="px-1.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 font-bold">
                          Warn: {wVal}{unit}
                        </div>
                        <div className="px-1.5 py-1 rounded-lg bg-sky-50 border border-sky-200 text-sky-700 font-bold">
                          Info: {iVal}{unit}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
                </>
              )}
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
