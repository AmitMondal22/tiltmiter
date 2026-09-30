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
            
            if (res.user.role === 'SUPER_ADMIN') {
              // Super Admin always uses default platform logo
              localStorage.removeItem('tiltmeter_org_logo');
              localStorage.removeItem('tiltmeter_org_name');
            } else {
              // Organization users use their organization custom logo
              const orgLogo = res.user.Organization?.logoUrl || res.user.organizationLogo;
              if (orgLogo) {
                localStorage.setItem('tiltmeter_org_logo', orgLogo);
              } else {
                localStorage.removeItem('tiltmeter_org_logo');
              }
              if (res.user.Organization?.name) {
                localStorage.setItem('tiltmeter_org_name', res.user.Organization.name);
              }
            }
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
      
      if (res.user?.role === 'SUPER_ADMIN') {
        // Super Administrator uses platform default logo
        localStorage.removeItem('tiltmeter_org_logo');
        localStorage.removeItem('tiltmeter_org_name');
      } else {
        // Organization user saves organization custom logo to temporary browser cache
        const orgLogo = res.user?.Organization?.logoUrl || res.user?.organizationLogo;
        if (orgLogo) {
          localStorage.setItem('tiltmeter_org_logo', orgLogo);
        } else {
          localStorage.removeItem('tiltmeter_org_logo');
        }
        if (res.user?.Organization?.name) {
          localStorage.setItem('tiltmeter_org_name', res.user.Organization.name);
        }
      }
      
      setLoading(false);
      return res;
    } catch (err) {
      setLoading(false);
      throw err;
    }
  };

  const updateOrgLogo = (newLogoUrl) => {
    if (newLogoUrl) {
      localStorage.setItem('tiltmeter_org_logo', newLogoUrl);
    } else {
      localStorage.removeItem('tiltmeter_org_logo');
    }
    setUser(prev => {
      if (!prev) return prev;
      const updatedOrg = { ...(prev.Organization || {}), logoUrl: newLogoUrl };
      const updatedUser = { ...prev, Organization: updatedOrg, organizationLogo: newLogoUrl };
      localStorage.setItem('tiltmeter_user', JSON.stringify(updatedUser));
      return updatedUser;
    });
  };

  const logout = () => {
    const isSuper = user?.role === 'SUPER_ADMIN';
    localStorage.removeItem('tiltmeter_jwt_token');
    localStorage.removeItem('tiltmeter_refresh_token');
    localStorage.removeItem('tiltmeter_user');
    
    // If Super Admin logged out, ensure default logo is restored on login screen
    if (isSuper) {
      localStorage.removeItem('tiltmeter_org_logo');
      localStorage.removeItem('tiltmeter_org_name');
    }
    
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, isAuthenticated: !!user, login, logout, updateOrgLogo }}>
      {children}
    </AuthContext.Provider>
  );
}


export function useAuth() {
  return useContext(AuthContext);
}
