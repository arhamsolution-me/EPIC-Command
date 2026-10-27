import React, { useState, useEffect } from 'react';
import { X, UserPlus, Shield, Bot, MapPin } from 'lucide-react';
import api from '../../services/api';

export default function AddUserModal({ isOpen, onClose, onUserCreated }) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [roleId, setRoleId] = useState('');
  const [assignedAgentId, setAssignedAgentId] = useState('');
  const [locationScope, setLocationScope] = useState('agent');
  const [province, setProvince] = useState('');
  const [city, setCity] = useState('');

  const [roles, setRoles] = useState([]);
  const [agents, setAgents] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      // Fetch available roles and agents
      api.get('/api/roles/list')
        .then((r) => r.json())
        .then((d) => setRoles(d.roles || []))
        .catch(() => setRoles([]));

      api.get('/api/agent/list')
        .then((r) => r.json())
        .then((d) => {
          setAgents(d.agents || []);
          if (d.agents && d.agents.length > 0 && !assignedAgentId) {
            setAssignedAgentId(d.agents[0].id);
          }
        })
        .catch(() => setAgents([]));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !email.trim() || !password) {
      setError('Username, email, and password are required.');
      return;
    }

    if (!assignedAgentId) {
      setError('An active monitoring agent must be assigned to this user.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const payload = {
        username: username.trim(),
        email: email.trim(),
        full_name: fullName.trim() || username.trim(),
        password,
        role_id: roleId ? parseInt(roleId, 10) : null,
        assigned_agent_id: parseInt(assignedAgentId, 10),
        location_scope: locationScope,
        province: province.trim() || null,
        city: city.trim() || null
      };

      const res = await api.post('/api/users/create', payload);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || 'Failed to create user');
      }

      onUserCreated(data.user);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ background: '#ecfdf5', padding: '7px', borderRadius: '7px' }}>
              <UserPlus size={18} color="#059669" />
            </div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
              Create New System User
            </h3>
          </div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {error && (
            <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', color: '#b91c1c', fontSize: '0.8rem' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }}>
                Username <span style={{ color: '#059669' }}>*</span>
              </label>
              <input
                type="text"
                className="form-input"
                placeholder="Enter username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                disabled={isSubmitting}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }}>
                Full Name
              </label>
              <input
                type="text"
                className="form-input"
                placeholder="Enter full name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                disabled={isSubmitting}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }}>
                Email Address <span style={{ color: '#059669' }}>*</span>
              </label>
              <input
                type="email"
                className="form-input"
                placeholder="Enter email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isSubmitting}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }}>
                Initial Password <span style={{ color: '#059669' }}>*</span>
              </label>
              <input
                type="password"
                className="form-input"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isSubmitting}
              />
            </div>
          </div>

          {/* Role and Agent Assignment */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }}>
                Assigned Role <span style={{ color: '#059669' }}>*</span>
              </label>
              <select
                className="form-input"
                value={roleId}
                onChange={(e) => setRoleId(e.target.value)}
                disabled={isSubmitting}
                required
              >
                <option value="">Select Role</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }}>
                Assigned Agent Node <span style={{ color: '#059669' }}>*</span>
              </label>
              <select
                className="form-input"
                value={assignedAgentId}
                onChange={(e) => setAssignedAgentId(e.target.value)}
                disabled={isSubmitting}
                required
              >
                <option value="">Select Agent</option>
                {agents.map((ag) => (
                  <option key={ag.id} value={ag.id}>
                    {ag.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Location Scope */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '4px' }}>
                Scope Level
              </label>
              <select
                className="form-input"
                value={locationScope}
                onChange={(e) => setLocationScope(e.target.value)}
                disabled={isSubmitting}
              >
                <option value="agent">Agent Bound</option>
                <option value="city">City Bound</option>
                <option value="province">Province Bound</option>
                <option value="global">Global (All)</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '4px' }}>
                Province
              </label>
              <input
                type="text"
                className="form-input"
                placeholder="Enter province"
                value={province}
                onChange={(e) => setProvince(e.target.value)}
                disabled={isSubmitting}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '4px' }}>
                City
              </label>
              <input
                type="text"
                className="form-input"
                placeholder="Enter city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                disabled={isSubmitting}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Creating User...' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
