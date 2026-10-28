import React, { useState } from 'react';
import {
  KeyRound,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  Shield,
  Save,
  Check,
  Lock
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';

export default function ChangePasswordView({ onBack = () => {} }) {
  const { user, refreshProfile } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Password Strength Calculation
  const getPasswordStrength = (pwd) => {
    if (!pwd) return { score: 0, label: '', color: '#e2e8f0' };
    let score = 0;
    if (pwd.length >= 6) score += 1;
    if (pwd.length >= 8) score += 1;
    if (/[0-9]/.test(pwd)) score += 1;
    if (/[^A-Za-z0-9]/.test(pwd)) score += 1;
    if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score += 1;

    if (score <= 2) return { score: 25, label: 'Weak', color: '#ef4444' };
    if (score <= 3) return { score: 60, label: 'Moderate', color: '#f59e0b' };
    return { score: 100, label: 'Strong', color: '#10b981' };
  };

  const strength = getPasswordStrength(newPassword);
  const isMatch = newPassword && confirmPassword && newPassword === confirmPassword;
  const hasMinLength = newPassword.length >= 6;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!currentPassword.trim()) {
      setError('Please enter your current password.');
      return;
    }

    if (!newPassword.trim()) {
      setError('Please enter a new password.');
      return;
    }

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New password and confirm password do not match.');
      return;
    }

    setIsLoading(true);
    try {
      const payload = {
        current_password: currentPassword.trim(),
        new_password: newPassword.trim(),
        confirm_password: confirmPassword.trim()
      };

      const res = await api.post('/api/auth/change-password', payload);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || 'Failed to change password.');
      }

      setSuccess('Your password has been updated successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      if (refreshProfile) await refreshProfile();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="add-user-page-container" style={{ maxWidth: '780px', margin: '0 auto', padding: '0 0 40px' }}>
      {/* Top Back Navigation */}
      <div className="add-user-topbar" style={{ marginBottom: '16px' }}>
        <button type="button" className="add-user-back-btn" onClick={onBack}>
          <ArrowLeft size={16} />
          <span>Back to Dashboard</span>
        </button>
      </div>

      {/* Main Card */}
      <div className="add-user-card" style={{ padding: '36px 40px' }}>
        {/* Card Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '22px' }}>
          <div style={{
            background: '#ecfdf5',
            border: '1.5px solid #a7f3d0',
            borderRadius: '12px',
            padding: '10px',
            color: '#059669',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <KeyRound size={24} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>
              Change Password
            </h2>
            <p style={{ color: '#64748b', fontSize: '0.84rem', margin: '4px 0 0' }}>
              Update your account password to keep your EPIC Command access secure.
            </p>
          </div>
        </div>

        {/* User Account Info Bar */}
        <div style={{
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
          padding: '12px 16px',
          marginBottom: '24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '10px'
        }}>
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>ACCOUNT</div>
            <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0f172a' }}>
              {user?.full_name || user?.username}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>EMAIL</div>
            <div style={{ fontSize: '0.86rem', color: '#059669', fontWeight: 600 }}>
              {user?.email}
            </div>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="add-user-alert error" style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', marginBottom: '20px' }}>
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            <span style={{ fontSize: '0.86rem' }}>{error}</span>
          </div>
        )}

        {/* Success Alert */}
        {success && (
          <div className="add-user-alert success" style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', marginBottom: '20px' }}>
            <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
            <span style={{ fontSize: '0.86rem', fontWeight: 600 }}>{success}</span>
          </div>
        )}

        {/* Change Password Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Current Password Field */}
          <div className="form-group-custom">
            <label className="form-label-custom">
              CURRENT PASSWORD <span className="req-star">*</span>
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showCurrent ? 'text' : 'password'}
                className="form-input-custom"
                placeholder="Enter current password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                style={{ paddingRight: '40px' }}
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#94a3b8',
                  display: 'flex',
                  alignItems: 'center',
                  padding: 0
                }}
              >
                {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* New Password Field */}
          <div className="form-group-custom">
            <label className="form-label-custom">
              NEW PASSWORD <span className="req-star">*</span>
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showNew ? 'text' : 'password'}
                className="form-input-custom"
                placeholder="Enter new strong password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                style={{ paddingRight: '40px' }}
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#94a3b8',
                  display: 'flex',
                  alignItems: 'center',
                  padding: 0
                }}
              >
                {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {/* Strength Meter Bar */}
            {newPassword && (
              <div style={{ marginTop: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Strength:</span>
                  <span style={{ fontSize: '0.74rem', fontWeight: 700, color: strength.color }}>{strength.label}</span>
                </div>
                <div style={{ width: '100%', height: '4px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{
                    width: `${strength.score}%`,
                    height: '100%',
                    background: strength.color,
                    transition: 'all 0.25s ease'
                  }}></div>
                </div>
              </div>
            )}
          </div>

          {/* Confirm New Password Field */}
          <div className="form-group-custom">
            <label className="form-label-custom">
              CONFIRM NEW PASSWORD <span className="req-star">*</span>
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showConfirm ? 'text' : 'password'}
                className="form-input-custom"
                placeholder="Re-enter new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                style={{ paddingRight: '40px' }}
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#94a3b8',
                  display: 'flex',
                  alignItems: 'center',
                  padding: 0
                }}
              >
                {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {/* Match Status */}
            {confirmPassword && (
              <div style={{
                marginTop: '4px',
                fontSize: '0.74rem',
                fontWeight: 600,
                color: isMatch ? '#059669' : '#ef4444',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                {isMatch ? <Check size={12} strokeWidth={3} /> : '✕'}
                {isMatch ? 'Passwords match' : 'Passwords do not match'}
              </div>
            )}
          </div>

          {/* Security Checklist Box */}
          <div style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px'
          }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: '2px' }}>
              Password Requirements
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', color: hasMinLength ? '#059669' : '#64748b' }}>
              <Check size={13} strokeWidth={hasMinLength ? 3 : 2} color={hasMinLength ? '#059669' : '#94a3b8'} />
              <span>At least 6 characters long</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', color: isMatch ? '#059669' : '#64748b' }}>
              <Check size={13} strokeWidth={isMatch ? 3 : 2} color={isMatch ? '#059669' : '#94a3b8'} />
              <span>Passwords match</span>
            </div>
          </div>

          {/* Submit & Cancel Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '12px' }}>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isLoading || !currentPassword.trim() || !newPassword.trim() || !isMatch || !hasMinLength}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '11px 24px',
                fontSize: '0.88rem',
                fontWeight: 700,
                background: '#059669',
                borderRadius: '8px'
              }}
            >
              {isLoading ? (
                <>
                  <span className="spinner">⏳</span>
                  <span>Updating Password...</span>
                </>
              ) : (
                <>
                  <Save size={16} />
                  <span>Update Password</span>
                </>
              )}
            </button>

            <button
              type="button"
              className="btn btn-secondary"
              onClick={onBack}
              disabled={isLoading}
              style={{ padding: '11px 20px', fontSize: '0.88rem', borderRadius: '8px' }}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
