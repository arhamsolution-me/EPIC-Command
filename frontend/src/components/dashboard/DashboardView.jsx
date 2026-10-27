import React, { useState, useEffect, useRef } from 'react';
import {
  Bot,
  Server,
  Users,
  Globe,
  Building,
  Map,
  MapPin,
  Video,
  Radio,
  AlertTriangle,
  Compass,
  Camera,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  TrendingUp,
  PieChart,
  Layers,
  HardDrive
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';

export default function DashboardView({ onNavigate }) {
  const { user, hasPermission } = useAuth();
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filter States with Dropdowns
  const [histogramFilter, setHistogramFilter] = useState('agent_nvr');
  const [lineFilter, setLineFilter] = useState('line_agent_cam');
  const [donutFilter, setDonutFilter] = useState('health');
  const [distFilter, setDistFilter] = useState('geo_depth');

  // Hover states for tooltips
  const [hoveredHistBar, setHoveredHistBar] = useState(null);
  const [hoveredDonutSlice, setHoveredDonutSlice] = useState(null);

  // Mouse drag scrolling state for 12-card horizontal row
  const cardsRowRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [hasDragged, setHasDragged] = useState(false);

  const scrollCards = (direction) => {
    if (cardsRowRef.current) {
      const scrollAmount = 360;
      cardsRowRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  const handleMouseDown = (e) => {
    if (!cardsRowRef.current) return;
    setIsDragging(true);
    setStartX(e.pageX - cardsRowRef.current.offsetLeft);
    setScrollLeft(cardsRowRef.current.scrollLeft);
    setHasDragged(false);
  };

  const handleMouseMove = (e) => {
    if (!isDragging || !cardsRowRef.current) return;
    e.preventDefault();
    const x = e.pageX - cardsRowRef.current.offsetLeft;
    const walk = (x - startX) * 1.5;
    if (Math.abs(walk) > 4) {
      setHasDragged(true);
    }
    cardsRowRef.current.scrollLeft = scrollLeft - walk;
  };

  const handleMouseUpOrLeave = () => {
    setIsDragging(false);
  };

  const fetchStats = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.get('/api/dashboard/stats');
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.detail || 'Failed to load surveillance stats');
      }
    } catch (err) {
      setError(err.message || 'Network error fetching stats');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  // 12 METRIC CARDS — with nav destinations
  const topCards = [
    {
      id: 'agents',
      label: 'Total Agents',
      value: stats?.total_agents ?? 0,
      subtext: 'Edge Compute Nodes',
      icon: Bot,
      color: '#0d9488',
      bgColor: '#f0fdfa',
      permission: 'AGENT_VIEW',
      navTarget: 'agents'
    },
    {
      id: 'nvrs',
      label: 'NVR Recorders',
      value: stats?.total_nvrs ?? 0,
      subtext: 'Hardware Devices',
      icon: Server,
      color: '#2563eb',
      bgColor: '#eff6ff',
      permission: 'NVR_VIEW',
      navTarget: 'nvrs'
    },
    {
      id: 'users',
      label: 'System Users',
      value: stats?.total_users ?? 0,
      subtext: 'Operators & Admins',
      icon: Users,
      color: '#6366f1',
      bgColor: '#eef2ff',
      permission: 'USER_VIEW',
      navTarget: 'users'
    },
    {
      id: 'provinces',
      label: 'Provinces',
      value: stats?.total_provinces ?? 0,
      subtext: 'Regional Scopes',
      icon: Globe,
      color: '#059669',
      bgColor: '#ecfdf5',
      permission: 'LOCATION_VIEW',
      navTarget: 'locations'
    },
    {
      id: 'cities',
      label: 'Cities',
      value: stats?.total_cities ?? 0,
      subtext: 'Urban Jurisdictions',
      icon: Building,
      color: '#0891b2',
      bgColor: '#ecfeff',
      permission: 'LOCATION_VIEW',
      navTarget: 'locations'
    },
    {
      id: 'areas',
      label: 'Areas',
      value: stats?.total_areas ?? 0,
      subtext: 'Sectors & Districts',
      icon: Map,
      color: '#7c3aed',
      bgColor: '#faf5ff',
      permission: 'LOCATION_VIEW',
      navTarget: 'locations'
    },
    {
      id: 'sites',
      label: 'Sites',
      value: stats?.total_sites ?? 0,
      subtext: 'Physical Facilities',
      icon: MapPin,
      color: '#9333ea',
      bgColor: '#fdf4ff',
      permission: 'LOCATION_VIEW',
      navTarget: 'locations'
    },
    {
      id: 'total_cameras',
      label: 'Total Cameras',
      value: stats?.total_cameras ?? 0,
      subtext: 'Configured Channels',
      icon: Video,
      color: '#059669',
      bgColor: '#ecfdf5',
      permission: 'LIVE_MONITOR_VIEW',
      navTarget: 'monitor'
    },
    {
      id: 'online_cameras',
      label: 'Online Cameras',
      value: stats?.online_cameras ?? stats?.total_cameras ?? 0,
      subtext: 'Live RTSP Streams',
      icon: Radio,
      color: '#10b981',
      bgColor: '#f0fdf4',
      isPulse: true,
      permission: 'LIVE_MONITOR_VIEW',
      navTarget: 'monitor'
    },
    {
      id: 'offline_cameras',
      label: 'Offline Cameras',
      value: stats?.offline_cameras ?? 0,
      subtext: 'Attention Required',
      icon: AlertTriangle,
      color: '#ef4444',
      bgColor: '#fef2f2',
      permission: 'LIVE_MONITOR_VIEW',
      navTarget: 'monitor'
    },
    {
      id: 'ptz_cameras',
      label: 'PTZ Cameras',
      value: stats?.ptz_cameras ?? 0,
      subtext: 'Motorized Units',
      icon: Compass,
      color: '#8b5cf6',
      bgColor: '#f5f3ff',
      permission: 'LIVE_MONITOR_VIEW',
      navTarget: 'monitor'
    },
    {
      id: 'fixed_cameras',
      label: 'Fixed Cameras',
      value: stats?.fixed_cameras ?? 0,
      subtext: 'Static Lens Channels',
      icon: Camera,
      color: '#475569',
      bgColor: '#f8fafc',
      permission: 'LIVE_MONITOR_VIEW',
      navTarget: 'monitor'
    }
  ];

  const visibleCards = user?.is_superadmin
    ? topCards
    : topCards.filter(c => hasPermission(c.permission) || c.id.includes('camera'));

  // 1. DATA PARSER FOR HISTOGRAM (BAR CHART)
  const getHistogramData = () => {
    let items = [];
    let title = 'NVRs per Agent';
    let unit = 'NVRs';

    if (histogramFilter === 'agent_nvr') {
      title = 'NVRs per Edge Agent';
      unit = 'NVRs';
      items = (stats?.agent_histogram || []).map(a => ({
        label: a.name,
        value: a.nvr_count,
        sub: `${a.camera_count} Cameras • ${a.status}`
      }));
    } else if (histogramFilter === 'agent_cam') {
      title = 'Cameras per Edge Agent';
      unit = 'Cameras';
      items = (stats?.agent_histogram || []).map(a => ({
        label: a.name,
        value: a.camera_count,
        sub: `${a.ptz_count} PTZ • ${a.fixed_count} Fixed`
      }));
    } else if (histogramFilter === 'loc_cam') {
      title = 'Cameras per Location';
      unit = 'Cameras';
      items = (stats?.location_histogram || []).filter(l => l.type === 'province' || l.type === 'city').map(l => ({
        label: `${l.name} (${l.type})`,
        value: l.camera_count,
        sub: `${l.nvr_count} NVRs • ${l.user_count} Users`
      }));
    } else if (histogramFilter === 'loc_nvr') {
      title = 'NVRs per Location';
      unit = 'NVRs';
      items = (stats?.location_histogram || []).filter(l => l.type === 'province' || l.type === 'site').map(l => ({
        label: l.name,
        value: l.nvr_count,
        sub: `${l.camera_count} Cameras`
      }));
    } else if (histogramFilter === 'agent_user') {
      title = 'Users per Edge Agent';
      unit = 'Users';
      items = (stats?.agent_histogram || []).map(a => ({
        label: a.name,
        value: a.user_count,
        sub: `${a.nvr_count} NVRs Assigned`
      }));
    } else if (histogramFilter === 'nvr_cam') {
      title = 'Cameras per NVR';
      unit = 'Channels';
      items = (stats?.nvr_camera_histogram || []).map(n => ({
        label: n.name,
        value: n.camera_count,
        sub: `${n.online_count} Online • ${n.agent_name}`
      }));
    }

    return { title, unit, items };
  };



  // 3. DATA PARSER FOR CIRCULAR / DONUT CHART
  const getDonutData = () => {
    let title = 'Operational Health';
    let centerLabel = 'Total Cameras';
    let centerValue = stats?.total_cameras ?? 0;
    let slices = [];

    if (donutFilter === 'health') {
      title = 'Operational Health';
      centerLabel = 'Online Rate';
      const online = stats?.online_cameras ?? stats?.total_cameras ?? 0;
      const offline = stats?.offline_cameras ?? 0;
      const total = online + offline;
      centerValue = total > 0 ? `${Math.round((online / total) * 100)}%` : '100%';
      slices = [
        { label: 'Online', value: online, color: '#10b981' },
        { label: 'Offline', value: offline, color: '#ef4444' }
      ];
    } else if (donutFilter === 'ptz_fixed') {
      title = 'Camera Hardware Type';
      centerLabel = 'Total Units';
      const ptz = stats?.ptz_cameras ?? 0;
      const fixed = stats?.fixed_cameras ?? 0;
      centerValue = ptz + fixed;
      slices = [
        { label: 'PTZ Motorized', value: ptz, color: '#8b5cf6' },
        { label: 'Fixed Lens', value: fixed, color: '#64748b' }
      ];
    } else if (donutFilter === 'agents') {
      title = 'Cameras by Edge Agent';
      centerLabel = 'Cameras';
      centerValue = stats?.total_cameras ?? 0;
      const colors = ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
      slices = (stats?.agent_histogram || []).map((a, i) => ({
        label: a.name,
        value: a.camera_count,
        color: colors[i % colors.length]
      }));
    } else if (donutFilter === 'locations') {
      title = 'Regional Scope Distribution';
      centerLabel = 'Provinces';
      centerValue = stats?.total_provinces ?? 0;
      const colors = ['#059669', '#0891b2', '#7c3aed', '#f59e0b', '#3b82f6'];
      slices = (stats?.location_histogram || []).filter(l => l.type === 'province').map((p, i) => ({
        label: p.name,
        value: p.camera_count || 1,
        color: colors[i % colors.length]
      }));
    } else if (donutFilter === 'storage') {
      title = 'NVR Storage Capacity';
      centerLabel = 'Used Space';
      const used = stats?.storage_used_tb ?? 1.5;
      const total = stats?.storage_total_tb ?? 16;
      const free = Math.max(0, total - used);
      centerValue = `${used} TB`;
      slices = [
        { label: 'Used Storage', value: used, color: '#2563eb' },
        { label: 'Available Free', value: free, color: '#e2e8f0' }
      ];
    }

    return { title, centerLabel, centerValue, slices };
  };

  // 4. DATA PARSER FOR DISTRIBUTION / HORIZONTAL BARS
  const getDistData = () => {
    let title = 'Geographic Hierarchy Depth';
    let items = [];

    if (distFilter === 'geo_depth') {
      title = 'Hierarchy Depth Scopes';
      items = [
        { label: 'Provinces', value: stats?.total_provinces ?? 0, max: 6, color: '#059669', unit: 'Registered' },
        { label: 'Cities', value: stats?.total_cities ?? 0, max: 6, color: '#2563eb', unit: 'Registered' },
        { label: 'Areas / Sectors', value: stats?.total_areas ?? 0, max: 6, color: '#7c3aed', unit: 'Registered' },
        { label: 'Sites / Facilities', value: stats?.total_sites ?? 0, max: 6, color: '#0891b2', unit: 'Registered' }
      ];
    } else if (distFilter === 'nvr_channels') {
      title = 'NVR Channels Allocation';
      items = (stats?.nvr_camera_histogram || []).map(n => ({
        label: `${n.name} (${n.ip})`,
        value: n.camera_count,
        max: Math.max(...(stats?.nvr_camera_histogram || []).map(x => x.camera_count), 1),
        color: '#10b981',
        unit: `${n.online_count} Online Channels`
      }));
    } else if (distFilter === 'agent_workload') {
      title = 'Edge Agent Workload';
      items = (stats?.agent_histogram || []).map(a => ({
        label: a.name,
        value: a.camera_count,
        max: Math.max(...(stats?.agent_histogram || []).map(x => x.camera_count), 1),
        color: '#2563eb',
        unit: `${a.camera_count} Cams • ${a.nvr_count} NVRs`
      }));
    } else if (distFilter === 'user_dist') {
      title = 'Operators Assigned per Agent';
      items = (stats?.agent_histogram || []).map(a => ({
        label: a.name,
        value: a.user_count,
        max: Math.max(...(stats?.agent_histogram || []).map(x => x.user_count), 1),
        color: '#f59e0b',
        unit: `${a.user_count} Users`
      }));
    }

    return { title, items };
  };

  const histData = getHistogramData();
  const donutData = getDonutData();
  const distData = getDistData();

  const maxHistVal = Math.max(...histData.items.map(i => i.value), 1);

  return (
    <div className="dashboard-container" style={{ padding: '0 4px', width: '100%', boxSizing: 'border-box' }}>

      {/* HORIZONTAL MOVEABLE METRIC SLIDER */}
      <div style={{ marginBottom: '22px' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              System Intelligence Overview
            </span>
            <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600, background: '#f1f5f9', padding: '2px 8px', borderRadius: '12px' }}>
              {visibleCards.length} Modules Active
            </span>
          </div>

          {/* Moveable Slider Controls (< and >) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              onClick={() => scrollCards('left')}
              title="Slide Left"
              style={{
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                transition: 'all 0.15s ease',
                color: '#475569'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#f8fafc';
                e.currentTarget.style.borderColor = '#94a3b8';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#ffffff';
                e.currentTarget.style.borderColor = '#cbd5e1';
              }}
            >
              <ChevronLeft size={18} strokeWidth={2.4} />
            </button>

            <button
              type="button"
              onClick={() => scrollCards('right')}
              title="Slide Right"
              style={{
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                transition: 'all 0.15s ease',
                color: '#475569'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#f8fafc';
                e.currentTarget.style.borderColor = '#94a3b8';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#ffffff';
                e.currentTarget.style.borderColor = '#cbd5e1';
              }}
            >
              <ChevronRight size={18} strokeWidth={2.4} />
            </button>
          </div>
        </div>

        <div
          ref={cardsRowRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUpOrLeave}
          onMouseLeave={handleMouseUpOrLeave}
          style={{
            display: 'flex',
            flexWrap: 'nowrap',
            overflowX: 'auto',
            scrollBehavior: isDragging ? 'auto' : 'smooth',
            gap: '14px',
            width: '100%',
            boxSizing: 'border-box',
            paddingBottom: '10px',
            cursor: isDragging ? 'grabbing' : 'grab',
            userSelect: 'none',
            scrollbarWidth: 'thin',
            scrollbarColor: '#cbd5e1 transparent'
          }}
        >
          {visibleCards.map((card) => {
            const IconComponent = card.icon;
            const isClickable = !!card.navTarget && !!onNavigate;
            return (
              <div
                key={card.id}
                onDoubleClick={() => {
                  if (!hasDragged && isClickable) {
                    onNavigate(card.navTarget);
                  }
                }}
                title={isClickable ? `Double-click to open ${card.label}` : ''}
                style={{
                  background: '#ffffff',
                  borderRadius: '12px',
                  padding: '16px 18px 14px',
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '10px',
                  cursor: isClickable ? 'pointer' : 'default',
                  transition: 'transform 0.14s ease, box-shadow 0.14s ease',
                  minHeight: '130px',
                  boxSizing: 'border-box',
                  flex: '0 0 215px',
                  width: '215px'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-3px)';
                  e.currentTarget.style.boxShadow = `0 6px 18px rgba(0,0,0,0.08)`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';
                }}
              >
                {/* Icon + Label row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {card.label}
                  </span>
                  <div style={{
                    background: card.bgColor,
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <IconComponent size={16} color={card.color} strokeWidth={2.2} />
                  </div>
                </div>

                {/* Big number */}
                <div style={{ fontSize: '2.1rem', fontWeight: 800, color: card.color, lineHeight: 1 }}>
                  {isLoading ? '—' : card.value}
                </div>

                {/* Subtext */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.71rem', color: '#94a3b8', borderTop: '1px solid #f1f5f9', paddingTop: '8px' }}>
                  <span>{card.subtext}</span>
                  {card.isPulse && (
                    <span className="pulse-dot" style={{ flexShrink: 0, width: '6px', height: '6px' }}></span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ANALYTICS GRAPHS — responsive 2 columns on desktop, auto wraps gracefully */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
        gap: '16px',
        marginBottom: '20px'
      }}>
        {/* GRAPH 1: DISTRIBUTION ANALYSIS (HISTOGRAM) */}
        <div style={{
          background: '#ffffff',
          borderRadius: '10px',
          padding: '16px 18px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}>
          {/* Header with Title and Compact Dropdown Filter */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '14px',
            gap: '10px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
              <BarChart3 size={17} color="#2563eb" />
              <h3 style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0f172a', margin: 0, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                Distribution Analysis
              </h3>
            </div>

            <select
              value={histogramFilter}
              onChange={(e) => setHistogramFilter(e.target.value)}
              className="form-input"
              style={{
                width: 'auto',
                fontSize: '0.74rem',
                padding: '4px 8px',
                height: '30px',
                borderRadius: '6px',
                background: '#f8fafc',
                border: '1px solid #cbd5e1',
                fontWeight: 600,
                color: '#334155',
                cursor: 'pointer'
              }}
            >
              <option value="agent_nvr">NVRs per Agent</option>
              <option value="agent_cam">Cameras per Agent</option>
              <option value="loc_cam">Cameras per Location</option>
              <option value="loc_nvr">NVRs per Location</option>
              <option value="agent_user">Users per Agent</option>
              <option value="nvr_cam">Cameras per NVR</option>
            </select>
          </div>

          {/* Histogram Visualization Area */}
          <div style={{ height: '150px', display: 'flex', alignItems: 'flex-end', gap: '16px', padding: '0 8px 24px', borderBottom: '1px solid #e2e8f0', position: 'relative' }}>
            {histData.items.length === 0 ? (
              <div style={{ width: '100%', textAlign: 'center', color: '#94a3b8', fontSize: '0.78rem' }}>
                No records found
              </div>
            ) : (
              histData.items.map((item, idx) => {
                const heightPercent = maxHistVal > 0 ? (item.value / maxHistVal) * 100 : 0;
                const barHeight = Math.max(Math.round((heightPercent / 100) * 105), item.value > 0 ? 10 : 3);
                const isHovered = hoveredHistBar?.label === item.label;
                const isMax = item.value === maxHistVal && item.value > 0;

                return (
                  <div
                    key={idx}
                    style={{
                      flex: 1,
                      maxWidth: '90px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      position: 'relative',
                      cursor: 'pointer'
                    }}
                    onMouseEnter={() => setHoveredHistBar(item)}
                    onMouseLeave={() => setHoveredHistBar(null)}
                  >
                    {/* Value Pill */}
                    <span style={{
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      color: isMax ? '#059669' : '#334155',
                      marginBottom: '4px'
                    }}>
                      {item.value}
                    </span>

                    {/* Bar */}
                    <div style={{
                      width: '100%',
                      maxWidth: '38px',
                      height: `${barHeight}px`,
                      background: isMax
                        ? 'linear-gradient(180deg, #10b981 0%, #059669 100%)'
                        : isHovered
                          ? 'linear-gradient(180deg, #3b82f6 0%, #1d4ed8 100%)'
                          : 'linear-gradient(180deg, #60a5fa 0%, #2563eb 100%)',
                      borderRadius: '4px 4px 0 0',
                      transition: 'height 0.25s ease'
                    }}></div>

                    {/* Label */}
                    <span style={{
                      position: 'absolute',
                      bottom: '-20px',
                      fontSize: '0.68rem',
                      fontWeight: 600,
                      color: '#64748b',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: '85px',
                      textAlign: 'center'
                    }} title={item.label}>
                      {item.label}
                    </span>
                  </div>
                );
              })
            )}
          </div>

          {/* Subtext info */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '0.7rem', color: '#64748b' }}>
            <span>{histData.title}</span>
            <span>Unit: {histData.unit}</span>
          </div>
        </div>

        {/* ROW 1 - CARD 2: MULTI-LINE CHART */}
        <div style={{
          background: '#ffffff',
          borderRadius: '10px',
          padding: '16px 18px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
          display: 'flex',
          flexDirection: 'column'
        }}>
          {/* Header with Title and Dropdown Filter */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '12px',
            gap: '10px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
              <TrendingUp size={17} color="#059669" />
              <h3 style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0f172a', margin: 0, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                Comparative Telemetry Analysis
              </h3>
            </div>

            <select
              value={lineFilter}
              onChange={(e) => setLineFilter(e.target.value)}
              className="form-input"
              style={{
                width: 'auto',
                fontSize: '0.74rem',
                padding: '4px 8px',
                height: '30px',
                borderRadius: '6px',
                background: '#f8fafc',
                border: '1px solid #cbd5e1',
                fontWeight: 600,
                color: '#334155',
                cursor: 'pointer'
              }}
            >
              <option value="line_agent_cam">Agent — Cameras, NVRs, Users</option>
              <option value="line_nvr_cam">NVR — Cameras, Online, Offline</option>
              <option value="line_loc_cam">Location — Cameras, NVRs, Users</option>
              <option value="line_throughput">Timeline — Throughput, Streams</option>
            </select>
          </div>

          {/* Multi-line SVG Chart */}
          {(() => {
            // Build multi-series dataset
            let series = []; // [{ label, color, gradId, data: [number] }]
            let xLabels = [];

            if (lineFilter === 'line_agent_cam') {
              const agents = stats?.agent_histogram || [];
              xLabels = agents.map(a => a.name);
              series = [
                { label: 'Cameras', color: '#2563eb', gradId: 'mlGrad0', data: agents.map(a => a.camera_count) },
                { label: 'NVRs', color: '#10b981', gradId: 'mlGrad1', data: agents.map(a => a.nvr_count) },
                { label: 'Users', color: '#f59e0b', gradId: 'mlGrad2', data: agents.map(a => a.user_count) }
              ];
            } else if (lineFilter === 'line_nvr_cam') {
              const nvrs = stats?.nvr_camera_histogram || [];
              xLabels = nvrs.map(n => n.name);
              series = [
                { label: 'Total Channels', color: '#2563eb', gradId: 'mlGrad0', data: nvrs.map(n => n.camera_count) },
                { label: 'Online', color: '#10b981', gradId: 'mlGrad1', data: nvrs.map(n => n.online_count) },
                { label: 'Offline', color: '#ef4444', gradId: 'mlGrad2', data: nvrs.map(n => n.offline_count) }
              ];
            } else if (lineFilter === 'line_loc_cam') {
              const locs = (stats?.location_histogram || []).filter(l => l.type === 'province' || l.type === 'city');
              xLabels = locs.map(l => l.name);
              series = [
                { label: 'Cameras', color: '#2563eb', gradId: 'mlGrad0', data: locs.map(l => l.camera_count) },
                { label: 'NVRs', color: '#10b981', gradId: 'mlGrad1', data: locs.map(l => l.nvr_count) },
                { label: 'Users', color: '#f59e0b', gradId: 'mlGrad2', data: locs.map(l => l.user_count) }
              ];
            } else if (lineFilter === 'line_throughput') {
              const tl = stats?.traffic_timeline || [];
              xLabels = tl.map(t => t.time);
              series = [
                { label: 'Throughput (Mbps)', color: '#2563eb', gradId: 'mlGrad0', data: tl.map(t => t.bitrate_mbps) },
                { label: 'Active Streams', color: '#10b981', gradId: 'mlGrad1', data: tl.map(t => t.active_streams) }
              ];
            }

            const W = 460;
            const H = 140;
            const padLeft = 30;
            const padRight = 12;
            const padTop = 10;
            const padBot = 28;
            const innerW = W - padLeft - padRight;
            const innerH = H - padTop - padBot;
            const n = xLabels.length;

            // Global max across all series
            const allVals = series.flatMap(s => s.data);
            const globalMax = Math.max(...allVals, 1);

            // Convert data to SVG coordinate points
            const toPoints = (data) =>
              data.map((v, i) => ({
                x: padLeft + (n > 1 ? (i / (n - 1)) * innerW : innerW / 2),
                y: padTop + innerH - (globalMax > 0 ? (v / globalMax) * innerH : 0),
                v
              }));

            const toPath = (pts) =>
              pts.reduce((acc, pt, i) => i === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`, '');

            // Grid value steps
            const gridSteps = [0, 0.25, 0.5, 0.75, 1.0];

            if (n === 0) {
              return (
                <div style={{ height: '150px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.78rem' }}>
                  No records found
                </div>
              );
            }

            return (
              <div style={{ flex: 1 }}>
                {/* Legend */}
                <div style={{ display: 'flex', gap: '14px', marginBottom: '8px', flexWrap: 'wrap' }}>
                  {series.map((s, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.7rem', fontWeight: 600, color: '#475569' }}>
                      <span style={{ width: '18px', height: '2.5px', background: s.color, borderRadius: '2px', display: 'inline-block' }}></span>
                      {s.label}
                    </div>
                  ))}
                </div>

                {/* SVG */}
                <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: '155px', overflow: 'visible' }}>
                  <defs>
                    {series.map(s => (
                      <linearGradient key={s.gradId} id={s.gradId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={s.color} stopOpacity="0.15" />
                        <stop offset="100%" stopColor={s.color} stopOpacity="0" />
                      </linearGradient>
                    ))}
                  </defs>

                  {/* Grid lines */}
                  {gridSteps.map((r, i) => {
                    const gy = padTop + innerH - r * innerH;
                    return (
                      <g key={i}>
                        <line x1={padLeft} y1={gy} x2={W - padRight} y2={gy} stroke="#f1f5f9" strokeDasharray="4 3" />
                        <text x={padLeft - 3} y={gy + 3} fontSize="8" fill="#94a3b8" textAnchor="end">
                          {Math.round(globalMax * r)}
                        </text>
                      </g>
                    );
                  })}

                  {/* X Axis Labels */}
                  {xLabels.map((lbl, i) => {
                    const x = padLeft + (n > 1 ? (i / (n - 1)) * innerW : innerW / 2);
                    return (
                      <text key={i} x={x} y={H - 4} fontSize="8.5" fill="#94a3b8" textAnchor="middle">
                        {lbl.length > 9 ? `${lbl.slice(0, 8)}…` : lbl}
                      </text>
                    );
                  })}

                  {/* Series: area fill + line + dots */}
                  {series.map((s, si) => {
                    const pts = toPoints(s.data);
                    const lineD = toPath(pts);
                    const areaD = `${lineD} L ${pts[pts.length - 1].x} ${padTop + innerH} L ${pts[0].x} ${padTop + innerH} Z`;

                    return (
                      <g key={si}>
                        {/* Area gradient */}
                        <path d={areaD} fill={`url(#${s.gradId})`} />
                        {/* Line */}
                        <path d={lineD} fill="none" stroke={s.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        {/* Dots */}
                        {pts.map((pt, pi) => (
                          <g key={pi}>
                            <circle cx={pt.x} cy={pt.y} r="3.5" fill="#fff" stroke={s.color} strokeWidth="2" />
                            <title>{`${s.label}: ${pt.v}`}</title>
                          </g>
                        ))}
                      </g>
                    );
                  })}
                </svg>
              </div>
            );
          })()}
        </div>


        {/* ROW 2 - CARD 3: CIRCLE / DONUT CHART WITH DROP-DOWN FILTERS */}

        <div style={{
          background: '#ffffff',
          borderRadius: '10px',
          padding: '16px 18px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}>
          {/* Header with Title and Dropdown Filter */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '14px',
            gap: '10px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
              <PieChart size={17} color="#8b5cf6" />
              <h3 style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0f172a', margin: 0, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                Resource & Health Distribution
              </h3>
            </div>

            <select
              value={donutFilter}
              onChange={(e) => setDonutFilter(e.target.value)}
              className="form-input"
              style={{
                width: 'auto',
                fontSize: '0.74rem',
                padding: '4px 8px',
                height: '30px',
                borderRadius: '6px',
                background: '#f8fafc',
                border: '1px solid #cbd5e1',
                fontWeight: 600,
                color: '#334155',
                cursor: 'pointer'
              }}
            >
              <option value="health">Operational Health</option>
              <option value="ptz_fixed">PTZ vs Fixed Cameras</option>
              <option value="agents">Cameras by Agent</option>
              <option value="locations">Provinces Scope</option>
              <option value="storage">Storage Capacity</option>
            </select>
          </div>

          {/* SVG Donut Visualizer and Legend */}
          <div style={{ height: '150px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
            {/* Donut SVG Ring */}
            <div style={{ width: '130px', height: '130px', position: 'relative', flexShrink: 0 }}>
              {(() => {
                const totalVal = donutData.slices.reduce((acc, s) => acc + s.value, 0);
                const r = 44;
                const circumference = 2 * Math.PI * r;
                let currentOffset = 0;

                return (
                  <svg viewBox="0 0 110 110" style={{ transform: 'rotate(-90deg)', width: '100%', height: '100%' }}>
                    {/* Background Ring */}
                    <circle
                      cx="55"
                      cy="55"
                      r={r}
                      fill="none"
                      stroke="#f1f5f9"
                      strokeWidth="15"
                    />

                    {/* Colored Slices */}
                    {totalVal > 0 ? (
                      donutData.slices.map((slice, i) => {
                        const sliceRatio = slice.value / totalVal;
                        const dashLen = sliceRatio * circumference;
                        const strokeOffset = -currentOffset;
                        currentOffset += dashLen;

                        return (
                          <circle
                            key={i}
                            cx="55"
                            cy="55"
                            r={r}
                            fill="none"
                            stroke={slice.color}
                            strokeWidth="15"
                            strokeDasharray={`${dashLen} ${circumference}`}
                            strokeDashoffset={strokeOffset}
                            style={{ transition: 'stroke-dasharray 0.35s ease' }}
                          />
                        );
                      })
                    ) : (
                      <circle
                        cx="55"
                        cy="55"
                        r={r}
                        fill="none"
                        stroke="#cbd5e1"
                        strokeWidth="15"
                      />
                    )}

                    {/* Center Text */}
                    <g style={{ transform: 'rotate(90deg)', transformOrigin: '55px 55px' }}>
                      <text
                        x="55"
                        y="52"
                        textAnchor="middle"
                        fontSize="14"
                        fontWeight="800"
                        fill="#0f172a"
                      >
                        {donutData.centerValue}
                      </text>
                      <text
                        x="55"
                        y="66"
                        textAnchor="middle"
                        fontSize="8"
                        fontWeight="600"
                        fill="#64748b"
                      >
                        {donutData.centerLabel}
                      </text>
                    </g>
                  </svg>
                );
              })()}
            </div>

            {/* Interactive Legend on Right */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', maxHeight: '140px' }}>
              {donutData.slices.map((slice, i) => {
                const total = donutData.slices.reduce((a, s) => a + s.value, 0);
                const percent = total > 0 ? Math.round((slice.value / total) * 100) : 0;
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.74rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: slice.color }}></span>
                      <span style={{ fontWeight: 600, color: '#334155' }}>{slice.label}</span>
                    </div>
                    <span style={{ fontWeight: 700, color: '#0f172a' }}>
                      {slice.value} ({percent}%)
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Subtext info */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '0.7rem', color: '#64748b' }}>
            <span>{donutData.title}</span>
            <span>Total: {donutData.slices.reduce((a, s) => a + s.value, 0)}</span>
          </div>
        </div>

        {/* ROW 2 - CARD 4: DISTRIBUTION / COMPARATIVE PROGRESS GAUGE */}
        <div style={{
          background: '#ffffff',
          borderRadius: '10px',
          padding: '16px 18px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}>
          {/* Header with Title and Dropdown Filter */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '14px',
            gap: '10px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
              <Layers size={17} color="#0891b2" />
              <h3 style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0f172a', margin: 0, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                Hierarchy & Capacity Allocation
              </h3>
            </div>

            <select
              value={distFilter}
              onChange={(e) => setDistFilter(e.target.value)}
              className="form-input"
              style={{
                width: 'auto',
                fontSize: '0.74rem',
                padding: '4px 8px',
                height: '30px',
                borderRadius: '6px',
                background: '#f8fafc',
                border: '1px solid #cbd5e1',
                fontWeight: 600,
                color: '#334155',
                cursor: 'pointer'
              }}
            >
              <option value="geo_depth">Hierarchy Scopes</option>
              <option value="nvr_channels">Channels per NVR</option>
              <option value="agent_workload">Agent Workload</option>
              <option value="user_dist">Users per Agent</option>
            </select>
          </div>

          {/* Horizontal Progress Bars */}
          <div style={{ height: '150px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '10px', overflowY: 'auto' }}>
            {distData.items.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.78rem' }}>
                No records available
              </div>
            ) : (
              distData.items.map((item, idx) => {
                const max = item.max || 1;
                const widthPercent = Math.min(Math.round((item.value / max) * 100), 100);

                return (
                  <div key={idx}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px', fontSize: '0.72rem' }}>
                      <span style={{ fontWeight: 600, color: '#334155' }}>{item.label}</span>
                      <span style={{ fontWeight: 700, color: item.color }}>{item.unit}</span>
                    </div>

                    <div style={{ height: '6px', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${Math.max(widthPercent, item.value > 0 ? 5 : 0)}%`,
                          height: '100%',
                          background: item.color,
                          borderRadius: '3px',
                          transition: 'width 0.35s ease'
                        }}
                      ></div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Subtext info */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '0.7rem', color: '#64748b' }}>
            <span>{distData.title}</span>
            <span>{distData.items.length} Tracked</span>
          </div>
        </div>
      </div>
    </div>
  );
}
