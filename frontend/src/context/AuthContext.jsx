import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('epic_token'));
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('epic_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [isLoading, setIsLoading] = useState(true);

  const logout = useCallback(async () => {
    try {
      if (token) {
        await api.post('/api/auth/logout', {});
      }
    } catch {
      // Ignore network errors on logout
    } finally {
      localStorage.removeItem('epic_token');
      localStorage.removeItem('epic_user');
      setToken(null);
      setUser(null);
    }
  }, [token]);

  const refreshProfile = useCallback(async () => {
    const currentToken = localStorage.getItem('epic_token');
    if (!currentToken) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    try {
      const res = await api.get('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          setUser(data.user);
          localStorage.setItem('epic_user', JSON.stringify(data.user));
        }
      } else if (res.status === 401 || res.status === 403) {
        logout();
      }
    } catch (err) {
      console.warn('[Auth] Background profile refresh failed:', err);
    } finally {
      setIsLoading(false);
    }
  }, [logout]);

  // Initial load
  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  // Dynamic real-time synchronization: BroadcastChannel, storage event, focus, and fast polling
  useEffect(() => {
    const handleFocus = () => refreshProfile();
    const handleAuthExpired = () => logout();
    const handleRefreshEvent = () => refreshProfile();
    const handleStorage = (e) => {
      if (e.key === 'epic_permissions_updated_at') {
        refreshProfile();
      }
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('epic_auth_expired', handleAuthExpired);
    window.addEventListener('epic_auth_refresh', handleRefreshEvent);
    window.addEventListener('storage', handleStorage);

    // Multi-tab BroadcastChannel for zero-latency cross-tab permission sync
    let bc = null;
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        bc = new BroadcastChannel('epic_auth_sync');
        bc.onmessage = (event) => {
          if (event.data?.type === 'PERMISSIONS_UPDATED') {
            refreshProfile();
          }
        };
      }
    } catch (e) {
      // BroadcastChannel fallback silently handled
    }

    // Fast background sync (every 4s) so changes take effect without manual reload
    const interval = setInterval(refreshProfile, 4000);

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('epic_auth_expired', handleAuthExpired);
      window.removeEventListener('epic_auth_refresh', handleRefreshEvent);
      window.removeEventListener('storage', handleStorage);
      if (bc) bc.close();
      clearInterval(interval);
    };
  }, [refreshProfile, logout]);

  const login = async (emailOrUsername, password) => {
    const cleanId = (emailOrUsername || '').trim();
    const cleanPass = (password || '').trim();
    const res = await api.post('/api/auth/login', {
      email: cleanId,
      username: cleanId,
      password: cleanPass
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.detail || 'Login failed. Please check credentials.');
    }
    const data = await res.json();
    localStorage.setItem('epic_token', data.token);
    localStorage.setItem('epic_user', JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
    return data.user;
  };

  const hasPermission = useCallback((permKey) => {
    if (!user) return false;
    if (user.is_superadmin) return true;
    if (!user.permissions || !Array.isArray(user.permissions)) return false;
    if (user.permissions.includes('*')) return true;
    return user.permissions.includes(permKey);
  }, [user]);

  const value = {
    user,
    token,
    isAuthenticated: Boolean(token && user),
    isLoading,
    login,
    logout,
    refreshProfile,
    hasPermission
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
