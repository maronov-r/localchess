const express = require('express');
const { body } = require('express-validator');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { calculateGameRatings } = require('../services/elo');
const { createNotification } = require('../services/notifications');

const router = express.Router();

router.post('/', requireAuth, [
  body('opponent_id').isUUID(),
  body('result').isIn(['player1', 'player2', 'draw']),
  body('format').isIn(['casual', 'rapid', 'blitz', 'bullet', 'classical']),
], validate, async (req, res) => {
  const { opponent_id, result, format, time_control, notes, post_id, event_id } = req.body;

  if (opponent_id === req.userId) {
    return res.status(400).json({ error: 'Cannot report a game against yourself' });
  }

  const playersRes = await db.query(
    'SELECT id, username, rating, games_played FROM users WHERE id IN ($1, $2)',
    [req.userId, opponent_id]
  );

  if (playersRes.rows.length < 2) {
    return res.status(404).json({ error: 'Player not found' });
  }

  const reporter = playersRes.rows.find((p) => p.id === req.userId);
  const opponent = playersRes.rows.find((p) => p.id === opponent_id);

  const ratings = calculateGameRatings(reporter, opponent, result);

  const gameRes = await db.query(
    `INSERT INTO games (player1_id, player2_id, winner_id, result, format, time_control,
       post_id, event_id, player1_rating_before, player2_rating_before,
       player1_rating_change, player2_rating_change, notes, reported_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING *`,
    [
      req.userId, opponent_id,
      result === 'player1' ? req.userId : result === 'player2' ? opponent_id : null,
      result, format, time_control, post_id || null, event_id || null,
      reporter.rating, opponent.rating,
      ratings.player1RatingChange, ratings.player2RatingChange,
      notes, req.userId,
    ]
  );

  const game = gameRes.rows[0];

  // Notify opponent to confirm
  await createNotification(
    opponent_id,
    'game_result',
    'Game result reported',
    `${reporter.username} reported a ${format} game result. Please confirm.`,
    { game_id: game.id, reporter_id: req.userId }
  );

  res.status(201).json(game);
});

router.post('/:id/confirm', requireAuth, async (req, res) => {
  const gameRes = await db.query('SELECT * FROM games WHERE id = $1', [req.params.id]);
  if (!gameRes.rows.length) return res.status(404).json({ error: 'Game not found' });

  const game = gameRes.rows[0];
  if (game.player2_id !== req.userId) {
    return res.status(403).json({ error: 'Only the opponent can confirm' });
  }
  if (game.confirmed_at) {
    return res.status(409).json({ error: 'Already confirmed' });
  }

  const playersRes = await db.query(
    'SELECT id, rating, games_played, wins, losses, draws, is_provisional FROM users WHERE id IN ($1, $2)',
    [game.player1_id, game.player2_id]
  );
  const p1 = playersRes.rows.find((p) => p.id === game.player1_id);
  const p2 = playersRes.rows.find((p) => p.id === game.player2_id);

  const p1Wins = game.result === 'player1' ? 1 : 0;
  const p2Wins = game.result === 'player2' ? 1 : 0;
  const isDraw = game.result === 'draw' ? 1 : 0;

  const p1GamesNew = p1.games_played + 1;
  const p2GamesNew = p2.games_played + 1;

  await db.query(
    `UPDATE users SET
       rating = $1, games_played = $2, wins = wins + $3, losses = losses + $4,
       draws = draws + $5, is_provisional = $6
     WHERE id = $7`,
    [
      Math.max(100, p1.rating + game.player1_rating_change),
      p1GamesNew, p1Wins, p2Wins, isDraw,
      p1GamesNew < 30,
      p1.id,
    ]
  );
  await db.query(
    `UPDATE users SET
       rating = $1, games_played = $2, wins = wins + $3, losses = losses + $4,
       draws = draws + $5, is_provisional = $6
     WHERE id = $7`,
    [
      Math.max(100, p2.rating + game.player2_rating_change),
      p2GamesNew, p2Wins, p1Wins, isDraw,
      p2GamesNew < 30,
      p2.id,
    ]
  );

  await db.query(
    'UPDATE games SET confirmed_at = NOW() WHERE id = $1',
    [game.id]
  );

  const reporterName = (await db.query('SELECT username FROM users WHERE id = $1', [game.reported_by])).rows[0]?.username;
  await createNotification(
    game.player1_id,
    'game_confirmed',
    'Game result confirmed',
    `Your game result has been confirmed. Rating change: ${game.player1_rating_change > 0 ? '+' : ''}${game.player1_rating_change}`,
    { game_id: game.id }
  );

  res.json({ confirmed: true });
});

router.get('/history', requireAuth, async (req, res) => {
  const result = await db.query(
    `SELECT g.id, g.result, g.format, g.time_control, g.played_at, g.confirmed_at,
            g.player1_rating_before, g.player2_rating_before,
            g.player1_rating_change, g.player2_rating_change,
            u1.id AS player1_id, u1.username AS player1_name,
            u2.id AS player2_id, u2.username AS player2_name
     FROM games g
     JOIN users u1 ON u1.id = g.player1_id
     JOIN users u2 ON u2.id = g.player2_id
     WHERE (g.player1_id = $1 OR g.player2_id = $1)
     ORDER BY g.played_at DESC
     LIMIT 50`,
    [req.userId]
  );
  res.json(result.rows);
});

module.exports = router;
