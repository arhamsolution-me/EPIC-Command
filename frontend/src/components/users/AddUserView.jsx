import React, { useState, useEffect } from 'react';
import { ArrowLeft, UserPlus, CheckCircle2, AlertCircle, Bot, Shield, Check } from 'lucide-react';
import api from '../../services/api';

export default function AddUserView({ onBack = () => {}, onUserCreated = () => {} }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [roleId, setRoleId] = useState('');
  const [province, setProvince] = useState('');
  const [city, setCity] = useState('');
  const [area, setArea] = useState('');
  const [site, setSite] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState(null);

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
          if (data.agents && data.agents.length > 0) {
            setSelectedAgentId(data.agents[0].id);
          }
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

    if (!selectedAgentId) {
      setError('Please select an agent to assign to this user.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const payload = {
        full_name: fullName.trim() || undefined,
        email: email.trim(),
        phone: phoneNumber.trim() || undefined,
        role_id: parseInt(roleId, 10),
        province: province || undefined,
        city: city || undefined,
        area: area || undefined,
        site: site || undefined,
        assigned_agent_id: parseInt(selectedAgentId, 10),
        location_scope: site ? 'site' : area ? 'area' : city ? 'city' : 'province'
      };

      const res = await api.post('/api/users/create', payload);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || 'Failed to create user');
      }

      setSuccessMsg(`User created successfully! Welcome email sent to ${email}`);
      setTimeout(() => {
        onUserCreated(data.user);
        onBack();
      }, 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="add-user-page-container">
      {/* Top Back Navigation Button matching Image 1 */}
      <div className="add-user-back-nav">
        <button type="button" className="add-user-back-btn" onClick={onBack}>
          <ArrowLeft size={16} />
          <span>Back to Users</span>
        </button>
      </div>

      {/* Main Card */}
      <div className="add-user-card">
        <h2 className="add-user-card-title">Add User</h2>

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
          {/* Row 1: FULL NAME, EMAIL *, PHONE NUMBER (3 Columns) matching Image 1 */}
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

          {/* Row 2: ROLE * matching Image 1 */}
          <div className="form-group-custom" style={{ maxWidth: '420px', marginTop: '16px' }}>
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

          {/* Divider & Section Header: LOCATION ACCESS ASSIGNMENT * matching Image 1 */}
          <div className="add-user-section-header">
            <span>LOCATION ACCESS ASSIGNMENT</span>
            <span className="req-star" style={{ marginLeft: '4px' }}>*</span>
          </div>

          {/* Row 3: PROVINCE *, CITY, AREA, SITE (4 Columns) matching Image 1 */}
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

          {/* Row 4: ASSIGN AGENT * (Clean dropdown row, only agent name, proper width) */}
          <div className="form-group-custom" style={{ maxWidth: '420px', marginTop: '24px' }}>
            <label className="form-label-custom">
              ASSIGN AGENT <span className="req-star">*</span>
            </label>
            <select
              className="form-select-custom"
              value={selectedAgentId || ''}
              onChange={(e) => setSelectedAgentId(e.target.value)}
              required
            >
              <option value="">Select Agent</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          </div>

          {/* Create User Button matching Image 1 */}
          <div style={{ marginTop: '32px' }}>
            <button
              type="submit"
              className="create-user-submit-btn"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Creating User...' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
