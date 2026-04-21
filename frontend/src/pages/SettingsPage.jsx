import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

const FORMATS = ['casual', 'rapid', 'blitz', 'bullet', 'classical', 'tournament'];

export default function SettingsPage() {
  const { user, updateUser } = useAuth();
  const [form, setForm] = useState({
    bio: user?.bio || '',
    avatar_url: user?.avatar_url || '',
    location_name: user?.location_name || '',
    search_radius_km: user?.search_radius_km || 25,
    preferred_formats: user?.preferred_formats || [],
    notify_nearby_posts: user?.notify_nearby_posts ?? true,
    notify_messages: user?.notify_messages ?? true,
    notify_events: user?.notify_events ?? true,
    notification_radius_km: user?.notification_radius_km || 25,
    quiet_hours_start: user?.quiet_hours_start ?? '',
    quiet_hours_end: user?.quiet_hours_end ?? '',
  });
  const [locationDetecting, setLocationDetecting] = useState(false);
  const [lat, setLat] = useState(user?.location_lat || '');
  const [lng, setLng] = useState(user?.location_lng || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const detectLocation = () => {
    setLocationDetecting(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude);
        setLng(pos.coords.longitude);
        setLocationDetecting(false);
      },
      () => {
        setError('Location access denied');
        setLocationDetecting(false);
      }
    );
  };

  const toggleFormat = (f) => {
    setForm((prev) => ({
      ...prev,
      preferred_formats: prev.preferred_formats.includes(f)
        ? prev.preferred_formats.filter((x) => x !== f)
        : [...prev.preferred_formats, f],
    }));
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const payload = { ...form };
      if (lat) payload.location_lat = parseFloat(lat);
      if (lng) payload.location_lng = parseFloat(lng);
      if (form.quiet_hours_start === '') payload.quiet_hours_start = null;
      if (form.quiet_hours_end === '') payload.quiet_hours_end = null;

      const updated = await api.auth.updateProfile(payload);
      updateUser(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1.5rem' }}>Settings</h1>

      {error && <div className="error-msg" style={{ marginBottom: '1rem' }}>{error}</div>}
      {saved && (
        <div className="error-msg" style={{ background: 'rgba(34,197,94,.1)', borderColor: 'rgba(34,197,94,.2)', color: 'var(--green)', marginBottom: '1rem' }}>
          Settings saved!
        </div>
      )}

      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Profile */}
        <div className="card">
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Profile</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="form-group">
              <label>Bio</label>
              <textarea
                value={form.bio}
                onChange={(e) => setForm({ ...form, bio: e.target.value })}
                placeholder="Tell other players about yourself..."
                style={{ minHeight: 80 }}
              />
            </div>
            <div className="form-group">
              <label>Avatar URL</label>
              <input
                type="url"
                value={form.avatar_url}
                onChange={(e) => setForm({ ...form, avatar_url: e.target.value })}
                placeholder="https://example.com/photo.jpg"
              />
            </div>
            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.03em', display: 'block', marginBottom: '0.5rem' }}>
                Preferred Formats
              </label>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {FORMATS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    className={`btn btn-sm ${form.preferred_formats.includes(f) ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => toggleFormat(f)}
                  >
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Location */}
        <div className="card">
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Location</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Latitude</label>
                <input
                  type="number" step="any"
                  value={lat}
                  onChange={(e) => setLat(e.target.value)}
                  placeholder="40.7128"
                />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Longitude</label>
                <input
                  type="number" step="any"
                  value={lng}
                  onChange={(e) => setLng(e.target.value)}
                  placeholder="-74.0060"
                />
              </div>
              <button type="button" className="btn btn-ghost" onClick={detectLocation} disabled={locationDetecting}>
                {locationDetecting ? <span className="spinner" /> : '📍 Detect'}
              </button>
            </div>
            <div className="form-group">
              <label>Location Name (optional)</label>
              <input
                type="text"
                value={form.location_name}
                onChange={(e) => setForm({ ...form, location_name: e.target.value })}
                placeholder="e.g. Brooklyn, NY"
              />
            </div>
            <div className="form-group">
              <label>Search Radius: {form.search_radius_km} km</label>
              <input
                type="range" min={1} max={200} step={1}
                value={form.search_radius_km}
                onChange={(e) => setForm({ ...form, search_radius_km: parseInt(e.target.value) })}
              />
            </div>
          </div>
        </div>

        {/* Notifications */}
        <div className="card" id="notifications">
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Notifications</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {[
              { key: 'notify_nearby_posts', label: 'Nearby "Looking to Play" posts' },
              { key: 'notify_messages', label: 'New messages' },
              { key: 'notify_events', label: 'Event updates and sign-ups' },
            ].map(({ key, label }) => (
              <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                <input
                  type="checkbox"
                  checked={form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
                  style={{ width: 16, height: 16 }}
                />
                {label}
              </label>
            ))}
            <div className="form-group">
              <label>Notification Radius: {form.notification_radius_km} km</label>
              <input
                type="range" min={1} max={100} step={1}
                value={form.notification_radius_km}
                onChange={(e) => setForm({ ...form, notification_radius_km: parseInt(e.target.value) })}
              />
            </div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Quiet Hours Start</label>
                <input
                  type="number" min={0} max={23}
                  value={form.quiet_hours_start}
                  onChange={(e) => setForm({ ...form, quiet_hours_start: e.target.value })}
                  placeholder="e.g. 22 (10pm)"
                />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Quiet Hours End</label>
                <input
                  type="number" min={0} max={23}
                  value={form.quiet_hours_end}
                  onChange={(e) => setForm({ ...form, quiet_hours_end: e.target.value })}
                  placeholder="e.g. 8 (8am)"
                />
              </div>
            </div>
          </div>
        </div>

        <button type="submit" className="btn btn-primary btn-lg" disabled={saving}>
          {saving ? <span className="spinner" /> : 'Save Settings'}
        </button>
      </form>
    </div>
  );
}
