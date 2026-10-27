import React, { useState } from 'react';
import { Shield, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanEmail = email.trim();
    const cleanPassword = password.trim();
    if (!cleanEmail || !cleanPassword) {
      setError('Please enter both email address and password.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await login(cleanEmail, cleanPassword);
    } catch (err) {
      setError(err.message || 'Login failed. Please verify credentials.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="login-v2-container">
      {/* Background with video/cinematic surveillance pan animation */}
      <div className="login-v2-video-bg"></div>
      <div className="login-v2-overlay"></div>

      {/* Live CCTV Timestamp Overlay in corner */}


      <div className="login-v2-content">
        {/* Left Brand Area matching Image 3 */}
        <div className="login-v2-brand-section">
          <div className="login-v2-brand-badge">
            <div className="login-v2-shield-icon">
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <circle cx="12" cy="11" r="3" fill="#059669" stroke="#ffffff" strokeWidth="1.5" />
                <circle cx="12" cy="11" r="1" fill="#ffffff" />
              </svg>
            </div>
            <div>
              <h1 className="login-v2-brand-title">EPIC Command</h1>
              <p className="login-v2-brand-subtitle">Smart Surveillance System</p>
            </div>
          </div>
        </div>

        {/* Right Glassmorphism Login Card matching Image 3 */}
        <div className="login-v2-glass-card">
          <h2 className="login-v2-card-heading">Login</h2>

          {error && (
            <div className="login-v2-error-banner">
              <AlertCircle size={15} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="login-v2-form">
            <div className="login-v2-form-group">
              <label className="login-v2-label">Email Address</label>
              <input
                type="email"
                className="login-v2-input"
                placeholder="Enter email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isSubmitting}
                autoFocus
                required
              />
            </div>

            <div className="login-v2-form-group">
              <label className="login-v2-label">Password</label>
              <div className="login-v2-password-wrapper">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="login-v2-input"
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isSubmitting}
                  required
                />
                <button
                  type="button"
                  className="login-v2-eye-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="login-v2-options-row">
              <label className="login-v2-remember-label">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  style={{ accentColor: '#059669' }}
                />
                <span>Remember me</span>
              </label>

              <a
                href="#forgot"
                className="login-v2-forgot-link"
                onClick={(e) => {
                  e.preventDefault();
                  alert('Password reset instructions have been dispatched to the system administrator.');
                }}
              >
                Forgot Password?
              </a>
            </div>

            <button
              type="submit"
              className="login-v2-submit-btn"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <span className="spinner" style={{ width: '15px', height: '15px', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#ffffff', borderRadius: '50%' }}></span>
                  <span>Authenticating...</span>
                </>
              ) : (
                'Login'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
