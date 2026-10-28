import React, { useState, useEffect } from 'react';
import { ArrowLeft, UserPlus, CheckCircle2, AlertCircle, Bot, Shield, Check, Save } from 'lucide-react';
import api from '../../services/api';

export default function AddUserView({
  onBack = () => {},
  onUserCreated = () => {},
  onUserSaved = () => {},
  editingUser = null
}) {
  const isEditMode = Boolean(editingUser);

  const [fullName, setFullName] = useState(editingUser?.full_name || '');
  const [email, setEmail] = useState(editingUser?.email || '');
  const [phoneNumber, setPhoneNumber] = useState(editingUser?.phone || '');
  const [roleId, setRoleId] = useState(editingUser?.role_id ? String(editingUser.role_id) : '');
  const [province, setProvince] = useState(editingUser?.province || '');
  const [city, setCity] = useState(editingUser?.city || '');
  const [area, setArea] = useState(editingUser?.area || '');
  const [site, setSite] = useState(editingUser?.site || '');
  const [selectedAgentId, setSelectedAgentId] = useState(
    editingUser?.assigned_agent_id ? String(editingUser.assigned_agent_id) : ''
  );
  const [isActive, setIsActive] = useState(
    editingUser?.is_active !== undefined ? Boolean(editingUser.is_active) : true
  );

  // Loaded options
  const [roles, setRoles] = useState([]);
  const [agents, setAgents] = useState([]);
  const [locationsSummary, setLocationsSummary] = useState({
    provinces: [],
    cities: [],
    areas: [],
    sites: []
  });

  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  useEffect(() => {
    async function loadFormData() {
      setIsLoadingData(true);
      try {
        const [rolesRes, agentsRes, locsRes] = await Promise.all([
          api.get('/api/roles/list'),
          api.get('/api/agent/list'),
          api.get('/api/locations/summary')
        ]);

        if (rolesRes.ok) {
          const data = await rolesRes.json();
          // Filter out Super Admin so standard user cannot be made Super Admin directly
          setRoles((data.roles || []).filter((r) => r.name !== 'Super Admin'));
        }

        if (agentsRes.ok) {
          const data = await agentsRes.json();
          setAgents(data.agents || []);
          // Do NOT force-select an agent. Agent assignment is completely optional!
        }

        if (locsRes.ok) {
          const data = await locsRes.json();
          setLocationsSummary(data);
        }
      } catch (err) {
        console.error('Failed to load form data:', err);
      } finally {
        setIsLoadingData(false);
      }
    }

    loadFormData();
  }, []);

  // Update fields if editingUser changes
  useEffect(() => {
    if (editingUser) {
      setFullName(editingUser.full_name || '');
      setEmail(editingUser.email || '');
      setPhoneNumber(editingUser.phone || '');
      setRoleId(editingUser.role_id ? String(editingUser.role_id) : '');
      setProvince(editingUser.province || '');
      setCity(editingUser.city || '');
      setArea(editingUser.area || '');
      setSite(editingUser.site || '');
      setSelectedAgentId(editingUser.assigned_agent_id ? String(editingUser.assigned_agent_id) : '');
      setIsActive(editingUser.is_active !== undefined ? Boolean(editingUser.is_active) : true);
    }
  }, [editingUser]);

  // Filtered dropdowns based on selections
  const filteredCities = (locationsSummary.cities || []).filter(
    (c) => !province || c.province_name === province
  );

  const filteredAreas = (locationsSummary.areas || []).filter((a) => {
    if (province && a.province_name && a.province_name !== province) return false;
    if (city && a.city_name !== city) return false;
    return true;
  });

  const filteredSites = (locationsSummary.sites || []).filter((s) => {
    if (province && s.province_name && s.province_name !== province) return false;
    if (city && s.city_name && s.city_name !== city) return false;
    if (area && s.area_name !== area) return false;
    return true;
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Email address is required.');
      return;
    }

    if (!roleId) {
      setError('Please select a user role.');
      return;
    }

    if (!province) {
      setError('Please select a province for location access assignment.');
      return;
    }

    // Agent assignment is strictly OPTIONAL - no validation blocking if not selected!

    setIsSubmitting(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const payload = {
        full_name: fullName.trim() || undefined,
        email: email.trim(),
        phone: phoneNumber.trim() || null,
        role_id: parseInt(roleId, 10),
        province: province || null,
        city: city || null,
        area: area || null,
        site: site || null,
        assigned_agent_id: selectedAgentId ? parseInt(selectedAgentId, 10) : null,
        location_scope: site ? 'site' : area ? 'area' : city ? 'city' : 'province'
      };

      if (isEditMode) {
        payload.is_active = isActive;
        const res = await api.put(`/api/users/${editingUser.id}`, payload);
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.detail || 'Failed to update user');
        }

        setSuccessMsg(`User '${fullName || email}' updated successfully!`);
        setTimeout(() => {
          onUserSaved(data.user);
          onBack();
        }, 1000);
      } else {
        const res = await api.post('/api/users/create', payload);
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.detail || 'Failed to create user');
        }

        setSuccessMsg(`User created successfully! Welcome email sent to ${email}`);
        setTimeout(() => {
          onUserCreated(data.user);
          onBack();
        }, 1200);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="add-user-page-container">
      {/* Top Back Navigation Button */}
      <div className="add-user-back-nav" style={{ marginBottom: '16px' }}>
        <button type="button" className="add-user-back-btn" onClick={onBack}>
          <ArrowLeft size={16} />
          <span>Back to Users</span>
        </button>
      </div>

      {/* Main Card */}
      <div className="add-user-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h2 className="add-user-card-title" style={{ margin: 0 }}>
              {isEditMode ? `Edit User: ${editingUser?.full_name || editingUser?.username}` : 'Add User'}
            </h2>
            <p style={{ color: '#64748b', fontSize: '0.84rem', margin: '4px 0 0' }}>
              {isEditMode
                ? 'Update user account credentials, role permissions, and location access scope.'
                : 'Fill in details to provision a new user account on the system.'}
            </p>
          </div>

          {isEditMode && (
            <div style={{
              background: isActive ? '#ecfdf5' : '#f1f5f9',
              border: isActive ? '1px solid #a7f3d0' : '1px solid #e2e8f0',
              color: isActive ? '#059669' : '#64748b',
              padding: '6px 14px',
              borderRadius: '20px',
              fontSize: '0.8rem',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: isActive ? '#059669' : '#94a3b8' }}></span>
              {isActive ? 'Active Account' : 'Inactive Account'}
            </div>
          )}
        </div>

        {error && (
          <div className="add-user-alert error">
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="add-user-alert success">
            <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="add-user-form">
          {/* Row 1: FULL NAME, EMAIL *, PHONE NUMBER (3 Columns) */}
          <div className="add-user-grid-3">
            <div className="form-group-custom">
              <label className="form-label-custom">FULL NAME</label>
              <input
                type="text"
                className="form-input-custom"
                placeholder="Enter full name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>

            <div className="form-group-custom">
              <label className="form-label-custom">
                EMAIL <span className="req-star">*</span>
              </label>
              <input
                type="email"
                className="form-input-custom"
                placeholder="Enter email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="form-group-custom">
              <label className="form-label-custom">PHONE NUMBER</label>
              <input
                type="tel"
                className="form-input-custom"
                placeholder="Enter phone number"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
              />
            </div>
          </div>

          {/* Row 2: ROLE * and STATUS (if edit mode) */}
          <div style={{ display: 'grid', gridTemplateColumns: isEditMode ? '1fr 1fr' : '1fr', gap: '20px', maxWidth: isEditMode ? '860px' : '420px', marginTop: '16px' }}>
            <div className="form-group-custom">
              <label className="form-label-custom">
                ROLE <span className="req-star">*</span>
              </label>
              <select
                className="form-select-custom"
                value={roleId}
                onChange={(e) => setRoleId(e.target.value)}
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

            {isEditMode && (
              <div className="form-group-custom">
                <label className="form-label-custom">ACCOUNT STATUS</label>
                <select
                  className="form-select-custom"
                  value={isActive ? 'active' : 'inactive'}
                  onChange={(e) => setIsActive(e.target.value === 'active')}
                >
                  <option value="active">Active (Access Allowed)</option>
                  <option value="inactive">Inactive (Deactivated)</option>
                </select>
              </div>
            )}
          </div>

          {/* Divider & Section Header: LOCATION ACCESS ASSIGNMENT * */}
          <div className="add-user-section-header">
            <span>LOCATION ACCESS ASSIGNMENT</span>
            <span className="req-star" style={{ marginLeft: '4px' }}>*</span>
          </div>

          {/* Row 3: PROVINCE *, CITY, AREA, SITE (4 Columns) */}
          <div className="add-user-grid-4">
            <div className="form-group-custom">
              <label className="form-label-custom">
                PROVINCE <span className="req-star">*</span>
              </label>
              <select
                className="form-select-custom"
                value={province}
                onChange={(e) => {
                  setProvince(e.target.value);
                  setCity('');
                  setArea('');
                  setSite('');
                }}
                required
              >
                <option value="">Select Province</option>
                {(locationsSummary.provinces || []).map((p) => (
                  <option key={p.id} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group-custom">
              <label className="form-label-custom">CITY</label>
              <select
                className="form-select-custom"
                value={city}
                onChange={(e) => {
                  setCity(e.target.value);
                  setArea('');
                  setSite('');
                }}
              >
                <option value="">Select City</option>
                {filteredCities.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group-custom">
              <label className="form-label-custom">AREA</label>
              <select
                className="form-select-custom"
                value={area}
                onChange={(e) => {
                  setArea(e.target.value);
                  setSite('');
                }}
              >
                <option value="">Select Area</option>
                {filteredAreas.map((a) => (
                  <option key={a.id} value={a.name}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group-custom">
              <label className="form-label-custom">SITE</label>
              <input
                type="text"
                list="site-options-list"
                className="form-input-custom"
                placeholder="Enter site name"
                value={site}
                onChange={(e) => setSite(e.target.value)}
              />
              <datalist id="site-options-list">
                {filteredSites.map((s, idx) => (
                  <option key={idx} value={s.name || s} />
                ))}
              </datalist>
            </div>
          </div>

          {/* Row 4: ASSIGN AGENT (OPTIONAL - Agent assignment is not mandatory!) */}
          <div className="form-group-custom" style={{ maxWidth: '480px', marginTop: '24px' }}>
            <label className="form-label-custom" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>ASSIGN AGENT</span>
              <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 500, textTransform: 'none' }}>
                (Optional)
              </span>
            </label>
            <select
              className="form-select-custom"
              value={selectedAgentId || ''}
              onChange={(e) => setSelectedAgentId(e.target.value)}
            >
              <option value="">No Agent Assigned (Optional)</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
            <span style={{ fontSize: '0.74rem', color: '#64748b', marginTop: '2px' }}>
              You can leave this unassigned. The user will have full access scoped by their selected locations.
            </span>
          </div>

          {/* Submit / Cancel Buttons */}
          <div style={{ marginTop: '32px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              type="submit"
              className="create-user-submit-btn"
              disabled={isSubmitting}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '11px 28px',
                background: '#059669',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '0.88rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              {isSubmitting ? (
                <>
                  <span className="spinner">⏳</span>
                  <span>{isEditMode ? 'Saving Changes...' : 'Creating User...'}</span>
                </>
              ) : (
                <>
                  {isEditMode ? <Save size={16} /> : <UserPlus size={16} />}
                  <span>{isEditMode ? 'Update User' : 'Create User'}</span>
                </>
              )}
            </button>

            <button
              type="button"
              className="btn btn-secondary"
              onClick={onBack}
              disabled={isSubmitting}
              style={{ padding: '11px 20px', borderRadius: '8px' }}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
