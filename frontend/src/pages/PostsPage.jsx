import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useWs } from '../context/WsContext';
import SkillBadge from '../components/players/SkillBadge';
import './PostsPage.css';

const FORMATS = ['casual', 'rapid', 'blitz', 'bullet', 'classical', 'tournament'];

function timeFromNow(mins) {
  const d = new Date(Date.now() + mins * 60000);
  return d.toISOString().slice(0, 16);
}

export default function PostsPage() {
  const { user } = useAuth();
  const { subscribe } = useWs();
  const navigate = useNavigate();
  const [posts, setPosts] = useState([]);
  const [myPosts, setMyPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    location_lat: user?.location_lat || '',
    location_lng: user?.location_lng || '',
    location_name: user?.location_name || '',
    rating_min: Math.max(0, (user?.rating || 1200) - 200),
    rating_max: (user?.rating || 1200) + 200,
    available_from: timeFromNow(0),
    available_until: timeFromNow(120),
    format: 'casual',
    time_control: '',
    description: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const hasLocation = !!(user?.location_lat && user?.location_lng);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    return subscribe('notification', (data) => {
      if (data.notification?.type === 'nearby_post') loadData();
    });
  }, [subscribe]);

  async function loadData() {
    setLoading(true);
    try {
      const [nearby, mine] = await Promise.all([
        hasLocation ? api.posts.nearby() : Promise.resolve([]),
        api.posts.mine(),
      ]);
      setPosts(nearby);
      setMyPosts(mine);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function createPost(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.posts.create(form);
      setShowCreate(false);
      loadData();
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function updateStatus(id, status) {
    await api.posts.updateStatus(id, status);
    loadData();
  }

  async function deletePost(id) {
    await api.posts.delete(id);
    loadData();
  }

  const detectLocation = () => {
    navigator.geolocation.getCurrentPosition((pos) => {
      setForm({
        ...form,
        location_lat: pos.coords.latitude,
        location_lng: pos.coords.longitude,
      });
    });
  };

  return (
    <div className="posts-page">
      <div className="page-header">
        <h1>Find a Game</h1>
        <button className="btn btn-primary" onClick={() => setShowCreate((s) => !s)}>
          {showCreate ? '✕ Cancel' : '+ Post Looking to Play'}
        </button>
      </div>

      {showCreate && (
        <div className="create-post-panel card">
          <h2>Post Looking to Play</h2>
          <p style={{ color: 'var(--text2)', fontSize: '0.88rem', marginBottom: '1.25rem' }}>
            Nearby players matching your criteria will be notified.
          </p>
          {error && <div className="error-msg" style={{ marginBottom: '1rem' }}>{error}</div>}
          <form onSubmit={createPost} className="post-form">
            <div className="form-row">
              <div className="form-group">
                <label>Latitude</label>
                <input
                  type="number" step="any"
                  value={form.location_lat}
                  onChange={(e) => setForm({ ...form, location_lat: e.target.value })}
                  placeholder="40.7128"
                  required
                />
              </div>
              <div className="form-group">
                <label>Longitude</label>
                <input
                  type="number" step="any"
                  value={form.location_lng}
                  onChange={(e) => setForm({ ...form, location_lng: e.target.value })}
                  placeholder="-74.0060"
                  required
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button type="button" className="btn btn-ghost" onClick={detectLocation}>
                  📍 Use Current
                </button>
              </div>
            </div>
            <div className="form-group">
              <label>Location Name (optional)</label>
              <input
                type="text"
                value={form.location_name}
                onChange={(e) => setForm({ ...form, location_name: e.target.value })}
                placeholder="e.g. Central Park, Coffee Bean Café"
              />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Rating Range Min</label>
                <input
                  type="number" min={0} max={4000}
                  value={form.rating_min}
                  onChange={(e) => setForm({ ...form, rating_min: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Rating Range Max</label>
                <input
                  type="number" min={0} max={4000}
                  value={form.rating_max}
                  onChange={(e) => setForm({ ...form, rating_max: e.target.value })}
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Available From</label>
                <input
                  type="datetime-local"
                  value={form.available_from}
                  onChange={(e) => setForm({ ...form, available_from: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Available Until</label>
                <input
                  type="datetime-local"
                  value={form.available_until}
                  onChange={(e) => setForm({ ...form, available_until: e.target.value })}
                  required
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Format</label>
                <select value={form.format} onChange={(e) => setForm({ ...form, format: e.target.value })}>
                  {FORMATS.map((f) => <option key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Time Control (optional)</label>
                <input
                  type="text"
                  value={form.time_control}
                  onChange={(e) => setForm({ ...form, time_control: e.target.value })}
                  placeholder="e.g. 10+5, 30 min"
                />
              </div>
            </div>
            <div className="form-group">
              <label>Notes (optional)</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Any additional info about where to meet, what you're looking for, etc."
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? <span className="spinner" /> : 'Post & Notify Nearby Players'}
            </button>
          </form>
        </div>
      )}

      {/* My active posts */}
      {myPosts.filter((p) => p.status === 'active').length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ marginBottom: '0.75rem', fontSize: '1rem', fontWeight: 600 }}>Your Active Posts</h2>
          <div className="posts-list">
            {myPosts.filter((p) => p.status === 'active').map((post) => (
              <PostCard
                key={post.id}
                post={post}
                isOwn
                onMarkPlayed={() => updateStatus(post.id, 'played')}
                onDelete={() => deletePost(post.id)}
              />
            ))}
          </div>
        </div>
      )}

      <h2 style={{ marginBottom: '0.75rem', fontSize: '1rem', fontWeight: 600 }}>
        {hasLocation ? `Nearby Posts (${posts.length})` : 'Nearby Posts'}
      </h2>

      {!hasLocation ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ fontSize: '1.5rem' }}>📍</p>
          <p style={{ color: 'var(--text2)', marginTop: '0.5rem' }}>Set your location to see nearby posts</p>
          <button className="btn btn-primary" style={{ marginTop: '1.5rem' }} onClick={() => navigate('/settings')}>
            Set Location
          </button>
        </div>
      ) : loading ? (
        <div className="page-loading"><div className="spinner" /></div>
      ) : posts.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ fontSize: '1.5rem' }}>📭</p>
          <p style={{ color: 'var(--text2)', marginTop: '0.5rem' }}>No active posts in your area — be the first!</p>
        </div>
      ) : (
        <div className="posts-list">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              onMessage={() => navigate(`/messages/${post.user_id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PostCard({ post, isOwn, onMarkPlayed, onDelete, onMessage }) {
  const from = new Date(post.available_from);
  const until = new Date(post.available_until);
  const isNow = from <= new Date() && until >= new Date();

  return (
    <div className={`post-card card${isNow ? ' active-now' : ''}`}>
      <div className="post-header">
        <div className="post-user">
          <div className="small-avatar">{(post.username || post.poster_name || '?')[0].toUpperCase()}</div>
          <div>
            <span className="post-username">{post.username}</span>
            {post.poster_rating && (
              <span style={{ marginLeft: '0.5rem' }}>
                <SkillBadge rating={post.poster_rating} />
              </span>
            )}
          </div>
        </div>
        <div className="post-badges">
          {isNow && <span className="badge now-badge">Available Now</span>}
          <span className="badge format-badge">{post.format}</span>
          {post.distance_km !== undefined && (
            <span style={{ fontSize: '0.8rem', color: 'var(--text2)' }}>
              {parseFloat(post.distance_km).toFixed(1)} km
            </span>
          )}
        </div>
      </div>

      <div className="post-details">
        {post.location_name && <div className="post-location">📍 {post.location_name}</div>}
        <div className="post-time">
          🕐 {from.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} –{' '}
          {until.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          {from.toDateString() !== new Date().toDateString() && (
            <span> · {from.toLocaleDateString()}</span>
          )}
        </div>
        {(post.rating_min > 0 || post.rating_max < 9999) && (
          <div className="post-rating-range">
            ⭐ Rating: {post.rating_min} – {post.rating_max === 9999 ? '∞' : post.rating_max}
          </div>
        )}
        {post.time_control && <div>⏱ {post.time_control}</div>}
        {post.description && <p className="post-description">{post.description}</p>}
      </div>

      <div className="post-actions">
        {isOwn ? (
          <>
            <button className="btn btn-secondary btn-sm" onClick={onMarkPlayed}>✓ Mark as Played</button>
            <button className="btn btn-danger btn-sm" onClick={onDelete}>Delete</button>
          </>
        ) : (
          <button className="btn btn-primary btn-sm" onClick={onMessage}>✉ Message {post.username}</button>
        )}
      </div>
    </div>
  );
}
