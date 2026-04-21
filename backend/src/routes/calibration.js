const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { getBotMove, applyMove, getGameResult } = require('../services/chess-bot');
const { estimateRatingFromCalibration } = require('../services/elo');

const router = express.Router();

// In-memory game sessions (production would use Redis)
const activeSessions = new Map();

router.post('/start', requireAuth, async (req, res) => {
  const { botLevel = 4 } = req.body;
  if (botLevel < 1 || botLevel > 8) {
    return res.status(400).json({ error: 'Bot level must be 1-8' });
  }

  const sessionId = `${req.userId}-${Date.now()}`;
  activeSessions.set(sessionId, {
    userId: req.userId,
    botLevel,
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    playerColor: 'white',
    moves: [],
    startedAt: Date.now(),
  });

  res.json({
    sessionId,
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    playerColor: 'white',
    botLevel,
  });
});

router.post('/move', requireAuth, async (req, res) => {
  const { sessionId, move } = req.body;
  const session = activeSessions.get(sessionId);

  if (!session || session.userId !== req.userId) {
    return res.status(404).json({ error: 'Session not found' });
  }

  // Apply player move
  const afterPlayer = applyMove(session.fen, move);
  if (!afterPlayer) return res.status(400).json({ error: 'Invalid move' });

  session.fen = afterPlayer.fen;
  session.moves.push(move);

  if (afterPlayer.isGameOver) {
    const winner = getGameResult(session.fen);
    const result = winner === 'white' ? 'win' : winner === 'black' ? 'loss' : 'draw';
    await saveCalibrationGame(session, result, afterPlayer.pgn);
    activeSessions.delete(sessionId);
    return res.json({ fen: afterPlayer.fen, gameOver: true, result, winner });
  }

  // Bot response
  const botMove = getBotMove(session.fen, session.botLevel);
  if (!botMove) {
    return res.json({ fen: afterPlayer.fen, gameOver: false });
  }

  const afterBot = applyMove(session.fen, botMove);
  if (!afterBot) return res.json({ fen: afterPlayer.fen, gameOver: false });

  session.fen = afterBot.fen;
  session.moves.push(botMove);

  if (afterBot.isGameOver) {
    const winner = getGameResult(session.fen);
    const result = winner === 'black' ? 'loss' : winner === 'white' ? 'win' : 'draw';
    await saveCalibrationGame(session, result, afterBot.pgn);
    activeSessions.delete(sessionId);
    return res.json({ fen: afterBot.fen, botMove, gameOver: true, result, winner });
  }

  res.json({ fen: afterBot.fen, botMove, gameOver: false, isCheck: afterBot.isCheck });
});

router.post('/resign', requireAuth, async (req, res) => {
  const { sessionId } = req.body;
  const session = activeSessions.get(sessionId);
  if (!session || session.userId !== req.userId) {
    return res.status(404).json({ error: 'Session not found' });
  }

  await saveCalibrationGame(session, 'loss', null);
  activeSessions.delete(sessionId);
  res.json({ resigned: true });
});

router.get('/status', requireAuth, async (req, res) => {
  const gamesRes = await db.query(
    'SELECT * FROM calibration_games WHERE user_id = $1 ORDER BY played_at ASC',
    [req.userId]
  );
  const games = gamesRes.rows;
  const completed = games.length;
  const recommended = 5;

  let estimatedRating = null;
  if (completed >= 3) {
    const results = games.map((g) => ({ botLevel: g.bot_level, result: g.result }));
    estimatedRating = estimateRatingFromCalibration(results);
  }

  res.json({ completed, recommended, estimatedRating, games });
});

router.post('/finalize', requireAuth, async (req, res) => {
  const gamesRes = await db.query(
    'SELECT bot_level, result FROM calibration_games WHERE user_id = $1',
    [req.userId]
  );

  if (gamesRes.rows.length < 3) {
    return res.status(400).json({ error: 'Complete at least 3 calibration games first' });
  }

  const results = gamesRes.rows.map((g) => ({ botLevel: g.bot_level, result: g.result }));
  const rating = estimateRatingFromCalibration(results);

  await db.query(
    'UPDATE users SET rating = $1, is_provisional = true WHERE id = $2',
    [rating, req.userId]
  );

  res.json({ rating });
});

async function saveCalibrationGame(session, result, pgn) {
  await db.query(
    'INSERT INTO calibration_games (user_id, bot_level, result, pgn) VALUES ($1, $2, $3, $4)',
    [session.userId, session.botLevel, result, pgn]
  );
}

// Clean up stale sessions every 30 minutes
setInterval(() => {
  const stale = Date.now() - 30 * 60 * 1000;
  for (const [id, session] of activeSessions) {
    if (session.startedAt < stale) activeSessions.delete(id);
  }
}, 30 * 60 * 1000);

module.exports = router;
