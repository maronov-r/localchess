import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import SkillBadge from '../components/players/SkillBadge';
import './GamesPage.css';

const FORMATS = ['casual', 'rapid', 'blitz', 'bullet', 'classical'];

export default function GamesPage() {
  const { user } = useAuth();
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showReport, setShowReport] = useState(false);
  const [form, setForm] = useState({
    opponent_id: '',
    result: 'player1',
    format: 'casual',
    time_control: '',
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => { loadGames(); }, []);

  async function loadGames() {
    setLoading(true);
    try {
      const data = await api.games.history();
      setGames(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function reportGame(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSubmitting(true);
    try {
      await api.games.report(form);
      setSuccess('Game reported! Waiting for opponent confirmation.');
      setShowReport(false);
      loadGames();
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmGame(id) {
    try {
      await api.games.confirm(id);
      loadGames();
    } catch (e) {
      setError(e.message);
    }
  }

  const confirmed = games.filter((g) => g.confirmed_at);
  const pending = games.filter((g) => !g.confirmed_at);

  const totalGames = confirmed.length;
  const wins = confirmed.filter((g) =>
    (g.result === 'player1' && g.player1_id === user?.id) ||
    (g.result === 'player2' && g.player2_id === user?.id)
  ).length;
  const losses = confirmed.filter((g) =>
    (g.result === 'player1' && g.player2_id === user?.id) ||
    (g.result === 'player2' && g.player1_id === user?.id)
  ).length;
  const draws = confirmed.filter((g) => g.result === 'draw').length;

  return (
    <div className="games-page">
      <div className="page-header">
        <h1>Game History</h1>
        <button className="btn btn-primary" onClick={() => setShowReport((s) => !s)}>
          {showReport ? '✕ Cancel' : '+ Report Game'}
        </button>
      </div>

      {success && <div className="error-msg" style={{ background: 'rgba(34,197,94,0.1)', borderColor: 'rgba(34,197,94,0.2)', color: 'var(--green)', marginBottom: '1rem' }}>{success}</div>}

      {showReport && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1rem' }}>Report Game Result</h2>
          {error && <div className="error-msg" style={{ marginBottom: '1rem' }}>{error}</div>}
          <form onSubmit={reportGame} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="form-group">
              <label>Opponent's User ID</label>
              <input
                type="text"
                value={form.opponent_id}
                onChange={(e) => setForm({ ...form, opponent_id: e.target.value })}
                placeholder="Opponent's UUID"
                required
              />
              <small style={{ color: 'var(--text2)' }}>Find the opponent's ID on their profile page</small>
            </div>
            <div className="form-group">
              <label>Result</label>
              <select value={form.result} onChange={(e) => setForm({ ...form, result: e.target.value })}>
                <option value="player1">I Won</option>
                <option value="player2">Opponent Won</option>
                <option value="draw">Draw</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Format</label>
                <select value={form.format} onChange={(e) => setForm({ ...form, format: e.target.value })}>
                  {FORMATS.map((f) => <option key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Time Control</label>
                <input
                  type="text"
                  value={form.time_control}
                  onChange={(e) => setForm({ ...form, time_control: e.target.value })}
                  placeholder="10+5"
                />
              </div>
            </div>
            <div className="form-group">
              <label>Notes (optional)</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Any notes about the game..."
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? <span className="spinner" /> : 'Report Game'}
            </button>
          </form>
        </div>
      )}

      <div className="stats-row" style={{ marginBottom: '1.5rem' }}>
        {[
          { label: 'Confirmed Games', value: totalGames },
          { label: 'Wins', value: wins, color: 'var(--green)' },
          { label: 'Losses', value: losses, color: 'var(--red)' },
          { label: 'Draws', value: draws, color: 'var(--yellow)' },
          { label: 'Win Rate', value: totalGames > 0 ? `${Math.round((wins / totalGames) * 100)}%` : '—' },
          { label: 'Current Rating', value: user?.rating },
        ].map(({ label, value, color }) => (
          <div key={label} className="stat-card card">
            <div className="stat-value" style={{ color: color || 'var(--text)' }}>{value}</div>
            <div className="stat-label">{label}</div>
          </div>
        ))}
      </div>

      {pending.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>
            Pending Confirmation ({pending.length})
          </h2>
          <div className="games-list">
            {pending.map((g) => (
              <GameRow
                key={g.id}
                game={g}
                userId={user?.id}
                onConfirm={g.player2_id === user?.id ? () => confirmGame(g.id) : null}
                pending
              />
            ))}
          </div>
        </div>
      )}

      <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>
        Game History ({confirmed.length})
      </h2>

      {loading ? (
        <div className="page-loading"><div className="spinner" /></div>
      ) : confirmed.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ fontSize: '1.5rem' }}>♟</p>
          <p style={{ color: 'var(--text2)', marginTop: '0.5rem' }}>No games yet. Play some games and report results!</p>
        </div>
      ) : (
        <div className="games-list">
          {confirmed.map((g) => <GameRow key={g.id} game={g} userId={user?.id} />)}
        </div>
      )}
    </div>
  );
}

function GameRow({ game, userId, onConfirm, pending }) {
  const isPlayer1 = game.player1_id === userId;
  const opponentName = isPlayer1 ? game.player2_name : game.player1_name;
  const myRatingBefore = isPlayer1 ? game.player1_rating_before : game.player2_rating_before;
  const myChange = isPlayer1 ? game.player1_rating_change : game.player2_rating_change;

  let outcome = 'draw';
  if (game.result === 'player1') outcome = isPlayer1 ? 'win' : 'loss';
  if (game.result === 'player2') outcome = isPlayer1 ? 'loss' : 'win';

  const colors = { win: 'var(--green)', loss: 'var(--red)', draw: 'var(--yellow)' };

  return (
    <div className="game-row card" style={{ borderLeft: `3px solid ${colors[outcome]}` }}>
      <div className="game-outcome" style={{ color: colors[outcome] }}>
        {outcome.charAt(0).toUpperCase() + outcome.slice(1)}
      </div>
      <div className="game-info">
        <span>vs <strong>{opponentName}</strong></span>
        <span className="game-format">{game.format}</span>
        {game.time_control && <span>· {game.time_control}</span>}
      </div>
      <div className="game-rating">
        {!pending && myRatingBefore && (
          <>
            <span style={{ color: 'var(--text2)', fontSize: '0.8rem' }}>{myRatingBefore}</span>
            <span style={{ color: myChange >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
              {myChange >= 0 ? '+' : ''}{myChange}
            </span>
          </>
        )}
      </div>
      <div className="game-date">
        {new Date(game.played_at).toLocaleDateString()}
      </div>
      {pending && onConfirm && (
        <button className="btn btn-primary btn-sm" onClick={onConfirm}>
          Confirm Result
        </button>
      )}
      {pending && !onConfirm && (
        <span style={{ fontSize: '0.8rem', color: 'var(--text2)' }}>Waiting for confirmation</span>
      )}
    </div>
  );
}
