import React, { useState, useEffect, useRef } from 'react';
import {
  Cctv,
  Server,
  Video,
  Plus,
  Trash2,
  Copy,
  Check,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ChevronLeft,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  X,
  MoreVertical,
  Monitor,
  Maximize2,
  Volume2,
  VolumeX,
  Camera as CameraIcon,
  Play,
  Bot,
  Shield,
  Search,
  Filter,
  ZoomIn,
  ZoomOut,
  Radio,
  MapPin,
  Save,
  Users,
  Download,
  Terminal
} from 'lucide-react';

import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './components/auth/LoginPage';
import ChangePasswordModal from './components/auth/ChangePasswordModal';
import ChangePasswordView from './components/auth/ChangePasswordView';
import Sidebar from './components/layout/Sidebar';
import TopHeader from './components/layout/TopHeader';
import DashboardView from './components/dashboard/DashboardView';
import UserManagementView from './components/users/UserManagementView';
import RoleManagementView from './components/roles/RoleManagementView';
import LocationManagementView from './components/locations/LocationManagementView';
import { apiRequest, API_BASE_URL, WEBRTC_STREAM_BASE } from './services/api';



/**
 * Native WebRTC (WHEP) Live Camera Player
 * Connects directly to MediaMTX via WHEP protocol.
 * Sub-second latency (< 200ms), Zero Docker, Zero CPU transcoding.
 */
function LiveWebRtcCamera({ streamPath, camName, isMuted = true }) {
  const videoRef = useRef(null);
  const [streamStatus, setStreamStatus] = useState('connecting'); // 'connecting' | 'live' | 'error'
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });
    let isCancelled = false;

    // Jab live video feed connect ho jaye:
    pc.ontrack = (event) => {
      if (videoRef.current && event.streams[0]) {
        videoRef.current.srcObject = event.streams[0];
        if (!isCancelled) setStreamStatus('live');
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
        if (!isCancelled) setStreamStatus('error');
      }
    };

    async function startStream() {
      try {
        if (!isCancelled) setStreamStatus('connecting');

        // 1. Set transceivers to receive audio and video
        pc.addTransceiver('video', { direction: 'recvonly' });
        pc.addTransceiver('audio', { direction: 'recvonly' });

        // 2. Create local WebRTC offer
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        // Wait for ICE gathering to complete so all candidates are in offer SDP
        if (pc.iceGatheringState !== 'complete') {
          await new Promise((resolve) => {
            function check() {
              if (pc.iceGatheringState === 'complete') {
                pc.removeEventListener('icegatheringstatechange', check);
                resolve();
              }
            }
            pc.addEventListener('icegatheringstatechange', check);
            setTimeout(resolve, 800); // 800ms gathering window
          });
        }

        if (isCancelled) return;

        // 3. Send offer to MediaMTX WHEP endpoint
        const whepUrl = `${WEBRTC_STREAM_BASE}/${streamPath}/whep`;
        const res = await fetch(whepUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/sdp' },
          body: pc.localDescription?.sdp || offer.sdp,
        });

        if (!res.ok) {
          const errDetail = await res.text().catch(() => '');
          throw new Error(`MediaMTX WHEP status ${res.status} ${errDetail}`);
        }

        // 4. Set remote answer from MediaMTX
        const answerSdp = await res.text();
        if (isCancelled) return;

        await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
      } catch (err) {
        console.error(`[WebRTC WHEP] Error connecting ${streamPath}:`, err);
        if (!isCancelled) {
          setStreamStatus('error');
        }
      }
    }

    startStream();

    return () => {
      isCancelled = true;
      if (pc) {
        pc.close();
      }
    };
  }, [streamPath, retryKey]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#090d16', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isMuted}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          display: streamStatus === 'live' ? 'block' : 'none'
        }}
      />

      {streamStatus === 'connecting' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', color: '#94a3b8' }}>
          <div className="spinner" style={{ width: '22px', height: '22px', border: '2px solid #334155', borderTopColor: '#10b981', borderRadius: '50%' }}></div>
          <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>Connecting WebRTC (WHEP)...</span>
        </div>
      )}

      {streamStatus === 'error' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', color: '#f87171' }}>
          <AlertTriangle size={20} color="#ef4444" />
          <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>No Signal</span>
          <button
            type="button"
            onClick={() => setRetryKey((k) => k + 1)}
            className="btn btn-secondary btn-sm"
            style={{ fontSize: '0.7rem', padding: '3px 8px', marginTop: '2px' }}
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}

