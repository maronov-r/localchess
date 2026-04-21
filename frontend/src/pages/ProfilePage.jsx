import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import SkillBadge from '../components/players/SkillBadge';

export default function ProfilePage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.users.get(id)
      .then(setProfile)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="page-loading"><div className="spinner" /></div>;
  if (error || !profile) return <div className="error-msg">{error || 'User not found'}</div>;

  const isOwn = profile.id === user?.id;
  const winRate = profile.games_played > 0
    ? Math.round((profile.wins / profile.games_played) * 100)
    : null;

  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)} style={{ marginBottom: '1rem' }}>
        ← Back
      </button>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1.25rem', flexWrap: 'wrap' }}>
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '1.8rem', color: 'var(--accent)', flexShrink: 0, overflow: 'hidden' }}>
            {profile.avatar_url ? <img src={profile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : profile.username[0].toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
              <h1 style={{ fontSize: '1.4rem', fontWeight: 700 }}>{profile.username}</h1>
              <SkillBadge rating={profile.rating} />
              {profile.is_provisional && <span className="badge" style={{ background: 'var(--bg3)', color: 'var(--text2)' }}>Provisional</span>}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', color: 'var(--text2)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
              <span>Rating: <strong style={{ color: 'var(--text)' }}>{profile.rating}</strong></span>
              {profile.location_name && <span>· 📍 {profile.location_name}</span>}
              <span>· Joined {new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
            </div>
            {profile.bio && <p style={{ fontSize: '0.9rem', color: 'var(--text2)' }}>{profile.bio}</p>}
          </div>
          {!isOwn && (
            <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
              <button className="btn btn-primary" onClick={() => navigate(`/messages/${profile.id}`)}>
                ✉ Message
              </button>
            </div>
          )}
          {isOwn && (
            <button className="btn btn-ghost" onClick={() => navigate('/settings')}>
              Edit Profile
            </button>
          )}
        </div>

        {isOwn && (
          <div style={{ marginTop: '0.75rem', padding: '0.6rem', background: 'var(--bg3)', borderRadius: 8, fontSize: '0.8rem', color: 'var(--text2)' }}>
            <strong>Your ID:</strong> {profile.id}
            <span style={{ color: 'var(--text2)', marginLeft: '0.5rem' }}>(Share with opponents to report games)</span>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
        {[
          { label: 'Games', value: profile.games_played },
          { label: 'Wins', value: profile.wins, color: 'var(--green)' },
          { label: 'Losses', value: profile.losses, color: 'var(--red)' },
          { label: 'Win Rate', value: winRate !== null ? `${winRate}%` : '—' },
        ].map(({ label, value, color }) => (
          <div key={label} className="card" style={{ textAlign: 'center', padding: '1rem' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: color || 'var(--text)' }}>{value}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{label}</div>
          </div>
        ))}
      </div>

      {profile.preferred_formats?.length > 0 && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Preferred Formats</h2>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {profile.preferred_formats.map((f) => (
              <span key={f} className="badge" style={{ background: 'var(--bg3)', color: 'var(--text2)', border: '1px solid var(--border)' }}>{f}</span>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Recent Games</h2>
        {!profile.recent_games?.length ? (
          <p style={{ color: 'var(--text2)', fontSize: '0.88rem' }}>No games recorded yet</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {profile.recent_games.map((g) => {
              const isP1 = g.player1_id === profile.id;
              const opponent = isP1 ? g.player2_name : g.player1_name;
              let outcome = 'Draw';
              let color = 'var(--yellow)';
              if (g.result === 'player1' && isP1) { outcome = 'Win'; color = 'var(--green)'; }
              else if (g.result === 'player2' && !isP1) { outcome = 'Win'; color = 'var(--green)'; }
              else if (g.result !== 'draw') { outcome = 'Loss'; color = 'var(--red)'; }

              const change = isP1 ? g.player1_rating_change : g.player2_rating_change;

              return (
                <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.6rem', borderRadius: 8, borderLeft: `3px solid ${color}` }}>
                  <span style={{ color, fontWeight: 700, fontSize: '0.88rem', minWidth: 40 }}>{outcome}</span>
                  <span style={{ flex: 1, fontSize: '0.88rem' }}>vs <strong>{opponent}</strong></span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text2)' }}>{g.format}</span>
                  {change !== undefined && (
                    <span style={{ color: change >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 600, fontSize: '0.88rem' }}>
                      {change >= 0 ? '+' : ''}{change}
                    </span>
                  )}
                  <span style={{ fontSize: '0.78rem', color: 'var(--text2)' }}>
                    {new Date(g.played_at).toLocaleDateString()}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
