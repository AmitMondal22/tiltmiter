import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, User, CheckCircle2, ShieldCheck, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import till360Logo from '../assets/logo/till360.png';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState('superadmin');
  const [password, setPassword] = useState('superadmin123');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const res = await login(username, password);
      setSuccess(`Welcome back, ${res.user.fullName || res.user.username}!`);
      setTimeout(() => {
        navigate('/');
      }, 500);
    } catch (err) {
      setError(err.message || 'Invalid login credentials');
    } finally {
      setLoading(false);
    }
  };

  const quickSelect = (u, p) => {
    setUsername(u);
    setPassword(p);
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-100/80 p-4 font-sans text-slate-800">
      <div className="w-full max-w-md bg-white border border-slate-200/90 rounded-3xl shadow-xl p-8 sm:p-10 space-y-6">
        {/* Brand Logo & Header */}
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="h-16 flex items-center justify-center">
            <img
              src={till360Logo}
              alt="Tilt360 Logo"
              className="max-h-14 max-w-full object-contain"
            />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              Sign In to Platform
            </h1>
            <p className="text-xs text-slate-500 font-medium mt-1">
              Industrial Inclinometer Telemetry & Safety Platform
            </p>
          </div>
        </div>

        {/* Error / Success Alerts */}
        {error && (
          <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold animate-fadeIn">
            {error}
          </div>
        )}

        {success && (
          <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2 animate-fadeIn">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Username / Operator ID
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="superadmin"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 font-medium text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 font-medium text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-md shadow-blue-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <span>Sign In</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </form>

        {/* Quick Demo Credentials */}
        <div className="pt-4 border-t border-slate-100">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2 text-center">
            Demo Credentials
          </div>
          <div className="flex gap-2 text-xs">
            <button
              type="button"
              onClick={() => quickSelect('superadmin', 'superadmin123')}
              className="flex-1 p-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-center font-medium transition-colors"
            >
              <div className="text-slate-800 text-[11px] font-semibold">Super Admin</div>
              <div className="text-[10px] text-slate-500 font-mono">superadmin</div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
