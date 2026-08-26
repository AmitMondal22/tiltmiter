import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Edit, Trash2, Sliders, CheckCircle2, ChevronRight, X, AlertTriangle
} from 'lucide-react';
import { getDevices, getSites, getStructures, createDevice, updateDevice, deleteDevice, configureDeviceTelemetry } from '../api/apiClient';

export default function DevicesPage() {
  const navigate = useNavigate();
  const cardCls = 'rounded-2xl border border-slate-200 bg-white p-5 text-black shadow-xs';

  const [devicesList, setDevicesList] = useState([]);
  const [sitesList, setSitesList] = useState([]);
  const [structuresList, setStructuresList] = useState([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState(null);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });

  const [formData, setFormData] = useState({
    id: '',
    name: '',
    sensorType: 'Inclinometer',
    siteId: '',
    structureId: '',
    macAddress: '',
    status: 'ONLINE',
    sleep_count: 15,
    wake_count: 30,
    calibrate: false,
  });

  const [configForm, setConfigForm] = useState({
    sleep_count: '',
    wake_count: '',
    calibrate: false,
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [devRes, sitesRes, structRes] = await Promise.all([
        getDevices().catch(() => ({ devices: [] })),
        getSites().catch(() => ({ sites: [] })),
        getStructures().catch(() => ({ structures: [] })),
      ]);

      if (devRes?.devices) setDevicesList(devRes.devices);
      if (sitesRes?.sites) setSitesList(sitesRes.sites);
      if (structRes?.structures) setStructuresList(structRes.structures);
    } catch (e) {
      setDevicesList([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenAdd = () => {
    setEditingDevice(null);
    setFormData({
      id: `TECHA${Date.now().toString().slice(-5)}`,
      name: '',
      sensorType: 'Inclinometer',
      siteId: '',
      structureId: '',
      macAddress: 'AA:BB:CC:DD:EE:FF',
      status: 'ONLINE',
      sleep_count: 15,
      wake_count: 30,
      calibrate: false,
    });
    setModalOpen(true);
  };

  const handleOpenEdit = (dev, e) => {
    e?.stopPropagation();
    setEditingDevice(dev);
    setFormData({
      id: dev.id,
      name: dev.name,
      sensorType: dev.sensorType || 'Inclinometer',
      siteId: dev.siteId || '',
      structureId: dev.structureId || '',
      macAddress: dev.macAddress || '',
      status: dev.status || 'ONLINE',
      sleep_count: dev.sleep_count !== undefined ? dev.sleep_count : '',
      wake_count: dev.wake_count !== undefined ? dev.wake_count : '',
      calibrate: Boolean(dev.calibrate),
    });
    setModalOpen(true);
  };

  const handleOpenConfig = (dev, e) => {
    e?.stopPropagation();
    setSelectedDevice(dev);
    setConfigForm({
      sleep_count: dev.sleep_count !== undefined ? dev.sleep_count : '',
      wake_count: dev.wake_count !== undefined ? dev.wake_count : '',
      calibrate: Boolean(dev.calibrate),
    });
    setConfigModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const sleepVal = Number(formData.sleep_count);
    if (!sleepVal || sleepVal < 15) {
      setMsg({ type: 'error', text: 'Sleep count must be at least 15 minutes (15M minimum).' });
      return;
    }
    const payload = {
      ...formData,
      sleep_count: sleepVal,
      wake_count: Number(formData.wake_count) || 30,
    };
    try {
      if (editingDevice) {
        await updateDevice(editingDevice.id, payload);
        setDevicesList(prev => prev.map(d => d.id === editingDevice.id ? { ...d, ...payload } : d));
        setMsg({ type: 'success', text: `Device ${payload.id} updated.` });
      } else {
        const res = await createDevice(payload);
        const newDev = res?.device || { ...payload, battery: '100%', signal: '14' };
        setDevicesList(prev => [...prev, newDev]);
        setMsg({ type: 'success', text: `Device ${payload.id} created successfully.` });
      }
      setModalOpen(false);
    } catch (err) {
      setMsg({ type: 'error', text: err.message || 'Error saving device' });
    } finally {
      setTimeout(() => setMsg({ type: '', text: '' }), 3500);
    }
  };

  const handleSaveConfig = async (e) => {
    e.preventDefault();
    const sleepVal = Number(configForm.sleep_count);
    const wakeVal = Number(configForm.wake_count);
    if (!sleepVal || sleepVal < 15) {
      setMsg({ type: 'error', text: 'Sleep count must be at least 15 minutes (15M minimum).' });
      return;
    }
    const payload = {
      ...configForm,
      sleep_count: sleepVal,
      wake_count: wakeVal > 0 ? wakeVal : 30,
    };
    try {
      await configureDeviceTelemetry(selectedDevice.id, payload);
      setDevicesList(prev => prev.map(d => d.id === selectedDevice.id ? { ...d, ...payload } : d));
      setMsg({ type: 'success', text: `Configuration deployed to ${selectedDevice.id}.` });
      setConfigModalOpen(false);
    } catch (err) {
      setMsg({ type: 'error', text: err.message || 'Error configuring device' });
    } finally {
      setTimeout(() => setMsg({ type: '', text: '' }), 3500);
    }
  };

  const handleDelete = async (id, e) => {
    e?.stopPropagation();
    if (window.confirm('Are you sure you want to delete this device node?')) {
      await deleteDevice(id).catch(() => {});
      setDevicesList(prev => prev.filter(d => d.id !== id));
      setMsg({ type: 'success', text: `Device ${id} deleted.` });
      setTimeout(() => setMsg({ type: '', text: '' }), 3000);
    }
  };

  return (
    <div className="space-y-4 font-sans text-black">
      {/* Toast */}
      {msg.text && (
        <div className={`p-3.5 rounded-xl border flex items-center gap-2 text-xs font-bold shadow-sm animate-fadeIn ${
          msg.type === 'error' ? 'bg-red-50 border-red-300 text-red-950' : 'bg-emerald-50 border-emerald-300 text-emerald-950'
        }`}>
          {msg.type === 'error' ? <AlertTriangle className="w-4 h-4 text-red-700" /> : <CheckCircle2 className="w-4 h-4 text-emerald-700" />}
          <span>{msg.text}</span>
        </div>
      )}

      {/* Top Header Row */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Sensor Devices
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            {devicesList.length} registered inclinometer hardware nodes (Click any node to open live dashboard)
          </p>
        </div>

        {/* Action Button */}
        <button
          onClick={handleOpenAdd}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs rounded-xl shadow-xs transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Add Device</span>
        </button>
      </div>

      {/* Devices Table */}
      <div className={cardCls}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 uppercase text-[10px] tracking-wider">
                <th className="py-3 px-3.5">Device ID & Name</th>
                <th className="py-3 px-3.5">Attached Asset / Site</th>
                <th className="py-3 px-3.5">Battery</th>
                <th className="py-3 px-3.5">Signal (RSSI)</th>
                <th className="py-3 px-3.5">Config (Sleep / Wake)</th>
                <th className="py-3 px-3.5">Status</th>
                <th className="py-3 px-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {devicesList.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400 text-xs">
                    No devices registered yet. Click "+ Add Device" to add an inclinometer sensor node.
                  </td>
                </tr>
              ) : (
                devicesList.map(dev => {
                  const struct = structuresList.find(s => s.id === dev.structureId);
                  const site = sitesList.find(s => s.id === dev.siteId || s.siteId === dev.siteId);

                  return (
                    <tr
                      key={dev.id}
                      onClick={() => navigate(`/devices/${dev.id}`)}
                      className="hover:bg-blue-50/40 transition-colors cursor-pointer group"
                    >
                      <td className="py-3.5 px-3.5">
                        <div className="font-semibold text-slate-900 group-hover:text-blue-600 transition-colors flex items-center gap-1.5">
                          <span>{dev.name || dev.id}</span>
                          <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600" />
                        </div>
                        <div className="text-[11px] font-mono text-slate-500 mt-0.5">{dev.id}</div>
                      </td>
                      <td className="py-3.5 px-3.5">
                        <div className="text-slate-800">{struct?.name || 'No Asset Attached'}</div>
                        <div className="text-[11px] text-slate-500">{site?.name || dev.siteId || 'Standalone'}</div>
                      </td>
                      <td className="py-3.5 px-3.5 font-mono">
                        {dev.battery || '100%'}
                      </td>
                      <td className="py-3.5 px-3.5 font-mono">
                        {dev.signalStrength || dev.signal || '14'}
                      </td>
                      <td className="py-3.5 px-3.5 font-mono text-[11px]">
                        {dev.sleep_count || 60}M / {dev.wake_count || 30}S
                      </td>
                      <td className="py-3.5 px-3.5">
                        <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold text-[10px]">
                          {dev.status || 'ONLINE'}
                        </span>
                      </td>
                      <td className="py-3.5 px-3.5 text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={(e) => handleOpenConfig(dev, e)}
                            title="Configure Sampling & Calibration"
                            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                          >
                            <Sliders className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => handleOpenEdit(dev, e)}
                            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => handleDelete(dev.id, e)}
                            className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal 1: Add / Edit Device */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 font-sans">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-base font-bold text-slate-900">
                {editingDevice ? 'Edit Device Node' : 'Register New Device'}
              </h3>
              <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Device ID / Hardware Serial *</label>
                <input
                  type="text"
                  required
                  disabled={!!editingDevice}
                  value={formData.id}
                  onChange={e => setFormData({ ...formData, id: e.target.value })}
                  placeholder="e.g. TECHA12346"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-mono text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Device Name *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Sensor Node 01"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Attach to Structural Asset (Optional)</label>
                <select
                  value={formData.structureId}
                  onChange={e => {
                    const stId = e.target.value;
                    const st = structuresList.find(s => s.id === stId);
                    setFormData({ ...formData, structureId: stId, siteId: st?.siteId || formData.siteId });
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">No Asset (Standalone Device)</option>
                  {structuresList.map(st => (
                    <option key={st.id} value={st.id}>{st.name} ({st.id})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Location Site (Optional)</label>
                <select
                  value={formData.siteId}
                  onChange={e => setFormData({ ...formData, siteId: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Select Location</option>
                  {sitesList.map(s => (
                    <option key={s.id || s.siteId} value={s.id || s.siteId}>{s.name} ({s.id || s.siteId})</option>
                  ))}
                </select>
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-xs transition-colors cursor-pointer"
                >
                  Save Device
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Telemetry Sampling & Calibration Config (Min 60M) */}
      {configModalOpen && selectedDevice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 font-sans">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Configure Device {selectedDevice.id}
                </h3>
                <p className="text-xs text-slate-500 font-medium">Sampling Interval (Min 15M) & Parameters</p>
              </div>
              <button onClick={() => setConfigModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveConfig} className="space-y-4 text-xs">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="font-semibold text-slate-700">
                    Sleep Count (Minutes)
                  </label>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                      Current: {selectedDevice?.sleep_count !== undefined ? selectedDevice.sleep_count : '-'}M
                    </span>
                    <span className="text-[10px] font-mono text-blue-600 font-semibold bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                      Min 15M
                    </span>
                  </div>
                </div>
                <input
                  type="number"
                  required
                  min="15"
                  max="1440"
                  placeholder="e.g. 15"
                  value={configForm.sleep_count}
                  onChange={e => setConfigForm({ ...configForm, sleep_count: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-mono text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <p className="text-[10px] text-slate-400 mt-1">Minimum allowed interval is 15 minutes.</p>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-slate-700 font-semibold">
                    Wake Count (Seconds)
                  </label>
                  <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                    Current: {selectedDevice?.wake_count !== undefined ? selectedDevice.wake_count : '-'}s
                  </span>
                </div>
                <input
                  type="number"
                  required
                  min="1"
                  max="3600"
                  placeholder="e.g. 30"
                  value={configForm.wake_count}
                  onChange={e => setConfigForm({ ...configForm, wake_count: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-mono text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-900">Calibrate Zero Offset</div>
                  <div className="text-[11px] text-slate-500">
                    Current: {selectedDevice?.calibrate ? 'Calibrated (Active)' : 'Standard / Uncalibrated'}
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={configForm.calibrate}
                  onChange={e => setConfigForm({ ...configForm, calibrate: e.target.checked })}
                  className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setConfigModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-xs transition-colors cursor-pointer"
                >
                  Deploy Configuration
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
