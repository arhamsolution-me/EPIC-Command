import React, { useState, useEffect } from 'react';
import { X, Edit2, Shield, Bot, MapPin, Save } from 'lucide-react';
import api from '../../services/api';

export default function EditUserModal({ isOpen, onClose, user, onUserUpdated }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [roleId, setRoleId] = useState('');
  const [assignedAgentId, setAssignedAgentId] = useState('');
  const [province, setProvince] = useState('');
  const [city, setCity] = useState('');
  const [area, setArea] = useState('');
  const [site, setSite] = useState('');
  const [isActive, setIsActive] = useState(true);

  const [roles, setRoles] = useState([]);
  const [agents, setAgents] = useState([]);
  const [locationsSummary, setLocationsSummary] = useState({ provinces: [], cities: [], areas: [], sites: [] });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen && user) {
      setFullName(user.full_name || '');
      setEmail(user.email || '');
      setPhone(user.phone || '');
      setRoleId(user.role_id ? String(user.role_id) : '');
      setAssignedAgentId(user.assigned_agent_id ? String(user.assigned_agent_id) : '');
      setProvince(user.province || '');
      setCity(user.city || '');
      setArea(user.area || '');
      setSite(user.site || '');
      setIsActive(Boolean(user.is_active));
      setError(null);

      // Load roles, agents, and locations
      api.get('/api/roles/list')
        .then((r) => r.json())
        .then((d) => setRoles(d.roles || []))
        .catch(() => setRoles([]));

      api.get('/api/agent/list')
        .then((r) => r.json())
        .then((d) => setAgents(d.agents || []))
        .catch(() => setAgents([]));

      api.get('/api/locations/summary')
        .then((r) => r.json())
        .then((d) => setLocationsSummary(d || { provinces: [], cities: [], areas: [], sites: [] }))
        .catch(() => {});
    }
  }, [isOpen, user]);

  if (!isOpen || !user) return null;

  // Filtered cities based on selected province
  const availableCities = (locationsSummary.cities || []).filter(
    (c) => !province || c.province_name === province
  );

  // Filtered areas based on selected city
  const availableAreas = (locationsSummary.areas || []).filter(
    (a) => !city || a.city_name === city
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim()) {
      setError('Full name and email are required.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const payload = {
        full_name: fullName.trim(),
        email: email.trim(),
        phone: phone.trim() || null,
        role_id: roleId ? parseInt(roleId, 10) : null,
        assigned_agent_id: assignedAgentId ? parseInt(assignedAgentId, 10) : null,
        province: province || null,
        city: city || null,
        area: area || null,
        site: site || null,
        is_active: isActive
      };

      const res = await api.put(`/api/users/${user.id}`, payload);
      if (res.ok) {
        onUserUpdated();
        onClose();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.detail || 'Failed to update user.');
      }
    } catch (err) {
      setError(err.message || 'Network error updating user.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 9999 }}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '580px', width: '100%', overflow: 'hidden' }}>
        <div style={{
          padding: '16px 22px',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#f8fafc'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              padding: '7px',
              borderRadius: '7px',
              display: 'flex'
            }}>
              <Edit2 size={18} color="#2563eb" />
            </div>
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                Edit User
              </h3>
              <p style={{ fontSize: '0.76rem', color: '#64748b', margin: '2px 0 0' }}>
                {user.full_name || user.username} {user.email ? `• ${user.email}` : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#94a3b8',
              display: 'flex',
              padding: '6px',
              borderRadius: '6px',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#e2e8f0';
              e.currentTarget.style.color = '#0f172a';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'none';
              e.currentTarget.style.color = '#94a3b8';
            }}
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '20px' }}>
          {error && (
            <div style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#dc2626',
              padding: '10px 14px',
              borderRadius: '6px',
              fontSize: '0.82rem',
              marginBottom: '16px'
            }}>
              {error}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
            <div className="form-group">
              <label className="form-label" style={{ fontWeight: 600, fontSize: '0.82rem', marginBottom: '6px', display: 'block' }}>
                FULL NAME <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="text"
                className="form-input"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Enter full name"
              />
            </div>

            <div className="form-group">
              <label className="form-label" style={{ fontWeight: 600, fontSize: '0.82rem', marginBottom: '6px', display: 'block' }}>
                EMAIL ADDRESS <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="email"
                className="form-input"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter email"
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
            <div className="form-group">
              <label className="form-label" style={{ fontWeight: 600, fontSize: '0.82rem', marginBottom: '6px', display: 'block' }}>
                PHONE NUMBER
              </label>
              <input
                type="text"
                className="form-input"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Enter phone number"
              />
            </div>

            <div className="form-group">
              <label className="form-label" style={{ fontWeight: 600, fontSize: '0.82rem', marginBottom: '6px', display: 'block' }}>
                ROLE ASSIGNMENT
              </label>
              <select
                className="form-input"
                value={roleId}
                onChange={(e) => setRoleId(e.target.value)}
              >
                <option value="">Select Role</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label className="form-label" style={{ fontWeight: 600, fontSize: '0.82rem', marginBottom: '6px', display: 'block' }}>
              ASSIGNED EDGE AGENT
            </label>
            <select
              className="form-input"
              value={assignedAgentId}
              onChange={(e) => setAssignedAgentId(e.target.value)}
            >
              <option value="">Select Agent</option>
              {agents.map((ag) => (
                <option key={ag.id} value={ag.id}>
                  {ag.name}
                </option>
              ))}
            </select>
          </div>

          {/* Cascading Location Assignment */}
          <div style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '14px',
            marginBottom: '18px'
          }}>
            <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '10px' }}>
              Location Scoping
            </span>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '10px' }}>
              <div>
                <label style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Province</label>
                <select
                  className="form-input"
                  value={province}
                  onChange={(e) => {
                    setProvince(e.target.value);
                    setCity('');
                    setArea('');
                  }}
                  style={{ fontSize: '0.8rem', padding: '6px 10px' }}
                >
                  <option value="">Select Province</option>
                  {(locationsSummary.provinces || []).map((p) => (
                    <option key={p.id} value={p.name}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 600, display: 'block', marginBottom: '4px' }}>City</label>
                <select
                  className="form-input"
                  value={city}
                  disabled={!province}
                  onChange={(e) => {
                    setCity(e.target.value);
                    setArea('');
                  }}
                  style={{ fontSize: '0.8rem', padding: '6px 10px', background: !province ? '#f1f5f9' : '#ffffff' }}
                >
                  <option value="">{province ? 'Select City' : 'Select Province first'}</option>
                  {availableCities.map((c) => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Area</label>
                <select
                  className="form-input"
                  value={area}
                  disabled={!city}
                  onChange={(e) => setArea(e.target.value)}
                  style={{ fontSize: '0.8rem', padding: '6px 10px', background: !city ? '#f1f5f9' : '#ffffff' }}
                >
                  <option value="">{city ? 'Select Area' : 'Select City first'}</option>
                  {availableAreas.map((a) => (
                    <option key={a.id} value={a.name}>{a.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Site Facility</label>
                <input
                  type="text"
                  className="form-input"
                  value={site}
                  onChange={(e) => setSite(e.target.value)}
                  placeholder="Enter site name"
                  style={{ fontSize: '0.8rem', padding: '6px 10px' }}
                />
              </div>
            </div>
          </div>

          {/* Active Status */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155' }}>Account Status</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.84rem', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="edit_user_status"
                  checked={isActive === true}
                  onChange={() => setIsActive(true)}
                />
                <span style={{ color: '#059669', fontWeight: 600 }}>Active</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.84rem', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="edit_user_status"
                  checked={isActive === false}
                  onChange={() => setIsActive(false)}
                />
                <span style={{ color: '#dc2626', fontWeight: 600 }}>Inactive</span>
              </label>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting || !fullName.trim() || !email.trim()}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Save size={15} />
              <span>{isSubmitting ? 'Saving...' : 'Save Changes'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
