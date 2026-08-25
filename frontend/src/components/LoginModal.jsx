import React, { useState } from 'react';
import { X, Lock, User, CheckCircle2, Shield } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function LoginModal({ isOpen, onClose, forceOpen }) {
  const { login } = useAuth();
  const [username, setUsername] = useState('superadmin');
  const [password, setPassword] = useState('superadmin123');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const res = await login(username, password);
      setSuccess(`Welcome back, ${res.user.fullName}!`);
      setTimeout(() => {
        setSuccess('');
        if (onClose) onClose();
      }, 800);
    } catch (err) {
      setError(err.message || 'Invalid login credentials');
    } finally {
      setLoading(false);
    }
  };

  const quickSelectRole = (user, pass) => {
    setUsername(user);
    setPassword(pass);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 font-sans">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl p-6 sm:p-7 text-black transition-all">
        {/* Logo & Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-black text-white flex items-center justify-center shadow-xs flex-shrink-0">
              <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 3v3" />
                <path d="M12 18v3" />
                <path d="M3 12h3" />
                <path d="M18 12h3" />
                <circle cx="12" cy="12" r="2.5" fill="currentColor" />
                <path d="M8 8l8 8" strokeWidth="1.5" strokeDasharray="1 1.5" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-black text-black">TiltMeter Sign In</h2>
              <p className="text-xs text-slate-600 font-bold">Inclinometer Monitoring Platform</p>
            </div>
          </div>
          {!forceOpen && onClose && (
            <button onClick={onClose} className="p-1.5 rounded-lg text-black hover:bg-slate-100 transition-colors">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold animate-fadeIn">
            {error}
          </div>
        )}

        {success && (
          <div className="mt-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2 animate-fadeIn">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>{success}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div>
            <label className="block text-xs font-black text-black mb-1.5">
              Username / Operator ID
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-black absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="superadmin"
                className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border-2 border-slate-300 bg-white text-black font-bold text-xs focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-black text-black mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-black absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border-2 border-slate-300 bg-white text-black font-bold text-xs focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-black hover:bg-neutral-800 text-white font-extrabold text-xs shadow-xs transition-all flex items-center justify-center gap-2"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <span>Sign In to Platform</span>
            )}
          </button>
        </form>

        {/* Quick RBAC Demo Selector */}
        <div className="mt-5 pt-4 border-t border-slate-200">
          <div className="text-[11px] font-black uppercase tracking-wider text-slate-600 mb-2">
            Demo Credentials
          </div>
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <button
              type="button"
              onClick={() => quickSelectRole('superadmin', 'superadmin123')}
              className="p-2 rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 text-left font-bold"
            >
              <div className="text-black">Super Admin</div>
              <div className="text-[10px] text-slate-500 font-mono">superadmin</div>
            </button>
            <button
              type="button"
              onClick={() => quickSelectRole('siteuser', 'user123')}
              className="p-2 rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 text-left font-bold"
            >
              <div className="text-black">Site Operator</div>
              <div className="text-[10px] text-slate-500 font-mono">siteuser</div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
