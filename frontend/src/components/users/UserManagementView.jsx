import React, { useState, useEffect } from 'react';
import {
  Users,
  Plus,
  Search,
  Filter,
  CheckCircle,
  XCircle,
  Bot,
  MapPin,
  Shield,
  MoreVertical,
  Trash2,
  RefreshCw,
  Edit2
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import AddUserView from './AddUserView';

export default function UserManagementView() {
  const { user, hasPermission } = useAuth();
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [openActionId, setOpenActionId] = useState(null);
  const [selectedUserForEdit, setSelectedUserForEdit] = useState(null);

  // Close actions dropdown on outside click
  useEffect(() => {
    const handleGlobalClick = (e) => {
      if (!e.target.closest('.action-dropdown-wrapper')) {
        setOpenActionId(null);
      }
    };
    document.addEventListener('click', handleGlobalClick);
    return () => document.removeEventListener('click', handleGlobalClick);
  }, []);

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit)
      });
      if (search.trim()) params.append('search', search.trim());
      if (statusFilter) params.append('status', statusFilter);

      const res = await api.get(`/api/users/list?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        // Super Admin is never displayed in User section
        const normalUsers = (data.users || []).filter((u) => !u.is_superadmin);
        setUsers(normalUsers);
        setTotal(data.total || 0);
      }
    } catch (err) {
      console.error('Fetch users error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [page, limit, statusFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchUsers();
  };

  const handleToggleStatus = async (userId, currentStatus) => {
    try {
      const res = await api.put(`/api/users/${userId}/status`, { is_active: !currentStatus });
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, is_active: !currentStatus } : u))
        );
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.detail || 'Failed to update user status');
      }
    } catch (err) {
      alert(`Error toggling status: ${err.message}`);
    }
  };

  const handleDeleteUser = async (userId, username) => {
    if (!window.confirm(`Are you sure you want to delete user '${username}'?`)) return;
    try {
      const res = await api.delete(`/api/users/${userId}`);
      if (res.ok) {
        fetchUsers();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.detail || 'Failed to delete user');
      }
    } catch (err) {
      alert(`Error deleting user: ${err.message}`);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));

  if (isModalOpen) {
    return (
      <AddUserView
        editingUser={selectedUserForEdit}
        onBack={() => {
          setIsModalOpen(false);
          setSelectedUserForEdit(null);
        }}
        onUserCreated={() => {
          setIsModalOpen(false);
          setSelectedUserForEdit(null);
          fetchUsers();
        }}
        onUserSaved={() => {
          setIsModalOpen(false);
          setSelectedUserForEdit(null);
          fetchUsers();
        }}
      />
    );
  }

  return (
    <div className="users-view-container">
      {/* Top Filter and Action Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        marginBottom: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, maxWidth: '420px' }}>
          <div style={{ position: 'relative', width: '100%' }}>
            <Search size={15} color="#94a3b8" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              className="form-input"
              placeholder="Search by name, email..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              style={{ paddingLeft: '32px' }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {hasPermission('USER_CREATE') && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                setSelectedUserForEdit(null);
                setIsModalOpen(true);
              }}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px' }}
            >
              <Plus size={15} />
              Add User
            </button>
          )}
        </div>
      </div>

      {/* Users Data Table */}
      <div className="data-table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: '5%', textAlign: 'left' }}>ID</th>
              <th style={{ width: '18%', textAlign: 'left' }}>USER</th>
              <th style={{ width: '18%', textAlign: 'center' }}>EMAIL</th>
              <th style={{ width: '11%', textAlign: 'center' }}>ROLE</th>
              <th style={{ width: '13%', textAlign: 'center' }}>ASSIGNED AGENT</th>
              <th style={{ width: '13%', textAlign: 'center' }}>LOCATION SCOPE</th>
              <th style={{ width: '9%', textAlign: 'center' }}>STATUS</th>
              <th style={{ width: '8%', textAlign: 'center' }}>CREATED AT</th>
              <th style={{ width: '5%', textAlign: 'center' }}>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan="9" style={{ textAlign: 'center', padding: '32px 16px', color: '#64748b', fontSize: '0.86rem', fontWeight: 500 }}>
                  No data found
                </td>
              </tr>
            ) : (
              users.map((u, idx) => (
                <tr key={u.id}>
                  <td className="font-mono" style={{ color: 'var(--text-muted)', fontWeight: 600, textAlign: 'left' }}>
                    #{u.id}
                  </td>
                  <td style={{ textAlign: 'left' }} title={`Username: @${u.username}`}>
                    <span style={{ color: '#0f172a', fontWeight: 700, fontSize: '0.86rem' }}>
                      {u.full_name || u.username}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span style={{ fontSize: '0.82rem', color: '#334155', fontWeight: 500 }}>
                      {u.email || '—'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '2px 8px',
                      borderRadius: '12px',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      background: u.is_superadmin ? '#fef3c7' : '#ecfdf5',
                      color: u.is_superadmin ? '#92400e' : '#065f46'
                    }}>
                      <Shield size={11} />
                      {u.is_superadmin ? 'Super Admin' : u.role_name || 'Standard User'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.8rem', color: '#059669', fontWeight: 600 }}>
                      <Bot size={13} color="#059669" />
                      {u.is_superadmin ? 'All Agents (Global)' : u.assigned_agent_name || `Agent #${u.assigned_agent_id}`}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.78rem', color: '#2563eb' }}>
                      <MapPin size={12} color="#2563eb" />
                      {u.is_superadmin
                        ? 'Global'
                        : u.city
                          ? `${u.city}, ${u.province || 'PK'}`
                          : u.location_scope?.toUpperCase() || 'Agent'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {(hasPermission('USER_UPDATE') || hasPermission('USER_TOGGLE_STATUS')) && !u.is_superadmin ? (
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(u.id, u.is_active)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          color: u.is_active ? '#059669' : '#dc2626',
                          fontWeight: 600,
                          fontSize: '0.78rem'
                        }}
                      >
                        {u.is_active ? <CheckCircle size={14} /> : <XCircle size={14} />}
                        {u.is_active ? 'Active' : 'Inactive'}
                      </button>
                    ) : (
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        color: u.is_active ? '#059669' : '#dc2626',
                        fontWeight: 600,
                        fontSize: '0.78rem'
                      }}>
                        {u.is_active ? <CheckCircle size={14} /> : <XCircle size={14} />}
                        {u.is_active ? 'Active' : 'Inactive'}
                      </span>
                    )}
                  </td>
                  <td style={{ textAlign: 'center', fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                    {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                  </td>
                  <td style={{ textAlign: 'center', width: '48px', position: 'relative' }} onClick={(e) => e.stopPropagation()}>
                    {!u.is_superadmin && (
                      <div className="action-dropdown-wrapper">
                        <button
                          type="button"
                          className="action-dots-btn"
                          onClick={() => setOpenActionId(openActionId === u.id ? null : u.id)}
                          title="Actions"
                        >
                          <MoreVertical size={16} />
                        </button>

                        {openActionId === u.id && (
                          <div className={`action-menu-dropdown right-aligned ${users.length >= 3 && idx >= users.length - 2 ? 'open-up' : 'open-down'}`}>
                            {hasPermission('USER_UPDATE') && (
                              <button
                                type="button"
                                className="action-menu-item"
                                onClick={() => {
                                  setOpenActionId(null);
                                  setSelectedUserForEdit(u);
                                  setIsModalOpen(true);
                                }}
                              >
                                <Edit2 size={13} color="#2563eb" />
                                Edit User
                              </button>
                            )}

                            {(hasPermission('USER_UPDATE') || hasPermission('USER_TOGGLE_STATUS')) && (
                              <button
                                type="button"
                                className="action-menu-item"
                                onClick={() => {
                                  setOpenActionId(null);
                                  handleToggleStatus(u.id, u.is_active);
                                }}
                              >
                                {u.is_active ? <XCircle size={13} color="#ea580c" /> : <CheckCircle size={13} color="#059669" />}
                                {u.is_active ? 'Deactivate User' : 'Activate User'}
                              </button>
                            )}

                            <div style={{ height: '1px', background: '#f1f5f9', margin: '3px 0' }}></div>

                            {hasPermission('USER_DELETE') && (
                              <button
                                type="button"
                                className="action-menu-item danger"
                                onClick={() => {
                                  setOpenActionId(null);
                                  handleDeleteUser(u.id, u.username);
                                }}
                              >
                                <Trash2 size={13} />
                                Delete User
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Bar */}
      {total > 0 && (
        <div className="camera-grid-pagination" style={{ marginTop: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span className="pagination-info-text">
              Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total} users
            </span>
            <select
              className="pagination-select"
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
            >
              <option value={5}>5 / page</option>
              <option value={10}>10 / page</option>
              <option value={20}>20 / page</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              className="pagination-btn"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </button>
            <div className="pagination-current-pill">
              {page} / {totalPages}
            </div>
            <button
              type="button"
              className="pagination-btn"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
