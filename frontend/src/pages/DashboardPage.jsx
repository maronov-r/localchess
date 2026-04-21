import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useWs } from '../context/WsContext';
import api from '../services/api';
import SkillBadge from '../components/players/SkillBadge';
import './DashboardPage.css';

export default function DashboardPage() {
  const { user, updateUser } = useAuth();
  const { subscribe } = useWs();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [nearbyPosts, setNearbyPosts] = useState([]);
  const [nearbyEvents, setNearbyEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [locationError, setLocationError] = useState('');

  const hasLocation = !!(user?.location_lat && user?.location_lng);

  useEffect(() => {
    loadData();
  }, [user?.location_lat]);

  useEffect(() => {
    return subscribe('notification', (data) => {
      setNotifications((prev) => [data.notification, ...prev.slice(0, 9)]);
    });
  }, [subscribe]);

  async function loadData() {
    setLoading(true);
    try {
      const [notifs] = await Promise.all([
        api.notifications.list(),
      ]);
      setNotifications(notifs);

      if (hasLocation) {
        const [posts, events] = await Promise.all([
          api.posts.nearby({ limit: 5 }),
          api.events.nearby({ limit: 5 }),
        ]);
        setNearbyPosts(posts);
        setNearbyEvents(events);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function detectLocation() {
    setLocationError('');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude: location_lat, longitude: location_lng } = pos.coords;
          const updated = await api.auth.updateProfile({ location_lat, location_lng });
          updateUser(updated);
        } catch {
          setLocationError('Failed to save location');
        }
      },
      () => setLocationError('Location access denied')
    );
  }

  const markRead = async (id) => {
    await api.notifications.markRead(id);
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
  };

  const winRate = user?.games_played > 0
    ? Math.round((user.wins / user.games_played) * 100)
    : null;

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div>
          <h1>Welcome, {user?.username}</h1>
          <p className="subtitle">Find your next chess opponent nearby</p>
        </div>
        <div className="quick-actions">
          <button className="btn btn-primary" onClick={() => navigate('/posts')}>
            + Post Looking to Play
          </button>
          <button className="btn btn-secondary" onClick={() => navigate('/players')}>
            Browse Players
          </button>
        </div>
      </div>

      {!hasLocation && (
        <div className="location-prompt card">
          <div className="location-prompt-content">
            <span className="location-icon">📍</span>
            <div>
              <h3>Set your location</h3>
              <p>Share your location to find players, games, and events near you</p>
              {locationError && <p className="error-text">{locationError}</p>}
            </div>
          </div>
          <button className="btn btn-primary" onClick={detectLocation}>
            Use My Location
          </button>
        </div>
      )}

      <div className="dashboard-grid">
        {/* Stats card */}
        <div className="card stats-card">
          <div className="stats-header">
            <h2>Your Stats</h2>
            <SkillBadge rating={user?.rating} />
          </div>
          <div className="stats-grid">
            <div className="stat">
              <span className="stat-value">{user?.rating}</span>
              <span className="stat-label">Rating{user?.is_provisional ? ' (prov.)' : ''}</span>
            </div>
            <div className="stat">
              <span className="stat-value">{user?.games_played}</span>
              <span className="stat-label">Games</span>
            </div>
            <div className="stat">
              <span className="stat-value">{user?.wins}</span>
              <span className="stat-label">Wins</span>
            </div>
            <div className="stat">
              <span className="stat-value">{winRate !== null ? `${winRate}%` : '—'}</span>
              <span className="stat-label">Win Rate</span>
            </div>
          </div>
          <div className="stats-actions">
            <Link to="/games" className="btn btn-ghost btn-sm">Game History</Link>
            <Link to="/calibration" className="btn btn-ghost btn-sm">Recalibrate</Link>
          </div>
        </div>

        {/* Notifications */}
        <div className="card notifications-card">
          <div className="card-header">
            <h2>Notifications</h2>
            {notifications.some((n) => !n.read) && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={async () => {
                  await api.notifications.markAllRead();
                  setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
                }}
              >
                Mark all read
              </button>
            )}
          </div>
          {notifications.length === 0 ? (
            <p className="empty-text">No notifications yet</p>
          ) : (
            <div className="notif-list">
              {notifications.slice(0, 8).map((n) => (
                <div
                  key={n.id}
                  className={`notif-item${n.read ? '' : ' unread'}`}
                  onClick={() => markRead(n.id)}
                >
                  <div className="notif-icon">{notifIcon(n.type)}</div>
                  <div className="notif-body">
                    <strong>{n.title}</strong>
                    <span>{n.message}</span>
                    <time>{timeAgo(n.created_at)}</time>
                  </div>
                  {!n.read && <div className="notif-dot" />}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Nearby posts */}
        {hasLocation && (
          <div className="card nearby-card">
            <div className="card-header">
              <h2>Nearby Games</h2>
              <Link to="/posts" className="btn btn-ghost btn-sm">See all</Link>
            </div>
            {nearbyPosts.length === 0 ? (
              <p className="empty-text">No active posts nearby</p>
            ) : (
              <div className="nearby-list">
                {nearbyPosts.map((post) => (
                  <div key={post.id} className="nearby-item" onClick={() => navigate('/posts')}>
                    <div className="nearby-meta">
                      <strong>{post.username}</strong>
                      <span className="rating-badge badge">{post.poster_rating}</span>
                    </div>
                    <div className="nearby-details">
                      <span>{post.format}</span>
                      {post.time_control && <span>· {post.time_control}</span>}
                      <span>· {parseFloat(post.distance_km).toFixed(1)} km away</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Upcoming events */}
        {hasLocation && (
          <div className="card events-card">
            <div className="card-header">
              <h2>Upcoming Events</h2>
              <Link to="/events" className="btn btn-ghost btn-sm">See all</Link>
            </div>
            {nearbyEvents.length === 0 ? (
              <p className="empty-text">No upcoming events nearby</p>
            ) : (
              <div className="nearby-list">
                {nearbyEvents.map((event) => (
                  <div key={event.id} className="nearby-item" onClick={() => navigate(`/events/${event.id}`)}>
                    <div className="nearby-meta">
                      <strong>{event.name}</strong>
                      <span className="badge" style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
                        {event.format}
                      </span>
                    </div>
                    <div className="nearby-details">
                      <span>{new Date(event.starts_at).toLocaleDateString()}</span>
                      <span>· {parseFloat(event.distance_km).toFixed(1)} km away</span>
                      <span>· {event.signup_count} signed up</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function notifIcon(type) {
  const icons = {
    nearby_post: '📍',
    event_signup: '✅',
    event_reminder: '🔔',
    game_result: '♟',
    game_confirmed: '✓',
    message: '✉',
  };
  return icons[type] || '🔔';
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
