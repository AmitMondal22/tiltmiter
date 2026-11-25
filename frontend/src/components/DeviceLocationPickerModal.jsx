import React, { useState, useEffect } from 'react';
import { X, MapPin, Crosshair, CheckCircle2, Loader2, Navigation } from 'lucide-react';
import MapPicker from './MapPicker';
import { updateStructureDeviceLocation, updateDevice } from '../api/apiClient';

/**
 * Modal for picking and updating a device's GPS location on an interactive map
 * scoped to its parent Structural Asset.
 */
export default function DeviceLocationPickerModal({
  isOpen,
  onClose,
  device,
  structure,
  site,
  assetDevices = [],
  onSaved,
}) {
  const defaultLat =
    parseFloat(device?.latitude) ||
    parseFloat(structure?.latitude) ||
    parseFloat(site?.latitude) ||
    26.7271;
  const defaultLng =
    parseFloat(device?.longitude) ||
    parseFloat(structure?.longitude) ||
    parseFloat(site?.longitude) ||
    88.4315;

  const [lat, setLat] = useState(defaultLat);
  const [lng, setLng] = useState(defaultLng);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen && device) {
      const initLat =
        parseFloat(device.latitude) ||
        parseFloat(structure?.latitude) ||
        parseFloat(site?.latitude) ||
        26.7271;
      const initLng =
        parseFloat(device.longitude) ||
        parseFloat(structure?.longitude) ||
        parseFloat(site?.longitude) ||
        88.4315;
      setLat(initLat);
      setLng(initLng);
      setError('');
    }
  }, [isOpen, device, structure, site]);

  if (!isOpen || !device) return null;

  const handleSave = async (e) => {
    e.preventDefault();
    const numLat = parseFloat(lat);
    const numLng = parseFloat(lng);

    if (isNaN(numLat) || isNaN(numLng)) {
      setError('Please enter or pick valid numeric latitude and longitude.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      let res;
      if (structure?.id) {
        res = await updateStructureDeviceLocation(structure.id, device.id, {
          latitude: numLat,
          longitude: numLng,
        }).catch(() => null);
      }
      if (!res?.device) {
        res = await updateDevice(device.id, {
          latitude: numLat,
          longitude: numLng,
          ...(structure?.id ? { structureId: structure.id } : {}),
          ...(structure?.siteId ? { siteId: structure.siteId } : {}),
        });
      }

      const updatedDevice = res?.device || {
        ...device,
        latitude: numLat,
        longitude: numLng,
      };
      if (onSaved) onSaved(updatedDevice);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to update device location.');
    } finally {
      setSaving(false);
    }
  };

  // Show only sibling devices under this Structural Asset on the picker map
  const siblingDevices = (assetDevices || []).filter((d) => String(d.id) !== String(device.id));

  const presets = [];
  if (structure?.latitude && structure?.longitude) {
    presets.push({
      id: structure.id,
      name: `Asset: ${structure.name || structure.id}`,
      latitude: parseFloat(structure.latitude),
      longitude: parseFloat(structure.longitude),
    });
  }
  if (site?.latitude && site?.longitude) {
    presets.push({
      id: site.id || site.siteId,
      name: `Site: ${site.name || site.id}`,
      latitude: parseFloat(site.latitude),
      longitude: parseFloat(site.longitude),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-xs p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white text-black shadow-2xl overflow-hidden animate-fadeIn">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50">
          <div>
            <h3 className="text-sm font-black text-black flex items-center gap-2">
              <MapPin className="w-4 h-4 text-blue-600" />
              <span>Pick & Update Device Location</span>
            </h3>
            <p className="text-[11px] text-slate-600 font-medium mt-0.5">
              Device: <span className="font-mono font-bold text-black">{device.name || device.id}</span> ({device.id})
              {structure?.name && (
                <> &bull; Asset: <span className="font-bold text-blue-700">{structure.name}</span></>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 hover:text-black hover:bg-slate-200/70 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-5 space-y-4 text-xs">
          {error && (
            <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 font-bold text-xs">
              {error}
            </div>
          )}

          {/* Interactive Map Picker */}
          <MapPicker
            latitude={isNaN(parseFloat(lat)) ? 26.7271 : parseFloat(lat)}
            longitude={isNaN(parseFloat(lng)) ? 88.4315 : parseFloat(lng)}
            presetSites={presets}
            deployedDevices={siblingDevices}
            selectedDeviceId={device.id}
            height="320px"
            onChange={({ latitude: newLat, longitude: newLng }) => {
              setLat(newLat);
              setLng(newLng);
            }}
          />

          {/* Coordinate Inputs + Asset Center Shortcut */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div>
              <label className="block font-extrabold text-slate-800 mb-1">Latitude (° N)</label>
              <input
                type="number"
                step="any"
                required
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 focus:bg-white focus:border-blue-500 outline-none font-mono font-bold text-black"
              />
            </div>

            <div>
              <label className="block font-extrabold text-slate-800 mb-1">Longitude (° E)</label>
              <input
                type="number"
                step="any"
                required
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 focus:bg-white focus:border-blue-500 outline-none font-mono font-bold text-black"
              />
            </div>

            {structure?.latitude && structure?.longitude && (
              <button
                type="button"
                onClick={() => {
                  setLat(parseFloat(structure.latitude));
                  setLng(parseFloat(structure.longitude));
                }}
                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs transition-colors cursor-pointer"
              >
                <Crosshair className="w-3.5 h-3.5" />
                <span>Snap to Asset Center</span>
              </button>
            )}
          </div>

          <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
            <Navigation className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span>
              Click anywhere on the Satellite map or drag the blue pin to set exact coordinates. Only devices under <strong>{structure?.name || 'this asset'}</strong> are plotted.
            </span>
          </div>

          {/* Actions */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 font-bold cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold shadow-xs cursor-pointer"
            >
              {saving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Updating...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Update Device Location</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

