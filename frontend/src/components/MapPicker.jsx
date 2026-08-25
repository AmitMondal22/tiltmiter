import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Navigation, ZoomIn, ZoomOut, Compass, Crosshair, Layers, CheckCircle } from 'lucide-react';

export default function MapPicker({
  latitude = 22.5726,
  longitude = 88.3639,
  onChange,
  isDark = false,
  presetSites = [],
  deployedDevices = [],
  readOnly = false,
  height = '320px'
}) {
  const [currentLat, setCurrentLat] = useState(parseFloat(latitude) || 22.5726);
  const [currentLng, setCurrentLng] = useState(parseFloat(longitude) || 88.3639);
  const [zoom, setZoom] = useState(15);
  const [mapType, setMapType] = useState('street'); // 'street' or 'satellite'
  const mapContainerRef = useRef(null);

  useEffect(() => {
    if (latitude !== undefined && latitude !== null) setCurrentLat(parseFloat(latitude));
    if (longitude !== undefined && longitude !== null) setCurrentLng(parseFloat(longitude));
  }, [latitude, longitude]);

  // Convert lat/lng to OpenStreetMap tile numbers
  const lat2tile = (lat, z) => (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, z);
  const lon2tile = (lon, z) => (lon + 180) / 360 * Math.pow(2, z);

  const tile2lat = (y, z) => {
    const n = Math.PI - 2 * Math.PI * y / Math.pow(2, z);
    return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  };
  const tile2lon = (x, z) => x / Math.pow(2, z) * 360 - 180;

  // Handle click on map to move marker
  const handleMapClick = (e) => {
    if (readOnly) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const centerTileX = lon2tile(currentLng, zoom);
    const centerTileY = lat2tile(currentLat, zoom);

    const deltaTilesX = (clickX - centerX) / 256;
    const deltaTilesY = (clickY - centerY) / 256;

    const newTileX = centerTileX + deltaTilesX;
    const newTileY = centerTileY + deltaTilesY;

    const newLat = parseFloat(tile2lat(newTileY, zoom).toFixed(6));
    const newLng = parseFloat(tile2lon(newTileX, zoom).toFixed(6));

    setCurrentLat(newLat);
    setCurrentLng(newLng);
    if (onChange) {
      onChange({ latitude: newLat, longitude: newLng });
    }
  };

  const handlePresetSelect = (site) => {
    const lat = site.latitude || site.lat || 22.5726;
    const lng = site.longitude || site.lng || 88.3639;
    setCurrentLat(lat);
    setCurrentLng(lng);
    setZoom(16);
    if (onChange) onChange({ latitude: lat, longitude: lng });
  };

  // Compute 3x3 surrounding tiles for smooth pan representation
  const centerTileX = lon2tile(currentLng, zoom);
  const centerTileY = lat2tile(currentLat, zoom);
  const tileIntX = Math.floor(centerTileX);
  const tileIntY = Math.floor(centerTileY);
  const fracX = centerTileX - tileIntX;
  const fracY = centerTileY - tileIntY;

  const tiles = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const tx = tileIntX + dx;
      const ty = tileIntY + dy;
      const url = mapType === 'street'
        ? `https://tile.openstreetmap.org/${zoom}/${tx}/${ty}.png`
        : `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${ty}/${tx}`;
      tiles.push({ tx, ty, dx, dy, url });
    }
  }

  return (
    <div className={`rounded-xl border overflow-hidden flex flex-col ${isDark ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'}`}>
      {/* Map Control Toolbar */}
      <div className={`flex flex-wrap items-center justify-between px-3 py-2 border-b text-xs gap-2 ${isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
        <div className="flex items-center gap-2 font-mono">
          <div className="p-1 rounded bg-blue-500/20 text-blue-400">
            <Compass className="w-3.5 h-3.5" />
          </div>
          <span className="font-semibold text-[11px]">
            GPS: <span className="text-emerald-400">{currentLat.toFixed(5)}° N</span>, <span className="text-cyan-400">{currentLng.toFixed(5)}° E</span>
          </span>
        </div>

        {/* Quick presets for sites */}
        {presetSites.length > 0 && (
          <div className="flex items-center gap-1 overflow-x-auto max-w-[260px] py-0.5">
            <span className="text-[10px] text-slate-400 font-bold uppercase mr-1">Sites:</span>
            {presetSites.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handlePresetSelect(s)}
                className={`px-2 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap transition-colors ${
                  Math.abs((s.latitude || s.lat) - currentLat) < 0.001 && Math.abs((s.longitude || s.lng) - currentLng) < 0.001
                    ? 'bg-blue-600 text-white'
                    : (isDark ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-slate-200 text-slate-700 hover:bg-slate-300')
                }`}
              >
                {s.name || s.id}
              </button>
            ))}
          </div>
        )}

        {/* Zoom & Layer Toggle */}
        <div className="flex items-center gap-1.5 ml-auto">
          <button
            type="button"
            onClick={() => setMapType(mapType === 'street' ? 'satellite' : 'street')}
            className={`p-1 rounded text-[10px] font-bold px-2 flex items-center gap-1 border ${
              mapType === 'satellite'
                ? 'bg-purple-600 text-white border-purple-500'
                : (isDark ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-slate-200 text-slate-700 border-slate-300')
            }`}
            title="Toggle Map Imagery"
          >
            <Layers className="w-3 h-3" />
            <span>{mapType === 'satellite' ? 'Satellite' : 'Street'}</span>
          </button>
          <button
            type="button"
            onClick={() => setZoom(Math.min(18, zoom + 1))}
            className={`p-1 rounded border ${isDark ? 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white' : 'bg-slate-200 border-slate-300 text-slate-700 hover:bg-slate-300'}`}
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setZoom(Math.max(10, zoom - 1))}
            className={`p-1 rounded border ${isDark ? 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white' : 'bg-slate-200 border-slate-300 text-slate-700 hover:bg-slate-300'}`}
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Interactive Map Canvas Container */}
      <div
        ref={mapContainerRef}
        onClick={handleMapClick}
        style={{ height }}
        className="relative w-full overflow-hidden cursor-crosshair select-none bg-slate-950 flex items-center justify-center"
      >
        {/* Render 3x3 Tile Matrix */}
        <div
          className="absolute pointer-events-none transition-transform duration-100"
          style={{
            width: '768px',
            height: '768px',
            left: `calc(50% - ${384 + fracX * 256}px)`,
            top: `calc(50% - ${384 + fracY * 256}px)`
          }}
        >
          {tiles.map((t, idx) => (
            <img
              key={idx}
              src={t.url}
              alt=""
              crossOrigin="anonymous"
              loading="eager"
              className="absolute w-[256px] h-[256px] object-cover"
              style={{
                left: `${(t.dx + 1) * 256}px`,
                top: `${(t.dy + 1) * 256}px`,
                filter: isDark && mapType === 'street' ? 'invert(90%) hue-rotate(180deg) brightness(90%) contrast(90%)' : 'none'
              }}
              onError={(e) => {
                e.target.style.display = 'none';
              }}
            />
          ))}
        </div>

        {/* Map Grid Crosshairs Overlay */}
        <div className="absolute inset-0 pointer-events-none border border-blue-500/10">
          <div className="absolute left-1/2 top-0 bottom-0 w-[1px] bg-blue-500/20"></div>
          <div className="absolute top-1/2 left-0 right-0 h-[1px] bg-blue-500/20"></div>
        </div>

        {/* Other Deployed Devices plotted on map if provided */}
        {deployedDevices.map((d, index) => {
          if (!d.latitude || !d.longitude) return null;
          const devTileX = lon2tile(d.longitude, zoom);
          const devTileY = lat2tile(d.latitude, zoom);
          const pxX = (devTileX - centerTileX) * 256;
          const pxY = (devTileY - centerTileY) * 256;

          const isNear = Math.abs(pxX) < 300 && Math.abs(pxY) < 300;
          if (!isNear) return null;

          return (
            <div
              key={d.id || index}
              className="absolute pointer-events-auto transform -translate-x-1/2 -translate-y-full z-20 group"
              style={{
                left: `calc(50% + ${pxX}px)`,
                top: `calc(50% + ${pxY}px)`
              }}
            >
              <div className="flex flex-col items-center">
                <div className={`px-1.5 py-0.5 rounded shadow text-[9px] font-bold font-mono whitespace-nowrap mb-0.5 ${
                  d.status === 'ONLINE' ? 'bg-emerald-600 text-white' : 'bg-amber-600 text-white'
                }`}>
                  {d.name || d.id}
                </div>
                <MapPin className={`w-5 h-5 drop-shadow-md ${d.status === 'ONLINE' ? 'text-emerald-400' : 'text-amber-400'}`} fill="currentColor" />
              </div>
            </div>
          );
        })}

        {/* Selected Target Device Pin (Center Pin Marker) */}
        <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-full pointer-events-none z-30 flex flex-col items-center animate-bounce duration-700">
          <div className="px-2 py-0.5 rounded-full bg-blue-600 text-white text-[10px] font-bold shadow-lg shadow-blue-500/50 flex items-center gap-1 mb-0.5 whitespace-nowrap">
            <Crosshair className="w-3 h-3 text-cyan-300" />
            <span>Target Installation Pin</span>
          </div>
          <div className="relative">
            <MapPin className="w-8 h-8 text-blue-500 drop-shadow-[0_4px_8px_rgba(59,130,246,0.6)]" fill="#2563eb" />
            <div className="w-2.5 h-2.5 bg-cyan-300 rounded-full absolute top-2 left-1/2 -translate-x-1/2"></div>
          </div>
          <div className="w-3 h-1.5 bg-blue-500/50 rounded-full blur-[1px] mt-[-2px]"></div>
        </div>

        {/* Helper Hint Box */}
        {!readOnly && (
          <div className="absolute bottom-2 left-2 z-20 px-2.5 py-1 rounded-lg bg-black/70 backdrop-blur-md text-white text-[10px] font-medium flex items-center gap-1.5">
            <CheckCircle className="w-3 h-3 text-emerald-400" />
            <span>Click anywhere on the map to place/adjust GPS coordinates</span>
          </div>
        )}
      </div>
    </div>
  );
}
