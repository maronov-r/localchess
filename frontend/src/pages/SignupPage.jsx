import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './AuthPages.css';

const RATING_METHODS = [
  { id: 'manual', label: 'I know my rating', desc: 'Enter your ELO or estimated skill level' },
  { id: 'calibrate', label: 'Play calibration games', desc: 'Play 3-5 games vs our bot to find your level' },
  { id: 'beginner', label: "I'm a beginner", desc: 'Start at 800 - a good beginner rating' },
];

export default function SignupPage() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    email: '', password: '', username: '', rating: 1200,
    isBusiness: false, ratingMethod: 'manual',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submitStep1 = (e) => {
    e.preventDefault();
    setError('');
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setStep(2);
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const rating =
      form.ratingMethod === 'beginner' ? 800
      : form.ratingMethod === 'calibrate' ? 1200
      : parseInt(form.rating) || 1200;

    try {
      await signup({
        email: form.email,
        password: form.password,
        username: form.username,
        rating,
        isBusiness: form.isBusiness,
      });

      if (form.ratingMethod === 'calibrate') {
        navigate('/calibration');
      } else {
        navigate('/');
      }
    } catch (err) {
      setError(err.message || 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card card" style={{ maxWidth: 460 }}>
        <div className="auth-header">
          <span className="auth-logo">♔</span>
          <h1>Join LocalChess</h1>
          <p>Find chess opponents in your area</p>
        </div>

        <div className="auth-steps">
          {[1, 2].map((s) => (
            <div key={s} className={`auth-step${step === s ? ' active' : step > s ? ' done' : ''}`}>
              <span>{step > s ? '✓' : s}</span>
            </div>
          ))}
        </div>

        {error && <div className="error-msg">{error}</div>}

        {step === 1 && (
          <form onSubmit={submitStep1} className="auth-form">
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="you@example.com"
                required
                autoFocus
              />
            </div>
            <div className="form-group">
              <label>Username</label>
              <input
                type="text"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                placeholder="chessmaster99"
                minLength={3}
                maxLength={30}
                pattern="[a-zA-Z0-9]+"
                required
              />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="At least 8 characters"
                required
              />
            </div>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={form.isBusiness}
                onChange={(e) => setForm({ ...form, isBusiness: e.target.checked })}
              />
              <span>Register as a business / club organizer</span>
            </label>
            <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%', justifyContent: 'center' }}>
              Continue
            </button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={submit} className="auth-form">
            <p className="step-title">How do you know your chess rating?</p>
            <div className="rating-methods">
              {RATING_METHODS.map(({ id, label, desc }) => (
                <label key={id} className={`rating-method${form.ratingMethod === id ? ' selected' : ''}`}>
                  <input
                    type="radio"
                    name="ratingMethod"
                    value={id}
                    checked={form.ratingMethod === id}
                    onChange={() => setForm({ ...form, ratingMethod: id })}
                  />
                  <div>
                    <strong>{label}</strong>
                    <span>{desc}</span>
                  </div>
                </label>
              ))}
            </div>

            {form.ratingMethod === 'manual' && (
              <div className="form-group">
                <label>Your Rating (ELO)</label>
                <input
                  type="number"
                  value={form.rating}
                  onChange={(e) => setForm({ ...form, rating: e.target.value })}
                  min={100}
                  max={3000}
                  placeholder="e.g. 1200"
                />
                <small style={{ color: 'var(--text2)' }}>
                  Beginner: ~800 · Intermediate: ~1200 · Advanced: ~1600+
                </small>
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button type="button" className="btn btn-ghost btn-lg" onClick={() => setStep(1)} style={{ flex: 1, justifyContent: 'center' }}>
                Back
              </button>
              <button type="submit" className="btn btn-primary btn-lg" disabled={loading} style={{ flex: 2, justifyContent: 'center' }}>
                {loading ? <span className="spinner" /> : 'Create Account'}
              </button>
            </div>
          </form>
        )}

        <p className="auth-footer">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
