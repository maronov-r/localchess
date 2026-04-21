const express = require('express');
const db = require('../db');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { nearbyWhere, distanceKm } = require('../services/geo');
const { ratingToSkillBadge } = require('../services/elo');

const router = express.Router();

router.get('/nearby', requireAuth, async (req, res) => {
  const viewer = await db.query(
    'SELECT location_lat, location_lng, search_radius_km FROM users WHERE id = $1',
    [req.userId]
  );
  if (!viewer.rows.length) return res.status(404).json({ error: 'User not found' });

  const { location_lat: lat, location_lng: lng, search_radius_km } = viewer.rows[0];
  if (!lat || !lng) return res.status(400).json({ error: 'Set your location first' });

  const radius = parseInt(req.query.radius) || search_radius_km || 25;
  const ratingMin = parseInt(req.query.rating_min) || 0;
  const ratingMax = parseInt(req.query.rating_max) || 9999;
  const format = req.query.format;

  const { sql: nearbySql, params: nearbyParams } = nearbyWhere(lat, lng, radius);

  let query = `
    SELECT u.id, u.username, u.rating, u.is_provisional, u.bio, u.avatar_url,
           u.location_lat, u.location_lng, u.location_name,
           u.games_played, u.wins, u.losses, u.draws,
           u.preferred_formats, u.availability,
           (
             6371 * 2 * ASIN(SQRT(
               POW(SIN(RADIANS(u.location_lat - $9) / 2), 2) +
               COS(RADIANS($10)) * COS(RADIANS(u.location_lat)) *
               POW(SIN(RADIANS(u.location_lng - $11) / 2), 2)
             ))
           ) AS distance_km
    FROM users u
    WHERE u.id != $12
      AND u.location_lat IS NOT NULL
      AND u.location_lng IS NOT NULL
      AND ${nearbySql}
      AND u.rating BETWEEN $13 AND $14
      AND u.id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = $15)
      AND u.id NOT IN (SELECT blocker_id FROM blocks WHERE blocked_id = $16)
  `;

  const allParams = [
    ...nearbyParams,
    lat, lat, lng,  // $9-$11 for distance subquery
    req.userId,      // $12
    ratingMin, ratingMax,  // $13-$14
    req.userId, req.userId, // $15-$16
  ];

  if (format) {
    query += ` AND $${allParams.length + 1} = ANY(u.preferred_formats)`;
    allParams.push(format);
  }

  query += ' ORDER BY distance_km ASC LIMIT 50';

  const result = await db.query(query, allParams);
  const users = result.rows.map((u) => ({
    ...u,
    distance_km: parseFloat(u.distance_km).toFixed(1),
    skill_badge: ratingToSkillBadge(u.rating),
  }));

  res.json(users);
});

router.get('/:id', optionalAuth, async (req, res) => {
  const result = await db.query(
    `SELECT u.id, u.username, u.rating, u.is_provisional, u.bio, u.avatar_url,
            u.location_name, u.games_played, u.wins, u.losses, u.draws,
            u.preferred_formats, u.availability, u.created_at
     FROM users u
     WHERE u.id = $1`,
    [req.params.id]
  );

  if (!result.rows.length) return res.status(404).json({ error: 'User not found' });

  const user = {
    ...result.rows[0],
    skill_badge: ratingToSkillBadge(result.rows[0].rating),
  };

  // Fetch recent games
  const games = await db.query(
    `SELECT g.id, g.result, g.format, g.played_at,
            g.player1_rating_change, g.player2_rating_change,
            u1.username AS player1_name, u2.username AS player2_name,
            u1.id AS player1_id, u2.id AS player2_id
     FROM games g
     JOIN users u1 ON u1.id = g.player1_id
     JOIN users u2 ON u2.id = g.player2_id
     WHERE (g.player1_id = $1 OR g.player2_id = $1) AND g.confirmed_at IS NOT NULL
     ORDER BY g.played_at DESC LIMIT 20`,
    [req.params.id]
  );

  res.json({ ...user, recent_games: games.rows });
});

module.exports = router;
