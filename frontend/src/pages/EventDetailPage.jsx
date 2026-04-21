import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import SkillBadge from '../components/players/SkillBadge';

export default function EventDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { loadEvent(); }, [id]);

  async function loadEvent() {
    try {
      const data = await api.events.get(id);
      setEvent(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSignup() {
    setActionLoading(true);
    setError('');
    try {
      if (event.is_signed_up) {
        await api.events.cancelSignup(id);
      } else {
        await api.events.signup(id);
      }
      loadEvent();
    } catch (e) {
      setError(e.message);
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) return <div className="page-loading"><div className="spinner" /></div>;
  if (!event) return <div className="error-msg">{error || 'Event not found'}</div>;

  const isOrganizer = event.organizer_id === user?.id;
  const isFull = event.max_participants && parseInt(event.signup_count) >= event.max_participants;
  const starts = new Date(event.starts_at);

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)} style={{ marginBottom: '1rem' }}>
        ← Back
      </button>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.25rem' }}>{event.name}</h1>
            <p style={{ color: 'var(--text2)', fontSize: '0.88rem' }}>Organized by {event.organizer_name}</p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <span className="badge format-badge" style={{ background: 'var(--bg3)', color: 'var(--text2)', border: '1px solid var(--border)' }}>
              {event.format}
            </span>
            {event.tournament_format && (
              <span className="badge" style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
                {event.tournament_format}
              </span>
            )}
            {event.status !== 'upcoming' && (
              <span className="badge">{event.status}</span>
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
          {[
            { icon: '📅', label: 'Date', value: starts.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) },
            { icon: '🕐', label: 'Time', value: starts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + (event.ends_at ? ' – ' + new Date(event.ends_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '') },
            { icon: '📍', label: 'Venue', value: event.location_name || '—' },
            { icon: '🏠', label: 'Address', value: event.address || '—' },
            { icon: '👥', label: 'Participants', value: `${event.signup_count}${event.max_participants ? '/' + event.max_participants : ''}` },
            { icon: '💵', label: 'Entry Fee', value: parseFloat(event.entry_fee) > 0 ? `$${event.entry_fee}` : 'Free' },
            ...(event.rating_min || event.rating_max ? [{ icon: '⭐', label: 'Rating Range', value: `${event.rating_min || 0} – ${event.rating_max || '∞'}` }] : []),
          ].map(({ icon, label, value }) => (
            <div key={label} style={{ background: 'var(--bg3)', borderRadius: 8, padding: '0.75rem' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text2)', marginBottom: '0.2rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{icon} {label}</div>
              <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>{value}</div>
            </div>
          ))}
        </div>

        {event.description && (
          <div style={{ marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text2)' }}>DESCRIPTION</h3>
            <p style={{ fontSize: '0.9rem', lineHeight: 1.6 }}>{event.description}</p>
          </div>
        )}

        {error && <div className="error-msg" style={{ marginBottom: '1rem' }}>{error}</div>}

        {!isOrganizer && (
          <button
            className={`btn btn-lg ${event.is_signed_up ? 'btn-secondary' : isFull ? 'btn-ghost' : 'btn-primary'}`}
            onClick={handleSignup}
            disabled={actionLoading || (isFull && !event.is_signed_up)}
          >
            {actionLoading ? <span className="spinner" /> :
              event.is_signed_up ? '✓ Cancel Sign-Up' :
              isFull ? 'Event Full' :
              '→ Sign Up for Event'}
          </button>
        )}

        {isOrganizer && (
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              className="btn btn-secondary"
              onClick={async () => {
                const newStatus = event.status === 'upcoming' ? 'active' : 'cancelled';
                await api.events.update(id, { status: newStatus });
                loadEvent();
              }}
            >
              {event.status === 'upcoming' ? 'Start Event' : 'Cancel Event'}
            </button>
          </div>
        )}
      </div>

      <div className="card">
        <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>
          Participants ({event.participants?.length || 0})
        </h2>
        {!event.participants?.length ? (
          <p style={{ color: 'var(--text2)', fontSize: '0.88rem' }}>No sign-ups yet. Be the first!</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {event.participants.map((p, i) => (
              <div
                key={p.id}
                style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem', borderRadius: 8, cursor: 'pointer' }}
                onClick={() => navigate(`/profile/${p.id}`)}
              >
                <span style={{ color: 'var(--text2)', fontSize: '0.82rem', width: 20, textAlign: 'right' }}>{i + 1}</span>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: 'var(--accent)' }}>
                  {p.username[0].toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{p.username}</div>
                </div>
                <SkillBadge rating={p.rating} />
                <span className="badge rating-badge">{p.rating}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
