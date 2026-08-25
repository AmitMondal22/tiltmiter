import React, { createContext, useContext, useState, useEffect } from 'react';
import { loginUser, getUserProfile } from '../api/apiClient';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [token, setToken] = useState(localStorage.getItem('tiltmeter_jwt_token') || null);
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem('tiltmeter_user');
    if (savedUser && token) {
      try {
        return JSON.parse(savedUser);
      } catch (e) {
        return null;
      }
    }
    return null;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      getUserProfile()
        .then(res => {
          if (res?.user) {
            setUser(res.user);
            localStorage.setItem('tiltmeter_user', JSON.stringify(res.user));
          }
        })
        .catch(() => {
          // Token invalid or expired
          localStorage.removeItem('tiltmeter_jwt_token');
          localStorage.removeItem('tiltmeter_refresh_token');
          localStorage.removeItem('tiltmeter_user');
          setToken(null);
          setUser(null);
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      setUser(null);
      setLoading(false);
    }
  }, [token]);

  const login = async (username, password) => {
    setLoading(true);
    try {
      const res = await loginUser(username, password);
      setUser(res.user);
      setToken(res.accessToken || res.token);
      setLoading(false);
      return res;
    } catch (err) {
      setLoading(false);
      throw err;
    }
  };

  const logout = () => {
    localStorage.removeItem('tiltmeter_jwt_token');
    localStorage.removeItem('tiltmeter_refresh_token');
    localStorage.removeItem('tiltmeter_user');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, isAuthenticated: !!user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
