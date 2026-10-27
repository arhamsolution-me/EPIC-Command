import React, { useState, useRef, useEffect } from 'react';
import { LogOut, User as UserIcon, ChevronDown, ChevronUp, KeyRound } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function TopHeader({
  activeNav,
  onOpenChangePassword = () => { },
  isSidebarOpen = true,
  onToggleSidebar = () => { }
}) {
  const { user, logout } = useAuth();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  const titles = {
    dashboard: 'Dashboard',
    monitor: 'Live Monitor',
    nvrs: 'NVR',
    agents: 'Agent',
    locations: 'Locations',
    users: 'Users',
    roles: 'Roles & Permissions'
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    setIsDropdownOpen(false);
    if (window.confirm('Are you sure you want to log out of EPIC Command?')) {
      logout();
    }
  };

  return (
    <header className="top-header-bar" style={{
      width: '100%',
      height: '64px',
      background: '#ffffff',
      borderBottom: '1px solid #e2e8f0',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 32px',
      position: 'sticky',
      top: 0,
      zIndex: 40,
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.02)',
      boxSizing: 'border-box'
    }}>
      {/* Left: Page Title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <h1 style={{
          fontSize: '1.24rem',
          fontWeight: 700,
          color: '#0f172a',
          letterSpacing: '-0.02em',
          margin: 0
        }}>
          {titles[activeNav] || 'Surveillance Management'}
        </h1>
      </div>

      {/* Right: User Profile Group matching user screenshot Image 1 */}
      <div
        ref={dropdownRef}
        style={{ position: 'relative' }}
      >
        <div
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          title="User Account Options"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            cursor: 'pointer',
            userSelect: 'none',
            padding: '4px 6px',
            borderRadius: '8px',
            transition: 'background 0.15s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#f8fafc';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
          }}
        >
          {/* Avatar: Circular with light mint background and green User outline icon */}
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            background: '#ecfdf5',
            border: '1.5px solid #a7f3d0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#059669',
            flexShrink: 0
          }}>
            <UserIcon size={18} strokeWidth={2.4} />
          </div>

          {/* Small peach/pink rounded square with chevron icon */}
          <div style={{
            width: '24px',
            height: '24px',
            borderRadius: '6px',
            background: '#fff1f2',
            border: '1px solid #ffe4e6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginLeft: '4px',
            transition: 'all 0.15s ease'
          }}>
            {isDropdownOpen ? (
              <ChevronUp
                size={14}
                color="#f43f5e"
                strokeWidth={2.5}
              />
            ) : (
              <ChevronDown
                size={14}
                color="#f43f5e"
                strokeWidth={2.5}
              />
            )}
          </div>
        </div>

        {/* Profile Dropdown Menu matching user screenshot Image 1 */}
        {isDropdownOpen && (
          <div style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 6px)',
            width: '185px',
            background: '#ffffff',
            borderRadius: '10px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
            padding: '6px',
            zIndex: 100,
            animation: 'fadeIn 0.12s ease'
          }}>
            {/* Change Password Item */}
            <button
              type="button"
              onClick={() => {
                setIsDropdownOpen(false);
                onOpenChangePassword();
              }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '9px 12px',
                background: 'transparent',
                border: 'none',
                borderRadius: '6px',
                color: '#334155',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'background 0.15s ease'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <KeyRound size={16} color="#64748b" />
              <span>Change Password</span>
            </button>

            {/* Logout Item in red */}
            <button
              type="button"
              onClick={handleLogout}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '9px 12px',
                background: 'transparent',
                border: 'none',
                borderRadius: '6px',
                color: '#ef4444',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'background 0.15s ease',
                marginTop: '2px'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#fef2f2'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <LogOut size={16} color="#ef4444" />
              <span>Logout</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

