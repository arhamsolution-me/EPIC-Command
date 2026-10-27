import React, { useState } from 'react';
import {
  LayoutGrid,
  Video,
  Server,
  Cpu,
  Building2,
  Globe,
  Building,
  Map,
  MapPin,
  Settings,
  Users,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Shield,
  FileText,
  LogOut
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function Sidebar({
  activeNav,
  setActiveNav,
  locationSubTab = 'provinces',
  setLocationSubTab = () => { },
  counts = {},
  isSidebarOpen = true,
  onToggleSidebar = () => {}
}) {
  const { user, hasPermission, logout } = useAuth();
  const [isLocationOpen, setIsLocationOpen] = useState(true);

  return (
    <aside
      className={`sidebar epic-sidebar-v2 ${!isSidebarOpen ? 'collapsed' : ''}`}
      style={{
        width: isSidebarOpen ? '250px' : '68px',
        minWidth: isSidebarOpen ? '250px' : '68px',
        overflow: 'hidden',
        transition: 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1), min-width 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        borderRight: '1px solid var(--border-color)',
        pointerEvents: 'auto',
        position: 'relative'
      }}
    >
      {/* Brand Header with Collapse / Expand Toggle */}
      <div
        className="sidebar-brand-v2"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: isSidebarOpen ? 'space-between' : 'center',
          padding: isSidebarOpen ? '16px 16px' : '16px 0',
          cursor: !isSidebarOpen ? 'pointer' : 'default'
        }}
        onClick={() => {
          if (!isSidebarOpen) onToggleSidebar(true);
        }}
        title={!isSidebarOpen ? 'Click to expand sidebar' : ''}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div className="sidebar-brand-icon" style={{ margin: isSidebarOpen ? '0' : 'auto' }}>
            <Shield size={24} color="#059669" strokeWidth={2.4} />
            <div className="sidebar-brand-inner-dot"></div>
          </div>
          {isSidebarOpen && (
            <div className="sidebar-brand-text">
              <span>EPIC Command</span>
            </div>
          )}
        </div>

        {isSidebarOpen && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleSidebar(false);
            }}
            title="Collapse Sidebar"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '5px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#ffffff';
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = '#94a3b8';
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <ChevronLeft size={18} />
          </button>
        )}
      </div>

      <div className="sidebar-nav-list">
        {/* 1. Dashboard */}
        {hasPermission('DASHBOARD_VIEW') && (
          <button
            type="button"
            className={`sidebar-nav-btn ${activeNav === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveNav('dashboard')}
            title="Dashboard"
          >
            <LayoutGrid size={18} className="nav-icon" />
            <span className="nav-label">Dashboard</span>
          </button>
        )}

        {/* 2. Live Monitoring */}
        {hasPermission('LIVE_MONITOR_VIEW') && (
          <button
            type="button"
            className={`sidebar-nav-btn ${activeNav === 'monitor' ? 'active' : ''}`}
            onClick={() => setActiveNav('monitor')}
            title="Live Monitoring"
          >
            <Video size={18} className="nav-icon" />
            <span className="nav-label">Live Monitoring</span>
          </button>
        )}

        {/* 3. NVRs */}
        {hasPermission('NVR_VIEW') && (
          <button
            type="button"
            className={`sidebar-nav-btn ${activeNav === 'nvrs' ? 'active' : ''}`}
            onClick={() => setActiveNav('nvrs')}
            title="NVRs"
          >
            <Server size={18} className="nav-icon" />
            <span className="nav-label">NVRs</span>
            {counts.nvrs !== undefined && counts.nvrs !== null && (
              <span className="nav-badge-count">{counts.nvrs}</span>
            )}
          </button>
        )}

        {/* 4. Agents */}
        {hasPermission('AGENT_VIEW') && (
          <button
            type="button"
            className={`sidebar-nav-btn ${activeNav === 'agents' ? 'active' : ''}`}
            onClick={() => setActiveNav('agents')}
            title="Agents"
          >
            <Cpu size={18} className="nav-icon" />
            <span className="nav-label">Agents</span>
            {counts.agents !== undefined && counts.agents !== null && (
              <span className="nav-badge-count">{counts.agents}</span>
            )}
          </button>
        )}

        {/* 5. Locations Accordion */}
        {hasPermission('LOCATION_VIEW') && (
          <div className="sidebar-accordion">
            <button
              type="button"
              className={`sidebar-nav-btn ${activeNav === 'locations' ? 'active' : ''}`}
              onClick={() => {
                setActiveNav('locations');
                if (isSidebarOpen) {
                  setIsLocationOpen(!isLocationOpen);
                } else {
                  onToggleSidebar(true);
                  setIsLocationOpen(true);
                }
              }}
              title="Locations"
            >
              <MapPin size={18} className="nav-icon" />
              <span className="nav-label">Locations</span>
              <span className="nav-chevron" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
                {isLocationOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </span>
            </button>

            {isLocationOpen && isSidebarOpen && (
              <div className="sidebar-subnav-list" style={{ paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '2px' }}>
                <button
                  type="button"
                  className={`sidebar-subnav-btn ${activeNav === 'locations' && locationSubTab === 'provinces' ? 'sub-active' : ''}`}
                  onClick={() => {
                    setActiveNav('locations');
                    setLocationSubTab('provinces');
                  }}
                >
                  <Globe size={14} className="sub-icon" />
                  <span>Provinces</span>
                </button>

                <button
                  type="button"
                  className={`sidebar-subnav-btn ${activeNav === 'locations' && locationSubTab === 'cities' ? 'sub-active' : ''}`}
                  onClick={() => {
                    setActiveNav('locations');
                    setLocationSubTab('cities');
                  }}
                >
                  <Building size={14} className="sub-icon" />
                  <span>Cities</span>
                </button>

                <button
                  type="button"
                  className={`sidebar-subnav-btn ${activeNav === 'locations' && locationSubTab === 'areas' ? 'sub-active' : ''}`}
                  onClick={() => {
                    setActiveNav('locations');
                    setLocationSubTab('areas');
                  }}
                >
                  <Map size={14} className="sub-icon" />
                  <span>Areas</span>
                </button>

                <button
                  type="button"
                  className={`sidebar-subnav-btn ${activeNav === 'locations' && locationSubTab === 'sites' ? 'sub-active' : ''}`}
                  onClick={() => {
                    setActiveNav('locations');
                    setLocationSubTab('sites');
                  }}
                >
                  <MapPin size={14} className="sub-icon" />
                  <span>Sites</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* 6. Roles & Permissions (STRICTLY SUPER ADMIN ONLY) */}
        {user?.is_superadmin && (
          <button
            type="button"
            className={`sidebar-nav-btn ${activeNav === 'roles' ? 'active' : ''}`}
            onClick={() => setActiveNav('roles')}
            title="Roles & Permissions"
          >
            <Settings size={18} className="nav-icon" />
            <span className="nav-label">Roles & Permissions</span>
          </button>
        )}

        {/* 7. Users */}
        {hasPermission('USER_VIEW') && (
          <button
            type="button"
            className={`sidebar-nav-btn ${activeNav === 'users' ? 'active' : ''}`}
            onClick={() => setActiveNav('users')}
            title="Users"
          >
            <Users size={18} className="nav-icon" />
            <span className="nav-label">Users</span>
          </button>
        )}
      </div>

      {/* SIDEBAR FOOTER: PROFILE & EXIT BUTTON */}
      <div className="sidebar-footer" style={{
        padding: isSidebarOpen ? '14px 16px' : '14px 0',
        borderTop: '1px solid #1e293b',
        background: 'rgba(15, 23, 42, 0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: isSidebarOpen ? 'space-between' : 'center',
        gap: '10px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ffffff',
            fontWeight: 800,
            fontSize: '0.8rem',
            flexShrink: 0,
            boxShadow: '0 2px 6px rgba(16, 185, 129, 0.3)'
          }} title={user?.full_name || user?.username}>
            {(user?.full_name || user?.username || 'A')[0].toUpperCase()}
          </div>
          {isSidebarOpen && (
            <div className="sidebar-footer-text" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', lineHeight: 1.2 }}>
              <span style={{
                fontSize: '0.8rem',
                fontWeight: 700,
                color: '#f8fafc',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }} title={user?.full_name || user?.username}>
                {user?.full_name || user?.username}
              </span>
              <span style={{ fontSize: '0.68rem', color: '#10b981', fontWeight: 600 }}>
                {user?.is_superadmin ? 'Super Admin' : user?.role_name || 'User'}
              </span>
            </div>
          )}
        </div>

        {isSidebarOpen && (
          <button
            type="button"
            onClick={() => {
              if (window.confirm('Are you sure you want to log out of EPIC Command?')) {
                logout();
              }
            }}
            title="Exit / Logout"
            style={{
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              color: '#f87171',
              borderRadius: '6px',
              padding: '5px 8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              fontSize: '0.72rem',
              fontWeight: 700,
              flexShrink: 0,
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#ef4444';
              e.currentTarget.style.color = '#ffffff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.12)';
              e.currentTarget.style.color = '#f87171';
            }}
          >
            <LogOut size={12} strokeWidth={2.5} />
            <span className="sidebar-footer-btn-text">Exit</span>
          </button>
        )}
      </div>
    </aside>
  );
}