function MainApp() {
  const { user, isAuthenticated, isLoading, logout, hasPermission } = useAuth();

  // Page caching: persist active tab across page refreshes
  const [activeNav, setActiveNav] = useState(() => {
    return localStorage.getItem('epic_command_active_nav') || localStorage.getItem('epic_vision_active_nav') || 'dashboard';
  });
  const [locationSubTab, setLocationSubTab] = useState('provinces');

  // Sidebar Collapse / Open State (persisted)
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    return localStorage.getItem('epic_sidebar_open') !== 'false';
  });

  const handleToggleSidebar = (val) => {
    setIsSidebarOpen((prev) => {
      const next = typeof val === 'boolean' ? val : !prev;
      localStorage.setItem('epic_sidebar_open', String(next));
      return next;
    });
  };

  // Change Password Modal State
  const [isChangePasswordModalOpen, setIsChangePasswordModalOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem('epic_command_active_nav', activeNav);
  }, [activeNav]);

  // Dynamic permission boundary: ensure user is redirected if activeNav loses permission
  useEffect(() => {
    if (user) {
      if (activeNav === 'roles' && !user.is_superadmin) {
        setActiveNav('dashboard');
        return;
      }

      const permMap = {
        dashboard: 'DASHBOARD_VIEW',
        monitor: 'LIVE_MONITOR_VIEW',
        nvrs: 'NVR_VIEW',
        agents: 'AGENT_VIEW',
        users: 'USER_VIEW',
        locations: 'LOCATION_VIEW'
      };
      const reqPerm = permMap[activeNav];
      if (reqPerm && !hasPermission(reqPerm)) {
        const first = Object.keys(permMap).find((k) => hasPermission(permMap[k]));
        if (first) {
          setActiveNav(first);
        }
      }
    }
  }, [user, activeNav, hasPermission]);

  // Agents State
  const [agents, setAgents] = useState([]);
  const [isLoadingAgents, setIsLoadingAgents] = useState(false);
  const [isAgentModalOpen, setIsAgentModalOpen] = useState(false);
  const [newAgentName, setNewAgentName] = useState('');
  const [isCreatingAgent, setIsCreatingAgent] = useState(false);
  const [expandedAgentId, setExpandedAgentId] = useState(null);
  const [openAgentDropdownId, setOpenAgentDropdownId] = useState(null);
  const [selectedAgentId, setSelectedAgentId] = useState('');

  // Edit Agent Modal State
  const [isEditAgentModalOpen, setIsEditAgentModalOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState(null);
  const [editAgentName, setEditAgentName] = useState('');
  const [editAgentStatus, setEditAgentStatus] = useState('active');
  const [editAgentProvince, setEditAgentProvince] = useState('');
  const [editAgentCity, setEditAgentCity] = useState('');
  const [editAgentArea, setEditAgentArea] = useState('');
  const [editAgentSite, setEditAgentSite] = useState('');
  const [isSavingAgent, setIsSavingAgent] = useState(false);
  const [editAgentError, setEditAgentError] = useState(null);

  // Saved NVRs
  const [savedNvrs, setSavedNvrs] = useState([]);
  const [isLoadingNvrs, setIsLoadingNvrs] = useState(false);
  const [expandedRowId, setExpandedRowId] = useState(null);
  const [openDropdownId, setOpenDropdownId] = useState(null);

  // Edit NVR Modal State
  const [isEditNvrModalOpen, setIsEditNvrModalOpen] = useState(false);
  const [editingNvr, setEditingNvr] = useState(null);
  const [editNvrName, setEditNvrName] = useState('');
  const [editNvrIp, setEditNvrIp] = useState('');
  const [editNvrPort, setEditNvrPort] = useState(80);
  const [editNvrRtspPort, setEditNvrRtspPort] = useState(554);
  const [editNvrUsername, setEditNvrUsername] = useState('admin');
  const [editNvrPassword, setEditNvrPassword] = useState('');
  const [editNvrProvince, setEditNvrProvince] = useState('');
  const [editNvrCity, setEditNvrCity] = useState('');
  const [editNvrArea, setEditNvrArea] = useState('');
  const [editNvrSite, setEditNvrSite] = useState('');
  const [isSavingNvr, setIsSavingNvr] = useState(false);
  const [editNvrError, setEditNvrError] = useState(null);

  // Add NVR Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [ip, setIp] = useState('');
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [customPort, setCustomPort] = useState('');
  const [customRtspPort, setCustomRtspPort] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Modal Probing & Save States
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [scanError, setScanError] = useState(null);
  const [nvrName, setNvrName] = useState('');
  const [nvrProvince, setNvrProvince] = useState('');
  const [nvrCity, setNvrCity] = useState('');
  const [nvrArea, setNvrArea] = useState('');
  const [nvrSite, setNvrSite] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(null);

  // Edge Agent Mode in Add NVR Modal
  const [nvrAddMode, setNvrAddMode] = useState('edge_agent'); // 'edge_agent' | 'direct_ip'
  const [edgeCopied, setEdgeCopied] = useState(false);
  const [agentDeployStatus, setAgentDeployStatus] = useState(null);

  // Live Monitor Grid Mode (persisted in cache)
  const [gridMode, setGridMode] = useState(() => {
    return localStorage.getItem('epic_command_grid_mode') || localStorage.getItem('epic_vision_grid_mode') || 'grid-2x2';
  });

  useEffect(() => {
    localStorage.setItem('epic_command_grid_mode', gridMode);
  }, [gridMode]);

  // Poll agent deployment status in real-time when Add NVR modal is open in Edge Agent mode
  useEffect(() => {
    let timer = null;
    const targetId = (!user?.is_superadmin && user?.assigned_agent_id)
      ? user.assigned_agent_id
      : (selectedAgentId || (agents[0] && agents[0].id));

    if (isModalOpen && nvrAddMode === 'edge_agent' && targetId) {
      const pollStatus = async () => {
        try {
          const res = await apiRequest(`/api/agent/${targetId}/status`);
          if (res.ok) {
            const data = await res.json();
            setAgentDeployStatus(data);
            if (data.has_nvr) {
              fetchNvrs();
              fetchCameras();
            }
          }
        } catch (_) {}
      };
      pollStatus();
      timer = setInterval(pollStatus, 2500);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isModalOpen, nvrAddMode, selectedAgentId, agents, user]);

  // Close actions dropdowns on outside click
  useEffect(() => {
    const handleGlobalClick = (e) => {
      if (!e.target.closest('.action-dropdown-wrapper')) {
        setOpenAgentDropdownId(null);
        setOpenDropdownId(null);
      }
    };
    document.addEventListener('click', handleGlobalClick);
    return () => document.removeEventListener('click', handleGlobalClick);
  }, []);

  const [isMuted, setIsMuted] = useState(true);

  // PTZ and Live Monitor Controls State
  const [isPtzOpen, setIsPtzOpen] = useState(true);
  const [selectedPtzCamId, setSelectedPtzCamId] = useState(null);
  const [ptzSpeed, setPtzSpeed] = useState(50);
  const [ptzZoomLevel, setPtzZoomLevel] = useState(50);
  const [activePreset, setActivePreset] = useState(1);
  const [ptzPresets, setPtzPresets] = useState([]);
  const [cameraSearch, setCameraSearch] = useState('');
  const [filterProvince, setFilterProvince] = useState('');
  const [filterCity, setFilterCity] = useState('');
  const [filterArea, setFilterArea] = useState('');
  const [filterSite, setFilterSite] = useState('');
  const [activePtzAction, setActivePtzAction] = useState(null);
  const [isSavingPreset, setIsSavingPreset] = useState(false);
  const [savePresetFeedback, setSavePresetFeedback] = useState(null);

  // Agent Filters matching Image 2
  const [agentSearch, setAgentSearch] = useState('');
  const [agentStatusFilter, setAgentStatusFilter] = useState('');
  const [agentProvinceFilter, setAgentProvinceFilter] = useState('');
  const [agentCityFilter, setAgentCityFilter] = useState('');
  const [agentAreaFilter, setAgentAreaFilter] = useState('');
  const [agentSiteFilter, setAgentSiteFilter] = useState('');

  // NVR Filters matching Image 4
  const [nvrSearch, setNvrSearch] = useState('');
  const [nvrStatusFilter, setNvrStatusFilter] = useState('');
  const [nvrCameraTypeFilter, setNvrCameraTypeFilter] = useState('');
  const [nvrProvinceFilter, setNvrProvinceFilter] = useState('');
  const [nvrCityFilter, setNvrCityFilter] = useState('');
  const [nvrAreaFilter, setNvrAreaFilter] = useState('');
  const [nvrSiteFilter, setNvrSiteFilter] = useState('');

  // Pagination State for All Pages (Agents, NVRs, Cameras)
  const [camerasPerPage, setCamerasPerPage] = useState(4); // Default 4 fits 2x2 without scroll
  const [currentCameraPage, setCurrentCameraPage] = useState(1);
  const [agentsPerPage, setAgentsPerPage] = useState(10);
  const [currentAgentPage, setCurrentAgentPage] = useState(1);
  const [nvrsPerPage, setNvrsPerPage] = useState(10);
  const [currentNvrPage, setCurrentNvrPage] = useState(1);

  const ptzSafetyTimerRef = useRef(null);
  const ptzContinuousIntervalRef = useRef(null);
  const ptzPressStartRef = useRef(0);
  const activeActionRef = useRef(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (!e.target.closest('.action-dropdown-wrapper')) {
        setOpenDropdownId(null);
        setOpenAgentDropdownId(null);
      }
    };
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, []);

  const [locationsSummary, setLocationsSummary] = useState({
    provinces: [],
    cities: [],
    areas: [],
    sites: []
  });

  useEffect(() => {
    if (isAuthenticated) {
      fetchAgents();
      fetchNvrs();
      fetchLocationsSummary();
    }
  }, [isAuthenticated]);

  const fetchLocationsSummary = async () => {
    try {
      const res = await apiRequest('/api/locations/summary');
      if (res.ok) {
        const data = await res.json();
        setLocationsSummary(data);
      }
    } catch (err) {
      console.error('Failed to load locations summary:', err);
    }
  };

  const fetchAgents = async () => {
    setIsLoadingAgents(true);
    try {
      const res = await apiRequest('/api/agent/list');
      if (res.ok) {
        const data = await res.json();
        setAgents(data.agents || []);
        if (data.agents && data.agents.length > 0 && !selectedAgentId) {
          setSelectedAgentId(data.agents[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to load agents:', err);
    } finally {
      setIsLoadingAgents(false);
    }
  };

  const handleCreateAgent = async (e) => {
    e.preventDefault();
    if (!newAgentName.trim()) return;
    setIsCreatingAgent(true);
    try {
      const res = await apiRequest('/api/agent/create', {
        method: 'POST',
        body: JSON.stringify({ name: newAgentName.trim() })
      });
      if (res.ok) {
        const data = await res.json();
        await fetchAgents();
        setIsAgentModalOpen(false);
        setNewAgentName('');
        if (data.agent) {
          setSelectedAgentId(data.agent.id);
          setNvrAddMode('edge_agent');
          setAgentDeployStatus(null);
          setIsModalOpen(true);
        }
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.detail || 'Failed to create agent');
      }
    } catch (err) {
      alert(`Error creating agent: ${err.message}`);
    } finally {
      setIsCreatingAgent(false);
    }
  };

  const handleDeleteAgent = async (agentId, e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setOpenAgentDropdownId(null);
    if (!window.confirm('Are you sure you want to delete this Agent and all its linked NVRs and cameras?')) return;

    setAgents((prev) => prev.filter((a) => a.id !== agentId));
    try {
      const res = await apiRequest(`/api/agent/${agentId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.detail || 'Failed to delete agent');
      }
      await fetchAgents();
      await fetchNvrs();
    } catch (err) {
      alert(`Error deleting agent: ${err.message}`);
      await fetchAgents();
      await fetchNvrs();
    }
  };

  const handleOpenEditAgent = (agent) => {
    setOpenAgentDropdownId(null);
    setEditingAgent(agent);
    setEditAgentName(agent.name || '');
    setEditAgentStatus(agent.status || 'active');
    const clean = (v) => (v && v !== '—' && v !== '-' ? v : '');
    setEditAgentProvince(clean(agent.province));
    setEditAgentCity(clean(agent.city));
    setEditAgentArea(clean(agent.area));
    setEditAgentSite(clean(agent.site));
    setEditAgentError(null);
    setIsEditAgentModalOpen(true);
  };

  const handleSaveEditAgent = async (e) => {
    e.preventDefault();
    if (!editAgentName.trim()) {
      setEditAgentError('Agent name is required');
      return;
    }
    setIsSavingAgent(true);
    setEditAgentError(null);
    try {
      const res = await apiRequest(`/api/agent/${editingAgent.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editAgentName.trim(),
          status: editAgentStatus,
          province: editAgentProvince || null,
          city: editAgentCity || null,
          area: editAgentArea || null,
          site: editAgentSite || null
        })
      });
      if (res.ok) {
        await fetchAgents();
        await fetchNvrs();
        setIsEditAgentModalOpen(false);
        setEditingAgent(null);
      } else {
        const data = await res.json().catch(() => ({}));
        setEditAgentError(data.detail || 'Failed to update agent');
      }
    } catch (err) {
      setEditAgentError(err.message);
    } finally {
      setIsSavingAgent(false);
    }
  };

  const fetchNvrs = async () => {
    setIsLoadingNvrs(true);
    try {
      const res = await apiRequest('/api/nvr/list');
      if (res.ok) {
        const data = await res.json();
        setSavedNvrs(data.nvrs || []);
      }
    } catch (err) {
      console.error('Failed to load NVRs:', err);
    } finally {
      setIsLoadingNvrs(false);
    }
  };

  // Toggle Row Expansion
  const toggleRow = (nvrId) => {
    setExpandedRowId(expandedRowId === nvrId ? null : nvrId);
  };

  // Check if current user has an agent to link NVRs to
  const isAgentLinked = user?.is_superadmin ? agents.length > 0 : Boolean(user?.assigned_agent_id && agents.length > 0);

  // Open / Close Modal (requires agent to exist and be linked)
  const handleOpenModal = () => {
    if (!isAgentLinked) {
      alert('You must link with an Agent first before adding NVR devices.');
      return;
    }
    setIsModalOpen(true);
    setNvrAddMode('edge_agent');
    setAgentDeployStatus(null);
    setEdgeCopied(false);
    setScanResult(null);
    setScanError(null);

    const targetAgId = (!user?.is_superadmin && user?.assigned_agent_id)
      ? user.assigned_agent_id
      : (selectedAgentId || agents[0]?.id);
    setSelectedAgentId(targetAgId);

    // Auto-populate location from the selected agent
    const cleanVal = (v) => (v && v !== '—' && v !== '-' ? v : '');
    const ag = agents.find((a) => String(a.id) === String(targetAgId)) || agents[0];
    setNvrProvince(cleanVal(ag?.province));
    setNvrCity(cleanVal(ag?.city));
    setNvrArea(cleanVal(ag?.area));
    setNvrSite(cleanVal(ag?.site));
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setAgentDeployStatus(null);
    setEdgeCopied(false);
    setScanResult(null);
    setScanError(null);
    setIp('');
    setPassword('');
    setNvrName('');
    setNvrProvince('');
    setNvrCity('');
    setNvrArea('');
    setNvrSite('');
  };

  // Step 1: Probe NVR
  const handleProbe = async (e) => {
    e.preventDefault();
    if (!ip.trim() || !username.trim()) {
      setScanError('Please enter an IP address and username.');
      return;
    }

    setIsScanning(true);
    setScanResult(null);
    setScanError(null);

    try {
      const payload = {
        ip: ip.trim(),
        username: username.trim(),
        password: password,
        port: customPort ? parseInt(customPort, 10) : null,
        rtsp_port: customRtspPort ? parseInt(customRtspPort, 10) : null
      };

      const res = await fetch(`${API_BASE_URL}/api/nvr/probe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || 'Unable to connect to NVR.');
      }

      setScanResult(data);
      if (!nvrName.trim()) {
        const agObj = agents.find((a) => String(a.id) === String(selectedAgent));
        const defaultName = agObj ? `${agObj.name} NVR` : 'NVR Device';
        setNvrName(defaultName);
      }
    } catch (err) {
      setScanError(err.message);
    } finally {
      setIsScanning(false);
    }
  };

  // Step 2: Confirm and Save to Database
  const handleConfirmSave = async () => {
    if (!scanResult) return;

    setIsSaving(true);
    try {
      const effectiveAgId = (!user?.is_superadmin && user?.assigned_agent_id)
        ? user.assigned_agent_id
        : (selectedAgentId ? parseInt(selectedAgentId, 10) : (agents[0]?.id || null));

      const targetAgent = agents.find((a) => String(a.id) === String(effectiveAgId)) || agents[0];
      const cleanVal = (v) => (v && v !== '—' && v !== '-' ? v : '');
      const payload = {
        agent_id: effectiveAgId,
        name: nvrName.trim() || `${targetAgent?.name || 'Branch'} NVR`,
        ip: scanResult.ip,
        port: scanResult.port || 80,
        rtsp_port: scanResult.rtsp_port || 554,
        username: username,
        password: password,
        status: 'online',
        vendor: scanResult.vendor || 'DAHUA',
        province: nvrProvince || cleanVal(targetAgent?.province) || '',
        city: nvrCity || cleanVal(targetAgent?.city) || '',
        area: nvrArea || cleanVal(targetAgent?.area) || '',
        site: nvrSite || cleanVal(targetAgent?.site) || '',
        cameras: scanResult.cameras || []
      };

      const res = await apiRequest('/api/nvr/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || 'Failed to save NVR.');
      }

      await fetchNvrs();
      await fetchAgents();
      handleCloseModal();
    } catch (err) {
      alert(`Error saving to database: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Delete NVR
  const handleDeleteNvr = async (id, e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setOpenDropdownId(null);
    if (!window.confirm('Are you sure you want to delete this NVR and all its cameras?')) return;

    // Optimistically remove from UI
    setSavedNvrs((prev) => prev.filter((item) => item.id !== id));

    try {
      const res = await fetch(`${API_BASE_URL}/api/nvr/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(`Delete failed: ${data.detail || 'Server error'}`);
        await fetchNvrs();
        await fetchAgents();
      } else {
        await fetchNvrs();
        await fetchAgents();
      }
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
      await fetchNvrs();
      await fetchAgents();
    }
  };

  // Edit NVR
  const handleOpenEditNvr = (nvr) => {
    setOpenDropdownId(null);
    setEditingNvr(nvr);
    setEditNvrName(nvr.name || '');
    setEditNvrIp(nvr.ip || '');
    setEditNvrPort(nvr.port || 80);
    setEditNvrRtspPort(nvr.rtsp_port || 554);
    setEditNvrUsername(nvr.username || 'admin');
    setEditNvrPassword('');
    const clean = (v) => (v && v !== '—' && v !== '-' ? v : '');
    setEditNvrProvince(clean(nvr.province));
    setEditNvrCity(clean(nvr.city));
    setEditNvrArea(clean(nvr.area));
    setEditNvrSite(clean(nvr.site));
    setEditNvrError(null);
    setIsEditNvrModalOpen(true);
  };

  const handleSaveEditNvr = async (e) => {
    e.preventDefault();
    if (!editNvrName.trim() || !editNvrIp.trim()) {
      setEditNvrError('NVR name and IP address are required');
      return;
    }
    setIsSavingNvr(true);
    setEditNvrError(null);
    try {
      const payload = {
        name: editNvrName.trim(),
        ip: editNvrIp.trim(),
        port: editNvrPort ? parseInt(editNvrPort, 10) : 80,
        rtsp_port: editNvrRtspPort ? parseInt(editNvrRtspPort, 10) : 554,
        username: editNvrUsername.trim(),
        province: editNvrProvince || null,
        city: editNvrCity || null,
        area: editNvrArea || null,
        site: editNvrSite || null
      };
      if (editNvrPassword.trim()) {
        payload.password = editNvrPassword.trim();
      }
      const res = await apiRequest(`/api/nvr/${editingNvr.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        await fetchNvrs();
        setIsEditNvrModalOpen(false);
        setEditingNvr(null);
      } else {
        const data = await res.json().catch(() => ({}));
        setEditNvrError(data.detail || 'Failed to update NVR');
      }
    } catch (err) {
      setEditNvrError(err.message);
    } finally {
      setIsSavingNvr(false);
    }
  };

  // Copy RTSP URL helper
  const copyToClipboard = (url) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  // Close 3-dots dropdowns when clicking outside
  useEffect(() => {
    const handleGlobalClick = (e) => {
      if (!e.target.closest('.action-dropdown-wrapper')) {
        setOpenDropdownId(null);
        setOpenAgentDropdownId(null);
      }
    };
    document.addEventListener('click', handleGlobalClick);
    return () => document.removeEventListener('click', handleGlobalClick);
  }, []);

  // Collect all cameras across all configured NVRs
  const allCameras = savedNvrs.flatMap((nvr) =>
    (nvr.cameras || []).map((cam) => ({
      ...cam,
      nvrName: nvr.name,
      nvrIp: nvr.ip,
      nvrUsername: nvr.username
    }))
  );

  // Selected PTZ Camera
  const selectedPtzCam = allCameras.find((c) => c.id === selectedPtzCamId) || allCameras.find((c) => c.is_ptz) || allCameras[0] || null;

  useEffect(() => {
    if (!selectedPtzCamId && allCameras.length > 0) {
      const firstPtz = allCameras.find((c) => c.is_ptz) || allCameras[0];
      if (firstPtz) {
        setSelectedPtzCamId(firstPtz.id);
        setIsPtzOpen(Boolean(firstPtz.is_ptz));
      }
    }
  }, [allCameras, selectedPtzCamId]);

  // PTZ continuous & step control function
  const sendPtzCommand = async (action, overrideParams = {}) => {
    if (!selectedPtzCam || !selectedPtzCam.is_ptz) return;

    if (ptzSafetyTimerRef.current) {
      clearTimeout(ptzSafetyTimerRef.current);
      ptzSafetyTimerRef.current = null;
    }

    setActivePtzAction(action === 'stop' ? null : action);

    try {
      const payload = {
        action,
        speed: ptzSpeed,
        ...overrideParams
      };
      await fetch(`${API_BASE_URL}/api/ptz/control/${selectedPtzCam.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      // 60s emergency safety auto-stop timer in case tab crashes
      if (action !== 'stop' && !overrideParams.step_duration_ms) {
        ptzSafetyTimerRef.current = setTimeout(() => {
          sendPtzCommand('stop');
          setActivePtzAction(null);
        }, 60000);
      }
    } catch (err) {
      console.error('PTZ Error:', err);
    }
  };

  // Pointer Down (Mouse or Touch): Starts moving immediately and keeps moving continuously while held!
  const handlePtzPointerDown = (action, isZoom = false) => {
    if (ptzContinuousIntervalRef.current) {
      clearInterval(ptzContinuousIntervalRef.current);
      ptzContinuousIntervalRef.current = null;
    }

    ptzPressStartRef.current = Date.now();
    activeActionRef.current = action;

    // Immediately trigger movement without any delay!
    sendPtzCommand(action);

    // Keep sending heartbeat command every 700ms so camera moves continuously as long as user holds!
    ptzContinuousIntervalRef.current = setInterval(() => {
      sendPtzCommand(action);
    }, 700);
  };

  // Pointer Up / Leave: Stops movement immediately when released!
  const handlePtzPointerUp = (action, isZoom = false) => {
    if (ptzContinuousIntervalRef.current) {
      clearInterval(ptzContinuousIntervalRef.current);
      ptzContinuousIntervalRef.current = null;
    }

    const elapsed = Date.now() - ptzPressStartRef.current;
    activeActionRef.current = null;

    // If it was a quick tap (< 220ms), let it complete a clean 300ms step pulse so it visibly moves
    if (elapsed < 220) {
      const minPulse = isZoom ? 220 : 300;
      setTimeout(() => {
        if (!activeActionRef.current) {
          sendPtzCommand('stop');
        }
      }, minPulse - elapsed);
    } else {
      // User held it down and released: stop immediately!
      sendPtzCommand('stop');
    }
  };

  // Global mouseup/touchend/blur so movement ALWAYS stops if user drags mouse away or switches window
  useEffect(() => {
    const handleGlobalRelease = () => {
      if (activeActionRef.current) {
        if (ptzContinuousIntervalRef.current) {
          clearInterval(ptzContinuousIntervalRef.current);
          ptzContinuousIntervalRef.current = null;
        }
        activeActionRef.current = null;
        sendPtzCommand('stop');
      }
    };

    window.addEventListener('mouseup', handleGlobalRelease);
    window.addEventListener('touchend', handleGlobalRelease);
    window.addEventListener('blur', handleGlobalRelease);
    return () => {
      window.removeEventListener('mouseup', handleGlobalRelease);
      window.removeEventListener('touchend', handleGlobalRelease);
      window.removeEventListener('blur', handleGlobalRelease);
    };
  }, [selectedPtzCam?.id]);

  const handlePtzStop = () => {
    if (ptzContinuousIntervalRef.current) {
      clearInterval(ptzContinuousIntervalRef.current);
      ptzContinuousIntervalRef.current = null;
    }
    activeActionRef.current = null;
    sendPtzCommand('stop');
  };

  // Handle grid mode change and auto-set pagination page size
  const handleGridModeChange = (mode) => {
    setGridMode(mode);
    setCurrentCameraPage(1);
    if (mode === 'grid-1x1') setCamerasPerPage(1);
    else if (mode === 'grid-2x2') setCamerasPerPage(4);
    else if (mode === 'grid-3x3') setCamerasPerPage(9);
    else if (mode === 'grid-4x4') setCamerasPerPage(16);
    else if (mode === 'grid-6x6') setCamerasPerPage(36);
    else if (mode === 'grid-8x8') setCamerasPerPage(64);
    else if (mode === 'grid-auto') setCamerasPerPage(10);
  };

  // Reset pagination to page 1 if filter changes
  useEffect(() => {
    setCurrentCameraPage(1);
  }, [cameraSearch, filterProvince, filterCity, filterArea, filterSite]);

  const handleSaveCurrentPreset = async () => {
    if (!selectedPtzCam) return;
    setIsSavingPreset(true);
    setSavePresetFeedback(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/ptz/presets/${selectedPtzCam.id}/set`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preset_id: activePreset, name: `Preset ${activePreset}` })
      });
      if (res.ok) {
        setSavePresetFeedback(`Preset P${activePreset} Saved!`);
        setTimeout(() => setSavePresetFeedback(null), 2500);
      }
    } catch (err) {
      console.error('Failed to save preset:', err);
    } finally {
      setIsSavingPreset(false);
    }
  };

  const handleGotoPreset = async (presetId) => {
    if (!selectedPtzCam) return;
    setActivePreset(presetId);
    try {
      await fetch(`${API_BASE_URL}/api/ptz/presets/${selectedPtzCam.id}/goto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preset_id: presetId })
      });
    } catch (err) {
      console.error('Goto preset error:', err);
    }
  };

  // Fetch presets when selected camera changes
  useEffect(() => {
    if (selectedPtzCam && selectedPtzCam.is_ptz) {
      fetch(`${API_BASE_URL}/api/ptz/presets/${selectedPtzCam.id}`)
        .then((res) => res.json())
        .then((data) => {
          setPtzPresets(data.presets || []);
        })
        .catch(() => setPtzPresets([]));
    }
  }, [selectedPtzCam?.id]);

  // Click on camera tile: if PTZ supported, select and open; if not supported, auto-close PTZ
  const handleCameraTileClick = (cam) => {
    setSelectedPtzCamId(cam.id);
    if (cam.is_ptz) {
      setIsPtzOpen(true);
    } else {
      setIsPtzOpen(false);
    }
  };

  const handleTogglePtz = () => {
    if (!isPtzOpen) {
      if (!selectedPtzCam || !selectedPtzCam.is_ptz) {
        const firstPtz = allCameras.find((c) => c.is_ptz);
        if (firstPtz) {
          setSelectedPtzCamId(firstPtz.id);
        }
      }
      setIsPtzOpen(true);
    } else {
      setIsPtzOpen(false);
    }
  };

  // Filtered cameras based on search and filters
  const filteredCameras = allCameras.filter((cam) => {
    if (cameraSearch.trim()) {
      const q = cameraSearch.toLowerCase();
      const matchName = (cam.name || '').toLowerCase().includes(q);
      const matchCh = String(cam.channel_number).includes(q);
      if (!matchName && !matchCh) return false;
    }
    return true;
  });

  // Camera Grid Pagination (prevents vertical scrolling on monitor grid)
  const totalCameraPages = Math.max(1, Math.ceil(filteredCameras.length / camerasPerPage));
  const validCameraPage = Math.min(Math.max(1, currentCameraPage), totalCameraPages);
  const startCameraIdx = (validCameraPage - 1) * camerasPerPage;
  const paginatedCameras = filteredCameras.slice(startCameraIdx, startCameraIdx + camerasPerPage);

  // Filtered Agents matching Image 2
  const filteredAgents = agents.filter((agent) => {
    if (agentSearch.trim()) {
      const q = agentSearch.toLowerCase().trim();
      const matchName = (agent.name || '').toLowerCase().includes(q);
      const matchAssignee = (agent.assignee || '').toLowerCase().includes(q);
      const matchIp = (agent.lan_ip || '').toLowerCase().includes(q);
      if (!matchName && !matchAssignee && !matchIp) return false;
    }
    if (agentStatusFilter) {
      if (agentStatusFilter === 'active' && agent.status !== 'active' && agent.status !== 'online') return false;
      if (agentStatusFilter === 'offline' && (agent.status === 'active' || agent.status === 'online')) return false;
    }
    if (agentProvinceFilter && (agent.province || '').trim().toLowerCase() !== agentProvinceFilter.trim().toLowerCase()) return false;
    if (agentCityFilter && (agent.city || '').trim().toLowerCase() !== agentCityFilter.trim().toLowerCase()) return false;
    if (agentAreaFilter && (agent.area || '').trim().toLowerCase() !== agentAreaFilter.trim().toLowerCase()) return false;
    if (agentSiteFilter && (agent.site || '').trim().toLowerCase() !== agentSiteFilter.trim().toLowerCase()) return false;
    return true;
  });

  // Agents Pagination Calculations
  const totalAgentPages = Math.max(1, Math.ceil(filteredAgents.length / agentsPerPage));
  const validAgentPage = Math.min(Math.max(1, currentAgentPage), totalAgentPages);
  const paginatedAgents = filteredAgents.slice((validAgentPage - 1) * agentsPerPage, validAgentPage * agentsPerPage);

  // Filtered NVRs matching Image 4
  const filteredNvrs = savedNvrs.filter((nvr) => {
    if (nvrSearch.trim()) {
      const q = nvrSearch.toLowerCase().trim();
      const matchName = (nvr.name || '').toLowerCase().includes(q);
      const matchIp = (nvr.ip || '').toLowerCase().includes(q);
      if (!matchName && !matchIp) return false;
    }
    if (nvrStatusFilter && nvr.status !== nvrStatusFilter) return false;
    if (nvrCameraTypeFilter) {
      if (nvrCameraTypeFilter === 'ptz') {
        const hasPtz = (nvr.cameras || []).some((c) => c.is_ptz);
        if (!hasPtz) return false;
      } else if (nvrCameraTypeFilter === 'fixed') {
        const hasFixed = (nvr.cameras || []).some((c) => !c.is_ptz);
        if (!hasFixed) return false;
      }
    }
    if (nvrProvinceFilter && (nvr.province || '').trim().toLowerCase() !== nvrProvinceFilter.trim().toLowerCase()) return false;
    if (nvrCityFilter && (nvr.city || '').trim().toLowerCase() !== nvrCityFilter.trim().toLowerCase()) return false;
    if (nvrAreaFilter && (nvr.area || '').trim().toLowerCase() !== nvrAreaFilter.trim().toLowerCase()) return false;
    if (nvrSiteFilter && (nvr.site || '').trim().toLowerCase() !== nvrSiteFilter.trim().toLowerCase()) return false;
    return true;
  });

  // Strictly Cascading Location Lists for NVR Filtering
  const availableNvrProvinces = Array.from(new Set([
    ...(locationsSummary.provinces || []).map((p) => p.name),
    ...savedNvrs.map((n) => n.province).filter((p) => p && p !== '—')
  ])).filter(Boolean);

  const availableNvrCities = nvrProvinceFilter
    ? Array.from(new Set([
      ...(locationsSummary.cities || [])
        .filter((c) => c.province_name === nvrProvinceFilter)
        .map((c) => c.name),
      ...savedNvrs
        .filter((n) => n.province === nvrProvinceFilter)
        .map((n) => n.city)
        .filter((c) => c && c !== '—')
    ])).filter(Boolean)
    : [];

  const availableNvrAreas = (nvrProvinceFilter && nvrCityFilter)
    ? Array.from(new Set([
      ...(locationsSummary.areas || [])
        .filter((a) => a.city_name === nvrCityFilter)
        .map((a) => a.name),
      ...savedNvrs
        .filter((n) => n.city === nvrCityFilter)
        .map((n) => n.area)
        .filter((a) => a && a !== '—')
    ])).filter(Boolean)
    : [];

  const availableNvrSites = (nvrProvinceFilter && nvrCityFilter && nvrAreaFilter)
    ? Array.from(new Set([
      ...(locationsSummary.sites || [])
        .filter((s) => s.area_name === nvrAreaFilter)
        .map((s) => s.name),
      ...savedNvrs
        .filter((n) => n.area === nvrAreaFilter)
        .map((n) => n.site)
        .filter((s) => s && s !== '—')
    ])).filter(Boolean)
    : [];

  // Strictly Cascading Location Lists for Agent Filtering
  const availableAgentProvinces = Array.from(new Set([
    ...(locationsSummary.provinces || []).map((p) => p.name),
    ...agents.map((a) => a.province).filter((p) => p && p !== '—')
  ])).filter(Boolean);

  const availableAgentCities = agentProvinceFilter
    ? Array.from(new Set([
      ...(locationsSummary.cities || [])
        .filter((c) => c.province_name === agentProvinceFilter)
        .map((c) => c.name),
      ...agents
        .filter((a) => a.province === agentProvinceFilter)
        .map((a) => a.city)
        .filter((c) => c && c !== '—')
    ])).filter(Boolean)
    : [];

  const availableAgentAreas = (agentProvinceFilter && agentCityFilter)
    ? Array.from(new Set([
      ...(locationsSummary.areas || [])
        .filter((a) => a.city_name === agentCityFilter)
        .map((a) => a.name),
      ...agents
        .filter((a) => a.city === agentCityFilter)
        .map((a) => a.area)
        .filter((a) => a && a !== '—')
    ])).filter(Boolean)
    : [];

  const availableAgentSites = (agentProvinceFilter && agentCityFilter && agentAreaFilter)
    ? Array.from(new Set([
      ...(locationsSummary.sites || [])
        .filter((s) => s.area_name === agentAreaFilter)
        .map((s) => s.name),
      ...agents
        .filter((a) => a.area === agentAreaFilter)
        .map((a) => a.site)
        .filter((s) => s && s !== '—')
    ])).filter(Boolean)
    : [];

  // NVRs Pagination Calculations
  const totalNvrPages = Math.max(1, Math.ceil(filteredNvrs.length / nvrsPerPage));
  const validNvrPage = Math.min(Math.max(1, currentNvrPage), totalNvrPages);
  const paginatedNvrs = filteredNvrs.slice((validNvrPage - 1) * nvrsPerPage, validNvrPage * nvrsPerPage);

  if (isLoading) {
    return (
      <div style={{
        height: '100vh',
        width: '100vw',
        background: '#090d16',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '16px',
        color: '#ffffff',
        fontFamily: 'Inter, sans-serif'
      }}>
        <div style={{
          background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
          padding: '16px',
          borderRadius: '16px',
          boxShadow: '0 0 35px rgba(16, 185, 129, 0.4)'
        }}>
          <Cctv size={36} color="#ffffff" />
        </div>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>
            EPIC <span style={{ color: '#10b981' }}>VISION</span>
          </h2>
          <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginTop: '4px' }}>
            Initializing Secure Command Center...
          </p>
        </div>
        <div className="spinner" style={{
          width: '28px',
          height: '28px',
          border: '3px solid #1e293b',
          borderTopColor: '#10b981',
          borderRadius: '50%'
        }}></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <div className="app-layout">

      {/* DYNAMIC RBAC SIDEBAR */}
      <Sidebar
        activeNav={activeNav}
        setActiveNav={setActiveNav}
        locationSubTab={locationSubTab}
        setLocationSubTab={setLocationSubTab}
        counts={{
          agents: agents.length,
          nvrs: savedNvrs.length,
          cameras: allCameras.length
        }}
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={handleToggleSidebar}
      />

      {/* MAIN CONTENT AREA */}
      <main className="main-content">

        {/* Top Header Bar */}
        <TopHeader
          activeNav={activeNav}
          onOpenChangePassword={() => setActiveNav('change-password')}
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={handleToggleSidebar}
        />

        <div className="main-page-body">
          {/* 1. SUPER ADMIN DASHBOARD */}
          {activeNav === 'dashboard' && hasPermission('DASHBOARD_VIEW') && (
            <DashboardView onNavigate={setActiveNav} />
          )}

          {/* 2. USER MANAGEMENT */}
          {activeNav === 'users' && hasPermission('USER_VIEW') && (
            <UserManagementView />
          )}

          {/* 3. ROLES & PERMISSIONS (STRICTLY SUPER ADMIN ONLY) */}
          {activeNav === 'roles' && user?.is_superadmin && (
            <RoleManagementView />
          )}

          {/* 4. LOCATION MANAGEMENT */}
          {activeNav === 'locations' && hasPermission('LOCATION_VIEW') && (
            <LocationManagementView activeSubTab={locationSubTab} onTabChange={setLocationSubTab} />
          )}

          {/* 5. CHANGE PASSWORD DEDICATED PAGE */}
          {activeNav === 'change-password' && (
            <ChangePasswordView onBack={() => setActiveNav('dashboard')} />
          )}


          {/* TAB 1: AGENTS VIEW MATCHING USER SCREENSHOT IMAGE 2 */}
          <div style={{ display: activeNav === 'agents' && hasPermission('AGENT_VIEW') ? 'block' : 'none' }}>
            {/* Top Filter Toolbar matching Image 2 */}
            <div className="image-toolbar-card">
              <div className="image-toolbar-filters">
                {/* Search */}
                <div className="image-search-wrapper">
                  <Search size={15} className="image-search-icon" />
                  <input
                    type="text"
                    className="image-search-input"
                    placeholder="Search by keyword..."
                    value={agentSearch}
                    onChange={(e) => {
                      setAgentSearch(e.target.value);
                      setCurrentAgentPage(1);
                    }}
                  />
                </div>

                {/* Status Filter */}
                <select
                  className="image-filter-select"
                  value={agentStatusFilter}
                  onChange={(e) => {
                    setAgentStatusFilter(e.target.value);
                    setCurrentAgentPage(1);
                  }}
                >
                  <option value="">Status</option>
                  <option value="active">Active</option>
                  <option value="offline">Offline</option>
                </select>

                {/* Province Filter */}
                <select
                  className="image-filter-select"
                  value={agentProvinceFilter}
                  onChange={(e) => {
                    setAgentProvinceFilter(e.target.value);
                    setAgentCityFilter('');
                    setAgentAreaFilter('');
                    setAgentSiteFilter('');
                    setCurrentAgentPage(1);
                  }}
                >
                  <option value="">Province</option>
                  {availableAgentProvinces.map((prov) => (
                    <option key={prov} value={prov}>{prov}</option>
                  ))}
                </select>

                {/* City Filter (Disabled until Province is selected) */}
                <select
                  className="image-filter-select"
                  value={agentCityFilter}
                  disabled={!agentProvinceFilter}
                  style={!agentProvinceFilter ? { opacity: 0.6, cursor: 'not-allowed' } : {}}
                  onChange={(e) => {
                    setAgentCityFilter(e.target.value);
                    setAgentAreaFilter('');
                    setAgentSiteFilter('');
                    setCurrentAgentPage(1);
                  }}
                >
                  <option value="">City</option>
                  {availableAgentCities.map((cty) => (
                    <option key={cty} value={cty}>{cty}</option>
                  ))}
                </select>

                {/* Area Filter (Disabled until City is selected) */}
                <select
                  className="image-filter-select"
                  value={agentAreaFilter}
                  disabled={!agentCityFilter}
                  style={!agentCityFilter ? { opacity: 0.6, cursor: 'not-allowed' } : {}}
                  onChange={(e) => {
                    setAgentAreaFilter(e.target.value);
                    setAgentSiteFilter('');
                    setCurrentAgentPage(1);
                  }}
                >
                  <option value="">Area</option>
                  {availableAgentAreas.map((ara) => (
                    <option key={ara} value={ara}>{ara}</option>
                  ))}
                </select>

                {/* Site Filter (Disabled until Area is selected) */}
                <select
                  className="image-filter-select"
                  value={agentSiteFilter}
                  disabled={!agentAreaFilter}
                  style={!agentAreaFilter ? { opacity: 0.6, cursor: 'not-allowed' } : {}}
                  onChange={(e) => {
                    setAgentSiteFilter(e.target.value);
                    setCurrentAgentPage(1);
                  }}
                >
                  <option value="">Site</option>
                  {availableAgentSites.map((ste) => (
                    <option key={ste} value={ste}>{ste}</option>
                  ))}
                </select>
              </div>

              {/* Right Action Button */}
              {hasPermission('AGENT_CREATE') && (
                <button
                  type="button"
                  className="image-add-btn"
                  onClick={() => setIsAgentModalOpen(true)}
                >
                  <Plus size={15} />
                  <span>Add Agent</span>
                </button>
              )}
            </div>

            {/* Agents Table matching Image 2 */}
            <div className="table-page-card">
              <div className="data-table-container" style={{ margin: 0, border: 'none', borderRadius: 0, width: '100%' }}>
                <table className="data-table" style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', whiteSpace: 'nowrap' }}>
                  <thead>
                    <tr>
                      <th className="image-table-th" style={{ width: '3%', textAlign: 'center' }}></th>
                      <th className="image-table-th" style={{ width: '5%', textAlign: 'left' }}>ID</th>
                      <th className="image-table-th" style={{ width: '14%', textAlign: 'left' }}>NAME</th>
                      <th className="image-table-th" style={{ width: '10%', textAlign: 'center' }}>ASSIGNEE NAME</th>
                      <th className="image-table-th" style={{ width: '7%', textAlign: 'center' }}>STATUS</th>
                      <th className="image-table-th" style={{ width: '12%', textAlign: 'center' }}>LAN IP</th>
                      <th className="image-table-th" style={{ width: '8%', textAlign: 'center' }}>PROVINCE</th>
                      <th className="image-table-th" style={{ width: '8%', textAlign: 'center' }}>CITY</th>
                      <th className="image-table-th" style={{ width: '8%', textAlign: 'center' }}>AREA</th>
                      <th className="image-table-th" style={{ width: '8%', textAlign: 'center' }}>SITE</th>
                      <th className="image-table-th" style={{ width: '8.5%', textAlign: 'center' }}>NVRS</th>
                      <th className="image-table-th" style={{ width: '8.5%', textAlign: 'center' }}>CAMERAS</th>
                      <th className="image-table-th" style={{ width: '4%', textAlign: 'center' }}>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAgents.length === 0 ? (
                      <tr>
                        <td colSpan="13" style={{ textAlign: 'center', padding: '60px 20px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                            <Bot size={40} color="var(--text-muted)" />
                            <span style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.95rem' }}>No Agents found</span>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', maxWidth: '380px', margin: '2px 0 8px' }}>
                              {agentSearch || agentStatusFilter || agentProvinceFilter || agentCityFilter
                                ? 'No agents match your active filter criteria.'
                                : 'Create an Agent first to register and organize your NVR surveillance devices.'}
                            </p>
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              onClick={() => setIsAgentModalOpen(true)}
                            >
                              <Plus size={14} />
                              Add Agent
                            </button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      paginatedAgents.map((agent, agentIdx) => {
                        const isExpanded = expandedAgentId === agent.id;
                        const isOnline = agent.status === 'active' || agent.status === 'online';
                        const agentNvrs = agent.nvrs || [];
                        const isBottomAgent = agentIdx >= paginatedAgents.length - 1 && paginatedAgents.length >= 4;

                        return (
                          <React.Fragment key={agent.id}>
                            {/* Agent Main Row matching Image 2 */}
                            <tr
                              className={`main-row ${isExpanded ? 'expanded-row' : ''}`}
                              onClick={() => setExpandedAgentId(isExpanded ? null : agent.id)}
                              style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}
                            >
                              <td style={{ textAlign: 'center' }}>
                                <span style={{ color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                </span>
                              </td>

                              <td className="font-mono" style={{ textAlign: 'left', color: '#64748b', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={String(agent.id)}>
                                {agent.id}
                              </td>

                              <td style={{ textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={agent.name}>
                                <span style={{
                                  color: '#0f172a',
                                  fontWeight: 700,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap'
                                }}>
                                  {agent.name}
                                </span>
                              </td>

                              <td style={{ textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={agent.assignee || '—'}>
                                <span style={{ fontWeight: 600, color: '#1e293b' }}>
                                  {agent.assignee || '—'}
                                </span>
                              </td>

                              <td style={{ textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                <span style={{
                                  fontSize: '0.72rem',
                                  fontWeight: 800,
                                  letterSpacing: '0.04em',
                                  color: isOnline ? '#059669' : '#64748b',
                                  textTransform: 'uppercase'
                                }}>
                                  {isOnline ? 'ACTIVE' : 'OFFLINE'}
                                </span>
                              </td>

                              <td className="font-mono" style={{ textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={agent.lan_ip || 'Not enrolled'}>
                                <span style={{
                                  fontSize: '0.8rem',
                                  color: agent.lan_ip && agent.lan_ip !== 'Not enrolled' ? '#0f172a' : '#94a3b8',
                                  fontWeight: 600
                                }}>
                                  {agent.lan_ip || 'Not enrolled'}
                                </span>
                              </td>

                              <td style={{ textAlign: 'center', color: '#475569', fontSize: '0.84rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={agent.province || '—'}>
                                {agent.province || '—'}
                              </td>

                              <td style={{ textAlign: 'center', color: '#475569', fontSize: '0.84rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={agent.city || '—'}>
                                {agent.city || '—'}
                              </td>

                              <td style={{ textAlign: 'center', color: '#64748b', fontSize: '0.84rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={agent.area || '—'}>
                                {agent.area || '—'}
                              </td>

                              <td style={{ textAlign: 'center', color: '#64748b', fontSize: '0.84rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={agent.site || '—'}>
                                {agent.site || '—'}
                              </td>

                              <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }} title={`${agent.total_nvrs} NVR(s)`}>
                                <span className="pill-cyan-nvrs" style={{ justifyContent: 'center' }}>
                                  <Server size={13} style={{ flexShrink: 0 }} />
                                  {agent.total_nvrs} {agent.total_nvrs === 1 ? 'NVR' : 'NVRs'}
                                </span>
                              </td>

                              <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }} title={`${agent.total_cameras} Cameras`}>
                                <span className="pill-purple-cams" style={{ justifyContent: 'center' }}>
                                  <Video size={13} style={{ flexShrink: 0 }} />
                                  {agent.total_cameras} Cameras
                                </span>
                              </td>

                              {/* 3-DOTS ACTION MENU */}
                              <td style={{ textAlign: 'center', position: 'relative' }} onClick={(e) => e.stopPropagation()}>
                                <div className="action-dropdown-wrapper">
                                  <button
                                    type="button"
                                    className="action-dots-btn"
                                    onClick={() => setOpenAgentDropdownId(openAgentDropdownId === agent.id ? null : agent.id)}
                                    title="Actions"
                                  >
                                    <MoreVertical size={16} />
                                  </button>

                                  {openAgentDropdownId === agent.id && (
                                    <div className={`action-menu-dropdown right-aligned ${isBottomAgent ? 'open-up' : 'open-down'}`}>
                                      {hasPermission('NVR_CREATE') && (
                                        <button
                                          type="button"
                                          className="action-menu-item"
                                          onClick={() => {
                                            setSelectedAgentId(agent.id);
                                            setOpenAgentDropdownId(null);
                                            setActiveNav('nvrs');
                                            handleOpenModal();
                                          }}
                                        >
                                          <Plus size={14} color="#059669" />
                                          Add NVR to Agent
                                        </button>
                                      )}

                                      {hasPermission('AGENT_UPDATE') && (
                                        <button
                                          type="button"
                                          className="action-menu-item"
                                          onClick={() => handleOpenEditAgent(agent)}
                                        >
                                          <Sliders size={14} color="#059669" />
                                          Edit Agent
                                        </button>
                                      )}

                                      {hasPermission('AGENT_DELETE') && (
                                        <>
                                          <div style={{ height: '1px', background: '#f1f5f9', margin: '3px 0' }}></div>
                                          <button
                                            type="button"
                                            className="action-menu-item danger"
                                            onClick={(e) => handleDeleteAgent(agent.id, e)}
                                          >
                                            <Trash2 size={14} />
                                            Delete Agent
                                          </button>
                                        </>
                                      )}

                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>

                            {/* Collapsible Sub-Row: Connected NVRs Dropdown */}
                            {isExpanded && (
                              <tr className="sub-table-row">
                                <td colSpan="14" className="sub-table-cell">
                                  <div className="camera-sub-list">
                                    <div style={{
                                      padding: '6px 12px 10px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'space-between',
                                      borderBottom: '1px solid #e2e8f0',
                                      marginBottom: '8px'
                                    }}>
                                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                        Connected NVRs ({agentNvrs.length})
                                      </span>
                                      {hasPermission('NVR_CREATE') && (
                                        <button
                                          type="button"
                                          className="btn btn-secondary btn-sm"
                                          style={{ fontSize: '0.72rem', padding: '3px 9px' }}
                                          onClick={() => {
                                            setSelectedAgentId(agent.id);
                                            setActiveNav('nvrs');
                                            handleOpenModal();
                                          }}
                                        >
                                          <Plus size={12} />
                                          + Add NVR to {agent.name}
                                        </button>
                                      )}
                                    </div>

                                    {agentNvrs.length === 0 ? (
                                      <div style={{ padding: '16px', color: 'var(--text-muted)', fontSize: '0.84rem', textAlign: 'center' }}>
                                        No NVRs assigned to this agent yet.
                                      </div>
                                    ) : (
                                      agentNvrs.map((n) => (
                                        <div key={n.id} className="camera-sub-item">
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: '180px' }}>
                                            <Server size={15} color="#059669" />
                                            <strong style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.85rem' }}>{n.name}</strong>
                                          </div>

                                          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1, margin: '0 16px' }}>
                                            <span className="font-mono" style={{ color: '#0f172a', fontSize: '0.8rem', fontWeight: 600 }}>
                                              {n.ip}:{n.port}
                                            </span>
                                            <span style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                                              User: <strong style={{ color: '#0f172a' }}>{n.username}</strong>
                                            </span>
                                            <span style={{ color: '#2563eb', fontWeight: 600, fontSize: '0.8rem' }}>
                                              {n.total_channels} Channels
                                            </span>
                                          </div>

                                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <span style={{ color: '#059669', fontWeight: 600, fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                              <span className="pulse-dot"></span>
                                              Online
                                            </span>
                                            <button
                                              type="button"
                                              className="btn btn-secondary btn-sm"
                                              style={{ fontSize: '0.7rem', padding: '2px 8px' }}
                                              onClick={() => {
                                                setActiveNav('nvrs');
                                                setExpandedRowId(n.id);
                                              }}
                                            >
                                              View Details
                                            </button>
                                          </div>
                                        </div>
                                      ))
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination Bar matching Image 2 */}
              {filteredAgents.length > 0 && (
                <div className="image-pagination-bar">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span className="pagination-info-text">
                      Showing {filteredAgents.length === 0 ? 0 : (validAgentPage - 1) * agentsPerPage + 1}–{Math.min(validAgentPage * agentsPerPage, filteredAgents.length)} of {filteredAgents.length} agents
                    </span>
                    <select
                      className="image-page-size-select"
                      value={agentsPerPage}
                      onChange={(e) => {
                        setAgentsPerPage(Number(e.target.value));
                        setCurrentAgentPage(1);
                      }}
                    >
                      <option value={5}>5 / page</option>
                      <option value={10}>10 / page</option>
                      <option value={20}>20 / page</option>
                    </select>
                  </div>

                  <div className="image-pagination-right">
                    <button
                      type="button"
                      className="image-page-nav-btn"
                      disabled={validAgentPage <= 1}
                      onClick={() => setCurrentAgentPage((p) => Math.max(1, p - 1))}
                    >
                      Prev
                    </button>

                    <div className="image-page-current-pill">
                      {validAgentPage} / {totalAgentPages}
                    </div>

                    <button
                      type="button"
                      className="image-page-nav-btn"
                      disabled={validAgentPage >= totalAgentPages}
                      onClick={() => setCurrentAgentPage((p) => Math.min(totalAgentPages, p + 1))}
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* TAB 2: NVR TABLE (ROW-WISE WITH DROPDOWN CAMERAS & 3-DOTS ACTION) */}
          <div style={{ display: activeNav === 'nvrs' && hasPermission('NVR_VIEW') ? 'block' : 'none' }}>
            {/* Top Filter Toolbar matching Image 4 */}
            <div className="image-toolbar-card">
              <div className="image-toolbar-filters">
                {/* Search */}
                <div className="image-search-wrapper">
                  <Search size={15} className="image-search-icon" />
                  <input
                    type="text"
                    className="image-search-input"
                    placeholder="Search by keyword..."
                    value={nvrSearch}
                    onChange={(e) => {
                      setNvrSearch(e.target.value);
                      setCurrentNvrPage(1);
                    }}
                  />
                </div>

                {/* Status Filter */}
                <select
                  className="image-filter-select"
                  value={nvrStatusFilter}
                  onChange={(e) => {
                    setNvrStatusFilter(e.target.value);
                    setCurrentNvrPage(1);
                  }}
                >
                  <option value="">Status</option>
                  <option value="online">Online</option>
                  <option value="offline">Offline</option>
                </select>

                {/* Camera Type Filter */}
                <select
                  className="image-filter-select"
                  value={nvrCameraTypeFilter}
                  onChange={(e) => {
                    setNvrCameraTypeFilter(e.target.value);
                    setCurrentNvrPage(1);
                  }}
                >
                  <option value="">Camera Type</option>
                  <option value="ptz">PTZ Cameras</option>
                  <option value="fixed">Fixed Cameras</option>
                </select>

                {/* Province Filter */}
                <select
                  className="image-filter-select"
                  value={nvrProvinceFilter}
                  onChange={(e) => {
                    setNvrProvinceFilter(e.target.value);
                    setNvrCityFilter('');
                    setNvrAreaFilter('');
                    setNvrSiteFilter('');
                    setCurrentNvrPage(1);
                  }}
                >
                  <option value="">Province</option>
                  {availableNvrProvinces.map((prov) => (
                    <option key={prov} value={prov}>{prov}</option>
                  ))}
                </select>

                {/* City Filter (Cascading: disabled until Province is chosen) */}
                <select
                  className="image-filter-select"
                  value={nvrCityFilter}
                  disabled={!nvrProvinceFilter}
                  style={!nvrProvinceFilter ? { opacity: 0.6, cursor: 'not-allowed' } : {}}
                  onChange={(e) => {
                    setNvrCityFilter(e.target.value);
                    setNvrAreaFilter('');
                    setNvrSiteFilter('');
                    setCurrentNvrPage(1);
                  }}
                >
                  <option value="">City</option>
                  {availableNvrCities.map((cty) => (
                    <option key={cty} value={cty}>{cty}</option>
                  ))}
                </select>

                {/* Area Filter (Cascading: disabled until City is chosen) */}
                <select
                  className="image-filter-select"
                  value={nvrAreaFilter}
                  disabled={!nvrCityFilter}
                  style={!nvrCityFilter ? { opacity: 0.6, cursor: 'not-allowed' } : {}}
                  onChange={(e) => {
                    setNvrAreaFilter(e.target.value);
                    setNvrSiteFilter('');
                    setCurrentNvrPage(1);
                  }}
                >
                  <option value="">Area</option>
                  {availableNvrAreas.map((ara) => (
                    <option key={ara} value={ara}>{ara}</option>
                  ))}
                </select>

                {/* Site Filter (Cascading: disabled until Area is chosen) */}
                <select
                  className="image-filter-select"
                  value={nvrSiteFilter}
                  disabled={!nvrAreaFilter}
                  style={!nvrAreaFilter ? { opacity: 0.6, cursor: 'not-allowed' } : {}}
                  onChange={(e) => {
                    setNvrSiteFilter(e.target.value);
                    setCurrentNvrPage(1);
                  }}
                >
                  <option value="">Site</option>
                  {availableNvrSites.map((ste) => (
                    <option key={ste} value={ste}>{ste}</option>
                  ))}
                </select>
              </div>

              {/* Right Action Button: Clean Green "+ Add NVR" OR Red "Link with Agent First" */}
              {hasPermission('NVR_CREATE') && (
                isAgentLinked ? (
                  <button
                    type="button"
                    className="image-add-btn"
                    onClick={handleOpenModal}
                  >
                    <Plus size={15} />
                    <span>Add NVR</span>
                  </button>
                ) : (
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '7px 14px',
                      borderRadius: '6px',
                      background: '#fef2f2',
                      border: '1px solid #fecaca',
                      color: '#dc2626',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      letterSpacing: '0.01em',
                      cursor: 'default',
                      boxShadow: '0 1px 2px rgba(220, 38, 38, 0.05)'
                    }}
                    title="User must be linked with an Agent first before adding NVR devices"
                  >
                    <AlertTriangle size={15} color="#dc2626" />
                    <span>Link with Agent First</span>
                  </div>
                )
              )}
            </div>

            {/* NVRs Table matching Image 4 (Single line responsive, equal proportional columns, ellipsis with tooltip) */}
            <div className="table-page-card">
              <div className="data-table-container" style={{ margin: 0, border: 'none', borderRadius: 0, width: '100%' }}>
                <table className="data-table" style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', whiteSpace: 'nowrap' }}>
                  <thead>
                    <tr>
                      <th className="image-table-th" style={{ width: '3%', textAlign: 'center' }}></th>
                      <th className="image-table-th" style={{ width: '4%', textAlign: 'left' }}>ID</th>
                      <th className="image-table-th" style={{ width: '6%', textAlign: 'left' }}>NAME</th>
                      <th className="image-table-th" style={{ width: '7%', textAlign: 'center' }}>VENDOR</th>
                      <th className="image-table-th" style={{ width: '10%', textAlign: 'center' }}>IP ADDRESS</th>
                      <th className="image-table-th" style={{ width: '6%', textAlign: 'center' }}>HTTP PORT</th>
                      <th className="image-table-th" style={{ width: '6%', textAlign: 'center' }}>RTSP PORT</th>
                      <th className="image-table-th" style={{ width: '8%', textAlign: 'center' }}>PROVINCE</th>
                      <th className="image-table-th" style={{ width: '8%', textAlign: 'center' }}>CITY</th>
                      <th className="image-table-th" style={{ width: '8%', textAlign: 'center' }}>AREA</th>
                      <th className="image-table-th" style={{ width: '8%', textAlign: 'center' }}>SITE</th>
                      <th className="image-table-th" style={{ width: '8%', textAlign: 'center' }}>AGENT</th>
                      <th className="image-table-th" style={{ width: '8%', textAlign: 'center' }}>CAMERAS</th>
                      <th className="image-table-th" style={{ width: '4%', textAlign: 'center' }}>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredNvrs.length === 0 ? (
                      <tr>
                        <td colSpan="14" style={{ textAlign: 'center', padding: '60px 20px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                            <Cctv size={38} color="var(--text-muted)" />
                            <span style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.95rem' }}>No NVR found</span>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', maxWidth: '380px', margin: '2px 0 8px' }}>
                              {nvrSearch || nvrStatusFilter || nvrProvinceFilter || nvrCityFilter || nvrAreaFilter || nvrSiteFilter
                                ? 'No NVR devices match your active filter criteria.'
                                : 'Add your first NVR device to monitor live camera streams across locations.'}
                            </p>
                            {isAgentLinked ? (
                              <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                onClick={handleOpenModal}
                              >
                                <Plus size={14} />
                                Add NVR
                              </button>
                            ) : (
                              <div
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  padding: '6px 14px',
                                  borderRadius: '6px',
                                  background: '#fef2f2',
                                  border: '1px solid #fecaca',
                                  color: '#dc2626',
                                  fontSize: '0.82rem',
                                  fontWeight: 600,
                                  marginTop: '4px'
                                }}
                              >
                                <AlertTriangle size={14} color="#dc2626" />
                                <span>Link with Agent First</span>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    ) : (
                      paginatedNvrs.map((nvr, nvrIdx) => {
                        const isExpanded = expandedRowId === nvr.id;
                        const isBottomNvr = nvrIdx >= paginatedNvrs.length - 1 && paginatedNvrs.length >= 4;

                        return (
                          <React.Fragment key={nvr.id}>
                            {/* Main NVR Row matching Image 4 - Strictly Single-Line */}
                            <tr
                              className={`main-row ${isExpanded ? 'expanded-row' : ''}`}
                              onClick={() => toggleRow(nvr.id)}
                              style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}
                            >
                              <td style={{ textAlign: 'center' }}>
                                <span style={{ color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                </span>
                              </td>

                              <td className="font-mono" style={{ textAlign: 'left', color: '#64748b', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={String(nvr.id)}>
                                {nvr.id}
                              </td>

                              <td style={{ textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={nvr.name}>
                                <span style={{
                                  color: '#0f172a',
                                  fontWeight: 700,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap'
                                }}>
                                  {nvr.name}
                                </span>
                              </td>

                              <td style={{ textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={nvr.vendor || 'HIKVISION'}>
                                <span className="pill-vendor-badge">
                                  {nvr.vendor || 'HIKVISION'}
                                </span>
                              </td>

                              <td className="font-mono" style={{ textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={nvr.ip}>
                                <strong style={{ color: '#0f172a', fontWeight: 700 }}>{nvr.ip}</strong>
                              </td>

                              <td className="font-mono" style={{ textAlign: 'center', color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={String(nvr.port)}>
                                {nvr.port}
                              </td>

                              <td className="font-mono" style={{ textAlign: 'center', color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={String(nvr.rtsp_port)}>
                                {nvr.rtsp_port}
                              </td>

                              <td style={{ textAlign: 'center', color: '#475569', fontSize: '0.84rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={nvr.province || '—'}>
                                {nvr.province || '—'}
                              </td>

                              <td style={{ textAlign: 'center', color: '#475569', fontSize: '0.84rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={nvr.city || '—'}>
                                {nvr.city || '—'}
                              </td>

                              <td style={{ textAlign: 'center', color: '#475569', fontSize: '0.84rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={nvr.area || '—'}>
                                {nvr.area || '—'}
                              </td>

                              <td style={{ textAlign: 'center', color: '#0f172a', fontWeight: 600, fontSize: '0.84rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={nvr.site || '—'}>
                                {nvr.site || '—'}
                              </td>

                              <td style={{ textAlign: 'center', color: '#0f172a', fontWeight: 600, fontSize: '0.84rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={nvr.agent_name || '—'}>
                                {nvr.agent_name || '—'}
                              </td>

                              <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }} title={`${nvr.total_channels} Cameras`}>
                                <span className="pill-blue-cams" style={{ justifyContent: 'center' }}>
                                  <Video size={13} style={{ flexShrink: 0 }} />
                                  <span>{nvr.total_channels} Cameras</span>
                                </span>
                              </td>

                              {/* 3-DOTS ACTION MENU */}
                              <td style={{ textAlign: 'center', position: 'relative' }} onClick={(e) => e.stopPropagation()}>
                                <div className="action-dropdown-wrapper">
                                  <button
                                    type="button"
                                    className="action-dots-btn"
                                    onClick={() => setOpenDropdownId(openDropdownId === nvr.id ? null : nvr.id)}
                                    title="Actions"
                                  >
                                    <MoreVertical size={16} />
                                  </button>

                                  {openDropdownId === nvr.id && (
                                    <div className={`action-menu-dropdown right-aligned ${isBottomNvr ? 'open-up' : 'open-down'}`}>
                                      <button
                                        type="button"
                                        className="action-menu-item"
                                        onClick={() => { toggleRow(nvr.id); setOpenDropdownId(null); }}
                                      >
                                        <Video size={14} color="#059669" />
                                        {isExpanded ? 'Hide Cameras' : 'View Cameras'}
                                      </button>

                                      <button
                                        type="button"
                                        className="action-menu-item"
                                        onClick={() => { copyToClipboard(nvr.ip); setOpenDropdownId(null); }}
                                      >
                                        <Copy size={14} />
                                        Copy IP Address
                                      </button>

                                      {hasPermission('NVR_UPDATE') && (
                                        <button
                                          type="button"
                                          className="action-menu-item"
                                          onClick={() => handleOpenEditNvr(nvr)}
                                        >
                                          <Sliders size={14} color="#059669" />
                                          Edit NVR
                                        </button>
                                      )}

                                      {hasPermission('NVR_DELETE') && (
                                        <>
                                          <div style={{ height: '1px', background: '#f1f5f9', margin: '3px 0' }}></div>
                                          <button
                                            type="button"
                                            className="action-menu-item danger"
                                            onClick={(e) => handleDeleteNvr(nvr.id, e)}
                                          >
                                            <Trash2 size={14} />
                                            Delete NVR
                                          </button>
                                        </>
                                      )}

                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>

                            {/* Collapsible Dropdown: Cameras Row-by-Row Simple Text */}
                            {isExpanded && (
                              <tr className="sub-table-row">
                                <td colSpan="14" className="sub-table-cell">
                                  <div className="camera-sub-list">
                                    {nvr.cameras && nvr.cameras.length > 0 ? (
                                      nvr.cameras.map((cam) => (
                                        <div key={cam.id} className="camera-sub-item">
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: '220px' }}>
                                            <span style={{ fontWeight: 700, color: '#059669', fontSize: '0.8rem' }}>
                                              CH {cam.channel_number}
                                            </span>
                                            <span style={{ fontWeight: 600, color: '#0f172a' }}>
                                              {cam.name}
                                            </span>
                                          </div>

                                          {/* RTSP Stream URL Simple Text with Copy Icon */}
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, margin: '0 20px' }}>
                                            <span className="font-mono" style={{ color: '#047857', fontSize: '0.78rem', wordBreak: 'break-all' }}>
                                              {cam.rtsp_stream_url}
                                            </span>
                                            <button
                                              type="button"
                                              onClick={() => copyToClipboard(cam.rtsp_stream_url)}
                                              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', padding: '2px' }}
                                              title="Copy RTSP URL"
                                            >
                                              {copiedUrl === cam.rtsp_stream_url ? <Check size={14} color="#059669" /> : <Copy size={14} />}
                                            </button>
                                          </div>

                                          {/* Simple Text Status */}
                                          <div style={{ minWidth: '90px', textAlign: 'right' }}>
                                            <span style={{ color: '#059669', fontWeight: 600, fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                              <Check size={12} />
                                              Reachable
                                            </span>
                                          </div>
                                        </div>
                                      ))
                                    ) : (
                                      <div style={{ padding: '14px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                        No camera channels detected for this NVR.
                                      </div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination Bar matching Image 4 */}
              {filteredNvrs.length > 0 && (
                <div className="image-pagination-bar">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span className="pagination-info-text">
                      Showing {filteredNvrs.length === 0 ? 0 : (validNvrPage - 1) * nvrsPerPage + 1}–{Math.min(validNvrPage * nvrsPerPage, filteredNvrs.length)} of {filteredNvrs.length} NVRs
                    </span>
                    <select
                      className="image-page-size-select"
                      value={nvrsPerPage}
                      onChange={(e) => {
                        setNvrsPerPage(Number(e.target.value));
                        setCurrentNvrPage(1);
                      }}
                    >
                      <option value={5}>5 / page</option>
                      <option value={10}>10 / page</option>
                      <option value={20}>20 / page</option>
                    </select>
                  </div>

                  <div className="image-pagination-right">
                    <button
                      type="button"
                      className="image-page-nav-btn"
                      disabled={validNvrPage <= 1}
                      onClick={() => setCurrentNvrPage((p) => Math.max(1, p - 1))}
                    >
                      Prev
                    </button>

                    <div className="image-page-current-pill">
                      {validNvrPage} / {totalNvrPages}
                    </div>

                    <button
                      type="button"
                      className="image-page-nav-btn"
                      disabled={validNvrPage >= totalNvrPages}
                      onClick={() => setCurrentNvrPage((p) => Math.min(totalNvrPages, p + 1))}
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* TAB 2: LIVE SURVEILLANCE MONITOR (WEBRTC + PTZ CONTROLLER) */}
          {/* Kept mounted in background so streams stay active without reconnect delay */}
          <div style={{ display: activeNav === 'monitor' && hasPermission('LIVE_MONITOR_VIEW') ? 'block' : 'none' }}>
            <div>
              {/* Top Control Bar matching user design: Search, Filters, Status, Close PTZ, Layout Modes */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '14px',
                marginBottom: '18px',
                background: '#ffffff',
                border: '1px solid var(--border-color)',
                padding: '10px 16px',
                borderRadius: 'var(--radius-md)',
                boxShadow: 'var(--shadow-card)',
                flexWrap: 'wrap'
              }}>
                {/* Left Filters */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '400px' }}>
                  {/* Search */}
                  <div style={{ position: 'relative', flex: 1.3 }}>
                    <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input
                      type="text"
                      className="form-input"
                      style={{ paddingLeft: '32px', height: '35px', fontSize: '0.82rem' }}
                      placeholder="Search camera..."
                      value={cameraSearch}
                      onChange={(e) => setCameraSearch(e.target.value)}
                    />
                  </div>

                  {/* Filter Dropdowns */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', position: 'relative' }}>
                    <Filter size={13} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: '#059669', zIndex: 1 }} />
                    <select
                      className="form-input"
                      style={{ height: '35px', fontSize: '0.8rem', paddingLeft: '24px', paddingRight: '8px' }}
                      value={filterProvince}
                      onChange={(e) => setFilterProvince(e.target.value)}
                    >
                      <option value="">Provinces</option>
                      <option value="Balochistan">Balochistan</option>
                      <option value="Punjab">Punjab</option>
                      <option value="Sindh">Sindh</option>
                      <option value="KPK">KPK</option>
                    </select>
                  </div>

                  <select
                    className="form-input"
                    style={{ height: '35px', fontSize: '0.8rem', padding: '0 8px' }}
                    value={filterCity}
                    onChange={(e) => setFilterCity(e.target.value)}
                  >
                    <option value="">Cities</option>
                    <option value="Quetta">Quetta</option>
                    <option value="Lahore">Lahore</option>
                    <option value="Karachi">Karachi</option>
                    <option value="Islamabad">Islamabad</option>
                  </select>

                  <select
                    className="form-input"
                    style={{ height: '35px', fontSize: '0.8rem', padding: '0 8px' }}
                    value={filterArea}
                    onChange={(e) => setFilterArea(e.target.value)}
                  >
                    <option value="">Areas</option>
                    <option value="Satellite Town">Satellite Town</option>
                    <option value="Main Boulevard">Main Boulevard</option>
                  </select>

                  <select
                    className="form-input"
                    style={{ height: '35px', fontSize: '0.8rem', padding: '0 8px' }}
                    value={filterSite}
                    onChange={(e) => setFilterSite(e.target.value)}
                  >
                    <option value="">Sites</option>
                    <option value="Design Hub">Design Hub</option>
                    <option value="Headquarters">Headquarters</option>
                  </select>
                </div>

                {/* Right: Online Status, PTZ Toggle, Grid Switcher */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {/* Online Badge */}
                  <div style={{
                    background: '#ecfdf5',
                    border: '1px solid #a7f3d0',
                    color: '#065f46',
                    borderRadius: '20px',
                    padding: '4px 11px',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}>
                    <span className="pulse-dot"></span>
                    {filteredCameras.length}/{allCameras.length} ONLINE
                  </div>

                  {/* Close / Open PTZ Toggle Button */}
                  {hasPermission('CAM_PTZ_CONTROL') && (
                    <button
                      type="button"
                      className="btn btn-sm"
                      style={{
                        background: isPtzOpen ? '#059669' : '#ffffff',
                        color: isPtzOpen ? '#ffffff' : '#059669',
                        border: '1.5px solid #059669',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        padding: '5px 12px'
                      }}
                      onClick={handleTogglePtz}
                    >
                      <Sliders size={13} color={isPtzOpen ? '#ffffff' : '#059669'} />
                      {isPtzOpen ? 'Close PTZ' : 'Open PTZ'}
                    </button>
                  )}

                  {/* Grid Layout Switcher */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                    <button
                      className={`btn btn-sm ${gridMode === 'grid-auto' ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ fontSize: '0.74rem', padding: '5px 8px' }}
                      onClick={() => handleGridModeChange('grid-auto')}
                    >
                      Auto ({allCameras.length})
                    </button>
                    <button
                      className={`btn btn-sm ${gridMode === 'grid-1x1' ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ fontSize: '0.74rem', padding: '5px 8px' }}
                      onClick={() => handleGridModeChange('grid-1x1')}
                    >
                      1x1
                    </button>
                    <button
                      className={`btn btn-sm ${gridMode === 'grid-2x2' ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ fontSize: '0.74rem', padding: '5px 8px' }}
                      onClick={() => handleGridModeChange('grid-2x2')}
                    >
                      2x2
                    </button>
                    <button
                      className={`btn btn-sm ${gridMode === 'grid-3x3' ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ fontSize: '0.74rem', padding: '5px 8px' }}
                      onClick={() => handleGridModeChange('grid-3x3')}
                    >
                      3x3
                    </button>
                    <button
                      className={`btn btn-sm ${gridMode === 'grid-4x4' ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ fontSize: '0.74rem', padding: '5px 8px' }}
                      onClick={() => handleGridModeChange('grid-4x4')}
                    >
                      4x4
                    </button>
                    <button
                      className={`btn btn-sm ${gridMode === 'grid-6x6' ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ fontSize: '0.74rem', padding: '5px 8px' }}
                      onClick={() => handleGridModeChange('grid-6x6')}
                    >
                      6x6
                    </button>
                    <button
                      className={`btn btn-sm ${gridMode === 'grid-8x8' ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ fontSize: '0.74rem', padding: '5px 8px' }}
                      onClick={() => handleGridModeChange('grid-8x8')}
                    >
                      8x8
                    </button>
                  </div>
                </div>
              </div>

              {/* Main Content Area: Grid Column + Right PTZ Controller */}
              {allCameras.length === 0 ? (
                <div style={{ background: '#ffffff', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '60px 20px', textAlign: 'center' }}>
                  <Monitor size={42} color="var(--text-muted)" style={{ margin: '0 auto 12px' }} />
                  <h4 style={{ fontWeight: 600, color: '#0f172a', marginBottom: '4px' }}>No Camera Feeds Available</h4>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '16px' }}>
                    Add an NVR to start live streaming camera feeds.
                  </p>
                  {isAgentLinked ? (
                    <button className="btn btn-primary btn-sm" onClick={handleOpenModal}>
                      <Plus size={14} />
                      + Add NVR
                    </button>
                  ) : (
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 14px',
                        borderRadius: '6px',
                        background: '#fef2f2',
                        border: '1px solid #fecaca',
                        color: '#dc2626',
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        margin: '0 auto'
                      }}
                    >
                      <AlertTriangle size={14} color="#dc2626" />
                      <span>Link with Agent First</span>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="monitor-wrapper">
                    {/* Camera Grid Column */}
                    <div className="monitor-grid-column">
                      <div className={`monitor-grid ${gridMode}`}>
                        {paginatedCameras.map((cam, idx) => {
                          const isSelected = selectedPtzCam?.id === cam.id && isPtzOpen;

                          return (
                            <div
                              key={cam.id || idx}
                              className={`camera-tile ${isSelected ? 'selected-ptz' : ''}`}
                              onClick={() => handleCameraTileClick(cam)}
                            >
                              {/* Top Overlay */}
                              <div className="camera-tile-header">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span className="pulse-dot"></span>
                                  <strong style={{ fontSize: '0.85rem' }}>{cam.name}</strong>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }} onClick={(e) => e.stopPropagation()}>
                                  {/* PTZ Button: ONLY RENDERED IF CAMERA HAS PTZ AND USER HAS PTZ PERMISSION! */}
                                  {cam.is_ptz && hasPermission('CAM_PTZ_CONTROL') && (
                                    <button
                                      type="button"
                                      className="tile-ptz-btn"
                                      onClick={() => {
                                        setSelectedPtzCamId(cam.id);
                                        setIsPtzOpen(true);
                                      }}
                                      title="PTZ Controls Available"
                                    >
                                      <Sliders size={12} />
                                    </button>
                                  )}

                                  {/* Snapshot Button */}
                                  {hasPermission('CAM_SNAPSHOT') && (
                                    <button
                                      type="button"
                                      className="tile-icon-btn"
                                      onClick={() => alert(`Snapshot taken for ${cam.name}`)}
                                      title="Capture Snapshot"
                                    >
                                      <CameraIcon size={12} />
                                    </button>
                                  )}

                                  {/* Maximize Button */}
                                  <a
                                    href={`${WEBRTC_STREAM_BASE}/camera_${cam.id}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="tile-icon-btn"
                                    title="Fullscreen WebRTC Stream"
                                  >
                                    <Maximize2 size={12} />
                                  </a>
                                </div>
                              </div>

                              {/* Real-time Video Stream (Native WebRTC WHEP Component) */}
                              <div style={{
                                flex: 1,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: '#090d16',
                                position: 'relative',
                                overflow: 'hidden'
                              }}>
                                <LiveWebRtcCamera
                                  streamPath={`camera_${cam.id}`}
                                  camName={cam.name}
                                  isMuted={isMuted}
                                />
                              </div>

                              {/* Bottom Controls Bar */}
                              <div className="camera-tile-footer">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  {hasPermission('CAM_RECORD') && (
                                    <span style={{ color: '#ef4444', fontWeight: 700 }}>REC ●</span>
                                  )}
                                  <span style={{ color: '#34d399', fontSize: '0.68rem', fontWeight: 600 }}>WHEP &lt; 200ms</span>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>CH {cam.channel_number}</span>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      copyToClipboard(cam.rtsp_stream_url);
                                    }}
                                    style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0 }}
                                    title="Copy RTSP Link"
                                  >
                                    <Copy size={12} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Right Side: PTZ Controller Panel (Rendered only when open, user has permission, and camera has PTZ) */}
                    {isPtzOpen && hasPermission('CAM_PTZ_CONTROL') && selectedPtzCam && selectedPtzCam.is_ptz && (
                      <aside className="ptz-controller-panel">
                        {/* Header */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '10px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ background: '#ecfdf5', padding: '6px', borderRadius: '6px', display: 'flex' }}>
                              <Sliders size={16} color="#059669" />
                            </div>
                            <h3 style={{ fontSize: '0.98rem', fontWeight: 800, color: '#0f172a' }}>
                              PTZ Controller
                            </h3>
                          </div>
                          <button
                            type="button"
                            onClick={() => setIsPtzOpen(false)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: '4px' }}
                            title="Close PTZ Panel"
                          >
                            <X size={16} />
                          </button>
                        </div>

                        {/* Active Camera Card - ONLY Camera Name and Clean Status Badge */}
                        <div className="ptz-camera-badge-card">
                          <div className="ptz-camera-badge-left">
                            <span className="pulse-dot"></span>
                            <strong className="ptz-camera-badge-title">{selectedPtzCam.name}</strong>
                          </div>
                          <span className="ptz-camera-badge-tag">
                            PTZ ACTIVE
                          </span>
                        </div>

                        {/* Section: Pan/Tilt Speed Velocity Slider */}
                        <div>
                          <div className="ptz-section-title">
                            <span>PAN / TILT SPEED</span>
                            <span className="font-mono" style={{ color: '#059669', fontSize: '0.82rem', fontWeight: 700 }}>{ptzSpeed}%</span>
                          </div>

                          <input
                            type="range"
                            min="1"
                            max="100"
                            value={ptzSpeed}
                            onChange={(e) => setPtzSpeed(parseInt(e.target.value, 10))}
                            style={{ width: '100%', accentColor: '#10b981', cursor: 'pointer' }}
                          />
                        </div>

                        {/* Section: 8-DIRECTIONAL JOYSTICK */}
                        <div>
                          <div className="ptz-section-title">
                            <span>DIRECTIONAL JOYSTICK</span>
                            <span style={{ fontSize: '0.68rem', color: '#94a3b8', textTransform: 'none', fontWeight: 500 }}>Click for step • Hold to move</span>
                          </div>

                          <div className="joystick-pad">
                            {/* CARDINAL: UP */}
                            <button
                              type="button"
                              className={`joystick-btn joystick-up ${activePtzAction === 'tilt_up' ? 'active' : ''}`}
                              onMouseDown={() => handlePtzPointerDown('tilt_up')}
                              onMouseUp={() => handlePtzPointerUp('tilt_up')}
                              onTouchStart={() => handlePtzPointerDown('tilt_up')}
                              onTouchEnd={() => handlePtzPointerUp('tilt_up')}
                              title="Tilt Up"
                            >
                              <ChevronUp size={22} />
                            </button>

                            {/* CARDINAL: LEFT */}
                            <button
                              type="button"
                              className={`joystick-btn joystick-left ${activePtzAction === 'pan_left' ? 'active' : ''}`}
                              onMouseDown={() => handlePtzPointerDown('pan_left')}
                              onMouseUp={() => handlePtzPointerUp('pan_left')}
                              onTouchStart={() => handlePtzPointerDown('pan_left')}
                              onTouchEnd={() => handlePtzPointerUp('pan_left')}
                              title="Pan Left"
                            >
                              <ChevronLeft size={22} />
                            </button>

                            {/* CENTER EMERGENCY STOP */}
                            <button
                              type="button"
                              className="joystick-center-stop"
                              onClick={handlePtzStop}
                              title="Emergency Motor Halt"
                            >
                              STOP
                            </button>

                            {/* CARDINAL: RIGHT */}
                            <button
                              type="button"
                              className={`joystick-btn joystick-right ${activePtzAction === 'pan_right' ? 'active' : ''}`}
                              onMouseDown={() => handlePtzPointerDown('pan_right')}
                              onMouseUp={() => handlePtzPointerUp('pan_right')}
                              onTouchStart={() => handlePtzPointerDown('pan_right')}
                              onTouchEnd={() => handlePtzPointerUp('pan_right')}
                              title="Pan Right"
                            >
                              <ChevronRight size={22} />
                            </button>

                            {/* CARDINAL: DOWN */}
                            <button
                              type="button"
                              className={`joystick-btn joystick-down ${activePtzAction === 'tilt_down' ? 'active' : ''}`}
                              onMouseDown={() => handlePtzPointerDown('tilt_down')}
                              onMouseUp={() => handlePtzPointerUp('tilt_down')}
                              onTouchStart={() => handlePtzPointerDown('tilt_down')}
                              onTouchEnd={() => handlePtzPointerUp('tilt_down')}
                              title="Tilt Down"
                            >
                              <ChevronDown size={22} />
                            </button>

                            {/* DIAGONAL: UP-LEFT */}
                            <button
                              type="button"
                              className={`joystick-diagonal-btn joystick-up-left ${activePtzAction === 'pan_up_left' ? 'active' : ''}`}
                              onMouseDown={() => handlePtzPointerDown('pan_up_left')}
                              onMouseUp={() => handlePtzPointerUp('pan_up_left')}
                              onTouchStart={() => handlePtzPointerDown('pan_up_left')}
                              onTouchEnd={() => handlePtzPointerUp('pan_up_left')}
                              title="Pan Up-Left"
                            >
                              ↖
                            </button>

                            {/* DIAGONAL: UP-RIGHT */}
                            <button
                              type="button"
                              className={`joystick-diagonal-btn joystick-up-right ${activePtzAction === 'pan_up_right' ? 'active' : ''}`}
                              onMouseDown={() => handlePtzPointerDown('pan_up_right')}
                              onMouseUp={() => handlePtzPointerUp('pan_up_right')}
                              onTouchStart={() => handlePtzPointerDown('pan_up_right')}
                              onTouchEnd={() => handlePtzPointerUp('pan_up_right')}
                              title="Pan Up-Right"
                            >
                              ↗
                            </button>

                            {/* DIAGONAL: DOWN-LEFT */}
                            <button
                              type="button"
                              className={`joystick-diagonal-btn joystick-down-left ${activePtzAction === 'pan_down_left' ? 'active' : ''}`}
                              onMouseDown={() => handlePtzPointerDown('pan_down_left')}
                              onMouseUp={() => handlePtzPointerUp('pan_down_left')}
                              onTouchStart={() => handlePtzPointerDown('pan_down_left')}
                              onTouchEnd={() => handlePtzPointerUp('pan_down_left')}
                              title="Pan Down-Left"
                            >
                              ↙
                            </button>

                            {/* DIAGONAL: DOWN-RIGHT */}
                            <button
                              type="button"
                              className={`joystick-diagonal-btn joystick-down-right ${activePtzAction === 'pan_down_right' ? 'active' : ''}`}
                              onMouseDown={() => handlePtzPointerDown('pan_down_right')}
                              onMouseUp={() => handlePtzPointerUp('pan_down_right')}
                              onTouchStart={() => handlePtzPointerDown('pan_down_right')}
                              onTouchEnd={() => handlePtzPointerUp('pan_down_right')}
                              title="Pan Down-Right"
                            >
                              ↘
                            </button>
                          </div>
                        </div>

                        {/* Section: ULTRA-SLOW OPTICAL ZOOM */}
                        <div>
                          <div className="ptz-section-title">
                            <span>SLOW OPTICAL ZOOM</span>
                            <span style={{ fontSize: '0.68rem', color: '#059669', fontWeight: 600, textTransform: 'none' }}>
                              Micro-stepped
                            </span>
                          </div>

                          <div className="ptz-zoom-card">
                            <div className="ptz-zoom-buttons">
                              <button
                                type="button"
                                className={`ptz-zoom-btn ${activePtzAction === 'zoom_out' ? 'active' : ''}`}
                                onMouseDown={() => handlePtzPointerDown('zoom_out', true)}
                                onMouseUp={() => handlePtzPointerUp('zoom_out', true)}
                                onTouchStart={() => handlePtzPointerDown('zoom_out', true)}
                                onTouchEnd={() => handlePtzPointerUp('zoom_out', true)}
                                title="Slow Zoom Out (Wide)"
                              >
                                <ZoomOut size={16} color={activePtzAction === 'zoom_out' ? '#ffffff' : '#059669'} />
                                Zoom Out
                              </button>

                              <button
                                type="button"
                                className={`ptz-zoom-btn ${activePtzAction === 'zoom_in' ? 'active' : ''}`}
                                onMouseDown={() => handlePtzPointerDown('zoom_in', true)}
                                onMouseUp={() => handlePtzPointerUp('zoom_in', true)}
                                onTouchStart={() => handlePtzPointerDown('zoom_in', true)}
                                onTouchEnd={() => handlePtzPointerUp('zoom_in', true)}
                                title="Slow Zoom In (Telephoto)"
                              >
                                <ZoomIn size={16} color={activePtzAction === 'zoom_in' ? '#ffffff' : '#059669'} />
                                Zoom In
                              </button>
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                              Calibrated gentle optical zoom preserves focus sharpness
                            </div>
                          </div>
                        </div>

                        {/* Section: PRESET POSITIONS (P1 - P5) */}
                        <div>
                          <div className="ptz-section-title">
                            <span>PRESET POSITIONS</span>
                            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#059669' }}>P{activePreset} Active</span>
                          </div>

                          <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                            {[1, 2, 3, 4, 5].map((pNum) => (
                              <button
                                key={pNum}
                                type="button"
                                className={`preset-pill-btn ${activePreset === pNum ? 'active' : ''}`}
                                onClick={() => handleGotoPreset(pNum)}
                                title={`Move to Preset P${pNum}`}
                              >
                                P{pNum}
                              </button>
                            ))}
                          </div>

                          {/* Save Current Position as Preset */}
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            style={{ width: '100%', fontSize: '0.74rem', padding: '6px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                            onClick={handleSaveCurrentPreset}
                            disabled={isSavingPreset}
                          >
                            <Save size={13} color="#059669" />
                            {savePresetFeedback || (isSavingPreset ? 'Saving Preset...' : `Save Position as Preset P${activePreset}`)}
                          </button>
                        </div>
                      </aside>
                    )}
                  </div>

                  {/* Full-Width Camera Grid Pagination Bar Across Entire Bottom (underneath both camera grid and PTZ controller) */}
                  {filteredCameras.length > 0 && (
                    <div className="camera-grid-pagination">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span className="pagination-info-text">
                          Showing {filteredCameras.length === 0 ? 0 : startCameraIdx + 1}–{Math.min(startCameraIdx + camerasPerPage, filteredCameras.length)} of {filteredCameras.length} cameras
                        </span>
                        <select
                          className="pagination-select"
                          value={camerasPerPage}
                          onChange={(e) => {
                            setCamerasPerPage(Number(e.target.value));
                            setCurrentCameraPage(1);
                          }}
                        >
                          <option value={4}>4 / page</option>
                          <option value={8}>8 / page</option>
                          <option value={10}>10 / page</option>
                          <option value={16}>16 / page</option>
                        </select>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <button
                          type="button"
                          className="pagination-btn"
                          disabled={validCameraPage <= 1}
                          onClick={() => setCurrentCameraPage((p) => Math.max(1, p - 1))}
                        >
                          Prev
                        </button>

                        <div className="pagination-current-pill">
                          {validCameraPage} / {totalCameraPages}
                        </div>

                        <button
                          type="button"
                          className="pagination-btn"
                          disabled={validCameraPage >= totalCameraPages}
                          onClick={() => setCurrentCameraPage((p) => Math.min(totalCameraPages, p + 1))}
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* ADD NVR MODAL DIALOG */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>

            {/* Modal Header */}
            <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ background: '#ecfdf5', padding: '7px', borderRadius: '7px' }}>
                  <Cctv size={18} color="#059669" />
                </div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>
                  Add New NVR Device
                </h3>
              </div>
              <button
                type="button"
                onClick={handleCloseModal}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Deployment Method Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', background: '#f8fafc' }}>
              <button
                type="button"
                onClick={() => setNvrAddMode('edge_agent')}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  border: 'none',
                  background: nvrAddMode === 'edge_agent' ? '#ffffff' : 'transparent',
                  borderBottom: nvrAddMode === 'edge_agent' ? '2px solid #059669' : '2px solid transparent',
                  fontWeight: 600,
                  fontSize: '0.84rem',
                  color: nvrAddMode === 'edge_agent' ? '#059669' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                <Terminal size={15} />
                <span>Remote Connection</span>
              </button>
              <button
                type="button"
                onClick={() => setNvrAddMode('direct_ip')}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  border: 'none',
                  background: nvrAddMode === 'direct_ip' ? '#ffffff' : 'transparent',
                  borderBottom: nvrAddMode === 'direct_ip' ? '2px solid #059669' : '2px solid transparent',
                  fontWeight: 600,
                  fontSize: '0.84rem',
                  color: nvrAddMode === 'direct_ip' ? '#059669' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                <Radio size={15} />
                <span>Direct Local IP (Same Subnet)</span>
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '22px' }}>
              {nvrAddMode === 'edge_agent' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* Assign to Agent Selector */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '5px', color: 'var(--text-secondary)' }}>
                      Target Branch Agent <span style={{ color: '#059669' }}>*</span>
                      {!user?.is_superadmin && (
                        <span style={{ fontSize: '0.72rem', color: '#059669', marginLeft: '6px', fontWeight: 500 }}>
                          (Locked to your assigned agent)
                        </span>
                      )}
                    </label>
                    <select
                      className="form-input"
                      value={!user?.is_superadmin && user?.assigned_agent_id ? user.assigned_agent_id : selectedAgentId}
                      onChange={(e) => setSelectedAgentId(e.target.value)}
                      disabled={!user?.is_superadmin}
                    >
                      {agents.map((ag) => (
                        <option key={ag.id} value={ag.id}>
                          {ag.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {(() => {
                    const activeAgent = agents.find((a) => String(a.id) === String(!user?.is_superadmin && user?.assigned_agent_id ? user.assigned_agent_id : selectedAgentId)) || agents[0];
                    const activeAgentName = activeAgent?.name || 'Branch';
                    const activeAgentId = activeAgent?.id || 1;

                    return (
                      <>
                        {/* Download Launcher */}
                        <div>
                          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            <a
                              href={`${API_BASE_URL || ''}/api/agent/${activeAgentId}/launcher.bat`}
                              download={`launch-agent-${activeAgentName}.bat`}
                              className="btn btn-primary"
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '8px',
                                textDecoration: 'none',
                                padding: '11px 20px',
                                fontSize: '0.88rem',
                                fontWeight: 600,
                                background: '#059669',
                                color: '#ffffff',
                                borderRadius: '6px'
                              }}
                            >
                              <Download size={16} />
                              Download Launcher (Windows .bat)
                            </a>
                            <a
                              href={`${API_BASE_URL || ''}/api/agent/${activeAgentId}/launcher.sh`}
                              download={`launch-agent-${activeAgentName}.sh`}
                              className="btn btn-secondary"
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '8px',
                                textDecoration: 'none',
                                padding: '11px 20px',
                                fontSize: '0.88rem',
                                fontWeight: 600,
                                borderRadius: '6px'
                              }}
                            >
                              <Download size={16} />
                              Download Launcher (Linux .sh)
                            </a>
                          </div>
                        </div>

                        {/* Real-time Connection Radar */}
                        {agentDeployStatus?.has_nvr ? (
                          <div style={{ background: '#ecfdf5', border: '1px solid #10b981', borderRadius: '8px', padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <CheckCircle2 size={22} color="#059669" />
                              <div>
                                <div style={{ color: '#065f46', fontWeight: 700, fontSize: '0.90rem' }}>
                                  Edge Agent Connected!
                                </div>
                                <div style={{ color: '#047857', fontSize: '0.78rem' }}>
                                  {agentDeployStatus.name} • {agentDeployStatus.nvr_count} NVR ({agentDeployStatus.total_cameras} Cameras) Online
                                </div>
                              </div>
                            </div>
                            <button
                              type="button"
                              className="btn btn-primary"
                              onClick={handleCloseModal}
                              style={{ background: '#059669', padding: '7px 14px', fontSize: '0.82rem' }}
                            >
                              Done & View Live
                            </button>
                          </div>
                        ) : (
                          <div style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '8px', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span className="spinner" style={{ fontSize: '18px' }}>⏳</span>
                            <span style={{ fontWeight: 600, fontSize: '0.86rem', color: '#334155' }}>
                              Waiting...
                            </span>
                          </div>
                        )}
                      </>
                    );
                  })()}

                  {/* Actions */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
                    <button type="button" className="btn btn-secondary" onClick={handleCloseModal}>
                      Close
                    </button>
                  </div>
                </div>
              ) : (
                /* Direct Local IP Mode */
                !scanResult ? (
                  <form onSubmit={handleProbe} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.84rem' }}>
                      Enter the local NVR IP address and credentials. The central server will connect directly across the local network subnet.
                    </p>

                    {/* Assign to Agent Selector */}
                    <div>
                      <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '5px', color: 'var(--text-secondary)' }}>
                        Assign to Agent <span style={{ color: '#059669' }}>*</span>
                        {!user?.is_superadmin && (
                          <span style={{ fontSize: '0.72rem', color: '#059669', marginLeft: '6px', fontWeight: 500 }}>
                            (Locked to your assigned agent)
                          </span>
                        )}
                      </label>
                      <select
                        className="form-input"
                        value={!user?.is_superadmin && user?.assigned_agent_id ? user.assigned_agent_id : selectedAgentId}
                        onChange={(e) => {
                          const newAgId = e.target.value;
                          setSelectedAgentId(newAgId);
                          const ag = agents.find((a) => String(a.id) === String(newAgId));
                          const cleanVal = (v) => (v && v !== '—' && v !== '-' ? v : '');
                          setNvrProvince(cleanVal(ag?.province));
                          setNvrCity(cleanVal(ag?.city));
                          setNvrArea(cleanVal(ag?.area));
                          setNvrSite(cleanVal(ag?.site));
                        }}
                        disabled={isScanning || !user?.is_superadmin}
                        required
                      >
                        {agents.map((ag) => (
                          <option key={ag.id} value={ag.id}>
                            {ag.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '5px', color: 'var(--text-secondary)' }}>
                        NVR Device Name <span style={{ color: '#059669' }}>*</span>
                      </label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Enter NVR name"
                        value={nvrName}
                        onChange={(e) => setNvrName(e.target.value)}
                        disabled={isScanning}
                        required
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '5px', color: 'var(--text-secondary)' }}>
                        NVR IP Address / Host <span style={{ color: '#059669' }}>*</span>
                      </label>
                      <input
                        type="text"
                        className="form-input font-mono"
                        placeholder="Enter IP address"
                        value={ip}
                        onChange={(e) => setIp(e.target.value)}
                        disabled={isScanning}
                        required
                      />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '5px', color: 'var(--text-secondary)' }}>
                          Username <span style={{ color: '#059669' }}>*</span>
                        </label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="Enter username"
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          disabled={isScanning}
                          required
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '5px', color: 'var(--text-secondary)' }}>
                          Password
                        </label>
                        <div style={{ position: 'relative' }}>
                          <input
                            type={showPassword ? 'text' : 'password'}
                            className="form-input"
                            placeholder="Enter password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            disabled={isScanning}
                            style={{ paddingRight: '34px' }}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                          >
                            {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Advanced Custom Ports */}
                    <div>
                      <button
                        type="button"
                        onClick={() => setShowAdvanced(!showAdvanced)}
                        style={{ background: 'none', border: 'none', color: '#059669', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}
                      >
                        <Sliders size={13} />
                        {showAdvanced ? 'Hide Custom Ports' : 'Advanced: Specify Custom Ports'}
                      </button>

                      {showAdvanced && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '8px', padding: '12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                          <div>
                            <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '3px' }}>HTTP Port (Auto 80)</label>
                            <input type="number" className="form-input font-mono" placeholder="80" value={customPort} onChange={(e) => setCustomPort(e.target.value)} />
                          </div>
                          <div>
                            <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '3px' }}>RTSP Port (Auto 554)</label>
                            <input type="number" className="form-input font-mono" placeholder="554" value={customRtspPort} onChange={(e) => setCustomRtspPort(e.target.value)} />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Error Notification */}
                    {scanError && (
                      <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                        <AlertTriangle size={16} color="#dc2626" style={{ flexShrink: 0, marginTop: '2px' }} />
                        <div>
                          <h5 style={{ color: '#b91c1c', fontSize: '0.82rem', fontWeight: 600 }}>Connection Failed</h5>
                          <p style={{ color: '#dc2626', fontSize: '0.78rem', marginTop: '2px' }}>{scanError}</p>
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                      <button type="button" className="btn btn-secondary" onClick={handleCloseModal} disabled={isScanning}>
                        Cancel
                      </button>
                      <button type="submit" className="btn btn-primary" disabled={isScanning}>
                        {isScanning ? (
                          <>
                            <span className="spinner">⏳</span>
                            Connecting & Probing...
                          </>
                        ) : (
                          <>
                            <Plus size={15} />
                            Connect & Discover
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                ) : (
                  /* Step 2: Show Discovered Cameras & Confirm Save */
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <span style={{ color: '#059669', fontWeight: 600, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <CheckCircle2 size={13} />
                          NVR Connected Successfully
                        </span>
                        <h4 style={{ fontSize: '1.05rem', fontWeight: 700, marginTop: '2px', color: '#0f172a' }}>
                          {scanResult.total_channels} Cameras Discovered
                        </h4>
                      </div>
                      <div style={{ textAlign: 'right', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                        <div>RTSP: <strong className="font-mono">{scanResult.rtsp_port}</strong></div>
                        <div style={{ marginTop: '2px' }}>
                          Agent: <strong style={{ color: '#059669' }}>{agents.find(a => String(a.id) === String(selectedAgentId))?.name || 'Assigned'}</strong>
                        </div>
                      </div>
                    </div>

                    <div>
                      <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                        NVR Display Name
                      </label>
                      <input
                        type="text"
                        className="form-input"
                        value={nvrName}
                        onChange={(e) => setNvrName(e.target.value)}
                      />
                    </div>

                    {/* Discovered Cameras in clean rows */}
                    <div className="camera-sub-list" style={{ maxHeight: '240px', overflowY: 'auto' }}>
                      {scanResult.cameras.map((cam) => (
                        <div key={cam.channel_number} className="camera-sub-item">
                          <span style={{ fontWeight: 700, color: '#059669', fontSize: '0.78rem', minWidth: '50px' }}>
                            CH {cam.channel_number}
                          </span>
                          <span style={{ fontWeight: 600, color: '#0f172a', minWidth: '90px' }}>
                            {cam.name}
                          </span>
                          <span className="font-mono" style={{ color: '#047857', fontSize: '0.72rem', flex: 1, margin: '0 10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {cam.rtsp_stream_url}
                          </span>
                          <span style={{ color: '#059669', fontWeight: 600, fontSize: '0.72rem' }}>
                            ● Reachable
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Confirm & Save Button */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                      <button type="button" className="btn btn-secondary" onClick={() => setScanResult(null)} disabled={isSaving}>
                        Back
                      </button>
                      <button type="button" className="btn btn-success" onClick={handleConfirmSave} disabled={isSaving}>
                        {isSaving ? 'Saving...' : 'Confirm & Save to Database'}
                      </button>
                    </div>
                  </div>
                )
              )}
            </div>

          </div>
        </div>
      )}

      {/* ADD AGENT MODAL DIALOG */}
      {isAgentModalOpen && (
        <div className="modal-overlay" onClick={() => setIsAgentModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '440px' }}>

            {/* Modal Header */}
            <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ background: '#ecfdf5', padding: '7px', borderRadius: '7px' }}>
                  <Bot size={18} color="#059669" />
                </div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>
                  Add New Agent
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAgentModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleCreateAgent} style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.84rem' }}>
                Enter the name for this monitoring agent. NVR devices and live cameras will be organized and managed under it.
              </p>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '6px', color: 'var(--text-secondary)' }}>
                  Agent Name <span style={{ color: '#059669' }}>*</span>
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Enter agent name"
                  value={newAgentName}
                  onChange={(e) => setNewAgentName(e.target.value)}
                  disabled={isCreatingAgent}
                  autoFocus
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsAgentModalOpen(false)}
                  disabled={isCreatingAgent}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isCreatingAgent || !newAgentName.trim()}>
                  {isCreatingAgent ? 'Creating...' : '+ Create Agent'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT AGENT MODAL DIALOG */}
      {isEditAgentModalOpen && editingAgent && (
        <div className="modal-overlay" onClick={() => setIsEditAgentModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ background: '#ecfdf5', padding: '7px', borderRadius: '7px' }}>
                  <Bot size={18} color="#059669" />
                </div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>
                  Edit Agent #{editingAgent.id}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsEditAgentModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveEditAgent} style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {editAgentError && (
                <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', color: '#b91c1c', fontSize: '0.82rem' }}>
                  {editAgentError}
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '5px', color: 'var(--text-secondary)' }}>
                  Agent Name <span style={{ color: '#059669' }}>*</span>
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Enter agent name"
                  value={editAgentName}
                  onChange={(e) => setEditAgentName(e.target.value)}
                  disabled={isSavingAgent}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '5px', color: 'var(--text-secondary)' }}>
                  Status <span style={{ color: '#059669' }}>*</span>
                </label>
                <select
                  className="form-input"
                  value={editAgentStatus}
                  onChange={(e) => setEditAgentStatus(e.target.value)}
                  disabled={isSavingAgent}
                >
                  <option value="active">Active</option>
                  <option value="offline">Offline</option>
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '5px', color: 'var(--text-secondary)' }}>
                    Province
                  </label>
                  <select
                    className="form-input"
                    value={editAgentProvince}
                    onChange={(e) => {
                      setEditAgentProvince(e.target.value);
                      setEditAgentCity('');
                      setEditAgentArea('');
                      setEditAgentSite('');
                    }}
                    disabled={isSavingAgent}
                  >
                    <option value="">Select Province</option>
                    {(locationsSummary.provinces || []).map((p) => (
                      <option key={p.id || p.name} value={p.name}>{p.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '5px', color: 'var(--text-secondary)' }}>
                    City
                  </label>
                  <select
                    className="form-input"
                    value={editAgentCity}
                    onChange={(e) => {
                      setEditAgentCity(e.target.value);
                      setEditAgentArea('');
                      setEditAgentSite('');
                    }}
                    disabled={isSavingAgent || !editAgentProvince}
                  >
                    <option value="">Select City</option>
                    {(locationsSummary.cities || [])
                      .filter((c) => !editAgentProvince || c.province_name === editAgentProvince)
                      .map((c) => (
                        <option key={c.id || c.name} value={c.name}>{c.name}</option>
                      ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '5px', color: 'var(--text-secondary)' }}>
                    Area
                  </label>
                  <select
                    className="form-input"
                    value={editAgentArea}
                    onChange={(e) => {
                      setEditAgentArea(e.target.value);
                      setEditAgentSite('');
                    }}
                    disabled={isSavingAgent || !editAgentCity}
                  >
                    <option value="">Select Area</option>
                    {(locationsSummary.areas || [])
                      .filter((a) => !editAgentCity || a.city_name === editAgentCity)
                      .map((a) => (
                        <option key={a.id || a.name} value={a.name}>{a.name}</option>
                      ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '5px', color: 'var(--text-secondary)' }}>
                    Site
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Enter site name"
                    value={editAgentSite}
                    onChange={(e) => setEditAgentSite(e.target.value)}
                    disabled={isSavingAgent}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsEditAgentModalOpen(false)}
                  disabled={isSavingAgent}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSavingAgent || !editAgentName.trim()}>
                  {isSavingAgent ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT NVR MODAL DIALOG */}
      {isEditNvrModalOpen && editingNvr && (
        <div className="modal-overlay" onClick={() => setIsEditNvrModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px' }}>
            <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ background: '#ecfdf5', padding: '7px', borderRadius: '7px' }}>
                  <Cctv size={18} color="#059669" />
                </div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>
                  Edit NVR #{editingNvr.id}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsEditNvrModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveEditNvr} style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {editNvrError && (
                <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', color: '#b91c1c', fontSize: '0.82rem' }}>
                  {editNvrError}
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '5px', color: 'var(--text-secondary)' }}>
                  NVR Device Name <span style={{ color: '#059669' }}>*</span>
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Enter NVR name"
                  value={editNvrName}
                  onChange={(e) => setEditNvrName(e.target.value)}
                  disabled={isSavingNvr}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '5px', color: 'var(--text-secondary)' }}>
                  IP Address <span style={{ color: '#059669' }}>*</span>
                </label>
                <input
                  type="text"
                  className="form-input font-mono"
                  placeholder="Enter IP address"
                  value={editNvrIp}
                  onChange={(e) => setEditNvrIp(e.target.value)}
                  disabled={isSavingNvr}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '5px', color: 'var(--text-secondary)' }}>
                    HTTP Port
                  </label>
                  <input
                    type="number"
                    className="form-input font-mono"
                    value={editNvrPort}
                    onChange={(e) => setEditNvrPort(e.target.value)}
                    disabled={isSavingNvr}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '5px', color: 'var(--text-secondary)' }}>
                    RTSP Port
                  </label>
                  <input
                    type="number"
                    className="form-input font-mono"
                    value={editNvrRtspPort}
                    onChange={(e) => setEditNvrRtspPort(e.target.value)}
                    disabled={isSavingNvr}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '5px', color: 'var(--text-secondary)' }}>
                    Username
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    value={editNvrUsername}
                    onChange={(e) => setEditNvrUsername(e.target.value)}
                    disabled={isSavingNvr}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '5px', color: 'var(--text-secondary)' }}>
                    Password
                  </label>
                  <input
                    type="password"
                    className="form-input"
                    placeholder="Leave blank to keep current"
                    value={editNvrPassword}
                    onChange={(e) => setEditNvrPassword(e.target.value)}
                    disabled={isSavingNvr}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '5px', color: 'var(--text-secondary)' }}>
                    Province
                  </label>
                  <select
                    className="form-input"
                    value={editNvrProvince}
                    onChange={(e) => {
                      setEditNvrProvince(e.target.value);
                      setEditNvrCity('');
                      setEditNvrArea('');
                      setEditNvrSite('');
                    }}
                    disabled={isSavingNvr}
                  >
                    <option value="">Select Province</option>
                    {(locationsSummary.provinces || []).map((p) => (
                      <option key={p.id || p.name} value={p.name}>{p.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '5px', color: 'var(--text-secondary)' }}>
                    City
                  </label>
                  <select
                    className="form-input"
                    value={editNvrCity}
                    onChange={(e) => {
                      setEditNvrCity(e.target.value);
                      setEditNvrArea('');
                      setEditNvrSite('');
                    }}
                    disabled={isSavingNvr || !editNvrProvince}
                  >
                    <option value="">Select City</option>
                    {(locationsSummary.cities || [])
                      .filter((c) => !editNvrProvince || c.province_name === editNvrProvince)
                      .map((c) => (
                        <option key={c.id || c.name} value={c.name}>{c.name}</option>
                      ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '5px', color: 'var(--text-secondary)' }}>
                    Area
                  </label>
                  <select
                    className="form-input"
                    value={editNvrArea}
                    onChange={(e) => {
                      setEditNvrArea(e.target.value);
                      setEditNvrSite('');
                    }}
                    disabled={isSavingNvr || !editNvrCity}
                  >
                    <option value="">Select Area</option>
                    {(locationsSummary.areas || [])
                      .filter((a) => !editNvrCity || a.city_name === editNvrCity)
                      .map((a) => (
                        <option key={a.id || a.name} value={a.name}>{a.name}</option>
                      ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '5px', color: 'var(--text-secondary)' }}>
                    Site
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Enter site name"
                    value={editNvrSite}
                    onChange={(e) => setEditNvrSite(e.target.value)}
                    disabled={isSavingNvr}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsEditNvrModalOpen(false)}
                  disabled={isSavingNvr}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSavingNvr || !editNvrName.trim() || !editNvrIp.trim()}>
                  {isSavingNvr ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MANDATORY OR VOLUNTARY CHANGE PASSWORD MODAL */}
      <ChangePasswordModal
        isOpen={isChangePasswordModalOpen || Boolean(user?.must_change_password)}
        isForced={Boolean(user?.must_change_password)}
        onClose={() => setIsChangePasswordModalOpen(false)}
        onSuccess={() => setIsChangePasswordModalOpen(false)}
      />

    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}

