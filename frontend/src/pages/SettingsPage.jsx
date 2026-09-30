import React, { useState, useEffect, useRef } from 'react';
import { Settings, Save, CheckCircle2, Sliders, Shield, Upload, Trash2, Image as ImageIcon, AlertTriangle, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getOrganizations, uploadOrganizationLogo, deleteOrganizationLogo, getOrganizationLogo } from '../api/apiClient';
import defaultAppLogo from '../assets/logo/logo250x150.png';

const MAX_LOGO_SIZE_BYTES = 2.5 * 1024 * 1024; // 2.5 MB

export default function SettingsPage() {
  const { user, updateOrgLogo } = useAuth();
  const cardCls = 'rounded-2xl border p-5 transition-all bg-white border-slate-200/80 text-slate-900 shadow-xs';

  const fileInputRef = useRef(null);
  const [currentLogo, setCurrentLogo] = useState(user?.Organization?.logoUrl || user?.organizationLogo || null);
  const [logoPreview, setLogoPreview] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState('');
  const [logoSuccess, setLogoSuccess] = useState('');

  const [samplingRate, setSamplingRate] = useState('1000');
  const [retentionDays, setRetentionDays] = useState('365');
  const [autoZeroOffset, setAutoZeroOffset] = useState(true);
  const [savedNotice, setSavedNotice] = useState(false);

  // Fetch latest organization logo
  useEffect(() => {
    getOrganizationLogo()
      .then(res => {
        if (res?.logoUrl !== undefined) {
          setCurrentLogo(res.logoUrl);
          updateOrgLogo?.(res.logoUrl);
        }
      })
      .catch(() => {});
  }, []);

  const handleFileSelect = (e) => {
    setLogoError('');
    setLogoSuccess('');
    const file = e.target.files?.[0];
    if (!file) return;

    // 1. Validate file format
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      setLogoError('Unsupported format. Please select a PNG, JPG, WebP, or SVG image.');
      return;
    }

    // 2. Validate maximum file size limit (2.5MB)
    if (file.size > MAX_LOGO_SIZE_BYTES) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
      setLogoError(`File size (${sizeMB} MB) exceeds the 2.5 MB maximum limit. Please upload a smaller image file.`);
      return;
    }

    setSelectedFile(file);

    // Read preview as Data URL
    const reader = new FileReader();
    reader.onload = () => {
      setLogoPreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleUploadLogo = async () => {
    if (!logoPreview) return;
    setLogoUploading(true);
    setLogoError('');
    setLogoSuccess('');

    try {
      const orgId = user?.organizationId || 1;
      const res = await uploadOrganizationLogo(orgId, logoPreview);
      const newLogoUrl = res?.logoUrl || logoPreview;
      setCurrentLogo(newLogoUrl);
      setLogoPreview(null);
      setSelectedFile(null);
      updateOrgLogo?.(newLogoUrl);
      setLogoSuccess('Organization logo uploaded and updated successfully!');
      setTimeout(() => setLogoSuccess(''), 4000);
    } catch (err) {
      setLogoError(err.message || 'Error uploading custom logo.');
    } finally {
      setLogoUploading(false);
    }
  };

  const handleDeleteLogo = async () => {
    if (!currentLogo) return;
    if (window.confirm('Are you sure you want to remove the custom logo and revert to the default platform logo?')) {
      setLogoUploading(true);
      setLogoError('');
      setLogoSuccess('');
      try {
        const orgId = user?.organizationId || 1;
        await deleteOrganizationLogo(orgId);
        setCurrentLogo(null);
        setLogoPreview(null);
        setSelectedFile(null);
        updateOrgLogo?.(null);
        setLogoSuccess('Custom logo removed. Default platform logo restored.');
        setTimeout(() => setLogoSuccess(''), 4000);
      } catch (err) {
        setLogoError(err.message || 'Error removing logo.');
      } finally {
        setLogoUploading(false);
      }
    }
  };

  const handleCancelPreview = () => {
    setLogoPreview(null);
    setSelectedFile(null);
    setLogoError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSave = (e) => {
    e.preventDefault();
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 3000);
  };

  return (
    <div className="space-y-4 font-sans text-slate-900 animate-fadeIn">
      {/* Toast Notice */}
      {savedNotice && (
        <div className="p-3.5 rounded-xl border flex items-center gap-2 text-xs font-semibold bg-emerald-50 border-emerald-200 text-emerald-800 shadow-sm animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>System Settings updated successfully.</span>
        </div>
      )}

      {/* Top Header Row */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-950 flex items-center gap-2">
            <Settings className="w-6 h-6 text-blue-600" />
            <span>Platform & Organization Settings</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Custom brand logo upload, telemetry sampling rates, and sensor calibrations
          </p>
        </div>

        {/* Black Pill Save Button */}
        <button
          onClick={handleSave}
          className="flex items-center gap-1.5 px-5 py-2.5 bg-black text-white font-bold text-xs rounded-xl shadow-xs hover:bg-neutral-800 transition-all cursor-pointer"
        >
          <Save className="w-4 h-4" />
          <span>Save Preferences</span>
        </button>
      </div>

      {/* 1. Custom Organization Brand Logo Upload */}
      <div className={cardCls}>
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-blue-600" />
            <div>
              <h3 className="text-sm font-black text-slate-950">Organization Brand Logo</h3>
              <p className="text-[11px] text-slate-500">
                Upload a custom logo to display across your platform navigation, login, and reports
              </p>
            </div>
          </div>
          <div className="text-[11px] font-bold text-slate-500 font-mono bg-slate-100 px-2.5 py-1 rounded-lg">
            Max Size: 2.5 MB
          </div>
        </div>

        {/* Status Alerts */}
        {logoError && (
          <div className="mb-4 p-3 rounded-xl border border-red-200 bg-red-50 text-red-700 text-xs font-bold flex items-center gap-2 animate-fadeIn">
            <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
            <span>{logoError}</span>
          </div>
        )}

        {logoSuccess && (
          <div className="mb-4 p-3 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs font-bold flex items-center gap-2 animate-fadeIn">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>{logoSuccess}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
          {/* Logo Display Box */}
          <div className="flex flex-col items-center justify-center p-6 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/70 text-center min-h-[160px]">
            <div className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 mb-2">
              {logoPreview ? 'New Logo Preview' : currentLogo ? 'Active Organization Logo' : 'Default Platform Logo'}
            </div>
            <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs max-h-24 flex items-center justify-center">
              <img
                src={logoPreview || currentLogo || defaultAppLogo}
                alt="Brand Logo"
                className="max-h-16 max-w-full object-contain"
              />
            </div>
            {selectedFile && (
              <div className="mt-2 text-[10px] text-slate-500 font-mono">
                {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
              </div>
            )}
          </div>

          {/* Action & Controls */}
          <div className="space-y-3">
            <input
              type="file"
              ref={fileInputRef}
              accept="image/png, image/jpeg, image/jpg, image/svg+xml, image/webp"
              onChange={handleFileSelect}
              className="hidden"
            />

            {!logoPreview ? (
              <div className="space-y-2">
                <div className="text-xs text-slate-600 font-medium">
                  Select a new image file to replace the current logo. Supports <span className="font-bold">PNG, JPG, SVG, WebP</span> up to <span className="font-bold">2.5 MB</span>.
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition-all cursor-pointer"
                  >
                    <Upload className="w-4 h-4" />
                    <span>{currentLogo ? 'Replace Custom Logo' : 'Upload New Logo'}</span>
                  </button>

                  {currentLogo && (
                    <button
                      type="button"
                      onClick={handleDeleteLogo}
                      disabled={logoUploading}
                      className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 font-bold text-xs transition-all cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Remove & Revert to Default</span>
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-2 animate-fadeIn">
                <div className="text-xs font-bold text-slate-800">
                  Ready to apply new logo? Click "Save & Apply Logo" to delete the old logo and use the new one.
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleUploadLogo}
                    disabled={logoUploading}
                    className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-all cursor-pointer"
                  >
                    {logoUploading ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4" />
                    )}
                    <span>Save & Apply Logo</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleCancelPreview}
                    disabled={logoUploading}
                    className="px-4 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold text-xs transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. Hardware Telemetry Sampling & Storage */}
      <div className={cardCls}>
        <div className="flex items-center gap-2 mb-3">
          <Sliders className="w-4 h-4 text-slate-700" />
          <h3 className="text-sm font-bold text-slate-950">Hardware Telemetry Sampling & Ingestion</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/60 space-y-2">
            <label className="block font-bold">Telemetry Ingestion Interval (ms)</label>
            <select
              value={samplingRate}
              onChange={e => setSamplingRate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-mono font-bold"
            >
              <option value="500">500 ms (High Frequency)</option>
              <option value="1000">1000 ms (Standard Real-time)</option>
              <option value="5000">5000 ms (Low Power)</option>
            </select>
          </div>

          <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/60 space-y-2">
            <label className="block font-bold">Data Retention Policy</label>
            <select
              value={retentionDays}
              onChange={e => setRetentionDays(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-mono font-bold"
            >
              <option value="90">90 Days</option>
              <option value="365">365 Days (1 Year)</option>
              <option value="1095">3 Years</option>
            </select>
          </div>
        </div>
      </div>

      {/* 3. Automatic Drift Calibration */}
      <div className={cardCls}>
        <div className="flex items-center gap-2 mb-3">
          <Shield className="w-4 h-4 text-slate-700" />
          <h3 className="text-sm font-bold text-slate-950">Sensor Calibration & Baseline</h3>
        </div>
        <div className="flex items-center justify-between p-4 rounded-xl border border-slate-100 bg-slate-50/60 text-xs">
          <div>
            <div className="font-bold text-slate-900">Auto Zero Offset Compensation</div>
            <div className="text-slate-500 text-[11px]">Auto-compensate initial structural baseline offsets upon deployment</div>
          </div>
          <button
            type="button"
            onClick={() => setAutoZeroOffset(!autoZeroOffset)}
            className={`px-4 py-2 rounded-xl font-bold font-mono text-xs border transition-all cursor-pointer ${
              autoZeroOffset ? 'bg-black text-white shadow-xs' : 'bg-slate-200 text-slate-700'
            }`}
          >
            {autoZeroOffset ? 'ENABLED' : 'DISABLED'}
          </button>
        </div>
      </div>
    </div>
  );
}

