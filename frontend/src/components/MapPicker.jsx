import React, { useState, useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapPin, ZoomIn, ZoomOut, Compass, CheckCircle } from 'lucide-react';

const SATELLITE_STYLE = {
  version: 8,
  sources: {
    'esri-satellite': {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      maxzoom: 18,
      attribution: '&copy; Esri World Imagery',
    },
  },
  layers: [
    {
      id: 'satellite-tiles-layer',
      type: 'raster',
      source: 'esri-satellite',
      minzoom: 0,
      maxzoom: 22,
    },
  ],
};

export default function MapPicker({
  latitude = 22.5726,
  longitude = 88.3639,
  onChange,
  isDark = false,
  presetSites = [],
  deployedDevices = [],
  selectedDeviceId = null,
  onSelectDevice = null,
  readOnly = false,
  height = '320px',
}) {
  const initialLat = Number.isFinite(parseFloat(latitude)) ? parseFloat(latitude) : 22.5726;
  const initialLng = Number.isFinite(parseFloat(longitude)) ? parseFloat(longitude) : 88.3639;

  const [currentLat, setCurrentLat] = useState(initialLat);
  const [currentLng, setCurrentLng] = useState(initialLng);
  const [zoomLevel, setZoomLevel] = useState(16);

  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const targetMarkerRef = useRef(null);
  const siblingMarkersRef = useRef([]);
  const onChangeRef = useRef(onChange);
  const readOnlyRef = useRef(readOnly);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    readOnlyRef.current = readOnly;
  }, [readOnly]);

  // Initialize MapLibre GL Satellite Map once
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: SATELLITE_STYLE,
      center: [initialLng, initialLat],
      zoom: 16,
      minZoom: 3,
      maxZoom: 21,
      attributionControl: false,
    });

    mapRef.current = map;

    // Create target pin DOM element
    const targetEl = document.createElement('div');
    targetEl.style.cursor = readOnlyRef.current ? 'default' : 'grab';
    targetEl.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;pointer-events:auto;">
        <div style="background:#2563eb;color:#ffffff;padding:2px 8px;border-radius:9999px;font-size:10px;font-weight:800;box-shadow:0 3px 8px rgba(37,99,235,0.45);border:1.5px solid #ffffff;white-space:nowrap;margin-bottom:2px;">
          Target Pin
        </div>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="#2563eb" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="filter:drop-shadow(0 3px 6px rgba(0,0,0,0.45));">
          <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"></path>
          <circle cx="12" cy="10" r="3" fill="#67e8f9" stroke="#ffffff" stroke-width="1.5"></circle>
        </svg>
      </div>
    `;

    const targetMarker = new maplibregl.Marker({
      element: targetEl,
      anchor: 'bottom',
      draggable: !readOnlyRef.current,
    })
      .setLngLat([initialLng, initialLat])
      .addTo(map);

    targetMarkerRef.current = targetMarker;

    const commitCoords = (lngLat) => {
      const newLat = parseFloat(lngLat.lat.toFixed(6));
      const newLng = parseFloat(lngLat.lng.toFixed(6));
      setCurrentLat(newLat);
      setCurrentLng(newLng);
      if (onChangeRef.current) {
        onChangeRef.current({ latitude: newLat, longitude: newLng });
      }
    };

    targetMarker.on('dragstart', () => {
      targetEl.style.cursor = 'grabbing';
    });

    targetMarker.on('dragend', () => {
      targetEl.style.cursor = 'grab';
      commitCoords(targetMarker.getLngLat());
    });

    map.on('click', (e) => {
      if (readOnlyRef.current) return;
      targetMarker.setLngLat(e.lngLat);
      commitCoords(e.lngLat);
    });

    map.on('zoom', () => {
      setZoomLevel(Number(map.getZoom().toFixed(1)));
    });

    map.on('load', () => {
      map.resize();
    });

    const resizeTimer = setTimeout(() => {
      try {
        map.resize();
      } catch {}
    }, 150);

    return () => {
      clearTimeout(resizeTimer);
      siblingMarkersRef.current.forEach((m) => m.remove());
      siblingMarkersRef.current = [];
      targetMarker.remove();
      map.remove();
      mapRef.current = null;
      targetMarkerRef.current = null;
    };
  }, []);

  // Sync external latitude / longitude prop changes to marker & map center
  useEffect(() => {
    const parsedLat = parseFloat(latitude);
    const parsedLng = parseFloat(longitude);
    if (isNaN(parsedLat) || isNaN(parsedLng)) return;

    setCurrentLat(parsedLat);
    setCurrentLng(parsedLng);

    if (targetMarkerRef.current) {
      const cur = targetMarkerRef.current.getLngLat();
      if (Math.abs(cur.lat - parsedLat) > 1e-6 || Math.abs(cur.lng - parsedLng) > 1e-6) {
        targetMarkerRef.current.setLngLat([parsedLng, parsedLat]);
        if (mapRef.current) {
          mapRef.current.panTo([parsedLng, parsedLat], { duration: 350 });
        }
      }
    }
  }, [latitude, longitude]);

  // Plot sibling / deployed devices on the Satellite map
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    siblingMarkersRef.current.forEach((m) => m.remove());
    siblingMarkersRef.current = [];

    (deployedDevices || []).forEach((d) => {
      const devLat = parseFloat(d.latitude);
      const devLng = parseFloat(d.longitude);
      if (isNaN(devLat) || isNaN(devLng)) return;

      const isSelectedDev = selectedDeviceId && String(d.id) === String(selectedDeviceId);
      const isOnline = (d.status || 'ONLINE') === 'ONLINE';

      const el = document.createElement('div');
      el.style.cursor = onSelectDevice ? 'pointer' : 'default';
      el.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;">
          <div style="background:${isSelectedDev ? '#2563eb' : (isOnline ? '#059669' : '#d97706')};color:#ffffff;padding:2px 6px;border-radius:6px;font-size:9px;font-family:monospace;font-weight:800;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.4);border:1px solid #ffffff;margin-bottom:2px;">
            ${d.name || d.id}
          </div>
          <div style="width:10px;height:10px;border-radius:50%;background:${isSelectedDev ? '#3b82f6' : (isOnline ? '#10b981' : '#f59e0b')};border:2px solid #ffffff;box-shadow:0 2px 4px rgba(0,0,0,0.5);"></div>
        </div>
      `;

      if (onSelectDevice) {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          onSelectDevice(d);
        });
      }

      const marker = new maplibregl.Marker({
        element: el,
        anchor: 'bottom',
      })
        .setLngLat([devLng, devLat])
        .addTo(map);

      siblingMarkersRef.current.push(marker);
    });
  }, [deployedDevices, selectedDeviceId, onSelectDevice]);

  const handlePresetSelect = (site) => {
    const lat = parseFloat(site.latitude || site.lat || 22.5726);
    const lng = parseFloat(site.longitude || site.lng || 88.3639);
    if (isNaN(lat) || isNaN(lng)) return;

    setCurrentLat(lat);
    setCurrentLng(lng);

    if (targetMarkerRef.current) {
      targetMarkerRef.current.setLngLat([lng, lat]);
    }
    if (mapRef.current) {
      mapRef.current.flyTo({ center: [lng, lat], zoom: 17, duration: 500 });
    }
    if (onChange) onChange({ latitude: lat, longitude: lng });
  };

  const handleZoomIn = () => {
    if (mapRef.current) {
      mapRef.current.zoomIn({ duration: 250 });
    }
  };

  const handleZoomOut = () => {
    if (mapRef.current) {
      mapRef.current.zoomOut({ duration: 250 });
    }
  };

  return (
    <div className={`rounded-xl border overflow-hidden flex flex-col ${isDark ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'}`}>
      {/* Map Control Toolbar (Satellite View Only) */}
      <div className={`flex flex-wrap items-center justify-between px-3 py-2 border-b text-xs gap-2 ${isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
        <div className="flex items-center gap-2 font-mono">
          <div className="p-1 rounded bg-blue-500/20 text-blue-500">
            <Compass className="w-3.5 h-3.5" />
          </div>
          <span className="font-semibold text-[11px]">
            GPS: <span className="text-emerald-600 font-bold">{currentLat.toFixed(5)}° N</span>,{' '}
            <span className="text-blue-600 font-bold">{currentLng.toFixed(5)}° E</span>
          </span>
        </div>

        {/* Quick presets for asset / sites */}
        {presetSites.length > 0 && (
          <div className="flex items-center gap-1 overflow-x-auto max-w-[260px] py-0.5">
            <span className="text-[10px] text-slate-400 font-bold uppercase mr-1">Jump:</span>
            {presetSites.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handlePresetSelect(s)}
                className={`px-2 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                  Math.abs((s.latitude || s.lat) - currentLat) < 0.0005 && Math.abs((s.longitude || s.lng) - currentLng) < 0.0005
                    ? 'bg-blue-600 text-white'
                    : (isDark ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-slate-200 text-slate-700 hover:bg-slate-300')
                }`}
              >
                {s.name || s.id}
              </button>
            ))}
          </div>
        )}

        {/* Satellite Badge + Zoom In / Out Controls */}
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="px-2 py-0.5 rounded bg-slate-900 text-white text-[10px] font-bold tracking-wide">
            Satellite
          </span>
          <span className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 font-mono text-[10px] font-bold">
            Z {zoomLevel}
          </span>
          <button
            type="button"
            onClick={handleZoomIn}
            className="p-1.5 rounded border bg-white border-slate-300 text-slate-800 hover:bg-slate-100 cursor-pointer shadow-2xs"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleZoomOut}
            className="p-1.5 rounded border bg-white border-slate-300 text-slate-800 hover:bg-slate-100 cursor-pointer shadow-2xs"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Interactive MapLibre Satellite Canvas */}
      <div className="relative w-full bg-slate-950" style={{ height }}>
        <div ref={mapContainerRef} className="w-full h-full" />

        {/* Helper Hint Box */}
        {!readOnly && (
          <div className="absolute bottom-2 left-2 z-10 px-2.5 py-1 rounded-lg bg-black/75 backdrop-blur-md text-white text-[10px] font-medium flex items-center gap-1.5 pointer-events-none">
            <CheckCircle className="w-3 h-3 text-emerald-400 shrink-0" />
            <span>Click anywhere on the Satellite map or drag the blue pin to set exact GPS coordinates</span>
          </div>
        )}
      </div>
    </div>
  );
}
