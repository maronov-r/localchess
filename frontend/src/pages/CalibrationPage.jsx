import React, { useState, useEffect } from 'react';
import { Chessboard } from 'react-chessboard';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import './CalibrationPage.css';

const BOT_LEVELS = [
  { level: 1, label: 'Level 1', rating: '~600', desc: 'Just learning the rules' },
  { level: 2, label: 'Level 2', rating: '~800', desc: 'Casual beginner' },
  { level: 3, label: 'Level 3', rating: '~1000', desc: 'Club beginner' },
  { level: 4, label: 'Level 4', rating: '~1200', desc: 'Intermediate' },
  { level: 5, label: 'Level 5', rating: '~1400', desc: 'Advanced club player' },
  { level: 6, label: 'Level 6', rating: '~1600', desc: 'Strong club player' },
  { level: 7, label: 'Level 7', rating: '~1800', desc: 'Expert' },
  { level: 8, label: 'Level 8', rating: '~2000', desc: 'Master level' },
];

export default function CalibrationPage() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [selectedLevel, setSelectedLevel] = useState(4);
  const [loading, setLoading] = useState(true);
  const [finalizing, setFinalizing] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadStatus();
  }, []);

  async function loadStatus() {
    try {
      const data = await api.calibration.status();
      setStatus(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function startGame() {
    setMessage('');
    try {
      const session = await api.calibration.start(selectedLevel);
      setGameState({ ...session, status: 'playing' });
    } catch (e) {
      setMessage(e.message);
    }
  }

  async function onDrop(sourceSquare, targetSquare, piece) {
    if (!gameState || gameState.status !== 'playing') return false;

    const move = `${sourceSquare}${targetSquare}`;
    try {
      const res = await api.calibration.move(gameState.sessionId, move);
      setGameState((prev) => ({ ...prev, fen: res.fen }));

      if (res.gameOver) {
        const resultText = res.result === 'win' ? '🎉 You won!' : res.result === 'loss' ? 'Bot wins. Good effort!' : 'Draw!';
        setMessage(resultText);
        setGameState((prev) => ({ ...prev, status: 'done' }));
        loadStatus();
      }
      return true;
    } catch {
      return false;
    }
  }

  async function resign() {
    if (!gameState?.sessionId) return;
    await api.calibration.resign(gameState.sessionId);
    setGameState(null);
    setMessage('Resigned.');
    loadStatus();
  }

  async function finalize() {
    setFinalizing(true);
    try {
      const { rating } = await api.calibration.finalize();
      setMessage(`Rating set to ${rating}!`);
      await refreshUser();
      setTimeout(() => navigate('/'), 2000);
    } catch (e) {
      setMessage(e.message);
    } finally {
      setFinalizing(false);
    }
  }

  if (loading) return <div className="page-loading"><div className="spinner" /></div>;

  return (
    <div className="calibration-page">
      <div className="calibration-header">
        <h1>Rating Calibration</h1>
        <p>Play games against our bot to determine your chess rating</p>
      </div>

      {status && (
        <div className="calibration-progress card">
          <div className="progress-info">
            <span>{status.completed} / {status.recommended} games played</span>
            {status.estimatedRating && (
              <span className="estimated-rating">Estimated Rating: <strong>{status.estimatedRating}</strong></span>
            )}
          </div>
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${Math.min(100, (status.completed / status.recommended) * 100)}%` }}
            />
          </div>
          {status.completed >= 3 && !gameState && (
            <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ color: 'var(--text2)', fontSize: '0.88rem' }}>
                Ready to finalize. Play more games for better accuracy, or finalize now.
              </span>
              <button className="btn btn-primary" onClick={finalize} disabled={finalizing}>
                {finalizing ? <span className="spinner" /> : `Set Rating to ${status.estimatedRating}`}
              </button>
            </div>
          )}
        </div>
      )}

      {message && (
        <div className="calibration-message">
          {message}
          {gameState?.status === 'done' && (
            <button className="btn btn-primary btn-sm" onClick={() => { setGameState(null); setMessage(''); }}>
              Play Another
            </button>
          )}
        </div>
      )}

      {!gameState && (
        <div className="calibration-setup card">
          <h2>Choose Bot Difficulty</h2>
          <p style={{ color: 'var(--text2)', fontSize: '0.88rem', marginBottom: '1rem' }}>
            Pick a level that feels challenging but beatable for you. The system adapts based on your results.
          </p>
          <div className="level-grid">
            {BOT_LEVELS.map(({ level, label, rating, desc }) => (
              <button
                key={level}
                type="button"
                className={`level-btn${selectedLevel === level ? ' selected' : ''}`}
                onClick={() => setSelectedLevel(level)}
              >
                <span className="level-label">{label}</span>
                <span className="level-rating">{rating}</span>
                <span className="level-desc">{desc}</span>
              </button>
            ))}
          </div>
          <button className="btn btn-primary btn-lg" onClick={startGame} style={{ marginTop: '1.25rem', width: '100%', justifyContent: 'center' }}>
            Start Game (You play White)
          </button>
        </div>
      )}

      {gameState && (
        <div className="calibration-game">
          <div className="board-wrapper">
            <Chessboard
              position={gameState.fen}
              onPieceDrop={onDrop}
              boardWidth={Math.min(480, window.innerWidth - 60)}
              customBoardStyle={{ borderRadius: 8, boxShadow: 'var(--shadow)' }}
              customDarkSquareStyle={{ backgroundColor: '#4a7c59' }}
              customLightSquareStyle={{ backgroundColor: '#f0d9b5' }}
            />
          </div>
          <div className="game-controls card">
            <div className="game-info">
              <div>
                <strong>Bot Level {gameState.botLevel}</strong>
                <p style={{ color: 'var(--text2)', fontSize: '0.85rem' }}>
                  {BOT_LEVELS.find((l) => l.level === gameState.botLevel)?.rating}
                </p>
              </div>
              <div>
                <strong>You play White</strong>
                <p style={{ color: 'var(--text2)', fontSize: '0.85rem' }}>Make your move on the board</p>
              </div>
            </div>
            {gameState.status === 'playing' && (
              <button className="btn btn-danger" onClick={resign}>
                Resign
              </button>
            )}
          </div>
        </div>
      )}

      <div className="calibration-tip card">
        <h3>Tips for accurate calibration</h3>
        <ul>
          <li>Play honestly — don't use external tools</li>
          <li>Try 2-3 different difficulty levels to bracket your skill</li>
          <li>Play at least 3 games for a reliable estimate</li>
          <li>Your rating can be recalibrated anytime from Settings</li>
        </ul>
      </div>
    </div>
  );
}
