import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import './EventsPage.css';

const FORMATS = ['casual', 'rapid', 'blitz', 'bullet', 'classical', 'tournament'];
const TOURNAMENT_FORMATS = ['swiss', 'round-robin', 'single-elimination', 'double-elimination'];

export default function EventsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [myEvents, setMyEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    name: '',
    description: '',
    format: 'rapid',
    tournament_format: '',
    location_lat: user?.location_lat || '',
    location_lng: user?.location_lng || '',
    location_name: '',
    address: '',
    starts_at: '',
    ends_at: '',
    max_participants: '',
    rating_min: '',
    rating_max: '',
    entry_fee: 0,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const hasLocation = !!(user?.location_lat && user?.location_lng);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [nearby, mine] = await Promise.all([
        hasLocation ? api.events.nearby() : Promise.resolve([]),
        api.events.mine(),
      ]);
      setEvents(nearby);
      setMyEvents(mine);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function createEvent(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        max_participants: form.max_participants ? parseInt(form.max_participants) : undefined,
        rating_min: form.rating_min ? parseInt(form.rating_min) : undefined,
        rating_max: form.rating_max ? parseInt(form.rating_max) : undefined,
        entry_fee: parseFloat(form.entry_fee) || 0,
      };
      const event = await api.events.create(payload);
      setShowCreate(false);
      navigate(`/events/${event.id}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  const detectLocation = () => {
    navigator.geolocation.getCurrentPosition((pos) => {
      setForm({ ...form, location_lat: pos.coords.latitude, location_lng: pos.coords.longitude });
    });
  };

  return (
    <div className="events-page">
      <div className="page-header">
        <h1>Chess Events</h1>
        {user?.is_business && (
          <button className="btn btn-primary" onClick={() => setShowCreate((s) => !s)}>
            {showCreate ? '✕ Cancel' : '+ Create Event'}
          </button>
        )}
        {!user?.is_business && (
          <button className="btn btn-ghost btn-sm" onClick={() => setShowCreate((s) => !s)}>
            {showCreate ? '✕' : '+ Organize Event'}
          </button>
        )}
      </div>

      {showCreate && (
        <div className="card create-event-panel">
          <h2>Create Event</h2>
          {error && <div className="error-msg" style={{ marginBottom: '1rem' }}>{error}</div>}
          <form onSubmit={createEvent} className="event-form">
            <div className="form-group">
              <label>Event Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Saturday Rapid Tournament"
                required
              />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Format</label>
                <select value={form.format} onChange={(e) => setForm({ ...form, format: e.target.value })}>
                  {FORMATS.map((f) => <option key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Tournament Format</label>
                <select value={form.tournament_format} onChange={(e) => setForm({ ...form, tournament_format: e.target.value })}>
                  <option value="">None / Open Play</option>
                  {TOURNAMENT_FORMATS.map((f) => <option key={f} value={f}>{f.replace('-', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label>Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Describe the event, rules, prizes..."
              />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Latitude</label>
                <input type="number" step="any" value={form.location_lat}
                  onChange={(e) => setForm({ ...form, location_lat: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Longitude</label>
                <input type="number" step="any" value={form.location_lng}
                  onChange={(e) => setForm({ ...form, location_lng: e.target.value })} required />
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button type="button" className="btn btn-ghost" onClick={detectLocation}>📍</button>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Venue Name</label>
                <input type="text" value={form.location_name}
                  onChange={(e) => setForm({ ...form, location_name: e.target.value })}
                  placeholder="Chess Club, City Hall..." />
              </div>
              <div className="form-group">
                <label>Address</label>
                <input type="text" value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="123 Main St" />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Starts At</label>
                <input type="datetime-local" value={form.starts_at}
                  onChange={(e) => setForm({ ...form, starts_at: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Ends At (optional)</label>
                <input type="datetime-local" value={form.ends_at}
                  onChange={(e) => setForm({ ...form, ends_at: e.target.value })} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Max Participants</label>
                <input type="number" min={2} value={form.max_participants}
                  onChange={(e) => setForm({ ...form, max_participants: e.target.value })}
                  placeholder="Unlimited" />
              </div>
              <div className="form-group">
                <label>Entry Fee ($)</label>
                <input type="number" min={0} step={0.01} value={form.entry_fee}
                  onChange={(e) => setForm({ ...form, entry_fee: e.target.value })} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Min Rating</label>
                <input type="number" min={0} value={form.rating_min}
                  onChange={(e) => setForm({ ...form, rating_min: e.target.value })}
                  placeholder="None" />
              </div>
              <div className="form-group">
                <label>Max Rating</label>
                <input type="number" min={0} value={form.rating_max}
                  onChange={(e) => setForm({ ...form, rating_max: e.target.value })}
                  placeholder="None" />
              </div>
            </div>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? <span className="spinner" /> : 'Create Event'}
            </button>
          </form>
        </div>
      )}

      {myEvents.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ marginBottom: '0.75rem', fontSize: '1rem', fontWeight: 600 }}>Your Events</h2>
          <div className="events-grid">
            {myEvents.map((e) => <EventCard key={e.id} event={e} onClick={() => navigate(`/events/${e.id}`)} />)}
          </div>
        </div>
      )}

      <h2 style={{ marginBottom: '0.75rem', fontSize: '1rem', fontWeight: 600 }}>
        Nearby Events
      </h2>

      {!hasLocation ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ fontSize: '1.5rem' }}>📍</p>
          <p style={{ color: 'var(--text2)', marginTop: '0.5rem' }}>Set your location to find events near you</p>
        </div>
      ) : loading ? (
        <div className="page-loading"><div className="spinner" /></div>
      ) : events.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ fontSize: '1.5rem' }}>🏆</p>
          <p style={{ color: 'var(--text2)', marginTop: '0.5rem' }}>No upcoming events nearby</p>
        </div>
      ) : (
        <div className="events-grid">
          {events.map((e) => <EventCard key={e.id} event={e} onClick={() => navigate(`/events/${e.id}`)} />)}
        </div>
      )}
    </div>
  );
}

function EventCard({ event, onClick }) {
  const date = new Date(event.starts_at);
  const isFull = event.max_participants && parseInt(event.signup_count) >= event.max_participants;

  return (
    <div className="event-card card" onClick={onClick}>
      <div className="event-card-header">
        <div>
          <h3 className="event-name">{event.name}</h3>
          <p className="event-organizer">by {event.organizer_name}</p>
        </div>
        <div className="event-badges">
          <span className="badge format-badge">{event.format}</span>
          {event.is_signed_up && (
            <span className="badge" style={{ background: 'rgba(34,197,94,.15)', color: 'var(--green)' }}>Signed Up</span>
          )}
          {isFull && <span className="badge" style={{ background: 'rgba(239,68,68,.15)', color: 'var(--red)' }}>Full</span>}
        </div>
      </div>
      <div className="event-meta">
        <span>📅 {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        {event.location_name && <span>📍 {event.location_name}</span>}
        {event.distance_km && <span>🗺 {parseFloat(event.distance_km).toFixed(1)} km</span>}
        <span>👥 {event.signup_count}{event.max_participants ? `/${event.max_participants}` : ''}</span>
        {parseFloat(event.entry_fee) > 0 && <span>💵 ${event.entry_fee}</span>}
      </div>
    </div>
  );
}
