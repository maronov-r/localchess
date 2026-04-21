const express = require('express');
const { body } = require('express-validator');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { nearbyWhere } = require('../services/geo');
const { notifyNearbyUsers } = require('../services/notifications');

const router = express.Router();

const postValidation = [
  body('location_lat').isFloat({ min: -90, max: 90 }),
  body('location_lng').isFloat({ min: -180, max: 180 }),
  body('available_from').isISO8601(),
  body('available_until').isISO8601(),
  body('format').isIn(['casual', 'rapid', 'blitz', 'bullet', 'classical', 'tournament']),
  body('rating_min').optional().isInt({ min: 0, max: 4000 }),
  body('rating_max').optional().isInt({ min: 0, max: 4000 }),
];

router.post('/', requireAuth, postValidation, validate, async (req, res) => {
  const {
    location_lat, location_lng, location_name, rating_min = 0, rating_max = 9999,
    available_from, available_until, format = 'casual', time_control, description,
  } = req.body;

  // Expire any existing active posts for this user
  await db.query(
    "UPDATE posts SET status = 'expired' WHERE user_id = $1 AND status = 'active'",
    [req.userId]
  );

  const result = await db.query(
    `INSERT INTO posts (user_id, location_lat, location_lng, location_name,
       rating_min, rating_max, available_from, available_until,
       format, time_control, description)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [req.userId, location_lat, location_lng, location_name,
     rating_min, rating_max, available_from, available_until,
     format, time_control, description]
  );

  const post = result.rows[0];

  // Get poster's info for notifications
  const userRes = await db.query(
    'SELECT username, rating FROM users WHERE id = $1',
    [req.userId]
  );
  const poster = userRes.rows[0];

  // Notify nearby eligible users asynchronously
  notifyNearbyUsers(post, poster).catch(console.error);

  res.status(201).json(post);
});

router.get('/nearby', requireAuth, async (req, res) => {
  const viewerRes = await db.query(
    'SELECT location_lat, location_lng, rating, search_radius_km FROM users WHERE id = $1',
    [req.userId]
  );
  const viewer = viewerRes.rows[0];
  if (!viewer?.location_lat) return res.status(400).json({ error: 'Set your location first' });

  const radius = parseInt(req.query.radius) || viewer.search_radius_km || 25;
  const { sql: nearbySql, params: nearbyParams } = nearbyWhere(
    viewer.location_lat, viewer.location_lng, radius,
    'p.location_lat', 'p.location_lng'
  );

  const result = await db.query(
    `SELECT p.*, u.username, u.rating AS poster_rating, u.avatar_url,
            (
              6371 * 2 * ASIN(SQRT(
                POW(SIN(RADIANS(p.location_lat - $9) / 2), 2) +
                COS(RADIANS($10)) * COS(RADIANS(p.location_lat)) *
                POW(SIN(RADIANS(p.location_lng - $11) / 2), 2)
              ))
            ) AS distance_km
     FROM posts p
     JOIN users u ON u.id = p.user_id
     WHERE p.status = 'active'
       AND p.expires_at > NOW()
       AND p.user_id != $12
       AND p.rating_min <= $13
       AND p.rating_max >= $14
       AND ${nearbySql}
       AND p.user_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = $15)
     ORDER BY distance_km ASC, p.created_at DESC
     LIMIT 50`,
    [
      ...nearbyParams,
      viewer.location_lat, viewer.location_lat, viewer.location_lng,
      req.userId,
      viewer.rating, viewer.rating,
      req.userId,
    ]
  );

  res.json(result.rows);
});

router.get('/mine', requireAuth, async (req, res) => {
  const result = await db.query(
    `SELECT p.*, u.username FROM posts p
     JOIN users u ON u.id = p.user_id
     WHERE p.user_id = $1
     ORDER BY p.created_at DESC LIMIT 20`,
    [req.userId]
  );
  res.json(result.rows);
});

router.patch('/:id/status', requireAuth, async (req, res) => {
  const { status } = req.body;
  if (!['active', 'expired', 'played'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const result = await db.query(
    `UPDATE posts SET status = $1 WHERE id = $2 AND user_id = $3 RETURNING *`,
    [status, req.params.id, req.userId]
  );

  if (!result.rows.length) return res.status(404).json({ error: 'Post not found' });
  res.json(result.rows[0]);
});

router.delete('/:id', requireAuth, async (req, res) => {
  const result = await db.query(
    'DELETE FROM posts WHERE id = $1 AND user_id = $2 RETURNING id',
    [req.params.id, req.userId]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Post not found' });
  res.json({ deleted: true });
});

module.exports = router;
