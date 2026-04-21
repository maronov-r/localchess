import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import L from 'leaflet';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import SkillBadge from '../components/players/SkillBadge';
import './PlayersPage.css';

// Fix leaflet default icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const myIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  className: 'my-marker',
});

export default function PlayersPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('list');
  const [filters, setFilters] = useState({
    radius: user?.search_radius_km || 25,
    rating_min: '',
    rating_max: '',
    format: '',
  });
  const [error, setError] = useState('');

  const hasLocation = !!(user?.location_lat && user?.location_lng);

  useEffect(() => {
    if (hasLocation) loadPlayers();
  }, [hasLocation]);

  async function loadPlayers() {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (filters.radius) params.radius = filters.radius;
      if (filters.rating_min) params.rating_min = filters.rating_min;
      if (filters.rating_max) params.rating_max = filters.rating_max;
      if (filters.format) params.format = filters.format;
      const data = await api.users.nearby(params);
      setPlayers(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const applyFilters = (e) => {
    e.preventDefault();
    loadPlayers();
  };

  if (!hasLocation) {
    return (
      <div className="players-page">
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ fontSize: '2rem', marginBottom: '1rem' }}>📍</p>
          <h2>Location required</h2>
          <p style={{ color: 'var(--text2)', marginTop: '0.5rem' }}>
            Go to Settings to set your location and find players near you.
          </p>
          <button className="btn btn-primary" style={{ marginTop: '1.5rem' }} onClick={() => navigate('/settings')}>
            Set Location
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="players-page">
      <div className="page-header">
        <h1>Nearby Players</h1>
        <div className="view-toggle">
          <button className={`btn btn-sm ${view === 'list' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setView('list')}>☰ List</button>
          <button className={`btn btn-sm ${view === 'map' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setView('map')}>⊡ Map</button>
        </div>
      </div>

      <div className="players-layout">
        <aside className="filters-panel card">
          <h3>Filters</h3>
          <form onSubmit={applyFilters} className="filters-form">
            <div className="form-group">
              <label>Radius: {filters.radius} km</label>
              <input
                type="range" min={1} max={100} step={1}
                value={filters.radius}
                onChange={(e) => setFilters({ ...filters, radius: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Rating Min</label>
              <input
                type="number" min={0} max={4000} placeholder="Any"
                value={filters.rating_min}
                onChange={(e) => setFilters({ ...filters, rating_min: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Rating Max</label>
              <input
                type="number" min={0} max={4000} placeholder="Any"
                value={filters.rating_max}
                onChange={(e) => setFilters({ ...filters, rating_max: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Game Format</label>
              <select value={filters.format} onChange={(e) => setFilters({ ...filters, format: e.target.value })}>
                <option value="">Any</option>
                <option value="casual">Casual</option>
                <option value="rapid">Rapid</option>
                <option value="blitz">Blitz</option>
                <option value="bullet">Bullet</option>
                <option value="classical">Classical</option>
              </select>
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
              Search
            </button>
          </form>
        </aside>

        <div className="players-content">
          {error && <div className="error-msg">{error}</div>}

          {view === 'map' && (
            <div className="map-wrapper">
              <MapContainer
                center={[user.location_lat, user.location_lng]}
                zoom={12}
                style={{ height: '100%', width: '100%', borderRadius: 'var(--radius)' }}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <Circle
                  center={[user.location_lat, user.location_lng]}
                  radius={filters.radius * 1000}
                  pathOptions={{ color: '#7c6af7', fillOpacity: 0.05 }}
                />
                {players.map((p) => (
                  <Marker key={p.id} position={[p.location_lat, p.location_lng]}>
                    <Popup>
                      <strong>{p.username}</strong><br />
                      Rating: {p.rating}<br />
                      {p.distance_km} km away<br />
                      <button
                        onClick={() => navigate(`/messages/${p.id}`)}
                        style={{ marginTop: 8, cursor: 'pointer' }}
                      >
                        Message
                      </button>
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
            </div>
          )}

          {view === 'list' && (
            <>
              {loading ? (
                <div className="page-loading"><div className="spinner" /></div>
              ) : players.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
                  <p style={{ fontSize: '1.5rem' }}>♟</p>
                  <p style={{ color: 'var(--text2)', marginTop: '0.5rem' }}>No players found in this area</p>
                </div>
              ) : (
                <div className="players-list">
                  {players.map((p) => (
                    <PlayerCard key={p.id} player={p} onMessage={() => navigate(`/messages/${p.id}`)} onProfile={() => navigate(`/profile/${p.id}`)} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PlayerCard({ player, onMessage, onProfile }) {
  const winRate = player.games_played > 0
    ? Math.round((player.wins / player.games_played) * 100)
    : null;

  return (
    <div className="player-card card">
      <div className="player-card-header">
        <div className="player-avatar" onClick={onProfile}>
          {player.avatar_url
            ? <img src={player.avatar_url} alt="" />
            : <span>{player.username?.[0]?.toUpperCase()}</span>
          }
        </div>
        <div className="player-info">
          <div className="player-name-row">
            <span className="player-name" onClick={onProfile}>{player.username}</span>
            <SkillBadge rating={player.rating} />
            {player.is_provisional && <span className="provisional-tag">prov.</span>}
          </div>
          <div className="player-stats-row">
            <span className="rating-badge badge">{player.rating}</span>
            <span className="player-dist">{player.distance_km} km away</span>
            {player.location_name && <span className="player-location">· {player.location_name}</span>}
          </div>
        </div>
        <div className="player-actions">
          <button className="btn btn-primary btn-sm" onClick={onMessage}>Message</button>
          <button className="btn btn-ghost btn-sm" onClick={onProfile}>Profile</button>
        </div>
      </div>
      {player.bio && <p className="player-bio">{player.bio}</p>}
      <div className="player-footer">
        <span>{player.games_played} games</span>
        {winRate !== null && <span>{winRate}% wins</span>}
        {player.preferred_formats?.length > 0 && (
          <span>{player.preferred_formats.join(', ')}</span>
        )}
      </div>
    </div>
  );
}
