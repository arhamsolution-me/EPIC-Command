import React, { useState, useEffect } from 'react';
import {
  Shield,
  Plus,
  Search,
  Filter,
  Calendar,
  MoreVertical,
  ArrowLeft,
  Check,
  Save,
  CheckCircle2,
  AlertCircle,
  Users,
  Clock,
  Trash2,
  Edit2,
  LayoutGrid,
  Video,
  Server,
  Cpu,
  MapPin,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';

export default function RoleManagementView() {
  const { hasPermission } = useAuth();

  // Roles List State
  const [roles, setRoles] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState('newest'); // 'newest' | 'oldest'

  // Pagination State matching Image 1
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  // Active View: 'list' (Table) or 'permissions' (Click-to-Permissions)
  const [activeView, setActiveView] = useState('list');
  const [selectedRole, setSelectedRole] = useState(null);

  // Permissions Matrix State
  const [permissionMatrix, setPermissionMatrix] = useState([]);
  const [selectedPermKeys, setSelectedPermKeys] = useState(new Set());
  const [isSavingPerms, setIsSavingPerms] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState(null);

  // Edit Role Modal State
  const [isEditRoleModalOpen, setIsEditRoleModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState(null);
  const [editRoleForm, setEditRoleForm] = useState({ name: '', description: '', is_active: true });
  const [isSavingRole, setIsSavingRole] = useState(false);
  const [editRoleError, setEditRoleError] = useState(null);

  const handleUpdateRoleSubmit = async (e) => {
    e.preventDefault();
    if (!editingRole || !editRoleForm.name.trim()) return;
    setIsSavingRole(true);
    setEditRoleError(null);
    try {
      const res = await api.put(`/api/roles/${editingRole.id}`, {
        name: editRoleForm.name.trim(),
        description: editRoleForm.description.trim(),
        is_active: editRoleForm.is_active
      });
      if (res.ok) {
        setIsEditRoleModalOpen(false);
        setEditingRole(null);
        fetchRoles();
      } else {
        const data = await res.json().catch(() => ({}));
        setEditRoleError(data.detail || 'Failed to update role');
      }
    } catch (err) {
      setEditRoleError(err.message || 'Network error updating role');
    } finally {
      setIsSavingRole(false);
    }
  };

  const handleDeleteRole = async (role, e) => {
    if (e) e.stopPropagation();
    setOpenActionId(null);
    if (role.name === 'Super Admin') {
      alert('Super Admin role cannot be deleted.');
      return;
    }
    const msg = role.total_users > 0
      ? `Are you sure you want to delete role '${role.name}'? ${role.total_users} user(s) assigned to this role will become unassigned.`
      : `Are you sure you want to delete role '${role.name}'?`;
    if (!window.confirm(msg)) return;

    try {
      const res = await api.delete(`/api/roles/${role.id}`);
      if (res.ok) {
        fetchRoles();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.detail || 'Failed to delete role');
      }
    } catch (err) {
      alert(err.message || 'Error deleting role');
    }
  };

  // Accordion open/close state matching Image 5
  const [openModules, setOpenModules] = useState(
    () => new Set(['Dashboard', 'Live Monitor', 'NVR Management', 'Agent Management', 'User Management', 'Location Management'])
  );

  const toggleModuleAccordion = (modName) => {
    setOpenModules((prev) => {
      const next = new Set(prev);
      if (next.has(modName)) next.delete(modName);
      else next.add(modName);
      return next;
    });
  };

  const getPermissionDescription = (key) => {
    switch (key) {
      case 'DASHBOARD_VIEW':
        return 'Access analytics KPIs and summary widgets.';
      case 'LIVE_MONITOR_VIEW':
        return 'Access live multi-grid camera surveillance feeds.';
      case 'CAM_PTZ_CONTROL':
        return 'Pan, tilt, zoom and camera movement controls.';
      case 'CAM_SNAPSHOT':
        return 'Capture instantaneous high-res camera snapshots.';
      case 'CAM_RECORD':
        return 'Trigger manual on-demand camera recording sessions.';
      case 'NVR_VIEW':
        return 'View registered NVR devices and channel status.';
      case 'NVR_CREATE':
        return 'Register new NVR hardware devices to agents.';
      case 'NVR_UPDATE':
        return 'Modify NVR network parameters and ports.';
      case 'NVR_DELETE':
        return 'Remove NVR hardware devices from system.';
      case 'AGENT_VIEW':
        return 'View registered edge inference agent nodes.';
      case 'AGENT_CREATE':
        return 'Enroll new edge agent inference machines.';
      case 'AGENT_UPDATE':
        return 'Configure edge agent parameters and location scopes.';
      case 'AGENT_DELETE':
        return 'Remove edge agent nodes from the management plane.';
      case 'USER_VIEW':
        return 'Browse user directory and account access scopes.';
      case 'USER_CREATE':
        return 'Create new user accounts with role assignments.';
      case 'USER_UPDATE':
        return 'Modify user details, role assignments, and active status.';
      case 'USER_DELETE':
        return 'Delete user accounts from the directory.';
      case 'LOCATION_VIEW':
        return 'Browse hierarchical provinces, cities, areas, and sites.';
      case 'LOCATION_CREATE':
        return 'Register new provinces, cities, areas, and sites.';
      case 'LOCATION_DELETE':
        return 'Delete geographic nodes and descendant facilities.';
      default:
        return 'Configure granular permission scope for this action.';
    }
  };

  // Add Role Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleDescription, setNewRoleDescription] = useState('');
  const [isCreatingRole, setIsCreatingRole] = useState(false);
  const [createError, setCreateError] = useState(null);

  // Actions dropdown
  const [openActionId, setOpenActionId] = useState(null);

  // Close actions dropdown on outside click
  useEffect(() => {
    const handleGlobalClick = (e) => {
      if (!e.target.closest('.action-dropdown-wrapper') && !e.target.closest('.image-dots-btn')) {
        setOpenActionId(null);
      }
    };
    document.addEventListener('click', handleGlobalClick);
    return () => document.removeEventListener('click', handleGlobalClick);
  }, []);

  const fetchRoles = async () => {
    setIsLoading(true);
    try {
      const res = await api.get('/api/roles/list');
      if (res.ok) {
        const data = await res.json();
        // Strictly filter out Super Admin so it is never displayed in role-based access
        setRoles((data.roles || []).filter((r) => r.name !== 'Super Admin'));
      }
    } catch (err) {
      console.error('Failed to load roles:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPermissionsMatrix = async () => {
    try {
      const res = await api.get('/api/roles/permissions/matrix');
      if (res.ok) {
        const data = await res.json();
        const filteredModules = (data.modules || []).filter(
          (m) => m.module !== 'Role & Permission Management' && m.module !== 'Audit Logs'
        );
        setPermissionMatrix(filteredModules);
      }
    } catch (err) {
      console.error('Failed to load permission matrix:', err);
    }
  };

  useEffect(() => {
    fetchRoles();
    fetchPermissionsMatrix();
  }, []);

  // Format timestamp like "Sep 17, 2026, 04:23 PM"
  const formatDateTime = (isoStr) => {
    if (!isoStr) return 'Sep 17, 2026, 04:23 PM';
    try {
      const d = new Date(isoStr);
      return d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    } catch (e) {
      return isoStr;
    }
  };

  // Filter and sort roles
  const filteredRoles = roles
    .filter((role) => role.name !== 'Super Admin')
    .filter((role) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchTitle = role.name.toLowerCase().includes(q);
        const matchDesc = (role.description || '').toLowerCase().includes(q);
        if (!matchTitle && !matchDesc) return false;
      }
      if (statusFilter === 'active') return role.is_active;
      if (statusFilter === 'inactive') return !role.is_active;
      return true;
    })
    .sort((a, b) => {
      const dateA = new Date(a.updated_at || a.created_at || 0).getTime();
      const dateB = new Date(b.updated_at || b.created_at || 0).getTime();
      return sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
    });

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredRoles.length / pageSize));
  const validPage = Math.min(Math.max(1, currentPage), totalPages);
  const paginatedRoles = filteredRoles.slice((validPage - 1) * pageSize, validPage * pageSize);

  // Row click handler -> opens permissions view for that role
  const handleRoleRowClick = (role) => {
    setSelectedRole(role);
    setSelectedPermKeys(new Set(role.permission_keys || []));
    setSaveFeedback(null);
    setActiveView('permissions');
  };

  const handleBackToRoles = () => {
    setActiveView('list');
    setSelectedRole(null);
    fetchRoles();
  };

  // Module Icon Helper
  const getModuleIcon = (moduleName) => {
    switch (moduleName) {
      case 'Dashboard':
        return <LayoutGrid size={17} color="#059669" />;
      case 'Live Monitor':
        return <Video size={17} color="#059669" />;
      case 'NVR Management':
        return <Server size={17} color="#059669" />;
      case 'Agent Management':
        return <Cpu size={17} color="#059669" />;
      case 'User Management':
        return <Users size={17} color="#059669" />;
      case 'Location Management':
        return <MapPin size={17} color="#059669" />;
      default:
        return <Shield size={17} color="#059669" />;
    }
  };

  // Module Description Helper
  const getModuleDescription = (moduleName) => {
    switch (moduleName) {
      case 'Dashboard':
        return 'Overview analytics, total cameras, and system stats';
      case 'Live Monitor':
        return 'Multi-camera video streaming grid & PTZ controls';
      case 'NVR Management':
        return 'NVR registration, status monitoring & configuration';
      case 'Agent Management':
        return 'Edge AI inference agents & system connectivity';
      case 'User Management':
        return 'User accounts, role assignment & account status';
      case 'Location Management':
        return 'Provinces, cities, areas & deployment sites';
      default:
        return '';
    }
  };

  // 1. Main Module Toggle: controls the primary View permission (e.g. LIVE_MONITOR_VIEW, NVR_VIEW, etc.)
  // When turned OFF: immediately turns OFF the main view AND ALL sub-permissions in this module!
  const handleToggleModuleMain = (mod) => {
    if (selectedRole?.name === 'Super Admin') return;
    const mainPerm = mod.permissions.find((p) => !p.parent_key) || mod.permissions[0];
    if (!mainPerm) return;

    const allModuleKeys = mod.permissions.map((p) => p.key);
    const isMainActive = selectedPermKeys.has(mainPerm.key);

    setSelectedPermKeys((prev) => {
      const next = new Set(prev);
      if (isMainActive) {
        // TURN OFF MAIN: immediately remove the main view AND ALL sub-permissions in this module!
        allModuleKeys.forEach((k) => next.delete(k));
      } else {
        // TURN ON MAIN: enable the main view permission + all sub-permissions by default for convenience
        allModuleKeys.forEach((k) => next.add(k));
      }
      return next;
    });
  };

  // 2. Toggle child permission (e.g. PTZ, Snapshot, Record, Create, Update, Delete)
  const handleToggleChildPerm = (childPerm, mainPermKey) => {
    if (selectedRole?.name === 'Super Admin') return;
    // Child can ONLY be toggled if main parent view is active!
    if (mainPermKey && !selectedPermKeys.has(mainPermKey)) {
      return;
    }

    setSelectedPermKeys((prev) => {
      const next = new Set(prev);
      if (next.has(childPerm.key)) {
        next.delete(childPerm.key);
      } else {
        next.add(childPerm.key);
      }
      return next;
    });
  };

  // 3. Select all child permissions for a module
  const handleSelectAllModule = (mod) => {
    if (selectedRole?.name === 'Super Admin') return;
    setSelectedPermKeys((prev) => {
      const next = new Set(prev);
      mod.permissions.forEach((p) => next.add(p.key));
      return next;
    });
  };

  // 4. Clear only child permissions for a module (keeping main view active)
  const handleClearChildrenModule = (mod) => {
    if (selectedRole?.name === 'Super Admin') return;
    const mainPerm = mod.permissions.find((p) => !p.parent_key) || mod.permissions[0];
    setSelectedPermKeys((prev) => {
      const next = new Set(prev);
      mod.permissions.forEach((p) => {
        if (p.key !== mainPerm.key) {
          next.delete(p.key);
        }
      });
      return next;
    });
  };

  // Save permissions live
  const handleSavePermissions = async () => {
    if (!selectedRole) return;
    setIsSavingPerms(true);
    setSaveFeedback(null);

    try {
      const res = await api.put(`/api/roles/${selectedRole.id}/permissions`, {
        permission_keys: Array.from(selectedPermKeys)
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to update permissions');
      }

      // Broadcast real-time permission sync across tabs
      try {
        if (typeof BroadcastChannel !== 'undefined') {
          const bc = new BroadcastChannel('epic_auth_sync');
          bc.postMessage({ type: 'PERMISSIONS_UPDATED', role_id: selectedRole.id });
          bc.close();
        }
      } catch (e) {
        // BroadcastChannel fallback silently handled
      }
      localStorage.setItem('epic_permissions_updated_at', Date.now().toString());
      window.dispatchEvent(new CustomEvent('epic_auth_refresh'));

      setSaveFeedback({ type: 'success', message: 'Permissions updated live and synced!' });
      setTimeout(() => setSaveFeedback(null), 3000);
    } catch (err) {
      setSaveFeedback({ type: 'error', message: err.message });
    } finally {
      setIsSavingPerms(false);
    }
  };

  // Create new role
  const handleCreateRole = async (e) => {
    e.preventDefault();
    if (!newRoleName.trim()) return;

    setIsCreatingRole(true);
    setCreateError(null);

    try {
      const res = await api.post('/api/roles/create', {
        name: newRoleName.trim(),
        description: newRoleDescription.trim(),
        permission_keys: []
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to create role');
      }

      await fetchRoles();
      setIsAddModalOpen(false);
      setNewRoleName('');
      setNewRoleDescription('');

      // Auto open permissions for newly created role
      if (data.role) {
        handleRoleRowClick(data.role);
      }
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setIsCreatingRole(false);
    }
  };

  // Close 3-dots when clicking away
  useEffect(() => {
    const handleOutside = (e) => {
      if (!e.target.closest('.action-dots-cell')) {
        setOpenActionId(null);
      }
    };
    document.addEventListener('click', handleOutside);
    return () => document.removeEventListener('click', handleOutside);
  }, []);

  return (
    <div className="role-management-page">
      {/* =========================================================================
          VIEW 1: ROLES TABLE (EXACT MATCH TO USER'S IMAGE 1)
         ========================================================================= */}
      {activeView === 'list' && (
        <div className="roles-list-container">
          {/* Top Search & Filter Toolbar matching Image 1 */}
          <div className="image-toolbar-row">
            <div className="image-toolbar-left">
              {/* Search Box */}
              <div className="image-search-input-wrapper">
                <Search size={16} className="image-search-icon" />
                <input
                  type="text"
                  className="image-search-input"
                  placeholder="Search By Role Title"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                />
              </div>

              {/* Status Filter Dropdown */}
              <select
                className="image-select-filter"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setCurrentPage(1);
                }}
              >
                <option value="all">Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>

              {/* Last Updated Sort Dropdown */}
              <div className="image-sort-wrapper">
                <Calendar size={14} className="image-sort-icon" />
                <select
                  className="image-select-filter with-icon"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value)}
                >
                  <option value="newest">Last Updated</option>
                  <option value="oldest">Oldest First</option>
                </select>
              </div>
            </div>

            {/* + Add Role Button matching Image 1 */}
            <div className="image-toolbar-right">
              {hasPermission('ROLE_CREATE') && (
                <button
                  type="button"
                  className="image-add-btn"
                  onClick={() => setIsAddModalOpen(true)}
                >
                  <Plus size={16} strokeWidth={2.4} />
                  <span>Add Role</span>
                </button>
              )}
            </div>
          </div>

          {/* Roles Data Table matching Image 1 */}
          <div className="image-card-table-wrapper">
            <table className="image-data-table">
              <thead>
                <tr>
                  <th style={{ width: '25%' }}>TITLE</th>
                  <th style={{ width: '15%' }}>ASSIGNED</th>
                  <th style={{ width: '15%' }}>STATUS</th>
                  <th style={{ width: '35%' }}>UPDATED AT</th>
                  <th style={{ width: '10%', textAlign: 'right' }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'center', padding: '50px 20px', color: '#94a3b8' }}>
                      <div className="spinner" style={{ width: '24px', height: '24px', margin: '0 auto 8px', border: '2px solid #e2e8f0', borderTopColor: '#059669', borderRadius: '50%' }}></div>
                      <span>Loading roles...</span>
                    </td>
                  </tr>
                ) : paginatedRoles.length === 0 ? (
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'center', padding: '32px 16px', color: '#64748b', fontSize: '0.86rem', fontWeight: 500 }}>
                      No data found
                    </td>
                  </tr>
                ) : (
                  paginatedRoles.map((role, idx) => {
                    const assignedCount = role.total_users || 0;
                    const isSuper = role.name === 'Super Admin';
                    const isBottomRow = idx >= paginatedRoles.length - 2 && paginatedRoles.length > 2;

                    return (
                      <tr
                        key={role.id}
                        className="image-table-row-clickable"
                        onClick={() => handleRoleRowClick(role)}
                        title="Click to view & configure permissions"
                      >
                        {/* Title */}
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <strong className="image-role-title">{role.name}</strong>
                            {isSuper && (
                              <span style={{ fontSize: '0.68rem', background: '#fef3c7', color: '#b45309', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                                ROOT
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Assigned */}
                        <td>
                          <strong className="image-assigned-count">
                            {assignedCount}
                          </strong>
                        </td>

                        {/* Status Pill */}
                        <td>
                          <span className={`image-status-pill ${role.is_active ? 'active' : 'inactive'}`}>
                            {role.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>

                        {/* Updated At */}
                        <td>
                          <span className="image-date-text">
                            {formatDateTime(role.updated_at || role.created_at)}
                          </span>
                        </td>

                        {/* Actions (3-dots) */}
                        <td style={{ textAlign: 'center', width: '48px', position: 'relative' }} onClick={(e) => e.stopPropagation()}>
                          <div className="action-dropdown-wrapper">
                            <button
                              type="button"
                              className="action-dots-btn"
                              onClick={() => setOpenActionId(openActionId === role.id ? null : role.id)}
                              title="Actions"
                            >
                              <MoreVertical size={16} />
                            </button>

                            {openActionId === role.id && (
                              <div className={`action-menu-dropdown right-aligned ${isBottomRow ? 'open-up' : 'open-down'}`}>
                                <button
                                  type="button"
                                  className="action-menu-item"
                                  onClick={() => {
                                    setOpenActionId(null);
                                    setEditingRole(role);
                                    setEditRoleForm({
                                      name: role.name,
                                      description: role.description || '',
                                      is_active: Boolean(role.is_active)
                                    });
                                    setEditRoleError(null);
                                    setIsEditRoleModalOpen(true);
                                  }}
                                >
                                  <Edit2 size={13} color="#2563eb" />
                                  Edit Role
                                </button>

                                <button
                                  type="button"
                                  className="action-menu-item"
                                  onClick={() => {
                                    setOpenActionId(null);
                                    handleRoleRowClick(role);
                                  }}
                                >
                                  <Shield size={13} color="#059669" />
                                  Edit Permissions
                                </button>

                                {!isSuper && (
                                  <button
                                    type="button"
                                    className="action-menu-item"
                                    style={{ color: '#ef4444' }}
                                    onClick={(e) => handleDeleteRole(role, e)}
                                  >
                                    <Trash2 size={13} color="#ef4444" />
                                    Delete Role
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>

            {/* Bottom Pagination Bar matching Image 1 */}
            <div className="image-pagination-bar">
              <div className="image-pagination-left">
                <select
                  className="image-page-size-select"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                >
                  <option value={10}>10 / page</option>
                  <option value={20}>20 / page</option>
                  <option value={50}>50 / page</option>
                </select>
              </div>

              <div className="image-pagination-right">
                <button
                  type="button"
                  className="image-page-nav-btn"
                  disabled={validPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                >
                  Prev
                </button>

                <div className="image-page-current-pill">
                  {validPage} / {totalPages}
                </div>

                <button
                  type="button"
                  className="image-page-nav-btn"
                  disabled={validPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          VIEW 2: PERMISSION MATRIX VIEW (TRIGGERED ON ROW CLICK)
         ========================================================================= */}
      {activeView === 'permissions' && selectedRole && (
        <div className="role-permissions-view">
          {/* Header navigation with Back button */}
          <div className="permissions-view-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleBackToRoles}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, padding: '7px 13px' }}
              >
                <ArrowLeft size={16} />
                <span>Back to Roles</span>
              </button>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                    Permissions: <span style={{ color: '#059669' }}>{selectedRole.name}</span>
                  </h2>
                  <span className={`image-status-pill ${selectedRole.is_active ? 'active' : 'inactive'}`}>
                    {selectedRole.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {saveFeedback && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  color: saveFeedback.type === 'success' ? '#059669' : '#ef4444'
                }}>
                  {saveFeedback.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                  <span>{saveFeedback.message}</span>
                </div>
              )}

              {hasPermission('ROLE_ASSIGN') && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleSavePermissions}
                  disabled={isSavingPerms || selectedRole.name === 'Super Admin'}
                  style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '8px 18px', fontWeight: 700 }}
                >
                  <Save size={16} />
                  <span>{isSavingPerms ? 'Saving...' : 'Save Live Permissions'}</span>
                </button>
              )}
            </div>
          </div>

          {selectedRole.name === 'Super Admin' && (
            <div style={{
              background: '#fef3c7',
              border: '1px solid #fde68a',
              borderRadius: '8px',
              padding: '12px 16px',
              marginBottom: '16px',
              color: '#92400e',
              fontSize: '0.85rem',
              fontWeight: 600
            }}>
              Root Super Admin role has complete, irrevocable wildcard (*) access across all modules by system design.
            </div>
          )}

          {/* Modules Accordion List matching Image 5 */}
          <div className="image5-permissions-container">
            {permissionMatrix.map((mod) => {
              const mainPerm = mod.permissions.find((p) => !p.parent_key) || mod.permissions[0];
              const isMainActive = selectedPermKeys.has(mainPerm.key);
              const isOpen = openModules.has(mod.module);

              return (
                <div key={mod.module} className={`image5-module-accordion ${isOpen ? 'is-open' : ''}`}>
                  {/* Module Accordion Header matching Image 5 */}
                  <div
                    className="image5-module-header"
                    onClick={() => toggleModuleAccordion(mod.module)}
                  >
                    <div className="image5-header-left" onClick={(e) => e.stopPropagation()}>
                      <label className="perm-toggle-switch header-switch">
                        <input
                          type="checkbox"
                          checked={isMainActive}
                          disabled={selectedRole.name === 'Super Admin'}
                          onChange={() => handleToggleModuleMain(mod)}
                        />
                        <span className="perm-toggle-slider" />
                      </label>
                      <span
                        className="image5-module-title"
                        onClick={() => toggleModuleAccordion(mod.module)}
                        style={{ cursor: 'pointer' }}
                      >
                        {mod.module}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '0.78rem', color: isMainActive ? '#059669' : '#94a3b8', fontWeight: 600 }}>
                        {isMainActive ? 'Enabled' : 'Disabled'}
                      </span>
                      <button
                        type="button"
                        className="image5-chevron-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleModuleAccordion(mod.module);
                        }}
                      >
                        {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </button>
                    </div>
                  </div>

                  {/* Module Cards Grid matching Image 5 */}
                  {isOpen && (
                    <div className="image5-module-body">
                      <div className="image5-cards-grid">
                        {mod.permissions.map((perm) => {
                          const isMain = perm.key === mainPerm.key;
                          const isChecked = isMainActive && selectedPermKeys.has(perm.key);
                          const isDisabled = !isMainActive || selectedRole.name === 'Super Admin';

                          return (
                            <div
                              key={perm.key}
                              className={`image5-perm-card ${isChecked ? 'active' : ''} ${isDisabled ? 'disabled' : ''}`}
                              onClick={() => {
                                if (!isMainActive) return;
                                if (isMain) {
                                  handleToggleModuleMain(mod);
                                } else {
                                  handleToggleChildPerm(perm, mainPerm.key);
                                }
                              }}
                              title={!isMainActive ? `Enable ${mod.module} master switch to activate this permission` : ''}
                            >
                              <label className="perm-toggle-switch" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  disabled={isDisabled}
                                  onChange={() => {
                                    if (!isMainActive) return;
                                    if (isMain) {
                                      handleToggleModuleMain(mod);
                                    } else {
                                      handleToggleChildPerm(perm, mainPerm.key);
                                    }
                                  }}
                                />
                                <span className="perm-toggle-slider" />
                              </label>

                              <div className="image5-perm-info">
                                <strong className="image5-perm-title">{perm.label}</strong>
                                <span className="image5-perm-subtext">
                                  {getPermissionDescription(perm.key)}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: ADD ROLE
         ========================================================================= */}
      {isAddModalOpen && (
        <div className="modal-overlay" onClick={() => setIsAddModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '440px' }}>
            <div style={{ padding: '18px 22px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Shield size={20} color="#059669" />
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#0f172a' }}>Add New Role</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="btn btn-secondary btn-sm"
                style={{ padding: '4px 8px' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateRole} style={{ padding: '22px' }}>
              {createError && (
                <div style={{ background: '#fef2f2', border: '1px solid #fee2e2', color: '#ef4444', padding: '10px 14px', borderRadius: '6px', fontSize: '0.82rem', marginBottom: '16px' }}>
                  {createError}
                </div>
              )}

              <div className="form-group" style={{ marginBottom: '14px' }}>
                <label className="form-label">Role Title *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Enter role title"
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                  autoFocus
                  required
                />
              </div>

              <div className="form-group" style={{ marginBottom: '20px' }}>
                <label className="form-label">Role Description</label>
                <textarea
                  className="form-input"
                  rows={3}
                  placeholder="Enter role description"
                  value={newRoleDescription}
                  onChange={(e) => setNewRoleDescription(e.target.value)}
                  style={{ resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsAddModalOpen(false)}
                  disabled={isCreatingRole}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isCreatingRole || !newRoleName.trim()}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Plus size={16} />
                  <span>{isCreatingRole ? 'Creating...' : 'Create Role'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Edit Role Modal */}
      {isEditRoleModalOpen && editingRole && (
        <div className="modal-overlay" onClick={() => setIsEditRoleModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '460px', width: '100%' }}>
            <div style={{ padding: '18px 22px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Edit2 size={18} color="#2563eb" />
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#0f172a' }}>
                  Edit Role: {editingRole.name}
                </h3>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ padding: '4px 8px' }}
                onClick={() => setIsEditRoleModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateRoleSubmit} style={{ padding: '22px' }}>
              {editRoleError && (
                <div style={{
                  background: '#fef2f2',
                  border: '1px solid #fee2e2',
                  color: '#dc2626',
                  padding: '10px 14px',
                  borderRadius: '6px',
                  fontSize: '0.82rem',
                  marginBottom: '16px'
                }}>
                  {editRoleError}
                </div>
              )}

              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label className="form-label" style={{ fontWeight: 600, fontSize: '0.82rem', marginBottom: '6px', display: 'block' }}>
                  ROLE TITLE <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  className="form-input"
                  required
                  value={editRoleForm.name}
                  onChange={(e) => setEditRoleForm({ ...editRoleForm, name: e.target.value })}
                  placeholder="Enter role title..."
                />
              </div>

              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label className="form-label" style={{ fontWeight: 600, fontSize: '0.82rem', marginBottom: '6px', display: 'block' }}>
                  ROLE DESCRIPTION
                </label>
                <textarea
                  className="form-input"
                  rows={3}
                  value={editRoleForm.description}
                  onChange={(e) => setEditRoleForm({ ...editRoleForm, description: e.target.value })}
                  placeholder="Briefly describe the role's purpose..."
                  style={{ resize: 'vertical' }}
                />
              </div>

              <div className="form-group" style={{ marginBottom: '22px' }}>
                <label className="form-label" style={{ fontWeight: 600, fontSize: '0.82rem', marginBottom: '6px', display: 'block' }}>
                  ROLE STATUS
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginTop: '6px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.84rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="role_status"
                      checked={editRoleForm.is_active === true}
                      onChange={() => setEditRoleForm({ ...editRoleForm, is_active: true })}
                    />
                    <span style={{ color: '#059669', fontWeight: 600 }}>Active</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.84rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="role_status"
                      checked={editRoleForm.is_active === false}
                      onChange={() => setEditRoleForm({ ...editRoleForm, is_active: false })}
                    />
                    <span style={{ color: '#dc2626', fontWeight: 600 }}>Inactive</span>
                  </label>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsEditRoleModalOpen(false)}
                  disabled={isSavingRole}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSavingRole || !editRoleForm.name.trim()}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Save size={16} />
                  <span>{isSavingRole ? 'Saving...' : 'Save Changes'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
